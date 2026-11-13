/**
 * Cub Spiele.Com — Cycle-Accurate Hardware Emulation Coordinator
 *
 * Executes the official BIOS ROMs (internal.bin at $1000-$1FFF, external.bin across MMU Banks 0-31)
 * and Game.Com Cartridge ROMs (.bin, .tgc, .zip) directly on the Sharp SM8521 CPU,
 * hardware DMA blitter, 16KB 2-bpp VRAM scanline engine, and 8KB battery-backed NVRAM ($E000-$FFFF).
 */

import { LCDSubsystem, SCREEN_WIDTH, SCREEN_HEIGHT } from './lcd';
import { SoundEngine } from './sound';
import { BiosSubsystem } from './bios';
import { SM8521CPU } from './sm8521';
import { NvramHighScoreManager } from './nvramHighScores';
import { NvramPhoneBookManager } from './nvramPhoneBook';
import { CompeteComLinkManager } from './linkCable';
import { RetroAchievementsEngine } from './retroAchievements';
import { OnlineLeaderboardManager } from './onlineLeaderboard';
import {
  GameComButtons,
  TouchPoint,
  VirtualStylusState,
  CartridgeInfo,
  EmulatorSettings,
  CPURegisters,
  RecentGameEntry,
  LCDPaletteId,
  PALETTES,
  DEFAULT_LIGHT_SHADE,
  DEFAULT_DARK_SHADE,
  blendTwoShades
} from './types';
import { PRELOADED_CARTRIDGES, loadCartridgeFromFile } from './cartridge';

const RECENT_GAMES_STORAGE_KEY = 'cub_spiele_recent_games_v2';
const TWO_SHADE_STORAGE_KEY = 'cub_spiele_two_shade_v2';
const GHOSTING_SETTINGS_STORAGE_KEY = 'cub_spiele_ghosting_v2';
const INPUT_SETTINGS_STORAGE_KEY = 'cub_spiele_input_settings_v1';

export interface EmulationAccuracyFixes {
  correctClockSpeed: boolean;      // Calibrated 4.9152 MHz SM8521 scanline cycle timing
  preventBankWrapCrash: boolean;   // Hardware-accurate 2MB cartridge mirroring
  timerInterruptFix: boolean;      // Edge-triggered IR0/IR1 interrupt service acknowledgement
  stnGhostingAccurate: boolean;    // Passive-matrix STN LCD ghosting & persistence simulation
  touchMatrixCalibrated: boolean;  // Discrete 13x10 single-touch resistive matrix lock
  dualCartridgeSlotFix: boolean;   // Hardware P3 dual cartridge slot chip-select isolation
}

export type FastBootTarget =
  | 'NONE'
  | 'MAIN_MENU'
  | 'CART_1'
  | 'CART_2'
  | 'HIGH_SCORE'
  | 'PHONE_BOOK'
  | 'KEEP_CLEAR_PROMPT';

export class GameComSystem {
  public lcd: LCDSubsystem;
  public sound: SoundEngine;
  public bios: BiosSubsystem;
  public cpu: SM8521CPU;
  public highScores: NvramHighScoreManager;
  public phoneBook: NvramPhoneBookManager;
  public linkCable: CompeteComLinkManager;
  public retroAchievements: RetroAchievementsEngine;
  public onlineLeaderboard: OnlineLeaderboardManager;
  public onHardcoreViolation?: (reason: string) => void;
  public onScoreRecorded?: (entry: any) => void;

  // Dual cartridge slots
  public slot1: CartridgeInfo | null = null;
  public slot2: CartridgeInfo | null = null;
  public activeSlot: 1 | 2 = 1;

  // Recently played ROMs list
  public recentGames: RecentGameEntry[] = [];
  private loadedCartridgeCache: Map<string, CartridgeInfo> = new Map();

  // System states
  public isPoweredOn: boolean = true;
  public isPaused: boolean = false;
  public activeApp: 'OS' | 'CARTRIDGE' = 'OS';
  public bootFrameCounter: number = 0;
  public fastBootTarget: FastBootTarget = 'NONE';
  private nvramDirtyFrames: number = 0;
  private phoneBookDirtyFrames: number = 0;

  // Single-touch discrete lock (strictly 1 touch input per pointer press)
  private touchLockedUntilRelease: boolean = false;
  private stylusPulseFrames: number = 0;

  // Input states
  public buttons: GameComButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    c: false,
    d: false,
    menu: false,
    pause: false,
    sound: false,
    power: false,
    reset: false
  };

  public touch: TouchPoint = {
    x: 0,
    y: 0,
    isDown: false
  };

  // DS-Style Virtual Stylus (Keyboard & Gamepad/Controller control)
  public virtualStylus: VirtualStylusState = {
    x: 100,
    y: 80,
    isDown: false,
    visible: false,
    dpadStylusMode: false,
    snapToGrid: false
  };

  // Accuracy Fixes Toggle state
  public accuracyFixes: EmulationAccuracyFixes = {
    correctClockSpeed: true,
    preventBankWrapCrash: true,
    timerInterruptFix: true,
    stnGhostingAccurate: true,
    touchMatrixCalibrated: true,
    dualCartridgeSlotFix: true
  };

  // Settings
  public settings: EmulatorSettings = {
    palette: 'original',
    twoShadeColors: [DEFAULT_LIGHT_SHADE, DEFAULT_DARK_SHADE],
    customPaletteColors: blendTwoShades(DEFAULT_LIGHT_SHADE, DEFAULT_DARK_SHADE),
    ghosting: 0.42,
    ghostingPersistence: 0.65,
    pixelGrid: true,
    showTouchGrid: false,
    touchGridOpacity: 0.0,
    viewMode:
      typeof window !== 'undefined' && (window as any).gamecomDesktop?.defaultScreenOnly
        ? 'screen-only'
        : 'console',
    screenScale: 3,
    contrast: 1.0,
    volume: 0.2,
    muted: false,
    speed: 1.0,
    showFps: true,
    smoothMode: false,
    stylusCursor: false,
    backgroundInput: true,
    stylusSpeed: 2.5,
    gamepadIndex: -1,
    gamepadDeadzone: 0.15
  };

  // Timing
  public fps: number = 60;
  private frameCount: number = 0;
  private fpsTimer: number = performance.now();

  constructor() {
    this.lcd = new LCDSubsystem();
    this.sound = new SoundEngine();
    this.cpu = new SM8521CPU();
    this.highScores = new NvramHighScoreManager();
    this.phoneBook = new NvramPhoneBookManager();
    this.linkCable = new CompeteComLinkManager(this.cpu);
    this.retroAchievements = new RetroAchievementsEngine();
    this.onlineLeaderboard = new OnlineLeaderboardManager();

    // Wire competitive Hardcore & Online Leaderboard attestation into NVRAM High Score Manager
    this.highScores.attachCompetitiveEngines(
      this.retroAchievements,
      this.onlineLeaderboard,
      (entry) => this.onScoreRecorded?.(entry)
    );

    // Wire hardware sound generator, 8-bit SGDA ($004E) DAC streamer, & BIOS digitized waveform callbacks
    this.cpu.onSoundRegWrite = (audioState) => {
      this.sound.updateFromHardwareRegisters(audioState);
    };
    this.cpu.onDacStreamStart = () => {
      const isSkippingGlobeForCart =
        (this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2') &&
        this.bootFrameCounter >= 480;
      this.sound.onDacStreamStart(isSkippingGlobeForCart);
    };
    this.cpu.onDacSample = (val, sampleRate) => {
      if (
        (this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2') &&
        this.bootFrameCounter < 495
      ) {
        return;
      }
      this.sound.pushDacSample(val, sampleRate);
    };
    this.cpu.onBiosAudioClip = (samples, bank, addr) => {
      this.sound.playBiosAudioClip(samples, bank, addr);
    };

    // Wire real-time NVRAM write observer ($E000-$FFFF)
    this.cpu.onNvramWrite = (addr) => {
      if (addr >= 0xfc60 && addr <= 0xfee5) {
        this.nvramDirtyFrames = 15;
      } else if (addr >= 0xe000 && addr <= 0xf3ff) {
        this.phoneBookDirtyFrames = 15;
      }
    };

    // Initialize official BIOS and sync to SM8521 when full 256KB external.bin finishes loading
    this.bios = new BiosSubsystem(() => {
      this.syncBiosToMemory();
      this.resetSystem('MAIN_MENU');
    });

    this.syncBiosToMemory();
    this.highScores.initializeNvramSignatures(this.cpu.nvram);
    if (this.phoneBook.getTotalEntriesCount() === 0) {
      this.phoneBook.syncFromNvram(this.cpu.nvram);
    }
    this.phoneBook.syncBankToNvram(this.cpu.nvram, this.phoneBook.activeBank);
    this.highScores.saveRawNvram(this.cpu.nvram);

    // Preload Slot 1 (Lights Out); Slot 2 remains empty until the user loads a cartridge
    this.slot1 = PRELOADED_CARTRIDGES[0] || null;
    this.slot2 = null;
    for (const c of PRELOADED_CARTRIDGES) {
      this.loadedCartridgeCache.set(c.id, c);
    }
    this.loadRecentGamesFromStorage();
    this.loadDisplaySettingsFromStorage();
    this.loadPreloadedCartridges();

    this.resetSystem('MAIN_MENU');
  }

  public getActiveCartridge(): CartridgeInfo | null {
    return this.activeSlot === 1 ? this.slot1 : this.slot2;
  }

  /**
   * Toggles Competitive / RetroAchievements Hardcore Mode.
   * When enabled:
   * - Forces 1.0x+ native speed (disables 0.5x slowdown)
   * - Locks calibrated 4.9152 MHz clock timing
   * - Disables loading Save States (F8) and CPU debugger stepping
   * - Performs a clean cold hardware reset so the session starts untainted from frame 0
   */
  public toggleHardcoreMode(enabled?: boolean): boolean {
    const nextState =
      enabled !== undefined ? enabled : !this.retroAchievements.config.hardcoreMode;
    this.retroAchievements.config.hardcoreMode = nextState;
    this.retroAchievements.saveConfig();
    if (nextState) {
      if (this.settings.speed < 1.0) {
        this.settings.speed = 1.0;
      }
      this.accuracyFixes.correctClockSpeed = true;
      const bootTarget: FastBootTarget =
        this.activeApp === 'CARTRIDGE'
          ? this.activeSlot === 1
            ? 'CART_1'
            : 'CART_2'
          : 'MAIN_MENU';
      this.resetSystem(bootTarget);
    } else {
      this.retroAchievements.session.hardcoreActive = false;
    }
    return nextState;
  }

  public setClockSpeed(spd: number): boolean {
    if (this.retroAchievements.config.hardcoreMode && spd < 1.0) {
      this.onHardcoreViolation?.(
        'Hardcore Mode prohibits sub-1.0x slowdown. Disable Hardcore Mode to use 0.5x speed.'
      );
      return false;
    }
    this.settings.speed = spd;
    if (spd < 1.0) {
      this.retroAchievements.taintSession('slowdown');
    }
    return true;
  }

  private loadDisplaySettingsFromStorage() {
    try {
      const rawShades = localStorage.getItem(TWO_SHADE_STORAGE_KEY);
      if (rawShades) {
        const parsed = JSON.parse(rawShades);
        if (
          parsed &&
          Array.isArray(parsed.twoShadeColors) &&
          parsed.twoShadeColors.length === 2 &&
          typeof parsed.twoShadeColors[0] === 'string' &&
          typeof parsed.twoShadeColors[1] === 'string'
        ) {
          this.settings.twoShadeColors = [parsed.twoShadeColors[0], parsed.twoShadeColors[1]];
          this.settings.customPaletteColors = blendTwoShades(
            parsed.twoShadeColors[0],
            parsed.twoShadeColors[1]
          );
          if (parsed.activePalette && parsed.activePalette in PALETTES) {
            this.settings.palette = parsed.activePalette as LCDPaletteId;
          }
          this.lcd.setCustomColors(this.settings.customPaletteColors);
          this.lcd.paletteId = this.settings.palette;
        }
      }

      const rawGhosting = localStorage.getItem(GHOSTING_SETTINGS_STORAGE_KEY);
      if (rawGhosting) {
        const parsedG = JSON.parse(rawGhosting);
        if (typeof parsedG.ghosting === 'number') {
          this.settings.ghosting = Math.max(0, Math.min(0.9, parsedG.ghosting));
        }
        if (typeof parsedG.ghostingPersistence === 'number') {
          this.settings.ghostingPersistence = Math.max(0, Math.min(0.95, parsedG.ghostingPersistence));
        }
        if (typeof parsedG.stnGhostingAccurate === 'boolean') {
          this.accuracyFixes.stnGhostingAccurate = parsedG.stnGhostingAccurate;
        }
      }

      const rawInput = localStorage.getItem(INPUT_SETTINGS_STORAGE_KEY);
      if (rawInput) {
        const parsedI = JSON.parse(rawInput);
        if (typeof parsedI.backgroundInput === 'boolean') {
          this.settings.backgroundInput = parsedI.backgroundInput;
        }
        if (typeof parsedI.stylusSpeed === 'number') {
          this.settings.stylusSpeed = Math.max(0.5, Math.min(8.0, parsedI.stylusSpeed));
        }
        if (typeof parsedI.gamepadIndex === 'number') {
          this.settings.gamepadIndex = parsedI.gamepadIndex;
        }
        if (typeof parsedI.gamepadDeadzone === 'number') {
          this.settings.gamepadDeadzone = Math.max(0.05, Math.min(0.5, parsedI.gamepadDeadzone));
        }
        if (typeof parsedI.snapToGrid === 'boolean') {
          this.virtualStylus.snapToGrid = parsedI.snapToGrid;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  public saveInputSettingsToStorage() {
    try {
      localStorage.setItem(
        INPUT_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          backgroundInput: this.settings.backgroundInput,
          stylusSpeed: this.settings.stylusSpeed,
          gamepadIndex: this.settings.gamepadIndex,
          gamepadDeadzone: this.settings.gamepadDeadzone,
          snapToGrid: this.virtualStylus.snapToGrid
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  public saveDisplaySettingsToStorage() {
    try {
      localStorage.setItem(
        TWO_SHADE_STORAGE_KEY,
        JSON.stringify({
          twoShadeColors: this.settings.twoShadeColors,
          activePalette: this.settings.palette
        })
      );
      localStorage.setItem(
        GHOSTING_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          ghosting: this.settings.ghosting,
          ghostingPersistence: this.settings.ghostingPersistence,
          stnGhostingAccurate: this.accuracyFixes.stnGhostingAccurate
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Applies an official Game.Com hardware screen preset (1997 Original STN,
   * 1999 Pocket Pro EL Backlit, Late 1999 Pocket Pro FSTN, Pocket Warm, or Transflective)
   * and synchronizes the passive-matrix response time & endpoint shades.
   */
  public applyScreenPreset(paletteId: LCDPaletteId, syncHardwareResponse: boolean = true) {
    const preset = PALETTES[paletteId] || PALETTES.original;
    this.settings.palette = paletteId;
    if (paletteId !== 'custom') {
      this.settings.twoShadeColors = [preset.colors[0], preset.colors[3]];
      this.settings.customPaletteColors = [...preset.colors];
      this.lcd.setCustomColors(this.settings.customPaletteColors);
    }
    this.lcd.paletteId = paletteId;
    if (syncHardwareResponse) {
      this.settings.ghosting = preset.defaultGhosting;
      this.settings.ghostingPersistence = preset.defaultPersistence;
      this.lcd.ghosting = this.accuracyFixes.stnGhostingAccurate ? this.settings.ghosting : 0;
      this.lcd.ghostingPersistence = this.accuracyFixes.stnGhostingAccurate
        ? this.settings.ghostingPersistence
        : 0;
    }
    this.saveDisplaySettingsToStorage();
  }

  /**
   * Blends the user's two chosen shades (Light/Background Shade 0 and Dark/Foreground Shade 3)
   * into the 4 hardware 2-bpp shades and applies them live.
   */
  public setTwoShadeBlend(lightHex: string, darkHex: string) {
    const isDefault =
      lightHex.toLowerCase() === DEFAULT_LIGHT_SHADE &&
      darkHex.toLowerCase() === DEFAULT_DARK_SHADE;
    this.settings.twoShadeColors = [lightHex, darkHex];
    this.settings.customPaletteColors = blendTwoShades(lightHex, darkHex);
    this.settings.palette = isDefault ? 'original' : 'custom';
    this.lcd.setCustomColors(this.settings.customPaletteColors);
    this.lcd.paletteId = this.settings.palette;
    this.saveDisplaySettingsToStorage();
  }

  public swapTwoShades() {
    const [light, dark] = this.settings.twoShadeColors;
    this.setTwoShadeBlend(dark, light);
  }

  public resetTwoShadesToDefault() {
    this.applyScreenPreset('original', true);
  }

  public setGhostingParameters(intensity: number, persistence: number) {
    this.settings.ghosting = Math.max(0, Math.min(0.9, intensity));
    this.settings.ghostingPersistence = Math.max(0, Math.min(0.95, persistence));
    this.lcd.ghosting = this.accuracyFixes.stnGhostingAccurate ? this.settings.ghosting : 0;
    this.lcd.ghostingPersistence = this.accuracyFixes.stnGhostingAccurate
      ? this.settings.ghostingPersistence
      : 0;
    this.saveDisplaySettingsToStorage();
  }

  private loadRecentGamesFromStorage() {
    try {
      const raw = localStorage.getItem(RECENT_GAMES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.recentGames = parsed.filter(
            (g: any) =>
              g &&
              g.id !== 'sonic_jam' &&
              !String(g.title || '').toLowerCase().includes('sonic jam')
          );
          if (this.recentGames.length > 0) {
            return;
          }
        }
      }
    } catch {
      // Ignore storage error
    }
    this.recentGames = PRELOADED_CARTRIDGES.map((c, idx) => ({
      id: c.id,
      title: c.title,
      publisher: c.publisher,
      year: c.year,
      slot: (idx === 0 ? 1 : 2) as 1 | 2,
      lastPlayedAt: Date.now() - idx * 60000,
      playCount: 1,
      sizeBytes: c.sizeBytes,
      isPreloaded: true
    }));
  }

  private saveRecentGamesToStorage() {
    try {
      localStorage.setItem(RECENT_GAMES_STORAGE_KEY, JSON.stringify(this.recentGames.slice(0, 15)));
    } catch {
      // Ignore storage error
    }
  }

  public recordRecentGame(cart: CartridgeInfo, slot: 1 | 2) {
    this.loadedCartridgeCache.set(cart.id, cart);
    const existingIdx = this.recentGames.findIndex(
      (g) => g.id === cart.id || g.title.toLowerCase() === cart.title.toLowerCase()
    );
    const prevCount = existingIdx >= 0 ? this.recentGames[existingIdx].playCount : 0;
    const entry: RecentGameEntry = {
      id: cart.id,
      title: cart.title,
      publisher: cart.publisher,
      year: cart.year,
      slot,
      lastPlayedAt: Date.now(),
      playCount: prevCount + 1,
      sizeBytes: cart.sizeBytes,
      isPreloaded: PRELOADED_CARTRIDGES.some((p) => p.id === cart.id)
    };
    const filtered = this.recentGames.filter((_, idx) => idx !== existingIdx);
    this.recentGames = [entry, ...filtered].slice(0, 15);
    this.saveRecentGamesToStorage();
  }

  public clearRecentGames() {
    this.recentGames = [];
    this.saveRecentGamesToStorage();
  }

  public async launchRecentGame(entry: RecentGameEntry, targetSlot?: 1 | 2): Promise<boolean> {
    const slot = targetSlot || entry.slot || 1;
    const cached =
      this.loadedCartridgeCache.get(entry.id) ||
      PRELOADED_CARTRIDGES.find((p) => p.id === entry.id || p.title === entry.title);
    if (!cached) {
      return false;
    }
    await this.insertCartridge(cached, slot, true);
    return true;
  }

  private async loadPreloadedCartridges() {
    for (const cart of PRELOADED_CARTRIDGES) {
      if (cart.romUrl && !cart.romData) {
        try {
          const res = await fetch(cart.romUrl);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            cart.romData = new Uint8Array(buf);
            if (this.slot1?.id === cart.id && this.fastBootTarget !== 'CART_2') {
              this.cpu.loadCartridgeROM(cart.romData, 1);
            }
            if (this.slot2?.id === cart.id && this.fastBootTarget !== 'CART_1') {
              this.cpu.loadCartridgeROM(cart.romData, 2);
            }
          }
        } catch {
          // Ignore network errors
        }
      }
    }
  }

  private syncBothCartridgeSlotsToCpu() {
    this.cpu.loadCartridgeROM(this.slot1?.romData || null, 1);
    this.cpu.loadCartridgeROM(this.slot2?.romData || null, 2);
  }

  public powerToggle() {
    this.isPoweredOn = !this.isPoweredOn;
    if (this.isPoweredOn) {
      this.resetSystem('NONE');
    } else {
      this.sound.clearScheduledDacStream();
      this.highScores.syncFromNvram(this.cpu.nvram);
      this.phoneBook.syncFromNvram(this.cpu.nvram);
    }
  }

  /**
   * Resets the SM8521 CPU to vector $1020 while preserving battery-backed NVRAM ($E000-$FFFF)
   * and syncing the internal date/time to the user's device clock.
   *
   * When fast-booting `CART_1` or `CART_2`, we mount ONLY the target slot during the BIOS
   * cartridge probe so the BIOS unconditionally boots the target slot's ROM without ever
   * falling through to the secondary slot, then re-attach both slots once booted.
   */
  public resetSystem(target: FastBootTarget = 'NONE') {
    this.sound.clearScheduledDacStream();
    this.syncBiosToMemory();

    if (target === 'CART_1') {
      this.cpu.loadCartridgeROM(this.slot1?.romData || null, 1);
      this.cpu.loadCartridgeROM(null, 2);
    } else if (target === 'CART_2') {
      this.cpu.loadCartridgeROM(null, 1);
      this.cpu.loadCartridgeROM(this.slot2?.romData || null, 2);
    } else {
      this.syncBothCartridgeSlotsToCpu();
    }

    this.highScores.initializeNvramSignatures(this.cpu.nvram);
    this.phoneBook.syncBankToNvram(this.cpu.nvram, this.phoneBook.activeBank);
    this.highScores.saveRawNvram(this.cpu.nvram);
    this.cpu.reset();
    this.cpu.syncDeviceDateTime();
    this.cpu.allowDataFoundPrompt = target === 'KEEP_CLEAR_PROMPT';
    this.bootFrameCounter = 0;
    this.fastBootTarget = target;
    this.activeApp = 'OS';
    this.touchLockedUntilRelease = false;
    this.stylusPulseFrames = 0;

    // Start a fresh, untainted cryptographic session on cold hardware reset
    const targetCart =
      target === 'CART_1'
        ? this.slot1
        : target === 'CART_2'
          ? this.slot2
          : this.getActiveCartridge();
    this.retroAchievements.createCleanSession(targetCart);
  }

  public promptKeepClearData() {
    this.resetSystem('KEEP_CLEAR_PROMPT');
  }

  public syncBiosToMemory() {
    this.cpu.loadInternalBIOS(this.bios.internalRom);
    this.cpu.loadExternalBIOS(this.bios.externalRom);
  }

  public openBiosHighScoreScreen() {
    this.highScores.syncBankToNvram(this.cpu.nvram, this.highScores.activeBank);
    if (this.bootFrameCounter >= 480 && this.cpu.mmu[1] === 2 && this.cpu.m_p_ram[0x168] === 0) {
      this.triggerSingleStylusTap(100, 120, 12);
    } else {
      this.resetSystem('HIGH_SCORE');
    }
  }

  public openBiosPhoneBookScreen() {
    this.phoneBook.syncBankToNvram(this.cpu.nvram, this.phoneBook.activeBank);
    this.highScores.saveRawNvram(this.cpu.nvram);
    if (this.bootFrameCounter >= 480 && this.cpu.mmu[1] === 2 && this.cpu.m_p_ram[0x168] === 0) {
      this.triggerSingleStylusTap(100, 35, 12);
    } else {
      this.resetSystem('PHONE_BOOK');
    }
  }

  /**
   * If the user is currently inside the BIOS Phone Book ($0168 == 1, MMU2 == 1),
   * fast-boots back into PHONE_BOOK so the BIOS immediately re-reads and redraws $E000-$F3FB.
   */
  public refreshBiosPhoneBookIfOpen() {
    this.highScores.saveRawNvram(this.cpu.nvram);
    if (
      this.isPoweredOn &&
      this.cpu.mmu[1] === 2 &&
      this.cpu.mmu[2] === 1 &&
      this.cpu.m_p_ram[0x0168] === 1
    ) {
      this.resetSystem('PHONE_BOOK');
    }
  }

  public async loadBiosFile(file: File): Promise<string> {
    const res = await this.bios.loadBiosFile(file);
    this.syncBiosToMemory();
    this.resetSystem('NONE');
    return res;
  }

  public pauseToggle() {
    this.isPaused = !this.isPaused;
  }

  public soundToggle() {
    this.settings.muted = !this.settings.muted;
    this.sound.setMuted(this.settings.muted);
  }

  public async insertCartridge(cart: CartridgeInfo, slot: 1 | 2 = 1, autoBoot: boolean = true) {
    if (cart.romUrl && !cart.romData) {
      try {
        const res = await fetch(cart.romUrl);
        if (res.ok) {
          cart.romData = new Uint8Array(await res.arrayBuffer());
        }
      } catch {
        // Ignore fetch error
      }
    }

    if (slot === 1) {
      this.slot1 = cart;
      this.cpu.loadCartridgeROM(cart.romData || null, 1);
    } else {
      this.slot2 = cart;
      this.cpu.loadCartridgeROM(cart.romData || null, 2);
    }

    if (cart.romData) {
      this.highScores.ensureBankForCartridge(cart.romData, this.cpu.nvram);
    }

    this.activeSlot = slot;
    this.recordRecentGame(cart, slot);

    if (autoBoot) {
      this.launchCartridge(slot);
    }
  }

  public ejectCartridge(slot: 1 | 2) {
    if (slot === 1) {
      this.slot1 = null;
      this.cpu.loadCartridgeROM(null, 1);
    } else {
      this.slot2 = null;
      this.cpu.loadCartridgeROM(null, 2);
    }
    this.resetSystem('MAIN_MENU');
  }

  public async loadRomFromFile(file: File, slot: 1 | 2 = 1): Promise<CartridgeInfo> {
    const cart = await loadCartridgeFromFile(file);
    await this.insertCartridge(cart, slot, true);
    return cart;
  }

  public launchCartridge(slot: 1 | 2) {
    const cart = slot === 1 ? this.slot1 : this.slot2;
    if (!cart) return;

    this.activeSlot = slot;
    this.recordRecentGame(cart, slot);

    if (cart.romData) {
      this.cpu.loadCartridgeROM(cart.romData, slot);
      this.highScores.ensureBankForCartridge(cart.romData, this.cpu.nvram);
    }

    this.activeApp = 'CARTRIDGE';
    this.resetSystem(slot === 1 ? 'CART_1' : 'CART_2');
  }

  /**
   * Executes one frame of the SM8521 CPU & scanline engine, including fast-boot sequencing
   */
  private stepHardwareFrame(speedMult: number) {
    this.bootFrameCounter++;
    const f = this.bootFrameCounter;

    if (this.fastBootTarget !== 'NONE') {
      const appId = this.cpu.m_p_ram[0x0168];

      if (f >= 445 && f <= 460) {
        // Tap "TOUCH SCREEN TO CONTINUE" after 3D Globe finishes
        this.cpu.stylusPressed = true;
        this.cpu.stylusX = 100;
        this.cpu.stylusY = 80;
      } else if (this.fastBootTarget === 'KEEP_CLEAR_PROMPT') {
        this.cpu.stylusPressed = false;
        if (f >= 480 || (this.cpu.mmu[2] === 3 && this.cpu.m_PC >= 0x5e40 && this.cpu.m_PC <= 0x5e65)) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'MAIN_MENU') {
        this.cpu.stylusPressed = false;
        if (f >= 495 && appId === 0) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'HIGH_SCORE') {
        if (f >= 500 && f <= 512) {
          this.cpu.stylusPressed = true;
          this.cpu.stylusX = 100;
          this.cpu.stylusY = 120;
        } else {
          this.cpu.stylusPressed = false;
        }
        if (f >= 545) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'PHONE_BOOK') {
        if (f >= 500 && f <= 512) {
          // Tap PHONE BOOK icon on BIOS Main Menu (top-center column)
          this.cpu.stylusPressed = true;
          this.cpu.stylusX = 100;
          this.cpu.stylusY = 35;
        } else {
          this.cpu.stylusPressed = false;
        }
        if (f >= 550) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2') {
        if (f >= 500 && f <= 512) {
          // Tap CARTRIDGE icon on BIOS Main Menu
          this.cpu.stylusPressed = true;
          this.cpu.stylusX = 35;
          this.cpu.stylusY = 35;
        } else if (
          f >= 545 &&
          f <= 560 &&
          (this.cpu.m_p_ram[0x017c] & 0x03) === 0x03
        ) {
          // If both slots are active in the BIOS dual-slot menu ($017C & 0x03 == 0x03),
          // tap Left Box (50, 70) for Slot 1 or Right Box (150, 70) for Slot 2
          this.cpu.stylusPressed = true;
          this.cpu.stylusX = this.fastBootTarget === 'CART_1' ? 50 : 150;
          this.cpu.stylusY = 70;
        } else {
          this.cpu.stylusPressed = false;
        }

        // Finish fast-boot once cartridge starts executing or after cartridge load animation completes
        if ((this.cpu.mmu[1] >= 0x20 || this.cpu.mmu[2] >= 0x20) || f >= 820) {
          this.cpu.stylusPressed = false;
          this.fastBootTarget = 'NONE';
          this.activeApp = 'CARTRIDGE';
          // Re-attach both cartridge slots now that the target cartridge has booted
          this.syncBothCartridgeSlotsToCpu();
        }
      } else {
        this.cpu.stylusPressed = false;
      }
    } else {
      // Normal interactive input: sync physical buttons and single-touch / held stylus
      this.cpu.buttonsState = { ...this.buttons };

      if (this.stylusPulseFrames > 0 || this.virtualStylus.isDown) {
        this.cpu.stylusPressed = true;
        this.cpu.stylusX = Math.floor(
          this.virtualStylus.isDown ? this.virtualStylus.x : this.touch.x
        );
        this.cpu.stylusY = Math.floor(
          this.virtualStylus.isDown ? this.virtualStylus.y : this.touch.y
        );
        if (this.stylusPulseFrames > 0) {
          this.stylusPulseFrames--;
        }
        if (this.stylusPulseFrames === 0 && !this.touch.isDown && !this.virtualStylus.isDown) {
          this.cpu.stylusPressed = false;
        }
      } else {
        this.cpu.stylusPressed = false;
      }
    }

    if (speedMult < 1.0) {
      this.retroAchievements.taintSession('slowdown');
    }

    this.cpu.runFrame(speedMult);
    this.sound.endFrameDacCheck();

    if (this.cpu.mmu[1] >= 0x20 || this.cpu.mmu[2] >= 0x20) {
      this.activeApp = 'CARTRIDGE';
    } else {
      this.activeApp = 'OS';
    }

    // Evaluate RetroAchievements rcheevos conditions & leaderboards for the current frame
    this.retroAchievements.stepFrame(
      this.cpu,
      this.getActiveCartridge(),
      this.highScores.getActiveProfile().name
    );
  }

  /**
   * Main Frame Tick (called at 60Hz by LCDScreen requestAnimationFrame)
   */
  public tick() {
    if (!this.isPoweredOn) {
      this.lcd.clear(0);
      return;
    }

    // Sync LCD & CPU accuracy settings (even when paused so palette/color/ghosting edits reflect live)
    this.lcd.paletteId = this.settings.palette;
    this.lcd.setCustomColors(this.settings.customPaletteColors);
    this.lcd.ghosting = this.accuracyFixes.stnGhostingAccurate ? this.settings.ghosting : 0.0;
    this.lcd.ghostingPersistence = this.accuracyFixes.stnGhostingAccurate
      ? this.settings.ghostingPersistence
      : 0.0;
    this.lcd.contrast = this.settings.contrast;
    this.lcd.pixelGrid = this.settings.pixelGrid;
    this.cpu.correctClockSpeed = this.accuracyFixes.correctClockSpeed;
    this.cpu.dualCartridgeSlotFix = this.accuracyFixes.dualCartridgeSlotFix;

    if (this.isPaused) {
      return;
    }

    const baseMult = 1.0 * this.settings.speed;

    if (this.fastBootTarget !== 'NONE') {
      const burstFrames = 28;
      for (let i = 0; i < burstFrames; i++) {
        this.stepHardwareFrame(1.8);
        if ((this.fastBootTarget as FastBootTarget) === 'NONE') break;
      }
    } else {
      this.stepHardwareFrame(baseMult);
    }

    this.lcd.currentBuffer.set(this.cpu.displayBuffer);

    if (this.nvramDirtyFrames > 0) {
      this.nvramDirtyFrames--;
      if (this.nvramDirtyFrames === 0) {
        this.highScores.syncFromNvram(this.cpu.nvram);
      }
    }

    if (this.phoneBookDirtyFrames > 0) {
      this.phoneBookDirtyFrames--;
      if (this.phoneBookDirtyFrames === 0) {
        this.phoneBook.syncFromNvram(this.cpu.nvram);
        this.highScores.saveRawNvram(this.cpu.nvram);
      }
    }

    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsTimer >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = now;
    }
  }

  public renderToCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    if (!this.isPoweredOn) {
      ctx.fillStyle = '#1c1f18';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    this.lcd.renderToCanvas(canvas, ctx);
  }

  public triggerSingleStylusTap(x: number, y: number, frames: number = 8) {
    if (!this.isPoweredOn) return;
    this.touch.x = Math.max(0, Math.min(SCREEN_WIDTH - 1, Math.floor(x)));
    this.touch.y = Math.max(0, Math.min(SCREEN_HEIGHT - 1, Math.floor(y)));
    this.touch.isDown = true;
    this.stylusPulseFrames = frames;
    this.retroAchievements.recordHardwareInput((this.touch.x << 8) | this.touch.y);
  }

  public handlePointerDown(normX: number, normY: number) {
    if (!this.isPoweredOn) return;
    if (this.touchLockedUntilRelease) return;

    const px = Math.max(0, Math.min(SCREEN_WIDTH - 1, Math.floor(normX * SCREEN_WIDTH)));
    const py = Math.max(0, Math.min(SCREEN_HEIGHT - 1, Math.floor(normY * SCREEN_HEIGHT)));

    this.touch.x = px;
    this.touch.y = py;
    this.touch.isDown = true;
    this.virtualStylus.x = px;
    this.virtualStylus.y = py;
    this.touchLockedUntilRelease = true;
    this.stylusPulseFrames = 8;
    this.retroAchievements.recordHardwareInput((px << 8) | py);
  }

  /**
   * Moves the DS-style virtual stylus cursor across the 200x160 LCD screen
   * via Keyboard (IJKL / Numpad / D-Pad Stylus Mode) or Gamepad Analog Stick.
   */
  public moveVirtualStylus(dx: number, dy: number) {
    if (!this.isPoweredOn) return;
    if (dx === 0 && dy === 0) return;

    this.virtualStylus.visible = true;
    this.virtualStylus.x = Math.max(0, Math.min(SCREEN_WIDTH - 1, this.virtualStylus.x + dx));
    this.virtualStylus.y = Math.max(0, Math.min(SCREEN_HEIGHT - 1, this.virtualStylus.y + dy));

    if (this.virtualStylus.isDown) {
      this.touch.x = Math.floor(this.virtualStylus.x);
      this.touch.y = Math.floor(this.virtualStylus.y);
    }
  }

  /**
   * Steps the virtual stylus by discrete 13x10 touch grid cells (for Snap-to-Grid mode).
   */
  public stepVirtualStylusGridCell(dCol: number, dRow: number) {
    if (!this.isPoweredOn) return;
    this.virtualStylus.visible = true;
    const cellW = SCREEN_WIDTH / 13;
    const cellH = SCREEN_HEIGHT / 10;
    const curCol = Math.min(12, Math.max(0, Math.floor(this.virtualStylus.x / cellW)));
    const curRow = Math.min(9, Math.max(0, Math.floor(this.virtualStylus.y / cellH)));
    const nextCol = Math.min(12, Math.max(0, curCol + dCol));
    const nextRow = Math.min(9, Math.max(0, curRow + dRow));
    this.virtualStylus.x = Math.round((nextCol + 0.5) * cellW);
    this.virtualStylus.y = Math.round((nextRow + 0.5) * cellH);

    if (this.virtualStylus.isDown) {
      this.touch.x = Math.floor(this.virtualStylus.x);
      this.touch.y = Math.floor(this.virtualStylus.y);
    }
  }

  /**
   * Presses or releases the virtual stylus tip against the resistive touchscreen
   * at the current virtualStylus coordinates (DS emulation style).
   */
  public setVirtualStylusTouch(isDown: boolean) {
    if (!this.isPoweredOn) return;
    this.virtualStylus.visible = true;

    if (isDown && !this.virtualStylus.isDown) {
      const px = Math.max(0, Math.min(SCREEN_WIDTH - 1, Math.floor(this.virtualStylus.x)));
      const py = Math.max(0, Math.min(SCREEN_HEIGHT - 1, Math.floor(this.virtualStylus.y)));
      this.virtualStylus.isDown = true;
      this.touch.x = px;
      this.touch.y = py;
      this.touch.isDown = true;
      this.stylusPulseFrames = Math.max(this.stylusPulseFrames, 8);
      this.retroAchievements.recordHardwareInput((px << 8) | py);
    } else if (!isDown && this.virtualStylus.isDown) {
      this.virtualStylus.isDown = false;
      this.touch.isDown = false;
      this.touchLockedUntilRelease = false;
    }
  }

  public toggleDpadStylusMode(): boolean {
    this.virtualStylus.dpadStylusMode = !this.virtualStylus.dpadStylusMode;
    if (this.virtualStylus.dpadStylusMode) {
      this.virtualStylus.visible = true;
      // Release any held D-Pad directional inputs when switching D-Pad to Stylus control
      this.buttons.up = false;
      this.buttons.down = false;
      this.buttons.left = false;
      this.buttons.right = false;
    }
    return this.virtualStylus.dpadStylusMode;
  }

  public handlePointerMove(_normX: number, _normY: number) {
    // Discrete matrix touch: pointer drag does not fire extra touch events
  }

  public handlePointerUp() {
    this.touch.isDown = false;
    this.touchLockedUntilRelease = false;
  }

  public setButton(btn: keyof GameComButtons, isDown: boolean) {
    this.buttons[btn] = isDown;
    if (isDown) {
      const btnCode = btn.charCodeAt(0) | ((btn.charCodeAt(1) || 0) << 8);
      this.retroAchievements.recordHardwareInput(btnCode);
    }
  }

  public setTouch(x: number, y: number, isDown: boolean) {
    if (isDown) {
      this.handlePointerDown(x / SCREEN_WIDTH, y / SCREEN_HEIGHT);
    } else {
      this.handlePointerUp();
    }
  }

  public getCPURegisters(): CPURegisters {
    return this.cpu.getRegisters();
  }

  public saveState(slotIndex: number = 0) {
    this.highScores.syncFromNvram(this.cpu.nvram);
    this.phoneBook.syncFromNvram(this.cpu.nvram);
    const stateData = {
      timestamp: Date.now(),
      slotIndex,
      pc: this.cpu.m_PC,
      sp: this.cpu.m_SP,
      ps0: this.cpu.m_PS0,
      ps1: this.cpu.m_PS1,
      sys: this.cpu.m_SYS,
      ie0: this.cpu.m_IE0,
      ie1: this.cpu.m_IE1,
      ir0: this.cpu.m_IR0,
      ir1: this.cpu.m_IR1,
      mmu: Array.from(this.cpu.mmu),
      regRam: Array.from(this.cpu.m_register_ram),
      internalRam: Array.from(this.cpu.m_p_ram),
      vram: Array.from(this.cpu.videoram),
      nvram: Array.from(this.cpu.nvram)
    };
    try {
      localStorage.setItem(`gamecom_hw_save_state_${slotIndex}`, JSON.stringify(stateData));
    } catch {
      // Ignore storage quota error
    }
  }

  public loadState(slotIndex: number = 0): boolean {
    if (this.retroAchievements.config.hardcoreMode) {
      this.onHardcoreViolation?.(
        'Save State loading is disabled in Competitive Hardcore Mode to guarantee score legitimacy.'
      );
      return false;
    }

    try {
      const raw = localStorage.getItem(`gamecom_hw_save_state_${slotIndex}`);
      if (!raw) return false;
      const stateData = JSON.parse(raw);
      if (!stateData || typeof stateData.pc !== 'number') return false;

      // Loading a save state taints the current session for Hardcore leaderboard attestation
      this.retroAchievements.taintSession('save_state');

      this.fastBootTarget = 'NONE';
      this.cpu.m_PC = stateData.pc;
      this.cpu.m_SP = stateData.sp;
      this.cpu.m_PS0 = stateData.ps0;
      this.cpu.m_PS1 = stateData.ps1;
      this.cpu.m_SYS = stateData.sys;
      this.cpu.m_IE0 = stateData.ie0;
      this.cpu.m_IE1 = stateData.ie1;
      this.cpu.m_IR0 = stateData.ir0;
      this.cpu.m_IR1 = stateData.ir1;
      if (Array.isArray(stateData.mmu)) this.cpu.mmu.set(stateData.mmu);
      if (Array.isArray(stateData.regRam)) this.cpu.m_register_ram.set(stateData.regRam);
      if (Array.isArray(stateData.internalRam)) this.cpu.m_p_ram.set(stateData.internalRam);
      if (Array.isArray(stateData.vram)) this.cpu.videoram.set(stateData.vram);
      if (Array.isArray(stateData.nvram)) {
        this.cpu.nvram.set(stateData.nvram);
        this.highScores.syncFromNvram(this.cpu.nvram);
        this.phoneBook.syncFromNvram(this.cpu.nvram);
      }
      return true;
    } catch {
      return false;
    }
  }
}
