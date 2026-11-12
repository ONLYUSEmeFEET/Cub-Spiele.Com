import React, { useState, useEffect } from 'react';
import { Gamepad2, X, Keyboard, CheckCircle2 } from 'lucide-react';

interface KeybindsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeybindsModal: React.FC<KeybindsModalProps> = ({ isOpen, onClose }) => {
  const [gamepads, setGamepads] = useState<string[]>([]);

  useEffect(() => {
    const checkGamepads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected: string[] = [];
      for (const pad of pads) {
        if (pad) connected.push(pad.id);
      }
      setGamepads(connected);
    };

    window.addEventListener('gamepadconnected', checkGamepads);
    window.addEventListener('gamepaddisconnected', checkGamepads);
    checkGamepads();

    return () => {
      window.removeEventListener('gamepadconnected', checkGamepads);
      window.removeEventListener('gamepaddisconnected', checkGamepads);
    };
  }, []);

  if (!isOpen) return null;

  const keyMap = [
    { action: 'D-Pad Up', keys: ['ArrowUp', 'W'], gamepad: 'D-Pad Up / Left Stick Up' },
    { action: 'D-Pad Down', keys: ['ArrowDown', 'S'], gamepad: 'D-Pad Down / Left Stick Down' },
    { action: 'D-Pad Left', keys: ['ArrowLeft', 'A'], gamepad: 'D-Pad Left / Left Stick Left' },
    { action: 'D-Pad Right', keys: ['ArrowRight', 'D'], gamepad: 'D-Pad Right / Left Stick Right' },
    { action: 'Button A (Action / Shoot / Jump)', keys: ['Z', 'J', 'Enter'], gamepad: 'A Button (Bottom)' },
    { action: 'Button B (Run / Spin)', keys: ['X', 'K', 'Shift'], gamepad: 'B Button (Right)' },
    { action: 'Button C (Inventory / Tool)', keys: ['C', 'L'], gamepad: 'X Button (Left)' },
    { action: 'Button D (Secondary)', keys: ['V', ';'], gamepad: 'Y Button (Top)' },
    { action: 'MENU (Return to Game.Com OS)', keys: ['Escape', 'M'], gamepad: 'Select Button' },
    { action: 'PAUSE', keys: ['P', 'Space'], gamepad: 'Start Button' },
    { action: 'TOUCHSCREEN & STYLUS', keys: ['Mouse Click & Drag', 'Touch Tap'], gamepad: 'Right Stick / Touch' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Controls & Gamepad Mapping
              </h2>
              <p className="text-xs text-slate-400">
                Play using keyboard, mouse stylus, or connected USB/Bluetooth controller
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Gamepad Connection Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Gamepad2 className={`w-5 h-5 ${gamepads.length > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <span className="text-xs font-bold text-white block">Gamepad Support</span>
                <span className="text-xs text-slate-400">
                  {gamepads.length > 0
                    ? `Connected: ${gamepads[0]}`
                    : 'Plug in any Xbox, PlayStation, or generic USB/Bluetooth controller'}
                </span>
              </div>
            </div>
            {gamepads.length > 0 && (
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-[11px] font-mono rounded border border-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            )}
          </div>

          {/* Key Map Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800 uppercase">
                <tr>
                  <th className="py-2.5 px-4">Game.Com Action</th>
                  <th className="py-2.5 px-4">Keyboard Shortcuts</th>
                  <th className="py-2.5 px-4">Gamepad Button</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {keyMap.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-white">{row.action}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {row.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono text-[11px] shadow-xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-300 text-[11px]">
                      {row.gamepad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
          <span>Click directly on the screen or unholster the stylus for touch interactions</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
