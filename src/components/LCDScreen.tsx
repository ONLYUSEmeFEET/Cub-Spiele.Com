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
  const [touchRipple, setTouchRipple] = useState<{ x: number; y: number; key: number } | null>(null);

  const canvasWidth = Math.round(SCREEN_WIDTH * scale);
  const canvasHeight = Math.round(SCREEN_HEIGHT * scale);

  useEffect(() => {
    let animationFrameId: number;
    let lastFpsReport = performance.now();

    const renderLoop = (now: number) => {
      system.tick();

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          system.lcd.renderToCanvas(canvas, ctx);
        }
      }

      if (now - lastFpsReport > 500) {
        onFpsUpdate?.(system.fps);
        lastFpsReport = now;
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
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
    system.setTouch(x, y, true);
    setCursorPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, visible: true, isDown: true });
    setTouchRipple({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, key: Date.now() });
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
  const inactiveGlassBg =
    !system.isPoweredOn
      ? '#4b5239'
      : system.settings.palette === 'original'
      ? '#adb87f'
      : activePalette.colors[0];

  return (
    <div
      className="relative select-none overflow-hidden rounded-[4px] p-[7px] transition-colors duration-200"
      style={{
        backgroundColor: inactiveGlassBg,
        boxShadow:
          'inset 0 5px 12px rgba(0, 0, 0, 0.65), inset 0 2px 4px rgba(0, 0, 0, 0.75), inset 2px 0 6px rgba(0, 0, 0, 0.45), 0 1px 0 rgba(255, 255, 255, 0.08)'
      }}
    >
      {/* Authentic 1997 STN LCD Inactive Glass Perimeter Frame & Corner Registration Marks */}
      <div
        className="relative rounded-[1px]"
        style={{
          border:
            system.settings.palette === 'original'
              ? '1.5px solid rgba(25, 35, 16, 0.48)'
              : '1.5px solid rgba(0, 0, 0, 0.35)',
          boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.12)'
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

        {/* Touch Screen Resistive/Capacitive 13x10 Matrix Overlay */}
        {system.settings.showTouchGrid && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-13 grid-rows-10">
            {Array.from({ length: 130 }).map((_, idx) => {
              const col = idx % 13;
              const row = Math.floor(idx / 13);
              return (
                <div
                  key={idx}
                  className="border-[0.5px] border-[#192310]/30 flex items-start justify-start p-[1px]"
                >
                  <span className="text-[6px] font-mono leading-none text-[#192310]/65 font-bold select-none">
                    {col.toString(16).toUpperCase()}
                    {row.toString(16).toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subtle resistive touchscreen membrane & glass glare overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.03) 34%, rgba(0,0,0,0.02) 65%, rgba(0,0,0,0.14) 100%)'
        }}
      />

      {/* Touch ripple feedback */}
      {touchRipple && (
        <span
          key={touchRipple.key}
          className="pointer-events-none absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border border-[#192310]/50 animate-ping"
          style={{ left: touchRipple.x + 7, top: touchRipple.y + 7, animationDuration: '350ms' }}
        />
      )}

      {/* Custom Tiger Game.Com Stylus Cursor */}
      {system.settings.stylusCursor && cursorPos.visible && (
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
