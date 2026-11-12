import React, { useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { LCDPaletteId, PALETTES } from '../emulator/types';
import {
  Camera,
  Save,
  FolderOpen,
  Volume2,
  VolumeX,
  Gauge,
  Sliders,
  Palette,
  Trophy,
  RotateCcw,
  LayoutGrid,
  Play,
  Grid3X3,
  Upload,
  Download,
  ShieldAlert
} from 'lucide-react';

interface ControlToolbarProps {
  system: GameComSystem;
  onTakeScreenshot: () => void;
  onSaveState: () => void;
  onLoadState: () => void;
  onSettingsChange: () => void;
  onOpenHighScores?: () => void;
  onNotify?: (message: string, sub?: string, type?: 'success' | 'info' | 'error') => void;
}

export const ControlToolbar: React.FC<ControlToolbarProps> = ({
  system,
  onTakeScreenshot,
  onSaveState,
  onLoadState,
  onSettingsChange,
  onOpenHighScores,
  onNotify
}) => {
  const settings = system.settings;
  const activeBank = system.highScores.getActiveBankIndex();
  const totalScores = system.highScores.getTotalStoredScoresCount();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handlePaletteSelect = (palId: LCDPaletteId) => {
    system.settings.palette = palId;
    system.sound.playTouchBeep();
    onSettingsChange();
  };

  const handleGhostingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    system.settings.ghosting = val;
    onSettingsChange();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    system.settings.volume = val;
    system.sound.setVolume(val);
    onSettingsChange();
  };

  const handleToggleTouchGrid = () => {
    system.settings.showTouchGrid = !system.settings.showTouchGrid;
    system.sound.playTouchBeep();
    onSettingsChange();
  };

  const handleSpeedSelect = (spd: number) => {
    system.settings.speed = spd;
    system.sound.playTouchBeep();
    onSettingsChange();
  };

  const handleExportData = () => {
    const jsonStr = system.highScores.exportVaultJson(system.cpu.nvram);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gamecom_nvram_vault_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.('Exported NVRAM & High Score Data', 'Saved JSON Vault + 8KB NVRAM image', 'success');
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await system.highScores.importDataFromFile(file, system.cpu.nvram);
      onSettingsChange();
      onNotify?.(
        `Imported ${res.format === 'json' ? 'JSON Vault' : '8KB NVRAM'}`,
        `${res.recordsCount} high score record(s) synced to $FC60-$FEDF`,
        'success'
      );
    } catch (err) {
      onNotify?.('Import Failed', (err as Error).message, 'error');
    }
  };

  return (
    <div className="w-full max-w-4xl bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md mt-6">
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.nvram,.sav,.bin"
        onChange={handleImportData}
        className="hidden"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* SECTION 1: LCD Palettes */}
        <div>
          <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-purple-400" />
            LCD Screen Palette
          </label>
          <div className="grid grid-cols-5 gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
            {(Object.keys(PALETTES) as LCDPaletteId[]).map((pId) => {
              const pal = PALETTES[pId];
              const isSelected = settings.palette === pId;
              return (
                <button
                  key={pId}
                  onClick={() => handlePaletteSelect(pId)}
                  title={pal.name}
                  className={`flex flex-col items-center justify-center p-1.5 rounded transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-950/80 border border-purple-500 shadow-sm'
                      : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full border border-black/40 mb-1"
                    style={{ backgroundColor: pal.colors[0] }}
                  />
                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-full">
                    {pId === 'original'
                      ? '1997'
                      : pId === 'pocket_pro'
                      ? 'Silver'
                      : pId === 'backlit'
                      ? 'Backlit'
                      : pId === 'amber'
                      ? 'Amber'
                      : 'B&W'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION 2: STN Ghosting & Volume */}
        <div className="space-y-3">
          {/* Ghosting Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                STN LCD Ghosting
              </span>
              <span className="font-mono text-slate-400 text-[11px]">
                {Math.round(settings.ghosting * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.80"
              step="0.05"
              value={settings.ghosting}
              onChange={handleGhostingChange}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Audio Volume Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium flex items-center gap-1">
                {settings.muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                )}
                Sound Volume
              </span>
              <span className="font-mono text-slate-400 text-[11px]">
                {settings.muted ? 'Muted' : `${Math.round(settings.volume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={settings.volume}
              onChange={handleVolumeChange}
              className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* SECTION 3: Save States, Touch Grid Overlay & Speed */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onSaveState}
              className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Quick Save State (F5)"
            >
              <Save className="w-3.5 h-3.5 text-blue-400" />
              Save State
            </button>
            <button
              onClick={onLoadState}
              className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Quick Load State (F8)"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              Load State
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleTouchGrid}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                settings.showTouchGrid
                  ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Toggle 13x10 Hardware Resistive Touch Matrix Overlay"
            >
              <Grid3X3 className={`w-3.5 h-3.5 ${settings.showTouchGrid ? 'text-emerald-400' : 'text-slate-400'}`} />
              {settings.showTouchGrid ? 'Touch Grid: ON' : 'Touch Grid'}
            </button>
            <button
              onClick={onTakeScreenshot}
              className="py-2 px-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Capture 200x160 Native LCD Screenshot"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
            </button>
            <div className="px-2.5 py-2 bg-slate-950/70 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-purple-400" />
              <span>{system.fps}Hz</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware BIOS Quick Navigation, Speed & NVRAM Data Import/Export Strip */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-300 font-mono text-[11px] uppercase tracking-wider">
            Speed:
          </span>
          {[
            { label: '0.5×', val: 0.5 },
            { label: '1.0× (Original)', val: 1.0 },
            { label: '2.0×', val: 2.0 }
          ].map((s) => (
            <button
              key={s.val}
              onClick={() => handleSpeedSelect(s.val)}
              className={`px-2 py-1 rounded font-mono text-[11px] border transition-colors cursor-pointer ${
                settings.speed === s.val
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-600 font-bold'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title={`Run SM8521 CPU at ${s.label} clock speed`}
            >
              {s.label}
            </button>
          ))}

          <span className="text-slate-700 mx-0.5">|</span>

          <button
            onClick={() => {
              system.resetSystem('NONE');
              onSettingsChange();
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono text-[11px] border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
            title="Watch full 1997 3D Globe BIOS cold boot animation with audio"
          >
            <RotateCcw className="w-3 h-3 text-purple-400" />
            Cold Boot
          </button>
          <button
            onClick={() => {
              system.resetSystem('MAIN_MENU');
              onSettingsChange();
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono text-[11px] border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
            title="Boot directly to the 6-icon BIOS Main Menu"
          >
            <LayoutGrid className="w-3 h-3 text-blue-400" />
            Main Menu
          </button>
          {system.slot1 && (
            <button
              onClick={() => {
                system.launchCartridge(1);
                onSettingsChange();
              }}
              className="px-2.5 py-1 bg-purple-950/80 hover:bg-purple-900 text-purple-200 rounded font-mono text-[11px] border border-purple-700/70 flex items-center gap-1 transition-colors cursor-pointer"
              title="Launch Cartridge Slot 1 through the official BIOS"
            >
              <Play className="w-3 h-3 text-purple-400" />
              Slot 1: {system.slot1.title}
            </button>
          )}
          {system.slot2 && (
            <button
              onClick={() => {
                system.launchCartridge(2);
                onSettingsChange();
              }}
              className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 rounded font-mono text-[11px] border border-indigo-700/70 flex items-center gap-1 transition-colors cursor-pointer"
              title="Launch Cartridge Slot 2 through the official BIOS"
            >
              <Play className="w-3 h-3 text-indigo-400" />
              Slot 2: {system.slot2.title}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              system.promptKeepClearData();
              onSettingsChange();
              onNotify?.(
                'BIOS Keep / Clear Data Prompt',
                'Press Button A to Keep Data or Button B to Clear Data',
                'info'
              );
            }}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[11px] border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
            title="Show the BIOS 'DATA FOUND.. PRESS A TO KEEP / PRESS B TO CLEAR' prompt"
          >
            <ShieldAlert className="w-3 h-3 text-amber-400" />
            Keep/Clear Prompt
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono text-[11px] border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
            title="Import NVRAM Data (.json or 8KB .nvram)"
          >
            <Upload className="w-3 h-3 text-purple-400" />
            Import
          </button>

          <button
            onClick={handleExportData}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono text-[11px] border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
            title="Export NVRAM & High Score Data (.json)"
          >
            <Download className="w-3 h-3 text-emerald-400" />
            Export
          </button>

          <button
            onClick={() => {
              system.openBiosHighScoreScreen();
              onSettingsChange();
            }}
            className="px-2.5 py-1 bg-amber-950/70 hover:bg-amber-900/70 text-amber-200 rounded font-mono text-[11px] border border-amber-700/60 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Boot the authentic Game.Com BIOS High Score screen ($FC60-$FEDF)"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            BIOS High Scores
          </button>
          {onOpenHighScores && (
            <button
              onClick={onOpenHighScores}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded font-mono text-[11px] border border-slate-700 transition-colors cursor-pointer"
              title="Manage Unlimited (>10) NVRAM High Score Banks & Import/Export Data"
            >
              Bank #{activeBank + 1} ({totalScores})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
