/**
 * Tiger Game.Com Cycle-Accurate NVRAM High Score & Unlimited Bank Subsystem
 *
 * Hardware Architecture ($E000-$FFFF 8KB Battery-Backed NVRAM):
 * - $E000-$E003: NVRAM Partition Header (F0 00 00 FF)
 * - $F3FC-$F3FF: NVRAM Initialized Signature (AA AA AA AA)
 * - $FC00-$FC23: BIOS System Configuration & Magic Word ($FC22-$FC23 = CD 70)
 * - $FC60-$FEDF: 10 Hardware High Score Slots (10 x 64 bytes = 640 bytes, $0040 per slot)
 *   - Offset +$00..+$01: 16-bit Big-Endian Game ID (matches cartridge header $601A)
 *   - Offset +$02:       Record flags / sub-index ($00)
 *   - Offset +$03..+N:   ASCII Game Title (up to 11 chars), followed by $01 separator,
 *                        followed by ASCII Score/Progress string, $00 terminator, and $FF padding.
 * - $FEE0-$FEE1: Built-in Solitaire 16-bit High Score (Big-Endian)
 *
 * How we exceed the original 10-entry BIOS limit without breaking cycle accuracy:
 * - The BIOS High Score table at $FC60-$FEDF is fixed at 10 slots x 64 bytes in hardware address space.
 * - We maintain an Unlimited High Score Vault in localStorage divided into 10-slot Virtual Banks
 *   (Bank 0: Entries #1-10, Bank 1: Entries #11-20, Bank 2: Entries #21-30, etc.).
 * - When a cartridge is inserted or when the user selects a High Score Bank, its 10 x 64-byte records
 *   are mapped directly into $FC60-$FEDF in cpu.nvram, and any CPU writes to $FC60-$FEE1 by the BIOS
 *   or cartridge games are synced back to the Unlimited Vault in real time.
 */

export interface HighScoreRecord {
  gameId: number;       // 16-bit Game ID (e.g. 0x0917 = Lights Out, 0x2201 = Sonic Jam)
  title: string;        // Up to 11 ASCII characters displayed by BIOS High Score screen
  scoreText: string;    // Score or level string displayed by BIOS High Score screen
  numericScore: number; // Parsed numeric value for sorting/comparison
  updatedAt: number;
  rawSlot?: number[];   // Full 64-byte hardware slot snapshot (preserves binary progress bytes after $00 terminator)
}

const NVRAM_RAW_STORAGE_KEY = 'gamecom_nvram_8k_v3';
const HIGH_SCORE_VAULT_KEY = 'gamecom_unlimited_highscores_v3';

// Do not pre-populate high scores: start empty so only real player / imported scores exist
export const DEFAULT_HIGH_SCORE_RECORDS: HighScoreRecord[] = [];

export class NvramHighScoreManager {
  public records: HighScoreRecord[] = [];
  public solitaireScore: number = 0;
  public activeBank: number = 0; // Each bank maps 10 entries into $FC60-$FEDF

  constructor() {
    this.loadVault();
  }

  /**
   * Sanitizes a 64-byte hardware NVRAM slot ($FC60 + slot * $40).
   * Specifically fixes the Lights Out (Game ID $0917) "1?5" starting level bug:
   * Lights Out stores "Lights Out\x01xxx\x00" at +$03..+$11 and 6 raw binary level
   * progress bytes (1..100 for each of the 6 game modes, loaded into $01BC..$01C2)
   * at slot offsets +$12..+$17 immediately after the $00 string terminator.
   * If +$12..+$17 contain 0xFF (255), Lights Out's BCD routine at $5655 computes
   * 255 = 100 + 15*10 + 5 -> '1', (0x30 + 15 = '?'), '5' = "1?5".
   */
  public static sanitizeSlot64(slot: Uint8Array): void {
    if (slot.length < 0x40) return;
    const gameId = (slot[0] << 8) | slot[1];
    if (gameId === 0x0917) {
      // Ensure exact "Lights Out" mixed-case 10-byte title at +$03..+$0C and $01 separator at +$0D
      const expectedTitle = 'Lights Out';
      for (let i = 0; i < expectedTitle.length; i++) {
        slot[0x03 + i] = expectedTitle.charCodeAt(i);
      }
      slot[0x0d] = 0x01;

      // Ensure 3-byte ASCII highest level string at +$0E..+$10 has no '?' (0x3F) or 0xFF
      let badAscii = false;
      for (let i = 0x0e; i <= 0x10; i++) {
        const b = slot[i];
        if (b === 0x3f || b < 0x20 || b > 0x39) {
          badAscii = true;
        }
      }
      if (badAscii) {
        slot[0x0e] = 0x20; // ' '
        slot[0x0f] = 0x20; // ' '
        slot[0x10] = 0x31; // '1'
      }
      slot[0x11] = 0x00;

      // Sanitize the 6 binary starting-level progress bytes at +$12..+$17 ($01BC..$01C2)
      // Valid levels in Lights Out are 1..50 (or 1..100 in 2000-puzzle mode).
      for (let i = 0x12; i <= 0x17; i++) {
        if (slot[i] === 0x00 || slot[i] > 100) {
          slot[i] = 0x01;
        }
      }
    }
  }

  /**
   * Formats the 8KB NVRAM ($E000-$FFFF) with the authentic Tiger Game.Com BIOS
   * initialization signatures so the BIOS recognizes battery-backed SRAM on cold boot
   * without wiping $FC60-$FEDF.
   */
  public initializeNvramSignatures(nvram: Uint8Array) {
    // Try restoring saved raw 8KB NVRAM first
    try {
      const savedB64 = localStorage.getItem(NVRAM_RAW_STORAGE_KEY);
      if (savedB64) {
        const bin = atob(savedB64);
        if (bin.length === 0x2000) {
          for (let i = 0; i < 0x2000; i++) {
            nvram[i] = bin.charCodeAt(i) & 0xff;
          }
        }
      }
    } catch {
      // Ignore storage errors
    }

    // Ensure BIOS NVRAM magic signatures are set ($E000, $F3FC, $FC00..$FC23, $FEE0..$FEE8)
    nvram[0xe000 - 0xe000] = 0xf0;
    nvram[0xe001 - 0xe000] = 0x00;
    nvram[0xe002 - 0xe000] = 0x00;
    nvram[0xe003 - 0xe000] = 0xff;

    nvram[0xf3fc - 0xe000] = 0xaa;
    nvram[0xf3fd - 0xe000] = 0xaa;
    nvram[0xf3fe - 0xe000] = 0xaa;
    nvram[0xf3ff - 0xe000] = 0xaa;

    const fc00Init = [
      0x00, 0x00, 0x00, 0x02, 0xc3, 0xff, 0x40, 0xff,
      0x03, 0x00, 0x02, 0x00, 0x20, 0x02, 0xaa, 0xbf,
      0xff, 0x35, 0xc0, 0x00, 0x00, 0x0c, 0x00, 0x15,
      0x55, 0x55, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xcd, 0x70
    ];
    for (let i = 0; i < fc00Init.length; i++) {
      nvram[0xfc00 - 0xe000 + i] = fc00Init[i];
    }

    // Built-in Solitaire score at $FEE0-$FEE1 + device local date calendar at $FEE2-$FEE7
    nvram[0xfee0 - 0xe000] = (this.solitaireScore >> 8) & 0xff;
    nvram[0xfee1 - 0xe000] = this.solitaireScore & 0xff;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1..12
    const fee2Init = [
      Math.floor(year / 1000) % 10,
      Math.floor(year / 100) % 10,
      Math.floor(year / 10) % 10,
      year % 10,
      Math.floor(month / 10) % 10,
      month % 10
    ];
    for (let i = 0; i < fee2Init.length; i++) {
      nvram[0xfee2 - 0xe000 + i] = fee2Init[i];
    }

    this.syncBankToNvram(nvram, this.activeBank);
  }

  /**
   * Encodes a single HighScoreRecord into the exact 64-byte ($0040) binary format
   * expected by the Tiger Game.Com BIOS at $FC60 + slot * $0040.
   */
  public static encodeSlot64(rec: HighScoreRecord | null): Uint8Array {
    const slot = new Uint8Array(0x40);
    if (!rec || rec.gameId === 0) {
      slot.fill(0x00);
      return slot;
    }

    // Restore full raw 64-byte slot if captured from hardware NVRAM (preserves trailing binary progress data)
    if (rec.rawSlot && rec.rawSlot.length === 0x40) {
      for (let i = 0; i < 0x40; i++) {
        slot[i] = rec.rawSlot[i] & 0xff;
      }
    } else {
      slot.fill(0x00);
    }

    slot[0] = (rec.gameId >> 8) & 0xff;
    slot[1] = rec.gameId & 0xff;
    slot[2] = 0x00;

    if (rec.gameId === 0x0917) {
      // Lights Out ($0917) requires exact 10-char "Lights Out", $01, 3-char right-padded level, $00,
      // followed by 6 binary level progress bytes at +$12..+$17
      const loTitle = 'Lights Out';
      for (let i = 0; i < loTitle.length; i++) {
        slot[3 + i] = loTitle.charCodeAt(i);
      }
      slot[0x0d] = 0x01;
      const lvlNum = Math.max(1, Math.min(100, rec.numericScore || 1));
      const lvlStr = String(lvlNum).padStart(3, ' ');
      slot[0x0e] = lvlStr.charCodeAt(0);
      slot[0x0f] = lvlStr.charCodeAt(1);
      slot[0x10] = lvlStr.charCodeAt(2);
      slot[0x11] = 0x00;
      NvramHighScoreManager.sanitizeSlot64(slot);
      return slot;
    }

    // Preserve original title case (up to 11 chars)
    const cleanTitle = rec.title.slice(0, 11);
    let pos = 3;
    for (let i = 0; i < cleanTitle.length; i++) {
      slot[pos++] = cleanTitle.charCodeAt(i) & 0x7f;
    }

    // $01 separator followed by score text and $00 terminator
    slot[pos++] = 0x01;
    const cleanScore = rec.scoreText.slice(0, 16);
    for (let i = 0; i < cleanScore.length && pos < 0x3e; i++) {
      slot[pos++] = cleanScore.charCodeAt(i) & 0x7f;
    }
    slot[pos] = 0x00;

    NvramHighScoreManager.sanitizeSlot64(slot);
    return slot;
  }

  /**
   * Decodes a 64-byte ($0040) BIOS High Score slot from $FC60 + slot * $0040.
   */
  public static decodeSlot64(slot: Uint8Array): HighScoreRecord | null {
    if (slot.length < 0x40) return null;
    const gameId = (slot[0] << 8) | slot[1];
    if (gameId === 0x0000 || gameId === 0xffff) return null;

    const cleanSlot = new Uint8Array(slot.subarray(0, 0x40));
    NvramHighScoreManager.sanitizeSlot64(cleanSlot);

    let title = '';
    let scoreText = '';
    let inScore = false;

    for (let i = 3; i < 0x40; i++) {
      const b = cleanSlot[i];
      if (b === 0x00 || b === 0xff) {
        break;
      }
      if (b === 0x01) {
        inScore = true;
        continue;
      }
      if (b >= 32 && b <= 126) {
        if (!inScore) {
          title += String.fromCharCode(b);
        } else {
          scoreText += String.fromCharCode(b);
        }
      }
    }

    title = title.trim();
    scoreText = scoreText.trim();
    if (!title) return null;

    const numMatch = scoreText.match(/\d+/);
    const numericScore = numMatch ? parseInt(numMatch[0], 10) : 0;

    return {
      gameId,
      title,
      scoreText: scoreText || '0',
      numericScore,
      updatedAt: Date.now(),
      rawSlot: Array.from(cleanSlot)
    };
  }

  /**
   * Writes the 10 entries of the specified Virtual Bank (bankIndex * 10 .. bankIndex * 10 + 9)
   * directly into hardware NVRAM at $FC60-$FEDF.
   */
  public syncBankToNvram(nvram: Uint8Array, bankIndex: number = this.activeBank) {
    this.activeBank = Math.max(0, bankIndex);
    const baseOffset = 0xfc60 - 0xe000;
    const startIdx = this.activeBank * 10;

    for (let slotIdx = 0; slotIdx < 10; slotIdx++) {
      const rec = this.records[startIdx + slotIdx] || null;
      const encoded = NvramHighScoreManager.encodeSlot64(rec);
      nvram.set(encoded, baseOffset + slotIdx * 0x40);
    }

    // Sync Solitaire high score at $FEE0-$FEE1
    nvram[0xfee0 - 0xe000] = (this.solitaireScore >> 8) & 0xff;
    nvram[0xfee1 - 0xe000] = this.solitaireScore & 0xff;

    this.saveRawNvram(nvram);
  }

  /**
   * Reads the 10 hardware slots at $FC60-$FEDF from cpu.nvram after the BIOS or a cartridge
   * writes to NVRAM, updating the Unlimited High Score Vault.
   */
  public syncFromNvram(nvram: Uint8Array) {
    const baseOffset = 0xfc60 - 0xe000;
    const startIdx = this.activeBank * 10;
    let changed = false;

    for (let slotIdx = 0; slotIdx < 10; slotIdx++) {
      const slotBytes = nvram.subarray(baseOffset + slotIdx * 0x40, baseOffset + (slotIdx + 1) * 0x40);
      // Sanitize in-place in live NVRAM if Lights Out ($0917) had any 0xFF corrupt bytes
      NvramHighScoreManager.sanitizeSlot64(slotBytes);
      const decoded = NvramHighScoreManager.decodeSlot64(slotBytes);
      const vaultIdx = startIdx + slotIdx;

      if (decoded) {
        const existing = this.records[vaultIdx];
        const rawChanged =
          !existing?.rawSlot ||
          !decoded.rawSlot ||
          existing.rawSlot.some((b, i) => b !== decoded.rawSlot![i]);
        if (
          !existing ||
          existing.gameId !== decoded.gameId ||
          existing.title !== decoded.title ||
          existing.scoreText !== decoded.scoreText ||
          rawChanged
        ) {
          this.records[vaultIdx] = decoded;
          changed = true;
        }
      } else if (vaultIdx < this.records.length && slotBytes[0] === 0 && slotBytes[1] === 0) {
        // User deleted this entry via the BIOS High Score screen or cleared NVRAM
        this.records.splice(vaultIdx, 1);
        changed = true;
      }
    }

    const solScore = (nvram[0xfee0 - 0xe000] << 8) | nvram[0xfee1 - 0xe000];
    if (solScore !== this.solitaireScore && solScore < 0xffff) {
      this.solitaireScore = solScore;
      changed = true;
    }

    if (changed) {
      // Compact any undefined holes
      this.records = this.records.filter(Boolean);
      this.saveVault();
    }
    this.saveRawNvram(nvram);
  }

  /**
   * Ensures that when a cartridge is inserted, the High Score Bank containing its 16-bit Game ID
   * (or a bank with an open slot if the current bank has all 10 slots full) is active in $FC60-$FEDF.
   */
  public ensureBankForCartridge(romData: Uint8Array | undefined, nvram: Uint8Array) {
    if (!romData || romData.length < 0x20) return;

    // Locate "TigerDMGC" header in bank 0x00 or offset 0x40000
    let headerOffset = -1;
    for (const candidate of [0x00000, 0x40000, 0x80000]) {
      if (candidate + 0x20 <= romData.length) {
        const sig = String.fromCharCode(...Array.from(romData.subarray(candidate + 5, candidate + 14)));
        if (sig === 'TigerDMGC') {
          headerOffset = candidate;
          break;
        }
      }
    }
    if (headerOffset < 0) return;

    // Read full 16-bit Big-Endian Game ID at $601A-$601B (e.g., Frogger = $1A18, Lights Out = $0917)
    const gameId16 = (romData[headerOffset + 0x1a] << 8) | romData[headerOffset + 0x1b];
    const gameIdHi = romData[headerOffset + 0x1a];
    if (!gameId16) return;

    // Check if this game already exists in our Unlimited Vault
    const existingIdx = this.records.findIndex(
      r => r && (r.gameId === gameId16 || (r.gameId & 0xff) === gameIdHi || ((r.gameId >> 8) & 0xff) === gameIdHi)
    );
    if (existingIdx >= 0) {
      const targetBank = Math.floor(existingIdx / 10);
      if (targetBank !== this.activeBank) {
        this.syncBankToNvram(nvram, targetBank);
      }
      return;
    }

    // If not in vault yet and current bank already has 10 entries, switch to a bank with free space
    const currentBankCount = this.records.slice(this.activeBank * 10, (this.activeBank + 1) * 10).length;
    if (currentBankCount >= 10) {
      const openBank = Math.floor(this.records.length / 10);
      this.syncBankToNvram(nvram, openBank);
    }
  }

  /**
   * Adds or updates a high score record in the Unlimited Vault and syncs to NVRAM.
   */
  public upsertScore(gameId: number, title: string, scoreText: string, nvram: Uint8Array): number {
    const cleanTitle = title.toUpperCase().slice(0, 11);
    const cleanScore = scoreText.toUpperCase().slice(0, 16);
    const numMatch = cleanScore.match(/\d+/);
    const numericScore = numMatch ? parseInt(numMatch[0], 10) : 0;

    const idx = this.records.findIndex(
      r => r.gameId === gameId || r.title.toUpperCase() === cleanTitle
    );

    if (idx >= 0) {
      this.records[idx] = {
        gameId,
        title: cleanTitle,
        scoreText: cleanScore,
        numericScore,
        updatedAt: Date.now()
      };
      const bank = Math.floor(idx / 10);
      this.saveVault();
      this.syncBankToNvram(nvram, bank);
      return bank;
    } else {
      this.records.push({
        gameId,
        title: cleanTitle,
        scoreText: cleanScore,
        numericScore,
        updatedAt: Date.now()
      });
      const bank = Math.floor((this.records.length - 1) / 10);
      this.saveVault();
      this.syncBankToNvram(nvram, bank);
      return bank;
    }
  }

  public deleteRecord(index: number, nvram: Uint8Array) {
    if (index >= 0 && index < this.records.length) {
      this.records.splice(index, 1);
      this.saveVault();
      const maxBank = Math.max(0, Math.floor((this.records.length - 1) / 10));
      if (this.activeBank > maxBank) {
        this.activeBank = maxBank;
      }
      this.syncBankToNvram(nvram, this.activeBank);
    }
  }

  /**
   * Clears all High Score records and resets Solitaire score to 0 while keeping BIOS NVRAM headers valid.
   */
  public clearAllData(nvram: Uint8Array) {
    this.records = [];
    this.solitaireScore = 0;
    this.activeBank = 0;
    this.saveVault();
    this.syncBankToNvram(nvram, 0);
  }

  /**
   * Exports all Unlimited High Score Vault records, Solitaire score, and the full 8KB battery-backed
   * NVRAM ($E000-$FFFF) as a formatted JSON backup string.
   */
  public exportVaultJson(nvram: Uint8Array): string {
    this.syncFromNvram(nvram);
    let binary = '';
    for (let i = 0; i < nvram.length; i++) {
      binary += String.fromCharCode(nvram[i]);
    }
    const payload = {
      format: 'TIGER_GAMECOM_NVRAM_VAULT_V1',
      exportedAt: new Date().toISOString(),
      activeBank: this.activeBank,
      solitaireScore: this.solitaireScore,
      records: this.records,
      nvram8kBase64: btoa(binary)
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Exports the raw 8,192-byte ($E000-$FFFF) battery-backed NVRAM image compatible with MAME gamecom.
   */
  public exportRawNvramBinary(nvram: Uint8Array): Uint8Array {
    this.syncFromNvram(nvram);
    return new Uint8Array(nvram);
  }

  /**
   * Imports either a JSON Vault backup (.json) or a raw 8KB NVRAM binary (.nvram, .sav, .bin)
   * into both the Unlimited High Score Vault and live SM8521 CPU NVRAM ($E000-$FFFF).
   */
  public async importDataFromFile(
    file: File,
    nvram: Uint8Array
  ): Promise<{ format: 'json' | 'nvram'; recordsCount: number }> {
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    // Check if file is a JSON export
    const isJsonName = file.name.toLowerCase().endsWith('.json');
    const startsWithBrace = bytes.length > 0 && (bytes[0] === 0x7b || bytes[0] === 0x20 || bytes[0] === 0x0a);

    if (isJsonName || (startsWithBrace && bytes.length !== 0x2000)) {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text);
      if (!parsed || (!Array.isArray(parsed.records) && typeof parsed.nvram8kBase64 !== 'string')) {
        throw new Error('Invalid Game.Com JSON backup format.');
      }

      if (typeof parsed.nvram8kBase64 === 'string') {
        const bin = atob(parsed.nvram8kBase64);
        if (bin.length === 0x2000) {
          for (let i = 0; i < 0x2000; i++) {
            nvram[i] = bin.charCodeAt(i) & 0xff;
          }
        }
      }

      if (Array.isArray(parsed.records)) {
        this.records = parsed.records
          .filter((r: HighScoreRecord) => r && typeof r.title === 'string' && typeof r.gameId === 'number')
          .map((r: HighScoreRecord) => ({
            gameId: Number(r.gameId) & 0xffff,
            title: String(r.title).toUpperCase().slice(0, 11),
            scoreText: String(r.scoreText || '0').toUpperCase().slice(0, 16),
            numericScore: Number(r.numericScore) || 0,
            updatedAt: Number(r.updatedAt) || Date.now()
          }));
      }

      if (typeof parsed.solitaireScore === 'number') {
        this.solitaireScore = parsed.solitaireScore & 0xffff;
      }
      this.activeBank = typeof parsed.activeBank === 'number' ? Math.max(0, parsed.activeBank) : 0;

      this.saveVault();
      this.syncBankToNvram(nvram, this.activeBank);
      return { format: 'json', recordsCount: this.records.length };
    }

    // Otherwise treat as raw 8KB ($2000) NVRAM binary (.nvram / .sav / .bin)
    if (bytes.length !== 0x2000) {
      throw new Error(`Expected 8,192-byte (8KB) NVRAM file or .json Vault, got ${bytes.length} bytes.`);
    }

    nvram.set(bytes);
    // Decode the 10 hardware slots at $FC60-$FEDF into the current bank
    const decodedRecords: HighScoreRecord[] = [];
    const baseOffset = 0xfc60 - 0xe000;
    for (let slotIdx = 0; slotIdx < 10; slotIdx++) {
      const slotBytes = nvram.subarray(baseOffset + slotIdx * 0x40, baseOffset + (slotIdx + 1) * 0x40);
      const rec = NvramHighScoreManager.decodeSlot64(slotBytes);
      if (rec) {
        decodedRecords.push(rec);
      }
    }

    const solScore = (nvram[0xfee0 - 0xe000] << 8) | nvram[0xfee1 - 0xe000];
    if (solScore < 0xffff) {
      this.solitaireScore = solScore;
    }

    this.records = decodedRecords;
    this.activeBank = 0;
    this.saveVault();
    this.saveRawNvram(nvram);
    return { format: 'nvram', recordsCount: this.records.length };
  }

  public getTotalBanks(): number {
    return Math.max(1, Math.ceil((this.records.length + 1) / 10));
  }

  public getActiveBankIndex(): number {
    return this.activeBank;
  }

  public getTotalStoredScoresCount(): number {
    return this.records.length;
  }

  public loadVault() {
    try {
      const raw = localStorage.getItem(HIGH_SCORE_VAULT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.records)) {
          this.records = parsed.records
            .map((r: HighScoreRecord) => {
              if (!r || !r.gameId) return null;
              const encoded = NvramHighScoreManager.encodeSlot64(r);
              return NvramHighScoreManager.decodeSlot64(encoded);
            })
            .filter(Boolean) as HighScoreRecord[];
          this.solitaireScore = typeof parsed.solitaireScore === 'number' ? parsed.solitaireScore : 0;
          return;
        }
      }
    } catch {
      // Ignore storage error
    }
    this.records = DEFAULT_HIGH_SCORE_RECORDS.map(r => ({ ...r }));
    this.solitaireScore = 0;
  }

  public saveVault() {
    try {
      localStorage.setItem(
        HIGH_SCORE_VAULT_KEY,
        JSON.stringify({
          records: this.records,
          solitaireScore: this.solitaireScore
        })
      );
    } catch {
      // Ignore storage error
    }
  }

  private saveRawNvram(nvram: Uint8Array) {
    try {
      let binary = '';
      for (let i = 0; i < nvram.length; i++) {
        binary += String.fromCharCode(nvram[i]);
      }
      localStorage.setItem(NVRAM_RAW_STORAGE_KEY, btoa(binary));
    } catch {
      // Ignore storage error
    }
  }
}
