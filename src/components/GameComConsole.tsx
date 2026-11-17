import React, { useState, useEffect } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { GameComButtons } from '../emulator/types';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../emulator/lcd';
import { LCDScreen } from './LCDScreen';
import { Menu, Pause, Volume2, VolumeX } from 'lucide-react';

interface TouchViewProps {
  system: GameComSystem;
  scale?: number;
  onOpenLibrary?: () => void;
  onFpsUpdate?: (fps: number) => void;
  onStateChange?: () => void;
}

const TOUCH_SIZE_PRESETS = {
  compact: {
    dpadBox: 'w-28 h-28',
    dpadBarV: 'w-9',
    dpadBarH: 'h-9',
    dpadCenter: 'w-8 h-8',
    dpadBtnV: 'w-9 h-9',
    dpadBtnH: 'w-9 h-9',
    dpadPivot: 'w-3 h-3',
    arrowBorderV: 'border-l-[5px] border-r-[5px]',
    arrowUp: 'border-b-[7px]',
    arrowDown: 'border-t-[7px]',
    arrowBorderH: 'border-t-[5px] border-b-[5px]',
    arrowLeft: 'border-r-[7px]',
    arrowRight: 'border-l-[7px]',
    actionBtn: 'w-10 h-10 text-xs',
    actionGridGap: 'gap-x-3.5 gap-y-2.5',
    diamondBox: 'w-28 h-28',
    wingLeft: 'w-32',
    wingRight: 'w-36',
    horizFrame: 'gap-4 px-3.5 py-3',
    vertFrame: 'gap-3 px-3 pt-2.5 pb-4 max-w-sm',
    horizBudgetW: 340,
    horizBudgetH: 96,
    vertBudgetW: 36,
    vertBudgetH: 295,
    sysPillVert: 'min-w-[64px] py-1 px-2.5 text-[9px]',
    sysPillHoriz: 'py-1 px-1 text-[8px]'
  },
  standard: {
    dpadBox: 'w-36 h-36',
    dpadBarV: 'w-12',
    dpadBarH: 'h-12',
    dpadCenter: 'w-11 h-11',
    dpadBtnV: 'w-12 h-11',
    dpadBtnH: 'w-11 h-12',
    dpadPivot: 'w-4 h-4',
    arrowBorderV: 'border-l-[6px] border-r-[6px]',
    arrowUp: 'border-b-[9px]',
    arrowDown: 'border-t-[9px]',
    arrowBorderH: 'border-t-[6px] border-b-[6px]',
    arrowLeft: 'border-r-[9px]',
    arrowRight: 'border-l-[9px]',
    actionBtn: 'w-12 h-12 text-sm',
    actionGridGap: 'gap-x-5 gap-y-3.5',
    diamondBox: 'w-36 h-36',
    wingLeft: 'w-40',
    wingRight: 'w-44',
    horizFrame: 'gap-6 px-5 py-4',
    vertFrame: 'gap-4 px-4 pt-3 pb-5 max-w-md',
    horizBudgetW: 440,
    horizBudgetH: 118,
    vertBudgetW: 44,
    vertBudgetH: 350,
    sysPillVert: 'min-w-[74px] py-1.5 px-3 text-[10px]',
    sysPillHoriz: 'py-1.5 px-1.5 text-[9px]'
  },
  large: {
    dpadBox: 'w-44 h-44',
    dpadBarV: 'w-14',
    dpadBarH: 'h-14',
    dpadCenter: 'w-13 h-13',
    dpadBtnV: 'w-14 h-13',
    dpadBtnH: 'w-13 h-14',
    dpadPivot: 'w-5 h-5',
    arrowBorderV: 'border-l-[7px] border-r-[7px]',
    arrowUp: 'border-b-[11px]',
    arrowDown: 'border-t-[11px]',
    arrowBorderH: 'border-t-[7px] border-b-[7px]',
    arrowLeft: 'border-r-[11px]',
    arrowRight: 'border-l-[11px]',
    actionBtn: 'w-14 h-14 text-base',
    actionGridGap: 'gap-x-6 gap-y-4',
    diamondBox: 'w-44 h-44',
    wingLeft: 'w-48',
    wingRight: 'w-52',
    horizFrame: 'gap-8 px-6 py-5',
    vertFrame: 'gap-5 px-5 pt-3.5 pb-6 max-w-lg',
    horizBudgetW: 520,
    horizBudgetH: 136,
    vertBudgetW: 52,
    vertBudgetH: 410,
    sysPillVert: 'min-w-[86px] py-2 px-3.5 text-[11px]',
    sysPillHoriz: 'py-2 px-1.5 text-[10px]'
  }
} as const;

export const TouchView: React.FC<TouchViewProps> = ({
  system,
  scale,
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

  const sizeKey = system.settings.touchControlSize || 'standard';
  const sz = TOUCH_SIZE_PRESETS[sizeKey] || TOUCH_SIZE_PRESETS.standard;

  // Use manual Touch Orientation if set; otherwise responsive horizontal/vertical split
  const touchOrientation = system.settings.touchOrientation || 'auto';
  const isHorizontal =
    touchOrientation === 'horizontal'
      ? true
      : touchOrientation === 'vertical'
        ? false
        : viewport.w >= 1024 || (viewport.w > viewport.h && viewport.w >= 720);
  const bottomReserve = system.settings.showBottomBar ? 24 : 0;
  const maxWidthBudget = isHorizontal ? viewport.w - sz.horizBudgetW : viewport.w - sz.vertBudgetW;
  const maxHeightBudget = isHorizontal
    ? viewport.h - sz.horizBudgetH - bottomReserve
    : viewport.h - sz.vertBudgetH - bottomReserve;

  const maxScaleW = Math.max(1.0, maxWidthBudget / SCREEN_WIDTH);
  const maxScaleH = Math.max(1.0, maxHeightBudget / SCREEN_HEIGHT);
  const maxFitScale = Math.min(maxScaleW, maxScaleH);

  const requestedScale =
    scale !== undefined
      ? scale
      : system.settings.touchScaleMode === 'full'
        ? maxFitScale
        : system.settings.touchScaleMode === 'scale'
          ? system.settings.touchScale || 2.5
          : Math.min(2.6, maxFitScale);

  const clampedScale = Math.max(1.0, Math.min(requestedScale, maxFitScale));
  const effectiveScale =
    system.settings.touchScaleMode === 'auto' && system.settings.integerScaling
      ? Math.max(1, Math.min(clampedScale, Math.floor(clampedScale) >= 1 ? Math.floor(clampedScale) : clampedScale))
      : system.settings.touchScaleMode === 'scale' && system.settings.integerScaling
        ? Math.max(1, Math.floor(clampedScale))
        : clampedScale;

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
            ? `${sz.sysPillHoriz} rounded-full flex-col gap-0.5`
            : `${sz.sysPillVert} rounded-full gap-1.5`
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
            ? `${sz.sysPillHoriz} rounded-full flex-col gap-0.5`
            : `${sz.sysPillVert} rounded-full gap-1.5`
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

      {/* Pause (Hardware PAUSE button) */}
      <button
        onPointerDown={() => handleBtnPress('pause')}
        onPointerUp={() => handleBtnRelease('pause')}
        onPointerCancel={() => handleBtnRelease('pause')}
        onPointerLeave={() => pressedButtons.pause && handleBtnRelease('pause')}
        className={`${
          variant === 'horizontal-corner'
            ? `${sz.sysPillHoriz} rounded-full flex-col gap-0.5`
            : `${sz.sysPillVert} rounded-full gap-1.5`
        } border font-semibold tracking-wide flex items-center justify-center transition cursor-pointer select-none touch-none ${
          pressedButtons.pause
            ? 'scale-95 bg-[#7a1f5c] text-white border-[#561340]'
            : 'bg-[#d9dcd2] hover:bg-[#cdd1c4] text-zinc-900 border-zinc-400/70 dark:bg-[#262a34] dark:hover:bg-[#313643] dark:text-zinc-100 dark:border-zinc-700'
        }`}
        title="Hardware PAUSE Button (P)"
      >
        <Pause className="w-3 h-3 shrink-0" />
        <span>Pause</span>
      </button>
    </div>
  );

  const dpadControl = (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`relative ${sz.dpadBox} flex items-center justify-center touch-none select-none shrink-0`}
      aria-label="D-Pad"
    >
      {/* Clean Cross Shape */}
      <div
        className={`pointer-events-none absolute left-1/2 top-2 bottom-2 -translate-x-1/2 ${sz.dpadBarV} rounded-xl bg-[#cfd3c8] dark:bg-[#262a34] border border-zinc-400/70 dark:border-zinc-700 shadow-sm`}
      />
      <div
        className={`pointer-events-none absolute top-1/2 left-2 right-2 -translate-y-1/2 ${sz.dpadBarH} rounded-xl bg-[#cfd3c8] dark:bg-[#262a34] border border-zinc-400/70 dark:border-zinc-700 shadow-sm`}
      />
      <div
        className={`pointer-events-none absolute inset-0 m-auto ${sz.dpadCenter} bg-[#cfd3c8] dark:bg-[#262a34]`}
      />

      {/* UP */}
      <button
        onPointerDown={() => handleBtnPress('up')}
        onPointerUp={() => handleBtnRelease('up')}
        onPointerCancel={() => handleBtnRelease('up')}
        onPointerLeave={() => pressedButtons.up && handleBtnRelease('up')}
        className={`absolute top-1.5 left-1/2 -translate-x-1/2 ${sz.dpadBtnV} flex items-center justify-center rounded-t-xl transition cursor-pointer ${
          pressedButtons.up ? 'bg-[#7a1f5c] text-white scale-95' : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Up"
      >
        <span
          className={`w-0 h-0 ${sz.arrowBorderV} border-l-transparent border-r-transparent ${sz.arrowUp} ${
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
        className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 ${sz.dpadBtnV} flex items-center justify-center rounded-b-xl transition cursor-pointer ${
          pressedButtons.down
            ? 'bg-[#7a1f5c] text-white scale-95'
            : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Down"
      >
        <span
          className={`w-0 h-0 ${sz.arrowBorderV} border-l-transparent border-r-transparent ${sz.arrowDown} ${
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
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 ${sz.dpadBtnH} flex items-center justify-center rounded-l-xl transition cursor-pointer ${
          pressedButtons.left
            ? 'bg-[#7a1f5c] text-white scale-95'
            : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Left"
      >
        <span
          className={`w-0 h-0 ${sz.arrowBorderH} border-t-transparent border-b-transparent ${sz.arrowLeft} ${
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
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${sz.dpadBtnH} flex items-center justify-center rounded-r-xl transition cursor-pointer ${
          pressedButtons.right
            ? 'bg-[#7a1f5c] text-white scale-95'
            : 'text-zinc-700 dark:text-zinc-200'
        }`}
        aria-label="D-Pad Right"
      >
        <span
          className={`w-0 h-0 ${sz.arrowBorderH} border-t-transparent border-b-transparent ${sz.arrowRight} ${
            pressedButtons.right ? 'border-l-white' : 'border-l-current'
          }`}
        />
      </button>

      {/* Subtle Center Pivot Indicator */}
      <div
        className={`pointer-events-none ${sz.dpadPivot} rounded-full bg-[#b8bdb0] dark:bg-[#191c22] border border-zinc-400/50 dark:border-zinc-700`}
      />
    </div>
  );

  // Horizontal Action Buttons: Original Tiger Game.Com 2x2 Grid (A B top, C D bottom)
  const actionGrid2x2 = (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`grid grid-cols-2 ${sz.actionGridGap} touch-none select-none shrink-0`}
      aria-label="Action Buttons"
    >
      {/* A (Top-Left) */}
      <button
        onPointerDown={() => handleBtnPress('a')}
        onPointerUp={() => handleBtnRelease('a')}
        onPointerCancel={() => handleBtnRelease('a')}
        onPointerLeave={() => pressedButtons.a && handleBtnRelease('a')}
        className={`${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
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
        className={`${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
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
        className={`${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
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
        className={`${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
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
      className={`relative ${sz.diamondBox} flex items-center justify-center touch-none select-none shrink-0`}
      aria-label="Action Buttons"
    >
      {/* B (Top) */}
      <button
        onPointerDown={() => handleBtnPress('b')}
        onPointerUp={() => handleBtnRelease('b')}
        onPointerCancel={() => handleBtnRelease('b')}
        onPointerLeave={() => pressedButtons.b && handleBtnRelease('b')}
        className={`absolute top-0.5 left-1/2 -translate-x-1/2 ${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
          pressedButtons.b
            ? 'scale-95 bg-[#55143f] border-[#3c0c2b] shadow-inner'
            : 'bg-[#7a1f5c] hover:bg-[#8e266c] border-[#561340] shadow-md'
        }`}
        title="Button B (Key X / Shift)"
      >
        B
      </button>

      {/* D (Right) */}
      <button
        onPointerDown={() => handleBtnPress('d')}
        onPointerUp={() => handleBtnRelease('d')}
        onPointerCancel={() => handleBtnRelease('d')}
        onPointerLeave={() => pressedButtons.d && handleBtnRelease('d')}
        className={`absolute right-0.5 top-1/2 -translate-y-1/2 ${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
          pressedButtons.d
            ? 'scale-95 bg-[#382b54] border-[#261d3a] shadow-inner'
            : 'bg-[#4e3d73] hover:bg-[#5c4987] border-[#392c54] shadow-md'
        }`}
        title="Button D (Key V)"
      >
        D
      </button>

      {/* A (Left) */}
      <button
        onPointerDown={() => handleBtnPress('a')}
        onPointerUp={() => handleBtnRelease('a')}
        onPointerCancel={() => handleBtnRelease('a')}
        onPointerLeave={() => pressedButtons.a && handleBtnRelease('a')}
        className={`absolute left-0.5 top-1/2 -translate-y-1/2 ${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
          pressedButtons.a
            ? 'scale-95 bg-[#55143f] border-[#3c0c2b] shadow-inner'
            : 'bg-[#7a1f5c] hover:bg-[#8e266c] border-[#561340] shadow-md'
        }`}
        title="Button A (Key Z / Enter)"
      >
        A
      </button>

      {/* C (Bottom) */}
      <button
        onPointerDown={() => handleBtnPress('c')}
        onPointerUp={() => handleBtnRelease('c')}
        onPointerCancel={() => handleBtnRelease('c')}
        onPointerLeave={() => pressedButtons.c && handleBtnRelease('c')}
        className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 ${sz.actionBtn} rounded-full font-bold text-white border transition cursor-pointer ${
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
    <div className="flex flex-col items-center justify-center w-full max-w-6xl select-none">
      {/* Minimal Button-Only Border Frame */}
      {isHorizontal ? (
        <div
          className={`flex flex-row items-center ${sz.horizFrame} rounded-2xl bg-[#e6e8df] dark:bg-black border border-zinc-300 dark:border-zinc-900 shadow-lg dark:shadow-2xl transition-colors`}
        >
          {/* Left Wing: D-Pad */}
          <div className={`flex flex-col items-center justify-center self-stretch ${sz.wingLeft} py-1`}>
            <div className="flex-1 flex items-center justify-center">
              {dpadControl}
            </div>
          </div>

          {/* Center Minimal Screen Border */}
          <div className="bg-[#dce0d5] dark:bg-black p-1.5 rounded-xl border border-zinc-300 dark:border-zinc-900 transition-colors">
            <LCDScreen
              system={system}
              scale={effectiveScale}
              onFpsUpdate={onFpsUpdate}
            />
          </div>

          {/* Right Wing: 2x2 A/B/C/D Buttons + Spaced Bottom-Right System Strip (Menu / Sound / Pause) */}
          <div className={`flex flex-col items-center justify-between self-stretch ${sz.wingRight} py-2`}>
            <div className="flex-1 flex items-center justify-center">
              {actionGrid2x2}
            </div>
            <div className="w-full pt-6">
              {renderSystemButtons('horizontal-corner')}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center ${sz.vertFrame} rounded-2xl bg-[#e6e8df] dark:bg-black border border-zinc-300 dark:border-zinc-900 shadow-lg dark:shadow-2xl transition-colors w-full`}
        >
          {/* Top Minimal Screen Border */}
          <div className="bg-[#dce0d5] dark:bg-black p-1.5 rounded-xl border border-zinc-300 dark:border-zinc-900 transition-colors">
            <LCDScreen
              system={system}
              scale={effectiveScale}
              onFpsUpdate={onFpsUpdate}
            />
          </div>

          {/* Middle Primary Controls: D-Pad (Left) + Diamond Buttons (Right) */}
          <div className="flex items-center justify-between gap-4 w-full px-1.5 pt-2">
            {dpadControl}
            {actionDiamond}
          </div>

          {/* Bottom Centered System Strip (Menu / Sound / Pause) */}
          <div className="pt-5 pb-1 flex items-center justify-center w-full">
            {renderSystemButtons('vertical-bottom')}
          </div>
        </div>
      )}
    </div>
  );
};

// Backwards-compatible alias
export const GameComConsole = TouchView;
