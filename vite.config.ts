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
