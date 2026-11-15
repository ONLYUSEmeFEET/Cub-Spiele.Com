import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {Duplex} from 'stream';
import {defineConfig} from 'vite';

interface WsClient {
  socket: Duplex;
  room: string;
}

function encodeWsTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  if (len < 126) {
    const header = Buffer.from([0x81, len]);
    return Buffer.concat([header, payload]);
  }
  if (len < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(len), 2);
  return Buffer.concat([header, payload]);
}

function decodeWsFrames(buffer: Buffer): {messages: string[]; consumed: number; closed: boolean} {
  const messages: string[] = [];
  let offset = 0;
  let closed = false;

  while (offset + 2 <= buffer.length) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    const maskLen = masked ? 4 : 0;
    if (offset + headerLen + maskLen + payloadLen > buffer.length) break;

    const payloadStart = offset + headerLen + maskLen;
    const raw = Buffer.from(buffer.subarray(payloadStart, payloadStart + payloadLen));
    if (masked) {
      const mask = buffer.subarray(offset + headerLen, offset + headerLen + 4);
      for (let i = 0; i < raw.length; i++) {
        raw[i] ^= mask[i & 3];
      }
    }

    offset = payloadStart + payloadLen;
    if (opcode === 0x08) {
      closed = true;
      break;
    }
    if (opcode === 0x01) {
      messages.push(raw.toString('utf8'));
    }
  }

  return {messages, consumed: offset, closed};
}

function copyPublicFiltered(srcDir: string, destDir: string) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, {recursive: true});
  for (const entry of fs.readdirSync(srcDir, {withFileTypes: true})) {
    if (entry.name.toLowerCase() === 'desktop.ini') continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyPublicFiltered(srcPath, destPath);
    } else {
      fs.writeFileSync(destPath, fs.readFileSync(srcPath));
    }
  }
}

const rootDir = import.meta.dirname;

export default defineConfig(() => {
  return {
    base: './',
    cacheDir: path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CubSpieleCom-vite-cache'),
    build: {
      copyPublicDir: false,
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-public-no-desktop-ini',
        closeBundle() {
          copyPublicFiltered(path.resolve(rootDir, 'public'), path.resolve(rootDir, 'dist'));
        },
      },
      {
        name: 'compete-link-lan-relay',
        configureServer(server) {
          const lbDbPath = path.join(
            process.env.LOCALAPPDATA || os.tmpdir(),
            'CubSpieleCom-leaderboards-db.json'
          );
          const lbAdminPath = path.join(
            process.env.LOCALAPPDATA || os.tmpdir(),
            'CubSpieleCom-leaderboards-admin.json'
          );

          function hashAdminPassword(password: string): string {
            return crypto
              .createHash('sha256')
              .update(`CUB_SPIELE_ADMIN_V1:${String(password)}`)
              .digest('hex');
          }

          interface AdminConfigRecord {
            username: string;
            passwordHash: string;
            token: string;
            isDefaultPassword: boolean;
          }

          function loadOrInitAdminConfig(): AdminConfigRecord {
            const envPass = process.env.CUB_LB_ADMIN_PASSWORD || '';
            try {
              if (fs.existsSync(lbAdminPath)) {
                const parsed = JSON.parse(fs.readFileSync(lbAdminPath, 'utf8'));
                if (parsed && parsed.username && parsed.passwordHash && parsed.token) {
                  if (envPass) {
                    parsed.passwordHash = hashAdminPassword(envPass);
                    parsed.isDefaultPassword = false;
                  }
                  return parsed;
                }
              }
            } catch {
              // ignore and regenerate
            }
            const defaultPass = envPass || 'cubspiele-admin';
            const cfg: AdminConfigRecord = {
              username: 'admin',
              passwordHash: hashAdminPassword(defaultPass),
              token: crypto.randomBytes(24).toString('hex'),
              isDefaultPassword: !envPass
            };
            try {
              fs.writeFileSync(lbAdminPath, JSON.stringify(cfg, null, 2), 'utf8');
            } catch {
              // ignore
            }
            return cfg;
          }

          function saveAdminConfig(cfg: AdminConfigRecord) {
            try {
              fs.writeFileSync(lbAdminPath, JSON.stringify(cfg, null, 2), 'utf8');
            } catch {
              // ignore
            }
          }

          function extractAdminToken(req: any): string {
            const headerTok = req.headers?.['x-admin-token'];
            if (typeof headerTok === 'string' && headerTok.trim()) return headerTok.trim();
            const auth = req.headers?.authorization;
            if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
              return auth.slice(7).trim();
            }
            return '';
          }

          function loadLbDb(): any[] {
            try {
              if (fs.existsSync(lbDbPath)) {
                const parsed = JSON.parse(fs.readFileSync(lbDbPath, 'utf8'));
                if (Array.isArray(parsed)) return parsed;
              }
            } catch {
              // ignore
            }
            return [];
          }

          function saveLbDb(entries: any[]) {
            try {
              fs.writeFileSync(lbDbPath, JSON.stringify(entries.slice(0, 1000), null, 2), 'utf8');
            } catch {
              // ignore
            }
          }

          server.middlewares.use('/api/leaderboards', (req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.setHeader(
              'Access-Control-Allow-Headers',
              'Content-Type, Authorization, X-Admin-Token'
            );
            if (req.method === 'OPTIONS') {
              res.statusCode = 204;
              res.end();
              return;
            }
            const subUrl = (req.url || '/').split('?')[0];
            if (req.method === 'GET') {
              const entries = loadLbDb();
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  service: 'Cub Spiele.Com Online Leaderboard Relay',
                  count: entries.length,
                  entries,
                })
              );
              return;
            }
            if (req.method === 'POST' || req.method === 'DELETE') {
              let body = '';
              req.on('data', (chunk) => {
                body += chunk.toString();
              });
              req.on('end', () => {
                try {
                  const parsedBody = body.trim() ? JSON.parse(body) : {};
                  res.setHeader('Content-Type', 'application/json');

                  // Admin Login
                  if (subUrl === '/admin/login' && req.method === 'POST') {
                    const cfg = loadOrInitAdminConfig();
                    const u = String(parsedBody?.username || '').trim().toLowerCase();
                    const p = String(parsedBody?.password || '');
                    const validUser = u === cfg.username.toLowerCase();
                    const validPass =
                      p.length > 0 &&
                      (hashAdminPassword(p) === cfg.passwordHash || p === cfg.token);
                    if (!validUser || !validPass) {
                      res.statusCode = 401;
                      res.end(JSON.stringify({ ok: false, error: 'Invalid admin credentials' }));
                      return;
                    }
                    res.end(
                      JSON.stringify({
                        ok: true,
                        token: cfg.token,
                        username: cfg.username,
                        isDefaultPassword: cfg.isDefaultPassword
                      })
                    );
                    return;
                  }

                  // Change Admin Credentials
                  if (subUrl === '/admin/password' && req.method === 'POST') {
                    const cfg = loadOrInitAdminConfig();
                    const tok = extractAdminToken(req);
                    if (!tok || tok !== cfg.token) {
                      res.statusCode = 401;
                      res.end(JSON.stringify({ ok: false, error: 'Admin authentication required' }));
                      return;
                    }
                    const currentPassword = String(parsedBody?.currentPassword || '');
                    const newPassword = String(parsedBody?.newPassword || '');
                    const newUsername = String(parsedBody?.newUsername || cfg.username).trim();
                    if (
                      currentPassword &&
                      hashAdminPassword(currentPassword) !== cfg.passwordHash
                    ) {
                      res.statusCode = 403;
                      res.end(JSON.stringify({ ok: false, error: 'Current password is incorrect' }));
                      return;
                    }
                    if (!newPassword || newPassword.length < 4) {
                      res.statusCode = 400;
                      res.end(
                        JSON.stringify({
                          ok: false,
                          error: 'New password must be at least 4 characters'
                        })
                      );
                      return;
                    }
                    cfg.username = newUsername || cfg.username;
                    cfg.passwordHash = hashAdminPassword(newPassword);
                    cfg.token = crypto.randomBytes(24).toString('hex');
                    cfg.isDefaultPassword = false;
                    saveAdminConfig(cfg);
                    res.end(
                      JSON.stringify({
                        ok: true,
                        token: cfg.token,
                        username: cfg.username,
                        isDefaultPassword: false
                      })
                    );
                    return;
                  }

                  // Admin Delete Score(s)
                  if (
                    (subUrl === '/admin/delete' && req.method === 'POST') ||
                    req.method === 'DELETE'
                  ) {
                    const cfg = loadOrInitAdminConfig();
                    const tok = extractAdminToken(req);
                    if (!tok || tok !== cfg.token) {
                      res.statusCode = 401;
                      res.end(JSON.stringify({ ok: false, error: 'Admin authentication required' }));
                      return;
                    }
                    const entries = loadLbDb();
                    const targetId = parsedBody?.id;
                    const targetGameId = parsedBody?.gameId;
                    const targetPlayer = parsedBody?.playerName
                      ? String(parsedBody.playerName).toLowerCase()
                      : null;
                    const targetScore = parsedBody?.numericScore;
                    const targetSig = parsedBody?.signature;
                    const purgeZero = Boolean(parsedBody?.purgeZeroScores);

                    const nextEntries = entries.filter((e: any) => {
                      const eScore =
                        typeof e.numericScore === 'number' ? e.numericScore : Number(e.score || 0);
                      if (purgeZero && (!Number.isFinite(eScore) || eScore <= 0)) return false;
                      if (targetId && e.id === targetId) return false;
                      if (
                        targetSig &&
                        (e.verification?.signature || e.proof?.signature) === targetSig
                      ) {
                        return false;
                      }
                      if (
                        targetId &&
                        typeof targetGameId === 'number' &&
                        e.gameId === targetGameId &&
                        targetPlayer !== null &&
                        String(e.playerName || '').toLowerCase() === targetPlayer &&
                        typeof targetScore === 'number' &&
                        eScore === targetScore
                      ) {
                        return false;
                      }
                      if (!targetId && typeof targetGameId === 'number' && e.gameId === targetGameId) {
                        return false;
                      }
                      return true;
                    });
                    const removedCount = entries.length - nextEntries.length;
                    saveLbDb(nextEntries);
                    res.end(
                      JSON.stringify({
                        ok: true,
                        removedCount,
                        count: nextEntries.length,
                        entries: nextEntries
                      })
                    );
                    return;
                  }

                  // Admin Reset Leaderboard
                  if (subUrl === '/admin/reset' && req.method === 'POST') {
                    const cfg = loadOrInitAdminConfig();
                    const tok = extractAdminToken(req);
                    if (!tok || tok !== cfg.token) {
                      res.statusCode = 401;
                      res.end(JSON.stringify({ ok: false, error: 'Admin authentication required' }));
                      return;
                    }
                    const entries = loadLbDb();
                    const scope = String(parsedBody?.scope || 'all');
                    const scopeGameId = parsedBody?.gameId;
                    let nextEntries = entries;
                    if (scope === 'all') {
                      nextEntries = [];
                    } else if (scope === 'softcore') {
                      nextEntries = entries.filter((e: any) => Boolean(e.verification?.hardcoreVerified));
                    } else if (scope === 'hardcore') {
                      nextEntries = entries.filter((e: any) => !e.verification?.hardcoreVerified);
                    } else if (scope === 'zero') {
                      nextEntries = entries.filter((e: any) => {
                        const s =
                          typeof e.numericScore === 'number'
                            ? e.numericScore
                            : Number(e.score || 0);
                        return Number.isFinite(s) && s > 0;
                      });
                    } else if (scope === 'game' && typeof scopeGameId === 'number') {
                      nextEntries = entries.filter((e: any) => e.gameId !== scopeGameId);
                    }
                    const removedCount = entries.length - nextEntries.length;
                    saveLbDb(nextEntries);
                    res.end(
                      JSON.stringify({
                        ok: true,
                        removedCount,
                        count: nextEntries.length,
                        entries: nextEntries
                      })
                    );
                    return;
                  }

                  // Standard Score Submission
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
                      (e: any) =>
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
                      (a: any, b: any) => (b.numericScore ?? b.score) - (a.numericScore ?? a.score)
                    );
                    saveLbDb(entries);
                    res.end(JSON.stringify({ok: true, count: entries.length, entries}));
                    return;
                  }
                  res.statusCode = 400;
                  res.end(JSON.stringify({ok: false, error: 'Invalid or unverified score proof'}));
                } catch {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ok: false, error: 'Invalid JSON'}));
                }
              });
              return;
            }
            next();
          });

          const clients = new Set<WsClient>();
          server.httpServer?.on('upgrade', (req, socket) => {
            const reqUrl = req.url || '';
            if (!reqUrl.startsWith('/compete-link')) return;
            const key = req.headers['sec-websocket-key'];
            if (!key || typeof key !== 'string') {
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

            const parsedUrl = new URL(reqUrl, 'http://localhost');
            const room = (parsedUrl.searchParams.get('room') || 'TIGER-1').toUpperCase();
            const client: WsClient = {socket, room};
            clients.add(client);

            let recvBuf = Buffer.alloc(0);
            socket.on('data', (chunk: Buffer) => {
              recvBuf = Buffer.concat([recvBuf, chunk]);
              const {messages, consumed, closed} = decodeWsFrames(recvBuf);
              if (consumed > 0) {
                recvBuf = recvBuf.subarray(consumed);
              }
              for (const msg of messages) {
                const frame = encodeWsTextFrame(msg);
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
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
