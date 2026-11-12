import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../emulator/lcd';
import { PALETTES } from '../emulator/types';

interface LCDScreenProps {
  system: GameComSystem;
  onFileDrop: (file: File) => void;
  isStylusActive: boolean;
}

// Tiger Game.Com exact hardware vertical refresh rate: 59.732155 Hz (~16.7414 ms per frame)
const HARDWARE_FRAME_MS = 1000 / 59.732155;

export const LCDScreen: React.FC<LCDScreenProps> = ({
  system,
  onFileDrop,
  isStylusActive
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; normX: number; normY: number } | null>(null);

  // Main animation frame render loop locked to authentic 59.732155 Hz hardware timing
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let accumulator = 0;

    const renderLoop = (now: number) => {
      const delta = Math.min(100, now - lastTime);
      lastTime = now;
      accumulator += delta;

      let stepped = false;
      while (accumulator >= HARDWARE_FRAME_MS) {
        system.tick();
        accumulator -= HARDWARE_FRAME_MS;
        stepped = true;
        // Prevent spiral of death if tab was backgrounded
        if (accumulator > HARDWARE_FRAME_MS * 3) {
          accumulator = 0;
          break;
        }
      }

      if (stepped) {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d', { alpha: false });
          if (ctx) {
            system.renderToCanvas(canvas, ctx);
          }
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [system]);

  // Single discrete touch registration per mouse press ("compassive; the old style")
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const rect = canvas.getBoundingClientRect();
      const normX = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(0.999, (e.clientY - rect.top) / rect.height));

      system.handlePointerDown(normX, normY);
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, normX, normY });
    },
    [system]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const normX = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(0.999, (e.clientY - rect.top) / rect.height));
    // Only update visual stylus hover indicator — never trigger additional touch inputs on drag
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, normX, normY });
  }, []);

  const handlePointerUp = useCallback(() => {
    system.handlePointerUp();
  }, [system]);

  const handlePointerLeave = useCallback(() => {
    system.handlePointerUp();
    setCursorPos(null);
  }, [system]);

  // Drag & drop ROM files directly onto the Game.com screen
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileDrop(file);
    }
  };

  const palette = PALETTES[system.settings.palette] || PALETTES.original;
  const showTouchGrid = system.settings.showTouchGrid;

  // Compute hovered & pressed hardware touch matrix cell (13 columns x 10 rows, 16x16 native pixels each)
  const hoverCol = cursorPos ? Math.min(12, Math.max(0, Math.floor((cursorPos.normX * SCREEN_WIDTH) / 16))) : -1;
  const hoverRow = cursorPos ? Math.min(9, Math.max(0, Math.floor((cursorPos.normY * SCREEN_HEIGHT) / 16))) : -1;
  const activeCol = system.cpu.stylusPressed ? Math.min(12, Math.max(0, Math.floor(system.cpu.stylusX / 16))) : -1;
  const activeRow = system.cpu.stylusPressed ? Math.min(9, Math.max(0, Math.floor(system.cpu.stylusY / 16))) : -1;

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative select-none rounded-sm overflow-hidden transition-all duration-200 border-4 ${
        isDraggingOver
          ? 'border-purple-400 ring-4 ring-purple-400/40 shadow-lg shadow-purple-500/30'
          : 'border-[#3a3f33] shadow-inner'
      }`}
      style={{
        backgroundColor: palette.colors[0],
        cursor: isStylusActive ? 'none' : 'crosshair'
      }}
    >
      {/* 200x160 Native Pixel Canvas */}
      <canvas
        ref={canvasRef}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className="w-[280px] sm:w-[360px] md:w-[420px] aspect-[5/4] block [image-rendering:pixelated]"
      />

      {/* Hardware 13x10 Resistive Touch Matrix Overlay (16x16 pixel cells across 200x160 LCD) */}
      {showTouchGrid && (
        <div className="absolute inset-0 pointer-events-none">
          <svg
            viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}
            className="w-full h-full block"
            preserveAspectRatio="none"
          >
            {/* Grid cells (Cols 0..12, Rows 0..9; Col 12 is 8px wide at right edge 192..200) */}
            {Array.from({ length: 10 }).map((_, r) =>
              Array.from({ length: 13 }).map((__, c) => {
                const cellX = c * 16;
                const cellY = r * 16;
                const cellW = Math.min(16, SCREEN_WIDTH - cellX);
                const cellH = 16;
                const isPressed = activeCol === c && activeRow === r;
                const isHovered = hoverCol === c && hoverRow === r;

                return (
                  <g key={`${c}-${r}`}>
                    <rect
                      x={cellX}
                      y={cellY}
                      width={cellW}
                      height={cellH}
                      fill={
                        isPressed
                          ? 'rgba(168, 85, 247, 0.42)'
                          : isHovered
                          ? 'rgba(16, 185, 129, 0.22)'
                          : 'transparent'
                      }
                      stroke="rgba(17, 24, 39, 0.45)"
                      strokeWidth="0.45"
                      strokeDasharray="1.5,1"
                    />
                    {c < 12 && (
                      <text
                        x={cellX + 1.5}
                        y={cellY + 4.2}
                        fontSize="3.1"
                        fontFamily="monospace"
                        fill={isPressed ? '#ffffff' : 'rgba(17, 24, 39, 0.65)'}
                      >
                        {c},{r}
                      </text>
                    )}
                  </g>
                );
              })
            )}
          </svg>

          {/* Touch Matrix Status Telemetry Badge */}
          <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 bg-slate-950/85 border border-purple-500/50 rounded text-[10px] font-mono text-purple-200 shadow">
            {activeCol >= 0
              ? `PRESSED CELL [${activeCol}, ${activeRow}]`
              : hoverCol >= 0
              ? `CELL [${hoverCol}, ${hoverRow}] · (${Math.floor((cursorPos?.normX || 0) * SCREEN_WIDTH)}, ${Math.floor((cursorPos?.normY || 0) * SCREEN_HEIGHT)})`
              : '13×10 RESISTIVE MATRIX (16×16px)'}
          </div>
        </div>
      )}

      {/* Glass screen reflection highlight */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-white/10" />

      {/* Stylus Cursor indicator if unholstered */}
      {isStylusActive && cursorPos && (
        <div
          className="absolute pointer-events-none transition-transform -translate-x-1 -translate-y-8"
          style={{
            left: `${cursorPos.x}px`,
            top: `${cursorPos.y}px`
          }}
        >
          {/* Detailed Tiger Game.com Stylus Graphic */}
          <svg width="24" height="36" viewBox="0 0 24 36" fill="none">
            {/* Pen shaft */}
            <path
              d="M10 2L14 2L13 26L10 32L7 26L6 2Z"
              fill="#94a3b8"
              stroke="#1e293b"
              strokeWidth="1.5"
            />
            {/* Fine nib */}
            <path d="M10 32L10 35" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="35" r="1.5" fill="#ef4444" />
          </svg>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-purple-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4">
          <p className="text-sm font-bold text-white mb-1">Drop Game.com ROM Here</p>
          <p className="text-xs text-purple-200">Accepts .bin, .tgc, or .zip</p>
        </div>
      )}
    </div>
  );
};
