import React, { useEffect, useState, useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { GameComButtons, GameComConsoleModel } from '../emulator/types';
import { LCDScreen } from './LCDScreen';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../emulator/lcd';
import { Menu, Pause, Volume2, VolumeX, Sun } from 'lucide-react';

interface GameComConsoleProps {
  system: GameComSystem;
  onFpsUpdate?: (fps: number) => void;
  onOpenLibrary?: () => void;
  onOpenWebLink?: () => void;
  onStateChange?: () => void;
}

export const GameComConsole: React.FC<GameComConsoleProps> = ({
  system,
  onFpsUpdate,
  onStateChange
}) => {
  const [activeButtons, setActiveButtons] = useState<Record<string, boolean>>({});
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768
  });

  const activePointersRef = useRef<Map<number, (keyof GameComButtons)[]>>(new Map());
  const dpadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateSize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const syncAllPointers = () => {
    const combined: Record<string, boolean> = {};
    for (const btns of activePointersRef.current.values()) {
      for (const b of btns) {
        combined[b] = true;
      }
    }
    const allKeys: (keyof GameComButtons)[] = [
      'up',
      'down',
      'left',
      'right',
      'a',
      'b',
      'c',
      'd',
      'menu',
      'pause',
      'sound'
    ];
    for (const k of allKeys) {
      system.setButton(k, Boolean(combined[k]));
    }
    setActiveButtons(combined);
  };

  useEffect(() => {
    const clearAll = () => {
      if (activePointersRef.current.size > 0) {
        activePointersRef.current.clear();
        syncAllPointers();
      }
    };
    window.addEventListener('blur', clearAll);
    return () => window.removeEventListener('blur', clearAll);
  }, [system]);

  const bindButtonPointer = (btn: keyof GameComButtons) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      activePointersRef.current.set(e.pointerId, [btn]);
      syncAllPointers();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      activePointersRef.current.delete(e.pointerId);
      syncAllPointers();
    },
    onPointerCancel: (e: React.PointerEvent) => {
      e.preventDefault();
      activePointersRef.current.delete(e.pointerId);
      syncAllPointers();
    },
    onLostPointerCapture: (e: React.PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      syncAllPointers();
    }
  });

  const computeDpadDirections = (clientX: number, clientY: number): (keyof GameComButtons)[] => {
    const el = dpadRef.current;
    if (!el) return [];
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const deadzone = rect.width * 0.1;
    if (dist < deadzone) return [];

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const dirs: (keyof GameComButtons)[] = [];
    if (angle >= -67.5 && angle <= 67.5) dirs.push('right');
    if (angle >= 22.5 && angle <= 157.5) dirs.push('down');
    if (angle >= 112.5 || angle <= -112.5) dirs.push('left');
    if (angle >= -157.5 && angle <= -22.5) dirs.push('up');
    return dirs;
  };

  const handleDpadPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const dirs = computeDpadDirections(e.clientX, e.clientY);
    activePointersRef.current.set(e.pointerId, dirs);
    syncAllPointers();
  };

  const handleDpadPointerMove = (e: React.PointerEvent) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    const dirs = computeDpadDirections(e.clientX, e.clientY);
    activePointersRef.current.set(e.pointerId, dirs);
    syncAllPointers();
  };

  const handleDpadPointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    activePointersRef.current.delete(e.pointerId);
    syncAllPointers();
  };

  const model: GameComConsoleModel = system.settings.consoleModel || 'original';
  const bezelZoom = system.settings.bezelZoom || 'auto';
  const isCloseUp = bezelZoom === 'closeup';
  const isMidZoom = bezelZoom === 'mid';

  // Compute LCD scale based on model geometry and selected zoom mode
  const availW = Math.max(280, viewport.w - 24);
  const availH = Math.max(220, viewport.h - 56);

  let effectiveScale = system.settings.touchScale || 2.5;
  if (model !== 'minimal') {
    // Original shell adds ~340px width & ~135px height around the LCD (less in mid/closeup)
    // Pocket Pro shell adds ~290px width & ~115px height around the LCD
    const isOrig = model === 'original';
    const shellExtraW = isCloseUp
      ? isOrig
        ? 250
        : 225
      : isMidZoom
      ? isOrig
        ? 295
        : 260
      : isOrig
      ? 345
      : 295;
    const shellExtraH = isCloseUp
      ? isOrig
        ? 58
        : 65
      : isMidZoom
      ? isOrig
        ? 95
        : 95
      : isOrig
      ? 142
      : 120;

    const fitScaleW = Math.max(1, (availW - shellExtraW) / SCREEN_WIDTH);
    const fitScaleH = Math.max(1, (availH - shellExtraH) / SCREEN_HEIGHT);
    const autoFitScale = Math.max(1, Math.min(5, Math.min(fitScaleW, fitScaleH)));

    if (bezelZoom === 'auto') {
      effectiveScale = autoFitScale;
    } else if (bezelZoom === 'full-system') {
      effectiveScale = Math.min(autoFitScale, 2.35);
    } else if (bezelZoom === 'mid') {
      effectiveScale = Math.min(Math.max(autoFitScale, 2.2), 3.2);
    } else if (bezelZoom === 'closeup') {
      effectiveScale = Math.min(Math.max(autoFitScale, 2.6), 3.8);
    } else {
      effectiveScale = Math.max(1, Math.min(5, system.settings.touchScale || 2.5));
    }
    if (system.settings.integerScaling && bezelZoom === 'scale') {
      effectiveScale = Math.max(1, Math.round(effectiveScale));
    } else {
      effectiveScale = Math.round(effectiveScale * 20) / 20;
    }
  } else {
    const orientPref = system.settings.touchOrientation || 'auto';
    const isHorizontal =
      orientPref === 'horizontal'
        ? true
        : orientPref === 'vertical'
        ? false
        : viewport.w >= 620 && viewport.w > viewport.h * 0.95;
    const sideControlsWidth = isHorizontal ? 310 : 28;
    const verticalControlsHeight = isHorizontal ? 36 : 240;
    const maxScaleW = Math.max(0.85, (availW - sideControlsWidth) / SCREEN_WIDTH);
    const maxScaleH = Math.max(0.85, (availH - verticalControlsHeight) / SCREEN_HEIGHT);
    const fitScale = Math.min(8, Math.min(maxScaleW, maxScaleH));
    effectiveScale =
      system.settings.touchScaleMode === 'scale' ? system.settings.touchScale : fitScale;
  }

  // ============================================================================
  // MODEL 1: 1997 ORIGINAL GAME.COM (#71-500 — Charcoal & Brushed Silver Dual-Slot)
  // Layout matches the original 1997 hardware (original.gif):
  // - Left of screen: 5x8 speaker dot matrix (top-left) + Round 8-way D-Pad (bottom-left)
  // - Right of screen: Round Blue ON/OFF (top-right) + 2 angled (-15deg) pill wells
  //   containing [A  B] and [C  D] (middle-right) + 3 blue pills [MENU][SOUND][PAUSE] (bottom-right)
  // - Bottom charcoal dock: Recessed horizontal Tiger Stylus in its slot
  // ============================================================================
  if (model === 'original') {
    const padSize = isCloseUp ? 104 : 118;
    const actBtnSize = isCloseUp ? 36 : 40;

    return (
      <div className="flex flex-col items-center justify-center select-none max-w-full">
        {/* Outer Charcoal Handheld Chassis */}
        <div
          className={`relative flex flex-col items-center rounded-[36px] bg-gradient-to-b from-[#2b2f35] via-[#1f2227] to-[#15171b] border-2 border-[#3b4048] shadow-[0_20px_50px_rgba(0,0,0,0.75),inset_0_2px_4px_rgba(255,255,255,0.12)] transition-all ${
            isCloseUp ? 'p-2.5 rounded-[26px]' : isMidZoom ? 'px-4 pt-3.5 pb-4' : 'px-6 pt-4 pb-5'
          }`}
        >
          {/* Top Dual-Cartridge Bay Seam Indicator */}
          {!isCloseUp && (
            <div className="w-3/5 h-1.5 -mt-1 mb-1.5 rounded-b-md bg-[#141619] border-x border-b border-[#383d45] flex items-center justify-around px-6">
              <span className="text-[8px] font-mono tracking-widest text-zinc-500 uppercase">
                Slot 1 {system.slot1 ? `· ${system.slot1.title.slice(0, 12)}` : ''}
              </span>
              <span className="w-px h-full bg-zinc-700" />
              <span className="text-[8px] font-mono tracking-widest text-zinc-500 uppercase">
                Slot 2 {system.slot2 ? `· ${system.slot2.title.slice(0, 12)}` : ''}
              </span>
            </div>
          )}

          {/* Inner Brushed Silver Metallic Faceplate */}
          <div
            className={`relative flex flex-row items-stretch rounded-[24px] bg-gradient-to-b from-[#d8dce0] via-[#c3c8ce] to-[#aeb4bc] border-2 border-[#8c929a] shadow-[inset_0_2px_3px_rgba(255,255,255,0.75),inset_0_-3px_6px_rgba(0,0,0,0.28),0_4px_12px_rgba(0,0,0,0.45)] ${
              isCloseUp ? 'px-3 py-2.5 gap-3' : isMidZoom ? 'px-5 py-3.5 gap-4' : 'px-6 py-4 gap-5'
            }`}
          >
            {/* LEFT WING: 5x8 Speaker Grille (Top-Left) + Recessed Circular D-Pad (Bottom-Left) */}
            <div className="flex flex-col items-center justify-between py-1 min-w-[116px]">
              {/* Authentic 5x8 Speaker Dot Matrix tilted slightly */}
              <div
                className="grid grid-cols-8 gap-x-1.5 gap-y-1 px-2 pt-1.5 pb-1 -rotate-6 opacity-80"
                aria-hidden="true"
              >
                {Array.from({ length: 40 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#23272e] shadow-[inset_0_1px_1px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.5)]"
                  />
                ))}
              </div>

              {/* Circular Recessed 8-Way D-Pad Well */}
              <div className="my-auto flex items-center justify-center p-2 rounded-full bg-gradient-to-b from-[#7a8088] to-[#a4aab2] shadow-[inset_0_3px_6px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.6)]">
                <div
                  ref={dpadRef}
                  onPointerDown={handleDpadPointerDown}
                  onPointerMove={handleDpadPointerMove}
                  onPointerUp={handleDpadPointerUp}
                  onPointerCancel={handleDpadPointerUp}
                  onLostPointerCapture={handleDpadPointerUp}
                  style={{ width: padSize, height: padSize }}
                  className="relative rounded-full bg-gradient-to-b from-[#2f333a] via-[#1d2025] to-[#121418] border-2 border-[#0e1013] shadow-[0_4px_8px_rgba(0,0,0,0.65),inset_0_1px_2px_rgba(255,255,255,0.18)] touch-none cursor-pointer select-none"
                  aria-label="Directional Pad"
                >
                  {/* Moulded Cross Ridge */}
                  <div
                    className={`absolute left-[34%] right-[34%] top-2 bottom-2 rounded-md bg-[#252930] border border-[#3a3f48]/60 transition-transform ${
                      activeButtons.up
                        ? '-translate-y-0.5 bg-[#383e48]'
                        : activeButtons.down
                        ? 'translate-y-0.5 bg-[#383e48]'
                        : ''
                    }`}
                  />
                  <div
                    className={`absolute top-[34%] bottom-[34%] left-2 right-2 rounded-md bg-[#252930] border border-[#3a3f48]/60 transition-transform ${
                      activeButtons.left
                        ? '-translate-x-0.5 bg-[#383e48]'
                        : activeButtons.right
                        ? 'translate-x-0.5 bg-[#383e48]'
                        : ''
                    }`}
                  />
                  {/* Up Arrow */}
                  <span
                    className={`absolute top-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[9px] ${
                      activeButtons.up ? 'border-b-amber-400' : 'border-b-zinc-400/80'
                    }`}
                  />
                  {/* Down Arrow */}
                  <span
                    className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[9px] ${
                      activeButtons.down ? 'border-t-amber-400' : 'border-t-zinc-400/80'
                    }`}
                  />
                  {/* Left Arrow */}
                  <span
                    className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[9px] ${
                      activeButtons.left ? 'border-r-amber-400' : 'border-r-zinc-400/80'
                    }`}
                  />
                  {/* Right Arrow */}
                  <span
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[9px] ${
                      activeButtons.right ? 'border-l-amber-400' : 'border-l-zinc-400/80'
                    }`}
                  />
                  {/* Center Pivot Dish */}
                  <div className="absolute inset-[38%] rounded-full bg-gradient-to-br from-[#16181d] to-[#2c3038] shadow-inner pointer-events-none" />
                </div>
              </div>

              <div className="h-2" />
            </div>

            {/* CENTER: game.com Header + Deep Sunken 3D Beveled Screen Cutout + TIGER Footer */}
            <div className="flex flex-col items-center justify-center">
              {/* Top "game.com" Logo above the screen */}
              <div className="mb-1 flex items-center justify-center">
                <span className="font-mono font-black tracking-tight text-[#1e2229] text-base sm:text-lg leading-none drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]">
                  game<span className="text-[#be123c]">.</span>com
                </span>
              </div>

              {/* Deeply Recessed 4-Side Chamfered Bezel Frame */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-br from-[#7d838b] via-[#9ea4ac] to-[#d4d8dc] border border-[#686d75] shadow-[inset_0_4px_8px_rgba(0,0,0,0.6),0_1px_0_rgba(255,255,255,0.75)]">
                <div className="p-1.5 rounded-lg bg-[#1c1f24] shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
                  <LCDScreen
                    system={system}
                    scale={effectiveScale}
                    onFpsUpdate={onFpsUpdate}
                  />
                </div>
              </div>

              {/* Bottom "TIGER" Logo on the lower silver bezel */}
              <div className="mt-1.5 flex items-center justify-center">
                <span className="text-[10px] font-black tracking-[0.22em] text-[#2a2e35] uppercase drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">
                  TIGER
                </span>
              </div>
            </div>

            {/* RIGHT WING: Round Blue ON/OFF (Top-Right) + 2 Angled [A B] / [C D] Wells + 3 Blue [MENU][SOUND][PAUSE] Pills */}
            <div className="flex flex-col items-center justify-between py-1 min-w-[126px]">
              {/* Top-Right: Round Blue ON/OFF Power Button */}
              <div className="w-full flex items-center justify-start gap-1.5 pl-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    system.powerToggle();
                    onStateChange?.();
                  }}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform active:scale-90 cursor-pointer shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.45)] ${
                    system.isPoweredOn
                      ? 'bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border-[#1e3a8a] ring-2 ring-blue-400/50'
                      : 'bg-gradient-to-b from-[#1e40af] to-[#172554] border-[#0f172a]'
                  }`}
                  title={system.isPoweredOn ? 'ON/OFF (Power Off)' : 'ON/OFF (Power On)'}
                  aria-label="ON/OFF Power Button"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      system.isPoweredOn ? 'bg-sky-200 shadow-[0_0_4px_#38bdf8]' : 'bg-blue-950'
                    }`}
                  />
                </button>
                <span className="text-[8px] font-bold tracking-wider text-[#2b3038] uppercase">
                  ON/OFF
                </span>
              </div>

              {/* Middle-Right: Two Angled (-15deg) Recessed Oval Wells for [A, B] and [C, D] */}
              <div className="my-auto flex flex-col gap-2.5 py-2">
                {/* Upper Angled Pill Well: A & B */}
                <div className="-rotate-12 px-2.5 py-1.5 rounded-full bg-gradient-to-b from-[#8b919a] to-[#b8bec6] border border-[#6e747c] shadow-[inset_0_2px_5px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.65)] flex items-center gap-3">
                  {(['a', 'b'] as const).map((btn) => (
                    <button
                      key={btn}
                      type="button"
                      {...bindButtonPointer(btn)}
                      style={{ width: actBtnSize, height: actBtnSize }}
                      className={`rotate-12 rounded-full border-2 font-black text-xs uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
                        activeButtons[btn]
                          ? 'scale-92 bg-[#111317] text-amber-300 border-black shadow-inner'
                          : 'bg-gradient-to-b from-[#353942] via-[#22252b] to-[#14161a] text-zinc-100 border-[#0d0f12] shadow-[0_3px_5px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                      }`}
                      aria-label={`Button ${btn.toUpperCase()}`}
                    >
                      {btn.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Lower Angled Pill Well: C & D */}
                <div className="-rotate-12 px-2.5 py-1.5 rounded-full bg-gradient-to-b from-[#8b919a] to-[#b8bec6] border border-[#6e747c] shadow-[inset_0_2px_5px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.65)] flex items-center gap-3">
                  {(['c', 'd'] as const).map((btn) => (
                    <button
                      key={btn}
                      type="button"
                      {...bindButtonPointer(btn)}
                      style={{ width: actBtnSize, height: actBtnSize }}
                      className={`rotate-12 rounded-full border-2 font-black text-xs uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
                        activeButtons[btn]
                          ? 'scale-92 bg-[#111317] text-amber-300 border-black shadow-inner'
                          : 'bg-gradient-to-b from-[#353942] via-[#22252b] to-[#14161a] text-zinc-100 border-[#0d0f12] shadow-[0_3px_5px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                      }`}
                      aria-label={`Button ${btn.toUpperCase()}`}
                    >
                      {btn.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bottom-Right Edge: Three Blue Rectangular Pill Buttons [MENU] [SOUND] [PAUSE] */}
              <div className="w-full flex items-end justify-between gap-1.5 pt-1 -rotate-3">
                {/* MENU */}
                <div className="flex flex-col items-center gap-0.5 flex-1">
                  <span className="text-[7px] font-bold tracking-wider text-[#2b3038] uppercase">
                    MENU
                  </span>
                  <button
                    type="button"
                    {...bindButtonPointer('menu')}
                    className={`w-full h-3.5 rounded-full border transition-transform select-none touch-none cursor-pointer ${
                      activeButtons.menu
                        ? 'scale-95 bg-[#1e3a8a] border-black shadow-inner'
                        : 'bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border-[#172554] shadow-[0_2px_3px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)]'
                    }`}
                    title="MENU (Enter)"
                    aria-label="MENU Button"
                  />
                </div>

                {/* SOUND */}
                <div className="flex flex-col items-center gap-0.5 flex-1">
                  <span className="text-[7px] font-bold tracking-wider text-[#2b3038] uppercase">
                    SOUND
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      bindButtonPointer('sound').onPointerDown(e);
                      system.soundToggle();
                      onStateChange?.();
                    }}
                    onPointerUp={bindButtonPointer('sound').onPointerUp}
                    onPointerCancel={bindButtonPointer('sound').onPointerCancel}
                    onLostPointerCapture={bindButtonPointer('sound').onLostPointerCapture}
                    className={`w-full h-3.5 rounded-full border transition-transform select-none touch-none cursor-pointer ${
                      activeButtons.sound || system.settings.muted
                        ? 'scale-95 bg-[#1e3a8a] border-black shadow-inner'
                        : 'bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border-[#172554] shadow-[0_2px_3px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)]'
                    }`}
                    title={system.settings.muted ? 'SOUND (Unmute)' : 'SOUND (Mute)'}
                    aria-label="SOUND Button"
                  />
                </div>

                {/* PAUSE */}
                <div className="flex flex-col items-center gap-0.5 flex-1">
                  <span className="text-[7px] font-bold tracking-wider text-[#2b3038] uppercase">
                    PAUSE
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      bindButtonPointer('pause').onPointerDown(e);
                      system.pauseToggle();
                      onStateChange?.();
                    }}
                    onPointerUp={bindButtonPointer('pause').onPointerUp}
                    onPointerCancel={bindButtonPointer('pause').onPointerCancel}
                    onLostPointerCapture={bindButtonPointer('pause').onLostPointerCapture}
                    className={`w-full h-3.5 rounded-full border transition-transform select-none touch-none cursor-pointer ${
                      activeButtons.pause || system.isPaused
                        ? 'scale-95 bg-[#1e3a8a] border-black shadow-inner'
                        : 'bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border-[#172554] shadow-[0_2px_3px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)]'
                    }`}
                    title="PAUSE (Space)"
                    aria-label="PAUSE Button"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Charcoal Grip & Docked Horizontal Tiger Stylus (shown in Full-System & Mid zoom) */}
          {!isCloseUp && (
            <div className="w-full pt-3 pb-0.5 px-8 flex items-center justify-center">
              <div className="w-4/5 max-w-[440px] h-5 rounded-full bg-[#111317] border border-[#2e323b] shadow-[inset_0_2px_5px_rgba(0,0,0,0.9)] px-3 flex items-center">
                {/* Docked Black Stylus Pen */}
                <div className="w-full h-3 rounded-full bg-gradient-to-b from-[#383d46] via-[#1f2228] to-[#121418] border border-[#0b0c0e] flex items-center justify-between px-4 shadow">
                  <div className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-zinc-500" />
                    <span className="w-1 h-1 rounded-full bg-zinc-500" />
                    <span className="w-1 h-1 rounded-full bg-zinc-500" />
                  </div>
                  <span className="text-[7px] font-black tracking-[0.2em] text-zinc-300 uppercase">
                    TIGER
                  </span>
                  <div className="w-6 h-1 rounded-full bg-zinc-600/60" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODEL 2 & 3: GAME.COM POCKET PRO (#71-510 Translucent Colors & #71-520 Backlit)
  // Layout matches pocketpro.gif & pocketprobl.gif:
  // - Contoured outer shell (Charcoal for Backlit #71-520, or Translucent Purple/Green/Blue/Pink)
  // - Central silver metallic shield with top/bottom screw bosses:
  //   - Upper-left of shield: 4 angled speaker slots
  //   - Upper-right of shield: Stacked angled [ON/OFF] (round), [MENU] (oval), [PAUSE] (oval)
  //   - Bottom of shield: "game.com POCKET PRO" + Teal [LIGHT] arch button on #71-520 Backlit!
  // - Lower-left grip: Circular recessed well with Cross D-Pad
  // - Lower-right grip: Circular recessed well with 2x2 [A B / C D] round buttons
  // ============================================================================
  if (model.startsWith('pocketpro')) {
    const isBacklitModel = model === 'pocketpro_backlit';
    const isBacklightActive = system.settings.palette === 'pocket_pro_el';

    const shellStyles: Record<
      string,
      { body: string; border: string; accentBtn: string; accentBorder: string }
    > = {
      pocketpro_backlit: {
        body: 'from-[#2d3138] via-[#202329] to-[#15171b]',
        border: 'border-[#3d424b]',
        accentBtn: 'from-[#06b6d4] to-[#0891b2]',
        accentBorder: 'border-[#155e75]'
      },
      pocketpro_purple: {
        body: 'from-[#5b2a86]/95 via-[#431d66]/95 to-[#2c1147]/95',
        border: 'border-[#7c3aed]/50',
        accentBtn: 'from-[#a78bfa] to-[#7c3aed]',
        accentBorder: 'border-[#4c1d95]'
      },
      pocketpro_green: {
        body: 'from-[#0f6852]/95 via-[#0b4f3e]/95 to-[#063529]/95',
        border: 'border-[#10b981]/50',
        accentBtn: 'from-[#34d399] to-[#059669]',
        accentBorder: 'border-[#064e3b]'
      },
      pocketpro_blue: {
        body: 'from-[#1d4ed8]/90 via-[#1e3a8a]/95 to-[#172554]/95',
        border: 'border-[#60a5fa]/50',
        accentBtn: 'from-[#60a5fa] to-[#2563eb]',
        accentBorder: 'border-[#1e3a8a]'
      },
      pocketpro_pink: {
        body: 'from-[#9d174d]/95 via-[#831843]/95 to-[#500724]/95',
        border: 'border-[#f472b6]/50',
        accentBtn: 'from-[#f472b6] to-[#db2777]',
        accentBorder: 'border-[#831843]'
      }
    };

    const st = shellStyles[model] || shellStyles.pocketpro_purple;
    const padSize = isCloseUp ? 98 : 110;
    const actBtnSize = isCloseUp ? 34 : 38;

    return (
      <div className="flex flex-col items-center justify-center select-none max-w-full">
        {/* Outer Pocket Pro Contoured Shell */}
        <div
          className={`relative flex flex-row items-center rounded-[44px] bg-gradient-to-b ${st.body} border-2 ${st.border} shadow-[0_20px_50px_rgba(0,0,0,0.75),inset_0_2px_6px_rgba(255,255,255,0.2)] transition-all ${
            isCloseUp ? 'px-3 py-2.5 gap-2.5 rounded-[30px]' : isMidZoom ? 'px-4 py-3.5 gap-3' : 'px-6 py-4 gap-4'
          }`}
        >
          {/* LEFT GRIP + UPPER SHIELD SPEAKER SLOTS */}
          <div className="flex flex-col items-center justify-between self-stretch py-1 min-w-[112px]">
            {/* Upper-Left Silver Shield Wing: 4 Angled Speaker Slots */}
            <div className="w-full rounded-tl-[26px] rounded-bl-xl bg-gradient-to-b from-[#d5d9de] to-[#b5bbc3] border border-[#8e959e] px-3 py-2.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.7),0_2px_5px_rgba(0,0,0,0.35)] flex flex-col items-center gap-1.5">
              <div className="w-full flex items-center justify-start">
                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#e2e5e9] to-[#8a9099] border border-[#686e77] shadow-inner" />
              </div>
              <div className="flex flex-col gap-1.5 py-1 rotate-6">
                {[0, 1, 2, 3].map((slot) => (
                  <span
                    key={slot}
                    className="w-11 h-1.5 rounded-full bg-[#22262d] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.55)]"
                  />
                ))}
              </div>
            </div>

            {/* Lower-Left Grip: Circular Recessed Cross D-Pad */}
            <div className="my-auto pt-2 flex items-center justify-center">
              <div className="p-2 rounded-full bg-black/35 border border-white/10 shadow-[inset_0_3px_6px_rgba(0,0,0,0.65)]">
                <div
                  ref={dpadRef}
                  onPointerDown={handleDpadPointerDown}
                  onPointerMove={handleDpadPointerMove}
                  onPointerUp={handleDpadPointerUp}
                  onPointerCancel={handleDpadPointerUp}
                  onLostPointerCapture={handleDpadPointerUp}
                  style={{ width: padSize, height: padSize }}
                  className="relative rounded-full bg-gradient-to-b from-[#494e58] via-[#343840] to-[#23262c] border-2 border-[#16181c] shadow-[0_4px_8px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.22)] touch-none cursor-pointer select-none"
                  aria-label="Pocket Pro Directional Pad"
                >
                  {/* Moulded Cross Arms */}
                  <div
                    className={`absolute left-[33%] right-[33%] top-2 bottom-2 rounded-md bg-[#3d424b] border border-white/10 ${
                      activeButtons.up
                        ? '-translate-y-0.5 bg-[#525865]'
                        : activeButtons.down
                        ? 'translate-y-0.5 bg-[#525865]'
                        : ''
                    }`}
                  />
                  <div
                    className={`absolute top-[33%] bottom-[33%] left-2 right-2 rounded-md bg-[#3d424b] border border-white/10 ${
                      activeButtons.left
                        ? '-translate-x-0.5 bg-[#525865]'
                        : activeButtons.right
                        ? 'translate-x-0.5 bg-[#525865]'
                        : ''
                    }`}
                  />
                  <div className="absolute inset-[37%] rounded-full bg-[#2b2f37] shadow-inner pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* CENTER SILVER SHIELD: TIGER Header + Sunken LCD + "game.com POCKET PRO" + #71-520 LIGHT Arch Button */}
          <div className="relative flex flex-col items-center rounded-[26px] bg-gradient-to-b from-[#dadcdf] via-[#c4c9d0] to-[#aeb4bc] border-2 border-[#8c929a] px-4 pt-2 pb-3 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_6px_14px_rgba(0,0,0,0.5)]">
            {/* Top "TIGER" Logo */}
            <div className="mb-1 flex items-center justify-center">
              <span className="text-[10px] font-black tracking-[0.22em] text-[#22262c] uppercase drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]">
                TIGER
              </span>
            </div>

            {/* Sunken Chamfered LCD Window */}
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#7e848d] via-[#9fa5ae] to-[#d4d8dd] border border-[#6b7078] shadow-[inset_0_4px_8px_rgba(0,0,0,0.55)]">
              <div
                className={`p-1 rounded-lg transition-shadow ${
                  isBacklightActive
                    ? 'bg-[#092e20] shadow-[0_0_16px_rgba(52,211,153,0.45),inset_0_2px_6px_rgba(0,0,0,0.85)]'
                    : 'bg-[#1c1f24] shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]'
                }`}
              >
                <LCDScreen
                  system={system}
                  scale={effectiveScale}
                  onFpsUpdate={onFpsUpdate}
                />
              </div>
            </div>

            {/* Bottom Silver Chin: Screw Bosses + Embossed "game.com POCKET PRO" + Backlit LIGHT Button */}
            <div className="w-full mt-2 flex items-center justify-between px-2">
              <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#e2e5e9] to-[#8a9099] border border-[#686e77] shadow-inner" />
              <div className="flex flex-col items-center leading-none">
                <span className="font-mono font-black tracking-tight text-[#6c727a] text-sm drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]">
                  game.com
                </span>
                <span className="text-[8px] font-bold tracking-[0.22em] text-[#737982] uppercase mt-0.5">
                  POCKET PRO
                </span>
              </div>
              <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#e2e5e9] to-[#8a9099] border border-[#686e77] shadow-inner" />
            </div>

            {/* #71-520 Backlit Model Signature Teal Arched "LIGHT" Button */}
            {isBacklitModel && (
              <button
                type="button"
                onClick={() => {
                  const nextPreset =
                    system.settings.palette === 'pocket_pro_el'
                      ? 'original'
                      : 'pocket_pro_el';
                  system.applyScreenPreset(nextPreset, true);
                  onStateChange?.();
                }}
                className={`mt-1.5 px-6 py-0.5 rounded-t-full rounded-b-md bg-gradient-to-b ${st.accentBtn} border ${st.accentBorder} text-white text-[9px] font-black tracking-widest uppercase shadow-[0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.5)] active:scale-95 transition-transform cursor-pointer flex items-center gap-1`}
                title="Toggle Pocket Pro Electroluminescent Backlight (#71-520)"
              >
                <Sun className="w-2.5 h-2.5" />
                <span>LIGHT</span>
              </button>
            )}
          </div>

          {/* RIGHT GRIP + UPPER SHIELD [ON/OFF, MENU, PAUSE] + LOWER 2x2 [A B / C D] WELL */}
          <div className="flex flex-col items-center justify-between self-stretch py-1 min-w-[116px]">
            {/* Upper-Right Silver Shield Wing: Stacked Angled ON/OFF, MENU, PAUSE */}
            <div className="w-full rounded-tr-[26px] rounded-br-xl bg-gradient-to-b from-[#d5d9de] to-[#b5bbc3] border border-[#8e959e] px-3 py-2 shadow-[inset_0_1px_2px_rgba(255,255,255,0.7),0_2px_5px_rgba(0,0,0,0.35)] flex flex-col items-center gap-1.5">
              <div className="w-full flex items-center justify-between">
                <span className="text-[7px] font-bold tracking-wider text-[#2b3038] uppercase">
                  ON/OFF
                </span>
                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#e2e5e9] to-[#8a9099] border border-[#686e77] shadow-inner" />
              </div>

              {/* Round ON/OFF Button */}
              <button
                type="button"
                onClick={() => {
                  system.powerToggle();
                  onStateChange?.();
                }}
                className={`w-6 h-6 rounded-full bg-gradient-to-b ${st.accentBtn} border ${st.accentBorder} shadow-[0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.5)] active:scale-90 transition-transform cursor-pointer`}
                title={system.isPoweredOn ? 'ON/OFF (Power Off)' : 'ON/OFF (Power On)'}
                aria-label="ON/OFF Power Button"
              />

              {/* Angled Oval MENU Button */}
              <div className="flex flex-col items-center w-full -rotate-12">
                <span className="text-[7px] font-bold tracking-wider text-[#2b3038] uppercase">
                  MENU
                </span>
                <button
                  type="button"
                  {...bindButtonPointer('menu')}
                  className={`w-12 h-3.5 rounded-full bg-gradient-to-b ${st.accentBtn} border ${st.accentBorder} shadow-[0_2px_3px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.5)] active:scale-95 transition-transform cursor-pointer touch-none`}
                  title="MENU (Enter)"
                  aria-label="MENU Button"
                />
              </div>

              {/* Angled Oval PAUSE Button */}
              <div className="flex flex-col items-center w-full -rotate-12">
                <span className="text-[7px] font-bold tracking-wider text-[#2b3038] uppercase">
                  PAUSE
                </span>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    bindButtonPointer('pause').onPointerDown(e);
                    system.pauseToggle();
                    onStateChange?.();
                  }}
                  onPointerUp={bindButtonPointer('pause').onPointerUp}
                  onPointerCancel={bindButtonPointer('pause').onPointerCancel}
                  onLostPointerCapture={bindButtonPointer('pause').onLostPointerCapture}
                  className={`w-12 h-3.5 rounded-full bg-gradient-to-b ${st.accentBtn} border ${st.accentBorder} shadow-[0_2px_3px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.5)] active:scale-95 transition-transform cursor-pointer touch-none`}
                  title="PAUSE (Space)"
                  aria-label="PAUSE Button"
                />
              </div>

              {/* Side Volume / Sound Mute Pill */}
              <button
                type="button"
                onClick={() => {
                  system.soundToggle();
                  onStateChange?.();
                }}
                className="mt-0.5 px-2 py-0.5 rounded bg-black/20 hover:bg-black/30 text-[#22262c] text-[8px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                title={system.settings.muted ? 'Unmute Sound' : 'Mute Sound'}
              >
                {system.settings.muted ? (
                  <VolumeX className="w-2.5 h-2.5 text-rose-700" />
                ) : (
                  <Volume2 className="w-2.5 h-2.5" />
                )}
                <span>SOUND</span>
              </button>
            </div>

            {/* Lower-Right Grip: Circular Recessed Well with 2x2 [A B / C D] Buttons */}
            <div className="my-auto pt-2 flex items-center justify-center">
              <div className="p-2.5 rounded-full bg-black/35 border border-white/10 shadow-[inset_0_3px_6px_rgba(0,0,0,0.65)] grid grid-cols-2 gap-2.5">
                {(['a', 'b', 'c', 'd'] as const).map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    {...bindButtonPointer(btn)}
                    style={{ width: actBtnSize, height: actBtnSize }}
                    className={`rounded-full border-2 font-black text-xs uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
                      activeButtons[btn]
                        ? 'scale-92 bg-[#1c1f24] text-amber-300 border-black shadow-inner'
                        : 'bg-gradient-to-b from-[#525864] via-[#3a3f48] to-[#25282f] text-zinc-100 border-[#15171c] shadow-[0_3px_5px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.28)]'
                    }`}
                    aria-label={`Button ${btn.toUpperCase()}`}
                  >
                    {btn.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODEL 4: MINIMAL TOUCH CONTROLS (Compact Button-Only Border)
  // ============================================================================
  const orientPref = system.settings.touchOrientation || 'auto';
  const isHorizontal =
    orientPref === 'horizontal'
      ? true
      : orientPref === 'vertical'
      ? false
      : viewport.w >= 620 && viewport.w > viewport.h * 0.95;

  return (
    <div className="flex flex-col items-center justify-center select-none max-w-full">
      <div
        className={`flex ${
          isHorizontal ? 'flex-row gap-5 px-5 py-4' : 'flex-col gap-3 p-3.5'
        } items-center rounded-2xl bg-[#e6e8df] dark:bg-black border border-zinc-300 dark:border-zinc-900 shadow-lg dark:shadow-2xl transition-colors`}
      >
        <div className="bg-[#dce0d5] dark:bg-black p-1.5 rounded-xl border border-zinc-300 dark:border-zinc-900">
          <LCDScreen
            system={system}
            scale={effectiveScale}
            onFpsUpdate={onFpsUpdate}
          />
        </div>

        <div className="flex items-center gap-6">
          <div
            ref={dpadRef}
            onPointerDown={handleDpadPointerDown}
            onPointerMove={handleDpadPointerMove}
            onPointerUp={handleDpadPointerUp}
            onPointerCancel={handleDpadPointerUp}
            onLostPointerCapture={handleDpadPointerUp}
            className="relative w-28 h-28 rounded-full bg-zinc-800 border-2 border-zinc-700 touch-none cursor-pointer select-none"
          >
            <div className="absolute left-1/3 right-1/3 top-2 bottom-2 bg-zinc-700 rounded" />
            <div className="absolute top-1/3 bottom-1/3 left-2 right-2 bg-zinc-700 rounded" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              {(['a', 'b', 'c', 'd'] as const).map((btn) => (
                <button
                  key={btn}
                  type="button"
                  {...bindButtonPointer(btn)}
                  className="w-11 h-11 rounded-full bg-[#7a1f5c] hover:bg-[#8e266c] text-white font-bold text-xs uppercase cursor-pointer touch-none"
                >
                  {btn}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                {...bindButtonPointer('menu')}
                className="px-2 py-1 rounded bg-zinc-700 text-white text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <Menu className="w-3 h-3" /> Menu
              </button>
              <button
                type="button"
                onClick={() => {
                  system.soundToggle();
                  onStateChange?.();
                }}
                className="px-2 py-1 rounded bg-zinc-700 text-white text-[10px] flex items-center gap-1 cursor-pointer"
              >
                {system.settings.muted ? (
                  <VolumeX className="w-3 h-3" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  system.pauseToggle();
                  onStateChange?.();
                }}
                className="px-2 py-1 rounded bg-zinc-700 text-white text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <Pause className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TouchView = GameComConsole;
