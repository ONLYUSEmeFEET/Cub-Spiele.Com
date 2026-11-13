import React from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import {
  DEFAULT_DARK_SHADE,
  DEFAULT_LIGHT_SHADE,
  GAMECOM_SCREEN_PRESET_ORDER,
  LCDPaletteId,
  PALETTES,
  blendTwoShades
} from '../emulator/types';
import { Palette, X, ArrowLeftRight, RotateCcw, Check, Sparkles } from 'lucide-react';

interface ColorCustomizerModalProps {
  system: GameComSystem;
  onClose: () => void;
  onUpdate: () => void;
}

export const ColorCustomizerModal: React.FC<ColorCustomizerModalProps> = ({
  system,
  onClose,
  onUpdate
}) => {
  const activePaletteId = system.settings.palette;
  const [lightShade, darkShade] = system.settings.twoShadeColors;
  const activeShades =
    activePaletteId === 'custom'
      ? blendTwoShades(lightShade, darkShade)
      : PALETTES[activePaletteId]?.colors || PALETTES.original.colors;

  const handleSelectPreset = (presetId: LCDPaletteId) => {
    system.applyScreenPreset(presetId, true);
    onUpdate();
  };

  const handleLightChange = (hex: string) => {
    system.setTwoShadeBlend(hex, darkShade);
    onUpdate();
  };

  const handleDarkChange = (hex: string) => {
    system.setTwoShadeBlend(lightShade, hex);
    onUpdate();
  };

  const handleSwap = () => {
    system.swapTwoShades();
    onUpdate();
  };

  const handleReset = () => {
    system.resetTwoShadesToDefault();
    onUpdate();
  };

  const shadeLabels = [
    { index: 0, label: 'Shade 0 (0%)', desc: 'Light / Unlit Substrate' },
    { index: 1, label: 'Shade 1 (33%)', desc: 'Light Mid Bias' },
    { index: 2, label: 'Shade 2 (67%)', desc: 'Dark Mid Bias' },
    { index: 3, label: 'Shade 3 (100%)', desc: 'Dark / Fully Driven STN' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Game.Com Hardware Screen Presets & 2-Shade Blender
              </h2>
              <p className="text-[11px] text-zinc-400">
                Select an authentic 1997–1999 Game.Com LCD hardware model or blend two custom shades
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Official Game.Com Hardware Screen Model Presets */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">
                Game.Com Hardware Screen Models (1997–1999)
              </span>
              <span className="text-[11px] text-zinc-400">
                Calibrates palette, glass border & STN response
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GAMECOM_SCREEN_PRESET_ORDER.map((presetId) => {
                const preset = PALETTES[presetId];
                const isSelected = activePaletteId === presetId;
                return (
                  <button
                    key={presetId}
                    onClick={() => handleSelectPreset(presetId)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-950/30 border-emerald-500/70 shadow-lg'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          {preset.name}
                          {preset.isBacklit && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-teal-500/20 border border-teal-500/40 text-[9px] font-mono text-teal-300">
                              <Sparkles className="w-2.5 h-2.5" /> EL Backlit
                            </span>
                          )}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {preset.modelCode} ({preset.modelYear})
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                        {preset.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center rounded-md overflow-hidden border border-zinc-700">
                        {preset.colors.map((c, i) => (
                          <span
                            key={i}
                            className="w-6 h-4 block"
                            style={{ backgroundColor: c }}
                            title={`Shade ${i}: ${c.toUpperCase()}`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Ghosting {Math.round(preset.defaultGhosting * 100)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom 2-Shade Color Blender */}
          <div className="pt-2 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">
                Custom 2-Shade Color Blender
              </span>
              {activePaletteId === 'custom' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Custom Blend Active
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Light / Background Shade */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">Light Shade (Background)</span>
                  <span className="text-[10px] font-mono text-zinc-500">SHADE 0</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <label className="relative w-11 h-11 rounded-lg border border-zinc-700 overflow-hidden cursor-pointer shrink-0 shadow-inner">
                    <input
                      type="color"
                      value={lightShade}
                      onChange={(e) => handleLightChange(e.target.value)}
                      className="absolute inset-0 w-16 h-16 -top-2 -left-2 cursor-pointer opacity-0"
                    />
                    <span
                      className="block w-full h-full"
                      style={{ backgroundColor: lightShade }}
                    />
                  </label>
                  <input
                    type="text"
                    value={lightShade.toUpperCase()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                        handleLightChange(val);
                      }
                    }}
                    maxLength={7}
                    className="w-full px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Dark / Foreground Shade */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">Dark Shade (Foreground)</span>
                  <span className="text-[10px] font-mono text-zinc-500">SHADE 3</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <label className="relative w-11 h-11 rounded-lg border border-zinc-700 overflow-hidden cursor-pointer shrink-0 shadow-inner">
                    <input
                      type="color"
                      value={darkShade}
                      onChange={(e) => handleDarkChange(e.target.value)}
                      className="absolute inset-0 w-16 h-16 -top-2 -left-2 cursor-pointer opacity-0"
                    />
                    <span
                      className="block w-full h-full"
                      style={{ backgroundColor: darkShade }}
                    />
                  </label>
                  <input
                    type="text"
                    value={darkShade.toUpperCase()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                        handleDarkChange(val);
                      }
                    }}
                    maxLength={7}
                    className="w-full px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Resulting 4-Shade Hardware Interpolation Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300">
                Active 2-bpp Hardware Gradient ({PALETTES[activePaletteId]?.name || '4 Shades'})
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">0% · 33% · 67% · 100%</span>
            </div>
            <div className="grid grid-cols-4 rounded-xl overflow-hidden border border-zinc-700 shadow-inner">
              {activeShades.map((hex, idx) => (
                <div
                  key={idx}
                  className="h-14 flex flex-col justify-between p-2"
                  style={{ backgroundColor: hex }}
                >
                  <span
                    className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded w-fit"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      color: '#fff'
                    }}
                  >
                    {shadeLabels[idx].label}
                  </span>
                  <span
                    className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded w-fit"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      color: '#fff'
                    }}
                  >
                    {hex.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSwap}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Swap Custom Shades
              </button>
              <button
                onClick={handleReset}
                disabled={
                  activePaletteId === 'original' &&
                  lightShade.toLowerCase() === DEFAULT_LIGHT_SHADE &&
                  darkShade.toLowerCase() === DEFAULT_DARK_SHADE
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-medium border border-zinc-700 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to 1997 Original STN
              </button>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
