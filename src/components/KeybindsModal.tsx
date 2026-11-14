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
      action: 'Move Virtual Stylus Cursor',
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
      action: 'MENU (Main Menu)',
      keys: ['M', 'Backspace'],
      gamepad: 'Select / Back / Share Button'
    },
    {
      action: 'PAUSE (Pause Game)',
      keys: ['P'],
      gamepad: 'Start / Options Button'
    },
    {
      action: 'SOUND (Toggle Sound)',
      keys: ['O'],
      gamepad: 'L1 / LB Shoulder Button'
    },
    {
      action: 'Frame Advance (+1 Frame — Casual Mode)',
      keys: ['F'],
      gamepad: 'Locked in Hardcore Mode'
    },
    {
      action: 'Rewind (-15 Frames — Casual Mode)',
      keys: ['['],
      gamepad: 'Locked in Hardcore Mode'
    },
    {
      action: 'Save State / Load State (Load Casual Only)',
      keys: ['F5 (Save)', 'F8 (Load)'],
      gamepad: 'Menu Bar -> Emulation'
    },
    {
      action: 'Power On / Power Off',
      keys: ['F10'],
      gamepad: 'File -> Power / Bottom Bar'
    },
    {
      action: 'Show / Hide Bottom Status Bar',
      keys: ['Ctrl + B'],
      gamepad: 'View -> Status Bar'
    },
    {
      action: 'Take Emulator Screenshot (PNG)',
      keys: ['F9', 'F12'],
      gamepad: 'Top Bar Camera Button / File Menu'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-[#eceee7] dark:bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#7a1f5c]/15 rounded-lg text-[#7a1f5c] dark:text-[#eab5d8]">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                Controls, Virtual Stylus &amp; Gamepad Mapping
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Move &amp; tap the stylus with Keyboard or Controller, plus Background Input for 2-Player Multiplayer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Interactive Stylus & Background Input Settings */}
          {system && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Virtual Stylus Configuration */}
              <div className="p-4 bg-[#f5f6f1] dark:bg-zinc-950/90 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#be123c] dark:text-rose-400 font-bold text-xs uppercase tracking-wider">
                    <Crosshair className="w-4 h-4" />
                    <span>Virtual Stylus</span>
                  </div>
                  <button
                    onClick={() => {
                      system.virtualStylus.visible = !system.virtualStylus.visible;
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                      system.virtualStylus.visible
                        ? 'bg-[#be123c]/15 border-[#be123c]/50 text-[#9f1239] dark:text-rose-300'
                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {system.virtualStylus.visible ? 'Reticle Visible' : 'Show Reticle'}
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-700 dark:text-zinc-300">Keyboard / Stick Stylus Speed</span>
                    <span className="font-mono text-[#be123c] dark:text-rose-300 font-bold">
                      {Math.round(Math.max(0, Math.min(100, ((system.settings.stylusSpeed - 0.5) / 5.5) * 100)))}% ({system.settings.stylusSpeed.toFixed(1)} px/frame)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(Math.max(0, Math.min(100, ((system.settings.stylusSpeed - 0.5) / 5.5) * 100)))}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value);
                      system.settings.stylusSpeed = Math.round((0.5 + (pct / 100) * 5.5) * 10) / 10;
                      system.saveInputSettingsToStorage();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className="w-full accent-[#be123c] cursor-pointer"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => {
                      system.toggleDpadStylusMode();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      system.virtualStylus.dpadStylusMode
                        ? 'bg-[#7a1f5c] border-[#561340] text-white'
                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
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
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      system.virtualStylus.snapToGrid
                        ? 'bg-amber-600 border-amber-700 text-white'
                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                    title="Snap stylus movement to the 13x10 resistive touch matrix cells"
                  >
                    13×10 Cell Snap: {system.virtualStylus.snapToGrid ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Background Input & Multi-Instance Gamepad Assignment */}
              <div className="p-4 bg-[#f5f6f1] dark:bg-zinc-950/90 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#4c5931] dark:text-[#b9c48a] font-bold text-xs uppercase tracking-wider">
                    <Monitor className="w-4 h-4" />
                    <span>Background Input &amp; Controller</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800">
                    Instance #{system.linkCable.instanceNumber}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-700 dark:text-zinc-300">Accept Input When Unfocused</span>
                  <button
                    onClick={() => {
                      system.settings.backgroundInput = !system.settings.backgroundInput;
                      system.saveInputSettingsToStorage();
                      setTick((t) => t + 1);
                      onUpdate?.();
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      system.settings.backgroundInput
                        ? 'bg-[#4c5931] border-[#3a4424] text-white'
                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {system.settings.backgroundInput ? 'Enabled (60Hz)' : 'Focused Only'}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
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
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white font-mono"
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
          <div className="p-3.5 bg-[#f5f6f1] dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Gamepad2
                className={`w-5 h-5 ${
                  gamepads.length > 0 ? 'text-[#4c5931] dark:text-[#b9c48a]' : 'text-zinc-400 dark:text-zinc-500'
                }`}
              />
              <div>
                <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                  Connected Controllers ({gamepads.length})
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {gamepads.length > 0
                    ? gamepads.map((g) => `Pad #${g.index + 1}: ${g.id}`).join(' · ')
                    : 'Plug in any Xbox, PlayStation, or USB/Bluetooth controller and press any button'}
                </span>
              </div>
            </div>
            {gamepads.length > 0 && (
              <span className="px-2 py-0.5 bg-[#4c5931]/15 text-[#4c5931] dark:text-[#b9c48a] text-[11px] font-mono rounded border border-[#4c5931]/40 flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            )}
          </div>

          {/* Key Map Table */}
          <div className="border border-zinc-300 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#eceee7] dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-mono border-b border-zinc-300 dark:border-zinc-800 uppercase">
                <tr>
                  <th className="py-2.5 px-4">Game.Com / Stylus Action</th>
                  <th className="py-2.5 px-4">Keyboard Shortcuts</th>
                  <th className="py-2.5 px-4">Controller / Gamepad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {keyMap.map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-zinc-900 dark:text-white">{row.action}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {row.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-0.5 bg-[#eceee7] dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-800 dark:text-zinc-200 font-mono text-[11px] shadow-xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-zinc-700 dark:text-zinc-300 text-[11px]">
                      {row.gamepad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-[#eceee7] dark:bg-zinc-950/70 text-xs text-zinc-600 dark:text-zinc-400">
          <span>
            Tip: Use <strong className="text-zinc-900 dark:text-zinc-200">I/J/K/L</strong> or <strong className="text-zinc-900 dark:text-zinc-200">Right Stick</strong> to move the stylus anytime without switching modes!
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
