import React, { useState, useEffect } from 'react';
import { Gamepad2, X, CheckCircle2, Crosshair, Monitor } from 'lucide-react';
import { GameComSystem } from '../emulator/gamecomSystem';

interface KeybindsModalProps {
  isOpen: boolean;
  onClose: () => void;
  system?: GameComSystem;
  onUpdate?: () => void;
}

export const KeybindsModal: React.FC<KeybindsModalProps> = ({
  isOpen,
  onClose,
  system,
  onUpdate
}) => {
  const [gamepads, setGamepads] = useState<{ index: number; id: string }[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const checkGamepads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected: { index: number; id: string }[] = [];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && pad.connected) {
          connected.push({ index: pad.index, id: pad.id });
        }
      }
      setGamepads(connected);
    };

    window.addEventListener('gamepadconnected', checkGamepads);
    window.addEventListener('gamepaddisconnected', checkGamepads);
    checkGamepads();
    const timer = window.setInterval(checkGamepads, 500);

    return () => {
      window.removeEventListener('gamepadconnected', checkGamepads);
      window.removeEventListener('gamepaddisconnected', checkGamepads);
      clearInterval(timer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const keyMap = [
    {
      action: 'Move Stylus Cursor (DS Style)',
      keys: ['I / J / K / L', 'Numpad 8 / 4 / 5 / 6', 'Tab + Arrows / WASD'],
      gamepad: 'Right Stick  OR  L2/LT + Left Stick / D-Pad'
    },
    {
      action: 'Touch / Tap Screen at Stylus Tip',
      keys: ['Space', 'E', 'Numpad 0', 'Numpad Enter'],
      gamepad: 'R2 / RT  OR  R1 / RB  OR  R3 (Right Stick Click)'
    },
    {
      action: 'Toggle D-Pad / Stylus Mode',
      keys: ['Tab'],
      gamepad: 'L3 (Left Stick Click)'
    },
    {
      action: 'D-Pad Up / Down / Left / Right',
      keys: ['Arrow Keys', 'W / A / S / D'],
      gamepad: 'D-Pad  OR  Left Analog Stick'
    },
    {
      action: 'Button A (Primary Action)',
      keys: ['Z', 'Enter'],
      gamepad: 'A / Cross (Bottom Face Button)'
    },
    {
      action: 'Button B (Secondary / Cancel)',
      keys: ['X', 'Shift'],
      gamepad: 'B / Circle (Right Face Button)'
    },
    {
      action: 'Button C (Action 3 / Tool)',
      keys: ['C'],
      gamepad: 'X / Square (Left Face Button)'
    },
    {
      action: 'Button D (Action 4 / Special)',
      keys: ['V'],
      gamepad: 'Y / Triangle (Top Face Button)'
    },
    {
      action: 'MENU (Game.Com Main Menu)',
      keys: ['M', 'Backspace'],
      gamepad: 'Select / Back / Share Button'
    },
    {
      action: 'PAUSE (Hardware Pause Key)',
      keys: ['P'],
      gamepad: 'Start / Options Button'
    },
    {
      action: 'SOUND (Hardware Sound Key)',
      keys: ['O'],
      gamepad: 'L1 / LB Shoulder Button'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Controls, DS-Style Stylus &amp; Gamepad Mapping
              </h2>
              <p className="text-xs text-slate-400">
                Move &amp; tap the stylus with Keyboard or Controller, plus Background Input for 2-Instance Multiplayer
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
          {/* Interactive Stylus & Background Input Settings */}
          {system && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* DS-Style Virtual Stylus Configuration */}
              <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                    <Crosshair className="w-4 h-4" />
                    <span>DS-Style Virtual Stylus</span>
                  </div>
                  <button
                    onClick={() => {
                      system.virtualStylus.visible = !system.virtualStylus.visible;
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                      system.virtualStylus.visible
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    {system.virtualStylus.visible ? 'Reticle Visible' : 'Show Reticle'}
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300">Keyboard / Stick Stylus Speed</span>
                    <span className="font-mono text-rose-300 font-bold">
                      {system.settings.stylusSpeed.toFixed(1)} px/frame
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={6.0}
                    step={0.5}
                    value={system.settings.stylusSpeed}
                    onChange={(e) => {
                      system.settings.stylusSpeed = parseFloat(e.target.value);
                      system.saveInputSettingsToStorage();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => {
                      system.toggleDpadStylusMode();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                      system.virtualStylus.dpadStylusMode
                        ? 'bg-rose-600/25 border-rose-500/60 text-rose-200'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    D-Pad Stylus Mode (Tab): {system.virtualStylus.dpadStylusMode ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={() => {
                      system.virtualStylus.snapToGrid = !system.virtualStylus.snapToGrid;
                      system.virtualStylus.visible = true;
                      system.saveInputSettingsToStorage();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                      system.virtualStylus.snapToGrid
                        ? 'bg-amber-600/25 border-amber-500/60 text-amber-200'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                    title="Snap stylus movement to the 13x10 resistive touch matrix cells"
                  >
                    13×10 Cell Snap: {system.virtualStylus.snapToGrid ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Background Input & Multi-Instance Gamepad Assignment */}
              <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <Monitor className="w-4 h-4" />
                    <span>Background Input &amp; Controller</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                    Instance #{system.linkCable.instanceNumber}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300">Accept Input When Unfocused</span>
                  <button
                    onClick={() => {
                      system.settings.backgroundInput = !system.settings.backgroundInput;
                      system.saveInputSettingsToStorage();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                      system.settings.backgroundInput
                        ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    {system.settings.backgroundInput ? 'Enabled (60Hz)' : 'Focused Only'}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Assigned Gamepad (for Dual-Instance Same-PC Play)
                  </label>
                  <select
                    value={system.settings.gamepadIndex}
                    onChange={(e) => {
                      system.settings.gamepadIndex = Number(e.target.value);
                      system.saveInputSettingsToStorage();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                  >
                    <option value={-1}>
                      Auto (Instance #{system.linkCable.instanceNumber} Default)
                    </option>
                    <option value={0}>Controller #1 (Pad 0)</option>
                    <option value={1}>Controller #2 (Pad 1)</option>
                    <option value={2}>Controller #3 (Pad 2)</option>
                    <option value={3}>Controller #4 (Pad 3)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Gamepad Connection Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Gamepad2 className={`w-5 h-5 ${gamepads.length > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <span className="text-xs font-bold text-white block">
                  Connected Controllers ({gamepads.length})
                </span>
                <span className="text-xs text-slate-400">
                  {gamepads.length > 0
                    ? gamepads.map((g) => `Pad #${g.index + 1}: ${g.id}`).join(' • ')
                    : 'Plug in any Xbox, PlayStation, or USB/Bluetooth controller and press any button'}
                </span>
              </div>
            </div>
            {gamepads.length > 0 && (
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-[11px] font-mono rounded border border-emerald-800 flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            )}
          </div>

          {/* Key Map Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800 uppercase">
                <tr>
                  <th className="py-2.5 px-4">Game.Com / Stylus Action</th>
                  <th className="py-2.5 px-4">Keyboard Shortcuts</th>
                  <th className="py-2.5 px-4">Controller / Gamepad</th>
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
          <span>
            Tip: Use <strong className="text-slate-200">I/J/K/L</strong> or <strong className="text-slate-200">Right Stick</strong> to move the stylus anytime without switching modes!
          </span>
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
