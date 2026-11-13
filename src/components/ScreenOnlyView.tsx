import React from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { LCDScreen } from './LCDScreen';

interface ScreenOnlyViewProps {
  system: GameComSystem;
}

export const ScreenOnlyView: React.FC<ScreenOnlyViewProps> = ({ system }) => {
  const scale = system.settings.screenScale || 3;

  return (
    <div className="flex items-center justify-center select-none">
      <div className="bg-[#0e1014] p-2 rounded-lg border border-zinc-800 shadow-2xl">
        <LCDScreen system={system} scale={scale} />
      </div>
    </div>
  );
};
