import React, { useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { GameComButtons } from '../emulator/types';
import { LCDScreen } from './LCDScreen';
import {
  Grid3X3,
  Gamepad2,
  RotateCcw,
  Pause,
  Play,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ScreenOnlyViewProps {
  system: GameComSystem;
  onStateChange?: () => void;
}

export const ScreenOnlyView: React.FC<ScreenOnlyViewProps> = ({ system, onStateChange }) => {
  const [showCompactPad, setShowCompactPad] = useState<boolean>(false);
  const scale = system.settings.screenScale || 3;

  const effectiveGridOpacity = system.settings.showTouchGrid
    ? Math.max(0.05, system.settings.touchGridOpacity || 0.45)
    : system.settings.touchGridOpacity;

  const handleTouchGridOpacity = (val: number) => {
    system.settings.touchGridOpacity = val;
    system.settings.showTouchGrid = val > 0;
    onStateChange?.();
  };

  const handleBtn = (btn: keyof GameComButtons, isDown: boolean) => {
    system.setButton(btn, isDown);
    onStateChange?.();
  };

  return (
    <div className="flex flex-col items-center select-none">
      {/* Standalone Emulator Window Frame (mGBA / melonDS Screen-Only Layout) */}
      <div className="rounded-xl bg-[#111319] border border-[#2a2f3d] shadow-[0_24px_60px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Compact Header Strip inside Viewport */}
        <div className="px-3.5 py-2 bg-[#161922] border-b border-[#252a36] flex items-center justify-between gap-4 text-[11px] font-mono">
          <div className="flex items-center gap-2 text-[#cbd5e1]">
            <span
              className={`w-2 h-2 rounded-full ${
                !system.isPoweredOn
                  ? 'bg-rose-500'
                  : system.isPaused
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span className="font-bold text-white">Cub Spiele.Com</span>
            <span className="text-[#64748b]">|</span>
            <span className="text-[#a3ae76]">
              {system.activeApp === 'CARTRIDGE'
                ? `Slot ${system.activeSlot}: ${
                    (system.activeSlot === 1 ? system.slot1?.title : system.slot2?.title)?.split(' (')[0] ||
                    'Cartridge'
                  }`
                : 'BIOS OS Menu'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Integer Scale Selector (2x, 3x, 4x) */}
            {[2, 3, 4].map((s) => (
              <button
                key={s}
                onClick={() => {
                  system.settings.screenScale = s;
                  onStateChange?.();
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  scale === s
                    ? 'bg-[#38bdf8] text-[#090d16] font-bold'
                    : 'bg-[#222632] text-[#94a3b8] hover:text-white'
                }`}
                title={`Set ${s}x Integer LCD Resolution (${200 * s}×${160 * s})`}
              >
                {s}×
              </button>
            ))}

            <span className="text-[#2c3242] mx-0.5">|</span>

            <button
              onClick={() => {
                system.settings.viewMode = 'console';
                onStateChange?.();
              }}
              className="px-2 py-0.5 rounded bg-[#222632] hover:bg-[#2c3140] text-[#cbd5e1] text-[10px] font-sans font-semibold flex items-center gap-1"
              title="Switch to Full Handheld Console Shell"
            >
              <Gamepad2 className="w-3 h-3 text-[#a3ae76]" />
              <span>Bezel View</span>
            </button>
          </div>
        </div>

        {/* Pure 200x160 Game.Com LCD Canvas */}
        <div className="p-3 bg-[#0b0d12] flex items-center justify-center">
          <LCDScreen system={system} scale={scale} />
        </div>

        {/* mGBA / melonDS Style Bottom Status & Quick Touch Grid Bar */}
        <div className="px-3.5 py-2 bg-[#161922] border-t border-[#252a36] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-[#94a3b8]">
          <div className="flex items-center gap-2.5">
            <span>{system.fps} FPS (59.73 Hz)</span>
            <span className="text-[#2e3444]">|</span>
            <span>
              {200 * scale}×{160 * scale}
            </span>
            <span className="text-[#2e3444]">|</span>
            {/* Inline Touch Grid Visibility Slider */}
            <div className="flex items-center gap-1.5">
              <Grid3X3 className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="text-[10px] text-[#cbd5e1]">Grid:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={effectiveGridOpacity}
                onChange={(e) => handleTouchGridOpacity(parseFloat(e.target.value))}
                className="w-20 accent-[#38bdf8] h-1 bg-[#0b0d12] rounded cursor-pointer"
                title="Touch Grid Visibility (0% - 100%)"
              />
              <span className="w-8 text-[10px] text-[#38bdf8]">
                {Math.round(effectiveGridOpacity * 100)}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                system.pauseToggle();
                onStateChange?.();
              }}
              className="p-1 rounded bg-[#222632] hover:bg-[#2d3344] text-[#cbd5e1]"
              title={system.isPaused ? 'Resume (P)' : 'Pause (P)'}
            >
              {system.isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>

            <button
              onClick={() => {
                system.resetSystem('MAIN_MENU');
                onStateChange?.();
              }}
              className="p-1 rounded bg-[#222632] hover:bg-[#2d3344] text-[#cbd5e1]"
              title="Soft Reset to BIOS Main Menu (Ctrl+R)"
            >
              <RotateCcw className="w-3 h-3" />
            </button>

            <button
              onClick={() => {
                system.soundToggle();
                onStateChange?.();
              }}
              className="p-1 rounded bg-[#222632] hover:bg-[#2d3344] text-[#cbd5e1]"
              title="Mute / Unmute Hardware Audio"
            >
              {system.settings.muted ? (
                <VolumeX className="w-3 h-3 text-rose-400" />
              ) : (
                <Volume2 className="w-3 h-3 text-[#a3ae76]" />
              )}
            </button>

            <button
              onClick={() => setShowCompactPad(!showCompactPad)}
              className="px-2 py-0.5 rounded bg-[#222632] hover:bg-[#2d3344] text-[#cbd5e1] text-[10px] flex items-center gap-1"
              title="Toggle Compact On-Screen Keypad"
            >
              <span>Keypad</span>
              {showCompactPad ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {/* Optional Collapsible Mini Keypad for Mouse-Only Control in Screen-Only Mode */}
        {showCompactPad && (
          <div className="px-4 py-2.5 bg-[#12151d] border-t border-[#232836] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-1">
              {(['up', 'down', 'left', 'right'] as const).map((dir) => (
                <button
                  key={dir}
                  onPointerDown={() => handleBtn(dir, true)}
                  onPointerUp={() => handleBtn(dir, false)}
                  onPointerLeave={() => handleBtn(dir, false)}
                  className="px-2.5 py-1 rounded bg-[#1f2432] hover:bg-[#2a3142] active:bg-[#38bdf8] active:text-black text-[#e2e8f0] uppercase text-[10px] font-bold border border-[#31384a]"
                >
                  {dir}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onPointerDown={() => handleBtn('menu', true)}
                onPointerUp={() => handleBtn('menu', false)}
                onPointerLeave={() => handleBtn('menu', false)}
                className="px-2.5 py-1 rounded bg-[#252a38] hover:bg-[#32394c] text-[#cbd5e1] text-[10px] font-bold border border-[#373f54]"
              >
                MENU
              </button>
              {(['a', 'b', 'c', 'd'] as const).map((btn) => (
                <button
                  key={btn}
                  onPointerDown={() => handleBtn(btn, true)}
                  onPointerUp={() => handleBtn(btn, false)}
                  onPointerLeave={() => handleBtn(btn, false)}
                  className="w-7 h-7 rounded-full bg-[#681b4f] hover:bg-[#832565] active:scale-95 text-white font-black uppercase text-xs border border-[#9f2c7a]"
                >
                  {btn}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
