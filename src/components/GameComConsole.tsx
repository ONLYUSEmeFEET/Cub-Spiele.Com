import React, { useState, useEffect } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { GameComButtons } from '../emulator/types';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../emulator/lcd';
import { LCDScreen } from './LCDScreen';
import { Power, Menu, Pause, Play, Volume2, VolumeX } from 'lucide-react';

interface TouchViewProps {
  system: GameComSystem;
  scale?: number;
  onOpenLibrary?: () => void;
  onFpsUpdate?: (fps: number) => void;
  onStateChange?: () => void;
}

export const TouchView: React.FC<TouchViewProps> = ({
  system,
  scale = 2.35,
  onFpsUpdate,
  onStateChange
}) => {
  const [pressedButtons, setPressedButtons] = useState<Partial<GameComButtons>>({});
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Use horizontal Game.Com layout on desktop/landscape and vertical Game Boy / Analogue Pocket layout on portrait/narrow screens
  const isHorizontal = viewport.w >= 1024 || (viewport.w > viewport.h && viewport.w >= 720);
  const maxWidthBudget = isHorizontal ? viewport.w - 460 : viewport.w - 40;
  const maxHeightBudget = isHorizontal ? viewport.h - 130 : viewport.h - 365;
  const maxScaleW = Math.max(1.0, maxWidthBudget / SCREEN_WIDTH);
  const maxScaleH = Math.max(1.0, maxHeightBudget / SCREEN_HEIGHT);
  const effectiveScale = Math.min(scale, maxScaleW, maxScaleH);

  const handleBtnPress = (btn: keyof GameComButtons) => {
    setPressedButtons((prev) => ({ ...prev, [btn]: true }));
    system.setButton(btn, true);
    onStateChange?.();
  };

  const handleBtnRelease = (btn: keyof GameComButtons) => {
    setPressedButtons((prev) => ({ ...prev, [btn]: false }));
    system.setButton(btn, false);
    onStateChange?.();
  };

  // Isolated Power toggle placed away from D-Pad, action buttons, and bottom system strip
  const powerButton = (
    <button
      onClick={() => {
        system.powerToggle();
        onStateChange?.();
      }}
      className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide flex items-center gap-1.5 transition active:scale-95 cursor-pointer select-none touch-none ${
        system.isPoweredOn
          ? 'bg-[#be123c] hover:bg-[#e11d48] text-white border-[#881337] shadow-sm'
          : 'bg-[#d9dcd2] hover:bg-[#cdd1c4] text-zinc-800 border-zinc-400/80 dark:bg-[#262a34] dark:hover:bg-[#313643] dark:text-zinc-200 dark:border-zinc-700'
      }`}
      title={system.isPoweredOn ? 'Power Off' : 'Power On'}
      aria-label={system.isPoweredOn ? 'Power Off' : 'Power On'}
    >
      <Power className="w-3 h-3 shrink-0" />
      <span>Power</span>
    </button>
  );

  // Compact system buttons (Menu, Sound, Pause) styled cleanly as tactile pills
  const renderSystemButtons = (variant: 'horizontal-corner' | 'vertical-bottom') => (
    <div
      className={
        variant === 'horizontal-corner'
          ? 'grid grid-cols-3 gap-1.5 w-full'
          : 'flex items-center justify-center gap-3.5'
      }
      aria-label="System Controls"
    >
      {/* Menu */}
      <button
        onPointerDown={() => handleBtnPress('menu')}
        onPointerUp={() => handleBtnRelease('menu')}
        onPointerCancel={() => handleBtnRelease('menu')}
        onPointerLeave={() => pressedButtons.menu && handleBtnRelease('menu')}
        className={`${
          variant === 'horizontal-corner'
            ? 'py-1.5 px-1.5 rounded-full flex-col gap-0.5 text-[9px]'
            : 'min-w-[74px] py-1.5 px-3 rounded-full gap-1.5 text-[10px]'
        } border font-semibold tracking-wide flex items-center justify-center transition cursor-pointer select-none touch-none ${
          pressedButtons.menu
            ? 'scale-95 bg-[#7a1f5c] text-white border-[#561340]'
            : 'bg-[#d9dcd2] hover:bg-[#cdd1c4] text-zinc-900 border-zinc-400/70 dark:bg-[#262a34] dark:hover:bg-[#313643] dark:text-zinc-100 dark:border-zinc-700'
        }`}
        title="BIOS Menu (M / Backspace)"
      >
        <Menu className="w-3 h-3 shrink-0" />
        <span>Menu</span>
      </button>

      {/* Sound */}
      <button
        onClick={() => {
          system.soundToggle();
          onStateChange?.();
        }}
        className={`${
          variant === 'horizontal-corner'
            ? 'py-1.5 px-1.5 rounded-full flex-col gap-0.5 text-[9px]'
            : 'min-w-[74px] py-1.5 px-3 rounded-full gap-1.5 text-[10px]'
        } border font-semibold tracking-wide flex items-center justify-center transition active:scale-95 cursor-pointer select-none touch-none ${
          system.settings.muted
            ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70'
            : 'bg-[#d9dcd2] hover:bg-[#cdd1c4] text-zinc-900 border-zinc-400/70 dark:bg-[#262a34] dark:hover:bg-[#313643] dark:text-zinc-100 dark:border-zinc-700'
        }`}
        title="Mute / Unmute Sound (O)"
      >
        {system.settings.muted ? (
          <VolumeX className="w-3 h-3 shrink-0" />
        ) : (
          <Volume2 className="w-3 h-3 shrink-0" />
        )}
        <span>Sound</span>
      </button>

      {/* Pause */}
      <button
        onClick={() => {
          system.pauseToggle();
          onStateChange?.();
        }}
        className={`${
          variant === 'horizontal-corner'
            ? 'py-1.5 px-1.5 rounded-full flex-col gap-0.5 text-[9px]'
            : 'min-w-[74px] py-1.5 px-3 rounded-full gap-1.5 text-[10px]'
        } border font-semibold tracking-wide flex items-center justify-center transition active:scale-95 cursor-pointer select-none touch-none ${
          system.isPaused
            ? 'bg-amber-600 text-white border-amber-700'
            : 'bg-[#d9dcd2] hover:bg-[#cdd1c4] text-zinc-900 border-zinc-400/70 dark:bg-[#262a34] dark:hover:bg-[#313643] dark:text-zinc-100 dark:border-zinc-700'
        }`}
        title="Pause / Resume (P)"
      >
        {system.isPaused ? (
          <Play className="w-3 h-3 shrink-0" />
        ) : (
          <Pause className="w-3 h-3 shrink-0" />
        )}
        <span>{system.isPaused ? 'Play' : 'Pause'}</span>
      </button>
    </div>
  );

  const dpadControl = (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-36 h-36 flex items-center justify-center touch-none select-none shrink-0"
      aria-label="D-Pad"
    >
      {/* Clean Cross Shape (No fake console plastic casing) */}
      <div className="pointer-events-none absolute left-1/2 top-2 bottom-2 -translate-x-1/2 w-12 rounded-xl bg-[#cfd3c8] dark:bg-[#262a34] border border-zinc-400/70 dark:border-zinc-700 shadow-sm" />
      <div className="pointer-events-none absolute top-1/2 left-2 right-2 -translate-y-1/2 h-12 rounded-xl bg-[#cfd3c8] dark:bg-[#262a34] border border-zinc-400/70 dark:border-zinc-700 shadow-sm" />
      <div className="pointer-events-none absolute inset-0 m-auto w-11 h-11 bg-[#cfd3c8] dark:bg-[#262a34]" />

      {/* UP */}
      <button
        onPointerDown={() => handleBtnPress('up')}
        onPointerUp={() => handleBtnRelease('up')}
        onPointerCancel={() => handleBtnRelease('up')}
        onPointerLeave={() => pressedButtons.up && handleBtnRelease('up')}
        className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-11 flex items-center justify-center rounded-t-xl transition cursor-pointer ${
          pressedButtons.up ? 'bg-[#7a1f5c] text-white scale-95' : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Up"
      >
        <span
          className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[9px] ${
            pressedButtons.up ? 'border-b-white' : 'border-b-current'
          }`}
        />
      </button>

      {/* DOWN */}
      <button
        onPointerDown={() => handleBtnPress('down')}
        onPointerUp={() => handleBtnRelease('down')}
        onPointerCancel={() => handleBtnRelease('down')}
        onPointerLeave={() => pressedButtons.down && handleBtnRelease('down')}
        className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-12 h-11 flex items-center justify-center rounded-b-xl transition cursor-pointer ${
          pressedButtons.down
            ? 'bg-[#7a1f5c] text-white scale-95'
            : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Down"
      >
        <span
          className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[9px] ${
            pressedButtons.down ? 'border-t-white' : 'border-t-current'
          }`}
        />
      </button>

      {/* LEFT */}
      <button
        onPointerDown={() => handleBtnPress('left')}
        onPointerUp={() => handleBtnRelease('left')}
        onPointerCancel={() => handleBtnRelease('left')}
        onPointerLeave={() => pressedButtons.left && handleBtnRelease('left')}
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-11 h-12 flex items-center justify-center rounded-l-xl transition cursor-pointer ${
          pressedButtons.left
            ? 'bg-[#7a1f5c] text-white scale-95'
            : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Left"
      >
        <span
          className={`w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[9px] ${
            pressedButtons.left ? 'border-r-white' : 'border-r-current'
          }`}
        />
      </button>

      {/* RIGHT */}
      <button
        onPointerDown={() => handleBtnPress('right')}
        onPointerUp={() => handleBtnRelease('right')}
        onPointerCancel={() => handleBtnRelease('right')}
        onPointerLeave={() => pressedButtons.right && handleBtnRelease('right')}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-12 flex items-center justify-center rounded-r-xl transition cursor-pointer ${
          pressedButtons.right
            ? 'bg-[#7a1f5c] text-white scale-95'
            : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Right"
      >
        <span
          className={`w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[9px] ${
            pressedButtons.right ? 'border-l-white' : 'border-l-current'
          }`}
        />
      </button>

      {/* Subtle Center Pivot Indicator */}
      <div className="pointer-events-none w-4 h-4 rounded-full bg-[#b8bdb0] dark:bg-[#191c22] border border-zinc-400/50 dark:border-zinc-700" />
    </div>
  );

  // Horizontal Action Buttons: Original Tiger Game.Com 2x2 Grid (A B top, C D bottom)
  const actionGrid2x2 = (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="grid grid-cols-2 gap-x-5 gap-y-3.5 touch-none select-none shrink-0"
      aria-label="Action Buttons"
    >
      {/* A (Top-Left) */}
      <button
        onPointerDown={() => handleBtnPress('a')}
        onPointerUp={() => handleBtnRelease('a')}
        onPointerCancel={() => handleBtnRelease('a')}
        onPointerLeave={() => pressedButtons.a && handleBtnRelease('a')}
        className={`w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.a
            ? 'scale-95 bg-[#55143f] border-[#3c0c2b] shadow-inner'
            : 'bg-[#7a1f5c] hover:bg-[#8e266c] border-[#561340] shadow-md'
        }`}
        title="Button A (Key Z / Enter)"
      >
        A
      </button>

      {/* B (Top-Right) */}
      <button
        onPointerDown={() => handleBtnPress('b')}
        onPointerUp={() => handleBtnRelease('b')}
        onPointerCancel={() => handleBtnRelease('b')}
        onPointerLeave={() => pressedButtons.b && handleBtnRelease('b')}
        className={`w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.b
            ? 'scale-95 bg-[#55143f] border-[#3c0c2b] shadow-inner'
            : 'bg-[#7a1f5c] hover:bg-[#8e266c] border-[#561340] shadow-md'
        }`}
        title="Button B (Key X / Shift)"
      >
        B
      </button>

      {/* C (Bottom-Left) */}
      <button
        onPointerDown={() => handleBtnPress('c')}
        onPointerUp={() => handleBtnRelease('c')}
        onPointerCancel={() => handleBtnRelease('c')}
        onPointerLeave={() => pressedButtons.c && handleBtnRelease('c')}
        className={`w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.c
            ? 'scale-95 bg-[#382b54] border-[#261d3a] shadow-inner'
            : 'bg-[#4e3d73] hover:bg-[#5c4987] border-[#392c54] shadow-md'
        }`}
        title="Button C (Key C)"
      >
        C
      </button>

      {/* D (Bottom-Right) */}
      <button
        onPointerDown={() => handleBtnPress('d')}
        onPointerUp={() => handleBtnRelease('d')}
        onPointerCancel={() => handleBtnRelease('d')}
        onPointerLeave={() => pressedButtons.d && handleBtnRelease('d')}
        className={`w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.d
            ? 'scale-95 bg-[#382b54] border-[#261d3a] shadow-inner'
            : 'bg-[#4e3d73] hover:bg-[#5c4987] border-[#392c54] shadow-md'
        }`}
        title="Button D (Key V)"
      >
        D
      </button>
    </div>
  );

  // Vertical Action Buttons: Game Boy / Analogue Pocket 4-button Diamond
  const actionDiamond = (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-36 h-36 flex items-center justify-center touch-none select-none shrink-0"
      aria-label="Action Buttons"
    >
      {/* B (Top — Tiger Game.Com Burgundy-Plum Secondary Action) */}
      <button
        onPointerDown={() => handleBtnPress('b')}
        onPointerUp={() => handleBtnRelease('b')}
        onPointerCancel={() => handleBtnRelease('b')}
        onPointerLeave={() => pressedButtons.b && handleBtnRelease('b')}
        className={`absolute top-0.5 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.b
            ? 'scale-95 bg-[#55143f] border-[#3c0c2b] shadow-inner'
            : 'bg-[#7a1f5c] hover:bg-[#8e266c] border-[#561340] shadow-md'
        }`}
        title="Button B (Key X / Shift)"
      >
        B
      </button>

      {/* D (Right — Tiger Game.Com Slate-Violet) */}
      <button
        onPointerDown={() => handleBtnPress('d')}
        onPointerUp={() => handleBtnRelease('d')}
        onPointerCancel={() => handleBtnRelease('d')}
        onPointerLeave={() => pressedButtons.d && handleBtnRelease('d')}
        className={`absolute right-0.5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.d
            ? 'scale-95 bg-[#382b54] border-[#261d3a] shadow-inner'
            : 'bg-[#4e3d73] hover:bg-[#5c4987] border-[#392c54] shadow-md'
        }`}
        title="Button D (Key V)"
      >
        D
      </button>

      {/* A (Left — Tiger Game.Com Burgundy-Plum Primary Action) */}
      <button
        onPointerDown={() => handleBtnPress('a')}
        onPointerUp={() => handleBtnRelease('a')}
        onPointerCancel={() => handleBtnRelease('a')}
        onPointerLeave={() => pressedButtons.a && handleBtnRelease('a')}
        className={`absolute left-0.5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.a
            ? 'scale-95 bg-[#55143f] border-[#3c0c2b] shadow-inner'
            : 'bg-[#7a1f5c] hover:bg-[#8e266c] border-[#561340] shadow-md'
        }`}
        title="Button A (Key Z / Enter)"
      >
        A
      </button>

      {/* C (Bottom — Tiger Game.Com Slate-Violet) */}
      <button
        onPointerDown={() => handleBtnPress('c')}
        onPointerUp={() => handleBtnRelease('c')}
        onPointerCancel={() => handleBtnRelease('c')}
        onPointerLeave={() => pressedButtons.c && handleBtnRelease('c')}
        className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full font-bold text-sm text-white border transition cursor-pointer ${
          pressedButtons.c
            ? 'scale-95 bg-[#382b54] border-[#261d3a] shadow-inner'
            : 'bg-[#4e3d73] hover:bg-[#5c4987] border-[#392c54] shadow-md'
        }`}
        title="Button C (Key C)"
      >
        C
      </button>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-5xl select-none">
      {/* Minimal Button-Only Border Frame (No Fake Console Casing) */}
      {isHorizontal ? (
        /* Horizontal Layout: Original Tiger Game.Com (Isolated Top-Left Power + D-Pad Left | Screen Center | 2x2 A/B/C/D + Spaced Bottom-Right Menu/Sound/Pause) */
        <div className="flex flex-row items-center gap-6 px-5 py-4 rounded-2xl bg-[#e6e8df] dark:bg-[#191c22] border border-zinc-300 dark:border-zinc-800 shadow-lg dark:shadow-2xl transition-colors">
          {/* Left Wing: Isolated Power in top-left corner, separated from D-Pad */}
          <div className="flex flex-col items-center justify-between self-stretch w-40 py-1">
            <div className="w-full flex justify-start pb-6">
              {powerButton}
            </div>
            <div className="flex-1 flex items-center justify-center">
              {dpadControl}
            </div>
          </div>

          {/* Center Minimal Screen Border */}
          <div className="bg-[#dce0d5] dark:bg-[#0d0f13] p-1.5 rounded-xl border border-zinc-300 dark:border-zinc-800 transition-colors">
            <LCDScreen
              system={system}
              scale={effectiveScale}
              onFpsUpdate={onFpsUpdate}
            />
          </div>

          {/* Right Wing: 2x2 A/B/C/D Buttons + Spaced Bottom-Right System Strip (Menu / Sound / Pause) */}
          <div className="flex flex-col items-center justify-between self-stretch w-44 py-2">
            <div className="flex-1 flex items-center justify-center">
              {actionGrid2x2}
            </div>
            <div className="w-full pt-8">
              {renderSystemButtons('horizontal-corner')}
            </div>
          </div>
        </div>
      ) : (
        /* Vertical Layout: Analogue Pocket / Game Boy Style (Isolated Top Power | Screen Top | D-Pad Left + Diamond Buttons Right | Wide Gap | Centered Bottom System Strip) */
        <div className="flex flex-col items-center gap-4 px-4 pt-3 pb-5 rounded-2xl bg-[#e6e8df] dark:bg-[#191c22] border border-zinc-300 dark:border-zinc-800 shadow-lg dark:shadow-2xl transition-colors w-full max-w-md">
          {/* Isolated Top-Left Power Row above the screen, completely clear of thumb controls */}
          <div className="w-full flex items-center justify-start px-0.5">
            {powerButton}
          </div>

          {/* Top Minimal Screen Border */}
          <div className="bg-[#dce0d5] dark:bg-[#0d0f13] p-1.5 rounded-xl border border-zinc-300 dark:border-zinc-800 transition-colors">
            <LCDScreen
              system={system}
              scale={effectiveScale}
              onFpsUpdate={onFpsUpdate}
            />
          </div>

          {/* Middle Primary Controls: D-Pad (Left) + Diamond Buttons (Right) */}
          <div className="flex items-center justify-between gap-6 w-full px-2 pt-2">
            {dpadControl}
            {actionDiamond}
          </div>

          {/* Bottom Centered System Strip (Menu / Sound / Pause) — Generously spaced away from D-Pad and Action Buttons */}
          <div className="pt-6 pb-1 flex items-center justify-center w-full">
            {renderSystemButtons('vertical-bottom')}
          </div>
        </div>
      )}
    </div>
  );
};

// Backwards-compatible alias
export const GameComConsole = TouchView;
