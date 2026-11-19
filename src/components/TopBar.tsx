import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import {
  RecentGameEntry,
  GAMECOM_SCREEN_PRESET_ORDER,
  PALETTES
} from '../emulator/types';
import {
  Disc,
  Cpu,
  Volume2,
  VolumeX,
  RotateCcw,
  Pause,
  Play,
  Terminal,
  Keyboard,
  ShieldCheck,
  Trophy,
  HardDrive,
  Download,
  FolderOpen,
  Maximize2,
  Gamepad2,
  History,
  Trash2,
  Grid,
  Check,
  ChevronRight,
  Monitor,
  Palette,
  BookUser,
  Cable,
  Globe,
  Radio,
  ExternalLink,
  Crosshair,
  Camera,
  Sun,
  Moon,
  Smartphone,
  Contrast,
  Power,
  SlidersHorizontal,
  StepForward,
  Rewind,
  Gauge,
  PanelBottom,
  Zap
} from 'lucide-react';

interface TopBarProps {
  system: GameComSystem;
  onOpenLibrary: () => void;
  onOpenAccuracy: () => void;
  onOpenDebugger: () => void;
  onOpenKeybinds: () => void;
  onOpenHighScores: () => void;
  onOpenAchievements?: () => void;
  onOpenPhoneBook: () => void;
  onOpenLinkCable: () => void;
  onWebLinkSync: () => void;
  onOpenVirtualModem: () => void;
  onOpenBios: () => void;
  onOpenWindowsRelease: () => void;
  onOpenColorCustomizer: () => void;
  onOpenAbout: () => void;
  onOpenSaveStates: () => void;
  onShowToast?: (message: string) => void;
  onTakeScreenshot?: () => void;
  onUpdate: () => void;
}

type MenuId = 'file' | 'emulation' | 'view' | 'display' | 'settings' | 'tools' | null;
type SubMenuId =
  | 'library'
  | 'recent'
  | 'save-slots'
  | 'speed'
  | 'presets'
  | 'view-screen-size'
  | 'view-touch-size'
  | 'view-display'
  | 'tools-cheats'
  | null;

const SCREEN_SCALES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TOUCH_SCALES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const SPEED_OPTIONS = [0.5, 1.0, 1.28, 1.5, 2.0, 3.0] as const;

function formatSpeedLabel(spd: number): string {
  const pct = Math.round(spd * 100);
  const mult = Number.isInteger(spd * 10) ? spd.toFixed(1) : spd.toFixed(2);
  return `${pct}% (${mult}×)`;
}

export const TopBar: React.FC<TopBarProps> = ({
  system,
  onOpenLibrary,
  onOpenAccuracy,
  onOpenDebugger,
  onOpenKeybinds,
  onOpenHighScores,
  onOpenAchievements,
  onOpenPhoneBook,
  onOpenLinkCable,
  onWebLinkSync,
  onOpenVirtualModem,
  onOpenBios,
  onOpenWindowsRelease,
  onOpenColorCustomizer,
  onOpenAbout,
  onOpenSaveStates,
  onShowToast,
  onTakeScreenshot,
  onUpdate
}) => {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [openSubMenu, setOpenSubMenu] = useState<SubMenuId>(null);
  const [repoUrlInput, setRepoUrlInput] = useState('');
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const slot1InputRef = useRef<HTMLInputElement>(null);
  const slot2InputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setOpenSubMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setOpenSubMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const closeMenus = () => {
    setOpenMenu(null);
    setOpenSubMenu(null);
  };

  const toggleMenu = (id: Exclude<MenuId, null>) => {
    setOpenSubMenu(null);
    setOpenMenu((prev) => (prev === id ? null : id));
  };

  const handleRomSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: 1 | 2
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await system.loadRomFromFile(file, slot);
    closeMenus();
    onUpdate();
  };

  const handleLaunchRecent = async (entry: RecentGameEntry, slot: 1 | 2) => {
    await system.launchRecentGame(entry, slot);
    closeMenus();
    onUpdate();
  };

  const handleLaunchOnlineGame = async (
    entry: typeof system.onlineLibrary[number],
    slot: 1 | 2
  ) => {
    try {
      closeMenus();
      onShowToast?.(`Loading ${entry.title}...`);
      onUpdate();
      await system.loadOnlineRomEntry(entry, slot);
      onShowToast?.(`Loaded ${entry.title} into Slot ${slot}`);
      onUpdate();
    } catch (err) {
      onShowToast?.((err as Error).message || `Failed to load ${entry.title}`);
      onUpdate();
    }
  };

  const handleAddRepositoryUrl = async () => {
    const trimmed = repoUrlInput.trim();
    if (!trimmed || isAddingRepo) return;
    setIsAddingRepo(true);
    try {
      const res = await system.addRomRepositoryUrl(trimmed);
      setRepoUrlInput('');
      onShowToast?.(
        `Scanned repository: ${res.addedCount} ROMs found (${res.totalCount} unique games in Library)`
      );
      onUpdate();
    } catch (err) {
      onShowToast?.((err as Error).message || 'Failed to scan ROM repository URL');
    } finally {
      setIsAddingRepo(false);
    }
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    closeMenus();
  };

  const handleScreenshot = () => {
    if (onTakeScreenshot) {
      onTakeScreenshot();
    } else {
      system.captureScreenshot();
    }
    closeMenus();
  };

  const isDark = system.settings.theme === 'dark';
  const isAdvanced = system.settings.advancedMode;
  const isFullFit = system.settings.screenFitMode === 'full';
  const isTouchAuto = system.settings.touchScaleMode === 'auto';
  const isTouchFull = system.settings.touchScaleMode === 'full';
  const isHardcore = system.retroAchievements.config.hardcoreMode;
  const touchOrientation = system.settings.touchOrientation || 'auto';
  const hasActiveCheats = system.hasActiveCheats();

  useEffect(() => {
    system.onCheatsChanged = onUpdate;
    return () => {
      if (system.onCheatsChanged === onUpdate) {
        system.onCheatsChanged = undefined;
      }
    };
  }, [system, onUpdate]);

  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 || window.innerHeight < 560 : false
  );

  useEffect(() => {
    const updateViewport = () => {
      setIsCompactViewport(window.innerWidth < 768 || window.innerHeight < 560);
    };
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  useLayoutEffect(() => {
    if (!openMenu || !menuRef.current) return;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const dropdowns = menuRef.current.querySelectorAll<HTMLElement>('[data-topbar-dropdown]');
    dropdowns.forEach((el) => {
      el.style.transform = '';
      const rect = el.getBoundingClientRect();
      let dx = 0;
      if (rect.right > vw - pad) {
        dx = vw - pad - rect.right;
      }
      if (rect.left + dx < pad) {
        dx = pad - rect.left;
      }
      if (dx !== 0) {
        el.style.transform = `translateX(${Math.round(dx)}px)`;
      }
      if (!isCompactViewport) {
        const availH = Math.max(200, vh - rect.top - pad);
        if (rect.height > availH) {
          el.style.maxHeight = `${Math.floor(availH)}px`;
          el.style.overflowY = 'auto';
        } else {
          el.style.maxHeight = '';
          el.style.overflowY = '';
        }
      }
    });

    if (!isCompactViewport) {
      const submenus = menuRef.current.querySelectorAll<HTMLElement>('[data-topbar-submenu]');
      submenus.forEach((sub) => {
        sub.style.left = '';
        sub.style.right = '';
        sub.style.transform = '';
        const rect = sub.getBoundingClientRect();
        if (rect.right > vw - pad) {
          sub.style.left = 'auto';
          sub.style.right = '100%';
          const flipped = sub.getBoundingClientRect();
          if (flipped.left < pad) {
            sub.style.transform = `translateX(${Math.round(pad - flipped.left)}px)`;
          }
        }
        if (rect.bottom > vh - pad) {
          const availSubH = Math.max(180, vh - rect.top - pad);
          sub.style.maxHeight = `${Math.floor(availSubH)}px`;
          sub.style.overflowY = 'auto';
        } else {
          sub.style.maxHeight = '';
          sub.style.overflowY = '';
        }
      });
    }
  }, [openMenu, openSubMenu, isCompactViewport]);

  const menuBtnClass = (id: Exclude<MenuId, null>) =>
    `px-1.5 sm:px-2.5 py-1 rounded text-[11px] sm:text-[12px] font-medium transition-colors whitespace-nowrap ${
      openMenu === id
        ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-white'
        : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white'
    }`;

  const dropdownClass = `absolute left-0 top-full mt-1 w-64 max-w-[calc(100vw-16px)] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl py-1.5 z-50 text-[12px] text-zinc-800 dark:text-zinc-200 ${
    isCompactViewport ? 'max-h-[calc(100dvh-4rem)] overflow-y-auto' : ''
  }`;

  const getSubMenuClass = (desktopWidthClass: string) =>
    isCompactViewport
      ? 'w-full pl-2 my-1 border-l-2 border-indigo-500/40 bg-zinc-50/80 dark:bg-zinc-950/80 rounded-r-md py-1'
      : `absolute left-full top-0 ml-0.5 ${desktopWidthClass} max-w-[calc(100vw-16px)] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl py-1.5 z-50`;

  const itemClass =
    'w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors disabled:opacity-40 disabled:pointer-events-none';

  const dividerClass = 'my-1 border-t border-zinc-200 dark:border-zinc-800';
  const sectionLabelClass =
    'px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500';

  return (
    <header
      ref={menuRef}
      className="min-h-9 h-auto py-0.5 shrink-0 bg-zinc-50 dark:bg-black border-b border-zinc-200 dark:border-zinc-900 px-2 sm:px-2.5 flex flex-wrap items-center justify-between gap-1 sm:gap-2 select-none z-40 transition-colors"
    >
      {/* Hidden ROM File Inputs */}
      <input
        ref={slot1InputRef}
        type="file"
        accept=".bin,.tgc,.rom,.zip"
        className="hidden"
        onChange={(e) => handleRomSelected(e, 1)}
      />
      <input
        ref={slot2InputRef}
        type="file"
        accept=".bin,.tgc,.rom,.zip"
        className="hidden"
        onChange={(e) => handleRomSelected(e, 2)}
      />

      {/* Left: App Brand + Reorganized Desktop Menu Bar */}
      <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 min-w-0">
        <div className="flex items-center gap-1.5 pr-1.5 sm:pr-2 mr-0.5 sm:mr-1 border-r border-zinc-200 dark:border-zinc-800">
          <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
          <span className="hidden sm:inline text-[12px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
            Cub Spiele.Com
          </span>
        </div>

        {/* FILE MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu('file')}
            className={menuBtnClass('file')}
          >
            File
          </button>
          {openMenu === 'file' && (
            <div data-topbar-dropdown="" className={dropdownClass}>
              {/* Power at top of File */}
              <button
                type="button"
                onClick={() => {
                  system.powerToggle();
                  closeMenus();
                  onUpdate();
                }}
                className={`${itemClass} font-medium ${
                  system.isPoweredOn
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Power className="w-3.5 h-3.5" />
                  <span>{system.isPoweredOn ? 'Power Off' : 'Power On'}</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">F10</span>
              </button>

              <div className={dividerClass} />

              <button
                type="button"
                onClick={() => slot1InputRef.current?.click()}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Load ROM (Slot 1)...</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">Ctrl+O</span>
              </button>

              <button
                type="button"
                onClick={() => slot2InputRef.current?.click()}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Disc className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Load ROM (Slot 2)...</span>
                </span>
              </button>

              {/* Online Library Submenu (single entry per discovered game) */}
              <div
                className="relative"
                onMouseEnter={() => setOpenSubMenu('library')}
                onMouseLeave={() => setOpenSubMenu(null)}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenSubMenu((prev) => (prev === 'library' ? null : 'library'))
                  }
                  className={itemClass}
                >
                  <span className="flex items-center gap-2">
                    <Gamepad2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>
                      Library
                      {system.onlineLibrary.length > 0
                        ? ` (${system.onlineLibrary.length})`
                        : ''}
                    </span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                </button>
                {openSubMenu === 'library' && (
                  <div data-topbar-submenu="" className={getSubMenuClass('w-80')}>
                    {system.onlineLibrary.length === 0 ? (
                      <div className="px-3 py-2 space-y-1.5">
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          No online repository configured yet. Add a Game.Com ROM repository URL in{' '}
                          <strong>Settings</strong> or <strong>Game Library</strong>.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenLibrary();
                            closeMenus();
                          }}
                          className="w-full px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium text-center"
                        >
                          Open Game Library &amp; Repositories...
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
                          {system.onlineLibrary.map((entry) => (
                            <div
                              key={entry.gameId}
                              className="px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                            >
                              <button
                                type="button"
                                onClick={() => handleLaunchOnlineGame(entry, 1)}
                                className="flex-1 flex items-center gap-2 min-w-0 text-left"
                                title={`${entry.title} (${entry.year}) — ${entry.publisher}`}
                              >
                                {entry.labelImage ? (
                                  <img
                                    src={entry.labelImage}
                                    alt={entry.title}
                                    className="w-9 h-5 object-cover rounded border border-zinc-300 dark:border-zinc-700 shrink-0"
                                  />
                                ) : (
                                  <Disc className="w-4 h-4 text-zinc-400 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[12px] font-medium text-zinc-900 dark:text-zinc-100">
                                    {entry.title}
                                  </div>
                                  <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                                    {entry.year} · {entry.genre}
                                  </div>
                                </div>
                              </button>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleLaunchOnlineGame(entry, 1)}
                                  className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-indigo-600 hover:text-white text-[10px]"
                                  title="Load & Play in Slot 1"
                                >
                                  S1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleLaunchOnlineGame(entry, 2)}
                                  className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-indigo-600 hover:text-white text-[10px]"
                                  title="Load into Slot 2"
                                >
                                  S2
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={dividerClass} />
                        <button
                          type="button"
                          onClick={() => {
                            onOpenLibrary();
                            closeMenus();
                          }}
                          className="w-full px-3 py-1.5 flex items-center justify-between text-indigo-600 dark:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-[11px] font-medium"
                        >
                          <span>Browse Visual Game Library...</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onOpenLibrary();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Gamepad2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Game Library...</span>
                </span>
              </button>

              <div className={dividerClass} />

              <button
                type="button"
                onClick={() => {
                  const res = system.saveState(system.activeSaveSlot);
                  onShowToast?.(res.message);
                  closeMenus();
                  onUpdate();
                }}
                disabled={!system.isPoweredOn || !system.slot1}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Save State (Slot {system.activeSaveSlot})</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">F5</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = system.loadState(system.activeSaveSlot);
                  onShowToast?.(res.message);
                  closeMenus();
                  onUpdate();
                }}
                disabled={!system.isPoweredOn || !system.slot1}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Load State (Slot {system.activeSaveSlot})</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">F8</span>
              </button>

              {/* Select Active Save Slot submenu */}
              <div
                className="relative"
                onMouseEnter={() => setOpenSubMenu('save-slots')}
                onMouseLeave={() => setOpenSubMenu((prev) => (prev === 'save-slots' ? null : prev))}
              >
                <button
                  type="button"
                  onClick={() => setOpenSubMenu(openSubMenu === 'save-slots' ? null : 'save-slots')}
                  className={itemClass}
                >
                  <span className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Save State Slot</span>
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                    <span>#{system.activeSaveSlot}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                {openSubMenu === 'save-slots' && (
                  <div
                    data-topbar-submenu=""
                    className={getSubMenuClass('w-56')}
                  >
                    {system.getSaveStateSlots().map((slotInfo) => (
                      <button
                        key={slotInfo.slotIndex}
                        type="button"
                        onClick={() => {
                          system.setActiveSaveSlot(slotInfo.slotIndex);
                          onShowToast?.(`Active Save Slot set to Slot ${slotInfo.slotIndex}`);
                          closeMenus();
                          onUpdate();
                        }}
                        className={itemClass}
                      >
                        <span className="flex items-center gap-2">
                          {system.activeSaveSlot === slotInfo.slotIndex ? (
                            <Check className="w-3.5 h-3.5 text-[#7a1f5c] dark:text-[#eab5d8]" />
                          ) : (
                            <span className="w-3.5" />
                          )}
                          <span>Slot {slotInfo.slotIndex}</span>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {slotInfo.exists && slotInfo.timestamp
                            ? new Date(slotInfo.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Empty'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onOpenSaveStates();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Save State Manager (Import/Export)...</span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleScreenshot}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Take Screenshot</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">F9</span>
              </button>

              {(system.slot1 || system.slot2) && (
                <>
                  <div className={dividerClass} />
                  {system.slot1 && (
                    <button
                      type="button"
                      onClick={() => {
                        system.ejectCartridge(1);
                        closeMenus();
                        onUpdate();
                      }}
                      className={`${itemClass} text-rose-600 dark:text-rose-400`}
                    >
                      <span className="truncate">Eject Slot 1 ({system.slot1.title})</span>
                    </button>
                  )}
                  {system.slot2 && (
                    <button
                      type="button"
                      onClick={() => {
                        system.ejectCartridge(2);
                        closeMenus();
                        onUpdate();
                      }}
                      className={`${itemClass} text-rose-600 dark:text-rose-400`}
                    >
                      <span className="truncate">Eject Slot 2 ({system.slot2.title})</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* EMULATION MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu('emulation')}
            className={menuBtnClass('emulation')}
          >
            Emulation
          </button>
          {openMenu === 'emulation' && (
            <div data-topbar-dropdown="" className={dropdownClass}>
              <button
                type="button"
                onClick={() => {
                  system.pauseToggle();
                  closeMenus();
                  onUpdate();
                }}
                disabled={!system.isPoweredOn}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  {system.isPaused ? (
                    <Play className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Pause className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span>{system.isPaused ? 'Resume' : 'Pause'}</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">P</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  system.resetSystem('NONE');
                  closeMenus();
                  onUpdate();
                }}
                disabled={!system.isPoweredOn}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Reset</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">Ctrl+R</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  system.toggleFastBoot();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Fast Boot (Skip BIOS Intro)</span>
                </span>
                {system.settings.fastBoot && (
                  <Check className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  system.frameAdvance();
                  onUpdate();
                }}
                disabled={!system.isPoweredOn}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <StepForward className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Frame Advance</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">F</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  system.rewindStep();
                  onUpdate();
                }}
                disabled={
                  !system.isPoweredOn || system.getRewindSnapshotsCount() === 0
                }
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Rewind className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Rewind ({system.getRewindSnapshotsCount()})</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">[</span>
              </button>

              <div className={dividerClass} />

              {/* Game Speed Submenu */}
              <div
                className="relative"
                onMouseEnter={() => setOpenSubMenu('speed')}
                onMouseLeave={() => setOpenSubMenu(null)}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenSubMenu((prev) => (prev === 'speed' ? null : 'speed'))
                  }
                  className={itemClass}
                >
                  <span className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Speed ({Math.round(system.settings.speed * 100)}%)</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                </button>
                {openSubMenu === 'speed' && (
                  <div data-topbar-submenu="" className={getSubMenuClass('w-40')}>
                    {SPEED_OPTIONS.map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => {
                          system.setClockSpeed(spd);
                          closeMenus();
                          onUpdate();
                        }}
                        className={itemClass}
                      >
                        <span>{formatSpeedLabel(spd)}</span>
                        {Math.abs(system.settings.speed - spd) < 0.02 && (
                          <Check className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onOpenLinkCable();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Cable className="w-3.5 h-3.5 text-zinc-400" />
                  <span>2-Player Link Cable...</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onWebLinkSync();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Tiger Web Link Sync</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenVirtualModem();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Virtual Hayes Modem...</span>
                </span>
              </button>

              {isAdvanced && (
                <>
                  <div className={dividerClass} />
                  <div className={sectionLabelClass}>Advanced</div>
                  <button
                    type="button"
                    onClick={() => {
                      system.resetSystem('MAIN_MENU');
                      closeMenus();
                      onUpdate();
                    }}
                    className={itemClass}
                  >
                    <span className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Fast Boot to BIOS Menu</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      system.openBiosPhoneBookScreen();
                      closeMenus();
                      onUpdate();
                    }}
                    className={itemClass}
                  >
                    <span className="flex items-center gap-2">
                      <BookUser className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Boot Built-In Phone Book</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      system.linkCable.launchSecondInstanceWindow();
                      closeMenus();
                      onUpdate();
                    }}
                    className={itemClass}
                  >
                    <span className="flex items-center gap-2">
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Launch 2nd Instance Window</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      system.settings.backgroundInput = !system.settings.backgroundInput;
                      system.saveInputSettingsToStorage();
                      onUpdate();
                    }}
                    className={itemClass}
                  >
                    <span>Background Input</span>
                    {system.settings.backgroundInput && (
                      <Check className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      system.toggleHardcoreMode();
                      onUpdate();
                    }}
                    className={itemClass}
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck className={`w-3.5 h-3.5 ${isHardcore ? 'text-amber-500' : 'text-zinc-400'}`} />
                      <span>Hardcore Mode (No Saves/Rewind)</span>
                    </span>
                    {isHardcore && (
                      <Check className="w-3.5 h-3.5 text-amber-500" />
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* VIEW MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu('view')}
            className={menuBtnClass('view')}
          >
            View
          </button>
          {openMenu === 'view' && (
            <div data-topbar-dropdown="" className={`${dropdownClass} w-72`}>
              <div className={sectionLabelClass}>View Mode</div>
              <div className="px-3 py-1 grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    system.setViewMode('screen-only');
                    onUpdate();
                  }}
                  className={`px-2 py-1.5 rounded border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    system.settings.viewMode === 'screen-only'
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Monitor className="w-3 h-3 shrink-0" />
                  <span>Screen</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    system.setTouchOrientation('horizontal');
                    if (system.settings.consoleModel === 'minimal') {
                      system.setConsoleModel('original');
                    } else {
                      system.setViewMode('touch');
                    }
                    onUpdate();
                  }}
                  className={`px-2 py-1.5 rounded border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    system.settings.viewMode === 'touch' &&
                    system.settings.consoleModel !== 'minimal' &&
                    system.settings.touchOrientation !== 'vertical'
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Gamepad2 className="w-3 h-3 shrink-0" />
                  <span>Handheld</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    system.setTouchOrientation('vertical');
                    system.setConsoleModel('minimal');
                    onUpdate();
                  }}
                  className={`px-2 py-1.5 rounded border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    system.settings.viewMode === 'touch' &&
                    (system.settings.consoleModel === 'minimal' ||
                      system.settings.touchOrientation === 'vertical')
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Smartphone className="w-3 h-3 shrink-0" />
                  <span>Vertical</span>
                </button>
              </div>

              {/* Released Console Hardware Models */}
              <div className={dividerClass} />
              <div className={sectionLabelClass}>Console Model (Bezel &amp; Controls)</div>
              <div className="px-2 py-0.5 space-y-0.5">
                {(
                  [
                    {
                      id: 'original',
                      label: '1997 Original Game.Com',
                      sub: '#71-500 Dual-Slot',
                      dot: '#9ca3af'
                    },
                    {
                      id: 'pocketpro_backlit',
                      label: '1999 Pocket Pro Backlit',
                      sub: '#71-520 Teal Light',
                      dot: '#06b6d4'
                    },
                    {
                      id: 'pocketpro_purple',
                      label: '1998 Pocket Pro (Purple)',
                      sub: '#71-510 Translucent',
                      dot: '#8b5cf6'
                    },
                    {
                      id: 'pocketpro_green',
                      label: '1999 Pocket Pro (Green)',
                      sub: '#71-510 Translucent',
                      dot: '#10b981'
                    },
                    {
                      id: 'pocketpro_blue',
                      label: '1999 Pocket Pro (Blue)',
                      sub: '#71-510 Translucent',
                      dot: '#3b82f6'
                    },
                    {
                      id: 'pocketpro_pink',
                      label: '1999 Pocket Pro (Pink)',
                      sub: '#71-510 Translucent',
                      dot: '#ec4899'
                    },
                    {
                      id: 'minimal',
                      label: 'Vertical Pocket (Classic)',
                      sub: 'Portrait Handheld',
                      dot: '#eab308'
                    }
                  ] as const
                ).map((m) => {
                  const active =
                    system.settings.viewMode === 'touch' && system.settings.consoleModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        system.setTouchOrientation(m.id === 'minimal' ? 'vertical' : 'horizontal');
                        system.setConsoleModel(m.id);
                        onUpdate();
                      }}
                      className={`w-full px-2.5 py-1 rounded flex items-center justify-between text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 font-semibold'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                          style={{ backgroundColor: m.dot }}
                        />
                        <span className="truncate text-[11px]">{m.label}</span>
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 shrink-0 ml-1">
                        {active ? <Check className="w-3.5 h-3.5 text-indigo-500" /> : m.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Inline Zoom / Scale Controls */}
              <div className={dividerClass} />
              {system.settings.viewMode === 'screen-only' ? (
                <>
                  <div className={sectionLabelClass}>Screen Scale (200×160)</div>
                  <div className="px-3 py-1 space-y-1.5">
                    <div className="grid grid-cols-5 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          system.setScreenFitMode('full');
                          onUpdate();
                        }}
                        className={`py-1 rounded border text-[11px] font-medium transition-colors cursor-pointer ${
                          isFullFit
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                        }`}
                      >
                        Auto
                      </button>
                      {[2, 3, 4, 5].map((scale) => {
                        const active = !isFullFit && system.settings.screenScale === scale;
                        return (
                          <button
                            key={scale}
                            type="button"
                            onClick={() => {
                              system.setScreenScale(scale);
                              onUpdate();
                            }}
                            className={`py-1 rounded border text-[11px] font-mono transition-colors cursor-pointer ${
                              active
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                            }`}
                          >
                            {scale}×
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        system.toggleIntegerScaling();
                        onUpdate();
                      }}
                      className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-between text-[11px] cursor-pointer"
                    >
                      <span>Integer Pixel Scaling</span>
                      <span className="font-mono text-[10px] text-indigo-500">
                        {system.settings.integerScaling ? 'ON (Sharp)' : 'OFF (Smooth)'}
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={sectionLabelClass}>Console Zoom &amp; Framing</div>
                  <div className="px-3 py-1 space-y-1.5">
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: 'full-system', label: 'Full' },
                          { id: 'mid', label: 'Mid' },
                          { id: 'closeup', label: 'Close' }
                        ] as const
                      ).map((z) => {
                        const active = (system.settings.bezelZoom || 'auto') === z.id;
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => {
                              system.setBezelZoom(z.id);
                              onUpdate();
                            }}
                            className={`py-1 rounded border text-[11px] font-medium transition-colors cursor-pointer ${
                              active
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                            }`}
                          >
                            {z.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((scale) => {
                        const active =
                          system.settings.bezelZoom === 'scale' &&
                          Math.abs(system.settings.touchScale - scale) < 0.1;
                        return (
                          <button
                            key={scale}
                            type="button"
                            onClick={() => {
                              system.setTouchScale(scale);
                              system.setBezelZoom('scale');
                              onUpdate();
                            }}
                            className={`py-1 rounded border text-[11px] font-mono transition-colors cursor-pointer ${
                              active
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                            }`}
                          >
                            {scale}×
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Overlays & Window Controls */}
              <div className={dividerClass} />
              <div className="px-3 py-1 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>Touch Grid Visibility</span>
                  <span className="font-mono tabular-nums">
                    {Math.round(system.settings.touchGridOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(system.settings.touchGridOpacity * 100)}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    system.settings.touchGridOpacity = pct / 100;
                    system.settings.showTouchGrid = pct > 0;
                    system.saveViewSettingsToStorage();
                    onUpdate();
                  }}
                  className="w-full accent-indigo-500 h-1.5 cursor-pointer"
                  aria-label="Touch Grid Visibility"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  system.toggleScoreOverlay();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span>Score Display Overlay</span>
                {system.settings.showScoreOverlay && (
                  <Check className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  system.settings.showStylusReticle = !system.settings.showStylusReticle;
                  system.saveViewSettingsToStorage();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span>Virtual Stylus Reticle</span>
                {system.settings.showStylusReticle && (
                  <Check className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </button>

              <div className={dividerClass} />

              <button
                type="button"
                onClick={() => {
                  system.toggleTheme();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  {isDark ? (
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span>{isDark ? 'Dark Mode (Pure Black)' : 'Light Mode'}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  system.toggleBottomBar();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <PanelBottom className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Status Bar</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-400">Ctrl+B</span>
                  {system.settings.showBottomBar && (
                    <Check className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={handleFullscreen}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Fullscreen</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">F11</span>
              </button>
            </div>
          )}
        </div>

        {/* DISPLAY MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu('display')}
            className={menuBtnClass('display')}
          >
            Display
          </button>
          {openMenu === 'display' && (
            <div data-topbar-dropdown="" className={`${dropdownClass} w-68`}>
              {/* Screen Color Presets Submenu */}
              <div
                className="relative"
                onMouseEnter={() => setOpenSubMenu('presets')}
                onMouseLeave={() => setOpenSubMenu(null)}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenSubMenu((prev) => (prev === 'presets' ? null : 'presets'))
                  }
                  className={itemClass}
                >
                  <span className="flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Screen Color Presets</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                </button>
                {openSubMenu === 'presets' && (
                  <div data-topbar-submenu="" className={getSubMenuClass('w-60')}>
                    {GAMECOM_SCREEN_PRESET_ORDER.map((presetId) => {
                      const preset = PALETTES[presetId];
                      if (!preset) return null;
                      return (
                        <button
                          key={presetId}
                          type="button"
                          onClick={() => {
                            system.applyScreenPreset(presetId, true);
                            closeMenus();
                            onUpdate();
                          }}
                          className={itemClass}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span
                              className="w-3 h-3 rounded-sm border border-zinc-400/50 shrink-0"
                              style={{ backgroundColor: preset.colors[0] }}
                            />
                            <span className="truncate">{preset.name}</span>
                          </span>
                          {system.settings.palette === presetId && (
                            <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onOpenColorCustomizer();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Custom Screen Colors...</span>
                </span>
              </button>

              <div className={dividerClass} />

              <div className="px-3 py-1.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Contrast className="w-3 h-3 text-zinc-400" />
                    <span>LCD Contrast</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {Math.round(system.settings.contrast * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(system.settings.contrast * 100)}
                  onChange={(e) => {
                    system.setContrast(Number(e.target.value) / 100);
                    onUpdate();
                  }}
                  className="w-full accent-indigo-500 h-1.5 cursor-pointer"
                  aria-label="LCD Contrast"
                />
              </div>

              <div className="px-3 py-1.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Monitor className="w-3 h-3 text-zinc-400" />
                    <span>LCD Ghosting</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {Math.round(
                      (system.accuracyFixes.stnGhostingAccurate
                        ? system.settings.ghosting
                        : 0) * 100
                    )}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(
                    (system.accuracyFixes.stnGhostingAccurate
                      ? system.settings.ghosting
                      : 0) * 100
                  )}
                  onChange={(e) => {
                    const val = Number(e.target.value) / 100;
                    const persistence =
                      system.settings.ghostingPersistence > 0
                        ? system.settings.ghostingPersistence
                        : val > 0
                          ? 0.65
                          : 0;
                    system.accuracyFixes.stnGhostingAccurate =
                      val > 0 || persistence > 0;
                    system.setGhostingParameters(val, persistence);
                    onUpdate();
                  }}
                  className="w-full accent-indigo-500 h-1.5 cursor-pointer"
                  aria-label="LCD Ghosting"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  system.settings.pixelGrid = !system.settings.pixelGrid;
                  system.saveViewSettingsToStorage();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Grid className="w-3.5 h-3.5 text-zinc-400" />
                  <span>LCD Pixel Grid</span>
                </span>
                {system.settings.pixelGrid && (
                  <Check className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  system.toggleVsync();
                  onUpdate();
                }}
                className={itemClass}
                title="Default OFF for authentic scanline-by-scanline LCD tearing. Turn ON to latch a tear-free frame at VBlank."
              >
                <span className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                  <span>V-Sync (Tear-Free Frame Latch)</span>
                </span>
                {system.settings.vsync && (
                  <Check className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </button>

              <div className={dividerClass} />

              <button
                type="button"
                onClick={() => {
                  onOpenAccuracy();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                  <span>LCD Ghosting &amp; Accuracy...</span>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* SETTINGS MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu('settings')}
            className={menuBtnClass('settings')}
          >
            Settings
          </button>
          {openMenu === 'settings' && (
            <div data-topbar-dropdown="" className={`${dropdownClass} w-68`}>
              <div className={sectionLabelClass}>Audio</div>

              <div className="px-3 py-1.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>Hardware Speaker Volume</span>
                  <span className="font-mono">
                    {Math.round(system.settings.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(system.settings.volume * 100)}
                  onChange={(e) => {
                    const vol = Number(e.target.value) / 100;
                    system.settings.volume = vol;
                    system.sound.setVolume(vol);
                    if (vol > 0 && system.settings.muted) {
                      system.settings.muted = false;
                      system.sound.setMuted(false);
                    }
                    system.saveViewSettingsToStorage();
                    onUpdate();
                  }}
                  className="w-full accent-indigo-500 h-1.5 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  system.soundToggle();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  {system.settings.muted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  <span>{system.settings.muted ? 'Unmute Audio' : 'Mute Audio'}</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">M</span>
              </button>

              <div className={dividerClass} />
              <div className={sectionLabelClass}>Input</div>

              <button
                type="button"
                onClick={() => {
                  onOpenKeybinds();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Keyboard className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Controls & Keybindings...</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  system.toggleDpadStylusMode();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Crosshair className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Virtual Stylus (D-Pad Cursor)</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-400">Tab</span>
                  {system.virtualStylus.dpadStylusMode && (
                    <Check className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                </span>
              </button>

              <div className={dividerClass} />
              <div className={sectionLabelClass}>Notifications</div>

              <button
                type="button"
                onClick={() => {
                  system.settings.highScoreNotifications =
                    !system.settings.highScoreNotifications;
                  system.saveInputSettingsToStorage();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>High Score Notifications</span>
                </span>
                {system.settings.highScoreNotifications && (
                  <Check className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </button>

              <div className={dividerClass} />
              <div className={sectionLabelClass}>Online ROM Repository</div>

              <div className="px-3 py-1.5 space-y-1.5">
                <div className="flex items-center gap-1">
                  <input
                    type="url"
                    value={repoUrlInput}
                    onChange={(e) => setRepoUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRepositoryUrl();
                      }
                    }}
                    placeholder="https://archive.org/download/..."
                    className="flex-1 min-w-0 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={isAddingRepo || !repoUrlInput.trim()}
                    onClick={handleAddRepositoryUrl}
                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-medium shrink-0 cursor-pointer"
                  >
                    {isAddingRepo ? '...' : 'Add'}
                  </button>
                </div>
                {system.repositoryUrls.length > 0 && (
                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span>
                        {system.repositoryUrls.length} repo
                        {system.repositoryUrls.length === 1 ? '' : 's'} ·{' '}
                        {system.onlineLibrary.length} games
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          system.clearAllRomRepositories();
                          onUpdate();
                        }}
                        className="text-rose-500 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* TOOLS MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu('tools')}
            className={menuBtnClass('tools')}
          >
            Tools
          </button>
          {openMenu === 'tools' && (
            <div data-topbar-dropdown="" className={dropdownClass}>
              <button
                type="button"
                onClick={() => {
                  onOpenHighScores();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>High Scores & Leaderboards...</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenPhoneBook();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <BookUser className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Phone Book Manager...</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenWindowsRelease();
                  closeMenus();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Desktop & Mobile Releases...</span>
                </span>
              </button>

              <div className={dividerClass} />

              <div
                className="relative"
                onMouseEnter={() => setOpenSubMenu('tools-cheats')}
                onMouseLeave={() =>
                  setOpenSubMenu((prev) => (prev === 'tools-cheats' ? null : prev))
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenSubMenu((prev) =>
                      prev === 'tools-cheats' ? null : 'tools-cheats'
                    )
                  }
                  className={itemClass}
                >
                  <span className="flex items-center gap-2">
                    <Zap
                      className={`w-3.5 h-3.5 ${
                        hasActiveCheats ? 'text-amber-500' : 'text-zinc-400'
                      }`}
                    />
                    <span>Cheat Codes & Unlocks</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                </button>
                {openSubMenu === 'tools-cheats' && (
                  <div data-topbar-submenu="" className={getSubMenuClass('w-72')}>
                    <div className={sectionLabelClass}>Fighters Megamix</div>
                    <button
                      type="button"
                      disabled={isHardcore}
                      onClick={() => {
                        system.toggleCheat('fmUnlockFighters');
                        onUpdate();
                      }}
                      className={itemClass}
                      title="Unlocks Kids Sarah, Janet, Hornet & Siba"
                    >
                      <span>Unlock Hidden Fighters</span>
                      {system.cheats.fmUnlockFighters && (
                        <Check className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isHardcore}
                      onClick={() => {
                        system.toggleCheat('fmUnlockModes');
                        onUpdate();
                      }}
                      className={itemClass}
                      title="Unlocks secret courses & bonus modes"
                    >
                      <span>Unlock Hidden Modes</span>
                      {system.cheats.fmUnlockModes && (
                        <Check className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </button>

                    <div className={dividerClass} />
                    <div className={sectionLabelClass}>Mortal Kombat Trilogy</div>
                    <button
                      type="button"
                      disabled={isHardcore}
                      onClick={() => {
                        system.toggleCheat('mktUnlockFighters');
                        onUpdate();
                      }}
                      className={itemClass}
                      title="Unlocks Ermac & Noob Saibot"
                    >
                      <span>Unlock Hidden Fighters (Ermac & Noob)</span>
                      {system.cheats.mktUnlockFighters && (
                        <Check className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isHardcore}
                      onClick={() => {
                        system.toggleCheat('mktUnlockModes');
                        onUpdate();
                      }}
                      className={itemClass}
                      title="Unlocks the secret '?' Options Menu"
                    >
                      <span>Unlock Secret "?" Options Menu</span>
                      {system.cheats.mktUnlockModes && (
                        <Check className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </button>

                    <div className={dividerClass} />
                    <div className={sectionLabelClass}>Other Games</div>
                    <button
                      type="button"
                      disabled={isHardcore}
                      onClick={() => {
                        system.toggleCheat('lightsOutUnlockLevels');
                        onUpdate();
                      }}
                      className={itemClass}
                      title="Unlocks all Lights Out puzzle levels in isolated Unlock NVRAM"
                    >
                      <span>Lights Out: Unlock All Levels</span>
                      {system.cheats.lightsOutUnlockLevels && (
                        <Check className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </button>

                    {hasActiveCheats && (
                      <>
                        <div className={dividerClass} />
                        <button
                          type="button"
                          onClick={() => {
                            system.clearAllCheats(true);
                            onUpdate();
                          }}
                          className={itemClass}
                        >
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Disable All Cheats & Restore NVRAM
                          </span>
                        </button>
                      </>
                    )}

                    <div className={dividerClass} />
                    <div className="px-3 py-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                      {isHardcore
                        ? 'Disabled in Hardcore Mode to protect competitive integrity.'
                        : 'Off by default · Isolated Unlock NVRAM (saves & scores protected) · Synced to P2.'}
                    </div>
                  </div>
                )}
              </div>

              <div className={dividerClass} />

              <button
                type="button"
                onClick={() => {
                  const nextAdv = !system.settings.advancedMode;
                  system.settings.advancedMode = nextAdv;
                  system.toggleRetroAchievements(nextAdv);
                  system.saveViewSettingsToStorage();
                  onUpdate();
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Advanced Mode</span>
                </span>
                {isAdvanced && <Check className="w-3.5 h-3.5 text-indigo-500" />}
              </button>

              {isAdvanced && (
                <>
                  <div className={dividerClass} />
                  <div className={sectionLabelClass}>Advanced Tools</div>

                  {onOpenAchievements && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAchievements();
                        closeMenus();
                      }}
                      className={itemClass}
                    >
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                        <span>RetroAchievements &amp; RAIntegration...</span>
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onOpenDebugger();
                      closeMenus();
                    }}
                    className={itemClass}
                  >
                    <span className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                      <span>CPU & Memory Debugger...</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onOpenBios();
                      closeMenus();
                    }}
                    className={itemClass}
                  >
                    <span className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                      <span>BIOS ROM Manager...</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ABOUT BUTTON */}
        <button
          type="button"
          onClick={() => {
            closeMenus();
            onOpenAbout();
          }}
          className="px-2.5 py-1 rounded text-[12px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white transition-colors"
        >
          About
        </button>
      </div>

      {/* Right: Quick Controls */}
      <div className="flex items-center gap-1.5">
        {system.linkCable.instanceNumber === 2 && (
          <span className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-semibold">
            P2 · Softcore Link
          </span>
        )}

        {system.virtualStylus.dpadStylusMode && (
          <button
            type="button"
            onClick={() => {
              system.toggleDpadStylusMode();
              onUpdate();
            }}
            className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold flex items-center gap-1"
            title="Virtual Stylus Active (Tab to toggle)"
          >
            <Crosshair className="w-3 h-3" />
            <span>Stylus</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            system.powerToggle();
            onUpdate();
          }}
          className={`p-1.5 rounded transition-colors ${
            system.isPoweredOn
              ? 'text-rose-600 dark:text-rose-400 hover:bg-zinc-200 dark:hover:bg-zinc-900'
              : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-900'
          }`}
          title={system.isPoweredOn ? 'Power Off (Alt+P)' : 'Power On (Alt+P)'}
          aria-label={system.isPoweredOn ? 'Power Off' : 'Power On'}
        >
          <Power className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            closeMenus();
            onOpenHighScores();
          }}
          className="p-1.5 rounded text-amber-600 dark:text-amber-400 hover:bg-zinc-200 dark:hover:bg-zinc-900 transition-colors"
          title="High Scores & Leaderboards"
          aria-label="High Scores & Leaderboards"
        >
          <Trophy className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleScreenshot}
          className="p-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-900 transition-colors"
          title="Take Screenshot (F9 / F12)"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>

        {/* Hardcore / Softcore Quick Toggle */}
        <button
          type="button"
          onClick={() => {
            system.toggleHardcoreMode();
            onUpdate();
          }}
          className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
            isHardcore
              ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-400 border border-amber-500/40'
              : 'bg-zinc-200/70 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
          }`}
          title={
            isHardcore
              ? 'Hardcore Mode Active (No Save States/Rewind/Slowdown) — Click to switch to Softcore'
              : 'Softcore Mode Active — Click to switch to Hardcore Mode (Resets system)'
          }
        >
          <ShieldCheck className={`w-3.5 h-3.5 ${isHardcore ? 'text-amber-500' : 'text-zinc-500 dark:text-zinc-400'}`} />
          <span className="hidden md:inline">{isHardcore ? 'Hardcore' : 'Softcore'}</span>
        </button>

        {/* Screen / Full / Touch quick toggle */}
        <button
          type="button"
          onClick={() => {
            system.toggleViewMode();
            onUpdate();
          }}
          className="px-2 py-1 rounded text-[11px] font-medium bg-zinc-200/70 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center gap-1 transition-colors"
          title="Toggle Screen-Only / Touch View"
        >
          {system.settings.viewMode === 'screen-only' ? (
            <>
              <Monitor className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden lg:inline">
                {isFullFit ? 'Full' : `${system.settings.screenScale}×`}
              </span>
            </>
          ) : (
            <>
              <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden lg:inline">Touch</span>
            </>
          )}
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => {
            system.toggleTheme();
            onUpdate();
          }}
          className="p-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-900 transition-colors"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-zinc-700" />
          )}
        </button>

        {/* Mute toggle */}
        <button
          type="button"
          onClick={() => {
            system.soundToggle();
            onUpdate();
          }}
          className="p-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-900 transition-colors"
          title={system.settings.muted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
        >
          {system.settings.muted ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-500" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
          )}
        </button>
      </div>
    </header>
  );
};
