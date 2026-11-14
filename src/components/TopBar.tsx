import React, { useState, useRef, useEffect } from 'react';
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
  ExternalLink,
  Crosshair,
  Camera
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
  onOpenBios: () => void;
  onOpenWindowsRelease: () => void;
  onOpenColorCustomizer: () => void;
  onTakeScreenshot?: () => void;
  onUpdate: () => void;
}

type MenuId = 'file' | 'emulation' | 'av' | 'view' | 'tools' | null;

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
  onOpenBios,
  onOpenWindowsRelease,
  onOpenColorCustomizer,
  onTakeScreenshot,
  onUpdate
}) => {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [recentSubmenuOpen, setRecentSubmenuOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const fileSlot1Ref = useRef<HTMLInputElement>(null);
  const fileSlot2Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setRecentSubmenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const closeMenu = () => {
    setOpenMenu(null);
    setRecentSubmenuOpen(false);
  };

  const handleLoadFileSlot = async (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await system.loadRomFromFile(file, slot);
      onUpdate();
    } catch (err) {
      console.error('ROM load error:', err);
    } finally {
      e.target.value = '';
      closeMenu();
    }
  };

  const handleLaunchRecent = async (entry: RecentGameEntry, slot?: 1 | 2) => {
    const ok = await system.launchRecentGame(entry, slot);
    if (!ok) {
      onOpenLibrary();
    }
    onUpdate();
    closeMenu();
  };

  const handleVolumeChange = (val: number) => {
    system.settings.volume = val;
    system.settings.muted = val === 0;
    system.sound.setVolume(val);
    system.sound.setMuted(val === 0);
    onUpdate();
  };

  const handleTouchGridOpacityChange = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    system.settings.touchGridOpacity = clamped / 100;
    system.settings.showTouchGrid = clamped > 0;
    onUpdate();
  };

  const handleToggleFullscreen = () => {
    const winDesktop = (window as any).gamecomDesktop;
    if (winDesktop?.toggleFullscreen) {
      winDesktop.toggleFullscreen();
    } else if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    closeMenu();
  };

  const handleScreenshot = () => {
    if (onTakeScreenshot) {
      onTakeScreenshot();
    } else {
      system.captureScreenshot();
    }
    closeMenu();
  };

  const touchGridPercent = Math.round((system.settings.touchGridOpacity || 0) * 100);
  const isScreenOnly = system.settings.viewMode === 'screen-only';
  const activeCart = system.activeSlot === 1 ? system.slot1 : system.slot2;
  const [lightShade, darkShade] = system.settings.twoShadeColors;

  return (
    <header
      ref={menuBarRef}
      className="w-full bg-[#181a20] border-b border-zinc-800 select-none z-40 shrink-0"
    >
      {/* Hidden File Inputs for Native Menu Bar */}
      <input
        ref={fileSlot1Ref}
        type="file"
        accept=".bin,.tgc,.rom,.zip"
        onChange={(e) => handleLoadFileSlot(e, 1)}
        className="hidden"
      />
      <input
        ref={fileSlot2Ref}
        type="file"
        accept=".bin,.tgc,.rom,.zip"
        onChange={(e) => handleLoadFileSlot(e, 2)}
        className="hidden"
      />

      <div className="w-full px-3 h-8 flex items-center justify-between text-xs">
        {/* Left: Brand + Classic Standalone Menu Bar */}
        <div className="flex items-center gap-0.5">
          <div className="flex items-center gap-2 pr-3 mr-1 border-r border-zinc-800">
            <span
              className="w-2.5 h-2.5 rounded-sm border border-black/40 shadow-inner"
              style={{ backgroundColor: lightShade }}
            />
            <span className="font-bold text-zinc-100 tracking-tight text-xs">
              Cub Spiele.Com
            </span>
          </div>

          {/* FILE MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
              onMouseEnter={() => openMenu && setOpenMenu('file')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                openMenu === 'file'
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              File
            </button>
            {openMenu === 'file' && (
              <div className="absolute left-0 top-full mt-0.5 w-68 bg-[#1c1f26] border border-zinc-700 rounded-md shadow-2xl py-1 z-50 text-xs text-zinc-200">
                <button
                  onClick={() => fileSlot1Ref.current?.click()}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{system.settings.advancedMode ? 'Load ROM into Slot 1...' : 'Open Game...'}</span>
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">Ctrl+O</span>
                </button>
                {system.settings.advancedMode && (
                  <button
                    onClick={() => fileSlot2Ref.current?.click()}
                    className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Load ROM into Slot 2...</span>
                    </span>
                    <span className="text-[10px] opacity-60 font-mono">Ctrl+Shift+O</span>
                  </button>
                )}

                {/* RECENTLY PLAYED SUBMENU */}
                <div
                  className="relative"
                  onMouseEnter={() => setRecentSubmenuOpen(true)}
                  onMouseLeave={() => setRecentSubmenuOpen(false)}
                >
                  <button
                    onClick={() => setRecentSubmenuOpen(!recentSubmenuOpen)}
                    className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <History className="w-3.5 h-3.5" />
                      <span>Recent Games</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {recentSubmenuOpen && (
                    <div className="absolute left-full top-0 ml-0.5 w-76 bg-[#1c1f26] border border-zinc-700 rounded-md shadow-2xl py-1 z-50">
                      <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
                        <span>Recent Games ({system.recentGames.length})</span>
                        {system.recentGames.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              system.clearRecentGames();
                              onUpdate();
                            }}
                            className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Clear
                          </button>
                        )}
                      </div>
                      {system.recentGames.length === 0 ? (
                        <div className="px-3 py-3 text-zinc-500 text-center text-[11px]">
                          No recently played games
                        </div>
                      ) : (
                        system.recentGames.map((item) => (
                          <div
                            key={`${item.id}_${item.slot}`}
                            className="px-2.5 py-1.5 hover:bg-zinc-800 flex items-center justify-between gap-2 border-b border-zinc-800/50 last:border-0"
                          >
                            <button
                              onClick={() => handleLaunchRecent(item)}
                              className="flex-1 text-left truncate cursor-pointer group"
                            >
                              <div className="text-zinc-200 group-hover:text-white font-medium truncate">
                                {item.title}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono">
                                {item.publisher} · {item.year}
                              </div>
                            </button>
                            {system.settings.advancedMode && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleLaunchRecent(item, 1)}
                                  className="px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-emerald-600 text-[10px] font-mono text-zinc-200 hover:text-white cursor-pointer"
                                >
                                  S1
                                </button>
                                <button
                                  onClick={() => handleLaunchRecent(item, 2)}
                                  className="px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-emerald-600 text-[10px] font-mono text-zinc-200 hover:text-white cursor-pointer"
                                >
                                  S2
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    onOpenLibrary();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Disc className="w-3.5 h-3.5" />
                    <span>Game Library...</span>
                  </span>
                </button>

                <div className="my-1 border-t border-zinc-800" />

                {system.settings.advancedMode ? (
                  <>
                    <button
                      onClick={() => {
                        if (system.slot1) {
                          system.launchCartridge(1);
                          onUpdate();
                        } else {
                          onOpenLibrary();
                        }
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="truncate">
                        Boot Slot 1: {system.slot1 ? system.slot1.title : '(Empty)'}
                      </span>
                      {system.activeSlot === 1 && system.activeApp === 'CARTRIDGE' && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (system.slot2) {
                          system.launchCartridge(2);
                          onUpdate();
                        } else {
                          onOpenLibrary();
                        }
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="truncate">
                        Boot Slot 2: {system.slot2 ? system.slot2.title : '(Empty)'}
                      </span>
                      {system.activeSlot === 2 && system.activeApp === 'CARTRIDGE' && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </button>

                    <div className="my-1 border-t border-zinc-800" />

                    <button
                      onClick={() => {
                        system.ejectCartridge(1);
                        onUpdate();
                        closeMenu();
                      }}
                      disabled={!system.slot1}
                      className="w-full px-3 py-1.5 hover:bg-rose-600 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between text-left cursor-pointer"
                    >
                      <span>Eject Slot 1</span>
                    </button>
                    <button
                      onClick={() => {
                        system.ejectCartridge(2);
                        onUpdate();
                        closeMenu();
                      }}
                      disabled={!system.slot2}
                      className="w-full px-3 py-1.5 hover:bg-rose-600 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between text-left cursor-pointer"
                    >
                      <span>Eject Slot 2</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      system.ejectCartridge(system.activeSlot);
                      onUpdate();
                      closeMenu();
                    }}
                    disabled={!activeCart}
                    className="w-full px-3 py-1.5 hover:bg-rose-600 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>Close Game</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* EMULATION MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'emulation' ? null : 'emulation')}
              onMouseEnter={() => openMenu && setOpenMenu('emulation')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                openMenu === 'emulation'
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              Emulation
            </button>
            {openMenu === 'emulation' && (
              <div className="absolute left-0 top-full mt-0.5 w-64 bg-[#1c1f26] border border-zinc-700 rounded-md shadow-2xl py-1 z-50 text-xs text-zinc-200">
                <button
                  onClick={() => {
                    system.pauseToggle();
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {system.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    <span>{system.isPaused ? 'Resume' : 'Pause'}</span>
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">P</span>
                </button>

                <button
                  onClick={() => {
                    system.resetSystem('MAIN_MENU');
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">Ctrl+R</span>
                </button>

                {system.settings.advancedMode && (
                  <>
                    <button
                      onClick={() => {
                        system.resetSystem('NONE');
                        onUpdate();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cold Boot (Full Startup)</span>
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        system.openBiosPhoneBookScreen();
                        onUpdate();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <BookUser className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Open Built-In Phone Book</span>
                      </span>
                    </button>
                  </>
                )}

                <div className="my-1 border-t border-zinc-800" />

                <button
                  onClick={() => {
                    system.saveState(0);
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span>Save State</span>
                  <span className="text-[10px] opacity-60 font-mono">F5</span>
                </button>
                <button
                  disabled={system.retroAchievements.config.hardcoreMode}
                  onClick={() => {
                    system.loadState(0);
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between text-left cursor-pointer"
                >
                  <span>
                    Load State
                    {system.retroAchievements.config.hardcoreMode ? ' [Hardcore Locked]' : ''}
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">F8</span>
                </button>

                <button
                  disabled={system.retroAchievements.config.hardcoreMode}
                  onClick={() => {
                    system.frameAdvance();
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between text-left cursor-pointer"
                >
                  <span>
                    Frame Advance (+1 Frame)
                    {system.retroAchievements.config.hardcoreMode ? ' [Hardcore Locked]' : ''}
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">F</span>
                </button>

                <button
                  disabled={system.retroAchievements.config.hardcoreMode}
                  onClick={() => {
                    system.rewindStep();
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between text-left cursor-pointer"
                >
                  <span>
                    Rewind ({system.getRewindSnapshotsCount()})
                    {system.retroAchievements.config.hardcoreMode ? ' [Hardcore Locked]' : ''}
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">[</span>
                </button>

                <div className="my-1 border-t border-zinc-800" />

                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Game Speed
                </div>
                {[0.5, 1.0, 1.5, 2.0, 3.0].map((spd) => {
                  const lockedByHardcore =
                    system.retroAchievements.config.hardcoreMode && spd < 1.0;
                  return (
                    <button
                      key={spd}
                      disabled={lockedByHardcore}
                      onClick={() => {
                        system.setClockSpeed(spd);
                        onUpdate();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between text-left cursor-pointer"
                    >
                      <span>
                        {spd === 1.0
                          ? '1x (Normal Speed)'
                          : spd > 1.0
                            ? `${spd}x (Fast Forward)`
                            : `0.5x (Slow Motion)${lockedByHardcore ? ' [Locked]' : ''}`}
                      </span>
                      {system.settings.speed === spd && (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </button>
                  );
                })}

                <div className="my-1 border-t border-zinc-800" />

                <button
                  onClick={() => {
                    system.toggleHardcoreMode();
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-amber-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Hardcore Mode</span>
                  </span>
                  {system.retroAchievements.config.hardcoreMode && (
                    <Check className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </button>

                <button
                  onClick={() => {
                    onOpenLinkCable();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Cable className="w-3.5 h-3.5 text-emerald-400" />
                    <span>2-Player Link Cable...</span>
                  </span>
                </button>

                {system.settings.advancedMode && (
                  <>
                    <button
                      onClick={() => {
                        system.linkCable.launchSecondInstanceWindow();
                        onUpdate();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                        <span>Launch 2nd Window (Multiplayer)</span>
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        system.settings.backgroundInput = !system.settings.backgroundInput;
                        system.saveInputSettingsToStorage();
                        onUpdate();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                    >
                      <span>Background Input</span>
                      {system.settings.backgroundInput && (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </button>
                  </>
                )}

                <div className="my-1 border-t border-zinc-800" />

                <button
                  onClick={() => {
                    system.powerToggle();
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-rose-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span>{system.isPoweredOn ? 'Power Off' : 'Power On'}</span>
                </button>
              </div>
            )}
          </div>

          {/* AUDIO / VIDEO MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'av' ? null : 'av')}
              onMouseEnter={() => openMenu && setOpenMenu('av')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                openMenu === 'av'
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              Audio/Video
            </button>
            {openMenu === 'av' && (
              <div className="absolute left-0 top-full mt-0.5 w-76 bg-[#1c1f26] border border-zinc-700 rounded-md shadow-2xl py-1.5 z-50 text-xs text-zinc-200">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Screen Color Presets
                </div>

                {GAMECOM_SCREEN_PRESET_ORDER.map((presetId) => {
                  const preset = PALETTES[presetId];
                  const isSelected = system.settings.palette === presetId;
                  return (
                    <button
                      key={presetId}
                      onClick={() => {
                        system.applyScreenPreset(presetId, true);
                        onUpdate();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer group"
                    >
                      <span className="flex items-center gap-2 truncate pr-2">
                        <span className="flex items-center rounded overflow-hidden border border-black/40 shrink-0">
                          <span
                            className="w-2.5 h-2.5 block"
                            style={{ backgroundColor: preset.colors[0] }}
                          />
                          <span
                            className="w-2.5 h-2.5 block"
                            style={{ backgroundColor: preset.colors[3] }}
                          />
                        </span>
                        <span className="truncate">{preset.name}</span>
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 group-hover:text-white shrink-0" />}
                    </button>
                  );
                })}

                <div className="my-1 border-t border-zinc-800" />

                <button
                  onClick={() => {
                    onOpenColorCustomizer();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Custom Screen Colors...</span>
                  </span>
                </button>

                <button
                  onClick={() => {
                    system.settings.pixelGrid = !system.settings.pixelGrid;
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span>Pixel Grid</span>
                  {system.settings.pixelGrid && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>

                {system.settings.advancedMode && (
                  <button
                    onClick={() => {
                      onOpenAccuracy();
                      closeMenu();
                    }}
                    className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>LCD Motion Blur & Accuracy...</span>
                    <span className="text-[10px] font-mono text-amber-400">
                      {Math.round(system.settings.ghosting * 100)}%
                    </span>
                  </button>
                )}

                <div className="my-1 border-t border-zinc-800" />

                <div className="px-3 py-1.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <button
                      onClick={() => {
                        system.soundToggle();
                        onUpdate();
                      }}
                      className="flex items-center gap-1.5 text-zinc-300 hover:text-white cursor-pointer"
                    >
                      {system.settings.muted ? (
                        <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>Volume</span>
                    </button>
                    <span className="font-mono text-emerald-400">
                      {system.settings.muted ? 'Muted' : `${Math.round(system.settings.volume * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={system.settings.muted ? 0 : system.settings.volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* VIEW MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
              onMouseEnter={() => openMenu && setOpenMenu('view')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                openMenu === 'view'
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              View
            </button>
            {openMenu === 'view' && (
              <div className="absolute left-0 top-full mt-0.5 w-68 bg-[#1c1f26] border border-zinc-700 rounded-md shadow-2xl py-1.5 z-50 text-xs text-zinc-200">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Layout
                </div>
                <button
                  onClick={() => {
                    system.settings.viewMode = 'console';
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Gamepad2 className="w-3.5 h-3.5" />
                    <span>Handheld Console View</span>
                  </span>
                  {!isScreenOnly && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  onClick={() => {
                    system.settings.viewMode = 'screen-only';
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Screen-Only View</span>
                  </span>
                  {isScreenOnly && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>

                <div className="my-1 border-t border-zinc-800" />
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Screen Size
                </div>
                {[2, 3, 4].map((scale) => (
                  <button
                    key={scale}
                    onClick={() => {
                      system.settings.screenScale = scale;
                      system.settings.viewMode = 'screen-only';
                      onUpdate();
                      closeMenu();
                    }}
                    className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>
                      {scale}x ({200 * scale}×{160 * scale})
                    </span>
                    {isScreenOnly && system.settings.screenScale === scale && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                ))}

                <div className="my-1 border-t border-zinc-800" />
                <div className="px-3 py-1.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <Grid className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Touch Grid Visibility</span>
                    </span>
                    <span className="font-mono text-emerald-400">{touchGridPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={touchGridPercent}
                    onChange={(e) => handleTouchGridOpacityChange(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                <div className="my-1 border-t border-zinc-800" />
                <button
                  onClick={() => {
                    system.toggleScoreOverlay();
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>Score Display Overlay</span>
                  </span>
                  {system.settings.showScoreOverlay && (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>

                <button
                  onClick={handleScreenshot}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5 text-sky-400" />
                    <span>Take Screenshot (PNG)</span>
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">F9 / F12</span>
                </button>

                <div className="my-1 border-t border-zinc-800" />
                <button
                  onClick={() => {
                    system.settings.advancedMode = !system.settings.advancedMode;
                    system.saveInputSettingsToStorage();
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-amber-400" />
                    <span>Advanced Mode</span>
                  </span>
                  {system.settings.advancedMode && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>

                <button
                  onClick={handleToggleFullscreen}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Fullscreen</span>
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">F11</span>
                </button>
              </div>
            )}
          </div>

          {/* TOOLS MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'tools' ? null : 'tools')}
              onMouseEnter={() => openMenu && setOpenMenu('tools')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                openMenu === 'tools'
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              Tools
            </button>
            {openMenu === 'tools' && (
              <div className="absolute left-0 top-full mt-0.5 w-68 bg-[#1c1f26] border border-zinc-700 rounded-md shadow-2xl py-1 z-50 text-xs text-zinc-200">
                {system.linkCable.instanceNumber === 1 && (
                  <>
                    <button
                      onClick={() => {
                        onOpenHighScores();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>High Scores & Leaderboards...</span>
                    </button>
                    <button
                      onClick={() => {
                        if (onOpenAchievements) {
                          onOpenAchievements();
                        } else {
                          onOpenHighScores();
                        }
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>RetroAchievements & RAIntegration...</span>
                      </span>
                      <span className="text-[10px] font-mono text-amber-400">
                        {system.retroAchievements.unlocks.length}/
                        {system.retroAchievements.getAllAchievements().length}
                      </span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    onOpenKeybinds();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <Keyboard className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Controls & Keybindings...</span>
                </button>
                <button
                  onClick={() => {
                    onOpenLinkCable();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <Cable className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2-Player Link Cable...</span>
                </button>
                <button
                  onClick={() => {
                    system.toggleDpadStylusMode();
                    onUpdate();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Crosshair className="w-3.5 h-3.5 text-rose-400" />
                    <span>Virtual Stylus Mode (Tab)</span>
                  </span>
                  {system.virtualStylus.dpadStylusMode && (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>
                <button
                  onClick={() => {
                    onOpenColorCustomizer();
                    closeMenu();
                  }}
                  className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Screen Colors...</span>
                </button>
                {system.linkCable.instanceNumber === 1 && (
                  <button
                    onClick={() => {
                      onOpenWindowsRelease();
                      closeMenu();
                    }}
                    className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400" />
                    <span>Downloads (Windows / macOS / Android)...</span>
                  </button>
                )}

                {system.settings.advancedMode && (
                  <>
                    <div className="my-1 border-t border-zinc-800" />
                    <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      Advanced Tools
                    </div>
                    <button
                      onClick={() => {
                        onOpenAccuracy();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Hardware Accuracy & Ghosting...</span>
                    </button>
                    {system.linkCable.instanceNumber === 1 && (
                      <button
                        onClick={() => {
                          onOpenPhoneBook();
                          closeMenu();
                        }}
                        className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                      >
                        <BookUser className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Phone Book Manager...</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onOpenDebugger();
                        closeMenu();
                      }}
                      className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5 text-sky-400" />
                      <span>CPU Debugger...</span>
                    </button>
                    {system.linkCable.instanceNumber === 1 && (
                      <button
                        onClick={() => {
                          onOpenBios();
                          closeMenu();
                        }}
                        className="w-full px-3 py-1.5 hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 text-left cursor-pointer"
                      >
                        <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                        <span>BIOS ROM Manager...</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Clean Quick Actions */}
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          {system.linkCable.instanceNumber > 1 ? (
            <span
              className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold"
              title="Player 2 Linked Instance with Isolated NVRAM (Softcore Only)"
            >
              P{system.linkCable.instanceNumber} • Softcore Link (Isolated NVRAM)
            </span>
          ) : (
            <>
              <button
                onClick={() => {
                  system.toggleHardcoreMode();
                  onUpdate();
                }}
                className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold transition cursor-pointer border ${
                  system.retroAchievements.config.hardcoreMode
                    ? system.retroAchievements.isSessionHardcoreClean()
                      ? 'bg-amber-950/70 border-amber-500/60 text-amber-300 hover:bg-amber-900/70'
                      : 'bg-rose-950/70 border-rose-500/60 text-rose-300 hover:bg-rose-900/70'
                    : 'bg-zinc-800/70 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
                title={
                  system.linkCable.mode !== 'off'
                    ? 'Compete.Com Link Multiplayer is locked to Softcore (Casual) Mode'
                    : system.retroAchievements.config.hardcoreMode
                      ? 'Hardcore Mode Active (Save states, rewind, frame advance & slow motion disabled per RetroAchievements compliance)'
                      : 'Casual Mode Active (Click to cold-boot into Hardcore Mode)'
                }
              >
                <ShieldCheck className="w-3 h-3" />
                <span>
                  {system.linkCable.mode !== 'off'
                    ? 'Softcore (Link)'
                    : system.retroAchievements.config.hardcoreMode
                      ? 'Hardcore'
                      : 'Casual'}
                </span>
              </button>

              <button
                onClick={() => {
                  if (onOpenAchievements) {
                    onOpenAchievements();
                  } else {
                    onOpenHighScores();
                  }
                }}
                className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-200 font-mono text-[10px] transition cursor-pointer"
                title="Open RetroAchievements & RAIntegration DLL Manager"
              >
                <Trophy className="w-3 h-3 text-purple-400" />
                <span>
                  RA {system.retroAchievements.unlocks.length}/
                  {system.retroAchievements.getAllAchievements().length}
                </span>
              </button>

              <button
                onClick={onOpenHighScores}
                className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 transition cursor-pointer"
                title="High Scores, Leaderboards & Achievements"
              >
                <Trophy className="w-3 h-3 text-amber-400" />
                <span className="font-medium">High Scores</span>
              </button>
            </>
          )}

          {system.virtualStylus.dpadStylusMode && (
            <button
              onClick={() => {
                system.toggleDpadStylusMode();
                onUpdate();
              }}
              className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[10px] cursor-pointer"
              title="Virtual Stylus Mode Active (Press Tab to switch back to D-Pad)"
            >
              <Crosshair className="w-3 h-3" />
              <span>Stylus</span>
            </button>
          )}

          <button
            onClick={onOpenLibrary}
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 transition cursor-pointer"
            title="Open Game Library"
          >
            <Disc className="w-3 h-3 text-emerald-400" />
            <span className="truncate max-w-[150px] font-medium">
              {activeCart ? activeCart.title : 'Open Game'}
            </span>
          </button>

          <button
            onClick={handleScreenshot}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium transition cursor-pointer"
            title="Take Screenshot (F9 / F12)"
          >
            <Camera className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">Screenshot</span>
          </button>

          <button
            onClick={() => {
              system.settings.viewMode = isScreenOnly ? 'console' : 'screen-only';
              onUpdate();
            }}
            className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-medium transition cursor-pointer"
            title="Switch between Console View and Screen-Only View"
          >
            {isScreenOnly ? `Screen ${system.settings.screenScale}×` : 'Console'}
          </button>

          <button
            onClick={() => {
              system.soundToggle();
              onUpdate();
            }}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            title={system.settings.muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {system.settings.muted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
