import React, { useEffect, useState, useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { GameComButtons, GameComConsoleModel } from '../emulator/types';
import { LCDScreen } from './LCDScreen';
import { GameComWordmarkPaths, TigerWordmarkPaths } from './GameComLogo';

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
  const orientPref = system.settings.touchOrientation || 'auto';

  // Determine whether to render the Vertical Analogue-Pocket style handheld
  const isVerticalPocket =
    model === 'minimal' ||
    orientPref === 'vertical' ||
    (orientPref === 'auto' && viewport.h > viewport.w * 1.08);

  // Canonical 1x coordinate dimensions for each hardware shell (around the 200x160 LCD)
  const baseW = isVerticalPocket ? 320 : model === 'original' ? 560 : 500;
  const baseH = isVerticalPocket ? 510 : model === 'original' ? 320 : 300;

  // On the 1997 Original model, deprioritize the lower non-interactive stylus dock (y=238..320)
  // unless the user explicitly selects 'full-system' zoom.
  const priorityH =
    !isVerticalPocket && model === 'original' && bezelZoom !== 'full-system' ? 238 : baseH;

  const availW = Math.max(260, viewport.w - 16);
  const availH = Math.max(220, viewport.h - 48);

  // RetroArch-style uniform scaling: the entire console (screen, bezel, buttons, D-Pad)
  // scales by a single uniform multiplier `S` so proportions ALWAYS match the 1x design.
  const fitScale = Math.max(0.55, Math.min(availW / baseW, availH / priorityH));

  let S = fitScale;
  if (bezelZoom === 'auto' || bezelZoom === 'full-system') {
    S = fitScale;
  } else if (bezelZoom === 'mid') {
    S = fitScale * 1.18;
  } else if (bezelZoom === 'closeup') {
    S = fitScale * 1.38;
  } else if (bezelZoom === 'scale') {
    S = Math.max(0.75, Math.min(4.5, system.settings.touchScale || 2));
  }
  S = Math.round(S * 100) / 100;

  const totalW = Math.round(baseW * S);
  const totalH = Math.round(baseH * S);

  // Exact vertical focal center in canonical 1x coordinates:
  // - Vertical Pocket (320x510): LCD at y=44..204 -> center y=124
  // - 1997 Original   (560x320): Upper silver console y=4..238 (center y=121 in Auto) / LCD center y=126 when zoomed
  // - Pocket Pro      (500x300): LCD at y=48..208 -> center y=128
  const screenCenterY = isVerticalPocket
    ? 124
    : model === 'original'
    ? bezelZoom === 'auto'
      ? 121
      : 126
    : 128;
  const isZoomedIn =
    bezelZoom === 'mid' ||
    bezelZoom === 'closeup' ||
    totalH > availH ||
    (!isVerticalPocket && model === 'original' && bezelZoom !== 'full-system');

  // Shift the console vertically so the 200x160 LCD screen is prioritized at the viewport center
  // (and on 1997 Original, the bottom stylus dock is deprioritized at the bottom edge).
  const focusShiftY = isZoomedIn ? Math.round((baseH / 2 - screenCenterY) * S) : 0;

  const isBacklightActive = system.settings.palette === 'pocket_pro_el';

  const toggleBacklight = () => {
    const nextPreset =
      system.settings.palette === 'pocket_pro_el' ? 'original' : 'pocket_pro_el';
    system.applyScreenPreset(nextPreset, true);
    onStateChange?.();
  };

  // ============================================================================
  // LAYOUT C: VERTICAL POCKET HANDHELD (Analogue Pocket Form Factor + 1997 Game.Com Styling)
  // Canonical 1x space: 320 x 510, LCD (200x160) at (60, 44)
  // ============================================================================
  if (isVerticalPocket) {
    return (
      <div className="flex items-center justify-center overflow-hidden max-w-full max-h-full select-none">
        <div
          style={{
            width: totalW,
            height: totalH,
            transform: focusShiftY !== 0 ? `translateY(${focusShiftY}px)` : undefined
          }}
          className="relative shrink-0 select-none transition-transform duration-150"
        >
          {/* Precision SVG Hardware Shell */}
          <svg
            viewBox="0 0 320 510"
            className="w-full h-full drop-shadow-[0_18px_40px_rgba(0,0,0,0.75)] pointer-events-none"
          >
            <defs>
              <linearGradient id="vp-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2c3038" />
                <stop offset="50%" stopColor="#1f2329" />
                <stop offset="100%" stopColor="#14171b" />
              </linearGradient>
              <linearGradient id="vp-silver" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dde1e6" />
                <stop offset="55%" stopColor="#c5cad1" />
                <stop offset="100%" stopColor="#a7adb6" />
              </linearGradient>
              <radialGradient id="vp-well" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#101216" />
                <stop offset="100%" stopColor="#1c2026" />
              </radialGradient>
            </defs>

            {/* Outer Analogue-Pocket Vertical Body */}
            <rect
              x="4"
              y="4"
              width="312"
              height="502"
              rx="32"
              fill="url(#vp-body)"
              stroke="#3e444f"
              strokeWidth="2.5"
            />
            {/* Subtle Inner Moulded Seam */}
            <rect
              x="11"
              y="11"
              width="298"
              height="488"
              rx="26"
              fill="none"
              stroke="#111317"
              strokeWidth="1.2"
            />

            {/* Brushed Silver Upper Screen Shield */}
            <path
              d="M 22 20 H 298 A 14 14 0 0 1 304 34 V 222 A 18 18 0 0 1 286 240 H 34 A 18 18 0 0 1 16 222 V 34 A 14 14 0 0 1 22 20 Z"
              fill="url(#vp-silver)"
              stroke="#7e858f"
              strokeWidth="2"
            />

            {/* 4 Corner Screw Bosses on Silver Shield */}
            {[
              [30, 32],
              [290, 32],
              [30, 226],
              [290, 226]
            ].map(([cx, cy], idx) => (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r="4.2"
                fill="#b8bec7"
                stroke="#6b717a"
                strokeWidth="1"
              />
            ))}

            {/* Top "game.com" Geometric Wordmark + Planet Ring + TM */}
            <g transform="translate(97, 19) scale(0.55)">
              <GameComWordmarkPaths fill="#111317" dotFill="#111317" withPlanetRing />
            </g>
            <text
              x="226"
              y="28"
              fill="#2c313a"
              fontFamily="sans-serif"
              fontWeight="700"
              fontSize="5.5"
            >
              TM
            </text>

            {/* 4-Polygon 3D Sunken Chamfered Screen Frame (outer 48..272, 38..214 -> inner 60..260, 44..204) */}
            <polygon points="48,38 272,38 260,44 60,44" fill="#828891" />
            <polygon points="48,38 60,44 60,204 48,212" fill="#969ca5" />
            <polygon points="272,38 272,212 260,204 260,44" fill="#b4bac3" />
            <polygon points="60,204 260,204 272,212 48,212" fill="#d3d7dc" />
            <rect
              x="58"
              y="42"
              width="204"
              height="164"
              rx="3"
              fill="#181b20"
              stroke="#454a54"
              strokeWidth="1.5"
            />

            {/* Bottom of Silver Shield: "TIGER" */}
            <g transform="translate(136, 219) scale(0.5)">
              <TigerWordmarkPaths fill="#1c2026" />
            </g>

            {/* Recessed Circular D-Pad Well with Beveled Rim (Left: cx=86, cy=338, r=54) */}
            <circle
              cx="86"
              cy="338"
              r="55.5"
              fill="#2e333c"
              stroke="#4b5260"
              strokeWidth="1.2"
            />
            <circle
              cx="86"
              cy="338"
              r="53"
              fill="url(#vp-well)"
              stroke="#14171c"
              strokeWidth="1.5"
            />

            {/* Two Angled (-15deg) Double-Beveled Stadium Recesses for [A, B] & [C, D] */}
            <g transform="rotate(-15 232 314)">
              <rect
                x="182"
                y="291"
                width="100"
                height="46"
                rx="23"
                fill="#2e333c"
                stroke="#4b5260"
                strokeWidth="1.5"
              />
              <rect
                x="185"
                y="294"
                width="94"
                height="40"
                rx="20"
                fill="url(#vp-well)"
                stroke="#14171c"
                strokeWidth="1.2"
              />
            </g>
            <g transform="rotate(-15 240 368)">
              <rect
                x="190"
                y="345"
                width="100"
                height="46"
                rx="23"
                fill="#2e333c"
                stroke="#4b5260"
                strokeWidth="1.5"
              />
              <rect
                x="193"
                y="348"
                width="94"
                height="40"
                rx="20"
                fill="url(#vp-well)"
                stroke="#14171c"
                strokeWidth="1.2"
              />
            </g>

            {/* Continuous Recessed Trough & Evenly Spaced System Pill Labels (cx = 52, 106, 160, 214, 268) */}
            <rect
              x="26"
              y="438"
              width="268"
              height="20"
              rx="10"
              fill="#111318"
              stroke="#333842"
              strokeWidth="1.2"
            />
            <text x="52" y="431" textAnchor="middle" fill="#c7cdd6" fontSize="7" fontWeight="800" letterSpacing="0.8">
              ON/OFF
            </text>
            <text x="106" y="431" textAnchor="middle" fill="#c7cdd6" fontSize="7" fontWeight="800" letterSpacing="0.8">
              MENU
            </text>
            <text x="160" y="431" textAnchor="middle" fill="#c7cdd6" fontSize="7" fontWeight="800" letterSpacing="0.8">
              SOUND
            </text>
            <text x="214" y="431" textAnchor="middle" fill="#c7cdd6" fontSize="7" fontWeight="800" letterSpacing="0.8">
              PAUSE
            </text>
            <text x="268" y="431" textAnchor="middle" fill="#c7cdd6" fontSize="7" fontWeight="800" letterSpacing="0.8">
              LIGHT
            </text>

            {/* Bottom Speaker Grille Slots */}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect
                key={i}
                x={112 + i * 15}
                y="478"
                width="6"
                height="12"
                rx="3"
                fill="#0e1014"
              />
            ))}
          </svg>

          {/* LCD Screen at exact (60, 44) -> (200x160) in 320x510 space */}
          <div
            style={{
              left: `${(60 / 320) * 100}%`,
              top: `${(44 / 510) * 100}%`,
              width: `${(200 / 320) * 100}%`,
              height: `${(160 / 510) * 100}%`
            }}
            className="absolute overflow-hidden flex items-center justify-center"
          >
            <LCDScreen system={system} scale={S} frameless onFpsUpdate={onFpsUpdate} />
          </div>

          {/* Interactive 8-Way D-Pad at (cx=86, cy=338, r=48) */}
          <div
            ref={dpadRef}
            onPointerDown={handleDpadPointerDown}
            onPointerMove={handleDpadPointerMove}
            onPointerUp={handleDpadPointerUp}
            onPointerCancel={handleDpadPointerUp}
            onLostPointerCapture={handleDpadPointerUp}
            style={{
              left: `${((86 - 48) / 320) * 100}%`,
              top: `${((338 - 48) / 510) * 100}%`,
              width: `${(96 / 320) * 100}%`,
              height: `${(96 / 510) * 100}%`
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#343942] via-[#22262c] to-[#15181c] border border-black shadow-[0_4px_10px_rgba(0,0,0,0.75)] touch-none cursor-pointer"
            aria-label="Directional Pad"
          >
            <div
              className={`absolute left-[34%] right-[34%] top-[10%] bottom-[10%] rounded-sm bg-[#2c313a] border border-white/10 ${
                activeButtons.up
                  ? '-translate-y-[3%] bg-[#434a57]'
                  : activeButtons.down
                  ? 'translate-y-[3%] bg-[#434a57]'
                  : ''
              }`}
            />
            <div
              className={`absolute top-[34%] bottom-[34%] left-[10%] right-[10%] rounded-sm bg-[#2c313a] border border-white/10 ${
                activeButtons.left
                  ? '-translate-x-[3%] bg-[#434a57]'
                  : activeButtons.right
                  ? 'translate-x-[3%] bg-[#434a57]'
                  : ''
              }`}
            />
            <div className="absolute inset-[37%] rounded-full bg-[#1c1f25] shadow-inner pointer-events-none" />
          </div>

          {/* Interactive A, B, C, D Action Buttons */}
          {(
            [
              { id: 'a', cx: 209, cy: 320 },
              { id: 'b', cx: 255, cy: 308 },
              { id: 'c', cx: 217, cy: 374 },
              { id: 'd', cx: 263, cy: 362 }
            ] as const
          ).map((b) => (
            <button
              key={b.id}
              type="button"
              {...bindButtonPointer(b.id)}
              style={{
                left: `${((b.cx - 19) / 320) * 100}%`,
                top: `${((b.cy - 19) / 510) * 100}%`,
                width: `${(38 / 320) * 100}%`,
                height: `${(38 / 510) * 100}%`,
                fontSize: `${Math.max(10, Math.round(13 * S))}px`
              }}
              className={`absolute -rotate-15 rounded-full border font-black uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
                activeButtons[b.id]
                  ? 'scale-92 bg-[#111317] text-amber-300 border-black shadow-inner'
                  : 'bg-gradient-to-b from-[#3b404a] via-[#252930] to-[#16181d] text-zinc-100 border-black shadow-[0_3px_6px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.25)]'
              }`}
              aria-label={`Button ${b.id.toUpperCase()}`}
            >
              {b.id.toUpperCase()}
            </button>
          ))}

          {/* Accessible Bottom System Pill Row (evenly spaced at cx = 52, 106, 160, 214, 268) */}
          <button
            type="button"
            onClick={() => {
              system.powerToggle();
              onStateChange?.();
            }}
            style={{
              left: `${((52 - 18) / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(36 / 320) * 100}%`,
              height: `${(12 / 510) * 100}%`
            }}
            className={`absolute rounded-full border cursor-pointer active:scale-95 ${
              system.isPoweredOn
                ? 'bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border-[#1e3a8a]'
                : 'bg-gradient-to-b from-[#374151] to-[#1f2937] border-black'
            }`}
            title="ON/OFF Power"
            aria-label="ON/OFF Power"
          />

          <button
            type="button"
            {...bindButtonPointer('menu')}
            style={{
              left: `${((106 - 18) / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(36 / 320) * 100}%`,
              height: `${(12 / 510) * 100}%`
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] active:scale-95 cursor-pointer touch-none"
            title="MENU"
            aria-label="MENU"
          />

          <button
            type="button"
            {...bindButtonPointer('sound')}
            style={{
              left: `${((160 - 18) / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(36 / 320) * 100}%`,
              height: `${(12 / 510) * 100}%`
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] active:scale-95 cursor-pointer touch-none"
            title="SOUND"
            aria-label="SOUND"
          />

          <button
            type="button"
            {...bindButtonPointer('pause')}
            style={{
              left: `${((214 - 18) / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(36 / 320) * 100}%`,
              height: `${(12 / 510) * 100}%`
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] active:scale-95 cursor-pointer touch-none"
            title="PAUSE"
            aria-label="PAUSE"
          />

          <button
            type="button"
            onClick={toggleBacklight}
            style={{
              left: `${((268 - 18) / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(36 / 320) * 100}%`,
              height: `${(12 / 510) * 100}%`
            }}
            className={`absolute rounded-full border active:scale-95 cursor-pointer ${
              isBacklightActive
                ? 'bg-gradient-to-b from-[#10b981] to-[#059669] border-[#064e3b]'
                : 'bg-gradient-to-b from-[#06b6d4] to-[#0891b2] border-[#155e75]'
            }`}
            title="Toggle Backlight"
            aria-label="LIGHT"
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // LAYOUT A: 1997 ORIGINAL GAME.COM (#71-500 — Exact Match to original.gif)
  // Canonical 1x space: 560 x 320, LCD (200x160) at (180, 48)
  // ============================================================================
  if (model === 'original') {
    return (
      <div className="flex items-center justify-center overflow-hidden max-w-full max-h-full select-none">
        <div
          style={{
            width: totalW,
            height: totalH,
            transform: focusShiftY !== 0 ? `translateY(${focusShiftY}px)` : undefined
          }}
          className="relative shrink-0 select-none transition-transform duration-150"
        >
          {/* Precision 1997 Original Game.Com SVG Shell */}
          <svg
            viewBox="0 0 560 320"
            className="w-full h-full drop-shadow-[0_20px_45px_rgba(0,0,0,0.8)] pointer-events-none"
          >
            <defs>
              <linearGradient id="orig-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#32363e" />
                <stop offset="50%" stopColor="#21242a" />
                <stop offset="100%" stopColor="#14161a" />
              </linearGradient>
              <linearGradient id="orig-silver" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e2e5e9" />
                <stop offset="55%" stopColor="#c9ced4" />
                <stop offset="100%" stopColor="#aeb4bc" />
              </linearGradient>
              <radialGradient id="orig-well" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#15181d" />
                <stop offset="85%" stopColor="#252932" />
                <stop offset="100%" stopColor="#7c828b" />
              </radialGradient>
            </defs>

            {/* Outer Wide Charcoal Handheld Body (Exact 1997 #71-500 Silhouette) */}
            <path
              d="M 28 12 Q 280 0 532 12 C 548 16 556 32 556 54 L 552 268 C 551 294 536 308 510 310 Q 280 318 50 310 C 24 308 9 294 8 268 L 4 54 C 4 32 12 16 28 12 Z"
              fill="url(#orig-body)"
              stroke="#3b4048"
              strokeWidth="2.2"
            />

            {/* Full-Width Brushed Silver Metallic Upper Faceplate with Accurate Lower Seam */}
            <path
              d="M 36 18 Q 280 7 524 18 C 538 21 545 34 545 52 L 543 211 Q 542 217 532 218 L 412 230 H 146 Q 86 234 30 222 Q 16 219 15 208 L 15 52 C 15 34 22 21 36 18 Z"
              fill="url(#orig-silver)"
              stroke="#787f87"
              strokeWidth="1.8"
            />

            {/* Top "game.com" Geometric Wordmark + Saturn Ring Accent + TM */}
            <g transform="translate(216, 12) scale(0.56)">
              <GameComWordmarkPaths fill="#111317" dotFill="#111317" withPlanetRing />
            </g>
            <text
              x="346"
              y="22"
              fill="#2c313a"
              fontFamily="sans-serif"
              fontWeight="700"
              fontSize="5.5"
            >
              TM
            </text>

            {/* Deep 4-Polygon Trapezoidal Chamfered Screen Inset (outer 154..406, 34..216 -> inner 180..380, 46..206) */}
            <polygon points="154,34 406,34 380,46 180,46" fill="#899099" />
            <polygon points="154,34 180,46 180,206 154,216" fill="#a5abb4" />
            <polygon points="406,34 406,216 380,206 380,46" fill="#eceff2" />
            <polygon points="180,206 380,206 406,216 154,216" fill="#bdc3cb" />
            <rect
              x="178"
              y="44"
              width="204"
              height="164"
              rx="2"
              fill="#181b20"
              stroke="#333840"
              strokeWidth="1.5"
            />

            {/* Bottom "TIGER" Wordmark directly below screen bevel */}
            <g transform="translate(254, 219) scale(0.5)">
              <TigerWordmarkPaths fill="#1c2026" />
            </g>

            {/* Top-Left Fanning Speaker Dot Matrix (4 tapered curved rows matching 1997 hardware) */}
            {[0, 1, 2, 3].map((row) =>
              Array.from({ length: 8 }).map((__, col) => (
                <circle
                  key={`${row}-${col}`}
                  cx={42 + col * 9.5}
                  cy={44 + row * (5.2 + col * 0.45) - col * 1.1}
                  r={1.1 + col * 0.16}
                  fill="#171a1f"
                />
              ))
            )}

            {/* Left Circular Recessed D-Pad Bezel Well (cx=84, cy=146, r=44) */}
            <circle
              cx="84"
              cy="146"
              r="45"
              fill="#e4e7eb"
              stroke="#8b929b"
              strokeWidth="1.2"
            />
            <circle
              cx="84"
              cy="146"
              r="43"
              fill="url(#orig-well)"
              stroke="#262a31"
              strokeWidth="1.5"
            />

            {/* Top-Right Round ON/OFF Bezel Ring + Crisp Label */}
            <circle
              cx="442"
              cy="50"
              r="12"
              fill="#1d2128"
              stroke="#7e858f"
              strokeWidth="1.5"
            />
            <text
              x="460"
              y="53"
              fill="#1a1d24"
              fontFamily="sans-serif"
              fontWeight="800"
              fontSize="8"
              letterSpacing="0.9"
            >
              ON/OFF
            </text>

            {/* Middle-Right Two Angled (-15deg) Sleek Silver-Beveled Stadium Wells for [A, B] (cy=104) and [C, D] (cy=150) */}
            <g transform="rotate(-15 466 104)">
              <rect
                x="419"
                y="86"
                width="94"
                height="36"
                rx="18"
                fill="#a8aeb7"
                stroke="#686e78"
                strokeWidth="1.5"
              />
              <rect
                x="422"
                y="89"
                width="88"
                height="30"
                rx="15"
                fill="#cdd2d8"
                stroke="#eceff2"
                strokeWidth="1"
              />
            </g>
            <g transform="rotate(-15 474 150)">
              <rect
                x="427"
                y="132"
                width="94"
                height="36"
                rx="18"
                fill="#a8aeb7"
                stroke="#686e78"
                strokeWidth="1.5"
              />
              <rect
                x="430"
                y="135"
                width="88"
                height="30"
                rx="15"
                fill="#cdd2d8"
                stroke="#eceff2"
                strokeWidth="1"
              />
            </g>

            {/* Continuous Recessed Seam Trough & Individually Centered Labels for [MENU] [SOUND] [PAUSE] */}
            {/* Exact collinear centers: MENU (432, 215), SOUND (474, 211), PAUSE (516, 207) — step (+42, -4), angle -5.44deg */}
            <g transform="rotate(-5.44 474 211)">
              <rect
                x="412"
                y="204.5"
                width="124"
                height="13"
                rx="6.5"
                fill="#6d737d"
                stroke="#525760"
                strokeWidth="1.2"
              />
              <text x="432" y="196.5" textAnchor="middle" fill="#181b20" fontFamily="sans-serif" fontSize="6.8" fontWeight="800" letterSpacing="0.7">
                MENU
              </text>
              <text x="474" y="196.5" textAnchor="middle" fill="#181b20" fontFamily="sans-serif" fontSize="6.8" fontWeight="800" letterSpacing="0.7">
                SOUND
              </text>
              <text x="516" y="196.5" textAnchor="middle" fill="#181b20" fontFamily="sans-serif" fontSize="6.8" fontWeight="800" letterSpacing="0.7">
                PAUSE
              </text>
            </g>

            {/* Lower Charcoal Grip Dock & Horizontal Recessed Tiger Stylus */}
            <rect
              x="108"
              y="252"
              width="348"
              height="28"
              rx="14"
              fill="#0e1014"
              stroke="#2a2e36"
              strokeWidth="1.5"
            />
            {/* Tapered Black Stylus Pen Body */}
            <path
              d="M 118 266 L 158 257 H 424 C 436 257 444 261 444 266 C 444 271 436 275 424 275 H 158 Z"
              fill="#1d2026"
              stroke="#08090b"
              strokeWidth="1.2"
            />
            {/* Finger-grip recess with 3 tactile dots */}
            <rect x="218" y="258" width="38" height="16" rx="4" fill="#2a2e36" stroke="#111317" strokeWidth="1" />
            <circle cx="228" cy="266" r="1.2" fill="#525864" />
            <circle cx="234" cy="266" r="1.2" fill="#525864" />
            <circle cx="240" cy="266" r="1.2" fill="#525864" />
            <g transform="translate(268, 261) scale(0.45)">
              <TigerWordmarkPaths fill="#b8bec7" />
            </g>
          </svg>

          {/* LCD Screen at exact (180, 46) -> (200x160) in 560x320 space */}
          <div
            style={{
              left: `${(180 / 560) * 100}%`,
              top: `${(46 / 320) * 100}%`,
              width: `${(200 / 560) * 100}%`,
              height: `${(160 / 320) * 100}%`
            }}
            className="absolute overflow-hidden flex items-center justify-center"
          >
            <LCDScreen system={system} scale={S} frameless onFpsUpdate={onFpsUpdate} />
          </div>

          {/* Interactive 8-Way D-Pad Disc at (cx=84, cy=146, r=38) */}
          <div
            ref={dpadRef}
            onPointerDown={handleDpadPointerDown}
            onPointerMove={handleDpadPointerMove}
            onPointerUp={handleDpadPointerUp}
            onPointerCancel={handleDpadPointerUp}
            onLostPointerCapture={handleDpadPointerUp}
            style={{
              left: `${((84 - 38) / 560) * 100}%`,
              top: `${((146 - 38) / 320) * 100}%`,
              width: `${(76 / 560) * 100}%`,
              height: `${(76 / 320) * 100}%`
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2f333b] via-[#1c1f24] to-[#101215] border border-black shadow-[0_4px_8px_rgba(0,0,0,0.75)] touch-none cursor-pointer"
            aria-label="Directional Pad"
          >
            <div
              className={`absolute left-[34%] right-[34%] top-[10%] bottom-[10%] rounded-sm bg-[#272b33] border border-white/10 ${
                activeButtons.up
                  ? '-translate-y-[3%] bg-[#3e4450]'
                  : activeButtons.down
                  ? 'translate-y-[3%] bg-[#3e4450]'
                  : ''
              }`}
            />
            <div
              className={`absolute top-[34%] bottom-[34%] left-[10%] right-[10%] rounded-sm bg-[#272b33] border border-white/10 ${
                activeButtons.left
                  ? '-translate-x-[3%] bg-[#3e4450]'
                  : activeButtons.right
                  ? 'translate-x-[3%] bg-[#3e4450]'
                  : ''
              }`}
            />
            <div className="absolute inset-[36%] rounded-full bg-[#16191e] shadow-inner pointer-events-none" />
          </div>

          {/* Interactive Round Blue ON/OFF Button at (cx=442, cy=50, r=8.5) */}
          <button
            type="button"
            onClick={() => {
              system.powerToggle();
              onStateChange?.();
            }}
            style={{
              left: `${((442 - 8.5) / 560) * 100}%`,
              top: `${((50 - 8.5) / 320) * 100}%`,
              width: `${(17 / 560) * 100}%`,
              height: `${(17 / 320) * 100}%`
            }}
            className={`absolute rounded-full border transition-transform active:scale-90 cursor-pointer ${
              system.isPoweredOn
                ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] border-[#1e3a8a]'
                : 'bg-gradient-to-b from-[#1e40af] to-[#172554] border-black'
            }`}
            title={system.isPoweredOn ? 'ON/OFF (Power Off)' : 'ON/OFF (Power On)'}
            aria-label="ON/OFF Power Button"
          />

          {/* Interactive Angled A, B, C, D Action Buttons (r=14.5 inside sleek 94x36 stadiums) */}
          {(
            [
              { id: 'a', cx: 444, cy: 110 },
              { id: 'b', cx: 488, cy: 98 },
              { id: 'c', cx: 452, cy: 156 },
              { id: 'd', cx: 496, cy: 144 }
            ] as const
          ).map((b) => (
            <button
              key={b.id}
              type="button"
              {...bindButtonPointer(b.id)}
              style={{
                left: `${((b.cx - 14.5) / 560) * 100}%`,
                top: `${((b.cy - 14.5) / 320) * 100}%`,
                width: `${(29 / 560) * 100}%`,
                height: `${(29 / 320) * 100}%`,
                fontSize: `${Math.max(8, Math.round(9.5 * S))}px`
              }}
              className={`absolute -rotate-15 rounded-full border font-black uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
                activeButtons[b.id]
                  ? 'scale-92 bg-[#111317] text-amber-300 border-black shadow-inner'
                  : 'bg-gradient-to-b from-[#363b44] via-[#22252b] to-[#121418] text-zinc-100 border-black shadow-[0_3px_5px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.28)]'
              }`}
              aria-label={`Button ${b.id.toUpperCase()}`}
            >
              {b.id.toUpperCase()}
            </button>
          ))}

          {/* Interactive Bottom-Right Blue Pill Buttons inside the recessed seam trough: [MENU] [SOUND] [PAUSE] */}
          {/* Collinear centers: MENU (432, 215), SOUND (474, 211), PAUSE (516, 207), width=31, height=8.5 */}
          <button
            type="button"
            {...bindButtonPointer('menu')}
            style={{
              left: `${((432 - 15.5) / 560) * 100}%`,
              top: `${((215 - 4.25) / 320) * 100}%`,
              width: `${(31 / 560) * 100}%`,
              height: `${(8.5 / 320) * 100}%`,
              transform: 'rotate(-5.44deg)'
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#0f172a] shadow active:scale-95 cursor-pointer touch-none"
            title="MENU (Enter)"
            aria-label="MENU Button"
          />

          <button
            type="button"
            {...bindButtonPointer('sound')}
            style={{
              left: `${((474 - 15.5) / 560) * 100}%`,
              top: `${((211 - 4.25) / 320) * 100}%`,
              width: `${(31 / 560) * 100}%`,
              height: `${(8.5 / 320) * 100}%`,
              transform: 'rotate(-5.44deg)'
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#0f172a] shadow active:scale-95 cursor-pointer touch-none"
            title="SOUND"
            aria-label="SOUND Button"
          />

          <button
            type="button"
            {...bindButtonPointer('pause')}
            style={{
              left: `${((516 - 15.5) / 560) * 100}%`,
              top: `${((207 - 4.25) / 320) * 100}%`,
              width: `${(31 / 560) * 100}%`,
              height: `${(8.5 / 320) * 100}%`,
              transform: 'rotate(-5.44deg)'
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#0f172a] shadow active:scale-95 cursor-pointer touch-none"
            title="PAUSE (Space)"
            aria-label="PAUSE Button"
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // LAYOUT B: 1998/1999 GAME.COM POCKET PRO (#71-510 & #71-520 Backlit)
  // Exact match to pocketpro.gif & pocketprobl.gif:
  // - Single continuous T-shaped winged silver metallic shield (NO gaps!)
  // - Contoured ergonomic outer shell with flared lower grip lobes
  // - 4 angled speaker slots on left wing, 4 silver screw bosses
  // - Stacked angled [ON/OFF], [MENU], [PAUSE] on right silver wing
  // - Lower-left circular cross D-Pad & lower-right circular 2x2 [A B / C D] well
  // - #71-520 Backlit model includes the teal arched [LIGHT] button on the chin!
  // Canonical 1x space: 500 x 300, LCD (200x160) at (150, 48)
  // ============================================================================
  const paletteMap: Record<
    string,
    {
      cTop: string;
      cMid: string;
      cBot: string;
      stroke: string;
      wellFill: string;
      btnTop: string;
      btnBot: string;
      btnBorder: string;
    }
  > = {
    pocketpro_backlit: {
      cTop: '#2e323a',
      cMid: '#21242a',
      cBot: '#15171c',
      stroke: '#434853',
      wellFill: '#16181d',
      btnTop: '#06b6d4',
      btnBot: '#0891b2',
      btnBorder: '#164e63'
    },
    pocketpro_purple: {
      cTop: '#5b2a86',
      cMid: '#431d66',
      cBot: '#2b1045',
      stroke: '#7c3aed',
      wellFill: '#240d3a',
      btnTop: '#a78bfa',
      btnBot: '#7c3aed',
      btnBorder: '#4c1d95'
    },
    pocketpro_green: {
      cTop: '#0f6852',
      cMid: '#0a4e3d',
      cBot: '#053328',
      stroke: '#10b981',
      wellFill: '#04281f',
      btnTop: '#34d399',
      btnBot: '#059669',
      btnBorder: '#064e3b'
    },
    pocketpro_blue: {
      cTop: '#1e469c',
      cMid: '#173679',
      cBot: '#0f2352',
      stroke: '#3b82f6',
      wellFill: '#0c1b40',
      btnTop: '#60a5fa',
      btnBot: '#2563eb',
      btnBorder: '#1e3a8a'
    },
    pocketpro_pink: {
      cTop: '#9d174d',
      cMid: '#7c133d',
      cBot: '#500724',
      stroke: '#f472b6',
      wellFill: '#3b051a',
      btnTop: '#f472b6',
      btnBot: '#db2777',
      btnBorder: '#831843'
    }
  };

  const p = paletteMap[model] || paletteMap.pocketpro_purple;

  return (
    <div className="flex items-center justify-center overflow-hidden max-w-full max-h-full select-none">
      <div
        style={{
          width: totalW,
          height: totalH,
          transform: focusShiftY !== 0 ? `translateY(${focusShiftY}px)` : undefined
        }}
        className="relative shrink-0 select-none transition-transform duration-150"
      >
        {/* Precision Pocket Pro SVG Hardware Shell */}
        <svg
          viewBox="0 0 500 300"
          className="w-full h-full drop-shadow-[0_20px_45px_rgba(0,0,0,0.8)] pointer-events-none"
        >
          <defs>
            <linearGradient id="pp-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.cTop} />
              <stop offset="55%" stopColor={p.cMid} />
              <stop offset="100%" stopColor={p.cBot} />
            </linearGradient>
            <linearGradient id="pp-silver" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e1e4e8" />
              <stop offset="50%" stopColor="#c6cbd2" />
              <stop offset="100%" stopColor="#aab0b8" />
            </linearGradient>
          </defs>

          {/* Contoured Pocket Pro Outer Shell with Arched Top & Flared Lower Grip Lobes */}
          <path
            d="M 54 14 Q 250 2 446 14 C 474 16 490 42 492 92 L 496 205 C 497 258 468 292 420 292 C 388 292 372 284 352 284 H 148 C 128 284 112 292 80 292 C 32 292 3 258 4 205 L 8 92 C 10 42 26 16 54 14 Z"
            fill="url(#pp-body)"
            stroke={p.stroke}
            strokeWidth="2.2"
          />

          {/* ONE-PIECE Continuous T-Shaped Winged Silver Metallic Shield (Right wing extends to y=126 for generous button breathing room) */}
          <path
            d="M 56 18 Q 250 8 444 18 A 22 22 0 0 1 466 38 L 470 112 A 14 14 0 0 1 456 126 H 394 A 24 24 0 0 0 364 148 V 248 A 28 28 0 0 1 336 276 H 164 A 28 28 0 0 1 136 248 V 148 A 24 24 0 0 0 106 126 H 44 A 14 14 0 0 1 30 112 L 34 38 A 22 22 0 0 1 56 18 Z"
            fill="url(#pp-silver)"
            stroke="#7d838b"
            strokeWidth="2"
          />

          {/* 4 Recessed Metallic Screw Bosses on the Silver Shield */}
          {[
            [52, 34],
            [448, 34],
            [156, 254],
            [344, 254]
          ].map(([cx, cy], idx) => (
            <g key={idx}>
              <circle cx={cx} cy={cy} r="5.5" fill="#9fa5ae" stroke="#6c727a" strokeWidth="1" />
              <circle cx={cx} cy={cy} r="3.2" fill="#cfd3d9" />
            </g>
          ))}

          {/* Top "TIGER" Logo on the Silver Shield Arch */}
          <g transform="translate(224, 15) scale(0.46)">
            <TigerWordmarkPaths fill="#1e2228" />
          </g>

          {/* Left Wing: Power/Backlight Indicator Dot + 4 Angled Horizontal Speaker Slots */}
          <circle cx="88" cy="34" r="2.2" fill={system.isPoweredOn ? '#22c55e' : '#4b5563'} />
          <g transform="rotate(10 78 76)">
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x="54"
                y={52 + i * 11}
                width="44"
                height="5"
                rx="2.5"
                fill="#22262e"
              />
            ))}
          </g>

          {/* Center 4-Polygon 3D Sunken Chamfered Screen Inset (outer 130..370, 32..224 -> inner 150..350, 48..208) */}
          <polygon points="130,32 370,32 350,48 150,48" fill="#8d939c" />
          <polygon points="130,32 150,48 150,208 130,224" fill="#9fa5ae" />
          <polygon points="370,32 370,224 350,208 350,48" fill="#e6e9ed" />
          <polygon points="150,208 350,208 370,224 130,224" fill="#b7bdc5" />
          <rect
            x="148"
            y="46"
            width="204"
            height="164"
            rx="3"
            fill={isBacklightActive ? '#092e20' : '#181b20'}
            stroke="#363b44"
            strokeWidth="1.5"
          />

          {/* Embossed "game.com POCKET PRO" on the Silver Chin */}
          <g transform="translate(194, 226) scale(0.49)">
            <GameComWordmarkPaths fill="#6c727b" />
          </g>
          <text
            x="250"
            y="251"
            textAnchor="middle"
            fill="#6c727b"
            fontFamily="sans-serif"
            fontWeight="800"
            fontSize="7"
            letterSpacing="2.4"
          >
            POCKET PRO
          </text>

          {/* Right Silver Wing Recessed Sockets & Crisp Labels for ON/OFF (418,45), MENU (424,76), PAUSE (430,106) */}
          <g transform="rotate(-14 418 45)">
            <circle cx="418" cy="45" r="8.5" fill="#7c828c" stroke="#5c626b" strokeWidth="1" />
            <text x="418" y="32.5" textAnchor="middle" fill="#1e2228" fontSize="6.4" fontWeight="800" letterSpacing="0.7">
              ON/OFF
            </text>
          </g>
          <g transform="rotate(-14 424 76)">
            <rect x="406.5" y="70.25" width="35" height="11.5" rx="5.75" fill="#7c828c" stroke="#5c626b" strokeWidth="1" />
            <text x="424" y="65.5" textAnchor="middle" fill="#1e2228" fontSize="6.4" fontWeight="800" letterSpacing="0.7">
              MENU
            </text>
          </g>
          <g transform="rotate(-14 430 106)">
            <rect x="412.5" y="100.25" width="35" height="11.5" rx="5.75" fill="#7c828c" stroke="#5c626b" strokeWidth="1" />
            <text x="430" y="95.5" textAnchor="middle" fill="#1e2228" fontSize="6.4" fontWeight="800" letterSpacing="0.7">
              PAUSE
            </text>
          </g>

          {/* Lower-Left Grip Double-Rimmed Circular D-Pad Well (cx=72, cy=198, r=47 — completely OFF silver plate) */}
          <circle
            cx="72"
            cy="198"
            r="48.5"
            fill="rgba(0,0,0,0.35)"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1.2"
          />
          <circle
            cx="72"
            cy="198"
            r="46.5"
            fill={p.wellFill}
            stroke="rgba(0,0,0,0.65)"
            strokeWidth="1.5"
          />

          {/* Lower-Right Grip Double-Rimmed Circular 2x2 Action Button Well (cx=428, cy=198, r=47 — completely OFF silver plate) */}
          <circle
            cx="428"
            cy="198"
            r="48.5"
            fill="rgba(0,0,0,0.35)"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1.2"
          />
          <circle
            cx="428"
            cy="198"
            r="46.5"
            fill={p.wellFill}
            stroke="rgba(0,0,0,0.65)"
            strokeWidth="1.5"
          />
        </svg>

        {/* LCD Screen at exact (150, 48) -> (200x160) in 500x300 space */}
        <div
          style={{
            left: `${(150 / 500) * 100}%`,
            top: `${(48 / 300) * 100}%`,
            width: `${(200 / 500) * 100}%`,
            height: `${(160 / 300) * 100}%`
          }}
          className="absolute overflow-hidden flex items-center justify-center"
        >
          <LCDScreen system={system} scale={S} frameless onFpsUpdate={onFpsUpdate} />
        </div>

        {/* Interactive Cross D-Pad at (cx=72, cy=198, r=41) */}
        <div
          ref={dpadRef}
          onPointerDown={handleDpadPointerDown}
          onPointerMove={handleDpadPointerMove}
          onPointerUp={handleDpadPointerUp}
          onPointerCancel={handleDpadPointerUp}
          onLostPointerCapture={handleDpadPointerUp}
          style={{
            left: `${((72 - 41) / 500) * 100}%`,
            top: `${((198 - 41) / 300) * 100}%`,
            width: `${(82 / 500) * 100}%`,
            height: `${(82 / 300) * 100}%`
          }}
          className="absolute rounded-full bg-gradient-to-b from-[#494e58] via-[#343840] to-[#23262c] border border-black shadow-[0_4px_8px_rgba(0,0,0,0.75)] touch-none cursor-pointer"
          aria-label="Pocket Pro Directional Pad"
        >
          <div
            className={`absolute left-[33%] right-[33%] top-[9%] bottom-[9%] rounded-sm bg-[#3d424b] border border-white/10 ${
              activeButtons.up
                ? '-translate-y-[3%] bg-[#555c69]'
                : activeButtons.down
                ? 'translate-y-[3%] bg-[#555c69]'
                : ''
            }`}
          />
          <div
            className={`absolute top-[33%] bottom-[33%] left-[9%] right-[9%] rounded-sm bg-[#3d424b] border border-white/10 ${
              activeButtons.left
                ? '-translate-x-[3%] bg-[#555c69]'
                : activeButtons.right
                ? 'translate-x-[3%] bg-[#555c69]'
                : ''
            }`}
          />
          <div className="absolute inset-[36%] rounded-full bg-[#2b2f37] shadow-inner pointer-events-none" />
        </div>

        {/* Right Wing Stacked Buttons: Round ON/OFF (418,45 r=7), Angled Oval MENU (424,76 32x9), Angled Oval PAUSE (430,106 32x9) */}
        <button
          type="button"
          onClick={() => {
            system.powerToggle();
            onStateChange?.();
          }}
          style={{
            left: `${((418 - 7) / 500) * 100}%`,
            top: `${((45 - 7) / 300) * 100}%`,
            width: `${(14 / 500) * 100}%`,
            height: `${(14 / 300) * 100}%`,
            background: `linear-gradient(to bottom, ${p.btnTop}, ${p.btnBot})`,
            borderColor: p.btnBorder
          }}
          className="absolute rounded-full border shadow active:scale-90 transition-transform cursor-pointer"
          title={system.isPoweredOn ? 'ON/OFF (Power Off)' : 'ON/OFF (Power On)'}
          aria-label="ON/OFF Power Button"
        />

        <button
          type="button"
          {...bindButtonPointer('menu')}
          style={{
            left: `${((424 - 16) / 500) * 100}%`,
            top: `${((76 - 4.5) / 300) * 100}%`,
            width: `${(32 / 500) * 100}%`,
            height: `${(9 / 300) * 100}%`,
            background: `linear-gradient(to bottom, ${p.btnTop}, ${p.btnBot})`,
            borderColor: p.btnBorder,
            transform: 'rotate(-14deg)'
          }}
          className="absolute rounded-full border shadow active:scale-95 transition-transform cursor-pointer touch-none"
          title="MENU (Enter)"
          aria-label="MENU Button"
        />

        <button
          type="button"
          {...bindButtonPointer('pause')}
          style={{
            left: `${((430 - 16) / 500) * 100}%`,
            top: `${((106 - 4.5) / 300) * 100}%`,
            width: `${(32 / 500) * 100}%`,
            height: `${(9 / 300) * 100}%`,
            background: `linear-gradient(to bottom, ${p.btnTop}, ${p.btnBot})`,
            borderColor: p.btnBorder,
            transform: 'rotate(-14deg)'
          }}
          className="absolute rounded-full border shadow active:scale-95 transition-transform cursor-pointer touch-none"
          title="PAUSE (Space)"
          aria-label="PAUSE Button"
        />

        {/* Interactive 2x2 [A, B / C, D] Round Buttons inside Lower-Right Grip Well (cx=428, cy=198) */}
        {(
          [
            { id: 'a', cx: 409, cy: 179 },
            { id: 'b', cx: 447, cy: 179 },
            { id: 'c', cx: 409, cy: 217 },
            { id: 'd', cx: 447, cy: 217 }
          ] as const
        ).map((b) => (
          <button
            key={b.id}
            type="button"
            {...bindButtonPointer(b.id)}
            style={{
              left: `${((b.cx - 16) / 500) * 100}%`,
              top: `${((b.cy - 16) / 300) * 100}%`,
              width: `${(32 / 500) * 100}%`,
              height: `${(32 / 300) * 100}%`,
              fontSize: `${Math.max(9, Math.round(11.5 * S))}px`
            }}
            className={`absolute rounded-full border font-black uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
              activeButtons[b.id]
                ? 'scale-92 bg-[#1c1f24] text-amber-300 border-black shadow-inner'
                : 'bg-gradient-to-b from-[#555b68] via-[#3c414b] to-[#252830] text-zinc-100 border-black shadow-[0_3px_5px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.28)]'
            }`}
            aria-label={`Button ${b.id.toUpperCase()}`}
          >
            {b.id.toUpperCase()}
          </button>
        ))}

        {/* Arched "LIGHT" Button on Silver Chin (enabled across ALL Pocket Pro models) */}
        <button
          type="button"
          onClick={toggleBacklight}
          style={{
            left: `${(202 / 500) * 100}%`,
            top: `${(260 / 300) * 100}%`,
            width: `${(96 / 500) * 100}%`,
            height: `${(16 / 300) * 100}%`,
            fontSize: `${Math.max(7, Math.round(8.5 * S))}px`,
            background: isBacklightActive
              ? 'linear-gradient(to bottom, #34d399, #059669)'
              : `linear-gradient(to bottom, ${p.btnTop}, ${p.btnBot})`,
            borderColor: isBacklightActive ? '#064e3b' : p.btnBorder
          }}
          className="absolute rounded-t-full rounded-b-sm border text-white font-black tracking-widest uppercase flex items-center justify-center shadow active:scale-95 cursor-pointer"
          title="Toggle Pocket Pro Backlight"
        >
          LIGHT
        </button>
      </div>
    </div>
  );
};

export const TouchView = GameComConsole;
