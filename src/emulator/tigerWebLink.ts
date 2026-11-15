import { SM8521CPU } from './sm8521';
import { HighScoreRecord, NvramHighScoreManager } from './nvramHighScores';
import { OnlineLeaderboardManager } from './onlineLeaderboard';

export type WebLinkStatus =
  | 'idle'
  | 'linking'
  | 'transferring'
  | 'completed'
  | 'error';

export interface WebLinkSyncResult {
  ok: boolean;
  slotsRead: number;
  validRecords: HighScoreRecord[];
  importedCount: number;
  checksumOk: boolean;
  message: string;
}

type ProtocolPhase =
  | 'idle'
  | 'wait_init'
  | 'wait_getall_header'
  | 'wait_getall_payload'
  | 'wait_setone_ack'
  | 'wait_done';

const CMD_INIT = [0x01, 0xfe] as const;
const REPLY_INIT = [0x02, 0xfd] as const;
const CMD_DONE = [0x03, 0xfc] as const;
const REPLY_DONE = [0x04, 0xfb] as const;
const CMD_GETALL = [0x05, 0xfa] as const;
const REPLY_GETALL = [0x06, 0xf9] as const;
const CMD_SETONE = [0x09, 0xf6] as const;
const ACK_SETONE = [0x0c, 0xf3] as const;
const NAK_SETONE = [0x0a, 0xf5] as const;
const NAK_BADSUM = [0x0f, 0xf0] as const;

const PHASE_TIMEOUT_FRAMES = 240; // ~4 seconds at 60fps

/**
 * Virtual Tiger Web Link (`gclink`) 9600-baud serial host.
 * Speaks the Tiger Web Link cartridge protocol over the SM8521 UART ($002B-$002F)
 * and bridges extracted 64-byte NVRAM high score slots with Cub's High Score Vault
 * and Online Leaderboard.
 */
export class TigerWebLinkManager {
  private cpu: SM8521CPU;
  private highScores: NvramHighScoreManager;
  private onlineLeaderboard: OnlineLeaderboardManager;
  private onStateChange?: () => void;

  public status: WebLinkStatus = 'idle';
  public statusMessage: string = 'Ready';
  public lastResult: WebLinkSyncResult | null = null;
  public bytesRx: number = 0;
  public bytesTx: number = 0;

  private phase: ProtocolPhase = 'idle';
  private rxBuffer: number[] = [];
  private phaseFrames: number = 0;
  private pendingPushSlot: Uint8Array | null = null;
  private pendingResolve?: (result: WebLinkSyncResult) => void;

  constructor(
    cpu: SM8521CPU,
    highScores: NvramHighScoreManager,
    onlineLeaderboard: OnlineLeaderboardManager,
    onStateChange?: () => void
  ) {
    this.cpu = cpu;
    this.highScores = highScores;
    this.onlineLeaderboard = onlineLeaderboard;
    this.onStateChange = onStateChange;
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChange = cb;
  }

  public static isWebLinkCartridge(title: string): boolean {
    const upper = (title || '').trim().toUpperCase();
    return upper.includes('PCCONNECT') || upper.includes('WEB LINK') || upper.includes('WEBLINK');
  }

  public isTransferActive(): boolean {
    return this.phase !== 'idle';
  }

  public isCartridgeInLinkingMode(): boolean {
    // Tiger Web Link enables UART RX/TX (URTC bits 2..4 = 0x1C) and serial interrupt (IE0 bit 7 = 0x80)
    const urtc = this.cpu.m_p_ram[0x2e];
    return (urtc & 0x1c) === 0x1c;
  }

  private notify() {
    this.onStateChange?.();
  }

  private sendBytes(bytes: readonly number[] | Uint8Array) {
    for (let i = 0; i < bytes.length; i++) {
      this.cpu.enqueueUartRxByte(bytes[i] & 0xff);
      this.bytesTx++;
    }
  }

  /**
   * Initiates a full `gclink` pull session:
   *   cmdinit -> cmdgetall (10 x 64-byte NVRAM slots + checksum) -> cmddone
   * Imports any valid decoded high score slots into Cub's High Score Vault & Online Leaderboard.
   */
  public pullHighScores(): Promise<WebLinkSyncResult> {
    if (this.phase !== 'idle') {
      return Promise.resolve({
        ok: false,
        slotsRead: 0,
        validRecords: [],
        importedCount: 0,
        checksumOk: false,
        message: 'A Tiger Web Link transfer is already in progress.'
      });
    }

    this.pendingPushSlot = null;
    this.bytesRx = 0;
    this.bytesTx = 0;
    this.rxBuffer = [];
    this.phase = 'wait_init';
    this.phaseFrames = 0;
    this.status = 'linking';
    this.statusMessage = 'Handshaking with Tiger Web Link (cmdinit)...';
    this.notify();

    this.sendBytes(CMD_INIT);

    return new Promise<WebLinkSyncResult>((resolve) => {
      this.pendingResolve = resolve;
    });
  }

  /**
   * Sends a single 64-byte NVRAM slot to Tiger Web Link via `cmdsetone` (`0x09 0xF6`).
   */
  public pushSlot(slot64: Uint8Array): Promise<WebLinkSyncResult> {
    if (this.phase !== 'idle') {
      return Promise.resolve({
        ok: false,
        slotsRead: 0,
        validRecords: [],
        importedCount: 0,
        checksumOk: false,
        message: 'A Tiger Web Link transfer is already in progress.'
      });
    }
    if (slot64.length !== 64) {
      return Promise.resolve({
        ok: false,
        slotsRead: 0,
        validRecords: [],
        importedCount: 0,
        checksumOk: false,
        message: 'Invalid slot length (expected 64 bytes).'
      });
    }

    this.pendingPushSlot = new Uint8Array(slot64);
    this.bytesRx = 0;
    this.bytesTx = 0;
    this.rxBuffer = [];
    this.phase = 'wait_init';
    this.phaseFrames = 0;
    this.status = 'linking';
    this.statusMessage = 'Handshaking with Tiger Web Link (cmdinit)...';
    this.notify();

    this.sendBytes(CMD_INIT);

    return new Promise<WebLinkSyncResult>((resolve) => {
      this.pendingResolve = resolve;
    });
  }

  public cancel() {
    if (this.phase === 'idle') return;
    this.finish({
      ok: false,
      slotsRead: 0,
      validRecords: [],
      importedCount: 0,
      checksumOk: false,
      message: 'Transfer cancelled.'
    }, 'idle');
  }

  public onFrameTick() {
    if (this.phase === 'idle') return;
    this.phaseFrames++;
    if (this.phaseFrames > PHASE_TIMEOUT_FRAMES) {
      this.finish({
        ok: false,
        slotsRead: 0,
        validRecords: [],
        importedCount: 0,
        checksumOk: false,
        message:
          'Timed out waiting for Tiger Web Link. Ensure the cartridge is booted and showing LINKING (press A on the Web Link screen).'
      }, 'error');
    }
  }

  public handleCpuUartTx(byte: number) {
    if (this.phase === 'idle') return;
    this.bytesRx++;
    this.rxBuffer.push(byte & 0xff);

    switch (this.phase) {
      case 'wait_init': {
        if (this.rxBuffer.length >= 2) {
          const b0 = this.rxBuffer[this.rxBuffer.length - 2];
          const b1 = this.rxBuffer[this.rxBuffer.length - 1];
          if (b0 === REPLY_INIT[0] && b1 === REPLY_INIT[1]) {
            this.rxBuffer = [];
            this.phaseFrames = 0;
            this.status = 'transferring';

            if (this.pendingPushSlot) {
              this.phase = 'wait_setone_ack';
              this.statusMessage = 'Uploading 64-byte slot to Tiger Web Link...';
              const payload = new Uint8Array(67);
              payload[0] = CMD_SETONE[0];
              payload[1] = CMD_SETONE[1];
              let sum = 0;
              for (let i = 0; i < 64; i++) {
                payload[2 + i] = this.pendingPushSlot[i];
                sum = (sum + this.pendingPushSlot[i]) & 0xff;
              }
              payload[66] = (-sum) & 0xff;
              this.sendBytes(payload);
            } else {
              this.phase = 'wait_getall_header';
              this.statusMessage = 'Pulling 10 NVRAM high score slots (641 bytes)...';
              this.sendBytes(CMD_GETALL);
            }
            this.notify();
          }
        }
        break;
      }

      case 'wait_getall_header': {
        if (this.rxBuffer.length >= 2) {
          if (this.rxBuffer[0] === REPLY_GETALL[0] && this.rxBuffer[1] === REPLY_GETALL[1]) {
            this.rxBuffer = [];
            this.phase = 'wait_getall_payload';
            this.phaseFrames = 0;
          } else {
            // Keep sliding window in case of stray leading byte
            this.rxBuffer.shift();
          }
        }
        break;
      }

      case 'wait_getall_payload': {
        if (this.rxBuffer.length >= 641) {
          const payload = this.rxBuffer.slice(0, 641);
          this.rxBuffer = [];
          const sum = payload.reduce((acc, v) => (acc + v) & 0xff, 0);
          const checksumOk = sum === 0;

          const validRecords: HighScoreRecord[] = [];
          for (let s = 0; s < 10; s++) {
            const slot = new Uint8Array(payload.slice(s * 64, (s + 1) * 64));
            const rec = NvramHighScoreManager.decodeSlot64(slot);
            if (rec) {
              validRecords.push(rec);
            }
          }

          let importedCount = 0;
          if (checksumOk && validRecords.length > 0) {
            importedCount = this.mergeRecordsIntoVault(validRecords);
          }

          this.phase = 'wait_done';
          this.phaseFrames = 0;
          this.statusMessage = 'Closing Web Link session (cmddone)...';
          this.lastResult = {
            ok: checksumOk,
            slotsRead: 10,
            validRecords,
            importedCount,
            checksumOk,
            message: checksumOk
              ? `Synced ${validRecords.length} high score(s) from Tiger Web Link (${importedCount} new/updated).`
              : `Checksum mismatch (sum=0x${sum.toString(16)}) while reading Tiger Web Link slots.`
          };
          this.sendBytes(CMD_DONE);
          this.notify();
        }
        break;
      }

      case 'wait_setone_ack': {
        if (this.rxBuffer.length >= 2) {
          const b0 = this.rxBuffer[0];
          const b1 = this.rxBuffer[1];
          this.rxBuffer = [];
          const ackOk = b0 === ACK_SETONE[0] && b1 === ACK_SETONE[1];
          let msg = 'Slot accepted by Tiger Web Link.';
          if (b0 === NAK_SETONE[0] && b1 === NAK_SETONE[1]) {
            msg = 'Tiger Web Link rejected the slot (NAK).';
          } else if (b0 === NAK_BADSUM[0] && b1 === NAK_BADSUM[1]) {
            msg = 'Tiger Web Link reported a checksum error (BADSUM).';
          } else if (!ackOk) {
            msg = `Unexpected Tiger Web Link reply: 0x${b0.toString(16)} 0x${b1.toString(16)}`;
          }

          this.lastResult = {
            ok: ackOk,
            slotsRead: 1,
            validRecords: [],
            importedCount: ackOk ? 1 : 0,
            checksumOk: !(b0 === NAK_BADSUM[0] && b1 === NAK_BADSUM[1]),
            message: msg
          };
          this.phase = 'wait_done';
          this.phaseFrames = 0;
          this.sendBytes(CMD_DONE);
          this.notify();
        }
        break;
      }

      case 'wait_done': {
        if (this.rxBuffer.length >= 2) {
          const b0 = this.rxBuffer[this.rxBuffer.length - 2];
          const b1 = this.rxBuffer[this.rxBuffer.length - 1];
          if (b0 === REPLY_DONE[0] && b1 === REPLY_DONE[1]) {
            const result = this.lastResult ?? {
              ok: true,
              slotsRead: 0,
              validRecords: [],
              importedCount: 0,
              checksumOk: true,
              message: 'Tiger Web Link session complete.'
            };
            this.finish(result, result.ok ? 'completed' : 'error');
          }
        }
        break;
      }
    }
  }

  private mergeRecordsIntoVault(records: HighScoreRecord[]): number {
    let imported = 0;
    for (const rec of records) {
      const existingIdx = this.highScores.records.findIndex(
        (r) => r.gameId === rec.gameId && r.title.toUpperCase() === rec.title.toUpperCase()
      );
      if (existingIdx < 0) {
        this.highScores.records.push(rec);
        imported++;
      } else if (rec.numericScore > this.highScores.records[existingIdx].numericScore) {
        this.highScores.records[existingIdx] = rec;
        imported++;
      }
    }

    if (imported > 0) {
      this.highScores.saveVault();
      this.highScores.syncAllProfileScoresToLeaderboard();
      void this.onlineLeaderboard.syncWithServer();
    }
    return imported;
  }

  private finish(result: WebLinkSyncResult, finalStatus: WebLinkStatus) {
    this.phase = 'idle';
    this.phaseFrames = 0;
    this.rxBuffer = [];
    this.pendingPushSlot = null;
    this.status = finalStatus;
    this.statusMessage = result.message;
    this.lastResult = result;
    this.notify();

    const resolve = this.pendingResolve;
    this.pendingResolve = undefined;
    resolve?.(result);
  }
}
