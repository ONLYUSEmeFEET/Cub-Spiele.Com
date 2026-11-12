import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { GameComSystem } from './emulator/gamecomSystem';
import { TopBar } from './components/TopBar';
import { GameComConsole } from './components/GameComConsole';
import { ScreenOnlyView } from './components/ScreenOnlyView';
import { ControlToolbar } from './components/ControlToolbar';
import { AccuracyFixesModal } from './components/AccuracyFixesModal';
import { RomLibraryModal } from './components/RomLibraryModal';
import { DebuggerModal } from './components/DebuggerModal';
import { KeybindsModal } from './components/KeybindsModal';
import { HighScoreVaultModal } from './components/HighScoreVaultModal';
import { BiosManagerModal } from './components/BiosManagerModal';
import { WindowsReleaseModal } from './components/WindowsReleaseModal';
import { CheckCircle2, AlertCircle, Info, Sparkles, HardDrive, Trophy, Monitor } from 'lucide-react';

export default function App() {
  const system = useMemo(() => new GameComSystem(), []);
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick(t => t + 1), []);

  // Modals state
  const [isAccuracyOpen, setIsAccuracyOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isDebuggerOpen, setIsDebuggerOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isHighScoresOpen, setIsHighScoresOpen] = useState(false);
  const [isBiosOpen, setIsBiosOpen] = useState(false);
  const [isReleasesOpen, setIsReleasesOpen] = useState(false);

  // Notification Toast state
  const [toast, setToast] = useState<{ message: string; sub?: string; type: 'success' | 'info' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, sub?: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, sub, type });
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  // ROM File Loader handler
  const handleLoadRomFile = useCallback(async (file: File, slot: 1 | 2 = 1) => {
    try {
      showToast('Extracting & Loading ROM...', file.name, 'info');
      const cart = await system.loadRomFromFile(file, slot);
      showToast(
        `Loaded: ${cart.title}`,
        `${cart.publisher} (${cart.year}) · ${(cart.sizeBytes / 1024).toFixed(0)} KB · Booting Slot ${slot}...`,
        'success'
      );
      forceUpdate();
    } catch (err) {
      showToast('Failed to load ROM', (err as Error).message, 'error');
    }
  }, [system, showToast, forceUpdate]);

  // Native Windows Desktop Bridge (Electron / Win64 Menu & File Associations)
  useEffect(() => {
    const desktop = (window as any).gamecomDesktop;
    if (!desktop) return;

    const unsubMenu = desktop.onMenuAction
      ? desktop.onMenuAction((action: string) => {
          if (action === 'boot-slot-1') {
            system.launchCartridge(1);
            forceUpdate();
          } else if (action === 'boot-slot-2') {
            system.launchCartridge(2);
            forceUpdate();
          } else if (action === 'save-state') {
            system.saveState(0);
            showToast('State Saved to Slot 0', 'CPU registers, VRAM, and NVRAM recorded', 'success');
          } else if (action === 'load-state') {
            if (system.loadState(0)) {
              showToast('State Loaded from Slot 0', 'Restored hardware CPU, VRAM, and NVRAM state', 'success');
              forceUpdate();
            }
          } else if (action === 'reset-menu') {
            system.resetSystem('MAIN_MENU');
            forceUpdate();
          } else if (action === 'cold-boot') {
            system.resetSystem('NONE');
            forceUpdate();
          } else if (action === 'open-debugger') {
            setIsDebuggerOpen(true);
          } else if (action === 'open-vault') {
            setIsHighScoresOpen(true);
          } else if (action === 'open-accuracy') {
            setIsAccuracyOpen(true);
          } else if (action === 'open-releases') {
            setIsReleasesOpen(true);
          }
        })
      : undefined;

    const unsubRom = desktop.onRomLoaded
      ? desktop.onRomLoaded((payload: { name: string; slot?: 1 | 2; bytes: number[] }) => {
          const uint8 = new Uint8Array(payload.bytes);
          const file = new File([uint8], payload.name, { type: 'application/octet-stream' });
          handleLoadRomFile(file, payload.slot === 2 ? 2 : 1);
        })
      : undefined;

    return () => {
      if (typeof unsubMenu === 'function') unsubMenu();
      if (typeof unsubRom === 'function') unsubRom();
    };
  }, [system, forceUpdate, showToast, handleLoadRomFile]);

  // Keyboard Event Listeners
  useEffect(() => {
    const keyMap: Record<string, keyof typeof system.buttons> = {
      ArrowUp: 'up',
      KeyW: 'up',
      w: 'up',
      W: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      s: 'down',
      S: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      d: 'right',
      D: 'right',
      KeyZ: 'a',
      z: 'a',
      Z: 'a',
      KeyJ: 'a',
      j: 'a',
      J: 'a',
      Enter: 'a',
      KeyX: 'b',
      x: 'b',
      X: 'b',
      KeyK: 'b',
      k: 'b',
      K: 'b',
      ShiftLeft: 'b',
      ShiftRight: 'b',
      KeyC: 'c',
      c: 'c',
      C: 'c',
      KeyL: 'c',
      l: 'c',
      L: 'c',
      KeyV: 'd',
      v: 'd',
      V: 'd',
      Semicolon: 'd',
      ';': 'd',
      Escape: 'menu',
      KeyM: 'menu',
      m: 'menu',
      M: 'menu',
      KeyP: 'pause',
      p: 'pause',
      P: 'pause',
      Space: 'pause'
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting input if typing in an input element
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'F5') {
        e.preventDefault();
        handleSaveState();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        handleLoadState();
        return;
      }

      const btn = keyMap[e.code] || keyMap[e.key];
      if (btn) {
        e.preventDefault();
        if (!system.buttons[btn]) {
          system.buttons[btn] = true;
          forceUpdate();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const btn = keyMap[e.code] || keyMap[e.key];
      if (btn) {
        e.preventDefault();
        system.buttons[btn] = false;
        forceUpdate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [system, forceUpdate]);

  // Gamepad Polling Loop
  useEffect(() => {
    let animId: number;

    const pollGamepads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads[0];
      if (pad && pad.connected) {
        const up = pad.buttons[12]?.pressed || pad.axes[1] < -0.4;
        const down = pad.buttons[13]?.pressed || pad.axes[1] > 0.4;
        const left = pad.buttons[14]?.pressed || pad.axes[0] < -0.4;
        const right = pad.buttons[15]?.pressed || pad.axes[0] > 0.4;
        const a = pad.buttons[0]?.pressed;
        const b = pad.buttons[1]?.pressed;
        const c = pad.buttons[2]?.pressed;
        const d = pad.buttons[3]?.pressed;
        const menu = pad.buttons[8]?.pressed;
        const pause = pad.buttons[9]?.pressed;

        system.buttons.up = !!up;
        system.buttons.down = !!down;
        system.buttons.left = !!left;
        system.buttons.right = !!right;
        system.buttons.a = !!a;
        system.buttons.b = !!b;
        system.buttons.c = !!c;
        system.buttons.d = !!d;
        if (menu) system.buttons.menu = true;
        if (pause) system.buttons.pause = true;
      }
      animId = requestAnimationFrame(pollGamepads);
    };

    animId = requestAnimationFrame(pollGamepads);
    return () => cancelAnimationFrame(animId);
  }, [system]);

  // Actions
  const handleSaveState = () => {
    system.saveState(0);
    showToast('State Saved to Slot 0', 'CPU registers, VRAM, and NVRAM recorded to local storage', 'success');
  };

  const handleLoadState = () => {
    const success = system.loadState(0);
    if (success) {
      showToast('State Loaded from Slot 0', 'Restored hardware CPU, VRAM, and NVRAM state', 'success');
      forceUpdate();
    } else {
      showToast('No Save State Found', 'Press Save State (or F5) first to create one', 'info');
    }
  };

  const handleTakeScreenshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `cub_spiele_com_${Date.now()}.png`;
    a.click();
    showToast('Screenshot Captured', 'Saved 200x160 native PNG image', 'success');
  };

  return (
    <div
      className="min-h-screen text-[#e5e7eb] flex flex-col font-sans"
      style={{
        background:
          'radial-gradient(120% 90% at 50% 20%, #1c2028 0%, #111319 55%, #0a0b0f 100%)'
      }}
    >
      {/* Top Bar (mGBA / melonDS Menu Bar + Toolbar) */}
      <TopBar
        system={system}
        onLoadRomFile={(f, slot = 1) => handleLoadRomFile(f, slot)}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenAccuracy={() => setIsAccuracyOpen(true)}
        onOpenReleases={() => setIsReleasesOpen(true)}
        onOpenBios={() => setIsBiosOpen(true)}
        onOpenControls={() => setIsControlsOpen(true)}
        onOpenDebugger={() => setIsDebuggerOpen(true)}
        onOpenHighScores={() => setIsHighScoresOpen(true)}
        onSaveState={handleSaveState}
        onLoadState={handleLoadState}
        onTakeScreenshot={handleTakeScreenshot}
        onNotify={showToast}
        onUpdate={forceUpdate}
      />

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {/* Viewport Mode: Screen-Only (mGBA/melonDS style) OR Full Handheld Console Bezel */}
        {system.settings.viewMode === 'screen-only' ? (
          <ScreenOnlyView system={system} onStateChange={forceUpdate} />
        ) : (
          <GameComConsole
            system={system}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onStateChange={forceUpdate}
          />
        )}

        {/* Toolbar Controls */}
        <ControlToolbar
          system={system}
          onTakeScreenshot={handleTakeScreenshot}
          onSaveState={handleSaveState}
          onLoadState={handleLoadState}
          onSettingsChange={forceUpdate}
          onOpenHighScores={() => setIsHighScoresOpen(true)}
          onNotify={showToast}
        />

        {/* Quick Info & Features Bar */}
        <div className="w-full max-w-4xl mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 bg-[#151820]/90 border border-[#2a2e3a] rounded-xl">
            <span className="font-bold text-[#f1f5f9] block mb-0.5 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-[#a3ae76]" />
              Dual Cartridge Bays
            </span>
            <p className="text-[#94a3b8] leading-relaxed">
              Preloaded with <code className="text-[#cbd590]">Lights Out</code> in Slot 1 and <code className="text-[#cbd590]">Sonic Jam</code> in Slot 2 with hardware P3 chip-select isolation.
            </p>
          </div>

          <div className="p-3.5 bg-[#151820]/90 border border-[#2a2e3a] rounded-xl">
            <span className="font-bold text-[#f1f5f9] block mb-0.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#e11d48]" />
              Screen-Only &amp; Bezel Modes
            </span>
            <p className="text-[#94a3b8] leading-relaxed">
              Switch between <strong>mGBA / melonDS Screen-Only view</strong> (<code className="text-[#cbd590]">2×/3×/4×</code>) and the full handheld shell.
            </p>
          </div>

          <div className="p-3.5 bg-[#151820]/90 border border-[#2a2e3a] rounded-xl">
            <span className="font-bold text-[#f1f5f9] block mb-0.5 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Expanded NVRAM (&gt;10)
            </span>
            <p className="text-[#94a3b8] leading-relaxed">
              Saves High Scores &amp; binary level data to battery-backed NVRAM (<code className="text-[#cbd590]">$FC60–$FEDF</code>) with unlimited bank paging.
            </p>
          </div>

          <div
            onClick={() => setIsReleasesOpen(true)}
            className="p-3.5 bg-[#151a26]/95 hover:bg-[#1a2130] border border-[#38bdf8]/40 rounded-xl cursor-pointer transition-colors"
          >
            <span className="font-bold text-[#bae6fd] block mb-0.5 flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-[#38bdf8]" />
              Cub Spiele.Com Win64
            </span>
            <p className="text-[#94a3b8] leading-relaxed">
              Download <code className="text-[#38bdf8]">CubSpieleCom.exe</code> (<code className="text-[#cbd590]">v1.2.0</code> Win64 ZIP) or publish tagged GitHub Releases.
            </p>
          </div>
        </div>
      </main>

      {/* Floating Notification Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 p-4 bg-[#161922]/95 border border-[#a3ae76]/50 shadow-2xl rounded-xl backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200 max-w-sm">
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-[#a3ae76] shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
          <div>
            <p className="text-xs font-bold text-white">{toast.message}</p>
            {toast.sub && <p className="text-[11px] text-[#94a3b8] mt-0.5">{toast.sub}</p>}
          </div>
        </div>
      )}

      {/* Modals */}
      <AccuracyFixesModal
        system={system}
        isOpen={isAccuracyOpen}
        onClose={() => setIsAccuracyOpen(false)}
        onUpdate={forceUpdate}
      />

      <RomLibraryModal
        system={system}
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onLoadRomFile={handleLoadRomFile}
      />

      <HighScoreVaultModal
        system={system}
        isOpen={isHighScoresOpen}
        onClose={() => setIsHighScoresOpen(false)}
        onOpenInBios={() => {
          system.openBiosHighScoreScreen();
          showToast('Booting BIOS High Score Screen', 'Loading NVRAM $FC60-$FEDF into official BIOS view', 'info');
          forceUpdate();
        }}
        onUpdated={forceUpdate}
        onNotify={showToast}
      />

      <DebuggerModal
        system={system}
        isOpen={isDebuggerOpen}
        onClose={() => setIsDebuggerOpen(false)}
      />

      <KeybindsModal
        isOpen={isControlsOpen}
        onClose={() => setIsControlsOpen(false)}
      />

      <BiosManagerModal
        system={system}
        isOpen={isBiosOpen}
        onClose={() => setIsBiosOpen(false)}
        onBiosUpdated={() => {
          showToast('Official BIOS Updated', 'System microcode and vectors refreshed', 'success');
          forceUpdate();
        }}
      />

      <WindowsReleaseModal
        isOpen={isReleasesOpen}
        onClose={() => setIsReleasesOpen(false)}
        onNotify={showToast}
      />
    </div>
  );
}
