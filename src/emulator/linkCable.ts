/**
 * Cub Spiele.Com — Official Tiger `compete.com` Link Cable Emulation Engine
 *
 * Emulates the 1997 Tiger Game.Com `compete.com` (Part #71-721) console-to-console serial link cable:
 * 1. Hardware Port 3 (`P3` `$0017`) Crossover Handshake Lines:
 *    - Console A Output Bits 0..1 (`P3.0`, `P3.1`) ---> Console B Input Bits 2..3 (`P3.2`, `P3.3`)
 *    - Console B Output Bits 0..1 (`P3.0`, `P3.1`) ---> Console A Input Bits 2..3 (`P3.2`, `P3.3`)
 * 2. Sharp SM8521 Full-Duplex Hardware UART (`URTT` `$002B` <-> `URTR` `$002C`, `URTS` `$002D`, `URTC` `$002E`):
 *    - Supports 19,200 / 9,600 baud 8N1 BIOS queued transfers (`Send_a_byte` `$3F`, `Receive_a_byte` `$40`)
 *      and custom game UART ISRs (`init_new_uart` in Fighters Megamix, Mortal Kombat Trilogy, Duke Nukem 3D, etc.).
 * 3. Transports:
 *    - Same-PC Dual Instance (`BroadcastChannel` + `localStorage` fallback + Electron IPC)
 *    - Local Network (LAN) Multiplayer (`WebSocket` Room Relay built into Vite dev server & Electron desktop)
 *    - Hardware Loopback Self-Test Mode
 */

import { SM8521CPU } from './sm8521';

export type LinkCableMode = 'off' | 'same-pc' | 'lan' | 'loopback';
export type LinkConnectionStatus = 'disconnected' | 'waiting' | 'connected';

export interface LinkLogEntry {
  id: number;
  timestamp: number;
  dir: 'TX' | 'RX' | 'P3' | 'SYS';
  summary: string;
}

export interface CompeteCompatibilityTitle {
  title: string;
  gameId: string;
  mode: string;
  notes: string;
}

export const COMPETE_COMPATIBLE_GAMES: CompeteCompatibilityTitle[] = [
  {
    title: 'Fighters Megamix',
    gameId: '$0710',
    mode: '2-Player Vs. Fighting (Real-Time)',
    notes: '19,200 8N1 UART + P3.0/P3.1 <-> P3.2/P3.3 hardware crossover + 68-byte frame sync'
  },
  {
    title: 'Mortal Kombat Trilogy',
    gameId: '$1F55',
    mode: '2-Player Kombat Link (Real-Time)',
    notes: 'Master/Slave P3 crossover handshake + $3A/$A3/$E3/$EF/$D1 packet sync'
  },
  {
    title: 'Williams Arcade Classics',
    gameId: '$1200',
    mode: '2-Player Co-Op / Vs. Arcade Link',
    notes: 'Joust, Robotron: 2084, Defender II, Sinistar & Bubbles compete.com link play'
  },
  {
    title: 'Jeopardy!',
    gameId: '$1500',
    mode: 'Multi-Console Game Show Link',
    notes: 'Synchronizes buzzer lockouts, clues, and player bankrolls via compete.com cable'
  },
  {
    title: 'Monopoly',
    gameId: '$1A00',
    mode: 'Multi-Console Board Game Link',
    notes: 'Synchronizes board state, dice rolls, trades, and property auctions'
  },
  {
    title: 'Scrabble',
    gameId: '$1800',
    mode: '2-Player Crossword Link',
    notes: 'Head-to-Head rack, board tile placement, and word score synchronization'
  },
  {
    title: 'Compete.Com Link Test (Built-In)',
    gameId: '$C0DE',
    mode: 'Hardware Diagnostic & 2P Input Suite',
    notes: 'Tests P3 crossover lines, UART ping-pong, 68-byte burst checksums & live 2P input'
  }
];

interface LinkPacket {
  seq: number;
  senderUid: string;
  instanceId: 1 | 2;
  room: string;
  type: 'hello' | 'ack' | 'bye' | 'p3' | 'uart-burst';
  p3Bits?: number;
  bytes?: number[];
  timestamp: number;
}

const BROADCAST_CHANNEL_NAME = 'cub_spiele_compete_link_v1';
const STORAGE_FALLBACK_KEY = 'cub_spiele_compete_packet_v1';

export class CompeteComLinkManager {
  private cpu: SM8521CPU;
  public readonly uid: string;
  public instanceId: 1 | 2 = 1;
  public mode: LinkCableMode = 'off';
  public status: LinkConnectionStatus = 'disconnected';
  public roomCode: string = 'TIGER-1';
  public lanUrl: string = '';
  public errorMessage: string | null = null;

  public get instanceNumber(): 1 | 2 {
    return this.instanceId;
  }

  // Live Hardware Telemetry
  public peerUid: string | null = null;
  public peerInstanceId: 1 | 2 | null = null;
  public txBytes: number = 0;
  public rxBytes: number = 0;
  public p3Handshakes: number = 0;
  public lastTxByte: number | null = null;
  public lastRxByte: number | null = null;
  public lastPacketTime: number = 0;
  public recentLog: LinkLogEntry[] = [];
  private logSeq: number = 1;

  // Transports
  private broadcastChannel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private pendingTxBytes: number[] = [];
  private txFlushScheduled: boolean = false;
  private txSeq: number = 1;
  private lastRxSeqByPeer: Map<string, number> = new Map();
  private onStateChange?: () => void;
  private storageListener?: (e: StorageEvent) => void;
  private ipcUnsubscribe?: () => void;

  constructor(cpu: SM8521CPU, onStateChange?: () => void) {
    this.cpu = cpu;
    this.onStateChange = onStateChange;
    this.uid = `gcom_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;

    // Detect instance number from URL query string (?instance=2)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('instance') === '2') {
        this.instanceId = 2;
      }
      const roomParam = params.get('room');
      if (roomParam) {
        this.roomCode = roomParam.toUpperCase();
      }
      this.lanUrl = this.getDefaultLanUrl();
    }

    // Wire CPU hardware callbacks
    this.cpu.onUartTxByte = (byte: number) => {
      this.handleCpuUartTx(byte);
    };
    this.cpu.onLinkPort3Change = (lowBits: number) => {
      this.handleCpuPort3Change(lowBits);
    };
    this.cpu.onLinkPoll = () => {
      this.flushPendingUartTx();
    };

    // Auto-start Same-PC link if launched with ?autolink=1 or ?instance=2
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autolink') === '1' || params.get('instance') === '2') {
        setTimeout(() => {
          this.connectSamePc(this.roomCode);
        }, 120);
      }
    }
  }

  public getDefaultLanUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3000/compete-link';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = window.location.port || '3000';
    if (window.location.protocol === 'file:') {
      return 'ws://localhost:3197/compete-link';
    }
    return `${proto}//${host}:${port}/compete-link`;
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChange = cb;
  }

  public subscribe(cb: () => void): () => void {
    const prev = this.onStateChange;
    this.onStateChange = () => {
      prev?.();
      cb();
    };
    return () => {
      this.onStateChange = prev;
    };
  }

  private pushLog(dir: 'TX' | 'RX' | 'P3' | 'SYS', summary: string) {
    this.recentLog = [
      {
        id: this.logSeq++,
        timestamp: Date.now(),
        dir,
        summary
      },
      ...this.recentLog.slice(0, 39)
    ];
  }

  /**
   * Connects in Same-Computer Dual-Instance Mode (BroadcastChannel + localStorage + Electron IPC).
   */
  public connectSamePc(room: string = this.roomCode) {
    this.disconnect(false);
    this.mode = 'same-pc';
    this.roomCode = (room || 'TIGER-1').trim().toUpperCase();
    this.status = 'waiting';
    this.cpu.linkConnected = true;

    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (ev) => {
        if (ev.data) {
          this.handleIncomingPacket(ev.data as LinkPacket);
        }
      };
    }

    if (typeof window !== 'undefined') {
      this.storageListener = (e: StorageEvent) => {
        if (e.key === STORAGE_FALLBACK_KEY && e.newValue) {
          try {
            const pkt = JSON.parse(e.newValue) as LinkPacket;
            this.handleIncomingPacket(pkt);
          } catch {
            // Ignore malformed storage packet
          }
        }
      };
      window.addEventListener('storage', this.storageListener);

      const desktop = (window as any).gamecomDesktop;
      if (desktop?.onLinkPacket) {
        this.ipcUnsubscribe = desktop.onLinkPacket((pkt: LinkPacket) => {
          this.handleIncomingPacket(pkt);
        });
      }
    }

    this.pushLog('SYS', `Same-PC Link ready on channel "${this.roomCode}" (Instance #${this.instanceId})`);
    this.sendHello();
    this.startHeartbeat();
    this.onStateChange?.();
  }

  /**
   * Connects to a Local Network (LAN) WebSocket Relay Server.
   */
  public connectLan(wsUrl: string, room: string = this.roomCode) {
    this.disconnect(false);
    this.mode = 'lan';
    this.lanUrl = wsUrl.trim() || this.getDefaultLanUrl();
    this.roomCode = (room || 'TIGER-1').trim().toUpperCase();
    this.status = 'waiting';
    this.cpu.linkConnected = true;

    try {
      const separator = this.lanUrl.includes('?') ? '&' : '?';
      const fullUrl = `${this.lanUrl}${separator}room=${encodeURIComponent(this.roomCode)}`;
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        this.pushLog('SYS', `Connected to LAN relay ${this.lanUrl} (Room ${this.roomCode})`);
        this.sendHello();
        this.startHeartbeat();
        this.onStateChange?.();
      };

      this.ws.onmessage = (ev) => {
        try {
          const text = typeof ev.data === 'string' ? ev.data : '';
          if (text) {
            const pkt = JSON.parse(text) as LinkPacket;
            this.handleIncomingPacket(pkt);
          }
        } catch {
          // Ignore malformed packet
        }
      };

      this.ws.onerror = () => {
        this.pushLog('SYS', `LAN WebSocket error on ${this.lanUrl}`);
        this.onStateChange?.();
      };

      this.ws.onclose = () => {
        if (this.mode === 'lan') {
          this.status = 'waiting';
          this.peerUid = null;
          this.pushLog('SYS', 'LAN WebSocket closed');
          this.onStateChange?.();
        }
      };
    } catch (err) {
      this.pushLog('SYS', `Failed to open WebSocket: ${(err as Error).message}`);
      this.status = 'disconnected';
    }

    this.onStateChange?.();
  }

  /**
   * Connects in Hardware Loopback Self-Test Mode (crosses local P3.0/1 -> P3.2/3 and URTT -> URTR).
   */
  public connectLoopback() {
    this.disconnect(false);
    this.mode = 'loopback';
    this.status = 'connected';
    this.peerUid = 'LOOPBACK_SELF';
    this.peerInstanceId = this.instanceId === 1 ? 2 : 1;
    this.cpu.linkConnected = true;
    this.cpu.setRemotePort3Bits(this.cpu.localPort3Bits);
    this.pushLog('SYS', 'Compete.Com Hardware Loopback Mode active (P3.0/1 -> P3.2/3, URTT -> URTR)');
    this.onStateChange?.();
  }

  /**
   * Disconnects the Compete.Com link cable and resets P3 input lines.
   */
  public disconnect(notifyUi: boolean = true) {
    if (this.mode !== 'off') {
      this.sendPacket({
        senderUid: this.uid,
        instanceId: this.instanceId,
        room: this.roomCode,
        seq: this.txSeq++,
        type: 'bye',
        timestamp: Date.now()
      });
    }

    if (this.heartbeatTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    if (this.storageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener);
      this.storageListener = undefined;
    }

    if (this.ipcUnsubscribe) {
      this.ipcUnsubscribe();
      this.ipcUnsubscribe = undefined;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.mode = 'off';
    this.status = 'disconnected';
    this.peerUid = null;
    this.peerInstanceId = null;
    this.pendingTxBytes = [];
    this.txFlushScheduled = false;
    this.lastRxSeqByPeer.clear();
    this.cpu.linkConnected = false;
    this.cpu.setRemotePort3Bits(0x00, false);

    if (notifyUi) {
      this.pushLog('SYS', 'Compete.Com Link Cable disconnected');
      this.onStateChange?.();
    }
  }

  /**
   * Launches a 2nd instance window on the same computer (Electron native window or Browser popup window)
   * pre-configured as Instance #2 (Player 2) and automatically linked to this console.
   */
  public async launchSecondInstanceWindow(): Promise<boolean> {
    if (this.mode === 'off') {
      this.connectSamePc(this.roomCode);
    }

    const desktop = typeof window !== 'undefined' ? (window as any).gamecomDesktop : null;
    if (desktop?.openSecondInstance) {
      await desktop.openSecondInstance(this.roomCode);
      this.pushLog('SYS', 'Launched Native Player 2 Window (Instance #2)');
      this.onStateChange?.();
      return true;
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('instance', '2');
      url.searchParams.set('autolink', '1');
      url.searchParams.set('room', this.roomCode);
      const win = window.open(
        url.toString(),
        'CubSpieleCom_Instance2',
        'width=760,height=660,left=780,top=60,resizable=yes'
      );
      if (win) {
        this.pushLog('SYS', 'Opened Player 2 Window (Instance #2) & linked via Same-PC Cable');
        this.onStateChange?.();
        return true;
      }
    }
    return false;
  }

  public resetCounters() {
    this.txBytes = 0;
    this.rxBytes = 0;
    this.p3Handshakes = 0;
    this.lastTxByte = null;
    this.lastRxByte = null;
    this.recentLog = [];
    this.onStateChange?.();
  }

  private startHeartbeat() {
    if (this.heartbeatTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);
    }
    if (typeof window !== 'undefined') {
      this.heartbeatTimer = window.setInterval(() => {
        if (this.mode === 'same-pc' || this.mode === 'lan') {
          this.sendHello();
        }
      }, 1500);
    }
  }

  private sendHello() {
    this.sendPacket({
      senderUid: this.uid,
      instanceId: this.instanceId,
      room: this.roomCode,
      seq: this.txSeq++,
      type: 'hello',
      p3Bits: this.cpu.localPort3Bits & 0x03,
      timestamp: Date.now()
    });
  }

  private handleCpuPort3Change(lowBits: number) {
    if (this.mode === 'off') return;

    this.p3Handshakes++;
    const cleanBits = lowBits & 0x03;

    if (this.mode === 'loopback') {
      this.cpu.setRemotePort3Bits(cleanBits, true);
      return;
    }

    // Flush any queued UART bytes before changing P3 handshake lines so ordering is strictly preserved
    this.flushPendingUartTx();

    this.sendPacket({
      senderUid: this.uid,
      instanceId: this.instanceId,
      room: this.roomCode,
      seq: this.txSeq++,
      type: 'p3',
      p3Bits: cleanBits,
      timestamp: Date.now()
    });

    if (this.p3Handshakes <= 20 || this.p3Handshakes % 25 === 0) {
      this.pushLog('P3', `P3 Out [1:0] -> ${cleanBits.toString(2).padStart(2, '0')}b`);
    }
  }

  private handleCpuUartTx(byte: number) {
    if (this.mode === 'off') return;

    const cleanByte = byte & 0xff;
    this.txBytes++;
    this.lastTxByte = cleanByte;

    if (this.mode === 'loopback') {
      this.rxBytes++;
      this.lastRxByte = cleanByte;
      this.cpu.enqueueUartRxByte(cleanByte);
      this.pushLog('TX', `Loopback $002B -> $002C: $${cleanByte.toString(16).padStart(2, '0').toUpperCase()}`);
      return;
    }

    this.pendingTxBytes.push(cleanByte);
    if (this.pendingTxBytes.length >= 68) {
      this.flushPendingUartTx();
    } else if (!this.txFlushScheduled) {
      this.txFlushScheduled = true;
      queueMicrotask(() => {
        this.flushPendingUartTx();
      });
    }
  }

  private flushPendingUartTx() {
    this.txFlushScheduled = false;
    if (this.pendingTxBytes.length === 0) return;

    const burst = this.pendingTxBytes.splice(0, this.pendingTxBytes.length);
    this.sendPacket({
      senderUid: this.uid,
      instanceId: this.instanceId,
      room: this.roomCode,
      seq: this.txSeq++,
      type: 'uart-burst',
      p3Bits: this.cpu.localPort3Bits & 0x03,
      bytes: burst,
      timestamp: Date.now()
    });

    const preview = burst
      .slice(0, 6)
      .map((b) => `$${b.toString(16).padStart(2, '0').toUpperCase()}`)
      .join(' ');
    this.pushLog(
      'TX',
      `Sent ${burst.length}B: ${preview}${burst.length > 6 ? ` ... (+${burst.length - 6}B)` : ''}`
    );
  }

  private sendPacket(pkt: LinkPacket) {
    if (this.mode === 'same-pc') {
      let sentViaChannel = false;
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage(pkt);
          sentViaChannel = true;
        } catch {
          // Ignore channel error
        }
      }
      if (typeof window !== 'undefined') {
        if (!sentViaChannel) {
          try {
            localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(pkt));
          } catch {
            // Ignore storage quota
          }
        }
        const desktop = (window as any).gamecomDesktop;
        if (desktop?.sendLinkPacket) {
          desktop.sendLinkPacket(pkt);
        }
      }
    } else if (this.mode === 'lan') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(pkt));
        } catch {
          // Ignore send error
        }
      }
    }
  }

  private handleIncomingPacket(pkt: LinkPacket) {
    if (!pkt || pkt.senderUid === this.uid) return;
    if (pkt.room && pkt.room.toUpperCase() !== this.roomCode) return;

    // Deduplicate packets delivered across redundant same-pc transports (BroadcastChannel + Electron IPC + localStorage)
    if (typeof pkt.seq === 'number') {
      const prevSeq = this.lastRxSeqByPeer.get(pkt.senderUid) ?? 0;
      if (pkt.seq <= prevSeq) {
        return;
      }
      this.lastRxSeqByPeer.set(pkt.senderUid, pkt.seq);
    }

    this.lastPacketTime = Date.now();
    const wasConnected = this.status === 'connected' && this.peerUid === pkt.senderUid;

    if (pkt.type === 'bye') {
      if (this.peerUid === pkt.senderUid) {
        this.status = 'waiting';
        this.peerUid = null;
        this.peerInstanceId = null;
        this.lastRxSeqByPeer.delete(pkt.senderUid);
        this.cpu.setRemotePort3Bits(0x00, false);
        this.pushLog('SYS', 'Peer console disconnected');
        this.onStateChange?.();
      }
      return;
    }

    this.peerUid = pkt.senderUid;
    // Auto-assign complementary instance number if both opened as Instance 1
    if (pkt.instanceId === this.instanceId) {
      if (this.uid > pkt.senderUid) {
        this.instanceId = 2;
      }
    }
    this.peerInstanceId = this.instanceId === 1 ? 2 : 1;
    this.status = 'connected';
    this.cpu.linkConnected = true;

    if (pkt.type === 'hello') {
      if (typeof pkt.p3Bits === 'number') {
        this.cpu.setRemotePort3Bits(pkt.p3Bits & 0x03, false);
      }
      this.sendPacket({
        senderUid: this.uid,
        instanceId: this.instanceId,
        room: this.roomCode,
        seq: this.txSeq++,
        type: 'ack',
        p3Bits: this.cpu.localPort3Bits & 0x03,
        timestamp: Date.now()
      });
      if (!wasConnected) {
        this.pushLog('SYS', `Linked with Peer Console (${pkt.senderUid.slice(0, 10)})`);
        this.onStateChange?.();
      }
      return;
    }

    if (pkt.type === 'ack') {
      if (typeof pkt.p3Bits === 'number') {
        this.cpu.setRemotePort3Bits(pkt.p3Bits & 0x03, false);
      }
      if (!wasConnected) {
        this.pushLog('SYS', `Handshake verified with Peer Console #${this.peerInstanceId}`);
        this.onStateChange?.();
      }
      return;
    }

    if (pkt.type === 'p3' && typeof pkt.p3Bits === 'number') {
      this.p3Handshakes++;
      this.cpu.setRemotePort3Bits(pkt.p3Bits & 0x03, true);
      return;
    }

    if (pkt.type === 'uart-burst' && Array.isArray(pkt.bytes)) {
      if (typeof pkt.p3Bits === 'number') {
        this.cpu.setRemotePort3Bits(pkt.p3Bits & 0x03, false);
      }
      for (const b of pkt.bytes) {
        const clean = b & 0xff;
        this.rxBytes++;
        this.lastRxByte = clean;
        this.cpu.enqueueUartRxByte(clean);
      }
      const preview = pkt.bytes
        .slice(0, 6)
        .map((b) => `$${(b & 0xff).toString(16).padStart(2, '0').toUpperCase()}`)
        .join(' ');
      this.pushLog(
        'RX',
        `Recv ${pkt.bytes.length}B: ${preview}${
          pkt.bytes.length > 6 ? ` ... (+${pkt.bytes.length - 6}B)` : ''
        }`
      );
    }
  }
}
