import React, { useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import {
  LCDPaletteId,
  PALETTES,
  SGB_GBC_PRESETS,
  CustomPalettePreset,
  hexToRgbTuple
} from '../emulator/types';
import {
  X,
  Palette,
  Sparkles,
  ArrowLeftRight,
  Wand2,
  BookmarkPlus,
  Trash2,
  Check,
  RotateCcw
} from 'lucide-react';

interface ColorCustomizerModalProps {
  system: GameComSystem;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onNotify?: (message: string, sub?: string, type?: 'success' | 'info' | 'error') => void;
}

const SHADE_METADATA: {
  index: 0 | 1 | 2 | 3;
  bits: string;
  label: string;
  role: string;
}[] = [
  {
    index: 0,
    bits: '00',
    label: 'Shade 0 (Background / Paper)',
    role: 'Lightest pixel state (LCD off / unenergized background)'
  },
  {
    index: 1,
    bits: '01',
    label: 'Shade 1 (Light Midtone)',
    role: 'Secondary highlight, UI bevels, and light sprite dithering'
  },
  {
    index: 2,
    bits: '10',
    label: 'Shade 2 (Dark Midtone)',
    role: 'Primary shadow tone, depth contours, and sprite shading'
  },
  {
    index: 3,
    bits: '11',
    label: 'Shade 3 (Foreground / Ink)',
    role: 'Darkest pixel state (outlines, text, solid sprites)'
  }
];

export const ColorCustomizerModal: React.FC<ColorCustomizerModalProps> = ({
  system,
  isOpen,
  onClose,
  onUpdate,
  onNotify
}) => {
  const [presetTab, setPresetTab] = useState<'all' | 'sgb' | 'gbc' | 'classic' | 'user'>('all');
  const [saveName, setSaveName] = useState('');

  if (!isOpen) return null;

  const customColors = system.settings.customPaletteColors;
  const isCustomActive = system.settings.palette === 'custom';

  const handleShadeChange = (idx: 0 | 1 | 2 | 3, val: string) => {
    const formatted = val.startsWith('#') ? val : `#${val}`;
    if (/^#[0-9a-fA-F]{6}$/.test(formatted)) {
      system.setCustomShadeColor(idx, formatted.toLowerCase());
      onUpdate();
    }
  };

  const handleSwapShades = (idxA: 0 | 1 | 2 | 3, idxB: 0 | 1 | 2 | 3) => {
    const next = [...customColors] as [string, string, string, string];
    const tmp = next[idxA];
    next[idxA] = next[idxB];
    next[idxB] = tmp;
    system.applyCustomColors(next);
    onUpdate();
  };

  const handleApplyPreset = (preset: CustomPalettePreset) => {
    system.applyCustomColors(preset.colors, preset.id);
    onUpdate();
    onNotify?.(
      `Applied ${preset.name}`,
      `4-Shade SGB/GBC palette active (${preset.colors.join(' · ')})`,
      'success'
    );
  };

  const handleSaveUserPalette = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = system.saveUserPalette(saveName);
    setSaveName('');
    setPresetTab('user');
    onUpdate();
    onNotify?.('Saved Custom 4-Shade Palette', `"${saved.name}" stored in user presets`, 'success');
  };

  const allPresets: CustomPalettePreset[] = [...system.userPalettes, ...SGB_GBC_PRESETS];
  const filteredPresets =
    presetTab === 'all' ? allPresets : allPresets.filter((p) => p.category === presetTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#141720] border border-[#2e3446] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#e2e8f0]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#191d28] border-b border-[#282e3e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-950/90 border border-purple-500/40 flex items-center justify-center">
              <Palette className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Super Game Boy &amp; Game Boy Color 4-Shade Display Customizer
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  2-BPP COLORIZER
                </span>
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Assign custom colors to each of the 4 hardware LCD shades (`00`, `01`, `10`, `11`) or load classic SGB / GBC bootstrap palettes.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#232836] hover:bg-[#2e3547] text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
            title="Close Color Customizer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Live 4-Shade Preview & Quick Action Bar */}
          <div className="p-4 rounded-xl bg-[#0e1017] border border-[#262b3a] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Live 4-Shade Sample Tile & Swatch Strip */}
            <div className="flex items-center gap-4">
              {/* Simulated 2-bpp Game.Com Mini Scene Preview */}
              <div
                className="w-28 h-20 rounded-lg border-2 flex flex-col justify-between p-2 shrink-0 shadow-inner"
                style={{
                  backgroundColor: customColors[0],
                  borderColor: customColors[3]
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black tracking-tight"
                    style={{
                      backgroundColor: customColors[3],
                      color: customColors[0]
                    }}
                  >
                    2-BPP
                  </span>
                  <div className="flex gap-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: customColors[1], border: `1px solid ${customColors[3]}` }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: customColors[2], border: `1px solid ${customColors[3]}` }}
                    />
                  </div>
                </div>

                {/* 4-Shade Bar inside mini screen */}
                <div className="space-y-1">
                  <div
                    className="text-[10px] font-mono font-bold leading-none truncate"
                    style={{ color: customColors[3] }}
                  >
                    CUB SPIELE
                  </div>
                  <div className="grid grid-cols-4 h-2.5 rounded overflow-hidden border border-black/30">
                    <div style={{ backgroundColor: customColors[0] }} />
                    <div style={{ backgroundColor: customColors[1] }} />
                    <div style={{ backgroundColor: customColors[2] }} />
                    <div style={{ backgroundColor: customColors[3] }} />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Active 4-Shade Mapping</span>
                  {isCustomActive ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-600/50 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active on LCD
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        system.settings.palette = 'custom';
                        system.saveCustomPaletteStateToStorage();
                        onUpdate();
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer"
                    >
                      Activate Custom Palette
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#94a3b8] mt-1">
                  STN ghosting smoothly interpolates across your 4 chosen shades in real time.
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {customColors.map((hex, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#181c26] border border-[#2d3344] flex items-center gap-1.5"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/20"
                        style={{ backgroundColor: hex }}
                      />
                      S{i}: {hex.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Transformation Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  system.interpolateMidtones();
                  onUpdate();
                  onNotify?.(
                    'Auto-Blended Midtones (Shades 1 & 2)',
                    'Interpolated 33% and 67% gradients between Shade 0 and Shade 3',
                    'info'
                  );
                }}
                className="px-3 py-2 rounded-lg bg-[#1e2330] hover:bg-[#282f42] border border-[#343c52] text-xs font-semibold text-[#e2e8f0] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Automatically calculate Shade 1 (33%) and Shade 2 (67%) from Shade 0 and Shade 3"
              >
                <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                Auto-Blend Midtones
              </button>

              <button
                onClick={() => {
                  system.invertCustomColors();
                  onUpdate();
                  onNotify?.('Inverted 4-Shade Order', 'Reversed Shade 0 ↔ Shade 3 and Shade 1 ↔ Shade 2', 'info');
                }}
                className="px-3 py-2 rounded-lg bg-[#1e2330] hover:bg-[#282f42] border border-[#343c52] text-xs font-semibold text-[#e2e8f0] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Reverse all 4 shades (like Game Boy Color Right + B negative palette)"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                Invert 4 Shades
              </button>

              <button
                onClick={() => {
                  system.applyCustomColors(SGB_GBC_PRESETS[0].colors, SGB_GBC_PRESETS[0].id);
                  onUpdate();
                }}
                className="px-3 py-2 rounded-lg bg-[#1e2330] hover:bg-[#282f42] border border-[#343c52] text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Reset to Super Game Boy Default (SGB 1-A)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#38bdf8]" />
                Reset SGB 1-A
              </button>
            </div>
          </div>

          {/* 4 Individual Hardware Shade Editors */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#94a3b8] font-bold">
                Individual Hardware LCD Shades (Click Swatch or Enter Hex)
              </h3>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-[#64748b]">Copy base from:</span>
                {(['original', 'pocket_pro', 'backlit', 'amber', 'grayscale'] as const).map((pid) => (
                  <button
                    key={pid}
                    onClick={() => {
                      system.copyFromBuiltinPalette(pid);
                      onUpdate();
                    }}
                    className="px-2 py-0.5 rounded bg-[#1c202b] hover:bg-[#272d3d] text-[#cbd5e1] border border-[#2d3344] text-[10px] font-mono cursor-pointer"
                    title={`Load ${PALETTES[pid].name} into the customizer to tweak its shades`}
                  >
                    {pid === 'original'
                      ? '1997 STN'
                      : pid === 'pocket_pro'
                      ? 'Silver'
                      : pid === 'backlit'
                      ? 'Cyan'
                      : pid === 'amber'
                      ? 'Amber'
                      : 'B&W'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {SHADE_METADATA.map((meta) => {
                const hex = customColors[meta.index];
                const [r, g, b] = hexToRgbTuple(hex);
                return (
                  <div
                    key={meta.index}
                    className="p-3.5 rounded-xl bg-[#191d28] border border-[#2b3142] flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-[#0e1017] border border-[#2a3040] text-[10px] font-mono text-purple-300 font-bold">
                          2-Bit: {meta.bits}
                        </span>
                        {meta.index < 3 && (
                          <button
                            onClick={() =>
                              handleSwapShades(meta.index, (meta.index + 1) as 0 | 1 | 2 | 3)
                            }
                            className="text-[10px] font-mono text-[#94a3b8] hover:text-white flex items-center gap-0.5 cursor-pointer"
                            title={`Swap Shade ${meta.index} with Shade ${meta.index + 1}`}
                          >
                            <ArrowLeftRight className="w-2.5 h-2.5" />
                            Swap {meta.index}↔{meta.index + 1}
                          </button>
                        )}
                      </div>
                      <div className="text-xs font-bold text-white">{meta.label}</div>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5 leading-snug">{meta.role}</p>
                    </div>

                    {/* Color Picker + Hex Input */}
                    <div className="space-y-2 pt-2 border-t border-[#252a38]">
                      <div className="flex items-center gap-2">
                        <label
                          className="relative w-11 h-9 rounded-lg border border-white/25 overflow-hidden cursor-pointer shrink-0 shadow-inner"
                          style={{ backgroundColor: hex }}
                          title={`Pick color for ${meta.label}`}
                        >
                          <input
                            type="color"
                            value={hex}
                            onChange={(e) => handleShadeChange(meta.index, e.target.value)}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          />
                        </label>
                        <input
                          type="text"
                          value={hex.toUpperCase()}
                          maxLength={7}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^#?[0-9a-fA-F]{6}$/.test(val)) {
                              handleShadeChange(meta.index, val);
                            }
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e1017] border border-[#2c3244] text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                          placeholder="#RRGGBB"
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-[#64748b]">
                        <span>R: {r}</span>
                        <span>G: {g}</span>
                        <span>B: {b}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save Custom Palette Row */}
          <form
            onSubmit={handleSaveUserPalette}
            className="p-3.5 rounded-xl bg-[#181c27] border border-[#2b3142] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-xs">
              <BookmarkPlus className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-white">Save Current 4-Shade Combination:</span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g., Sonic Jam SGB Blue, Lights Out Neon..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#0e1017] border border-[#2c3244] text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shrink-0 cursor-pointer"
              >
                Save Preset
              </button>
            </div>
          </form>

          {/* Super Game Boy & Game Boy Color Classic Palette Library */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#94a3b8] font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Super Game Boy &amp; Game Boy Color Bootstrap Palettes
              </h3>

              <div className="flex items-center gap-1 bg-[#0e1017] p-1 rounded-lg border border-[#252a38] text-[11px]">
                {[
                  { id: 'all', label: 'All Presets' },
                  { id: 'sgb', label: 'Super Game Boy (1994)' },
                  { id: 'gbc', label: 'Game Boy Color (1998)' },
                  { id: 'classic', label: 'Retro LCD' },
                  { id: 'user', label: `Saved (${system.userPalettes.length})` }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setPresetTab(tab.id as any)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      presetTab === tab.id
                        ? 'bg-purple-600 text-white'
                        : 'text-[#94a3b8] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredPresets.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-[#0e1017] border border-[#242938] text-xs text-[#64748b]">
                No saved user palettes yet. Customize the 4 shades above and click <strong>Save Preset</strong>!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {filteredPresets.map((preset) => {
                  const isSelected =
                    isCustomActive &&
                    (system.settings.activeCustomPresetId === preset.id ||
                      (customColors[0].toLowerCase() === preset.colors[0].toLowerCase() &&
                        customColors[1].toLowerCase() === preset.colors[1].toLowerCase() &&
                        customColors[2].toLowerCase() === preset.colors[2].toLowerCase() &&
                        customColors[3].toLowerCase() === preset.colors[3].toLowerCase()));

                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-purple-950/50 border-purple-500 shadow-md'
                          : 'bg-[#181c26] hover:bg-[#1f2432] border-[#282e3e]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {preset.name}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {preset.shortcutHint && (
                            <span className="text-[10px] font-mono text-[#94a3b8]">
                              {preset.shortcutHint}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* 4-Shade Swatch Pill */}
                        <div className="flex rounded-md overflow-hidden border border-white/20 shadow-sm">
                          {preset.colors.map((c, idx) => (
                            <span
                              key={idx}
                              className="w-4 h-6 block"
                              style={{ backgroundColor: c }}
                              title={`Shade ${idx}: ${c}`}
                            />
                          ))}
                        </div>

                        {preset.category === 'user' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              system.deleteUserPalette(preset.id);
                              onUpdate();
                            }}
                            className="p-1 rounded hover:bg-rose-950 text-[#64748b] hover:text-rose-400 transition-colors"
                            title="Delete Saved Palette"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#191d28] border-t border-[#282e3e] flex items-center justify-between text-xs">
          <span className="text-[#94a3b8]">
            Tip: You can pick any SGB or GBC preset above and then fine-tune individual shades with the 4 color pickers.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
