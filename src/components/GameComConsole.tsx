import React, { useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { LCDScreen } from './LCDScreen';
import { Volume2, VolumeX, Power, RotateCcw, PenTool, Disc } from 'lucide-react';

interface GameComConsoleProps {
  system: GameComSystem;
  onLoadRomFile: (file: File) => void;
  onOpenLibrary: () => void;
}

export const GameComConsole: React.FC<GameComConsoleProps> = ({
  system,
  onLoadRomFile,
  onOpenLibrary
}) => {
  const [isStylusUnholstered, setIsStylusUnholstered] = useState(false);
  const [, forceUpdate] = useState({});

  const triggerUpdate = () => forceUpdate({});

  // Button handlers (both mouse and touch friendly)
  const setBtn = (key: keyof typeof system.buttons, pressed: boolean) => {
    system.buttons[key] = pressed;
    if (pressed) {
      system.sound.playButtonPress();
    }
    triggerUpdate();
  };

  const handlePower = () => {
    system.powerToggle();
    triggerUpdate();
  };

  const handleReset = () => {
    system.resetSystem();
    system.sound.playTone(600, 0.1, 'square', 0.2);
    triggerUpdate();
  };

  const handleSoundToggle = () => {
    system.soundToggle();
    triggerUpdate();
  };

  const handlePause = () => {
    system.pauseToggle();
    triggerUpdate();
  };

  return (
    <div className="relative mx-auto flex flex-col items-center">
      {/* Handheld Plastic Chassis */}
      <div className="relative bg-gradient-to-b from-[#2b2e38] via-[#1f222a] to-[#16181e] p-5 sm:p-7 md:p-8 rounded-[38px] md:rounded-[48px] shadow-2xl border-t border-slate-600/40 shadow-black/80 max-w-full">
        {/* Subtle molded plastic texture overlay */}
        <div className="absolute inset-0 rounded-[38px] md:rounded-[48px] pointer-events-none bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:12px_12px]" />

        {/* TOP SECTION: Dual Cartridge Bays + Power LED */}
        <div className="flex items-center justify-between mb-4 px-2">
          {/* Dual Cartridge Slots Indicator */}
          <div className="flex items-center gap-3">
            {/* Slot 1 */}
            <button
              onClick={() => onOpenLibrary()}
              title="Cartridge Slot 1 (Click to manage)"
              className={`px-3 py-1 text-xs font-mono rounded flex items-center gap-2 border transition-colors cursor-pointer ${
                system.slot1
                  ? 'bg-slate-800 text-purple-300 border-purple-500/40 hover:border-purple-400'
                  : 'bg-slate-900/60 text-slate-500 border-slate-700/50'
              }`}
            >
              <Disc className="w-3.5 h-3.5 text-purple-400" />
              <span>SLOT 1:</span>
              <span className="font-semibold text-white truncate max-w-[110px]">
                {system.slot1 ? system.slot1.title : '[EMPTY]'}
              </span>
            </button>

            {/* Slot 2 */}
            <button
              onClick={() => onOpenLibrary()}
              title="Cartridge Slot 2 (Click to manage)"
              className={`hidden sm:flex px-3 py-1 text-xs font-mono rounded items-center gap-2 border transition-colors cursor-pointer ${
                system.slot2
                  ? 'bg-slate-800 text-blue-300 border-blue-500/40 hover:border-blue-400'
                  : 'bg-slate-900/60 text-slate-500 border-slate-700/50'
              }`}
            >
              <Disc className="w-3.5 h-3.5 text-blue-400" />
              <span>SLOT 2:</span>
              <span className="font-semibold text-white truncate max-w-[110px]">
                {system.slot2 ? system.slot2.title : '[EMPTY]'}
              </span>
            </button>
          </div>

          {/* Right Header: Power LED + Stylus Dock Button */}
          <div className="flex items-center gap-4">
            {/* Stylus Holster Toggle */}
            <button
              onClick={() => {
                setIsStylusUnholstered(!isStylusUnholstered);
                system.sound.playTouchBeep();
              }}
              className={`px-2.5 py-1 text-xs rounded border transition-all flex items-center gap-1.5 cursor-pointer ${
                isStylusUnholstered
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Unholster / Holster Game.Com Stylus"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span className="text-[11px] font-mono">
                {isStylusUnholstered ? 'Stylus: In Hand' : 'Stylus Docked'}
              </span>
            </button>

            {/* Power LED Indicator */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  system.isPoweredOn
                    ? 'bg-red-500 shadow-sm shadow-red-500/80 ring-2 ring-red-500/30'
                    : 'bg-red-950'
                }`}
              />
              <span className="text-[10px] tracking-wider text-slate-400 font-bold uppercase">
                Power
              </span>
            </div>
          </div>
        </div>

        {/* Brand Deboss Bar */}
        <div className="flex items-center justify-between px-3 pb-2 text-slate-400">
          <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
            Tiger Electronics
          </span>
          <span className="text-sm font-extrabold tracking-tight text-purple-400 drop-shadow-sm font-mono">
            game·com
          </span>
          <span className="text-[10px] font-mono text-slate-400 tracking-wider">
            TOUCH SCREEN HANDHELD
          </span>
        </div>

        {/* CENTER: Recessed Screen Bezel */}
        <div className="relative bg-[#1c1e24] p-3 sm:p-4 rounded-xl border border-slate-700/60 shadow-inner flex flex-col items-center">
          <LCDScreen
            system={system}
            onFileDrop={onLoadRomFile}
            isStylusActive={isStylusUnholstered}
          />
        </div>

        {/* BOTTOM CONTROLS SECTION */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-6 px-3">
          {/* LEFT: 8-Way Tactile Directional D-Pad */}
          <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
            {/* D-Pad Background Wells */}
            <div className="absolute w-32 h-11 bg-slate-900 rounded-md shadow-inner" />
            <div className="absolute h-32 w-11 bg-slate-900 rounded-md shadow-inner" />

            {/* D-Pad Cross Body */}
            <div className="relative z-10 w-32 h-32">
              {/* UP */}
              <button
                onPointerDown={() => setBtn('up', true)}
                onPointerUp={() => setBtn('up', false)}
                onPointerLeave={() => setBtn('up', false)}
                className={`absolute top-0 left-11 w-10 h-11 bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 rounded-t-md border-t border-slate-500 flex items-center justify-center shadow cursor-pointer active:scale-95 active:bg-slate-900 ${
                  system.buttons.up ? 'bg-slate-900' : ''
                }`}
                title="D-Pad Up (Arrow Up / W)"
              >
                <span className="text-slate-400 text-xs font-bold">▲</span>
              </button>

              {/* DOWN */}
              <button
                onPointerDown={() => setBtn('down', true)}
                onPointerUp={() => setBtn('down', false)}
                onPointerLeave={() => setBtn('down', false)}
                className={`absolute bottom-0 left-11 w-10 h-11 bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 rounded-b-md border-b border-slate-950 flex items-center justify-center shadow cursor-pointer active:scale-95 active:bg-slate-950 ${
                  system.buttons.down ? 'bg-slate-950' : ''
                }`}
                title="D-Pad Down (Arrow Down / S)"
              >
                <span className="text-slate-400 text-xs font-bold">▼</span>
              </button>

              {/* LEFT */}
              <button
                onPointerDown={() => setBtn('left', true)}
                onPointerUp={() => setBtn('left', false)}
                onPointerLeave={() => setBtn('left', false)}
                className={`absolute top-11 left-0 w-11 h-10 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 rounded-l-md border-l border-slate-500 flex items-center justify-center shadow cursor-pointer active:scale-95 active:bg-slate-900 ${
                  system.buttons.left ? 'bg-slate-900' : ''
                }`}
                title="D-Pad Left (Arrow Left / A)"
              >
                <span className="text-slate-400 text-xs font-bold">◀</span>
              </button>

              {/* RIGHT */}
              <button
                onPointerDown={() => setBtn('right', true)}
                onPointerUp={() => setBtn('right', false)}
                onPointerLeave={() => setBtn('right', false)}
                className={`absolute top-11 right-0 w-11 h-10 bg-gradient-to-l from-slate-700 to-slate-800 hover:from-slate-600 rounded-r-md border-r border-slate-950 flex items-center justify-center shadow cursor-pointer active:scale-95 active:bg-slate-900 ${
                  system.buttons.right ? 'bg-slate-900' : ''
                }`}
                title="D-Pad Right (Arrow Right / D)"
              >
                <span className="text-slate-400 text-xs font-bold">▶</span>
              </button>

              {/* Center thumb dish */}
              <div className="absolute top-11 left-11 w-10 h-10 bg-slate-800 flex items-center justify-center pointer-events-none">
                <div className="w-5 h-5 rounded-full bg-slate-900/80 shadow-inner" />
              </div>
            </div>
          </div>

          {/* CENTER: System Console Buttons (MENU, PAUSE, SOUND, POWER, RESET) */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 sm:gap-3 bg-slate-900/70 p-2 rounded-xl border border-slate-800">
              {/* MENU Button */}
              <button
                onClick={() => {
                  setBtn('menu', true);
                  setTimeout(() => setBtn('menu', false), 150);
                }}
                className="flex flex-col items-center px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded active:scale-95 transition-transform border-b border-slate-950 cursor-pointer"
                title="Main Menu (Escape / M)"
              >
                <span className="text-[10px] font-bold text-slate-300 font-mono">MENU</span>
              </button>

              {/* PAUSE Button */}
              <button
                onClick={handlePause}
                className="flex flex-col items-center px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded active:scale-95 transition-transform border-b border-slate-950 cursor-pointer"
                title="Pause (P / Space)"
              >
                <span className="text-[10px] font-bold text-slate-300 font-mono">
                  {system.isPaused ? 'RESUME' : 'PAUSE'}
                </span>
              </button>

              {/* SOUND Button */}
              <button
                onClick={handleSoundToggle}
                className="flex flex-col items-center px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded active:scale-95 transition-transform border-b border-slate-950 cursor-pointer"
                title="Mute / Unmute Sound"
              >
                {system.settings.muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-slate-300" />
                )}
                <span className="text-[9px] font-bold text-slate-400 font-mono mt-0.5">SOUND</span>
              </button>
            </div>

            {/* Hardware Power & Reset Switches */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePower}
                className={`px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                  system.isPoweredOn
                    ? 'bg-red-950/80 text-red-300 border border-red-800/60 hover:bg-red-900'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
                title="Toggle System Power"
              >
                <Power className="w-3 h-3" />
                <span>{system.isPoweredOn ? 'POWER ON' : 'POWER OFF'}</span>
              </button>

              <button
                onClick={handleReset}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                title="Reboot Game.Com"
              >
                <RotateCcw className="w-3 h-3" />
                <span>RESET</span>
              </button>
            </div>
          </div>

          {/* RIGHT: 4 Action Buttons (A, B, C, D) in Game.Com Diagonal Layout */}
          <div className="grid grid-cols-2 gap-3 shrink-0">
            {/* Button A */}
            <button
              onPointerDown={() => setBtn('a', true)}
              onPointerUp={() => setBtn('a', false)}
              onPointerLeave={() => setBtn('a', false)}
              className={`w-12 h-12 rounded-full bg-gradient-to-b from-purple-700 to-purple-900 hover:from-purple-600 border-t border-purple-400 text-white font-extrabold text-base shadow-lg shadow-purple-950/60 flex items-center justify-center active:scale-90 active:bg-purple-950 cursor-pointer ${
                system.buttons.a ? 'scale-95 bg-purple-950' : ''
              }`}
              title="Button A (Z / J / Enter)"
            >
              A
            </button>

            {/* Button B */}
            <button
              onPointerDown={() => setBtn('b', true)}
              onPointerUp={() => setBtn('b', false)}
              onPointerLeave={() => setBtn('b', false)}
              className={`w-12 h-12 rounded-full bg-gradient-to-b from-slate-700 to-slate-900 hover:from-slate-600 border-t border-slate-500 text-white font-extrabold text-base shadow-lg shadow-black/60 flex items-center justify-center active:scale-90 active:bg-slate-950 cursor-pointer ${
                system.buttons.b ? 'scale-95 bg-slate-950' : ''
              }`}
              title="Button B (X / K / Shift)"
            >
              B
            </button>

            {/* Button C */}
            <button
              onPointerDown={() => setBtn('c', true)}
              onPointerUp={() => setBtn('c', false)}
              onPointerLeave={() => setBtn('c', false)}
              className={`w-12 h-12 rounded-full bg-gradient-to-b from-slate-700 to-slate-900 hover:from-slate-600 border-t border-slate-500 text-white font-extrabold text-base shadow-lg shadow-black/60 flex items-center justify-center active:scale-90 active:bg-slate-950 cursor-pointer ${
                system.buttons.c ? 'scale-95 bg-slate-950' : ''
              }`}
              title="Button C (C / L)"
            >
              C
            </button>

            {/* Button D */}
            <button
              onPointerDown={() => setBtn('d', true)}
              onPointerUp={() => setBtn('d', false)}
              onPointerLeave={() => setBtn('d', false)}
              className={`w-12 h-12 rounded-full bg-gradient-to-b from-slate-700 to-slate-900 hover:from-slate-600 border-t border-slate-500 text-white font-extrabold text-base shadow-lg shadow-black/60 flex items-center justify-center active:scale-90 active:bg-slate-950 cursor-pointer ${
                system.buttons.d ? 'scale-95 bg-slate-950' : ''
              }`}
              title="Button D (V / ;)"
            >
              D
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
