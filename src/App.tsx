import { useState, useEffect, useCallback, useRef } from 'react';
import { GameComSystem } from './emulator/gamecomSystem';
import { TopBar } from './components/TopBar';
import { GameComConsole } from './components/GameComConsole';
import { ScreenOnlyView } from './components/ScreenOnlyView';
import { AccuracyFixesModal } from './components/AccuracyFixesModal';
import { RomLibraryModal } from './components/RomLibraryModal';
import { DebuggerModal } from './components/DebuggerModal';
import { KeybindsModal } from './components/KeybindsModal';
import { HighScoreVaultModal } from './components/HighScoreVaultModal';
import { PhoneBookModal } from './components/PhoneBookModal';
import { BiosManagerModal } from './components/BiosManagerModal';
import { WindowsReleaseModal } from './components/WindowsReleaseModal';
import { ColorCustomizerModal } from './components/ColorCustomizerModal';
import { CompeteLinkModal } from './components/CompeteLinkModal';
import { GameComButtons } from './emulator/types';

export function App() {
  const [system] = useState<GameComSystem>(() => new GameComSystem());
  const [, setTick] = useState(0);

  // Modals state
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isAccuracyOpen, setIsAccuracyOpen] = useState(false);
  const [isDebuggerOpen, setIsDebuggerOpen] = useState(false);
  const [isKeybindsOpen, setIsKeybindsOpen] = useState(false);
  const [isHighScoresOpen, setIsHighScoresOpen] = useState(false);
  const [isPhoneBookOpen, setIsPhoneBookOpen] = useState(false);
  const [isBiosOpen, setIsBiosOpen] = useState(false);
  const [isWindowsReleaseOpen, setIsWindowsReleaseOpen] = useState(false);
  const [isColorCustomizerOpen, setIsColorCustomizerOpen] = useState(false);
  const [isLinkCableOpen, setIsLinkCableOpen] = useState(false);

  // Drag & Drop ROM overlay state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const forceUpdate = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Periodic UI refresh for FPS and status bar + Electron menu bridge + Competitive callbacks
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate();
    }, 500);

    system.onHardcoreViolation = (reason) => {
      showToast(reason);
    };

    system.onScoreRecorded = (entry) => {
      showToast(
        `New High Score! ${entry.playerName}: ${entry.scoreText} in ${entry.gameTitle} (${
          entry.verification?.hardcoreVerified ? 'HARDCORE VERIFIED' : 'Softcore'
        })`
      );
      forceUpdate();
    };

    system.retroAchievements.setNotificationHandler((title, subtitle) => {
      showToast(`${title} — ${subtitle}`);
      forceUpdate();
    });

    const desktop = (window as any).gamecomDesktop;
    if (desktop && typeof desktop.onMenuAction === 'function') {
      desktop.onMenuAction((action: string) => {
        if (action === 'open-link-cable') {
          setIsLinkCableOpen(true);
        } else if (action === 'launch-second-instance') {
          system.linkCable.launchSecondInstanceWindow();
          forceUpdate();
        } else if (action === 'toggle-background-input') {
          system.settings.backgroundInput = !system.settings.backgroundInput;
          system.saveInputSettingsToStorage();
          showToast(
            `Background Input: ${system.settings.backgroundInput ? 'Enabled (60Hz)' : 'Focused Only'}`
          );
          forceUpdate();
        } else if (action === 'open-library') {
          setIsLibraryOpen(true);
        } else if (action === 'open-high-scores' || action === 'open-vault') {
          setIsHighScoresOpen(true);
        } else if (action === 'open-debugger') {
          setIsDebuggerOpen(true);
        } else if (action === 'open-keybinds') {
          setIsKeybindsOpen(true);
        } else if (action === 'open-accuracy') {
          setIsAccuracyOpen(true);
        } else if (action === 'open-bios') {
          setIsBiosOpen(true);
        }
      });
    }

    return () => clearInterval(interval);
  }, [system, forceUpdate, showToast]);

  // Global Keyboard Controls, DS-Style Virtual Stylus & Gamepad Polling
  useEffect(() => {
    const heldStylusDirs = {
      up: false,
      down: false,
      left: false,
      right: false
    };

    const dpadKeyMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right'
    };

    const dedicatedStylusDirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      KeyI: 'up',
      Numpad8: 'up',
      KeyK: 'down',
      Numpad5: 'down',
      Numpad2: 'down',
      KeyJ: 'left',
      Numpad4: 'left',
      KeyL: 'right',
      Numpad6: 'right'
    };

    const stylusTouchKeys = new Set(['Space', 'KeyE', 'Numpad0', 'NumpadEnter']);

    const actionKeyMap: Record<string, keyof GameComButtons> = {
      KeyZ: 'a',
      Enter: 'a',
      KeyX: 'b',
      ShiftLeft: 'b',
      ShiftRight: 'b',
      KeyC: 'c',
      KeyV: 'd',
      KeyU: 'd',
      KeyM: 'menu',
      Backspace: 'menu',
      KeyO: 'sound'
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        setIsLibraryOpen(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyR') {
        e.preventDefault();
        system.resetSystem('MAIN_MENU');
        showToast('Soft Reset to BIOS Main Menu');
        forceUpdate();
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        const active = system.toggleDpadStylusMode();
        showToast(
          active
            ? 'D-Pad Stylus Mode ON (Arrow/WASD moves Stylus, Space/E taps)'
            : 'D-Pad Stylus Mode OFF (Arrow/WASD controls D-Pad)'
        );
        forceUpdate();
        return;
      }

      if (e.code === 'F5') {
        e.preventDefault();
        system.saveState(0);
        showToast('Saved State (Slot 0)');
        forceUpdate();
        return;
      }

      if (e.code === 'F8') {
        e.preventDefault();
        if (system.retroAchievements.config.hardcoreMode) {
          system.loadState(0);
          forceUpdate();
          return;
        }
        const loaded = system.loadState(0);
        showToast(loaded ? 'Loaded State (Slot 0)' : 'No Save State Found');
        forceUpdate();
        return;
      }

      if (e.code === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      if (e.code === 'KeyP') {
        e.preventDefault();
        system.pauseToggle();
        forceUpdate();
        return;
      }

      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        system.resetSystem('MAIN_MENU');
        forceUpdate();
        return;
      }

      // Stylus Touch / Tap Keys (Space, E, Numpad 0, Numpad Enter)
      if (stylusTouchKeys.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) {
          system.setVirtualStylusTouch(true);
          forceUpdate();
        }
        return;
      }

      // Dedicated Stylus Movement Keys (I/J/K/L & Numpad 8/4/5/6)
      const stylusDir = dedicatedStylusDirMap[e.code];
      if (stylusDir) {
        e.preventDefault();
        if (system.virtualStylus.snapToGrid) {
          if (!e.repeat) {
            system.stepVirtualStylusGridCell(
              stylusDir === 'left' ? -1 : stylusDir === 'right' ? 1 : 0,
              stylusDir === 'up' ? -1 : stylusDir === 'down' ? 1 : 0
            );
            forceUpdate();
          }
        } else {
          heldStylusDirs[stylusDir] = true;
          system.virtualStylus.visible = true;
        }
        return;
      }

      // D-Pad or D-Pad-Stylus-Mode Keys (Arrows / WASD)
      const dpadDir = dpadKeyMap[e.code];
      if (dpadDir) {
        e.preventDefault();
        if (system.virtualStylus.dpadStylusMode) {
          if (system.virtualStylus.snapToGrid) {
            if (!e.repeat) {
              system.stepVirtualStylusGridCell(
                dpadDir === 'left' ? -1 : dpadDir === 'right' ? 1 : 0,
                dpadDir === 'up' ? -1 : dpadDir === 'down' ? 1 : 0
              );
              forceUpdate();
            }
          } else {
            heldStylusDirs[dpadDir] = true;
            system.virtualStylus.visible = true;
          }
        } else {
          system.setButton(dpadDir, true);
          forceUpdate();
        }
        return;
      }

      const mapped = actionKeyMap[e.code];
      if (mapped) {
        e.preventDefault();
        system.setButton(mapped, true);
        forceUpdate();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (stylusTouchKeys.has(e.code)) {
        e.preventDefault();
        system.setVirtualStylusTouch(false);
        forceUpdate();
        return;
      }

      const stylusDir = dedicatedStylusDirMap[e.code];
      if (stylusDir) {
        e.preventDefault();
        heldStylusDirs[stylusDir] = false;
        return;
      }

      const dpadDir = dpadKeyMap[e.code];
      if (dpadDir) {
        e.preventDefault();
        heldStylusDirs[dpadDir] = false;
        system.setButton(dpadDir, false);
        forceUpdate();
        return;
      }

      const mapped = actionKeyMap[e.code];
      if (mapped) {
        e.preventDefault();
        system.setButton(mapped, false);
        forceUpdate();
      }
    };

    // Track previous gamepad button states so Keyboard & Gamepad coexist cleanly
    const prevPadButtons: Record<keyof GameComButtons, boolean> = {
      up: false,
      down: false,
      left: false,
      right: false,
      a: false,
      b: false,
      c: false,
      d: false,
      menu: false,
      pause: false,
      sound: false,
      power: false,
      reset: false
    };
    let prevPadStylusTouch = false;
    let prevPadL3 = false;

    const pollInputTick = () => {
      // 1. Apply continuous keyboard stylus movement
      const kDx = (heldStylusDirs.right ? 1 : 0) - (heldStylusDirs.left ? 1 : 0);
      const kDy = (heldStylusDirs.down ? 1 : 0) - (heldStylusDirs.up ? 1 : 0);
      if (kDx !== 0 || kDy !== 0) {
        const spd = system.settings.stylusSpeed;
        const norm = kDx !== 0 && kDy !== 0 ? 0.7071 : 1;
        system.moveVirtualStylus(kDx * spd * norm, kDy * spd * norm);
      }

      // 2. Poll HTML5 Gamepad API (respecting Background Input setting)
      const isFocused = document.hasFocus();
      if (!isFocused && !system.settings.backgroundInput) {
        return;
      }

      const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connectedPads: Gamepad[] = [];
      for (let i = 0; i < rawPads.length; i++) {
        const p = rawPads[i];
        if (p && p.connected) connectedPads.push(p);
      }
      if (connectedPads.length === 0) return;

      let activePad: Gamepad | null = null;
      if (system.settings.gamepadIndex >= 0) {
        activePad = rawPads[system.settings.gamepadIndex] || null;
      } else {
        // Auto-select controller for single or dual-instance play
        if (connectedPads.length >= 2 && system.linkCable.instanceNumber === 2) {
          activePad = connectedPads[1];
        } else if (
          connectedPads.length === 1 &&
          system.linkCable.mode === 'same-pc' &&
          system.linkCable.status === 'connected'
        ) {
          // When 1 controller is shared across 2 windows on 1 PC:
          // let Instance #2 (usually the background/controller player) or the focused window use it
          if (system.linkCable.instanceNumber === 2 || isFocused) {
            activePad = connectedPads[0];
          }
        } else {
          activePad = connectedPads[0];
        }
      }

      if (!activePad) return;

      const dz = system.settings.gamepadDeadzone || 0.15;
      const applyDeadzone = (v: number) => (Math.abs(v) < dz ? 0 : v);

      const lx = applyDeadzone(activePad.axes[0] || 0);
      const ly = applyDeadzone(activePad.axes[1] || 0);
      const rx = applyDeadzone(activePad.axes[2] || 0);
      const ry = applyDeadzone(activePad.axes[3] || 0);

      const btnPressed = (idx: number) => Boolean(activePad!.buttons[idx]?.pressed);

      // L3 (button 10) toggles D-Pad Stylus Mode
      const l3Now = btnPressed(10);
      if (l3Now && !prevPadL3) {
        system.toggleDpadStylusMode();
      }
      prevPadL3 = l3Now;

      // L2/LT (button 6) acts as instant Stylus Shift modifier for Left Stick / D-Pad
      const l2StylusShift = btnPressed(6) || system.virtualStylus.dpadStylusMode;

      const dpadUp = btnPressed(12) || ly < -0.45;
      const dpadDown = btnPressed(13) || ly > 0.45;
      const dpadLeft = btnPressed(14) || lx < -0.45;
      const dpadRight = btnPressed(15) || lx > 0.45;

      // Move Virtual Stylus with Right Stick OR (when L2/StylusMode active) Left Stick / D-Pad
      const spd = system.settings.stylusSpeed * 1.4;
      let sDx = rx * spd;
      let sDy = ry * spd;
      if (l2StylusShift) {
        if (lx !== 0 || ly !== 0) {
          sDx += lx * spd;
          sDy += ly * spd;
        } else {
          sDx += ((dpadRight ? 1 : 0) - (dpadLeft ? 1 : 0)) * system.settings.stylusSpeed;
          sDy += ((dpadDown ? 1 : 0) - (dpadUp ? 1 : 0)) * system.settings.stylusSpeed;
        }
      }
      if (sDx !== 0 || sDy !== 0) {
        system.moveVirtualStylus(sDx, sDy);
      }

      // Stylus Touch via R2/RT (7), R1/RB (5), or R3 (11)
      const padTouchNow = btnPressed(7) || btnPressed(5) || btnPressed(11);
      if (padTouchNow !== prevPadStylusTouch) {
        system.setVirtualStylusTouch(padTouchNow);
        prevPadStylusTouch = padTouchNow;
      }

      // Physical Game.Com Buttons from Gamepad
      const nextPadButtons: Partial<Record<keyof GameComButtons, boolean>> = {
        up: l2StylusShift ? false : dpadUp,
        down: l2StylusShift ? false : dpadDown,
        left: l2StylusShift ? false : dpadLeft,
        right: l2StylusShift ? false : dpadRight,
        a: btnPressed(0),
        b: btnPressed(1),
        c: btnPressed(2),
        d: btnPressed(3),
        sound: btnPressed(4),
        menu: btnPressed(8),
        pause: btnPressed(9)
      };

      (Object.keys(nextPadButtons) as (keyof GameComButtons)[]).forEach((k) => {
        const nowVal = Boolean(nextPadButtons[k]);
        if (nowVal !== prevPadButtons[k]) {
          prevPadButtons[k] = nowVal;
          system.setButton(k, nowVal);
        }
      });
    };

    const pollInterval = window.setInterval(pollInputTick, 16);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [system, forceUpdate, showToast]);

  // Global Drag-and-Drop ROM handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      const cart = await system.loadRomFromFile(file, 1);
      showToast(`Loaded "${cart.title}" into Slot 1`);
      forceUpdate();
    } catch (err) {
      showToast(`ROM Error: ${(err as Error).message}`);
    }
  };

  const activeCart = system.activeSlot === 1 ? system.slot1 : system.slot2;
  const touchGridPercent = Math.round((system.settings.touchGridOpacity || 0) * 100);

  return (
    <div
      className="h-screen w-screen bg-[#111317] text-zinc-100 flex flex-col overflow-hidden select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop ROM Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm border-2 border-dashed border-emerald-500 m-3 rounded-xl flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg font-bold text-white">Drop Game.Com ROM (.bin, .tgc, .zip)</p>
          <p className="text-xs text-emerald-400 mt-1">
            Reads official TigerDMGC cartridge header and boots into Slot 1
          </p>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-9 right-4 z-50 bg-zinc-900/95 border border-zinc-700 text-zinc-100 px-3.5 py-2 rounded-lg shadow-xl flex items-center gap-2 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Single Native Desktop Menu Bar */}
      <TopBar
        system={system}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenAccuracy={() => setIsAccuracyOpen(true)}
        onOpenDebugger={() => setIsDebuggerOpen(true)}
        onOpenKeybinds={() => setIsKeybindsOpen(true)}
        onOpenHighScores={() => setIsHighScoresOpen(true)}
        onOpenPhoneBook={() => setIsPhoneBookOpen(true)}
        onOpenLinkCable={() => setIsLinkCableOpen(true)}
        onOpenBios={() => setIsBiosOpen(true)}
        onOpenWindowsRelease={() => setIsWindowsReleaseOpen(true)}
        onOpenColorCustomizer={() => setIsColorCustomizerOpen(true)}
        onUpdate={forceUpdate}
      />

      {/* Clean Central Emulator Viewport */}
      <main className="flex-1 flex items-center justify-center overflow-auto p-3">
        {system.settings.viewMode === 'screen-only' ? (
          <ScreenOnlyView system={system} />
        ) : (
          <GameComConsole
            system={system}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onStateChange={forceUpdate}
          />
        )}
      </main>

      {/* Minimal Standalone Emulator Status Bar */}
      <footer className="h-6 bg-[#16181e] border-t border-zinc-800/90 px-3 flex items-center justify-between text-[11px] text-zinc-400 font-mono shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                !system.isPoweredOn
                  ? 'bg-zinc-600'
                  : system.isPaused
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span className="text-zinc-300">
              {!system.isPoweredOn ? 'OFF' : system.isPaused ? 'PAUSED' : 'RUNNING'}
            </span>
          </span>

          <span className="text-zinc-700">|</span>

          <span className="truncate text-zinc-300">
            {system.activeApp === 'CARTRIDGE' && activeCart
              ? `Slot ${system.activeSlot}: ${activeCart.title}${
                  activeCart.headerTitle ? ` [${activeCart.headerTitle}]` : ''
                }`
              : 'BIOS Built-In PDA / Menu'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {system.linkCable.mode !== 'off' && (
            <>
              <span
                className={
                  system.linkCable.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'
                }
              >
                Link: {system.linkCable.status === 'connected' ? 'Connected' : 'Waiting'} (TX:{system.linkCable.txBytes}/RX:{system.linkCable.rxBytes})
              </span>
              <span className="text-zinc-700">|</span>
            </>
          )}
          {touchGridPercent > 0 && (
            <>
              <span className="text-emerald-400">Grid: {touchGridPercent}%</span>
              <span className="text-zinc-700">|</span>
            </>
          )}
          <span className="hidden sm:inline">
            Ghosting: {Math.round(system.settings.ghosting * 100)}% /{' '}
            {Math.round(system.settings.ghostingPersistence * 100)}%
          </span>
          <span className="hidden sm:inline text-zinc-700">|</span>
          <span>Vol: {system.settings.muted ? 'Mute' : `${Math.round(system.settings.volume * 100)}%`}</span>
          <span className="text-zinc-700">|</span>
          <span className="text-emerald-400">{system.fps} FPS</span>
        </div>
      </footer>

      {/* Modals */}
      <RomLibraryModal
        system={system}
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onLoadRomFile={async (file, slot) => {
          try {
            const cart = await system.loadRomFromFile(file, slot);
            showToast(`Loaded "${cart.title}" into Slot ${slot}`);
            forceUpdate();
          } catch (err) {
            showToast(`ROM Error: ${(err as Error).message}`);
          }
        }}
      />

      {isAccuracyOpen && (
        <AccuracyFixesModal
          system={system}
          onClose={() => setIsAccuracyOpen(false)}
          onUpdate={forceUpdate}
        />
      )}

      <DebuggerModal
        system={system}
        isOpen={isDebuggerOpen}
        onClose={() => setIsDebuggerOpen(false)}
      />

      <KeybindsModal
        isOpen={isKeybindsOpen}
        onClose={() => setIsKeybindsOpen(false)}
        system={system}
        onUpdate={forceUpdate}
      />

      {isLinkCableOpen && (
        <CompeteLinkModal
          system={system}
          onClose={() => setIsLinkCableOpen(false)}
          onUpdate={forceUpdate}
        />
      )}

      <HighScoreVaultModal
        system={system}
        isOpen={isHighScoresOpen}
        onClose={() => setIsHighScoresOpen(false)}
        onOpenInBios={() => {
          setIsHighScoresOpen(false);
          system.openBiosHighScoreScreen();
          forceUpdate();
        }}
        onOpenPhoneBook={() => setIsPhoneBookOpen(true)}
        onUpdated={forceUpdate}
        onNotify={(msg) => showToast(msg)}
      />

      <PhoneBookModal
        system={system}
        isOpen={isPhoneBookOpen}
        onClose={() => setIsPhoneBookOpen(false)}
        onOpenInBios={() => {
          setIsPhoneBookOpen(false);
          system.openBiosPhoneBookScreen();
          forceUpdate();
        }}
        onUpdated={forceUpdate}
        onNotify={(msg) => showToast(msg)}
      />

      <BiosManagerModal
        system={system}
        isOpen={isBiosOpen}
        onClose={() => setIsBiosOpen(false)}
        onBiosUpdated={forceUpdate}
      />

      {isWindowsReleaseOpen && (
        <WindowsReleaseModal onClose={() => setIsWindowsReleaseOpen(false)} />
      )}

      {isColorCustomizerOpen && (
        <ColorCustomizerModal
          system={system}
          onClose={() => setIsColorCustomizerOpen(false)}
          onUpdate={forceUpdate}
        />
      )}
    </div>
  );
}

export default App;
