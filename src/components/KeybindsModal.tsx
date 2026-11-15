import React, { useState, useEffect } from 'react';
import { Gamepad2, X, CheckCircle2, Crosshair, Monitor, RotateCcw, Plus } from 'lucide-react';
import { GameComSystem, createDefaultInputBindings } from '../emulator/gamecomSystem';
import { InputActionId } from '../emulator/types';

function formatKeyCode(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  switch (code) {
    case 'ArrowUp':
      return '↑ Up';
    case 'ArrowDown':
      return '↓ Down';
    case 'ArrowLeft':
      return '← Left';
    case 'ArrowRight':
      return '→ Right';
    case 'ShiftLeft':
      return 'L-Shift';
    case 'ShiftRight':
      return 'R-Shift';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Space':
      return 'Space';
    default:
      return code;
  }
}

const GAMEPAD_BTN_LABELS: Record<number, string> = {
  0: 'Btn 0 (A/Cross)',
  1: 'Btn 1 (B/Circle)',
  2: 'Btn 2 (X/Square)',
  3: 'Btn 3 (Y/Triangle)',
  4: 'Btn 4 (L1/LB)',
  5: 'Btn 5 (R1/RB)',
  6: 'Btn 6 (L2/LT)',
  7: 'Btn 7 (R2/RT)',
  8: 'Btn 8 (Select/Back)',
  9: 'Btn 9 (Start/Options)',
  10: 'Btn 10 (L3)',
  11: 'Btn 11 (R3)',
  12: 'Btn 12 (D-Up)',
  13: 'Btn 13 (D-Down)',
  14: 'Btn 14 (D-Left)',
  15: 'Btn 15 (D-Right)'
};

function formatGamepadBtn(idx: number): string {
  return GAMEPAD_BTN_LABELS[idx] || `Btn ${idx}`;
}

interface ActionRowDef {
  id: InputActionId;
  label: string;
  supportsGamepad: boolean;
  gamepadNote?: string;
}

const ACTION_ROWS: ActionRowDef[] = [
  { id: 'dpadUp', label: 'D-Pad Up', supportsGamepad: true, gamepadNote: '+ Left Stick Up' },
  { id: 'dpadDown', label: 'D-Pad Down', supportsGamepad: true, gamepadNote: '+ Left Stick Down' },
  { id: 'dpadLeft', label: 'D-Pad Left', supportsGamepad: true, gamepadNote: '+ Left Stick Left' },
  { id: 'dpadRight', label: 'D-Pad Right', supportsGamepad: true, gamepadNote: '+ Left Stick Right' },
  { id: 'buttonA', label: 'Button A (Primary Action)', supportsGamepad: true },
  { id: 'buttonB', label: 'Button B (Secondary / Cancel)', supportsGamepad: true },
  { id: 'buttonC', label: 'Button C (Action 3 / Tool)', supportsGamepad: true },
  { id: 'buttonD', label: 'Button D (Action 4 / Special)', supportsGamepad: true },
  { id: 'menu', label: 'MENU (Main Menu)', supportsGamepad: true },
  { id: 'pause', label: 'PAUSE (Pause Game)', supportsGamepad: true },
  { id: 'sound', label: 'SOUND (Toggle Sound)', supportsGamepad: true },
  { id: 'stylusUp', label: 'Move Virtual Stylus Up', supportsGamepad: false, gamepadNote: 'Right Stick Up' },
  { id: 'stylusDown', label: 'Move Virtual Stylus Down', supportsGamepad: false, gamepadNote: 'Right Stick Down' },
  { id: 'stylusLeft', label: 'Move Virtual Stylus Left', supportsGamepad: false, gamepadNote: 'Right Stick Left' },
  { id: 'stylusRight', label: 'Move Virtual Stylus Right', supportsGamepad: false, gamepadNote: 'Right Stick Right' },
  { id: 'stylusTouch', label: 'Touch / Tap Screen at Stylus Tip', supportsGamepad: true },
  { id: 'toggleStylusMode', label: 'Toggle D-Pad / Stylus Mode', supportsGamepad: true },
  { id: 'gamepadStylusShift', label: 'Gamepad Stylus Shift Modifier', supportsGamepad: true },
  { id: 'frameAdvance', label: 'Frame Advance (+1 Frame — Casual)', supportsGamepad: false },
  { id: 'rewind', label: 'Rewind (-15 Frames — Casual)', supportsGamepad: false },
  { id: 'saveState', label: 'Save State (Slot 0)', supportsGamepad: false },
  { id: 'loadState', label: 'Load State (Slot 0 — Casual)', supportsGamepad: false },
  { id: 'screenshot', label: 'Take Screenshot (PNG)', supportsGamepad: false },
  { id: 'powerToggle', label: 'Power On / Power Off', supportsGamepad: false },
  { id: 'fullscreen', label: 'Toggle Fullscreen', supportsGamepad: false },
  { id: 'reset', label: 'Reset System', supportsGamepad: false }
];

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
  const [listeningTarget, setListeningTarget] = useState<{
    action: InputActionId;
    type: 'keyboard' | 'gamepad';
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setListeningTarget(null);
      return;
    }
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

  // Capture keyboard or gamepad input while remapping
  useEffect(() => {
    if (!isOpen || !listeningTarget || !system) return;

    if (listeningTarget.type === 'keyboard') {
      const onCaptureKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.code === 'Escape') {
          setListeningTarget(null);
          return;
        }
        const current = system.settings.inputBindings.keyboard[listeningTarget.action] || [];
        system.setKeyboardBinding(listeningTarget.action, [...current, e.code]);
        setListeningTarget(null);
        setTick((t) => t + 1);
        onUpdate?.();
      };
      window.addEventListener('keydown', onCaptureKey, true);
      return () => {
        window.removeEventListener('keydown', onCaptureKey, true);
      };
    }

    // Gamepad button capture
    const onCancelEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setListeningTarget(null);
      }
    };
    window.addEventListener('keydown', onCancelEsc, true);

    const padTimer = window.setInterval(() => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad || !pad.connected) continue;
        for (let b = 0; b < pad.buttons.length; b++) {
          if (pad.buttons[b]?.pressed) {
            const current = system.settings.inputBindings.gamepad[listeningTarget.action] || [];
            system.setGamepadBinding(listeningTarget.action, [...current, b]);
            setListeningTarget(null);
            setTick((t) => t + 1);
            onUpdate?.();
            return;
          }
        }
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', onCancelEsc, true);
      clearInterval(padTimer);
    };
  }, [isOpen, listeningTarget, system, onUpdate]);

  if (!isOpen) return null;

  const activeBindings = system?.settings.inputBindings || createDefaultInputBindings();

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
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#eceee7] dark:bg-zinc-950 border-b border-zinc-300 dark:border-zinc-800">
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Remap Controls &amp; Hotkeys{' '}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">
                  (Click + Add to bind, × to remove, Esc to cancel)
                </span>
              </span>
              {system && (
                <button
                  type="button"
                  onClick={() => {
                    system.resetAllInputBindingsToDefault();
                    setListeningTarget(null);
                    setTick((t) => t + 1);
                    onUpdate?.();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-zinc-300 dark:border-zinc-700 hover:border-rose-400 text-rose-600 dark:text-rose-400 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All to Default</span>
                </button>
              )}
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f5f6f1] dark:bg-zinc-950/70 text-zinc-600 dark:text-zinc-400 font-mono border-b border-zinc-300 dark:border-zinc-800 uppercase">
                <tr>
                  <th className="py-2 px-4">Game.Com / Stylus Action</th>
                  <th className="py-2 px-4">Keyboard Bindings</th>
                  <th className="py-2 px-4">Controller / Gamepad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {ACTION_ROWS.map((row) => {
                  const kbKeys = activeBindings.keyboard[row.id] || [];
                  const padBtns = activeBindings.gamepad[row.id] || [];
                  const isListeningKb =
                    listeningTarget?.action === row.id && listeningTarget.type === 'keyboard';
                  const isListeningPad =
                    listeningTarget?.action === row.id && listeningTarget.type === 'gamepad';

                  return (
                    <tr key={row.id} className="hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2 px-4 font-semibold text-zinc-900 dark:text-white">
                        {row.label}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {kbKeys.map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#eceee7] dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-800 dark:text-zinc-200 font-mono text-[11px] shadow-xs"
                            >
                              <span>{formatKeyCode(code)}</span>
                              {system && (
                                <button
                                  type="button"
                                  title={`Remove ${formatKeyCode(code)}`}
                                  onClick={() => {
                                    system.setKeyboardBinding(
                                      row.id,
                                      kbKeys.filter((c) => c !== code)
                                    );
                                    setTick((t) => t + 1);
                                    onUpdate?.();
                                  }}
                                  className="text-zinc-400 hover:text-rose-500 cursor-pointer leading-none"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                          {system && (
                            <button
                              type="button"
                              onClick={() =>
                                setListeningTarget(
                                  isListeningKb ? null : { action: row.id, type: 'keyboard' }
                                )
                              }
                              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                isListeningKb
                                  ? 'bg-[#7a1f5c] border-[#561340] text-white animate-pulse'
                                  : 'bg-white dark:bg-zinc-900 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                              }`}
                            >
                              {isListeningKb ? (
                                <span>Press Key...</span>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3" />
                                  <span>Add</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-4 font-mono text-zinc-700 dark:text-zinc-300 text-[11px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {row.supportsGamepad ? (
                            <>
                              {padBtns.map((btnIdx) => (
                                <span
                                  key={btnIdx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#eceee7] dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-800 dark:text-zinc-200 font-mono text-[11px]"
                                >
                                  <span>{formatGamepadBtn(btnIdx)}</span>
                                  {system && (
                                    <button
                                      type="button"
                                      title={`Remove ${formatGamepadBtn(btnIdx)}`}
                                      onClick={() => {
                                        system.setGamepadBinding(
                                          row.id,
                                          padBtns.filter((b) => b !== btnIdx)
                                        );
                                        setTick((t) => t + 1);
                                        onUpdate?.();
                                      }}
                                      className="text-zinc-400 hover:text-rose-500 cursor-pointer leading-none"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                              {system && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setListeningTarget(
                                      isListeningPad ? null : { action: row.id, type: 'gamepad' }
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                    isListeningPad
                                      ? 'bg-[#4c5931] border-[#3a4424] text-white animate-pulse'
                                      : 'bg-white dark:bg-zinc-900 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                                  }`}
                                >
                                  {isListeningPad ? (
                                    <span>Press Pad...</span>
                                  ) : (
                                    <>
                                      <Plus className="w-3 h-3" />
                                      <span>Bind</span>
                                    </>
                                  )}
                                </button>
                              )}
                              {row.gamepadNote && (
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                  {row.gamepadNote}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {row.gamepadNote || 'Keyboard / Menu'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
