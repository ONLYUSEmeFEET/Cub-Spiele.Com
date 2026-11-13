/**
 * Tiger Game.Com Cycle-Accurate NVRAM Phone Book & Unlimited Bank Subsystem
 *
 * Verified from the official 1997 Tiger Game.Com External BIOS (Bank 1, $4BE6-$5A12):
 * - Hardware NVRAM Address Partition: $E000-$F3FF (5,120 bytes):
 *   - $E000-$E002 (3 bytes): Dummy Sentinel Record (`F0 00 00`)
 *   - $E003-$F3FA (5,112 bytes): Variable-length doubly-sized linked records
 *   - Immediate End-of-Chain Marker: `0xFF` byte immediately following the last record
 *   - $F3FC-$F3FF (4 bytes): Initialized Partition Signature (`AA AA AA AA`)
 *
 * - Binary Record Format (`Sub_5596`, `Sub_5615`, `Sub_5780`, `Sub_5825`):
 *   Each user record starting at $E003 is encoded as:
 *   `[0xF0] [payloadLen] [Field0\0] [Field1\0] [Field2\0] [Field3\0] [payloadLen]`
 *   where:
 *   - `0xF0`       : Record start marker
 *   - `payloadLen` : Total byte length of the 4 null-terminated field strings (including all 4 `0x00` bytes)
 *   - `Field 0`    : 1-byte Mark flag (`' '` 0x20 = normal, `'!'` 0x21 = marked/starred) +
 *                    Name string (1..18 ASCII chars, right-trimmed) + `0x00`
 *                    (Unpacked by BIOS into $0210..$0222; sorted alphabetically by bytes 1..18 via `Sub_5843`)
 *   - `Field 1`    : Phone number string (0..18 ASCII chars, right-trimmed) + `0x00`
 *                    (Unpacked by BIOS into $0224..$0235)
 *   - `Field 2`    : Address / Street / City (0..36 ASCII chars = 2 lines x 18 chars, right-trimmed) + `0x00`
 *                    (Unpacked by BIOS into $0237..$0248 [Line 1] and $0249..$025A [Line 2])
 *   - `Field 3`    : Note / Email / 2nd Phone (0..18 ASCII chars, right-trimmed) + `0x00`
 *                    (Unpacked by BIOS into $025C..$026D)
 *   - `payloadLen` : Repeated trailing payload length byte (used by BIOS for reverse chain traversal)
 *
 * - How we exceed the 5,116-byte hardware partition limit with zero loss of accuracy:
 *   We maintain an Unlimited Phone Book Vault in localStorage divided into Virtual Banks
 *   of up to 50 entries per bank (`ENTRIES_PER_BANK = 50`, max 4,900 bytes <= 5,112 hardware bytes).
 *   The active bank is encoded directly into $E000-$F3FF in `cpu.nvram`, and any entries added,
 *   edited, or deleted inside the emulated BIOS Phone Book are decoded back into the active bank in real time.
 */

export interface PhoneBookEntry {
  id: string;
  name: string;         // Up to 18 printable ASCII chars (Field 0 bytes 1..18)
  marked: boolean;      // Field 0 byte 0: '!' (0x21) if true, ' ' (0x20) if false
  phone: string;        // Up to 18 printable ASCII chars (Field 1)
  addressLine1: string; // Up to 18 printable ASCII chars (Field 2 Line 1, $0237..$0248)
  addressLine2: string; // Up to 18 printable ASCII chars (Field 2 Line 2, $0249..$025A)
  note: string;         // Up to 18 printable ASCII chars (Field 3, $025C..$026D)
  updatedAt: number;
}

export interface EncodedPhoneBookRecordInfo {
  entry: PhoneBookEntry;
  nvramAddress: number; // Hardware address in $E003-$F3FA
  byteLength: number;   // Total record bytes including 0xF0 and head/tail length bytes
}

export const PHONEBOOK_NVRAM_START = 0xe000;
export const PHONEBOOK_FIRST_RECORD_ADDR = 0xe003;
export const PHONEBOOK_MAX_RECORD_END = 0xf3fa; // Leave $F3FB for 0xFF terminator
export const PHONEBOOK_SIGNATURE_ADDR = 0xf3fc; // $F3FC-$F3FF = AA AA AA AA
export const PHONEBOOK_PARTITION_BYTES = 0xf3fb - 0xe000; // 5,115 usable chain bytes
export const PHONEBOOK_ENTRIES_PER_BANK = 50;

const PHONEBOOK_VAULT_STORAGE_KEY = 'cub_spiele_phonebook_vault_v1';

export class NvramPhoneBookManager {
  public banks: PhoneBookEntry[][] = [[]];
  public activeBank: number = 0;

  constructor() {
    this.loadVault();
  }

  /**
   * Sanitizes a string to printable 7-bit ASCII (0x20..0x7E) supported by the Game.Com BIOS font,
   * trimmed to `maxLen` characters.
   */
  public static sanitizeAsciiField(value: string, maxLen: number, trimEnd: boolean = true): string {
    let out = '';
    for (let i = 0; i < value.length && out.length < maxLen; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0x20 && code <= 0x7e) {
        out += value[i];
      } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
        out += ' ';
      }
    }
    return trimEnd ? out.replace(/\s+$/g, '') : out;
  }

  /**
   * Compares two PhoneBookEntry records using the exact ASCII byte order of `Sub_5843` / `Sub_589E`
   * in the Tiger Game.Com BIOS (compares Field 0 starting at byte 1, i.e. the Name field).
   */
  public static compareEntriesBiosOrder(a: PhoneBookEntry, b: PhoneBookEntry): number {
    const nameA = NvramPhoneBookManager.sanitizeAsciiField(a.name, 18, true);
    const nameB = NvramPhoneBookManager.sanitizeAsciiField(b.name, 18, true);
    const len = Math.max(nameA.length, nameB.length);
    for (let i = 0; i < len; i++) {
      const ca = i < nameA.length ? nameA.charCodeAt(i) : 0;
      const cb = i < nameB.length ? nameB.charCodeAt(i) : 0;
      if (ca !== cb) return ca - cb;
    }
    const phoneA = NvramPhoneBookManager.sanitizeAsciiField(a.phone, 18, true);
    const phoneB = NvramPhoneBookManager.sanitizeAsciiField(b.phone, 18, true);
    if (phoneA !== phoneB) return phoneA < phoneB ? -1 : 1;
    return 0;
  }

  /**
   * Encodes a single PhoneBookEntry into the exact binary record structure used by the
   * Tiger Game.Com BIOS (`[0xF0, payloadLen, Field0\0, Field1\0, Field2\0, Field3\0, payloadLen]`).
   */
  public static encodeRecord(entry: PhoneBookEntry): Uint8Array {
    const cleanName = NvramPhoneBookManager.sanitizeAsciiField(entry.name, 18, true) || 'UNNAMED';
    const markChar = entry.marked ? '!' : ' ';
    const field0 = markChar + cleanName;

    const field1 = NvramPhoneBookManager.sanitizeAsciiField(entry.phone, 18, true);

    const line1 = NvramPhoneBookManager.sanitizeAsciiField(entry.addressLine1, 18, true);
    const line2 = NvramPhoneBookManager.sanitizeAsciiField(entry.addressLine2, 18, true);
    const field2 = line2.length > 0 ? line1.padEnd(18, ' ') + line2 : line1;

    const field3 = NvramPhoneBookManager.sanitizeAsciiField(entry.note, 18, true);

    const payloadLen = field0.length + 1 + field1.length + 1 + field2.length + 1 + field3.length + 1;
    const totalLen = 3 + payloadLen;
    const buf = new Uint8Array(totalLen);

    let pos = 0;
    buf[pos++] = 0xf0;
    buf[pos++] = payloadLen & 0xff;

    for (const field of [field0, field1, field2, field3]) {
      for (let i = 0; i < field.length; i++) {
        buf[pos++] = field.charCodeAt(i) & 0x7f;
      }
      buf[pos++] = 0x00;
    }

    buf[pos++] = payloadLen & 0xff;
    return buf;
  }

  /**
   * Decodes all Phone Book user records currently stored in hardware NVRAM ($E000-$F3FB).
   */
  public static decodeRecordsFromNvram(nvram: Uint8Array): EncodedPhoneBookRecordInfo[] {
    const results: EncodedPhoneBookRecordInfo[] = [];
    if (nvram.length < 0x1400) return results;

    // Verify partition header at $E000 (`F0 00 00`)
    if (nvram[0] !== 0xf0 || nvram[1] !== 0x00 || nvram[2] !== 0x00) {
      return results;
    }

    let offset = 0x0003; // $E003
    const maxOffset = PHONEBOOK_MAX_RECORD_END - PHONEBOOK_NVRAM_START;

    while (offset <= maxOffset) {
      const marker = nvram[offset];
      if (marker === 0xff || marker !== 0xf0) {
        break;
      }

      const payloadLen = nvram[offset + 1];
      const recordTotalLen = 3 + payloadLen;
      if (payloadLen < 4 || offset + recordTotalLen > maxOffset + 1) {
        break;
      }

      const payloadStart = offset + 2;
      const payloadEnd = payloadStart + payloadLen;
      const fields: string[] = [];
      let currentField = '';

      for (let i = payloadStart; i < payloadEnd; i++) {
        const b = nvram[i];
        if (b === 0x00) {
          fields.push(currentField);
          currentField = '';
          if (fields.length === 4) break;
        } else if (b >= 0x20 && b <= 0x7e) {
          currentField += String.fromCharCode(b);
        }
      }
      while (fields.length < 4) {
        fields.push('');
      }

      const rawField0 = fields[0];
      const marked = rawField0.startsWith('!');
      const name = (
        rawField0.startsWith(' ') || rawField0.startsWith('!')
          ? rawField0.slice(1)
          : rawField0
      )
        .slice(0, 18)
        .replace(/\s+$/g, '');

      const phone = fields[1].slice(0, 18).replace(/\s+$/g, '');
      const rawAddress = fields[2].slice(0, 36);
      const addressLine1 = rawAddress.slice(0, 18).replace(/\s+$/g, '');
      const addressLine2 = rawAddress.slice(18, 36).replace(/\s+$/g, '');
      const note = fields[3].slice(0, 18).replace(/\s+$/g, '');

      if (name.length > 0 || phone.length > 0 || addressLine1.length > 0 || note.length > 0) {
        results.push({
          entry: {
            id: `pb_${offset}_${name}_${phone}`,
            name: name || 'UNNAMED',
            marked,
            phone,
            addressLine1,
            addressLine2,
            note,
            updatedAt: Date.now()
          },
          nvramAddress: PHONEBOOK_NVRAM_START + offset,
          byteLength: recordTotalLen
        });
      }

      offset += recordTotalLen;
    }

    return results;
  }

  /**
   * Ensures at least one bank exists and `activeBank` is within valid bounds.
   */
  private ensureValidBankState() {
    if (!Array.isArray(this.banks) || this.banks.length === 0) {
      this.banks = [[]];
    }
    for (let i = 0; i < this.banks.length; i++) {
      if (!Array.isArray(this.banks[i])) {
        this.banks[i] = [];
      }
    }
    if (this.activeBank < 0 || this.activeBank >= this.banks.length) {
      this.activeBank = 0;
    }
  }

  /**
   * Writes the specified Virtual Phone Book Bank into hardware NVRAM ($E000-$F3FF)
   * with exact BIOS sentinel (`F0 00 00`), sorted records (`$E003+`), `0xFF` end marker,
   * and `AA AA AA AA` signature at `$F3FC-$F3FF`.
   */
  public syncBankToNvram(nvram: Uint8Array, bankIndex: number = this.activeBank) {
    this.ensureValidBankState();
    while (bankIndex >= this.banks.length) {
      this.banks.push([]);
    }
    this.activeBank = Math.max(0, bankIndex);

    // Sort active bank entries alphabetically in BIOS order
    const bankEntries = this.banks[this.activeBank];
    bankEntries.sort(NvramPhoneBookManager.compareEntriesBiosOrder);

    // Clear $E000-$F3FB
    nvram.fill(0x00, 0x0000, 0x13fc);

    // Dummy sentinel record at $E000-$E002: F0 00 00
    nvram[0x0000] = 0xf0;
    nvram[0x0001] = 0x00;
    nvram[0x0002] = 0x00;

    let writeOffset = 0x0003; // $E003
    const maxRecordEndOffset = PHONEBOOK_MAX_RECORD_END - PHONEBOOK_NVRAM_START;

    for (const entry of bankEntries) {
      const encoded = NvramPhoneBookManager.encodeRecord(entry);
      if (writeOffset + encoded.length > maxRecordEndOffset) {
        break;
      }
      nvram.set(encoded, writeOffset);
      writeOffset += encoded.length;
    }

    // Write end-of-chain marker 0xFF immediately after the last record
    nvram[writeOffset] = 0xff;

    // Write initialized partition magic signature at $F3FC-$F3FF: AA AA AA AA
    nvram[0x13fc] = 0xaa;
    nvram[0x13fd] = 0xaa;
    nvram[0x13fe] = 0xaa;
    nvram[0x13ff] = 0xaa;

    this.saveVault();
  }

  /**
   * Called after initial NVRAM restore or when the SM8521 CPU writes to $E000-$F3FF
   * (e.g., when the user adds, edits, or deletes a contact inside the emulated BIOS Phone Book).
   */
  public syncFromNvram(nvram: Uint8Array) {
    this.ensureValidBankState();

    // Check if NVRAM Phone Book partition has valid signature AA AA AA AA at $F3FC-$F3FF
    const hasValidSig =
      nvram[0x13fc] === 0xaa &&
      nvram[0x13fd] === 0xaa &&
      nvram[0x13fe] === 0xaa &&
      nvram[0x13ff] === 0xaa &&
      nvram[0x0000] === 0xf0;

    if (!hasValidSig) {
      return;
    }

    const decodedInfos = NvramPhoneBookManager.decodeRecordsFromNvram(nvram);
    const currentBank = this.banks[this.activeBank] || [];

    // Preserve stable entry IDs & timestamps where records match
    const updatedBank: PhoneBookEntry[] = decodedInfos.map((info, idx) => {
      const existing = currentBank.find(
        (e) =>
          e.name === info.entry.name &&
          e.phone === info.entry.phone &&
          e.addressLine1 === info.entry.addressLine1 &&
          e.addressLine2 === info.entry.addressLine2 &&
          e.note === info.entry.note
      );
      return {
        ...info.entry,
        id: existing ? existing.id : `pb_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        updatedAt: existing ? existing.updatedAt : Date.now()
      };
    });

    this.banks[this.activeBank] = updatedBank;
    this.saveVault();
  }

  /**
   * Returns detailed hardware layout info (NVRAM address & byte size) for all entries in the active bank.
   */
  public getActiveBankHardwareLayout(): {
    records: EncodedPhoneBookRecordInfo[];
    usedBytes: number;
    freeBytes: number;
    totalPartitionBytes: number;
  } {
    this.ensureValidBankState();
    const bankEntries = [...(this.banks[this.activeBank] || [])].sort(
      NvramPhoneBookManager.compareEntriesBiosOrder
    );

    const records: EncodedPhoneBookRecordInfo[] = [];
    let currentAddr = PHONEBOOK_FIRST_RECORD_ADDR;
    for (const entry of bankEntries) {
      const encoded = NvramPhoneBookManager.encodeRecord(entry);
      if (currentAddr + encoded.length > PHONEBOOK_MAX_RECORD_END) {
        break;
      }
      records.push({
        entry,
        nvramAddress: currentAddr,
        byteLength: encoded.length
      });
      currentAddr += encoded.length;
    }

    // Include 3-byte header ($E000-$E002) and 1-byte 0xFF terminator
    const usedBytes = currentAddr - PHONEBOOK_NVRAM_START + 1;
    const freeBytes = Math.max(0, PHONEBOOK_PARTITION_BYTES - usedBytes);
    return {
      records,
      usedBytes,
      freeBytes,
      totalPartitionBytes: PHONEBOOK_PARTITION_BYTES
    };
  }

  /**
   * Adds a new Phone Book entry from the frontend UI.
   * Automatically places it in the active bank if space permits (< 50 entries and fits in $E003-$F3FA),
   * or creates/switches to the next open Virtual Bank if the active bank is full.
   */
  public addEntry(
    input: {
      name: string;
      marked?: boolean;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      note?: string;
    },
    nvram: Uint8Array,
    targetBankIndex?: number
  ): { entry: PhoneBookEntry; bankIndex: number } {
    this.ensureValidBankState();

    const cleanName = NvramPhoneBookManager.sanitizeAsciiField(input.name || '', 18, true);
    if (!cleanName) {
      throw new Error('Contact Name is required (1–18 ASCII characters).');
    }

    const newEntry: PhoneBookEntry = {
      id: `pb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      marked: Boolean(input.marked),
      phone: NvramPhoneBookManager.sanitizeAsciiField(input.phone || '', 18, true),
      addressLine1: NvramPhoneBookManager.sanitizeAsciiField(input.addressLine1 || '', 18, true),
      addressLine2: NvramPhoneBookManager.sanitizeAsciiField(input.addressLine2 || '', 18, true),
      note: NvramPhoneBookManager.sanitizeAsciiField(input.note || '', 18, true),
      updatedAt: Date.now()
    };

    const encodedLen = NvramPhoneBookManager.encodeRecord(newEntry).length;
    let destBank = typeof targetBankIndex === 'number' ? Math.max(0, targetBankIndex) : this.activeBank;

    while (destBank >= this.banks.length) {
      this.banks.push([]);
    }

    // Check if destBank has capacity (both <= PHONEBOOK_ENTRIES_PER_BANK and byte space in $E003-$F3FA)
    const canFitInBank = (bIdx: number): boolean => {
      const list = this.banks[bIdx] || [];
      if (list.length >= PHONEBOOK_ENTRIES_PER_BANK) return false;
      let bytes = 4; // 3-byte sentinel + 1-byte 0xFF
      for (const item of list) {
        bytes += NvramPhoneBookManager.encodeRecord(item).length;
      }
      return bytes + encodedLen <= PHONEBOOK_PARTITION_BYTES;
    };

    if (!canFitInBank(destBank)) {
      // Find first bank with available space or allocate a new bank
      let foundBank = -1;
      for (let i = 0; i < this.banks.length; i++) {
        if (canFitInBank(i)) {
          foundBank = i;
          break;
        }
      }
      if (foundBank === -1) {
        this.banks.push([]);
        destBank = this.banks.length - 1;
      } else {
        destBank = foundBank;
      }
    }

    this.banks[destBank].push(newEntry);
    this.banks[destBank].sort(NvramPhoneBookManager.compareEntriesBiosOrder);
    this.syncBankToNvram(nvram, destBank);

    return { entry: newEntry, bankIndex: destBank };
  }

  /**
   * Updates an existing Phone Book entry in the active bank and re-sorts/syncs to hardware NVRAM.
   */
  public updateEntry(
    entryId: string,
    updates: {
      name: string;
      marked?: boolean;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      note?: string;
    },
    nvram: Uint8Array
  ): PhoneBookEntry | null {
    this.ensureValidBankState();
    const bank = this.banks[this.activeBank];
    const idx = bank.findIndex((e) => e.id === entryId);
    if (idx === -1) return null;

    const cleanName = NvramPhoneBookManager.sanitizeAsciiField(updates.name || '', 18, true);
    if (!cleanName) {
      throw new Error('Contact Name is required (1–18 ASCII characters).');
    }

    const updated: PhoneBookEntry = {
      ...bank[idx],
      name: cleanName,
      marked: updates.marked !== undefined ? Boolean(updates.marked) : bank[idx].marked,
      phone: NvramPhoneBookManager.sanitizeAsciiField(updates.phone ?? bank[idx].phone, 18, true),
      addressLine1: NvramPhoneBookManager.sanitizeAsciiField(
        updates.addressLine1 ?? bank[idx].addressLine1,
        18,
        true
      ),
      addressLine2: NvramPhoneBookManager.sanitizeAsciiField(
        updates.addressLine2 ?? bank[idx].addressLine2,
        18,
        true
      ),
      note: NvramPhoneBookManager.sanitizeAsciiField(updates.note ?? bank[idx].note, 18, true),
      updatedAt: Date.now()
    };

    bank[idx] = updated;
    bank.sort(NvramPhoneBookManager.compareEntriesBiosOrder);
    this.syncBankToNvram(nvram, this.activeBank);
    return updated;
  }

  /**
   * Toggles the BIOS '!' Mark / Star flag on an entry in the active bank.
   */
  public toggleEntryMark(entryId: string, nvram: Uint8Array): boolean {
    this.ensureValidBankState();
    const bank = this.banks[this.activeBank];
    const entry = bank.find((e) => e.id === entryId);
    if (!entry) return false;
    entry.marked = !entry.marked;
    entry.updatedAt = Date.now();
    this.syncBankToNvram(nvram, this.activeBank);
    return entry.marked;
  }

  /**
   * Deletes an entry from the active bank and updates hardware NVRAM.
   */
  public deleteEntry(entryId: string, nvram: Uint8Array) {
    this.ensureValidBankState();
    const bank = this.banks[this.activeBank];
    const idx = bank.findIndex((e) => e.id === entryId);
    if (idx !== -1) {
      bank.splice(idx, 1);
      // Clean up trailing empty banks above bank 0 if needed
      while (this.banks.length > 1 && this.banks[this.banks.length - 1].length === 0 && this.activeBank < this.banks.length - 1) {
        this.banks.pop();
      }
      this.syncBankToNvram(nvram, this.activeBank);
    }
  }

  /**
   * Creates a new empty Virtual Phone Book Bank and switches to it.
   */
  public createNewBank(nvram: Uint8Array): number {
    this.ensureValidBankState();
    this.banks.push([]);
    const newBankIdx = this.banks.length - 1;
    this.syncBankToNvram(nvram, newBankIdx);
    return newBankIdx;
  }

  /**
   * Clears all Phone Book entries across all banks and resets $E000-$F3FF to an empty initialized partition.
   */
  public clearAllEntries(nvram: Uint8Array) {
    this.banks = [[]];
    this.activeBank = 0;
    this.syncBankToNvram(nvram, 0);
  }

  public getTotalEntriesCount(): number {
    this.ensureValidBankState();
    return this.banks.reduce((sum, b) => sum + b.length, 0);
  }

  public getTotalBanks(): number {
    this.ensureValidBankState();
    return Math.max(1, this.banks.length);
  }

  /**
   * Exports the Unlimited Phone Book Vault as a standalone JSON string.
   */
  public exportPhoneBookJson(nvram: Uint8Array): string {
    this.syncFromNvram(nvram);
    return JSON.stringify(
      {
        format: 'CUB_SPIELE_PHONEBOOK_VAULT_V1',
        exportedAt: new Date().toISOString(),
        activeBank: this.activeBank,
        totalEntries: this.getTotalEntriesCount(),
        banks: this.banks
      },
      null,
      2
    );
  }

  /**
   * Restores Phone Book banks from a parsed JSON Vault object (supports both standalone Phone Book JSON
   * and combined NVRAM Vault JSON).
   */
  public importFromParsedJson(parsed: any, nvram: Uint8Array): number {
    const rawBanks = parsed?.phoneBookBanks || parsed?.banks;
    if (Array.isArray(rawBanks)) {
      const sanitizedBanks: PhoneBookEntry[][] = rawBanks.map((bank: any[]) => {
        if (!Array.isArray(bank)) return [];
        return bank
          .filter((item) => item && typeof item.name === 'string')
          .map((item, idx) => ({
            id:
              typeof item.id === 'string' && item.id
                ? item.id
                : `pb_imp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            name: NvramPhoneBookManager.sanitizeAsciiField(item.name, 18, true) || 'UNNAMED',
            marked: Boolean(item.marked),
            phone: NvramPhoneBookManager.sanitizeAsciiField(item.phone || '', 18, true),
            addressLine1: NvramPhoneBookManager.sanitizeAsciiField(item.addressLine1 || '', 18, true),
            addressLine2: NvramPhoneBookManager.sanitizeAsciiField(item.addressLine2 || '', 18, true),
            note: NvramPhoneBookManager.sanitizeAsciiField(item.note || '', 18, true),
            updatedAt: Number(item.updatedAt) || Date.now()
          }))
          .sort(NvramPhoneBookManager.compareEntriesBiosOrder);
      });

      this.banks = sanitizedBanks.length > 0 ? sanitizedBanks : [[]];
      const targetBank =
        typeof parsed.activePhoneBookBank === 'number'
          ? parsed.activePhoneBookBank
          : typeof parsed.activeBank === 'number'
          ? parsed.activeBank
          : 0;
      this.activeBank = Math.max(0, Math.min(this.banks.length - 1, targetBank));
      this.syncBankToNvram(nvram, this.activeBank);
      return this.getTotalEntriesCount();
    }

    // Fallback: if importing a JSON or binary that wrote raw NVRAM into `nvram`, decode $E000-$F3FB
    this.syncFromNvram(nvram);
    return this.getTotalEntriesCount();
  }

  public loadVault() {
    try {
      const raw = localStorage.getItem(PHONEBOOK_VAULT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.banks)) {
          this.banks = parsed.banks.map((bank: any[]) =>
            Array.isArray(bank)
              ? bank
                  .filter((e) => e && typeof e.name === 'string')
                  .map((e) => ({
                    id: String(e.id || `pb_${Math.random().toString(36).slice(2, 8)}`),
                    name: NvramPhoneBookManager.sanitizeAsciiField(e.name, 18, true) || 'UNNAMED',
                    marked: Boolean(e.marked),
                    phone: NvramPhoneBookManager.sanitizeAsciiField(e.phone || '', 18, true),
                    addressLine1: NvramPhoneBookManager.sanitizeAsciiField(e.addressLine1 || '', 18, true),
                    addressLine2: NvramPhoneBookManager.sanitizeAsciiField(e.addressLine2 || '', 18, true),
                    note: NvramPhoneBookManager.sanitizeAsciiField(e.note || '', 18, true),
                    updatedAt: Number(e.updatedAt) || Date.now()
                  }))
              : []
          );
          if (this.banks.length === 0) this.banks = [[]];
          this.activeBank =
            typeof parsed.activeBank === 'number'
              ? Math.max(0, Math.min(this.banks.length - 1, parsed.activeBank))
              : 0;
          return;
        }
      }
    } catch {
      // Ignore localStorage error
    }
    this.banks = [[]];
    this.activeBank = 0;
  }

  public saveVault() {
    try {
      localStorage.setItem(
        PHONEBOOK_VAULT_STORAGE_KEY,
        JSON.stringify({
          activeBank: this.activeBank,
          banks: this.banks
        })
      );
    } catch {
      // Ignore localStorage error
    }
  }
}
