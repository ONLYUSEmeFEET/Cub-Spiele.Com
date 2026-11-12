/**
 * Tiger Game.Com SM8521 Hardware Emulator — Native Windows Desktop Shell (Electron Main Process)
 * Supports Windows 10/11 (x64 & ARM64), native OS file dialogs, .bin/.tgc file associations,
 * hardware-accelerated WebAudio/Canvas2D, and persistent %APPDATA% NVRAM storage.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable low-latency WebAudio & GPU rasterization for cycle-accurate 59.73 Hz STN LCD rendering
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-gpu-rasterization');

let mainWindow = null;
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
  const template = [
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
    title: 'Cub Spiele.Com — SM8521 Standalone Emulator (x64)',
    backgroundColor: '#111319',
    icon: path.join(__dirname, '../public/assets/icon.ico'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
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
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
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

app.whenReady().then(() => {
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
