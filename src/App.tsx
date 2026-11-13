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
import { BiosManagerModal } from './components/BiosManagerModal';
import { WindowsReleaseModal } from './components/WindowsReleaseModal';
import { ColorCustomizerModal } from './components/ColorCustomizerModal';
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
  const [isBiosOpen, setIsBiosOpen] = useState(false);
  const [isWindowsReleaseOpen, setIsWindowsReleaseOpen] = useState(false);
  const [isColorCustomizerOpen, setIsColorCustomizerOpen] = useState(false);

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

  // Periodic UI refresh for FPS and status bar
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate();
    }, 500);
    return () => clearInterval(interval);
  }, [forceUpdate]);

  // Global Keyboard Controls & Shortcuts
  useEffect(() => {
    const keyMap: Record<string, keyof GameComButtons> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      KeyZ: 'a',
      KeyJ: 'a',
      KeyX: 'b',
      KeyK: 'b',
      KeyC: 'c',
      KeyL: 'c',
      KeyV: 'd',
      KeyU: 'd',
      Enter: 'menu',
      Backspace: 'pause',
      KeyM: 'sound'
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

      if (e.code === 'F5') {
        e.preventDefault();
        system.saveState(0);
        showToast('Saved State (Slot 0)');
        forceUpdate();
        return;
      }

      if (e.code === 'F8') {
        e.preventDefault();
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

      const mapped = keyMap[e.code];
      if (mapped) {
        e.preventDefault();
        system.setButton(mapped, true);
        forceUpdate();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const mapped = keyMap[e.code];
      if (mapped) {
        e.preventDefault();
        system.setButton(mapped, false);
        forceUpdate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
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
      />

      <HighScoreVaultModal
        system={system}
        isOpen={isHighScoresOpen}
        onClose={() => setIsHighScoresOpen(false)}
        onOpenInBios={() => {
          setIsHighScoresOpen(false);
          system.openBiosHighScoreScreen();
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
