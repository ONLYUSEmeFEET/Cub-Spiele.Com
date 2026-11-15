import { SM8521CPU } from './sm8521';
import { NvramHighScoreManager } from './nvramHighScores';
import { NvramPhoneBookManager } from './nvramPhoneBook';
import { OnlineLeaderboardManager } from './onlineLeaderboard';

export type ModemConnectionState = 'command' | 'connected';

export interface ModemLogEntry {
  id: number;
  dir: 'tx' | 'rx' | 'sys';
  text: string;
}

/**
 * Virtual Hayes AT Modem + Interactive 40-column Virtual BBS
 * for the Tiger Game.Com `Internet (USA)` cartridge over the SM8521 UART ($002B-$002F).
 */
export class VirtualModemManager {
  private cpu: SM8521CPU;
  private highScores: NvramHighScoreManager;
  private phoneBook: NvramPhoneBookManager;
  private onlineLeaderboard: OnlineLeaderboardManager;
  private onStateChange?: () => void;

  public enabled: boolean = true;
  public state: ModemConnectionState = 'command';
  public dialedNumber: string = '';
  public customWsUrl: string = '';
  public txBytes: number = 0;
  public rxBytes: number = 0;
  public log: ModemLogEntry[] = [];

  private logSeq: number = 1;
  private cmdBuffer: string = '';
  private bbsLineBuffer: string = '';
  private echoTestMode: boolean = false;
  private pendingRxQueue: number[] = [];
  private rxDelayFrames: number = 0;
  private ws: WebSocket | null = null;

  constructor(
    cpu: SM8521CPU,
    highScores: NvramHighScoreManager,
    phoneBook: NvramPhoneBookManager,
    onlineLeaderboard: OnlineLeaderboardManager,
    onStateChange?: () => void
  ) {
    this.cpu = cpu;
    this.highScores = highScores;
    this.phoneBook = phoneBook;
    this.onlineLeaderboard = onlineLeaderboard;
    this.onStateChange = onStateChange;
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChange = cb;
  }

  public static isInternetCartridge(title: string): boolean {
    const upper = (title || '').trim().toUpperCase();
    return upper.includes('INTERNET');
  }

  private notify() {
    this.onStateChange?.();
  }

  private addLog(dir: 'tx' | 'rx' | 'sys', text: string) {
    this.log.push({ id: this.logSeq++, dir, text });
    if (this.log.length > 60) {
      this.log.shift();
    }
    this.notify();
  }

  public queueRxString(text: string, initialDelayFrames: number = 2) {
    if (this.rxDelayFrames < initialDelayFrames && this.pendingRxQueue.length === 0) {
      this.rxDelayFrames = initialDelayFrames;
    }
    for (let i = 0; i < text.length; i++) {
      this.pendingRxQueue.push(text.charCodeAt(i) & 0xff);
    }
    if (text.trim()) {
      this.addLog('rx', text.replace(/\r/g, '').replace(/\n/g, ' | ').slice(0, 120));
    }
  }

  public onFrameTick() {
    if (!this.enabled) return;
    if (this.rxDelayFrames > 0) {
      this.rxDelayFrames--;
      return;
    }
    // Pace up to 2 bytes per frame (~120 bytes/sec @ 60fps, well within 9600 baud & SM8521 RX IRQ rate)
    const burst = Math.min(2, this.pendingRxQueue.length);
    for (let i = 0; i < burst; i++) {
      const b = this.pendingRxQueue.shift()!;
      this.cpu.enqueueUartRxByte(b);
      this.rxBytes++;
    }
  }

  public hangUp() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.state = 'command';
    this.echoTestMode = false;
    this.cmdBuffer = '';
    this.bbsLineBuffer = '';
    this.queueRxString('\r\nNO CARRIER\r\n', 2);
    this.addLog('sys', 'Hung up (NO CARRIER)');
  }

  public reset() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.state = 'command';
    this.echoTestMode = false;
    this.cmdBuffer = '';
    this.bbsLineBuffer = '';
    this.pendingRxQueue = [];
    this.rxDelayFrames = 0;
    this.dialedNumber = '';
    this.notify();
  }

  public handleCpuUartTx(byte: number) {
    if (!this.enabled) return;
    const b = byte & 0xff;
    this.txBytes++;

    if (this.state === 'command') {
      if (b === 0x0d || b === 0x0a) {
        const cmd = this.cmdBuffer.trim();
        this.cmdBuffer = '';
        if (cmd.length > 0) {
          this.processAtCommand(cmd);
        }
      } else if (b === 0x08 || b === 0x7f) {
        this.cmdBuffer = this.cmdBuffer.slice(0, -1);
      } else if (b >= 32 && b <= 126) {
        this.cmdBuffer += String.fromCharCode(b);
      }
      return;
    }

    // Data mode: detect Hayes +++ escape sequence
    if (b === 0x2b /* '+' */) {
      this.cmdBuffer += '+';
      if (this.cmdBuffer === '+++') {
        this.cmdBuffer = '';
        this.state = 'command';
        this.echoTestMode = false;
        this.addLog('tx', '+++');
        this.queueRxString('\r\nOK\r\n', 3);
        return;
      }
    } else {
      this.cmdBuffer = '';
    }

    // Forward to WebSocket bridge if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(String.fromCharCode(b));
      return;
    }

    // Otherwise handle in built-in Virtual BBS
    if (b === 0x0d || b === 0x0a) {
      const line = this.bbsLineBuffer.trim();
      this.bbsLineBuffer = '';
      this.addLog('tx', line || '<CR>');
      this.handleBbsLine(line);
    } else if (b === 0x08 || b === 0x7f) {
      this.bbsLineBuffer = this.bbsLineBuffer.slice(0, -1);
    } else if (b >= 32 && b <= 126) {
      this.bbsLineBuffer += String.fromCharCode(b);
      // Single-key menu selection when not in echo test mode
      if (!this.echoTestMode && this.bbsLineBuffer.length === 1 && /^[0-5?]$/.test(this.bbsLineBuffer)) {
        const key = this.bbsLineBuffer;
        this.bbsLineBuffer = '';
        this.addLog('tx', key);
        this.handleBbsLine(key);
      }
    }
  }

  private processAtCommand(rawCmd: string) {
    this.addLog('tx', rawCmd);
    const upper = rawCmd.toUpperCase();

    if (upper.startsWith('ATDT') || upper.startsWith('ATDP') || upper.startsWith('ATD')) {
      const num = rawCmd.replace(/^ATD[TP]?/i, '').trim() || 'DELPHI';
      this.dialedNumber = num;
      this.state = 'connected';
      this.echoTestMode = false;
      this.bbsLineBuffer = '';
      this.addLog('sys', `Dialing ${num} -> CONNECT 9600/ARQ`);
      this.queueRxString('\r\nCONNECT 9600/ARQ\r\n', 4);

      if (this.customWsUrl.trim()) {
        this.connectWebSocketBridge(this.customWsUrl.trim());
      } else {
        this.sendBbsBanner();
      }
      return;
    }

    if (upper === 'AT' || upper.startsWith('ATZ') || upper.startsWith('ATE') || upper.startsWith('ATV') || upper.startsWith('ATQ') || upper.startsWith('AT&')) {
      this.queueRxString('\r\nOK\r\n', 3);
      return;
    }

    if (upper.startsWith('ATH')) {
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // ignore
        }
        this.ws = null;
      }
      this.state = 'command';
      this.queueRxString('\r\nOK\r\n', 3);
      return;
    }

    if (upper.startsWith('ATI')) {
      this.queueRxString('\r\nCub Spiele.Com Virtual Hayes 9600\r\nOK\r\n', 3);
      return;
    }

    if (upper.startsWith('AT')) {
      this.queueRxString('\r\nOK\r\n', 3);
    } else {
      this.queueRxString('\r\nERROR\r\n', 3);
    }
  }

  private connectWebSocketBridge(url: string) {
    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.addLog('sys', `WebSocket bridge connected: ${url}`);
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          this.queueRxString(ev.data, 0);
        }
      };
      ws.onerror = () => {
        this.addLog('sys', 'WebSocket bridge error; falling back to Virtual BBS');
        this.ws = null;
        this.sendBbsBanner();
      };
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
          if (this.state === 'connected') {
            this.hangUp();
          }
        }
      };
    } catch {
      this.sendBbsBanner();
    }
  }

  private sendBbsBanner() {
    this.queueRxString(
      '\r\n' +
        '=== CUB SPIELE.COM BBS ===\r\n' +
        '1. High Score Vault\r\n' +
        '2. Online Leaderboard\r\n' +
        '3. Phone Book\r\n' +
        '4. System Info\r\n' +
        '5. Echo Test\r\n' +
        '0. Hang Up\r\n' +
        'SELECT> ',
      6
    );
  }

  private handleBbsLine(line: string) {
    if (this.echoTestMode) {
      if (line.toUpperCase() === 'QUIT' || line === '0') {
        this.echoTestMode = false;
        this.sendBbsBanner();
      } else {
        this.queueRxString(`\r\nECHO: ${line}\r\nECHO> `, 1);
      }
      return;
    }

    switch (line) {
      case '1': {
        const recs = this.highScores.records.slice(0, 6);
        let out = '\r\n-- HIGH SCORE VAULT --\r\n';
        if (recs.length === 0) {
          out += '(No scores saved yet)\r\n';
        } else {
          for (const r of recs) {
            out += `${r.title.slice(0, 16).padEnd(16)} ${r.scoreText}\r\n`;
          }
        }
        out += 'SELECT> ';
        this.queueRxString(out, 2);
        break;
      }
      case '2': {
        const top = this.onlineLeaderboard.getBestScorePerGameSummary(false).slice(0, 6);
        let out = '\r\n-- ONLINE LEADERBOARD --\r\n';
        if (top.length === 0) {
          out += '(No leaderboard entries)\r\n';
        } else {
          for (const e of top) {
            out += `${e.gameTitle.slice(0, 12).padEnd(12)} ${e.playerName.slice(0, 8)} ${e.scoreText}\r\n`;
          }
        }
        out += 'SELECT> ';
        this.queueRxString(out, 2);
        break;
      }
      case '3': {
        const contacts = this.phoneBook.banks.flat().slice(0, 6);
        let out = '\r\n-- PHONE BOOK --\r\n';
        if (contacts.length === 0) {
          out += '(Phone Book is empty)\r\n';
        } else {
          for (const c of contacts) {
            out += `${c.name.slice(0, 14).padEnd(14)} ${c.phone}\r\n`;
          }
        }
        out += 'SELECT> ';
        this.queueRxString(out, 2);
        break;
      }
      case '4': {
        const out =
          '\r\n-- SYSTEM INFO --\r\n' +
          'CPU: Sharp SM8521 4.9152MHz\r\n' +
          `Dialed: ${this.dialedNumber || 'N/A'}\r\n` +
          `TX: ${this.txBytes}B  RX: ${this.rxBytes}B\r\n` +
          'SELECT> ';
        this.queueRxString(out, 2);
        break;
      }
      case '5': {
        this.echoTestMode = true;
        this.queueRxString('\r\n-- ECHO TEST (type QUIT) --\r\nECHO> ', 2);
        break;
      }
      case '0': {
        this.hangUp();
        break;
      }
      default: {
        this.sendBbsBanner();
        break;
      }
    }
  }
}
