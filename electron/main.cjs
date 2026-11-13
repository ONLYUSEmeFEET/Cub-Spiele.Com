/**
 * Cub Spiele.Com — Sharp SM8521 Hardware Emulator (Cross-Platform Electron Main Process)
 * Supports Windows 10/11 (x64 & ARM64), macOS 11+ (Universal Apple Silicon & Intel),
 * and Linux (x86_64 & ARM64 / SteamOS), with native OS file dialogs, .bin/.tgc file associations,
 * hardware-accelerated WebAudio/Canvas2D, and persistent OS userData NVRAM storage.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const os = require('os');

// Enable low-latency WebAudio & GPU rasterization for cycle-accurate 59.73 Hz STN LCD rendering
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

function getPlatformIconPath() {
  const assetsDir = path.join(__dirname, '../public/assets');
  if (process.platform === 'darwin') {
    const icns = path.join(assetsDir, 'icon.icns');
    if (fs.existsSync(icns)) return icns;
  }
  if (process.platform === 'linux') {
    const png = path.join(assetsDir, 'icon-512.png');
    if (fs.existsSync(png)) return png;
  }
  return path.join(assetsDir, 'icon.ico');
}

let mainWindow = null;
let secondWindow = null;
let lanServerPort = 3197;
let pendingStartupRomPath = null;

// Check if a .bin or .tgc file was passed via Windows Explorer file association
function extractRomArg(argv) {
  for (const arg of argv.slice(1)) {
    if (arg && !arg.startsWith('-') && /\.(bin|tgc|zip)$/i.test(arg)) {
      if (fs.existsSync(arg)) {
        return path.resolve(arg);
      }
    }
  }
  return null;
}

pendingStartupRomPath = extractRomArg(process.argv);

function getNvramBackupPath() {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'gamecom_nvram_8kb.sav');
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: '&File',
      submenu: [
        {
          label: 'Load Cartridge ROM into Slot 1...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await promptAndLoadRom(1);
          }
        },
        {
          label: 'Load Cartridge ROM into Slot 2...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            await promptAndLoadRom(2);
          }
        },
        { type: 'separator' },
        {
          label: 'Export Battery-Backed NVRAM (.sav)...',
          click: () => {
            mainWindow?.webContents.send('desktop:menu-action', 'export-nvram');
          }
        },
        {
          label: 'Import Battery-Backed NVRAM (.sav)...',
          click: () => {
            mainWindow?.webContents.send('desktop:menu-action', 'import-nvram');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          role: 'quit'
        }
      ]
    },
    {
      label: '&Emulation',
      submenu: [
        {
          label: 'Boot Cartridge Slot 1',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'boot-slot-1')
        },
        {
          label: 'Boot Cartridge Slot 2',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'boot-slot-2')
        },
        { type: 'separator' },
        {
          label: 'Save Hardware State (Slot 0)',
          accelerator: 'F5',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'save-state')
        },
        {
          label: 'Load Hardware State (Slot 0)',
          accelerator: 'F8',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'load-state')
        },
        { type: 'separator' },
        {
          label: 'Reset to BIOS Main Menu',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'reset-menu')
        },
        {
          label: 'Cold Power Cycle (3D Globe & DAC Boot Chime)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'cold-boot')
        }
      ]
    },
    {
      label: '&Tools',
      submenu: [
        {
          label: 'SM8521 Hardware Debugger',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'open-debugger')
        },
        {
          label: 'Expanded NVRAM High Score Vault',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'open-vault')
        },
        {
          label: 'SM8521 Chip Accuracy Audit',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'open-accuracy')
        },
        {
          label: 'GitHub Releases & Windows Build Manager',
          click: () => mainWindow?.webContents.send('desktop:menu-action', 'open-releases')
        }
      ]
    },
    {
      label: '&View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function promptAndLoadRom(slot = 1) {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: `Select Tiger Game.Com Cartridge ROM (Slot ${slot})`,
    filters: [
      { name: 'Tiger Game.Com ROMs (.bin, .tgc, .zip)', extensions: ['bin', 'tgc', 'zip'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const payload = {
      name: path.basename(filePath),
      slot,
      bytes: Array.from(data)
    };
    mainWindow.webContents.send('desktop:rom-loaded', payload);
    return payload;
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 680,
    minHeight: 580,
    title: `Cub Spiele.Com — SM8521 Standalone Emulator (${process.platform} ${process.arch})`,
    backgroundColor: '#111319',
    icon: getPlatformIconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  createApplicationMenu();

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingStartupRomPath && fs.existsSync(pendingStartupRomPath)) {
      const data = fs.readFileSync(pendingStartupRomPath);
      mainWindow.webContents.send('desktop:rom-loaded', {
        name: path.basename(pendingStartupRomPath),
        slot: 1,
        bytes: Array.from(data)
      });
      pendingStartupRomPath = null;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('instance=2')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 820,
          height: 700,
          title: 'Cub Spiele.Com — Player 2 (Compete.Com Link)',
          backgroundColor: '#111319',
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
            backgroundThrottling: false
          }
        }
      };
    }
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

function createSecondInstanceWindow(roomCode = 'TIGER-1') {
  if (secondWindow && !secondWindow.isDestroyed()) {
    secondWindow.focus();
    return true;
  }

  secondWindow = new BrowserWindow({
    width: 820,
    height: 700,
    minWidth: 640,
    minHeight: 540,
    title: 'Cub Spiele.Com — Player 2 (Compete.Com Link)',
    backgroundColor: '#111319',
    icon: getPlatformIconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const sep = devServerUrl.includes('?') ? '&' : '?';
    secondWindow.loadURL(`${devServerUrl}${sep}instance=2&autolink=1&room=${encodeURIComponent(roomCode)}`);
  } else {
    secondWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { instance: '2', autolink: '1', room: roomCode }
    });
  }

  secondWindow.on('closed', () => {
    secondWindow = null;
  });

  return true;
}

function startLanRelayServer() {
  const clients = new Set();

  function encodeWsText(text) {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    if (len < 126) return Buffer.concat([Buffer.from([0x81, len]), payload]);
    if (len < 65536) {
      const h = Buffer.alloc(4);
      h[0] = 0x81;
      h[1] = 126;
      h.writeUInt16BE(len, 2);
      return Buffer.concat([h, payload]);
    }
    const h = Buffer.alloc(10);
    h[0] = 0x81;
    h[1] = 127;
    h.writeBigUInt64BE(BigInt(len), 2);
    return Buffer.concat([h, payload]);
  }

  function decodeWs(buf) {
    const messages = [];
    let offset = 0;
    let closed = false;
    while (offset + 2 <= buf.length) {
      const b0 = buf[offset];
      const b1 = buf[offset + 1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let hLen = 2;
      if (len === 126) {
        if (offset + 4 > buf.length) break;
        len = buf.readUInt16BE(offset + 2);
        hLen = 4;
      } else if (len === 127) {
        if (offset + 10 > buf.length) break;
        len = Number(buf.readBigUInt64BE(offset + 2));
        hLen = 10;
      }
      const mLen = masked ? 4 : 0;
      if (offset + hLen + mLen + len > buf.length) break;
      const start = offset + hLen + mLen;
      const raw = Buffer.from(buf.subarray(start, start + len));
      if (masked) {
        const mask = buf.subarray(offset + hLen, offset + hLen + 4);
        for (let i = 0; i < raw.length; i++) raw[i] ^= mask[i & 3];
      }
      offset = start + len;
      if (opcode === 0x08) {
        closed = true;
        break;
      }
      if (opcode === 0x01) messages.push(raw.toString('utf8'));
    }
    return { messages, consumed: offset, closed };
  }

  const lbDbPath = path.join(app.getPath('userData'), 'leaderboards-db.json');
  function loadLbDb() {
    try {
      if (fs.existsSync(lbDbPath)) {
        const parsed = JSON.parse(fs.readFileSync(lbDbPath, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }
  function saveLbDb(entries) {
    try {
      fs.writeFileSync(lbDbPath, JSON.stringify(entries.slice(0, 1000), null, 2), 'utf8');
    } catch {}
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if ((req.url || '').startsWith('/api/leaderboards')) {
      if (req.method === 'GET') {
        const entries = loadLbDb();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            service: 'Cub Spiele.Com Online Leaderboard Relay',
            count: entries.length,
            entries
          })
        );
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsedBody = JSON.parse(body);
            const entry = parsedBody?.entry || parsedBody;
            const proof = entry?.verification || entry?.proof;
            const sigHex = proof?.signature || proof?.signatureHex;
            const numScore =
              typeof entry?.numericScore === 'number' ? entry.numericScore : entry?.score;
            if (
              entry &&
              typeof numScore === 'number' &&
              numScore > 0 &&
              proof &&
              typeof sigHex === 'string' &&
              sigHex.length === 32 &&
              !proof.saveStateUsed &&
              !proof.slowdownUsed &&
              !proof.debuggerUsed
            ) {
              const entries = loadLbDb();
              const existingIdx = entries.findIndex(
                (e) =>
                  e.id === entry.id ||
                  (e.verification?.signature ||
                    e.verification?.signatureHex ||
                    e.proof?.signature) === sigHex ||
                  (e.gameId === entry.gameId &&
                    String(e.playerName || '').toLowerCase() ===
                      String(entry.playerName || '').toLowerCase() &&
                    (e.numericScore ?? e.score) === numScore)
              );
              if (existingIdx >= 0) {
                if (numScore >= (entries[existingIdx].numericScore ?? entries[existingIdx].score)) {
                  entries[existingIdx] = entry;
                }
              } else {
                entries.push(entry);
              }
              entries.sort(
                (a, b) => (b.numericScore ?? b.score) - (a.numericScore ?? a.score)
              );
              saveLbDb(entries);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, count: entries.length, entries }));
              return;
            }
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid or unverified score proof' }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
          }
        });
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'Cub Spiele.Com Compete.Com LAN Relay', activeClients: clients.size }));
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const room = (parsedUrl.searchParams.get('room') || 'TIGER-1').toUpperCase();
    const client = { socket, room };
    clients.add(client);

    let recvBuf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      recvBuf = Buffer.concat([recvBuf, chunk]);
      const { messages, consumed, closed } = decodeWs(recvBuf);
      if (consumed > 0) recvBuf = recvBuf.subarray(consumed);
      for (const msg of messages) {
        const frame = encodeWsText(msg);
        for (const peer of clients) {
          if (peer !== client && peer.room === client.room && !peer.socket.destroyed) {
            peer.socket.write(frame);
          }
        }
      }
      if (closed) {
        clients.delete(client);
        socket.end();
      }
    });
    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
  });

  server.on('error', () => {
    // Port 3197 may already be bound by Instance 1 on the same PC
  });
  server.listen(lanServerPort, '0.0.0.0');
}

function getLocalLanAddresses() {
  const result = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        result.push(`ws://${net.address}:${lanServerPort}/compete-link`);
      }
    }
  }
  return result;
}

// IPC Handlers for Native Windows integration
ipcMain.handle('desktop:get-info', () => ({
  isDesktopApp: true,
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,
  nodeVersion: process.versions.node,
  appVersion: app.getVersion(),
  nvramPath: getNvramBackupPath()
}));

ipcMain.handle('desktop:open-rom-dialog', async (_event, slot = 1) => {
  return await promptAndLoadRom(slot);
});

ipcMain.handle('desktop:save-nvram-native', async (_event, bytesArray) => {
  try {
    const targetPath = getNvramBackupPath();
    fs.writeFileSync(targetPath, Buffer.from(bytesArray));
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('desktop:load-nvram-native', async () => {
  try {
    const targetPath = getNvramBackupPath();
    if (!fs.existsSync(targetPath)) return { ok: false, notFound: true };
    const buf = fs.readFileSync(targetPath);
    return { ok: true, bytes: Array.from(buf), path: targetPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('desktop:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('desktop:open-second-instance', (_event, roomCode = 'TIGER-1') => {
  return createSecondInstanceWindow(roomCode);
});

ipcMain.handle('desktop:get-lan-ips', () => {
  return getLocalLanAddresses();
});

ipcMain.on('desktop:link-packet', (event, packet) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents.id !== event.sender.id) {
      win.webContents.send('desktop:link-packet', packet);
    }
  }
});

// Handle macOS Finder file associations (open-file event)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath && fs.existsSync(filePath) && /\.(bin|tgc|zip)$/i.test(filePath)) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const data = fs.readFileSync(filePath);
      mainWindow.webContents.send('desktop:rom-loaded', {
        name: path.basename(filePath),
        slot: 1,
        bytes: Array.from(data)
      });
    } else {
      pendingStartupRomPath = filePath;
    }
  }
});

app.whenReady().then(() => {
  startLanRelayServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
