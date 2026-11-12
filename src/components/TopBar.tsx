import React, { useRef } from 'react';
import { Upload, HardDrive, Cpu, Gamepad2, Wrench, Trophy, ShieldCheck } from 'lucide-react';
import { CartridgeInfo } from '../emulator/types';

interface TopBarProps {
  onLoadRomFile: (file: File) => void;
  onOpenLibrary: () => void;
  onOpenAccuracy: () => void;
  onOpenBios: () => void;
  onOpenControls: () => void;
  onOpenDebugger: () => void;
  onOpenHighScores: () => void;
  slot1Cart: CartridgeInfo | null;
  slot2Cart: CartridgeInfo | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  onLoadRomFile,
  onOpenLibrary,
  onOpenAccuracy,
  onOpenBios,
  onOpenControls,
  onOpenDebugger,
  onOpenHighScores,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadRomFile(file);
      // Reset input value so the same file can be reloaded if desired
      e.target.value = '';
    }
  };

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 shadow-sm shadow-purple-500/50" />
          Tiger Game.Com
        </span>
        <span className="text-xs font-mono text-slate-400 border border-slate-700/80 px-2 py-0.5 rounded">
          SM8521 · 4.9152 MHz
        </span>
      </div>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
        <button
          onClick={onOpenLibrary}
          className="hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <HardDrive className="w-4 h-4 text-slate-400" />
          Cartridge Bays
        </button>
        <button
          onClick={onOpenHighScores}
          className="hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer text-amber-300 hover:text-amber-200 font-semibold"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          High Score Vault (&gt;10)
        </button>
        <button
          onClick={onOpenAccuracy}
          className="hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Wrench className="w-4 h-4 text-emerald-400" />
          Emulation Fixes
        </button>
        <button
          onClick={onOpenBios}
          className="hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer text-purple-300 hover:text-purple-200"
        >
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          Official BIOS
        </button>
        <button
          onClick={onOpenControls}
          className="hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Gamepad2 className="w-4 h-4 text-slate-400" />
          Keybinds
        </button>
        <button
          onClick={onOpenDebugger}
          className="hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Cpu className="w-4 h-4 text-slate-400" />
          CPU Debugger
        </button>
      </nav>

      {/* Zone 3: 1 primary action button: File Dialog Trigger */}
      <div className="flex items-center gap-3 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".bin,.zip,.tgc,.rom"
          onChange={handleFileChange}
          className="hidden"
          id="rom-file-input"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 active:scale-98 rounded-lg shadow-sm shadow-purple-900/40 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          Load ROM (.bin / .zip)
        </button>
      </div>
    </header>
  );
};
