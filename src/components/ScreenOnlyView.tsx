import React, { useState, useEffect, useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../emulator/lcd';
import { LCDScreen } from './LCDScreen';

interface ScreenOnlyViewProps {
  system: GameComSystem;
}

export const ScreenOnlyView: React.FC<ScreenOnlyViewProps> = ({ system }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth - 16 : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight - 72 : 720
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ w: rect.width, h: rect.height });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Reserve ~24px for the minimal outer frame + 7px LCD glass perimeter
  const availW = Math.max(SCREEN_WIDTH, containerSize.w - 24);
  const availH = Math.max(SCREEN_HEIGHT, containerSize.h - 24);
  const maxFitScale = Math.min(availW / SCREEN_WIDTH, availH / SCREEN_HEIGHT);

  const requestedScale =
    system.settings.screenFitMode === 'full'
      ? maxFitScale
      : Math.max(1, Math.min(8, system.settings.screenScale || 3));

  const clampedScale = Math.min(requestedScale, maxFitScale);
  const effectiveScale = system.settings.integerScaling
    ? Math.max(1, Math.floor(clampedScale))
    : Math.max(0.5, clampedScale);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden select-none"
    >
      <div className="bg-[#e4e6dd] dark:bg-black p-1.5 sm:p-2 rounded-xl border border-zinc-300 dark:border-zinc-900 shadow-lg dark:shadow-none transition-colors">
        <LCDScreen system={system} scale={effectiveScale} />
      </div>
    </div>
  );
};
