import React, { useRef, useState, useEffect } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { LCDPaletteId, PALETTES, RecentGameEntry } from '../emulator/types';
import {
  downloadWindowsPortableZip,
  downloadAntigravityWorkspaceZip
} from '../utils/windowsReleasePackager';
import {
  Disc,
  Trophy,
  Wrench,
  Bug,
  Play,
  Upload,
  Cpu,
  Keyboard,
  Monitor,
  Maximize2,
  Gamepad2,
  Clock,
  Check,
  Trash2,
  Grid3X3,
  Volume2,
  VolumeX,
  RotateCcw,
  Pause,
  Camera,
  Download,
  Code2
} from 'lucide-react';

interface TopBarProps {
  system: GameComSystem;
  onLoadRomFile?: (file: File, slot?: 1 | 2) => void;
  onOpenLibrary: () => void;
  onOpenHighScores: () => void;
  onOpenAccuracy: () => void;
  onOpenReleases?: () => void;
  onOpenBios?: () => void;
  onOpenControls?: () => void;
  onOpenDebugger: () => void;
  onSaveState?: () => void;
  onLoadState?: () => void;
  onTakeScreenshot?: () => void;
  onNotify?: (message: string, sub?: string, type?: 'success' | 'info' | 'error') => void;
  onUpdate: () => void;
}

type OpenMenuId = 'file' | 'emulation' | 'av' | 'tools' | 'view' | 'recent-quick' | null;

export const TopBar: React.FC<TopBarProps> = ({
  system,
  onLoadRomFile,
  onOpenLibrary,
  onOpenHighScores,
  onOpenAccuracy,
  onOpenReleases,
  onOpenBios,
  onOpenControls,
  onOpenDebugger,
  onSaveState,
  onLoadState,
  onTakeScreenshot,
  onNotify,
  onUpdate
}) => {
  const fileInputSlot1Ref = useRef<HTMLInputElement | null>(null);
  const fileInputSlot2Ref = useRef<HTMLInputElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenuId>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLaunchRecent = async (entry: RecentGameEntry, slot: 1 | 2) => {
    setOpenMenu(null);
    const ok = await system.launchRecentGame(entry, slot);
    if (ok) {
      onNotify?.(`Booting ${entry.title}`, `Loaded from Recently Played into Slot ${slot}`, 'success');
      onUpdate();
    } else {
      onNotify?.(
        'Reload Custom ROM File',
        `Select ${entry.title} from disk to load into Slot ${slot}`,
        'info'
      );
      if (slot === 2) fileInputSlot2Ref.current?.click();
      else fileInputSlot1Ref.current?.click();
    }
  };

  const handleTouchGridSlider = (val: number) => {
    system.settings.touchGridOpacity = val;
    system.settings.showTouchGrid = val > 0;
    onUpdate();
  };

  const effectiveGridOpacity = system.settings.showTouchGrid
    ? Math.max(0.05, system.settings.touchGridOpacity || 0.45)
    : system.settings.touchGridOpacity;

  return (
    <header
      ref={menuContainerRef}
      className="w-full bg-[#12141a] border-b border-[#282c37] select-none z-40"
    >
      {/* Hidden File Inputs for Slot 1 & Slot 2 */}
      <input
        ref={fileInputSlot1Ref}
        type="file"
        accept=".bin,.tgc,.zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onLoadRomFile) {
            onLoadRomFile(file, 1);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={fileInputSlot2Ref}
        type="file"
        accept=".bin,.tgc,.zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onLoadRomFile) {
            onLoadRomFile(file, 2);
            e.target.value = '';
          }
        }}
      />

      {/* =================================================================== */}
      {/* ROW 1: NATIVE STANDALONE DESKTOP MENU BAR (mGBA / melonDS STYLE)     */}
      {/* =================================================================== */}
      <div className="w-full bg-[#181b22] border-b border-[#252934] px-3 h-7 flex items-center justify-between text-xs">
        <div className="flex items-center gap-0.5">
          {/* App Mini Emblem */}
          <div className="flex items-center gap-1.5 pr-2.5 mr-1 border-r border-[#2b303d] text-[11px] font-bold text-[#e2e8f0]">
            <span className="w-2 h-2 rounded-full bg-[#e11d48]" />
            <span className="tracking-tight">Cub Spiele.Com</span>
          </div>

          {/* FILE MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
              onMouseEnter={() => openMenu && openMenu !== 'recent-quick' && setOpenMenu('file')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                openMenu === 'file'
                  ? 'bg-[#2b3140] text-white'
                  : 'text-[#cbd5e1] hover:bg-[#222632] hover:text-white'
              }`}
            >
              File
            </button>
            {openMenu === 'file' && (
              <div className="absolute left-0 top-full mt-0.5 w-72 bg-[#181b23] border border-[#323846] rounded-lg shadow-2xl py-1.5 z-50 text-xs">
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    fileInputSlot1Ref.current?.click();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Load ROM into Slot 1...</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+O</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    fileInputSlot2Ref.current?.click();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Load ROM into Slot 2...</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+Shift+O</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenLibrary();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Cartridge Library &amp; Dual Slots...</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+L</span>
                </button>

                <div className="my-1 border-t border-[#292e3b]" />

                {/* RECENTLY PLAYED SUBSECTION */}
                <div className="px-3 py-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#94a3b8]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#a3ae76]" />
                    Recently Played ({system.recentGames.length})
                  </span>
                  {system.recentGames.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        system.clearRecentGames();
                        onUpdate();
                      }}
                      className="text-[10px] text-rose-400 hover:underline flex items-center gap-0.5"
                      title="Clear Recently Played List"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      Clear
                    </button>
                  )}
                </div>

                {system.recentGames.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-[#64748b] italic">
                    No recently played cartridges
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto">
                    {system.recentGames.map((item) => (
                      <div
                        key={`${item.id}_${item.slot}`}
                        className="px-3 py-1.5 hover:bg-[#232836] flex items-center justify-between gap-2 group"
                      >
                        <button
                          onClick={() => handleLaunchRecent(item, item.slot)}
                          className="flex-1 text-left truncate text-[11px] text-[#cbd5e1] group-hover:text-white font-medium"
                          title={`Boot ${item.title} in Slot ${item.slot}`}
                        >
                          {item.title}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleLaunchRecent(item, 1)}
                            className="px-1.5 py-0.5 rounded bg-[#252a38] hover:bg-[#a3ae76] hover:text-[#111318] text-[9px] font-mono text-[#cbd5e1]"
                            title="Boot in Slot 1"
                          >
                            S1
                          </button>
                          <button
                            onClick={() => handleLaunchRecent(item, 2)}
                            className="px-1.5 py-0.5 rounded bg-[#252a38] hover:bg-[#38bdf8] hover:text-[#090d16] text-[9px] font-mono text-[#cbd5e1]"
                            title="Boot in Slot 2"
                          >
                            S2
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="my-1 border-t border-[#292e3b]" />

                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onSaveState?.();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Save State (Slot 0)</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">F5</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onLoadState?.();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Load State (Slot 0)</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">F8</span>
                </button>

                <div className="my-1 border-t border-[#292e3b]" />

                <button
                  onClick={async () => {
                    setOpenMenu(null);
                    onNotify?.(
                      'Packaging Google Antigravity Workspace (.zip)...',
                      'Bundling full source, GEMINI.md, .agents/, .vscode/, and cub-spiele-com.code-workspace',
                      'info'
                    );
                    const bytes = await downloadAntigravityWorkspaceZip();
                    onNotify?.(
                      'Downloaded CubSpieleCom-Antigravity-Workspace.zip',
                      `Verified ${(bytes / (1024 * 1024)).toFixed(2)} MB Google Antigravity Desktop Workspace`,
                      'success'
                    );
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#d9e3b1] hover:bg-[#282e3d] flex items-center justify-between font-semibold"
                >
                  <span className="flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-[#a3ae76]" />
                    Download Antigravity Workspace (.zip)
                  </span>
                  <span className="text-[10px] font-mono text-[#a3ae76]">IDE</span>
                </button>

                <button
                  onClick={async () => {
                    setOpenMenu(null);
                    onNotify?.('Packaging CubSpieleCom Win64 (.zip)...', 'Building standalone PE32+ executable & ROM bundle', 'info');
                    const bytes = await downloadWindowsPortableZip();
                    onNotify?.(
                      'Downloaded CubSpieleCom-v1.2.0-win64.zip',
                      `Verified ${(bytes / (1024 * 1024)).toFixed(2)} MB Windows x64 Portable Archive`,
                      'success'
                    );
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#38bdf8] hover:bg-[#282e3d] flex items-center justify-between font-semibold"
                >
                  <span className="flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Download Win64 Release (.zip)
                  </span>
                  <span className="text-[10px] font-mono">x64</span>
                </button>
              </div>
            )}
          </div>

          {/* EMULATION MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'emulation' ? null : 'emulation')}
              onMouseEnter={() => openMenu && openMenu !== 'recent-quick' && setOpenMenu('emulation')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                openMenu === 'emulation'
                  ? 'bg-[#2b3140] text-white'
                  : 'text-[#cbd5e1] hover:bg-[#222632] hover:text-white'
              }`}
            >
              Emulation
            </button>
            {openMenu === 'emulation' && (
              <div className="absolute left-0 top-full mt-0.5 w-64 bg-[#181b23] border border-[#323846] rounded-lg shadow-2xl py-1.5 z-50 text-xs">
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    system.pauseToggle();
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>{system.isPaused ? 'Resume Emulation' : 'Pause Emulation'}</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">P</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    system.resetSystem('MAIN_MENU');
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Soft Reset (BIOS Main Menu)</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+R</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    system.resetSystem('NONE');
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Cold Boot (3D Globe &amp; Chime)</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+Shift+R</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    system.powerToggle();
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>{system.isPoweredOn ? 'Power Off Console' : 'Power On Console'}</span>
                </button>

                <div className="my-1 border-t border-[#292e3b]" />

                <button
                  onClick={() => {
                    setOpenMenu(null);
                    system.launchCartridge(1);
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#d9e3b1] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span className="truncate">
                    Boot Slot 1: {system.slot1 ? system.slot1.title.split(' (')[0] : 'Empty'}
                  </span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+1</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    system.launchCartridge(2);
                    onUpdate();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#bae6fd] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span className="truncate">
                    Boot Slot 2: {system.slot2 ? system.slot2.title.split(' (')[0] : 'Empty'}
                  </span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+2</span>
                </button>

                <div className="my-1 border-t border-[#292e3b]" />
                <div className="px-3 py-1 text-[10px] font-mono uppercase text-[#94a3b8]">
                  Clock Speed (SM8521 4.9152 MHz)
                </div>
                {[0.5, 1.0, 2.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => {
                      system.settings.speed = spd;
                      onUpdate();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                  >
                    <span>{spd === 1.0 ? '1.0× (Native 59.73 Hz)' : `${spd}× Speed`}</span>
                    {system.settings.speed === spd && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AUDIO / VIDEO MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'av' ? null : 'av')}
              onMouseEnter={() => openMenu && openMenu !== 'recent-quick' && setOpenMenu('av')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                openMenu === 'av'
                  ? 'bg-[#2b3140] text-white'
                  : 'text-[#cbd5e1] hover:bg-[#222632] hover:text-white'
              }`}
            >
              Audio/Video
            </button>
            {openMenu === 'av' && (
              <div className="absolute left-0 top-full mt-0.5 w-72 bg-[#181b23] border border-[#323846] rounded-lg shadow-2xl py-2 z-50 text-xs space-y-2">
                {/* Touch Grid Visibility Slider */}
                <div className="px-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#cbd5e1]">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Grid3X3 className="w-3.5 h-3.5 text-[#38bdf8]" />
                      Touch Grid Visibility
                    </span>
                    <span className="font-mono text-[#38bdf8]">
                      {Math.round(effectiveGridOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={effectiveGridOpacity}
                    onChange={(e) => handleTouchGridSlider(parseFloat(e.target.value))}
                    className="w-full accent-[#38bdf8] h-1.5 bg-[#0e1015] rounded-lg cursor-pointer"
                  />
                </div>

                {/* Audio Volume Slider */}
                <div className="px-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#cbd5e1]">
                    <span className="flex items-center gap-1.5 font-medium">
                      {system.settings.muted ? (
                        <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-[#a3ae76]" />
                      )}
                      Hardware Speaker Volume
                    </span>
                    <span className="font-mono text-[#a3ae76]">
                      {system.settings.muted ? 'Muted' : `${Math.round(system.settings.volume * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={system.settings.volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      system.settings.volume = v;
                      system.sound.setVolume(v);
                      onUpdate();
                    }}
                    className="w-full accent-[#a3ae76] h-1.5 bg-[#0e1015] rounded-lg cursor-pointer"
                  />
                </div>

                <div className="border-t border-[#292e3b]" />

                <div className="px-3 py-0.5 text-[10px] font-mono uppercase text-[#94a3b8]">
                  LCD Palette
                </div>
                {(Object.keys(PALETTES) as LCDPaletteId[]).map((pid) => (
                  <button
                    key={pid}
                    onClick={() => {
                      system.settings.palette = pid;
                      onUpdate();
                    }}
                    className="w-full px-3 py-1 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                  >
                    <span>{PALETTES[pid].name}</span>
                    {system.settings.palette === pid && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                ))}

                <div className="border-t border-[#292e3b]" />

                <button
                  onClick={() => {
                    system.settings.pixelGrid = !system.settings.pixelGrid;
                    onUpdate();
                  }}
                  className="w-full px-3 py-1 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>1×1 LCD Pixel Matrix Grid</span>
                  {system.settings.pixelGrid && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>

                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onTakeScreenshot?.();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-[#a3ae76]" />
                    Save Screenshot (.png)
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* VIEW MENU (Screen-Only mGBA / melonDS Mode vs Handheld Bezel) */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
              onMouseEnter={() => openMenu && openMenu !== 'recent-quick' && setOpenMenu('view')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                openMenu === 'view'
                  ? 'bg-[#2b3140] text-white'
                  : 'text-[#cbd5e1] hover:bg-[#222632] hover:text-white'
              }`}
            >
              View
            </button>
            {openMenu === 'view' && (
              <div className="absolute left-0 top-full mt-0.5 w-64 bg-[#181b23] border border-[#323846] rounded-lg shadow-2xl py-1.5 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] font-mono uppercase text-[#94a3b8]">
                  Emulator Viewport Mode
                </div>
                <button
                  onClick={() => {
                    system.settings.viewMode = 'screen-only';
                    onUpdate();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Screen Only (mGBA / melonDS View)</span>
                  {system.settings.viewMode === 'screen-only' && (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>
                <button
                  onClick={() => {
                    system.settings.viewMode = 'console';
                    onUpdate();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Full Handheld Console Bezel</span>
                  {system.settings.viewMode === 'console' && (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>

                <div className="my-1 border-t border-[#292e3b]" />
                <div className="px-3 py-1 text-[10px] font-mono uppercase text-[#94a3b8]">
                  Screen-Only Integer Scale
                </div>
                {[
                  { scale: 2, label: '2× Integer (400 × 320)' },
                  { scale: 3, label: '3× Integer (600 × 480)' },
                  { scale: 4, label: '4× Integer (800 × 640)' }
                ].map((s) => (
                  <button
                    key={s.scale}
                    onClick={() => {
                      system.settings.screenScale = s.scale;
                      system.settings.viewMode = 'screen-only';
                      onUpdate();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                  >
                    <span>{s.label}</span>
                    {system.settings.screenScale === s.scale && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TOOLS MENU */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'tools' ? null : 'tools')}
              onMouseEnter={() => openMenu && openMenu !== 'recent-quick' && setOpenMenu('tools')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                openMenu === 'tools'
                  ? 'bg-[#2b3140] text-white'
                  : 'text-[#cbd5e1] hover:bg-[#222632] hover:text-white'
              }`}
            >
              Tools
            </button>
            {openMenu === 'tools' && (
              <div className="absolute left-0 top-full mt-0.5 w-64 bg-[#181b23] border border-[#323846] rounded-lg shadow-2xl py-1.5 z-50 text-xs">
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenDebugger();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>SM8521 Hardware Debugger...</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">F12</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenHighScores();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>Expanded NVRAM High Score Vault...</span>
                  <span className="text-[10px] font-mono text-[#94a3b8]">Ctrl+H</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenAccuracy();
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                >
                  <span>SM8521 Chip Accuracy Audit...</span>
                </button>
                {onOpenBios && (
                  <button
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenBios();
                    }}
                    className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                  >
                    <span>BIOS Firmware Manager...</span>
                  </button>
                )}
                {onOpenControls && (
                  <button
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenControls();
                    }}
                    className="w-full px-3 py-1.5 text-left text-[#e2e8f0] hover:bg-[#282e3d] flex items-center justify-between"
                  >
                    <span>Keyboard &amp; Controller Bindings...</span>
                  </button>
                )}
                {onOpenReleases && (
                  <>
                    <div className="my-1 border-t border-[#292e3b]" />
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        onOpenReleases();
                      }}
                      className="w-full px-3 py-1.5 text-left text-[#d9e3b1] hover:bg-[#282e3d] flex items-center justify-between font-semibold"
                    >
                      <span>Google Antigravity Desktop IDE...</span>
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        onOpenReleases();
                      }}
                      className="w-full px-3 py-1.5 text-left text-[#38bdf8] hover:bg-[#282e3d] flex items-center justify-between font-semibold"
                    >
                      <span>Windows x64 App &amp; GitHub Releases...</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side of Menu Bar: Quick Status & View Mode Toggle */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-[#94a3b8]">
          <span className="hidden md:inline">
            SM8521 @ 4.9152 MHz • {system.fps} fps
          </span>
          <button
            onClick={() => {
              system.settings.viewMode =
                system.settings.viewMode === 'screen-only' ? 'console' : 'screen-only';
              onUpdate();
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-[10px] font-sans font-bold transition-colors ${
              system.settings.viewMode === 'screen-only'
                ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40'
                : 'bg-[#232733] text-[#cbd5e1] hover:text-white border border-[#353b4b]'
            }`}
            title="Switch between Screen-Only View (mGBA / melonDS style) and Full Handheld Console Bezel"
          >
            {system.settings.viewMode === 'screen-only' ? (
              <>
                <Gamepad2 className="w-3 h-3" />
                <span>Show Handheld Bezel</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3" />
                <span>Screen-Only Mode</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* ROW 2: COMPACT TOOLBAR (CUB SPIELE.COM BRANDING + SLOTS + RECENT)   */}
      {/* =================================================================== */}
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
        {/* Zone 1 (Left): Cub Spiele.Com Brand Identity */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-2.5 py-1 rounded-lg bg-[#1d2028] border border-[#343946] flex items-baseline gap-0.5 shadow-inner">
            <span className="text-xs font-black italic tracking-tight text-[#a3ae76] mr-1">
              cub
            </span>
            <span className="text-sm font-black italic tracking-tight text-[#f1f5f9]">
              spiele
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#e11d48] mx-0.5 translate-y-[-1px]" />
            <span className="text-sm font-black italic tracking-tight text-[#cbd5e1]">
              com
            </span>
          </div>
          <div className="hidden lg:block">
            <div className="text-xs font-bold text-[#e2e8f0] tracking-wide">
              CUB SPIELE.COM • SM8521 STANDALONE EMULATOR
            </div>
            <div className="text-[10px] font-mono text-[#a3ae76]">
              Slot 1: Lights Out • Slot 2: Sonic Jam
            </div>
          </div>
        </div>

        {/* Zone 2 (Center): Dual Cartridge Bay Launcher & Recently Played Dropdown */}
        <div className="hidden md:flex items-center gap-1.5 bg-[#0e1015] px-2 py-1 rounded-xl border border-[#282c37]">
          <button
            onClick={() => {
              system.launchCartridge(1);
              onUpdate();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
              system.activeSlot === 1 && system.activeApp === 'CARTRIDGE'
                ? 'bg-[#a3ae76]/25 text-[#d9e3b1] border border-[#a3ae76]/50 font-bold'
                : 'text-[#94a3b8] hover:text-white hover:bg-[#1c1f28]'
            }`}
            title="Boot Cartridge Slot 1"
          >
            <Play className="w-3 h-3 fill-current text-[#a3ae76]" />
            <span>SLOT 1: {system.slot1 ? system.slot1.title.split(' (')[0] : 'Empty'}</span>
          </button>

          <div className="w-[1px] h-4 bg-[#282c37]" />

          <button
            onClick={() => {
              system.launchCartridge(2);
              onUpdate();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
              system.activeSlot === 2 && system.activeApp === 'CARTRIDGE'
                ? 'bg-[#38bdf8]/25 text-[#bae6fd] border border-[#38bdf8]/50 font-bold'
                : 'text-[#94a3b8] hover:text-white hover:bg-[#1c1f28]'
            }`}
            title="Boot Cartridge Slot 2"
          >
            <Play className="w-3 h-3 fill-current text-[#38bdf8]" />
            <span>SLOT 2: {system.slot2 ? system.slot2.title.split(' (')[0] : 'Empty'}</span>
          </button>

          <div className="w-[1px] h-4 bg-[#282c37]" />

          {/* Recently Played Quick Dropdown Button */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'recent-quick' ? null : 'recent-quick')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono text-[#cbd5e1] hover:text-white hover:bg-[#1c1f28] transition-colors"
              title="Recently Played Cartridges"
            >
              <Clock className="w-3 h-3 text-[#a3ae76]" />
              <span>Recent ({system.recentGames.length})</span>
            </button>

            {openMenu === 'recent-quick' && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-[#181b23] border border-[#323846] rounded-xl shadow-2xl py-2 z-50 text-xs">
                <div className="px-3 pb-1.5 mb-1 border-b border-[#282d3a] flex items-center justify-between text-[10px] font-mono uppercase text-[#94a3b8]">
                  <span>Recently Played ROMs</span>
                  {system.recentGames.length > 0 && (
                    <button
                      onClick={() => {
                        system.clearRecentGames();
                        onUpdate();
                      }}
                      className="text-rose-400 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {system.recentGames.length === 0 ? (
                  <div className="px-3 py-3 text-center text-[#64748b] text-[11px]">
                    No recent games recorded yet
                  </div>
                ) : (
                  system.recentGames.map((item) => (
                    <div
                      key={`${item.id}_${item.slot}`}
                      className="px-3 py-1.5 hover:bg-[#222735] flex items-center justify-between gap-2"
                    >
                      <button
                        onClick={() => handleLaunchRecent(item, item.slot)}
                        className="flex-1 text-left truncate"
                      >
                        <div className="text-xs font-semibold text-white truncate">
                          {item.title}
                        </div>
                        <div className="text-[10px] font-mono text-[#94a3b8]">
                          Slot {item.slot} • Played {item.playCount}×
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleLaunchRecent(item, 1)}
                          className="px-1.5 py-0.5 rounded bg-[#262b3a] hover:bg-[#a3ae76] hover:text-black text-[10px] font-mono text-[#cbd5e1]"
                        >
                          Slot 1
                        </button>
                        <button
                          onClick={() => handleLaunchRecent(item, 2)}
                          className="px-1.5 py-0.5 rounded bg-[#262b3a] hover:bg-[#38bdf8] hover:text-black text-[10px] font-mono text-[#cbd5e1]"
                        >
                          Slot 2
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Zone 3 (Right): Primary Action Modals */}
        <div className="flex items-center gap-1.5">
          {onLoadRomFile && (
            <button
              onClick={() => fileInputSlot1Ref.current?.click()}
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#cbd5e1] border border-[#353a47] text-xs font-medium transition-colors"
              title="Load Custom ROM (.bin, .tgc, .zip)"
            >
              <Upload className="w-3.5 h-3.5 text-[#a3ae76]" />
              <span>Load ROM</span>
            </button>
          )}

          <button
            onClick={onOpenLibrary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#e2e8f0] border border-[#353a47] text-xs font-medium transition-colors"
          >
            <Disc className="w-3.5 h-3.5 text-[#a3ae76]" />
            <span className="hidden sm:inline">Cartridges</span>
          </button>

          <button
            onClick={onOpenAccuracy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#a3ae76]/15 hover:bg-[#a3ae76]/25 text-[#d9e3b1] border border-[#a3ae76]/40 text-xs font-medium transition-colors"
            title="SM8521 Hardware Accuracy & Chip Verification"
          >
            <Wrench className="w-3.5 h-3.5 text-[#cbd590]" />
            <span className="hidden sm:inline">Accuracy</span>
          </button>

          <button
            onClick={onOpenHighScores}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#e2e8f0] border border-[#353a47] text-xs font-medium transition-colors"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Vault</span>
          </button>

          {onOpenReleases && (
            <button
              onClick={onOpenReleases}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#bae6fd] border border-[#38bdf8]/40 text-xs font-semibold transition-colors"
              title="Open in Google Antigravity Desktop IDE & Download Cub Spiele.Com Windows x64 App"
            >
              <Monitor className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="hidden sm:inline">Antigravity / Win64</span>
            </button>
          )}

          {onOpenBios && (
            <button
              onClick={onOpenBios}
              className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#94a3b8] hover:text-white border border-[#353a47] text-xs transition-colors"
              title="BIOS Firmware Manager"
            >
              <Cpu className="w-3.5 h-3.5 text-[#a3ae76]" />
            </button>
          )}

          {onOpenControls && (
            <button
              onClick={onOpenControls}
              className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#94a3b8] hover:text-white border border-[#353a47] text-xs transition-colors"
              title="Keyboard & Gamepad Bindings"
            >
              <Keyboard className="w-3.5 h-3.5 text-[#cbd5e1]" />
            </button>
          )}

          <button
            onClick={onOpenDebugger}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#94a3b8] hover:text-white border border-[#353a47] text-xs font-mono transition-colors"
            title="SM8521 Hardware Debugger"
          >
            <Bug className="w-3.5 h-3.5 text-[#e11d48]" />
          </button>
        </div>
      </div>
    </header>
  );
};
