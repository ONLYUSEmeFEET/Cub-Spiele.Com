import React, { useEffect, useRef, useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../emulator/lcd';
import { PALETTES } from '../emulator/types';

interface LCDScreenProps {
  system: GameComSystem;
  scale?: number;
  onFpsUpdate?: (fps: number) => void;
}

export const LCDScreen: React.FC<LCDScreenProps> = ({ system, scale = 2.4, onFpsUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean; isDown: boolean }>({
    x: 0,
    y: 0,
    visible: false,
    isDown: false
  });
  const [vStylusPos, setVStylusPos] = useState<{
    x: number;
    y: number;
    visible: boolean;
    isDown: boolean;
    dpadStylusMode: boolean;
  }>({
    x: system.virtualStylus.x,
    y: system.virtualStylus.y,
    visible: system.virtualStylus.visible,
    isDown: system.virtualStylus.isDown,
    dpadStylusMode: system.virtualStylus.dpadStylusMode
  });

  const canvasWidth = Math.round(SCREEN_WIDTH * scale);
  const canvasHeight = Math.round(SCREEN_HEIGHT * scale);

  useEffect(() => {
    let animationFrameId: number;
    let lastFpsReport = performance.now();
    let lastTickTime = performance.now();
    let prevVx = system.virtualStylus.x;
    let prevVy = system.virtualStylus.y;
    let prevVVis = system.virtualStylus.visible;
    let prevVDown = system.virtualStylus.isDown;
    let prevVMode = system.virtualStylus.dpadStylusMode;

    const executeFrameStep = (now: number) => {
      lastTickTime = now;
      system.tick();

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          system.lcd.renderToCanvas(canvas, ctx);
        }
      }

      const vs = system.virtualStylus;
      if (
        vs.x !== prevVx ||
        vs.y !== prevVy ||
        vs.visible !== prevVVis ||
        vs.isDown !== prevVDown ||
        vs.dpadStylusMode !== prevVMode
      ) {
        prevVx = vs.x;
        prevVy = vs.y;
        prevVVis = vs.visible;
        prevVDown = vs.isDown;
        prevVMode = vs.dpadStylusMode;
        setVStylusPos({
          x: vs.x,
          y: vs.y,
          visible: vs.visible,
          isDown: vs.isDown,
          dpadStylusMode: vs.dpadStylusMode
        });
      }

      if (now - lastFpsReport > 500) {
        onFpsUpdate?.(system.fps);
        lastFpsReport = now;
      }
    };

    const renderLoop = (now: number) => {
      executeFrameStep(now);
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    // Unfocused / Background 60Hz fallback timer so dual-instance Compete.Com multiplayer
    // and background controller play continue running when the window is unfocused
    const bgIntervalId = window.setInterval(() => {
      const now = performance.now();
      const shouldRunInBackground =
        system.settings.backgroundInput || system.linkCable.mode !== 'off';
      if (shouldRunInBackground && now - lastTickTime >= 24) {
        executeFrameStep(now);
      }
    }, 16);

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(bgIntervalId);
    };
  }, [system, onFpsUpdate]);

  const getLogicalCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    const x = Math.max(0, Math.min(SCREEN_WIDTH - 1, Math.floor((relX / rect.width) * SCREEN_WIDTH)));
    const y = Math.max(0, Math.min(SCREEN_HEIGHT - 1, Math.floor((relY / rect.height) * SCREEN_HEIGHT)));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getLogicalCoords(e.clientX, e.clientY);
    system.virtualStylus.visible = false;
    system.setTouch(x, y, true);
    setCursorPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, visible: true, isDown: true });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getLogicalCoords(e.clientX, e.clientY);
    setCursorPos((prev) => ({
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
      visible: true,
      isDown: prev.isDown
    }));
    if (cursorPos.isDown) {
      system.setTouch(x, y, true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getLogicalCoords(e.clientX, e.clientY);
    system.setTouch(x, y, false);
    setCursorPos((prev) => ({ ...prev, isDown: false }));
  };

  const handlePointerLeave = () => {
    if (cursorPos.isDown) {
      system.setTouch(0, 0, false);
    }
    setCursorPos((prev) => ({ ...prev, visible: false, isDown: false }));
  };

  const activePalette = PALETTES[system.settings.palette] || PALETTES.original;
  const isBacklitModel = Boolean(activePalette.isBacklit && system.isPoweredOn);
  const inactiveGlassBg =
    !system.isPoweredOn
      ? '#4b5239'
      : system.settings.palette === 'custom'
      ? system.settings.customPaletteColors[0]
      : activePalette.bezelTint || activePalette.colors[0];

  const effectiveGridOpacity = system.settings.showTouchGrid
    ? Math.max(0.05, system.settings.touchGridOpacity || 0.45)
    : system.settings.touchGridOpacity;

  return (
    <div
      className="relative select-none overflow-hidden rounded-[4px] p-[7px] transition-colors duration-200"
      style={{
        backgroundColor: inactiveGlassBg,
        boxShadow: isBacklitModel
          ? 'inset 0 4px 10px rgba(0, 0, 0, 0.62), inset 0 0 18px rgba(80, 255, 195, 0.25), 0 0 14px rgba(78, 196, 155, 0.18), 0 1px 0 rgba(255, 255, 255, 0.12)'
          : 'inset 0 5px 12px rgba(0, 0, 0, 0.65), inset 0 2px 4px rgba(0, 0, 0, 0.75), inset 2px 0 6px rgba(0, 0, 0, 0.45), 0 1px 0 rgba(255, 255, 255, 0.08)'
      }}
    >
      {/* Authentic STN / FSTN / EL-Backlit LCD Inactive Glass Perimeter Frame & Registration Border */}
      <div
        className="relative rounded-[1px]"
        style={{
          border:
            system.settings.palette === 'custom'
              ? `1.5px solid ${system.settings.customPaletteColors[2]}88`
              : `1.5px solid ${activePalette.glassBorderColor}`,
          boxShadow: isBacklitModel
            ? '0 0 8px rgba(166, 242, 212, 0.22)'
            : '0 0 0 1px rgba(255, 255, 255, 0.12)'
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className={`block touch-none ${
            system.settings.stylusCursor ? 'cursor-none' : 'cursor-crosshair'
          }`}
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            imageRendering: 'pixelated'
          }}
        />

        {/* Touch Screen Resistive/Capacitive 13x10 Matrix Overlay with Visibility Slider */}
        {effectiveGridOpacity > 0 && (
          <div
            className="pointer-events-none absolute inset-0 grid grid-cols-13 grid-rows-10"
            style={{ opacity: effectiveGridOpacity }}
          >
            {Array.from({ length: 130 }).map((_, idx) => {
              const col = idx % 13;
              const row = Math.floor(idx / 13);
              return (
                <div
                  key={idx}
                  className="border-[0.5px] border-[#192310]/65 flex items-start justify-start p-[1px]"
                >
                  <span className="text-[6px] font-mono leading-none text-[#192310] font-bold select-none">
                    {col.toString(16).toUpperCase()}
                    {row.toString(16).toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subtle resistive touchscreen membrane & polarizer glare overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isBacklitModel
            ? 'radial-gradient(circle at 50% 50%, rgba(166,242,212,0.10) 0%, rgba(6,44,32,0.15) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.03) 34%, rgba(0,0,0,0.02) 65%, rgba(0,0,0,0.14) 100%)'
        }}
      />

      {/* Custom Stylus Cursor (Mouse hover) */}
      {system.settings.stylusCursor && cursorPos.visible && !vStylusPos.visible && (
        <div
          className="pointer-events-none absolute z-30 transition-transform duration-75"
          style={{
            left: cursorPos.x + 7,
            top: cursorPos.y + 7,
            transform: `translate(-2px, -2px) ${cursorPos.isDown ? 'scale(0.92) translate(1px, 2px)' : 'scale(1)'}`
          }}
        >
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none" className="drop-shadow-[2px_4px_4px_rgba(0,0,0,0.65)]">
            {/* Stylus tip contact point */}
            <circle
              cx="3"
              cy="3"
              r={cursorPos.isDown ? '3.2' : '2'}
              fill={cursorPos.isDown ? '#e11d48' : '#18181b'}
            />
            {/* Original Tiger crimson/charcoal stylus body */}
            <path d="M2.5 5.5L8.5 3.5L32 27L27 32L2.5 5.5Z" fill="#27272a" stroke="#52525b" strokeWidth="1" />
            <path d="M5.5 4.5L8.5 3.5L32 27L29.5 29.5L5.5 4.5Z" fill="#9f1239" />
            <path d="M2.5 5.5L5.5 2.5L8.5 5.5L5.5 8.5L2.5 5.5Z" fill="#d4d4d8" />
          </svg>
        </div>
      )}

      {/* DS-Style Virtual Stylus Reticle & Tip (Keyboard / Controller Stylus) */}
      {system.isPoweredOn && vStylusPos.visible && (
        <div
          className="pointer-events-none absolute z-30"
          style={{
            left: Math.round((vStylusPos.x / SCREEN_WIDTH) * canvasWidth) + 7,
            top: Math.round((vStylusPos.y / SCREEN_HEIGHT) * canvasHeight) + 7
          }}
        >
          {/* DS-style precision target reticle centered on (0,0) */}
          <svg
            width="28"
            height="28"
            viewBox="-14 -14 28 28"
            fill="none"
            className="absolute -left-[14px] -top-[14px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
          >
            {/* Outer corner brackets */}
            <path
              d="M-9 -5 V-9 H-5 M5 -9 H9 V-5 M9 5 V9 H5 M-5 9 H-9 V5"
              stroke={vStylusPos.isDown ? '#f43f5e' : '#111827'}
              strokeWidth="1.6"
            />
            <path
              d="M-8 -4 V-8 H-4 M4 -8 H8 V-4 M8 4 V8 H4 M-4 8 H-8 V4"
              stroke={vStylusPos.isDown ? '#fda4af' : '#f8fafc'}
              strokeWidth="1"
            />
            {/* Crosshair ticks */}
            <line x1="-12" y1="0" x2="-4" y2="0" stroke={vStylusPos.isDown ? '#f43f5e' : '#0f172a'} strokeWidth="1.5" />
            <line x1="4" y1="0" x2="12" y2="0" stroke={vStylusPos.isDown ? '#f43f5e' : '#0f172a'} strokeWidth="1.5" />
            <line x1="0" y1="-12" x2="0" y2="-4" stroke={vStylusPos.isDown ? '#f43f5e' : '#0f172a'} strokeWidth="1.5" />
            <line x1="0" y1="4" x2="0" y2="12" stroke={vStylusPos.isDown ? '#f43f5e' : '#0f172a'} strokeWidth="1.5" />
            {/* Center contact dot */}
            <circle
              cx="0"
              cy="0"
              r={vStylusPos.isDown ? '3' : '1.8'}
              fill={vStylusPos.isDown ? '#e11d48' : '#fef08a'}
              stroke="#09090b"
              strokeWidth="1"
            />
          </svg>

          {/* Angled Stylus Pen Tip */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 36 36"
            fill="none"
            className="absolute left-0 top-0 drop-shadow-[2px_3px_3px_rgba(0,0,0,0.65)]"
            style={{
              transform: vStylusPos.isDown ? 'translate(0px, 1px) scale(0.93)' : 'translate(2px, 2px)'
            }}
          >
            <path d="M2.5 5.5L8.5 3.5L32 27L27 32L2.5 5.5Z" fill="#27272a" stroke="#e4e4e7" strokeWidth="1" />
            <path d="M5.5 4.5L8.5 3.5L32 27L29.5 29.5L5.5 4.5Z" fill={vStylusPos.isDown ? '#e11d48' : '#be123c'} />
            <path d="M2.5 5.5L5.5 2.5L8.5 5.5L5.5 8.5L2.5 5.5Z" fill="#f4f4f5" />
          </svg>

          {/* Compact Grid Cell / Mode Indicator */}
          {vStylusPos.dpadStylusMode && (
            <div className="absolute left-3 -top-5 px-1 py-0.5 rounded bg-zinc-950/90 border border-rose-500/60 text-[8px] font-mono text-rose-300 whitespace-nowrap shadow">
              STYLUS {Math.min(12, Math.floor((vStylusPos.x / SCREEN_WIDTH) * 13)).toString(16).toUpperCase()}
              {Math.min(9, Math.floor((vStylusPos.y / SCREEN_HEIGHT) * 10)).toString(16).toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Powered Off STN Reflective State */}
      {!system.isPoweredOn && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-[#51593e]/90">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#1e2612]/60 font-bold">
            SYSTEM POWER OFF
          </div>
          <div className="text-[9px] font-mono text-[#1e2612]/45 mt-1">
            PRESS RED ON/OFF KEY TO BOOT
          </div>
        </div>
      )}
    </div>
  );
};
