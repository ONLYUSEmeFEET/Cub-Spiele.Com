import { calculateMd5Hex } from './cartridge';
import { RARuntimeSaveState } from './retroAchievements';
import { GameComTimer, SM8521CPU } from './sm8521';
import { CartridgeInfo } from './types';

export const SAVE_STATE_FORMAT = 'CUB_SPIELE_COM_STATE_V1';
export const SAVE_STATE_FILE_EXT = '.cgstate';
export const SAVE_STATE_SLOT_COUNT = 10;
export const SAVE_STATE_STORAGE_PREFIX = 'cubspiele_savestate_v1_';
export const ACTIVE_SAVE_SLOT_STORAGE_KEY = 'cubspiele_active_save_slot';

export interface SaveStateGameIdentity {
  slot1Title: string;
  slot1HeaderTitle: string;
  slot1HeaderGameId: number;
  slot1RomHash: string;
}

export interface SaveStateCpuPayload {
  pc: number;
  sp: number;
  ps0: number;
  ps1: number;
  sys: number;
  ie0: number;
  ie1: number;
  ir0: number;
  ir1: number;
  ckc: number;
  clockChanged: number;
  halted: number;
  iflags: number;
  checkInterrupts: number;
  oldpc: number;
  cycles: number;
  dmaCount: number;
  latchedCartSlot: 1 | 2;
  scanline: number;
  clockTimerAccumCycles: number;
  mmu: string;
  regRam: string;
  internalRam: string;
  vram: string;
  displayBuffer: string;
  timers: [GameComTimer, GameComTimer];
  sound: {
    sgc: number;
    sg0l: number;
    sg1l: number;
    sg2l: number;
    sg0t: number;
    sg1t: number;
    sg2t: number;
    sgda: number;
    sg0w: string;
    sg1w: string;
  };
}

export interface SaveStateFileData {
  format: typeof SAVE_STATE_FORMAT;
  version: 1;
  emulatorName: 'Cub Spiele.Com';
  timestamp: number;
  slotIndex: number;
  nvramProtected: true;
  game: SaveStateGameIdentity;
  cpu: SaveStateCpuPayload;
  raRuntimeState?: RARuntimeSaveState;
}

export interface SaveStateSlotSummary {
  slotIndex: number;
  exists: boolean;
  timestamp?: number;
  slot1Title?: string;
  displayBuffer?: Uint8Array;
  sizeBytes?: number;
  nvramProtected?: boolean;
}

export interface SaveStateActionResult {
  ok: boolean;
  slotIndex: number;
  message: string;
}

export function normalizeSlotIndex(slotIndex: number): number {
  if (!Number.isFinite(slotIndex)) return 1;
  const rounded = Math.trunc(slotIndex);
  if (rounded < 1) return 1;
  if (rounded > SAVE_STATE_SLOT_COUNT) return SAVE_STATE_SLOT_COUNT;
  return rounded;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x4000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function getSlot1Identity(slot1: CartridgeInfo | null): SaveStateGameIdentity | null {
  if (!slot1 || !slot1.title) return null;
  const slot1RomHash =
    slot1.romData && slot1.romData.length > 0 ? calculateMd5Hex(slot1.romData) : '';
  return {
    slot1Title: slot1.title,
    slot1HeaderTitle: slot1.headerTitle || '',
    slot1HeaderGameId: slot1.headerGameId || 0,
    slot1RomHash
  };
}

export function getGameStorageKey(identity: SaveStateGameIdentity): string {
  const raw = `${identity.slot1Title}|${identity.slot1HeaderTitle}|${identity.slot1HeaderGameId}`;
  return calculateMd5Hex(raw).slice(0, 16);
}

function getSlotStorageKey(identity: SaveStateGameIdentity, slotIndex: number): string {
  const slot = normalizeSlotIndex(slotIndex);
  return `${SAVE_STATE_STORAGE_PREFIX}${getGameStorageKey(identity)}_slot_${slot}`;
}

/**
 * Enforces that a save state can only be loaded/imported when the exact same
 * title is currently loaded in Cartridge Slot 1.
 */
export function verifySlot1IdentityMatch(
  current: SaveStateGameIdentity | null,
  saved: SaveStateGameIdentity | undefined
): { ok: boolean; error?: string } {
  if (!current) {
    return {
      ok: false,
      error: 'No cartridge is loaded in Slot 1. Load the matching title in Slot 1 first.'
    };
  }
  if (!saved || !saved.slot1Title) {
    return {
      ok: false,
      error: 'Save state is missing Slot 1 title metadata and cannot be verified.'
    };
  }
  if (current.slot1Title !== saved.slot1Title) {
    return {
      ok: false,
      error: `Title mismatch: Slot 1 has "${current.slot1Title}", but this save state is for "${saved.slot1Title}".`
    };
  }
  if (
    saved.slot1HeaderTitle &&
    current.slot1HeaderTitle &&
    saved.slot1HeaderTitle !== current.slot1HeaderTitle
  ) {
    return {
      ok: false,
      error: `Header title mismatch: Slot 1 header is "${current.slot1HeaderTitle}", expected "${saved.slot1HeaderTitle}".`
    };
  }
  if (
    saved.slot1HeaderGameId &&
    current.slot1HeaderGameId &&
    saved.slot1HeaderGameId !== current.slot1HeaderGameId
  ) {
    return {
      ok: false,
      error: `Game ID mismatch: Slot 1 has $${current.slot1HeaderGameId.toString(16).toUpperCase().padStart(4, '0')}, expected $${saved.slot1HeaderGameId.toString(16).toUpperCase().padStart(4, '0')}.`
    };
  }
  return { ok: true };
}

export function buildSaveStatePayload(
  cpu: SM8521CPU,
  identity: SaveStateGameIdentity,
  slotIndex: number,
  raRuntimeState?: RARuntimeSaveState
): SaveStateFileData {
  return {
    format: SAVE_STATE_FORMAT,
    version: 1,
    emulatorName: 'Cub Spiele.Com',
    timestamp: Date.now(),
    slotIndex: normalizeSlotIndex(slotIndex),
    nvramProtected: true,
    game: { ...identity },
    cpu: {
      pc: cpu.m_PC,
      sp: cpu.m_SP,
      ps0: cpu.m_PS0,
      ps1: cpu.m_PS1,
      sys: cpu.m_SYS,
      ie0: cpu.m_IE0,
      ie1: cpu.m_IE1,
      ir0: cpu.m_IR0,
      ir1: cpu.m_IR1,
      ckc: cpu.m_CKC,
      clockChanged: cpu.m_clock_changed,
      halted: cpu.m_halted,
      iflags: cpu.m_IFLAGS,
      checkInterrupts: cpu.m_CheckInterrupts,
      oldpc: cpu.m_oldpc,
      cycles: cpu.cycles,
      dmaCount: cpu.dmaCount,
      latchedCartSlot: cpu.latchedCartSlot,
      scanline: cpu.m_scanline,
      clockTimerAccumCycles: cpu.clockTimerAccumCycles,
      mmu: uint8ToBase64(cpu.mmu),
      regRam: uint8ToBase64(cpu.m_register_ram),
      internalRam: uint8ToBase64(cpu.m_p_ram),
      vram: uint8ToBase64(cpu.videoram),
      displayBuffer: uint8ToBase64(cpu.displayBuffer),
      timers: [
        { ...cpu.m_timer[0] },
        { ...cpu.m_timer[1] }
      ],
      sound: {
        sgc: cpu.m_sound.sgc,
        sg0l: cpu.m_sound.sg0l,
        sg1l: cpu.m_sound.sg1l,
        sg2l: cpu.m_sound.sg2l,
        sg0t: cpu.m_sound.sg0t,
        sg1t: cpu.m_sound.sg1t,
        sg2t: cpu.m_sound.sg2t,
        sgda: cpu.m_sound.sgda,
        sg0w: uint8ToBase64(cpu.m_sound.sg0w),
        sg1w: uint8ToBase64(cpu.m_sound.sg1w)
      }
    },
    raRuntimeState
  };
}

export function parseAndValidateSaveState(rawJson: string): {
  ok: boolean;
  data?: SaveStateFileData;
  error?: string;
} {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Invalid save state file: expected JSON object.' };
    }
    if (parsed.format !== SAVE_STATE_FORMAT || parsed.version !== 1) {
      return {
        ok: false,
        error: 'Unsupported save state format. Expected a Cub Spiele.Com (.cgstate) v1 file.'
      };
    }
    if (!parsed.game || typeof parsed.game.slot1Title !== 'string' || !parsed.game.slot1Title) {
      return { ok: false, error: 'Invalid save state: missing Slot 1 game title.' };
    }
    if (
      !parsed.cpu ||
      typeof parsed.cpu.pc !== 'number' ||
      typeof parsed.cpu.mmu !== 'string' ||
      typeof parsed.cpu.internalRam !== 'string' ||
      typeof parsed.cpu.vram !== 'string'
    ) {
      return { ok: false, error: 'Invalid save state: corrupted CPU or memory payload.' };
    }
    return { ok: true, data: parsed as SaveStateFileData };
  } catch {
    return { ok: false, error: 'Failed to parse save state file (invalid JSON).' };
  }
}

/**
 * Restores CPU, MMU, RAM, VRAM, Timers, Audio, and LCD state from a verified SaveStateFileData.
 * Battery-backed NVRAM ($E000-$FFFF) is strictly protected and locked so loading a state
 * never overwrites High Scores, Phonebook, Calendar, or persistent cartridge saves.
 */
export function applySaveStateToCpu(cpu: SM8521CPU, stateData: SaveStateFileData): void {
  // Snapshot and lock live NVRAM before touching any hardware state
  const lockedNvram = new Uint8Array(cpu.nvram);

  const c = stateData.cpu;
  cpu.m_PC = c.pc & 0xffff;
  cpu.m_SP = c.sp & 0xffff;
  cpu.m_PS0 = c.ps0 & 0xff;
  cpu.m_PS1 = c.ps1 & 0xff;
  cpu.m_SYS = c.sys & 0xff;
  cpu.m_IE0 = c.ie0 & 0xff;
  cpu.m_IE1 = c.ie1 & 0xff;
  cpu.m_IR0 = c.ir0 & 0xff;
  cpu.m_IR1 = c.ir1 & 0xff;
  cpu.m_CKC = (c.ckc ?? 0) & 0xff;
  cpu.m_clock_changed = c.clockChanged ?? 0;
  cpu.m_halted = c.halted ?? 0;
  cpu.m_IFLAGS = c.iflags ?? 0;
  cpu.m_CheckInterrupts = c.checkInterrupts ?? 0;
  cpu.m_oldpc = c.oldpc ?? cpu.m_PC;
  cpu.cycles = c.cycles ?? 0;
  cpu.dmaCount = c.dmaCount ?? 0;
  cpu.m_scanline = c.scanline ?? 0;
  cpu.clockTimerAccumCycles = c.clockTimerAccumCycles ?? 0;

  if (c.latchedCartSlot === 2 && cpu.cart2Rom) {
    cpu.latchedCartSlot = 2;
    cpu.activeCartRom = cpu.cart2Rom;
  } else {
    cpu.latchedCartSlot = 1;
    cpu.activeCartRom = cpu.cart1Rom;
  }

  const mmuBytes = base64ToUint8(c.mmu);
  cpu.mmu.set(mmuBytes.subarray(0, cpu.mmu.length));

  const regBytes = base64ToUint8(c.regRam);
  cpu.m_register_ram.set(regBytes.subarray(0, cpu.m_register_ram.length));

  const ramBytes = base64ToUint8(c.internalRam);
  cpu.m_p_ram.set(ramBytes.subarray(0, cpu.m_p_ram.length));

  const vramBytes = base64ToUint8(c.vram);
  cpu.videoram.set(vramBytes.subarray(0, cpu.videoram.length));

  if (c.displayBuffer) {
    const dispBytes = base64ToUint8(c.displayBuffer);
    cpu.displayBuffer.set(dispBytes.subarray(0, cpu.displayBuffer.length));
  }

  if (Array.isArray(c.timers) && c.timers.length === 2) {
    cpu.m_timer[0] = { ...c.timers[0] };
    cpu.m_timer[1] = { ...c.timers[1] };
  }

  if (c.sound) {
    cpu.m_sound.sgc = c.sound.sgc ?? 0;
    cpu.m_sound.sg0l = c.sound.sg0l ?? 0;
    cpu.m_sound.sg1l = c.sound.sg1l ?? 0;
    cpu.m_sound.sg2l = c.sound.sg2l ?? 0;
    cpu.m_sound.sg0t = c.sound.sg0t ?? 0;
    cpu.m_sound.sg1t = c.sound.sg1t ?? 0;
    cpu.m_sound.sg2t = c.sound.sg2t ?? 0;
    cpu.m_sound.sgda = c.sound.sgda ?? 0;
    if (c.sound.sg0w) {
      const w0 = base64ToUint8(c.sound.sg0w);
      cpu.m_sound.sg0w.set(w0.subarray(0, cpu.m_sound.sg0w.length));
    }
    if (c.sound.sg1w) {
      const w1 = base64ToUint8(c.sound.sg1w);
      cpu.m_sound.sg1w.set(w1.subarray(0, cpu.m_sound.sg1w.length));
    }
  }

  // Enforce NVRAM lock after restore
  cpu.nvram.set(lockedNvram);
}

export function readSlotState(
  slot1: CartridgeInfo | null,
  slotIndex: number
): SaveStateFileData | null {
  const identity = getSlot1Identity(slot1);
  if (!identity) return null;
  try {
    const raw = localStorage.getItem(getSlotStorageKey(identity, slotIndex));
    if (!raw) return null;
    const parsed = parseAndValidateSaveState(raw);
    if (!parsed.ok || !parsed.data) return null;
    const match = verifySlot1IdentityMatch(identity, parsed.data.game);
    if (!match.ok) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeSlotState(
  slot1: CartridgeInfo | null,
  slotIndex: number,
  data: SaveStateFileData
): boolean {
  const identity = getSlot1Identity(slot1);
  if (!identity) return false;
  try {
    const slot = normalizeSlotIndex(slotIndex);
    const payload: SaveStateFileData = {
      ...data,
      slotIndex: slot,
      nvramProtected: true,
      game: { ...identity }
    };
    localStorage.setItem(getSlotStorageKey(identity, slot), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function deleteSlotState(slot1: CartridgeInfo | null, slotIndex: number): boolean {
  const identity = getSlot1Identity(slot1);
  if (!identity) return false;
  try {
    localStorage.removeItem(getSlotStorageKey(identity, slotIndex));
    return true;
  } catch {
    return false;
  }
}

export function listSlotSummaries(slot1: CartridgeInfo | null): SaveStateSlotSummary[] {
  const identity = getSlot1Identity(slot1);
  const summaries: SaveStateSlotSummary[] = [];
  for (let slot = 1; slot <= SAVE_STATE_SLOT_COUNT; slot++) {
    if (!identity) {
      summaries.push({ slotIndex: slot, exists: false });
      continue;
    }
    try {
      const key = getSlotStorageKey(identity, slot);
      const raw = localStorage.getItem(key);
      if (!raw) {
        summaries.push({ slotIndex: slot, exists: false });
        continue;
      }
      const parsed = parseAndValidateSaveState(raw);
      if (!parsed.ok || !parsed.data) {
        summaries.push({ slotIndex: slot, exists: false });
        continue;
      }
      const match = verifySlot1IdentityMatch(identity, parsed.data.game);
      if (!match.ok) {
        summaries.push({ slotIndex: slot, exists: false });
        continue;
      }
      let displayBuffer: Uint8Array | undefined;
      if (parsed.data.cpu.displayBuffer) {
        displayBuffer = base64ToUint8(parsed.data.cpu.displayBuffer);
      }
      summaries.push({
        slotIndex: slot,
        exists: true,
        timestamp: parsed.data.timestamp,
        slot1Title: parsed.data.game.slot1Title,
        displayBuffer,
        sizeBytes: raw.length,
        nvramProtected: parsed.data.nvramProtected
      });
    } catch {
      summaries.push({ slotIndex: slot, exists: false });
    }
  }
  return summaries;
}

export function getSaveStateExportFilename(slot1Title: string, slotIndex: number): string {
  const safeTitle = slot1Title
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'GameCom';
  return `${safeTitle}_Slot${normalizeSlotIndex(slotIndex)}${SAVE_STATE_FILE_EXT}`;
}
