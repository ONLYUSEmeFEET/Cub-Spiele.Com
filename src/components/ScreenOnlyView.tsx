import React, { useState, useEffect } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../emulator/lcd';
import { LCDScreen } from './LCDScreen';

interface ScreenOnlyViewProps {
  system: GameComSystem;
}

export const ScreenOnlyView: React.FC<ScreenOnlyViewProps> = ({ system }) => {
  const requestedScale = system.settings.screenScale || 3;
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxScaleByWidth = Math.max(1.2, (viewport.w - 40) / SCREEN_WIDTH);
  const maxScaleByHeight = Math.max(1.2, (viewport.h - 110) / SCREEN_HEIGHT);
  const effectiveScale = Math.min(requestedScale, maxScaleByWidth, maxScaleByHeight);

  return (
    <div className="flex items-center justify-center select-none">
      <div className="bg-[#e4e6dd] dark:bg-[#0d0f13] p-1.5 sm:p-2 rounded-xl border border-zinc-300 dark:border-zinc-800 shadow-lg dark:shadow-2xl transition-colors">
        <LCDScreen system={system} scale={effectiveScale} />
      </div>
    </div>
  );
};
