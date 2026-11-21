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
import { TigerWebLinkManager } from './tigerWebLink';
import { VirtualModemManager } from './virtualModem';
import { RetroAchievementsEngine } from './retroAchievements';
import { OnlineLeaderboardManager } from './onlineLeaderboard';
import { resolveKnownGameByGameIdOrTitle, loadCartridgeFromBuffer } from './cartridge';
import { applyIpsPatch } from './ipsPatcher';
import {
  OnlineRomEntry,
  scanRomRepositoryUrl,
  deduplicateOnlineRomEntries,
  fetchOnlineRomBytes,
  loadPersistedRepositoryState,
  savePersistedRepositoryState
} from './romRepository';
import {
  GameComButtons,
  TouchPoint,
  VirtualStylusState,
  CartridgeInfo,
  EmulatorSettings,
  GameComConsoleModel,
  BezelZoomMode,
  CheatToggles,
  CPURegisters,
  RecentGameEntry,
  LCDPaletteId,
  PALETTES,
  DEFAULT_LIGHT_SHADE,
  DEFAULT_DARK_SHADE,
  blendTwoShades,
  InputActionId,
  InputBindingsConfig
} from './types';
import { PRELOADED_CARTRIDGES, loadCartridgeFromFile } from './cartridge';
import {
  ACTIVE_SAVE_SLOT_STORAGE_KEY,
  SaveStateActionResult,
  SaveStateSlotSummary,
  applySaveStateToCpu,
  buildSaveStatePayload,
  deleteSlotState,
  getSaveStateExportFilename,
  getSlot1Identity,
  listSlotSummaries,
  normalizeSlotIndex,
  parseAndValidateSaveState,
  readSlotState,
  verifySlot1IdentityMatch,
  writeSlotState
} from './saveStates';

export function createDefaultInputBindings(): InputBindingsConfig {
  return {
    keyboard: {
      dpadUp: ['ArrowUp', 'KeyW'],
      dpadDown: ['ArrowDown', 'KeyS'],
      dpadLeft: ['ArrowLeft', 'KeyA'],
      dpadRight: ['ArrowRight', 'KeyD'],
      buttonA: ['KeyZ', 'Enter'],
      buttonB: ['KeyX', 'ShiftLeft', 'ShiftRight'],
      buttonC: ['KeyC'],
      buttonD: ['KeyV', 'KeyU'],
      menu: ['KeyM', 'Backspace'],
      pause: ['KeyP'],
      sound: ['KeyO'],
      stylusUp: ['KeyI', 'Numpad8'],
      stylusDown: ['KeyK', 'Numpad5', 'Numpad2'],
      stylusLeft: ['KeyJ', 'Numpad4'],
      stylusRight: ['KeyL', 'Numpad6'],
      stylusTouch: ['Space', 'KeyE', 'Numpad0', 'NumpadEnter'],
      toggleStylusMode: ['Tab'],
      gamepadStylusShift: [],
      saveState: ['F5'],
      loadState: ['F8'],
      screenshot: ['F9', 'F12'],
      powerToggle: ['F10'],
      fullscreen: ['F11'],
      frameAdvance: ['KeyF'],
      rewind: ['BracketLeft'],
      reset: ['KeyR']
    },
    gamepad: {
      dpadUp: [12],
      dpadDown: [13],
      dpadLeft: [14],
      dpadRight: [15],
      buttonA: [0],
      buttonB: [1],
      buttonC: [2],
      buttonD: [3],
      sound: [4],
      menu: [8],
      pause: [9],
      toggleStylusMode: [10],
      gamepadStylusShift: [6],
      stylusTouch: [7, 5, 11]
    }
  };
}

const RECENT_GAMES_STORAGE_KEY = 'cub_spiele_recent_games_v2';
const TWO_SHADE_STORAGE_KEY = 'cub_spiele_two_shade_v2';
const GHOSTING_SETTINGS_STORAGE_KEY = 'cub_spiele_ghosting_v2';
const INPUT_SETTINGS_STORAGE_KEY = 'cub_spiele_input_settings_v1';
const VIEW_MODE_STORAGE_KEY = 'cub_spiele_view_mode_v3';
const VIEW_MODE_P2_STORAGE_KEY = 'cub_spiele_view_mode_v3_p2';
const LEGACY_V2_VIEW_MODE_STORAGE_KEY = 'cub_spiele_view_mode_v2';
const LEGACY_VIEW_MODE_STORAGE_KEY = 'cub_spiele_view_mode_v1';
const SCREEN_SYNC_CHANNEL_NAME = 'cub_spiele_screen_sync_v1';

export function getDefaultViewModeForPlatform(): 'screen-only' | 'touch' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'screen-only';
  }

  const desktopBridge = (window as any).gamecomDesktop;
  if (desktopBridge?.platform === 'android') {
    return 'touch';
  }
  if (desktopBridge?.platform === 'win32' || desktopBridge?.platform === 'darwin') {
    return 'screen-only';
  }

  const ua = navigator.userAgent || '';
  const uaData = (navigator as any).userAgentData;
  const uaMobile = uaData?.mobile === true;
  const uaPlatform = String(uaData?.platform || '');

  if (
    uaMobile ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua) ||
    /Android|iOS/i.test(uaPlatform)
  ) {
    return 'touch';
  }

  // iPadOS 13+ may report Macintosh UA while exposing multi-touch points
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) {
    return 'touch';
  }

  if (/Win|Mac|Macintosh|Windows/i.test(ua) || /Windows|macOS/i.test(uaPlatform)) {
    return 'screen-only';
  }

  if (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 1024) {
    return 'touch';
  }

  return 'screen-only';
}

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
  public webLink: TigerWebLinkManager;
  public virtualModem: VirtualModemManager;
  public retroAchievements: RetroAchievementsEngine;
  public onlineLeaderboard: OnlineLeaderboardManager;
  public onHardcoreViolation?: (reason: string) => void;
  public onScoreRecorded?: (entry: any, meta?: { scoreBroken: boolean }) => void;
  public onScreenSettingsSynced?: () => void;
  private screenSyncChannel: BroadcastChannel | null = null;

  // Dual cartridge slots
  public slot1: CartridgeInfo | null = null;
  public slot2: CartridgeInfo | null = null;
  public activeSlot: 1 | 2 = 1;

  // Recently played ROMs list & Online Repository Library
  public recentGames: RecentGameEntry[] = [];
  private loadedCartridgeCache: Map<string, CartridgeInfo> = new Map();
  public repositoryUrls: string[] = [];
  public onlineLibrary: OnlineRomEntry[] = [];
  public isScanningRepository: boolean = false;
  public loadingOnlineGameId: string | null = null;

  // System states
  public isPoweredOn: boolean = false;
  public isPaused: boolean = false;
  public activeApp: 'OS' | 'CARTRIDGE' = 'OS';
  public bootFrameCounter: number = 0;
  public fastBootTarget: FastBootTarget = 'NONE';
  private nvramDirtyFrames: number = 0;
  private phoneBookDirtyFrames: number = 0;
  private biosOnlyFrames: number = 0;

  // Game-specific unlock cheats (always off by default; Casual Mode only; dedicated Unlock NVRAM isolated)
  public cheats: CheatToggles = {
    fmUnlockFighters: false,
    fmUnlockModes: false,
    mktUnlockFighters: false,
    mktUnlockModes: false,
    lightsOutUnlockLevels: false
  };
  private cleanNvramSnapshot: Uint8Array | null = null;
  private cheatSyncChannel: BroadcastChannel | null = null;
  public onCheatsChanged?: () => void;

  // Single-touch discrete lock (strictly 1 touch input per pointer press)
  private touchLockedUntilRelease: boolean = false;
  private stylusPulseFrames: number = 0;

  // Casual Mode Rewind Ring Buffer (disabled & cleared in Hardcore Mode per Section B)
  private rewindBuffer: Array<{
    pc: number;
    sp: number;
    ps0: number;
    ps1: number;
    sys: number;
    ie0: number;
    ie1: number;
    ir0: number;
    ir1: number;
    mmu: Uint8Array;
    regRam: Uint8Array;
    internalRam: Uint8Array;
    vram: Uint8Array;
    nvram: Uint8Array;
    raHitCounts: Record<number, number>;
  }> = [];
  private rewindCaptureCounter: number = 0;

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

  // Virtual Stylus (Keyboard & Gamepad/Controller control)
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
    vsync: false,
    showTouchGrid: false,
    touchGridOpacity: 0.0,
    showStylusReticle: false,
    viewMode: getDefaultViewModeForPlatform(),
    theme: 'dark',
    screenScale: 3,
    screenFitMode: 'full',
    integerScaling: true,
    touchScaleMode: 'auto',
    touchScale: 2.5,
    touchControlSize: 'standard',
    touchOrientation: 'auto',
    consoleModel: 'original',
    bezelZoom: 'auto',
    showBottomBar: false,
    contrast: 1.0,
    volume: 0.2,
    muted: false,
    speed: 1.0,
    showFps: false,
    smoothMode: false,
    stylusCursor: false,
    backgroundInput: true,
    stylusSpeed: 2.5,
    gamepadIndex: -1,
    gamepadDeadzone: 0.15,
    advancedMode: false,
    showScoreOverlay: false,
    enableRetroAchievements: false,
    fastBoot: false,
    highScoreNotifications: false,
    inputBindings: createDefaultInputBindings()
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
    this.webLink = new TigerWebLinkManager(this.cpu, this.highScores, this.onlineLeaderboard);
    this.virtualModem = new VirtualModemManager(
      this.cpu,
      this.highScores,
      this.phoneBook,
      this.onlineLeaderboard
    );

    // Route UART TX between Tiger Web Link, 2-Player Compete.Com Link Cable, and Virtual Hayes AT Modem
    this.cpu.onUartTxByte = (byte: number) => {
      if (this.webLink.isTransferActive()) {
        this.webLink.handleCpuUartTx(byte);
      } else if (this.linkCable.mode !== 'off') {
        this.linkCable.handleCpuUartTx(byte);
      } else if (this.virtualModem.enabled) {
        this.virtualModem.handleCpuUartTx(byte);
      }
    };

    // Enforce Softcore (Casual) Mode on Instance #2 and whenever Compete.Com Link Cable multiplayer is active
    if (this.linkCable.instanceId === 2) {
      this.retroAchievements.config.hardcoreMode = false;
      this.retroAchievements.session.hardcoreActive = false;
    }

    this.initCheatSyncChannel();

    // Bind NVRAM Vault & Phone Book to isolated Softcore or Hardcore storage partition before loading scores
    const initialHardcore =
      this.retroAchievements.config.hardcoreMode && this.linkCable.instanceId !== 2;
    this.highScores.setModePartition(initialHardcore, undefined, false, false);
    this.phoneBook.setModePartition(initialHardcore, false);

    this.retroAchievements.onHardcoreDisabled = () => {
      this.switchNvramModePartition(false, true);
    };

    this.linkCable.onLinkActivated = () => {
      if (this.retroAchievements.config.hardcoreMode) {
        this.switchNvramModePartition(false, true);
        this.retroAchievements.config.hardcoreMode = false;
        this.retroAchievements.session.hardcoreActive = false;
        this.retroAchievements.saveConfig();
        this.onHardcoreViolation?.(
          'Compete.Com Link Multiplayer is Softcore (Casual) Mode only — switched to Softcore.'
        );
      } else {
        this.retroAchievements.session.hardcoreActive = false;
      }
    };

    this.linkCable.onRemoteP2Input = (buttons) => {
      (Object.keys(buttons) as (keyof GameComButtons)[]).forEach((k) => {
        const val = buttons[k];
        if (typeof val === 'boolean') {
          this.setButton(k, val);
        }
      });
    };

    this.linkCable.getActiveRomForSync = () => {
      const cart = this.slot1;
      if (!cart || !cart.romData) return null;
      return {
        name: `${cart.title || 'cartridge'}.bin`,
        data: cart.romData
      };
    };

    this.linkCable.onRemoteRomSync = (romName, romData) => {
      if (this.slot1) return;
      const copy = new Uint8Array(romData.length);
      copy.set(romData);
      const file = new File([copy.buffer], romName, { type: 'application/octet-stream' });
      void this.loadRomFromFile(file, 1);
    };

    // Wire competitive Hardcore & Online Leaderboard attestation into NVRAM High Score Manager
    this.highScores.attachCompetitiveEngines(
      this.retroAchievements,
      this.onlineLeaderboard,
      (entry, meta) => this.onScoreRecorded?.(entry, meta)
    );

    // Wire RAIntegration DLL (`RA_Interface.h`) shared callbacks & SM8521 memory banks (Banks 0, 1, 2)
    this.retroAchievements.raDll.installSM8521MemoryBanks(
      this.cpu,
      () => this.retroAchievements.config.hardcoreMode
    );
    this.retroAchievements.raDll.RA_InstallSharedFunctions({
      fpIsActive: () => this.isPoweredOn && !this.isPaused,
      fpCauseUnpause: () => {
        this.isPaused = false;
        this.retroAchievements.raDll.RA_SetPaused(false);
      },
      fpCausePause: () => {
        this.isPaused = true;
        this.retroAchievements.raDll.RA_SetPaused(true);
      },
      fpEstimateTitle: () => this.getActiveCartridge()?.title || 'BIOS Built-In PDA',
      fpResetEmulator: () => this.resetSystem(this.settings.fastBoot ? 'MAIN_MENU' : 'NONE')
    });

    // Wire hardware sound generator, 8-bit SGDA ($004E) DAC streamer, & BIOS digitized waveform callbacks
    this.cpu.onSoundRegWrite = (audioState, cycles) => {
      this.sound.updateFromHardwareRegisters(audioState, cycles);
    };
    this.cpu.onAudioFrameEnd = (cycles) => {
      this.sound.endToneFrame(cycles, this.fastBootTarget !== 'NONE');
    };
    this.cpu.onDacStreamStart = () => {
      const isSkippingGlobeForCart =
        (this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2') &&
        this.bootFrameCounter >= 390;
      this.sound.onDacStreamStart(isSkippingGlobeForCart);
    };
    this.cpu.onDacSample = (val, sampleRate) => {
      if (
        (this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2') &&
        this.bootFrameCounter < 405
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
      this.resetSystem(this.settings.fastBoot ? 'MAIN_MENU' : 'NONE');
    });

    this.syncBiosToMemory();
    this.highScores.initializeNvramSignatures(this.cpu.nvram);
    if (this.phoneBook.getTotalEntriesCount() === 0) {
      this.phoneBook.syncFromNvram(this.cpu.nvram);
    }
    this.phoneBook.syncBankToNvram(this.cpu.nvram, this.phoneBook.activeBank);
    this.highScores.saveRawNvram(this.cpu.nvram);

    // Both slots start empty until the user loads a cartridge
    this.slot1 = null;
    this.slot2 = null;
    for (const c of PRELOADED_CARTRIDGES) {
      this.loadedCartridgeCache.set(c.id, c);
    }
    this.loadRecentGamesFromStorage();
    this.loadOnlineRepositoryFromStorage();
    this.loadDisplaySettingsFromStorage();
    this.initScreenSettingsMirrorSync();
    this.loadPreloadedCartridges();

    this.resetSystem(this.settings.fastBoot ? 'MAIN_MENU' : 'NONE');
  }

  private initScreenSettingsMirrorSync() {
    if (typeof window === 'undefined') return;
    const applyMirrorReload = () => {
      if (this.linkCable.instanceId !== 2) return;
      this.loadDisplaySettingsFromStorage();
      this.onScreenSettingsSynced?.();
    };
    if ('BroadcastChannel' in window) {
      try {
        this.screenSyncChannel = new BroadcastChannel(SCREEN_SYNC_CHANNEL_NAME);
        this.screenSyncChannel.onmessage = (ev) => {
          if (
            ev.data &&
            ev.data.type === 'SCREEN_SETTINGS_UPDATED' &&
            ev.data.sourceInstance !== this.linkCable.instanceId
          ) {
            applyMirrorReload();
          }
        };
      } catch {
        // Ignore BroadcastChannel errors
      }
    }
    window.addEventListener('storage', (ev) => {
      if (
        ev.key === TWO_SHADE_STORAGE_KEY ||
        ev.key === GHOSTING_SETTINGS_STORAGE_KEY ||
        ev.key === INPUT_SETTINGS_STORAGE_KEY
      ) {
        applyMirrorReload();
      }
    });
  }

  private broadcastScreenSettingsUpdate() {
    if (this.screenSyncChannel && this.linkCable.instanceId !== 2) {
      try {
        this.screenSyncChannel.postMessage({
          type: 'SCREEN_SETTINGS_UPDATED',
          sourceInstance: this.linkCable.instanceId
        });
      } catch {
        // Ignore BroadcastChannel errors
      }
    }
  }

  public getActiveCartridge(): CartridgeInfo | null {
    return this.activeSlot === 1 ? this.slot1 : this.slot2;
  }

  /**
   * Flushes outgoing Softcore/Hardcore NVRAM + Vault state and switches cpu.nvram
   * onto the requested mode's completely isolated storage partition.
   */
  private switchNvramModePartition(hardcore: boolean, syncCpuNvram: boolean) {
    this.restoreCleanNvramIfNeeded();
    const nextHardcore = this.linkCable.instanceId !== 2 && hardcore;
    const changing =
      this.highScores.isHardcorePartition !== nextHardcore ||
      this.phoneBook.isHardcorePartition !== nextHardcore;
    if (changing) {
      this.highScores.syncFromNvram(this.cpu.nvram);
      this.phoneBook.syncFromNvram(this.cpu.nvram);
    }
    this.highScores.setModePartition(nextHardcore, this.cpu.nvram, syncCpuNvram, false);
    this.phoneBook.setModePartition(nextHardcore, false);
    if (syncCpuNvram) {
      this.phoneBook.syncBankToNvram(this.cpu.nvram, this.phoneBook.activeBank);
      this.highScores.saveRawNvram(this.cpu.nvram);
    }
  }

  /**
   * Toggles Competitive / RetroAchievements Hardcore Mode.
   * Section B Compliance:
   * - Switching from Casual (Softcore) Mode to Hardcore Mode forces a full cold hardware reset of the game.
   * - Switching from Hardcore Mode to Casual (Softcore) Mode is allowed mid-session without resetting.
   * - Forces 1.0x+ native speed (disables 0.5x slowdown), clears Rewind buffer, and blocks Save State loading,
   *   Frame Advance, Cheats, and CPU Debugger stepping.
   */
  public toggleHardcoreMode(enabled?: boolean): boolean {
    const nextState =
      enabled !== undefined ? enabled : !this.retroAchievements.config.hardcoreMode;
    if (nextState && (this.linkCable.mode !== 'off' || this.linkCable.instanceId === 2)) {
      this.switchNvramModePartition(false, true);
      this.retroAchievements.config.hardcoreMode = false;
      this.retroAchievements.session.hardcoreActive = false;
      this.onHardcoreViolation?.(
        'Compete.Com Link Multiplayer is Softcore (Casual) Mode only. Disconnect Link Cable to enable Hardcore Mode.'
      );
      return false;
    }

    // Clear any active cheats and restore clean NVRAM before entering Hardcore Mode
    if (nextState) {
      this.clearAllCheats(true);
    }

    // Isolate Softcore and Hardcore NVRAM + High Score Vault + Phone Book partitions cleanly
    this.switchNvramModePartition(nextState, true);

    this.retroAchievements.config.hardcoreMode = nextState;
    this.retroAchievements.saveConfig();
    if (nextState) {
      if (this.settings.speed < 1.0) {
        this.settings.speed = 1.0;
      }
      this.rewindBuffer = [];
      this.accuracyFixes.correctClockSpeed = true;
      const bootTarget: FastBootTarget = this.settings.fastBoot
        ? this.activeApp === 'CARTRIDGE'
          ? this.activeSlot === 1
            ? 'CART_1'
            : 'CART_2'
          : 'MAIN_MENU'
        : 'NONE';
      this.resetSystem(bootTarget);
    } else {
      this.retroAchievements.session.hardcoreActive = false;
    }
    return nextState;
  }

  public setClockSpeed(spd: number): boolean {
    if (this.retroAchievements.config.hardcoreMode && spd < 1.0) {
      this.onHardcoreViolation?.(
        'Hardcore Mode prohibits sub-1.0x slowdown. Switch to Casual Mode to use 0.5x speed.'
      );
      return false;
    }
    this.settings.speed = spd;
    if (spd < 1.0) {
      this.retroAchievements.taintSession('slowdown');
    }
    if (spd > 1.0) {
      this.retroAchievements.raDll.RA_SuspendRepaint();
    } else {
      this.retroAchievements.raDll.RA_ResumeRepaint();
    }
    return true;
  }

  /**
   * Advances emulation by exactly 1 hardware frame while paused (Casual Mode only).
   * Section B & G Compliance: Frame Advance is strictly disabled in Hardcore Mode.
   */
  public frameAdvance(): boolean {
    if (!this.isPoweredOn) return false;
    if (this.retroAchievements.config.hardcoreMode) {
      this.onHardcoreViolation?.('Frame Advance is disabled in Hardcore Mode.');
      return false;
    }
    this.retroAchievements.taintSession('frame_advance');
    this.isPaused = true;
    this.retroAchievements.raDll.RA_SetPaused(true);
    this.stepHardwareFrame(1.0);
    this.lcd.currentBuffer.set(this.cpu.displayBuffer);
    return true;
  }

  /**
   * Rewinds emulation to the most recent snapshot in the Casual Mode Rewind ring buffer.
   * Section B & G Compliance: Rewind is strictly disabled in Hardcore Mode.
   */
  public rewindStep(): boolean {
    if (!this.isPoweredOn) return false;
    if (this.retroAchievements.config.hardcoreMode) {
      this.onHardcoreViolation?.('Rewind is disabled in Hardcore Mode.');
      return false;
    }
    const snap = this.rewindBuffer.pop();
    if (!snap) {
      return false;
    }
    this.retroAchievements.taintSession('rewind');
    this.fastBootTarget = 'NONE';
    this.cpu.m_PC = snap.pc;
    this.cpu.m_SP = snap.sp;
    this.cpu.m_PS0 = snap.ps0;
    this.cpu.m_PS1 = snap.ps1;
    this.cpu.m_SYS = snap.sys;
    this.cpu.m_IE0 = snap.ie0;
    this.cpu.m_IE1 = snap.ie1;
    this.cpu.m_IR0 = snap.ir0;
    this.cpu.m_IR1 = snap.ir1;
    this.cpu.mmu.set(snap.mmu);
    this.cpu.m_register_ram.set(snap.regRam);
    this.cpu.m_p_ram.set(snap.internalRam);
    this.cpu.videoram.set(snap.vram);
    this.cpu.nvram.set(snap.nvram);
    this.retroAchievements.hitCounts = { ...snap.raHitCounts };
    this.lcd.currentBuffer.set(this.cpu.displayBuffer);
    return true;
  }

  public getRewindSnapshotsCount(): number {
    return this.rewindBuffer.length;
  }

  /**
   * Applies a memory poke / cheat byte write (Casual Mode only).
   * Section B & G Compliance: Cheats and memory editors are strictly prohibited in Hardcore Mode.
   */
  public applyMemoryPoke(address: number, value: number): boolean {
    if (this.retroAchievements.config.hardcoreMode) {
      this.onHardcoreViolation?.('Cheats and memory editing are prohibited in Hardcore Mode.');
      return false;
    }
    this.retroAchievements.taintSession('cheat');
    const addr = address & 0xffff;
    const val = value & 0xff;
    if (addr >= 0x0000 && addr <= 0x03ff) {
      this.cpu.m_p_ram[addr] = val;
    } else if (addr >= 0xe000 && addr <= 0xffff) {
      this.cpu.nvram[addr - 0xe000] = val;
      this.nvramDirtyFrames = 10;
    } else if (addr >= 0xa000 && addr <= 0xdfff) {
      this.cpu.videoram[addr - 0xa000] = val;
    } else {
      this.cpu.writeByte(addr, val);
    }
    return true;
  }

  public hasActiveCheats(): boolean {
    return (
      this.cheats.fmUnlockFighters ||
      this.cheats.fmUnlockModes ||
      this.cheats.mktUnlockFighters ||
      this.cheats.mktUnlockModes ||
      this.cheats.lightsOutUnlockLevels
    );
  }

  private restoreCleanNvramIfNeeded() {
    if (this.cleanNvramSnapshot) {
      this.cpu.nvram.set(this.cleanNvramSnapshot);
      this.cleanNvramSnapshot = null;
      this.nvramDirtyFrames = 0;
    }
  }

  private getLoadedKnownGameId(): string | null {
    const cart = this.getActiveCartridge();
    if (!cart) return null;
    const known = resolveKnownGameByGameIdOrTitle(
      cart.headerGameId ?? 0,
      cart.headerTitle || cart.title
    );
    return known?.id ?? null;
  }

  /**
   * Patches the isolated in-memory Unlock NVRAM ($E000-$FFFF) without touching the user's
   * persisted Softcore/Hardcore NVRAM or High Score Vault.
   */
  private applyDedicatedUnlockNvram() {
    if (!this.hasActiveCheats()) return;
    const gameId = this.getLoadedKnownGameId();

    if (gameId === 'lightsout' && this.cheats.lightsOutUnlockLevels) {
      // Locate or allocate Lights Out ($0917) 64-byte slot in $FC60-$FEDF (NVRAM $1C60-$1EDF)
      let slotOff = -1;
      let freeOff = -1;
      for (let off = 0x1c60; off < 0x1ee0; off += 0x40) {
        const id = (this.cpu.nvram[off] << 8) | this.cpu.nvram[off + 1];
        if (id === 0x0917) {
          slotOff = off;
          break;
        }
        if (freeOff === -1 && (id === 0x0000 || id === 0xffff)) {
          freeOff = off;
        }
      }
      if (slotOff === -1 && freeOff !== -1) {
        slotOff = freeOff;
        this.cpu.nvram.fill(0x00, slotOff, slotOff + 0x40);
        this.cpu.nvram[slotOff] = 0x09;
        this.cpu.nvram[slotOff + 1] = 0x17;
        const title = 'Lights Out';
        for (let i = 0; i < title.length; i++) {
          this.cpu.nvram[slotOff + 0x03 + i] = title.charCodeAt(i);
        }
        this.cpu.nvram[slotOff + 0x0d] = 0x01;
        this.cpu.nvram[slotOff + 0x0e] = 0x20;
        this.cpu.nvram[slotOff + 0x0f] = 0x20;
        this.cpu.nvram[slotOff + 0x10] = 0x31;
      }
      if (slotOff !== -1) {
        // Set all 6 puzzle-set progress bytes (+$12..+$17) to level 50 (0x32)
        for (let i = 0x12; i <= 0x17; i++) {
          this.cpu.nvram[slotOff + i] = 0x32;
        }
      }
    }

    if (gameId === 'megamix' && (this.cheats.fmUnlockFighters || this.cheats.fmUnlockModes)) {
      for (let off = 0x1c60; off < 0x1ee0; off += 0x40) {
        const id = (this.cpu.nvram[off] << 8) | this.cpu.nvram[off + 1];
        if (id === 0x0426 || id === 0x1018) {
          this.cpu.nvram[off + 0x10] = 0xa5;
          this.cpu.nvram[off + 0x11] = 0xa5;
          if (this.cheats.fmUnlockModes) {
            this.cpu.nvram[off + 0x12] |= 0x01;
            this.cpu.nvram[off + 0x13] |= 0x01;
            this.cpu.nvram[off + 0x14] |= 0x01;
          }
          if (this.cheats.fmUnlockFighters) {
            this.cpu.nvram[off + 0x16] |= 0x0f;
          }
          break;
        }
      }
    }
  }

  private applyActiveCheatsToCpu() {
    if (!this.hasActiveCheats()) return;
    const gameId = this.getLoadedKnownGameId();
    if (gameId === 'megamix') {
      if (this.cheats.fmUnlockFighters) {
        this.cpu.m_p_ram[0x0285] |= 0x0f;
      }
      if (this.cheats.fmUnlockModes) {
        this.cpu.m_p_ram[0x0287] |= 0x07;
      }
    } else if (gameId === 'mkt') {
      if (this.cheats.mktUnlockFighters) {
        this.cpu.m_p_ram[0x02d4] |= 0x60;
      }
      if (this.cheats.mktUnlockModes) {
        this.cpu.m_p_ram[0x00fa] |= 0x08;
      }
    } else if (gameId === 'lightsout' && this.cheats.lightsOutUnlockLevels) {
      for (let addr = 0x01bc; addr <= 0x01c1; addr++) {
        this.cpu.m_p_ram[addr] = 0x32;
      }
    }
  }

  private initCheatSyncChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.cheatSyncChannel = new BroadcastChannel('cub-spiele-cheat-sync');
      this.cheatSyncChannel.onmessage = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'REQUEST_CHEAT_SYNC' && this.linkCable.instanceId !== 2) {
          this.broadcastCheats();
        } else if (msg.type === 'CHEAT_SYNC' && this.linkCable.instanceId === 2 && msg.cheats) {
          this.applySyncedCheats(msg.cheats as Partial<CheatToggles>);
        }
      };
      if (this.linkCable.instanceId === 2) {
        this.cheatSyncChannel.postMessage({ type: 'REQUEST_CHEAT_SYNC' });
      }
    } catch {
      this.cheatSyncChannel = null;
    }
  }

  private broadcastCheats() {
    if (!this.cheatSyncChannel || this.linkCable.instanceId === 2) return;
    try {
      this.cheatSyncChannel.postMessage({
        type: 'CHEAT_SYNC',
        cheats: { ...this.cheats }
      });
    } catch {
      // ignore closed channel
    }
  }

  private applySyncedCheats(incoming: Partial<CheatToggles>) {
    const keys: Array<keyof CheatToggles> = [
      'fmUnlockFighters',
      'fmUnlockModes',
      'mktUnlockFighters',
      'mktUnlockModes',
      'lightsOutUnlockLevels'
    ];
    for (const key of keys) {
      if (typeof incoming[key] === 'boolean' && this.cheats[key] !== incoming[key]) {
        this.toggleCheat(key, incoming[key], true);
      }
    }
    this.onCheatsChanged?.();
  }

  /**
   * Toggles a built-in unlock cheat (off by default, Casual Mode only).
   * Protects NVRAM and score integrity by isolating an in-memory Unlock NVRAM copy,
   * blocking NVRAM/score syncing while active, and tainting RetroAchievements.
   */
  public toggleCheat(
    key: keyof CheatToggles,
    enabled?: boolean,
    fromPeerSync: boolean = false
  ): boolean {
    const nextState = enabled !== undefined ? enabled : !this.cheats[key];
    if (nextState && this.retroAchievements.config.hardcoreMode) {
      this.onHardcoreViolation?.('Cheat codes are prohibited in Hardcore Mode.');
      return false;
    }

    if (nextState) {
      if (!this.cleanNvramSnapshot) {
        this.cleanNvramSnapshot = new Uint8Array(this.cpu.nvram);
      }
      this.retroAchievements.taintSession('cheat');
    }

    this.cheats[key] = nextState;

    const gameId = this.getLoadedKnownGameId();
    if (nextState) {
      this.applyDedicatedUnlockNvram();
      this.applyActiveCheatsToCpu();
    } else {
      if (key === 'fmUnlockFighters' && gameId === 'megamix') {
        this.cpu.m_p_ram[0x0285] &= ~0x0f;
      } else if (key === 'fmUnlockModes' && gameId === 'megamix') {
        this.cpu.m_p_ram[0x0287] &= ~0x07;
      } else if (key === 'mktUnlockFighters' && gameId === 'mkt') {
        this.cpu.m_p_ram[0x02d4] &= ~0x60;
      } else if (key === 'mktUnlockModes' && gameId === 'mkt') {
        this.cpu.m_p_ram[0x00fa] &= ~0x08;
      }
      if (!this.hasActiveCheats()) {
        this.restoreCleanNvramIfNeeded();
      } else {
        // Re-seed dedicated Unlock NVRAM from clean snapshot for remaining active cheats
        if (this.cleanNvramSnapshot) {
          this.cpu.nvram.set(this.cleanNvramSnapshot);
        }
        this.applyDedicatedUnlockNvram();
      }
    }

    if (!fromPeerSync) {
      this.broadcastCheats();
    }
    return true;
  }

  public clearAllCheats(restoreNvram: boolean = true) {
    const gameId = this.getLoadedKnownGameId();
    if (gameId === 'megamix') {
      if (this.cheats.fmUnlockFighters) this.cpu.m_p_ram[0x0285] &= ~0x0f;
      if (this.cheats.fmUnlockModes) this.cpu.m_p_ram[0x0287] &= ~0x07;
    } else if (gameId === 'mkt') {
      if (this.cheats.mktUnlockFighters) this.cpu.m_p_ram[0x02d4] &= ~0x60;
      if (this.cheats.mktUnlockModes) this.cpu.m_p_ram[0x00fa] &= ~0x08;
    }
    this.cheats.fmUnlockFighters = false;
    this.cheats.fmUnlockModes = false;
    this.cheats.mktUnlockFighters = false;
    this.cheats.mktUnlockModes = false;
    this.cheats.lightsOutUnlockLevels = false;
    if (restoreNvram) {
      this.restoreCleanNvramIfNeeded();
    }
    this.broadcastCheats();
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
          this.settings.ghosting = Math.max(0, Math.min(1, parsedG.ghosting));
        }
        if (typeof parsedG.ghostingPersistence === 'number') {
          this.settings.ghostingPersistence = Math.max(0, Math.min(1, parsedG.ghostingPersistence));
        }
        if (typeof parsedG.contrast === 'number') {
          this.settings.contrast = Math.max(0, Math.min(1, parsedG.contrast));
          this.lcd.contrast = this.settings.contrast;
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
        if (typeof parsedI.advancedMode === 'boolean') {
          this.settings.advancedMode = parsedI.advancedMode;
        }
        if (typeof parsedI.showScoreOverlay === 'boolean') {
          this.settings.showScoreOverlay = parsedI.showScoreOverlay;
        }
        if (typeof parsedI.enableRetroAchievements === 'boolean') {
          this.settings.enableRetroAchievements = parsedI.enableRetroAchievements;
        }
        if (typeof parsedI.fastBoot === 'boolean') {
          this.settings.fastBoot = parsedI.fastBoot;
        }
        if (typeof parsedI.highScoreNotifications === 'boolean') {
          this.settings.highScoreNotifications = parsedI.highScoreNotifications;
        }
        if (parsedI.inputBindings && typeof parsedI.inputBindings === 'object') {
          const defaults = createDefaultInputBindings();
          const loadedKb = parsedI.inputBindings.keyboard || {};
          const loadedPad = parsedI.inputBindings.gamepad || {};
          (Object.keys(defaults.keyboard) as InputActionId[]).forEach((action) => {
            if (Array.isArray(loadedKb[action])) {
              this.settings.inputBindings.keyboard[action] = loadedKb[action].filter(
                (v: unknown) => typeof v === 'string' && v.length > 0
              );
            }
          });
          (Object.keys(defaults.gamepad) as InputActionId[]).forEach((action) => {
            if (Array.isArray(loadedPad[action])) {
              this.settings.inputBindings.gamepad[action] = loadedPad[action].filter(
                (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0
              );
            }
          });
        }
        if (parsedI.theme === 'light' || parsedI.theme === 'dark') {
          this.settings.theme = parsedI.theme;
        }
      }
      const viewKey = this.getViewStorageKey();
      const rawOwnView = localStorage.getItem(viewKey);
      const rawView =
        rawOwnView ||
        localStorage.getItem(VIEW_MODE_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_V2_VIEW_MODE_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_VIEW_MODE_STORAGE_KEY);
      const isMigratedFromLegacy = !rawOwnView;

      if (rawView) {
        const parsedV = JSON.parse(rawView);
        if (parsedV?.viewMode === 'screen-only' || parsedV?.viewMode === 'touch') {
          this.settings.viewMode = parsedV.viewMode;
        } else {
          this.settings.viewMode = getDefaultViewModeForPlatform();
        }
        if (typeof parsedV?.screenScale === 'number' && parsedV.screenScale >= 1 && parsedV.screenScale <= 8) {
          this.settings.screenScale = Math.round(parsedV.screenScale);
        }
        if (!isMigratedFromLegacy && (parsedV?.screenFitMode === 'scale' || parsedV?.screenFitMode === 'full')) {
          this.settings.screenFitMode = parsedV.screenFitMode;
        } else {
          this.settings.screenFitMode = 'full';
        }
        if (typeof parsedV?.integerScaling === 'boolean') {
          this.settings.integerScaling = parsedV.integerScaling;
        }
        if (
          parsedV?.touchScaleMode === 'auto' ||
          parsedV?.touchScaleMode === 'full' ||
          parsedV?.touchScaleMode === 'scale'
        ) {
          this.settings.touchScaleMode = parsedV.touchScaleMode;
        }
        if (typeof parsedV?.touchScale === 'number' && parsedV.touchScale >= 1 && parsedV.touchScale <= 8) {
          this.settings.touchScale = Math.round(parsedV.touchScale * 100) / 100;
        }
        if (
          parsedV?.touchControlSize === 'compact' ||
          parsedV?.touchControlSize === 'standard' ||
          parsedV?.touchControlSize === 'large'
        ) {
          this.settings.touchControlSize = parsedV.touchControlSize;
        }
        if (
          parsedV?.touchOrientation === 'auto' ||
          parsedV?.touchOrientation === 'horizontal' ||
          parsedV?.touchOrientation === 'vertical'
        ) {
          this.settings.touchOrientation = parsedV.touchOrientation;
        }
        if (
          parsedV?.consoleModel === 'original' ||
          parsedV?.consoleModel === 'pocketpro_backlit' ||
          parsedV?.consoleModel === 'pocketpro_purple' ||
          parsedV?.consoleModel === 'pocketpro_green' ||
          parsedV?.consoleModel === 'pocketpro_blue' ||
          parsedV?.consoleModel === 'pocketpro_pink' ||
          parsedV?.consoleModel === 'minimal'
        ) {
          this.settings.consoleModel = parsedV.consoleModel;
        }
        if (
          parsedV?.bezelZoom === 'auto' ||
          parsedV?.bezelZoom === 'full-system' ||
          parsedV?.bezelZoom === 'mid' ||
          parsedV?.bezelZoom === 'closeup' ||
          parsedV?.bezelZoom === 'scale'
        ) {
          this.settings.bezelZoom = parsedV.bezelZoom;
        }
        if (typeof parsedV?.pixelGrid === 'boolean') {
          this.settings.pixelGrid = parsedV.pixelGrid;
          this.lcd.pixelGrid = parsedV.pixelGrid;
        }
        if (typeof parsedV?.vsync === 'boolean') {
          this.settings.vsync = parsedV.vsync;
          this.cpu.vsyncEnabled = parsedV.vsync;
        }
        if (typeof parsedV?.touchGridOpacity === 'number') {
          const op = Math.max(0, Math.min(1, parsedV.touchGridOpacity));
          this.settings.touchGridOpacity = op;
          this.settings.showTouchGrid = op > 0;
        }
        if (typeof parsedV?.showStylusReticle === 'boolean') {
          this.settings.showStylusReticle = parsedV.showStylusReticle;
        }
        if (!isMigratedFromLegacy && typeof parsedV?.showBottomBar === 'boolean') {
          this.settings.showBottomBar = parsedV.showBottomBar;
        } else {
          this.settings.showBottomBar = false;
        }
        if (isMigratedFromLegacy && this.linkCable.instanceId !== 2) {
          this.saveViewSettingsToStorage();
        }
      } else {
        // First boot: set platform default (Screen-Only on Windows/macOS, Touch on Android/mobile) and persist it
        this.settings.viewMode = getDefaultViewModeForPlatform();
        this.settings.showBottomBar = false;
        if (this.linkCable.instanceId !== 2) {
          this.saveViewSettingsToStorage();
        }
      }
      this.lcd.ghosting = this.accuracyFixes.stnGhostingAccurate ? this.settings.ghosting : 0;
      this.lcd.ghostingPersistence = this.accuracyFixes.stnGhostingAccurate
        ? this.settings.ghostingPersistence
        : 0;
      this.lcd.pixelGrid = this.settings.pixelGrid;
      this.retroAchievements.config.leaderboardPopups = this.settings.showScoreOverlay;
      this.retroAchievements.config.enabled = this.settings.advancedMode;
      this.applyThemeToDom();
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
          snapToGrid: this.virtualStylus.snapToGrid,
          advancedMode: this.settings.advancedMode,
          showScoreOverlay: this.settings.showScoreOverlay,
          enableRetroAchievements: this.settings.enableRetroAchievements,
          fastBoot: this.settings.fastBoot,
          highScoreNotifications: this.settings.highScoreNotifications,
          inputBindings: this.settings.inputBindings,
          theme: this.settings.theme
        })
      );
      this.broadcastScreenSettingsUpdate();
    } catch {
      // Ignore storage errors
    }
  }

  public setKeyboardBinding(action: InputActionId, codes: string[]) {
    this.settings.inputBindings.keyboard[action] = Array.from(new Set(codes));
    this.saveInputSettingsToStorage();
  }

  public setGamepadBinding(action: InputActionId, buttons: number[]) {
    this.settings.inputBindings.gamepad[action] = Array.from(new Set(buttons));
    this.saveInputSettingsToStorage();
  }

  public resetAllInputBindingsToDefault() {
    this.settings.inputBindings = createDefaultInputBindings();
    this.settings.stylusSpeed = 2.5;
    this.settings.gamepadIndex = -1;
    this.settings.gamepadDeadzone = 0.15;
    this.settings.backgroundInput = true;
    this.virtualStylus.snapToGrid = false;
    this.virtualStylus.dpadStylusMode = false;
    this.saveInputSettingsToStorage();
  }

  public applyThemeToDom() {
    if (typeof document !== 'undefined') {
      const isDark = this.settings.theme === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', isDark ? '#000000' : '#f2f3ef');
      }
    }
  }

  public setTheme(theme: 'light' | 'dark'): 'light' | 'dark' {
    this.settings.theme = theme;
    this.applyThemeToDom();
    this.saveInputSettingsToStorage();
    return theme;
  }

  public toggleTheme(): 'light' | 'dark' {
    return this.setTheme(this.settings.theme === 'dark' ? 'light' : 'dark');
  }

  private getViewStorageKey(): string {
    return this.linkCable.instanceId === 2 ? VIEW_MODE_P2_STORAGE_KEY : VIEW_MODE_STORAGE_KEY;
  }

  public saveViewSettingsToStorage() {
    try {
      localStorage.setItem(
        this.getViewStorageKey(),
        JSON.stringify({
          viewMode: this.settings.viewMode,
          screenScale: this.settings.screenScale,
          screenFitMode: this.settings.screenFitMode,
          integerScaling: this.settings.integerScaling,
          touchScaleMode: this.settings.touchScaleMode,
          touchScale: this.settings.touchScale,
          touchControlSize: this.settings.touchControlSize,
          touchOrientation: this.settings.touchOrientation,
          consoleModel: this.settings.consoleModel,
          bezelZoom: this.settings.bezelZoom,
          pixelGrid: this.settings.pixelGrid,
          vsync: this.settings.vsync,
          touchGridOpacity: this.settings.touchGridOpacity,
          showStylusReticle: this.settings.showStylusReticle,
          showBottomBar: this.settings.showBottomBar
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  public setViewMode(mode: 'screen-only' | 'touch'): 'screen-only' | 'touch' {
    this.settings.viewMode = mode;
    this.saveViewSettingsToStorage();
    return mode;
  }

  public toggleViewMode(): 'screen-only' | 'touch' {
    return this.setViewMode(this.settings.viewMode === 'screen-only' ? 'touch' : 'screen-only');
  }

  public setScreenScale(scale: number) {
    this.settings.screenScale = Math.max(1, Math.min(8, Math.round(scale)));
    this.settings.screenFitMode = 'scale';
    this.settings.viewMode = 'screen-only';
    this.saveViewSettingsToStorage();
  }

  public setScreenFitMode(mode: 'scale' | 'full') {
    this.settings.screenFitMode = mode;
    this.settings.viewMode = 'screen-only';
    this.saveViewSettingsToStorage();
  }

  public toggleIntegerScaling(enabled?: boolean): boolean {
    const next = enabled !== undefined ? enabled : !this.settings.integerScaling;
    this.settings.integerScaling = next;
    this.saveViewSettingsToStorage();
    return next;
  }

  public toggleVsync(enabled?: boolean): boolean {
    const next = enabled !== undefined ? enabled : !this.settings.vsync;
    this.settings.vsync = next;
    this.cpu.vsyncEnabled = next;
    this.saveViewSettingsToStorage();
    return next;
  }

  public setTouchScale(scale: number) {
    this.settings.touchScale = Math.max(1, Math.min(8, Math.round(scale * 100) / 100));
    this.settings.touchScaleMode = 'scale';
    this.settings.viewMode = 'touch';
    this.saveViewSettingsToStorage();
  }

  public setTouchScaleMode(mode: 'auto' | 'full' | 'scale') {
    this.settings.touchScaleMode = mode;
    this.settings.viewMode = 'touch';
    this.saveViewSettingsToStorage();
  }

  public setTouchControlSize(size: 'compact' | 'standard' | 'large') {
    this.settings.touchControlSize = size;
    this.settings.viewMode = 'touch';
    this.saveViewSettingsToStorage();
  }

  public setTouchOrientation(orientation: 'auto' | 'horizontal' | 'vertical') {
    this.settings.touchOrientation = orientation;
    this.settings.viewMode = 'touch';
    this.saveViewSettingsToStorage();
  }

  public setConsoleModel(model: GameComConsoleModel) {
    this.settings.consoleModel = model;
    this.settings.viewMode = 'touch';
    this.saveViewSettingsToStorage();
  }

  public setBezelZoom(zoom: BezelZoomMode) {
    this.settings.bezelZoom = zoom;
    this.settings.viewMode = 'touch';
    if (zoom === 'auto') {
      this.settings.touchScaleMode = 'auto';
    } else if (zoom === 'scale') {
      this.settings.touchScaleMode = 'scale';
    }
    this.saveViewSettingsToStorage();
  }

  public toggleFastBoot(enabled?: boolean): boolean {
    const next = enabled !== undefined ? enabled : !this.settings.fastBoot;
    this.settings.fastBoot = next;
    if (!next && this.fastBootTarget !== 'NONE') {
      this.fastBootTarget = 'NONE';
      this.cpu.stylusPressed = false;
      this.syncBothCartridgeSlotsToCpu();
    }
    this.saveInputSettingsToStorage();
    return next;
  }

  public toggleBottomBar(enabled?: boolean): boolean {
    const next = enabled !== undefined ? enabled : !this.settings.showBottomBar;
    this.settings.showBottomBar = next;
    this.saveViewSettingsToStorage();
    return next;
  }

  /**
   * Toggles visibility & evaluation of RetroAchievements UI components (defaults to false / hidden).
   */
  public toggleRetroAchievements(enabled?: boolean): boolean {
    const next = enabled !== undefined ? enabled : !this.settings.enableRetroAchievements;
    this.settings.enableRetroAchievements = next;
    this.retroAchievements.config.enabled = next;
    if (next) {
      this.retroAchievements.raDll.probeBundledOrNativeDll().catch(() => {});
    }
    this.retroAchievements.saveConfig();
    this.saveInputSettingsToStorage();
    return next;
  }

  /**
   * Toggles the on-screen Score / Leaderboard HUD overlay (defaults to OFF).
   */
  public toggleScoreOverlay(enabled?: boolean): boolean {
    const next = enabled !== undefined ? enabled : !this.settings.showScoreOverlay;
    this.settings.showScoreOverlay = next;
    this.retroAchievements.config.leaderboardPopups = next;
    this.retroAchievements.saveConfig();
    this.saveInputSettingsToStorage();
    return next;
  }

  /**
   * Captures a clean PNG screenshot of the 200x160 LCD display and downloads it.
   */
  public captureScreenshot(): { filename: string; dataUrl: string } {
    const scale = this.settings.screenScale || 3;
    const dataUrl = this.lcd.captureScreenshotDataUrl(scale);
    const activeCart = this.getActiveCartridge();
    const rawTitle =
      this.activeApp === 'CARTRIDGE' && activeCart ? activeCart.title : 'System-Menu';
    const cleanTitle =
      rawTitle
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'Screen';
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(
      now.getHours()
    )}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    const filename = `CubSpieleCom-${cleanTitle}-${stamp}.png`;

    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    return { filename, dataUrl };
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
          contrast: this.settings.contrast,
          stnGhostingAccurate: this.accuracyFixes.stnGhostingAccurate
        })
      );
      this.broadcastScreenSettingsUpdate();
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
    this.settings.ghosting = Math.max(0, Math.min(1, intensity));
    this.settings.ghostingPersistence = Math.max(0, Math.min(1, persistence));
    this.lcd.ghosting = this.accuracyFixes.stnGhostingAccurate ? this.settings.ghosting : 0;
    this.lcd.ghostingPersistence = this.accuracyFixes.stnGhostingAccurate
      ? this.settings.ghostingPersistence
      : 0;
    this.saveDisplaySettingsToStorage();
  }

  public setContrast(contrast: number) {
    const clamped = Math.max(0, Math.min(1, Math.round(contrast * 100) / 100));
    this.settings.contrast = clamped;
    this.lcd.contrast = clamped;
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
              g.id !== 'lightsout'
          );
          if (this.recentGames.length > 0) {
            return;
          }
        }
      }
    } catch {
      // Ignore storage error
    }
    this.recentGames = [];
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
    if (cached) {
      await this.insertCartridge(cached, slot, true);
      return true;
    }
    const onlineMatch = this.onlineLibrary.find(
      (item) => item.title.toLowerCase() === entry.title.toLowerCase() || entry.id.startsWith(`${item.gameId}_`)
    );
    if (onlineMatch) {
      await this.loadOnlineRomEntry(onlineMatch, slot);
      return true;
    }
    return false;
  }

  public loadOnlineRepositoryFromStorage() {
    const persisted = loadPersistedRepositoryState();
    this.repositoryUrls = persisted.repositoryUrls;
    this.onlineLibrary = persisted.entries;
  }

  public async addRomRepositoryUrl(
    rawUrl: string
  ): Promise<{ addedCount: number; totalCount: number }> {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      throw new Error('Please enter a valid online ROM repository URL.');
    }
    this.isScanningRepository = true;
    try {
      const discovered = await scanRomRepositoryUrl(trimmed);
      if (discovered.length === 0) {
        throw new Error('No valid Game.Com ROMs (.bin, .tgc, .rom, .zip) found at this URL.');
      }
      if (!this.repositoryUrls.includes(trimmed)) {
        this.repositoryUrls = [...this.repositoryUrls, trimmed];
      }
      this.onlineLibrary = deduplicateOnlineRomEntries([...this.onlineLibrary, ...discovered]);
      savePersistedRepositoryState({
        repositoryUrls: this.repositoryUrls,
        entries: this.onlineLibrary
      });
      return { addedCount: discovered.length, totalCount: this.onlineLibrary.length };
    } finally {
      this.isScanningRepository = false;
    }
  }

  public removeRomRepositoryUrl(urlToRemove: string) {
    this.repositoryUrls = this.repositoryUrls.filter((u) => u !== urlToRemove);
    this.onlineLibrary = deduplicateOnlineRomEntries(
      this.onlineLibrary.filter((e) => e.repoUrl !== urlToRemove)
    );
    savePersistedRepositoryState({
      repositoryUrls: this.repositoryUrls,
      entries: this.onlineLibrary
    });
  }

  public clearAllRomRepositories() {
    this.repositoryUrls = [];
    this.onlineLibrary = [];
    savePersistedRepositoryState({
      repositoryUrls: [],
      entries: []
    });
  }

  private async fetchIpsPatchBytes(relPath: string, label: string): Promise<Uint8Array> {
    const isValidIps = (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x50 && // 'P'
      bytes[1] === 0x41 && // 'A'
      bytes[2] === 0x54 && // 'T'
      bytes[3] === 0x43 && // 'C'
      bytes[4] === 0x48;   // 'H'

    const candidates = [relPath];
    const encoded = encodeURI(relPath);
    if (encoded !== relPath) candidates.push(encoded);

    let lastStatus: string | number = 'network error';
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (isValidIps(bytes)) return bytes;
          lastStatus = 'invalid IPS header';
        } else {
          lastStatus = res.status;
        }
      } catch (err) {
        lastStatus = (err as Error)?.message || 'fetch failed';
      }
    }

    // Fallback to XMLHttpRequest for file:// origins (e.g. packaged Electron BrowserWindow)
    if (typeof XMLHttpRequest !== 'undefined') {
      for (const url of candidates) {
        try {
          const xhrBytes = await new Promise<Uint8Array>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = () => {
              if (xhr.response && (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300))) {
                resolve(new Uint8Array(xhr.response));
              } else {
                reject(new Error(`HTTP ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('XHR error'));
            xhr.send();
          });
          if (isValidIps(xhrBytes)) return xhrBytes;
        } catch (err) {
          lastStatus = (err as Error)?.message || lastStatus;
        }
      }
    }

    throw new Error(`Failed to load ${label} auto-patch (${lastStatus}).`);
  }

  public async loadOnlineRomEntry(
    entry: OnlineRomEntry,
    slot: 1 | 2 = 1
  ): Promise<CartridgeInfo> {
    this.loadingOnlineGameId = entry.gameId;
    try {
      const bytes = await fetchOnlineRomBytes(entry);
      let cart = loadCartridgeFromBuffer(bytes, entry.fileName, entry.downloadUrl);
      const isCastlevaniaReborn =
        (entry.autoPatchReborn && entry.gameId === 'castlevaniareborn') ||
        entry.gameId === 'castlevaniareborn';
      const isSonicReborn =
        (entry.autoPatchReborn && entry.gameId === 'sonicjamreborn') ||
        entry.gameId === 'sonicjamreborn';

      const alreadyCvReborn =
        cart.headerGameId === 0xb745 ||
        Boolean(cart.headerTitle && cart.headerTitle.toUpperCase().includes('CV REBORN'));
      const alreadySonicReborn =
        cart.headerGameId === 0xb73f ||
        cart.headerGameId === 0xb747 ||
        Boolean(cart.headerTitle && cart.headerTitle.toUpperCase().includes('SONIC REB'));

      if (isCastlevaniaReborn && !alreadyCvReborn && cart.romData) {
        const patchBytes = await this.fetchIpsPatchBytes(
          './patches/Castlevania - Symphony of the Night Reborn.ips',
          'Reborn'
        );
        const patchedRom = applyIpsPatch(cart.romData, patchBytes);
        cart = loadCartridgeFromBuffer(
          patchedRom,
          'Castlevania - Symphony of the Night Reborn (v0.2).tgc',
          entry.downloadUrl
        );
      } else if (isSonicReborn && !alreadySonicReborn && cart.romData) {
        const patchBytes = await this.fetchIpsPatchBytes(
          './patches/Sonic Jam Reborn.ips',
          'Sonic Jam Reborn'
        );
        const patchedRom = applyIpsPatch(cart.romData, patchBytes);
        cart = loadCartridgeFromBuffer(
          patchedRom,
          'Sonic Jam Reborn (v0.2).tgc',
          entry.downloadUrl
        );
      }
      this.loadedCartridgeCache.set(cart.id, cart);
      await this.insertCartridge(cart, slot, true);
      return cart;
    } finally {
      this.loadingOnlineGameId = null;
    }
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
    this.activeApp = target === 'CART_1' || target === 'CART_2' ? 'CARTRIDGE' : 'OS';
    this.biosOnlyFrames = 0;
    this.touchLockedUntilRelease = false;
    this.stylusPulseFrames = 0;
    this.rewindBuffer = [];
    this.rewindCaptureCounter = 0;

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
    this.isPoweredOn = true;
    this.restoreCleanNvramIfNeeded();
    this.highScores.syncBankToNvram(this.cpu.nvram, this.highScores.activeBank);
    if (this.bootFrameCounter >= 480 && this.cpu.mmu[1] === 2 && this.cpu.m_p_ram[0x168] === 0) {
      this.triggerSingleStylusTap(100, 120, 12);
    } else {
      this.resetSystem('HIGH_SCORE');
    }
  }

  public openBiosPhoneBookScreen() {
    this.isPoweredOn = true;
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
      this.restoreCleanNvramIfNeeded();
      this.highScores.ensureBankForCartridge(cart.romData, this.cpu.nvram);
    }

    this.activeSlot = slot;
    this.recordRecentGame(cart, slot);

    if (autoBoot) {
      this.launchCartridge(slot);
    }
  }

  public ejectCartridge(slot: 1 | 2) {
    this.restoreCleanNvramIfNeeded();
    if (slot === 1) {
      this.slot1 = null;
      this.cpu.loadCartridgeROM(null, 1);
    } else {
      this.slot2 = null;
      this.cpu.loadCartridgeROM(null, 2);
    }
    this.resetSystem(this.settings.fastBoot ? 'MAIN_MENU' : 'NONE');
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
      this.restoreCleanNvramIfNeeded();
      this.cpu.loadCartridgeROM(cart.romData, slot);
      this.highScores.ensureBankForCartridge(cart.romData, this.cpu.nvram);
      if (this.hasActiveCheats()) {
        this.cleanNvramSnapshot = new Uint8Array(this.cpu.nvram);
        this.applyDedicatedUnlockNvram();
      }
    }

    this.isPoweredOn = true;
    this.activeApp = this.settings.fastBoot ? 'CARTRIDGE' : 'OS';
    this.resetSystem(
      this.settings.fastBoot ? (slot === 1 ? 'CART_1' : 'CART_2') : 'NONE'
    );
  }

  /**
   * Executes one frame of the SM8521 CPU & scanline engine, including fast-boot sequencing
   */
  private stepHardwareFrame(speedMult: number) {
    this.bootFrameCounter++;
    const f = this.bootFrameCounter;

    if (this.fastBootTarget !== 'NONE') {
      const appId = this.cpu.m_p_ram[0x0168];

      if (f >= 360 && f <= 375) {
        // Tap "TOUCH SCREEN TO CONTINUE" after 3D Globe finishes
        this.cpu.stylusPressed = true;
        this.cpu.stylusX = 100;
        this.cpu.stylusY = 80;
      } else if (this.fastBootTarget === 'KEEP_CLEAR_PROMPT') {
        this.cpu.stylusPressed = false;
        if (f >= 410 || (this.cpu.mmu[2] === 3 && this.cpu.m_PC >= 0x5e40 && this.cpu.m_PC <= 0x5e65)) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'MAIN_MENU') {
        this.cpu.stylusPressed = false;
        if (f >= 400 && appId === 0) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'HIGH_SCORE') {
        if (f >= 410 && f <= 422) {
          this.cpu.stylusPressed = true;
          this.cpu.stylusX = 100;
          this.cpu.stylusY = 120;
        } else {
          this.cpu.stylusPressed = false;
        }
        if (f >= 460) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'PHONE_BOOK') {
        if (f >= 410 && f <= 422) {
          // Tap PHONE BOOK icon on BIOS Main Menu (top-center column)
          this.cpu.stylusPressed = true;
          this.cpu.stylusX = 100;
          this.cpu.stylusY = 35;
        } else {
          this.cpu.stylusPressed = false;
        }
        if (f >= 465) {
          this.fastBootTarget = 'NONE';
        }
      } else if (this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2') {
        if (f >= 410 && f <= 422) {
          // Tap CARTRIDGE icon on BIOS Main Menu
          this.cpu.stylusPressed = true;
          this.cpu.stylusX = 35;
          this.cpu.stylusY = 35;
        } else if (
          f >= 455 &&
          f <= 470 &&
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

        // Finish fast-boot once CPU actually begins executing cartridge code (after BIOS Cartridge animation)
        const pcInCart =
          this.cpu.m_PC >= 0x2000 &&
          this.cpu.m_PC < 0xa000 &&
          this.cpu.mmu[this.cpu.m_PC >> 13] >= 0x20;
        if ((f >= 560 && pcInCart) || f >= 900) {
          this.cpu.stylusPressed = false;
          this.fastBootTarget = 'NONE';
          this.activeApp = 'CARTRIDGE';
          this.biosOnlyFrames = 0;
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

    this.sound.setSuppressToneOutput(this.fastBootTarget !== 'NONE');
    this.applyActiveCheatsToCpu();
    this.cpu.runFrame(speedMult);
    this.applyActiveCheatsToCpu();
    this.webLink.onFrameTick();
    this.virtualModem.onFrameTick();
    this.sound.endFrameDacCheck();

    // Check all 4 MMU banks, frame cartridge execution flag, and BIOS appId ($0168 == 4) with hysteresis
    // so cartridges that call BIOS subroutines in MMU1/MMU2 never flash the bezel or switch to 'OS'.
    const anyCartBankMapped =
      this.cpu.cartridgeExecutedThisFrame ||
      this.cpu.mmu[1] >= 0x20 ||
      this.cpu.mmu[2] >= 0x20 ||
      this.cpu.mmu[3] >= 0x20 ||
      this.cpu.mmu[4] >= 0x20 ||
      this.cpu.m_p_ram[0x0168] === 4;

    if (anyCartBankMapped || this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2') {
      this.activeApp = 'CARTRIDGE';
      this.biosOnlyFrames = 0;
    } else {
      this.biosOnlyFrames++;
      // Only transition back to 'OS' after 45 consecutive BIOS-only frames (~0.75s) when user exits to Main Menu
      if (this.biosOnlyFrames >= 45 || this.cpu.m_p_ram[0x0168] === 0) {
        this.activeApp = 'OS';
      }
    }

    // Evaluate RetroAchievements rcheevos conditions & leaderboards for the current frame
    this.retroAchievements.stepFrame(
      this.cpu,
      this.getActiveCartridge(),
      this.highScores.getActiveProfile().name
    );

    // Capture a lightweight Casual Mode Rewind snapshot every 15 frames (when not in Hardcore Mode)
    if (!this.retroAchievements.config.hardcoreMode && this.fastBootTarget === 'NONE') {
      this.rewindCaptureCounter++;
      if (this.rewindCaptureCounter >= 15) {
        this.rewindCaptureCounter = 0;
        if (this.rewindBuffer.length >= 48) {
          this.rewindBuffer.shift();
        }
        this.rewindBuffer.push({
          pc: this.cpu.m_PC,
          sp: this.cpu.m_SP,
          ps0: this.cpu.m_PS0,
          ps1: this.cpu.m_PS1,
          sys: this.cpu.m_SYS,
          ie0: this.cpu.m_IE0,
          ie1: this.cpu.m_IE1,
          ir0: this.cpu.m_IR0,
          ir1: this.cpu.m_IR1,
          mmu: new Uint8Array(this.cpu.mmu),
          regRam: new Uint8Array(this.cpu.m_register_ram),
          internalRam: new Uint8Array(this.cpu.m_p_ram),
          vram: new Uint8Array(this.cpu.videoram),
          nvram: new Uint8Array(this.cpu.nvram),
          raHitCounts: { ...this.retroAchievements.hitCounts }
        });
      }
    }
  }

  /**
   * Main Frame Tick (called at 60Hz by LCDScreen requestAnimationFrame)
   */
  public tick() {
    // Sync LCD & CPU accuracy settings (even when off/paused so palette/color/ghosting/contrast edits reflect live)
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
    this.cpu.vsyncEnabled = this.settings.vsync;
    this.linkCable.updatePeerHealth();

    if (!this.isPoweredOn) {
      this.lcd.clear(0);
      return;
    }

    if (this.isPaused) {
      return;
    }

    const baseMult = 1.0 * this.settings.speed;

    if (this.fastBootTarget !== 'NONE') {
      const burstFrames =
        this.fastBootTarget === 'CART_1' || this.fastBootTarget === 'CART_2' ? 56 : 28;
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
      if (this.nvramDirtyFrames === 0 && !this.hasActiveCheats()) {
        this.highScores.syncFromNvram(this.cpu.nvram);
      }
    }

    if (this.phoneBookDirtyFrames > 0) {
      this.phoneBookDirtyFrames--;
      if (this.phoneBookDirtyFrames === 0 && !this.hasActiveCheats()) {
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
      this.lcd.clear(0);
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
   * Moves the virtual stylus cursor across the 200x160 LCD screen
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
   * at the current virtualStylus coordinates.
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

  public activeSaveSlot: number = (() => {
    try {
      const raw = localStorage.getItem(ACTIVE_SAVE_SLOT_STORAGE_KEY);
      if (raw) return normalizeSlotIndex(parseInt(raw, 10));
    } catch {
      // Ignore storage errors
    }
    return 1;
  })();

  public setActiveSaveSlot(slotIndex: number): number {
    const normalized = normalizeSlotIndex(slotIndex);
    this.activeSaveSlot = normalized;
    try {
      localStorage.setItem(ACTIVE_SAVE_SLOT_STORAGE_KEY, String(normalized));
    } catch {
      // Ignore storage errors
    }
    return normalized;
  }

  public getSaveStateSlots(): SaveStateSlotSummary[] {
    return listSlotSummaries(this.slot1);
  }

  public saveState(slotIndex: number = this.activeSaveSlot): SaveStateActionResult {
    const slot = normalizeSlotIndex(slotIndex);
    if (!this.isPoweredOn) {
      return { ok: false, slotIndex: slot, message: 'Power on the console before saving a state.' };
    }
    const identity = getSlot1Identity(this.slot1);
    if (!identity) {
      return { ok: false, slotIndex: slot, message: 'Load a cartridge in Slot 1 before saving a state.' };
    }

    // Keep NVRAM managers synced from live hardware, without embedding NVRAM as restorable state
    this.highScores.syncFromNvram(this.cpu.nvram);
    this.phoneBook.syncFromNvram(this.cpu.nvram);

    const payload = buildSaveStatePayload(
      this.cpu,
      identity,
      slot,
      // Section A Compliance: Save state hit storage (RA_CaptureState)
      this.retroAchievements.captureRuntimeState()
    );

    const saved = writeSlotState(this.slot1, slot, payload);
    if (!saved) {
      return {
        ok: false,
        slotIndex: slot,
        message: `Failed to save state to Slot ${slot} (storage quota exceeded).`
      };
    }

    return {
      ok: true,
      slotIndex: slot,
      message: `Saved State to Slot ${slot} (${identity.slot1Title})`
    };
  }

  public loadState(slotIndex: number = this.activeSaveSlot): SaveStateActionResult {
    const slot = normalizeSlotIndex(slotIndex);
    if (this.retroAchievements.config.hardcoreMode) {
      const msg = 'Save State loading is disabled in Hardcore Mode.';
      this.onHardcoreViolation?.(msg);
      return { ok: false, slotIndex: slot, message: msg };
    }
    if (!this.isPoweredOn) {
      return { ok: false, slotIndex: slot, message: 'Power on the console before loading a state.' };
    }
    const currentIdentity = getSlot1Identity(this.slot1);
    if (!currentIdentity) {
      return { ok: false, slotIndex: slot, message: 'Load a cartridge in Slot 1 before loading a state.' };
    }

    const stateData = readSlotState(this.slot1, slot);
    if (!stateData) {
      return {
        ok: false,
        slotIndex: slot,
        message: `No Save State found in Slot ${slot} for "${currentIdentity.slot1Title}".`
      };
    }

    const match = verifySlot1IdentityMatch(currentIdentity, stateData.game);
    if (!match.ok) {
      return {
        ok: false,
        slotIndex: slot,
        message: match.error || 'Slot 1 title mismatch.'
      };
    }

    // Loading a save state taints the current session for Hardcore leaderboard attestation
    this.retroAchievements.taintSession('save_state');
    this.fastBootTarget = 'NONE';

    // Restore CPU/MMU/RAM/VRAM/Timers/Sound while keeping Battery NVRAM locked & protected
    applySaveStateToCpu(this.cpu, stateData);

    // Restore achievement hit counts & delta RAM buffers (`RA_RestoreState`)
    if (stateData.raRuntimeState) {
      this.retroAchievements.restoreRuntimeState(stateData.raRuntimeState);
    }
    this.lcd.currentBuffer.set(this.cpu.displayBuffer);

    return {
      ok: true,
      slotIndex: slot,
      message: `Loaded Slot ${slot} (${currentIdentity.slot1Title}) · NVRAM Protected`
    };
  }

  public deleteSaveState(slotIndex: number): SaveStateActionResult {
    const slot = normalizeSlotIndex(slotIndex);
    if (!this.slot1) {
      return { ok: false, slotIndex: slot, message: 'No cartridge loaded in Slot 1.' };
    }
    const ok = deleteSlotState(this.slot1, slot);
    return {
      ok,
      slotIndex: slot,
      message: ok ? `Deleted Save State in Slot ${slot}` : `Could not delete Slot ${slot}`
    };
  }

  public exportSaveState(slotIndex: number): {
    ok: boolean;
    filename?: string;
    content?: string;
    message: string;
  } {
    const slot = normalizeSlotIndex(slotIndex);
    const identity = getSlot1Identity(this.slot1);
    if (!identity) {
      return { ok: false, message: 'Load a cartridge in Slot 1 before exporting a save state.' };
    }
    const stateData = readSlotState(this.slot1, slot);
    if (!stateData) {
      return {
        ok: false,
        message: `Slot ${slot} is empty for "${identity.slot1Title}".`
      };
    }
    return {
      ok: true,
      filename: getSaveStateExportFilename(identity.slot1Title, slot),
      content: JSON.stringify(stateData, null, 2),
      message: `Exported Slot ${slot} (${identity.slot1Title})`
    };
  }

  public importSaveState(
    rawJson: string,
    targetSlot: number = this.activeSaveSlot,
    loadImmediately: boolean = false
  ): SaveStateActionResult {
    const slot = normalizeSlotIndex(targetSlot);
    const currentIdentity = getSlot1Identity(this.slot1);
    if (!currentIdentity) {
      return {
        ok: false,
        slotIndex: slot,
        message: 'Load the matching cartridge in Slot 1 before importing a save state.'
      };
    }

    const parsed = parseAndValidateSaveState(rawJson);
    if (!parsed.ok || !parsed.data) {
      return {
        ok: false,
        slotIndex: slot,
        message: parsed.error || 'Invalid save state file.'
      };
    }

    const match = verifySlot1IdentityMatch(currentIdentity, parsed.data.game);
    if (!match.ok) {
      return {
        ok: false,
        slotIndex: slot,
        message: match.error || 'Save state does not match the exact title in Slot 1.'
      };
    }

    const written = writeSlotState(this.slot1, slot, parsed.data);
    if (!written) {
      return {
        ok: false,
        slotIndex: slot,
        message: `Failed to store imported state in Slot ${slot} (storage quota exceeded).`
      };
    }

    if (loadImmediately) {
      return this.loadState(slot);
    }

    return {
      ok: true,
      slotIndex: slot,
      message: `Imported "${currentIdentity.slot1Title}" state into Slot ${slot}`
    };
  }
}
