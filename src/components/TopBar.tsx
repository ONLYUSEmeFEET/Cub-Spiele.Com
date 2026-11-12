import React, { useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { Disc, Trophy, Wrench, Bug, Play, Upload, Cpu, Keyboard } from 'lucide-react';

interface TopBarProps {
  system: GameComSystem;
  onLoadRomFile?: (file: File) => void;
  onOpenLibrary: () => void;
  onOpenHighScores: () => void;
  onOpenAccuracy: () => void;
  onOpenBios?: () => void;
  onOpenControls?: () => void;
  onOpenDebugger: () => void;
  onUpdate: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  system,
  onLoadRomFile,
  onOpenLibrary,
  onOpenHighScores,
  onOpenAccuracy,
  onOpenBios,
  onOpenControls,
  onOpenDebugger,
  onUpdate
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="w-full bg-[#14161c]/95 border-b border-[#2b2f3a] backdrop-blur-md z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Zone 1 (Left): Original 1997 Tiger Game.Com Brand Identity */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-2.5 py-1 rounded-lg bg-[#1d2028] border border-[#343946] flex items-baseline gap-0.5 shadow-inner">
            <span className="text-sm font-black italic tracking-tight text-[#f1f5f9]">
              game
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#e11d48] mx-0.5 translate-y-[-1px]" />
            <span className="text-sm font-black italic tracking-tight text-[#cbd5e1]">
              com
            </span>
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-bold text-[#e2e8f0] tracking-wide">
              TIGER ELECTRONICS • SM8521 HARDWARE EMULATOR
            </div>
            <div className="text-[10px] font-mono text-[#a3ae76]">
              Dual-Slot Architecture • Slot 2 Recompiled Frogger ROM
            </div>
          </div>
        </div>

        {/* Zone 2 (Center): Quick Dual Cartridge Bay Launcher (Slot 1 & Recompiled Slot 2) */}
        <div className="hidden md:flex items-center gap-2 bg-[#0e1015] px-2.5 py-1.5 rounded-xl border border-[#282c37]">
          <button
            onClick={() => {
              system.launchCartridge(1);
              onUpdate();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
              system.activeSlot === 1 && system.activeApp === 'CARTRIDGE'
                ? 'bg-[#a3ae76]/25 text-[#d9e3b1] border border-[#a3ae76]/50 font-bold'
                : 'text-[#94a3b8] hover:text-white hover:bg-[#1c1f28]'
            }`}
            title="Boot Cartridge Slot 1 (Lights Out)"
          >
            <Play className="w-3 h-3 fill-current text-[#a3ae76]" />
            <span>SLOT 1: {system.slot1 ? system.slot1.title.split(' (')[0] : 'Empty'}</span>
          </button>

          <div className="w-[1px] h-4 bg-[#282c37]" />

          <button
            onClick={() => {
              system.launchCartridge(2);
              onUpdate();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
              system.activeSlot === 2 && system.activeApp === 'CARTRIDGE'
                ? 'bg-[#10b981]/25 text-[#a7f3d0] border border-[#10b981]/50 font-bold'
                : 'text-[#94a3b8] hover:text-white hover:bg-[#1c1f28]'
            }`}
            title="Boot Cartridge Slot 2 (Recompiled Frogger Slowdown-Fix ROM)"
          >
            <Play className="w-3 h-3 fill-current text-[#10b981]" />
            <span>SLOT 2: Frogger (Recompiled)</span>
          </button>
        </div>

        {/* Zone 3 (Right): Primary Action Modals */}
        <div className="flex items-center gap-1.5">
          {onLoadRomFile && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".bin,.tgc,.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onLoadRomFile(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#cbd5e1] border border-[#353a47] text-xs font-medium transition-colors"
                title="Load Custom ROM (.bin, .tgc, .zip)"
              >
                <Upload className="w-3.5 h-3.5 text-[#a3ae76]" />
                <span>Load ROM</span>
              </button>
            </>
          )}

          <button
            onClick={onOpenLibrary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#e2e8f0] border border-[#353a47] text-xs font-medium transition-colors"
          >
            <Disc className="w-3.5 h-3.5 text-[#a3ae76]" />
            <span className="hidden sm:inline">Cartridges</span>
          </button>

          <button
            onClick={onOpenAccuracy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#a3ae76]/15 hover:bg-[#a3ae76]/25 text-[#d9e3b1] border border-[#a3ae76]/40 text-xs font-medium transition-colors"
            title="Inspect Frogger SM8521 Source & Slowdown Recompiler"
          >
            <Wrench className="w-3.5 h-3.5 text-[#cbd590]" />
            <span className="hidden sm:inline">Frogger Source</span>
          </button>

          <button
            onClick={onOpenHighScores}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#e2e8f0] border border-[#353a47] text-xs font-medium transition-colors"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Vault</span>
          </button>

          {onOpenBios && (
            <button
              onClick={onOpenBios}
              className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#94a3b8] hover:text-white border border-[#353a47] text-xs transition-colors"
              title="BIOS Firmware Manager"
            >
              <Cpu className="w-3.5 h-3.5 text-[#a3ae76]" />
            </button>
          )}

          {onOpenControls && (
            <button
              onClick={onOpenControls}
              className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#94a3b8] hover:text-white border border-[#353a47] text-xs transition-colors"
              title="Keyboard & Gamepad Bindings"
            >
              <Keyboard className="w-3.5 h-3.5 text-[#cbd5e1]" />
            </button>
          )}

          <button
            onClick={onOpenDebugger}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f232c] hover:bg-[#2a2f3b] text-[#94a3b8] hover:text-white border border-[#353a47] text-xs font-mono transition-colors"
            title="SM8521 Hardware Debugger"
          >
            <Bug className="w-3.5 h-3.5 text-[#e11d48]" />
          </button>
        </div>
      </div>
    </header>
  );
};
