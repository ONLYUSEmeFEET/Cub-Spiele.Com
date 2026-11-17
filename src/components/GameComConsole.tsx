import React, { useEffect, useState, useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { GameComButtons, GameComConsoleModel } from '../emulator/types';
import { LCDScreen } from './LCDScreen';

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

  const availW = Math.max(260, viewport.w - 16);
  const availH = Math.max(220, viewport.h - 48);

  // RetroArch-style uniform scaling: the entire console (screen, bezel, buttons, D-Pad)
  // scales by a single uniform multiplier `S` so proportions ALWAYS match the 1x design.
  const fitScale = Math.max(0.55, Math.min(availW / baseW, availH / baseH));

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
          style={{ width: totalW, height: totalH }}
          className="relative shrink-0 select-none"
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

            {/* Top "game.com" Header */}
            <text
              x="160"
              y="34"
              textAnchor="middle"
              fill="#1e2229"
              fontFamily="monospace"
              fontWeight="900"
              fontSize="14"
              letterSpacing="-0.5"
            >
              game<tspan fill="#be123c">.</tspan>com
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

            {/* Bottom of Silver Shield: Speaker Dots + "TIGER" */}
            <text
              x="160"
              y="229"
              textAnchor="middle"
              fill="#2c313a"
              fontFamily="sans-serif"
              fontWeight="900"
              fontSize="9.5"
              letterSpacing="3"
            >
              TIGER
            </text>

            {/* Recessed Circular D-Pad Well (Left: cx=86, cy=338, r=54) */}
            <circle
              cx="86"
              cy="338"
              r="54"
              fill="url(#vp-well)"
              stroke="#333842"
              strokeWidth="1.5"
            />

            {/* Two Angled Pill Recesses for [A, B] & [C, D] (Right: matching 1997 Original style) */}
            <g transform="rotate(-15 232 314)">
              <rect
                x="182"
                y="290"
                width="100"
                height="48"
                rx="24"
                fill="url(#vp-well)"
                stroke="#333842"
                strokeWidth="1.5"
              />
            </g>
            <g transform="rotate(-15 240 368)">
              <rect
                x="190"
                y="344"
                width="100"
                height="48"
                rx="24"
                fill="url(#vp-well)"
                stroke="#333842"
                strokeWidth="1.5"
              />
            </g>

            {/* Center/Bottom System Pill Labels */}
            <text x="58" y="435" textAnchor="middle" fill="#9ca3af" fontSize="7.5" fontWeight="700" letterSpacing="1">
              ON/OFF
            </text>
            <text x="118" y="435" textAnchor="middle" fill="#9ca3af" fontSize="7.5" fontWeight="700" letterSpacing="1">
              MENU
            </text>
            <text x="168" y="435" textAnchor="middle" fill="#9ca3af" fontSize="7.5" fontWeight="700" letterSpacing="1">
              SOUND
            </text>
            <text x="218" y="435" textAnchor="middle" fill="#9ca3af" fontSize="7.5" fontWeight="700" letterSpacing="1">
              PAUSE
            </text>
            <text x="268" y="435" textAnchor="middle" fill="#9ca3af" fontSize="7.5" fontWeight="700" letterSpacing="1">
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
            <LCDScreen system={system} scale={S} onFpsUpdate={onFpsUpdate} />
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
              className={`absolute rounded-full border font-black uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
                activeButtons[b.id]
                  ? 'scale-92 bg-[#111317] text-amber-300 border-black shadow-inner'
                  : 'bg-gradient-to-b from-[#3b404a] via-[#252930] to-[#16181d] text-zinc-100 border-black shadow-[0_3px_6px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.25)]'
              }`}
              aria-label={`Button ${b.id.toUpperCase()}`}
            >
              {b.id.toUpperCase()}
            </button>
          ))}

          {/* Accessible Bottom System Pill Row: ON/OFF, MENU, SOUND, PAUSE, LIGHT */}
          <button
            type="button"
            onClick={() => {
              system.powerToggle();
              onStateChange?.();
            }}
            style={{
              left: `${(38 / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(40 / 320) * 100}%`,
              height: `${(16 / 510) * 100}%`
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
              left: `${(98 / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(40 / 320) * 100}%`,
              height: `${(16 / 510) * 100}%`
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] active:scale-95 cursor-pointer touch-none"
            title="MENU"
            aria-label="MENU"
          />

          <button
            type="button"
            onClick={() => {
              system.soundToggle();
              onStateChange?.();
            }}
            style={{
              left: `${(148 / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(40 / 320) * 100}%`,
              height: `${(16 / 510) * 100}%`
            }}
            className={`absolute rounded-full border active:scale-95 cursor-pointer ${
              system.settings.muted
                ? 'bg-[#be123c] border-[#881337]'
                : 'bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border-[#172554]'
            }`}
            title="SOUND"
            aria-label="SOUND"
          />

          <button
            type="button"
            onClick={() => {
              system.pauseToggle();
              onStateChange?.();
            }}
            style={{
              left: `${(198 / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(40 / 320) * 100}%`,
              height: `${(16 / 510) * 100}%`
            }}
            className="absolute rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] active:scale-95 cursor-pointer"
            title="PAUSE"
            aria-label="PAUSE"
          />

          <button
            type="button"
            onClick={toggleBacklight}
            style={{
              left: `${(248 / 320) * 100}%`,
              top: `${(442 / 510) * 100}%`,
              width: `${(40 / 320) * 100}%`,
              height: `${(16 / 510) * 100}%`
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
          style={{ width: totalW, height: totalH }}
          className="relative shrink-0 select-none"
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

            {/* Outer Wide Charcoal Handheld Body */}
            <path
              d="M 42 8 Q 280 0 518 8 A 34 34 0 0 1 552 42 V 278 A 34 34 0 0 1 518 312 H 42 A 34 34 0 0 1 8 278 V 42 A 34 34 0 0 1 42 8 Z"
              fill="url(#orig-body)"
              stroke="#454a54"
              strokeWidth="2.5"
            />

            {/* Single Wide Brushed Silver Metallic Upper Faceplate with Curved Bottom Seam */}
            <path
              d="M 46 14 Q 280 7 514 14 A 24 24 0 0 1 536 38 V 214 Q 536 232 512 235 L 395 242 H 165 L 48 235 Q 24 232 24 214 V 38 A 24 24 0 0 1 46 14 Z"
              fill="url(#orig-silver)"
              stroke="#7a8088"
              strokeWidth="2"
            />

            {/* Top "game.com" Stencil Wordmark */}
            <text
              x="280"
              y="29"
              textAnchor="middle"
              fill="#1d2128"
              fontFamily="monospace"
              fontWeight="900"
              fontSize="16"
              letterSpacing="-0.5"
            >
              game<tspan fill="#be123c">.</tspan>com
            </text>

            {/* Deep 4-Polygon Trapezoidal Chamfered Screen Inset (outer 154..406, 34..222 -> inner 180..380, 48..208) */}
            <polygon points="154,34 406,34 380,48 180,48" fill="#8d939c" />
            <polygon points="154,34 180,48 180,208 154,222" fill="#a2a8b0" />
            <polygon points="406,34 406,222 380,208 380,48" fill="#eaedf0" />
            <polygon points="180,208 380,208 406,222 154,222" fill="#b4bac2" />
            <rect
              x="178"
              y="46"
              width="204"
              height="164"
              rx="2"
              fill="#181b20"
              stroke="#333840"
              strokeWidth="1.5"
            />

            {/* Bottom "TIGER" Wordmark below screen bevel */}
            <text
              x="280"
              y="235"
              textAnchor="middle"
              fill="#262a32"
              fontFamily="sans-serif"
              fontWeight="900"
              fontSize="9"
              letterSpacing="2.5"
            >
              TIGER
            </text>

            {/* Top-Left Parallelogram 5x8 Speaker Dot Matrix */}
            {Array.from({ length: 5 }).map((_, row) =>
              Array.from({ length: 8 }).map((__, col) => (
                <circle
                  key={`${row}-${col}`}
                  cx={52 + col * 10.5}
                  cy={38 + row * 7.5 + col * 1.4}
                  r="2.1"
                  fill="#23272f"
                />
              ))
            )}

            {/* Bottom-Left Circular Recessed D-Pad Bezel Well (cx=94, cy=154, r=50) */}
            <circle
              cx="94"
              cy="154"
              r="50"
              fill="url(#orig-well)"
              stroke="#686e77"
              strokeWidth="1.5"
            />

            {/* Top-Right Round ON/OFF Bezel Ring + Label */}
            <circle
              cx="438"
              cy="52"
              r="13"
              fill="#1f242d"
              stroke="#686e77"
              strokeWidth="1.5"
            />
            <text
              x="457"
              y="55"
              fill="#2c313a"
              fontFamily="sans-serif"
              fontWeight="800"
              fontSize="7.5"
              letterSpacing="0.8"
            >
              ON/OFF
            </text>

            {/* Middle-Right Two Angled (-16deg) Stadium Wells for [A, B] and [C, D] */}
            <g transform="rotate(-16 462 114)">
              <rect
                x="412"
                y="91"
                width="100"
                height="46"
                rx="23"
                fill="#afb5bd"
                stroke="#6e747d"
                strokeWidth="1.8"
              />
            </g>
            <g transform="rotate(-16 470 166)">
              <rect
                x="420"
                y="143"
                width="100"
                height="46"
                rx="23"
                fill="#afb5bd"
                stroke="#6e747d"
                strokeWidth="1.8"
              />
            </g>

            {/* Bottom-Right Labels for [MENU] [SOUND] [PAUSE] along the silver seam */}
            <g transform="rotate(-4 472 222)">
              <text x="431" y="216" textAnchor="middle" fill="#2c313a" fontSize="6.5" fontWeight="800" letterSpacing="0.6">
                MENU
              </text>
              <text x="470" y="216" textAnchor="middle" fill="#2c313a" fontSize="6.5" fontWeight="800" letterSpacing="0.6">
                SOUND
              </text>
              <text x="509" y="216" textAnchor="middle" fill="#2c313a" fontSize="6.5" fontWeight="800" letterSpacing="0.6">
                PAUSE
              </text>
            </g>

            {/* Lower Charcoal Grip Dock & Horizontal Recessed Tiger Stylus */}
            <rect
              x="112"
              y="262"
              width="336"
              height="26"
              rx="13"
              fill="#111317"
              stroke="#2d323b"
              strokeWidth="1.5"
            />
            {/* Stylus Pen Body */}
            <path
              d="M 122 275 L 154 267 H 418 A 6 6 0 0 1 424 273 V 277 A 6 6 0 0 1 418 283 H 154 Z"
              fill="#252930"
              stroke="#0c0e11"
              strokeWidth="1.2"
            />
            <rect x="228" y="268" width="42" height="14" rx="2" fill="#323741" />
            <text
              x="312"
              y="278"
              fill="#d4d8de"
              fontFamily="sans-serif"
              fontWeight="900"
              fontSize="7.5"
              letterSpacing="2"
            >
              TIGER
            </text>
          </svg>

          {/* LCD Screen at exact (180, 48) -> (200x160) in 560x320 space */}
          <div
            style={{
              left: `${(180 / 560) * 100}%`,
              top: `${(48 / 320) * 100}%`,
              width: `${(200 / 560) * 100}%`,
              height: `${(160 / 320) * 100}%`
            }}
            className="absolute overflow-hidden flex items-center justify-center"
          >
            <LCDScreen system={system} scale={S} onFpsUpdate={onFpsUpdate} />
          </div>

          {/* Interactive 8-Way D-Pad Disc at (cx=94, cy=154, r=44) */}
          <div
            ref={dpadRef}
            onPointerDown={handleDpadPointerDown}
            onPointerMove={handleDpadPointerMove}
            onPointerUp={handleDpadPointerUp}
            onPointerCancel={handleDpadPointerUp}
            onLostPointerCapture={handleDpadPointerUp}
            style={{
              left: `${((94 - 44) / 560) * 100}%`,
              top: `${((154 - 44) / 320) * 100}%`,
              width: `${(88 / 560) * 100}%`,
              height: `${(88 / 320) * 100}%`
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

          {/* Interactive Round Blue ON/OFF Button at (cx=438, cy=52, r=9.5) */}
          <button
            type="button"
            onClick={() => {
              system.powerToggle();
              onStateChange?.();
            }}
            style={{
              left: `${((438 - 9.5) / 560) * 100}%`,
              top: `${((52 - 9.5) / 320) * 100}%`,
              width: `${(19 / 560) * 100}%`,
              height: `${(19 / 320) * 100}%`
            }}
            className={`absolute rounded-full border transition-transform active:scale-90 cursor-pointer ${
              system.isPoweredOn
                ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] border-[#1e3a8a]'
                : 'bg-gradient-to-b from-[#1e40af] to-[#172554] border-black'
            }`}
            title={system.isPoweredOn ? 'ON/OFF (Power Off)' : 'ON/OFF (Power On)'}
            aria-label="ON/OFF Power Button"
          />

          {/* Interactive Angled A, B, C, D Action Buttons */}
          {(
            [
              { id: 'a', cx: 439, cy: 121 },
              { id: 'b', cx: 485, cy: 107 },
              { id: 'c', cx: 447, cy: 173 },
              { id: 'd', cx: 493, cy: 159 }
            ] as const
          ).map((b) => (
            <button
              key={b.id}
              type="button"
              {...bindButtonPointer(b.id)}
              style={{
                left: `${((b.cx - 18) / 560) * 100}%`,
                top: `${((b.cy - 18) / 320) * 100}%`,
                width: `${(36 / 560) * 100}%`,
                height: `${(36 / 320) * 100}%`,
                fontSize: `${Math.max(9, Math.round(12 * S))}px`
              }}
              className={`absolute rounded-full border font-black uppercase flex items-center justify-center transition-transform select-none touch-none cursor-pointer ${
                activeButtons[b.id]
                  ? 'scale-92 bg-[#111317] text-amber-300 border-black shadow-inner'
                  : 'bg-gradient-to-b from-[#363b44] via-[#22252b] to-[#121418] text-zinc-100 border-black shadow-[0_3px_5px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.28)]'
              }`}
              aria-label={`Button ${b.id.toUpperCase()}`}
            >
              {b.id.toUpperCase()}
            </button>
          ))}

          {/* Interactive Bottom-Right Blue Pill Buttons: [MENU] [SOUND] [PAUSE] */}
          <button
            type="button"
            {...bindButtonPointer('menu')}
            style={{
              left: `${(414 / 560) * 100}%`,
              top: `${(221 / 320) * 100}%`,
              width: `${(34 / 560) * 100}%`,
              height: `${(11 / 320) * 100}%`
            }}
            className="absolute -rotate-4 rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] shadow active:scale-95 cursor-pointer touch-none"
            title="MENU (Enter)"
            aria-label="MENU Button"
          />

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
            style={{
              left: `${(453 / 560) * 100}%`,
              top: `${(219 / 320) * 100}%`,
              width: `${(34 / 560) * 100}%`,
              height: `${(11 / 320) * 100}%`
            }}
            className="absolute -rotate-4 rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] shadow active:scale-95 cursor-pointer touch-none"
            title="SOUND (Mute / Unmute)"
            aria-label="SOUND Button"
          />

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
            style={{
              left: `${(492 / 560) * 100}%`,
              top: `${(217 / 320) * 100}%`,
              width: `${(34 / 560) * 100}%`,
              height: `${(11 / 320) * 100}%`
            }}
            className="absolute -rotate-4 rounded-full bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] border border-[#172554] shadow active:scale-95 cursor-pointer touch-none"
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
  const isBacklitModel = model === 'pocketpro_backlit';

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
        style={{ width: totalW, height: totalH }}
        className="relative shrink-0 select-none"
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

          {/* ONE-PIECE Continuous T-Shaped Winged Silver Metallic Shield (Exact match to pocketpro.gif) */}
          <path
            d="M 56 18 Q 250 8 444 18 A 22 22 0 0 1 466 38 L 470 112 A 14 14 0 0 1 456 126 H 398 A 22 22 0 0 0 376 148 V 248 A 28 28 0 0 1 348 276 H 152 A 28 28 0 0 1 124 248 V 148 A 22 22 0 0 0 102 126 H 44 A 14 14 0 0 1 30 112 L 34 38 A 22 22 0 0 1 56 18 Z"
            fill="url(#pp-silver)"
            stroke="#7d838b"
            strokeWidth="2"
          />

          {/* 4 Recessed Metallic Screw Bosses on the Silver Shield */}
          {[
            [52, 34],
            [448, 34],
            [148, 252],
            [352, 252]
          ].map(([cx, cy], idx) => (
            <g key={idx}>
              <circle cx={cx} cy={cy} r="5.5" fill="#9fa5ae" stroke="#6c727a" strokeWidth="1" />
              <circle cx={cx} cy={cy} r="3.2" fill="#cfd3d9" />
            </g>
          ))}

          {/* Top "TIGER" Logo on the Silver Shield Arch */}
          <text
            x="250"
            y="26"
            textAnchor="middle"
            fill="#1e2228"
            fontFamily="sans-serif"
            fontWeight="900"
            fontSize="9.5"
            letterSpacing="2.5"
          >
            TIGER
          </text>

          {/* Left Wing: 4 Angled Horizontal Speaker Slots */}
          <g transform="rotate(10 78 76)">
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x="54"
                y={54 + i * 11}
                width="46"
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
          <text
            x="250"
            y="244"
            textAnchor="middle"
            fill="#7a8089"
            fontFamily="monospace"
            fontWeight="900"
            fontSize="15"
            letterSpacing="-0.5"
          >
            game.com
          </text>
          <text
            x="250"
            y="256"
            textAnchor="middle"
            fill="#7a8089"
            fontFamily="sans-serif"
            fontWeight="800"
            fontSize="7.5"
            letterSpacing="2.5"
          >
            POCKET PRO
          </text>

          {/* Right Silver Wing Labels for ON/OFF, MENU, PAUSE (angled -14deg) */}
          <g transform="rotate(-14 422 50)">
            <text x="416" y="38" textAnchor="middle" fill="#2c313a" fontSize="6.5" fontWeight="800" letterSpacing="0.6">
              ON/OFF
            </text>
          </g>
          <g transform="rotate(-14 426 84)">
            <text x="426" y="75" textAnchor="middle" fill="#2c313a" fontSize="6.5" fontWeight="800" letterSpacing="0.6">
              MENU
            </text>
          </g>
          <g transform="rotate(-14 430 112)">
            <text x="430" y="103" textAnchor="middle" fill="#2c313a" fontSize="6.5" fontWeight="800" letterSpacing="0.6">
              PAUSE
            </text>
          </g>

          {/* Lower-Left Grip Circular D-Pad Well (cx=76, cy=196, r=52) */}
          <circle
            cx="76"
            cy="196"
            r="52"
            fill={p.wellFill}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1.5"
          />

          {/* Lower-Right Grip Circular 2x2 Action Button Well (cx=424, cy=196, r=52) */}
          <circle
            cx="424"
            cy="196"
            r="52"
            fill={p.wellFill}
            stroke="rgba(255,255,255,0.12)"
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
          <LCDScreen system={system} scale={S} onFpsUpdate={onFpsUpdate} />
        </div>

        {/* Interactive Cross D-Pad at (cx=76, cy=196, r=45) */}
        <div
          ref={dpadRef}
          onPointerDown={handleDpadPointerDown}
          onPointerMove={handleDpadPointerMove}
          onPointerUp={handleDpadPointerUp}
          onPointerCancel={handleDpadPointerUp}
          onLostPointerCapture={handleDpadPointerUp}
          style={{
            left: `${((76 - 45) / 500) * 100}%`,
            top: `${((196 - 45) / 300) * 100}%`,
            width: `${(90 / 500) * 100}%`,
            height: `${(90 / 300) * 100}%`
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

        {/* Right Wing Stacked Buttons: Round ON/OFF, Angled Oval MENU, Angled Oval PAUSE */}
        <button
          type="button"
          onClick={() => {
            system.powerToggle();
            onStateChange?.();
          }}
          style={{
            left: `${((418 - 10) / 500) * 100}%`,
            top: `${((52 - 10) / 300) * 100}%`,
            width: `${(20 / 500) * 100}%`,
            height: `${(20 / 300) * 100}%`,
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
            left: `${((426 - 19) / 500) * 100}%`,
            top: `${((84 - 6) / 300) * 100}%`,
            width: `${(38 / 500) * 100}%`,
            height: `${(12 / 300) * 100}%`,
            background: `linear-gradient(to bottom, ${p.btnTop}, ${p.btnBot})`,
            borderColor: p.btnBorder
          }}
          className="absolute -rotate-14 rounded-full border shadow active:scale-95 transition-transform cursor-pointer touch-none"
          title="MENU (Enter)"
          aria-label="MENU Button"
        />

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
          style={{
            left: `${((430 - 19) / 500) * 100}%`,
            top: `${((112 - 6) / 300) * 100}%`,
            width: `${(38 / 500) * 100}%`,
            height: `${(12 / 300) * 100}%`,
            background: `linear-gradient(to bottom, ${p.btnTop}, ${p.btnBot})`,
            borderColor: p.btnBorder
          }}
          className="absolute -rotate-14 rounded-full border shadow active:scale-95 transition-transform cursor-pointer touch-none"
          title="PAUSE (Space)"
          aria-label="PAUSE Button"
        />

        {/* Interactive 2x2 [A, B / C, D] Round Buttons inside Lower-Right Grip Well (cx=424, cy=196) */}
        {(
          [
            { id: 'a', cx: 403, cy: 175 },
            { id: 'b', cx: 445, cy: 175 },
            { id: 'c', cx: 403, cy: 217 },
            { id: 'd', cx: 445, cy: 217 }
          ] as const
        ).map((b) => (
          <button
            key={b.id}
            type="button"
            {...bindButtonPointer(b.id)}
            style={{
              left: `${((b.cx - 17) / 500) * 100}%`,
              top: `${((b.cy - 17) / 300) * 100}%`,
              width: `${(34 / 500) * 100}%`,
              height: `${(34 / 300) * 100}%`,
              fontSize: `${Math.max(9, Math.round(12 * S))}px`
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

        {/* #71-520 Backlit Model Signature Teal Arched "LIGHT" Button on Silver Chin */}
        {isBacklitModel && (
          <button
            type="button"
            onClick={toggleBacklight}
            style={{
              left: `${(202 / 500) * 100}%`,
              top: `${(260 / 300) * 100}%`,
              width: `${(96 / 500) * 100}%`,
              height: `${(16 / 300) * 100}%`,
              fontSize: `${Math.max(7, Math.round(8.5 * S))}px`,
              background: `linear-gradient(to bottom, ${p.btnTop}, ${p.btnBot})`,
              borderColor: p.btnBorder
            }}
            className="absolute rounded-t-full rounded-b-sm border text-white font-black tracking-widest uppercase flex items-center justify-center shadow active:scale-95 cursor-pointer"
            title="Toggle Pocket Pro Backlight (#71-520)"
          >
            LIGHT
          </button>
        )}
      </div>
    </div>
  );
};

export const TouchView = GameComConsole;
