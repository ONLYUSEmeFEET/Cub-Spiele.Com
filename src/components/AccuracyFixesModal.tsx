import React from 'react';
import { EmulationAccuracyFixes, GameComSystem } from '../emulator/gamecomSystem';
import { X, Cpu, Clock, Layers, Activity, Grid, CheckCircle2, Disc, Sliders, RotateCcw } from 'lucide-react';

interface AccuracyFixesModalProps {
  system: GameComSystem;
  onClose: () => void;
  onUpdate: () => void;
}

export const AccuracyFixesModal: React.FC<AccuracyFixesModalProps> = ({
  system,
  onClose,
  onUpdate
}) => {
  const fixes = system.accuracyFixes;
  const ghostingIntensityPct = Math.round(system.settings.ghosting * 100);
  const ghostingPersistencePct = Math.round(system.settings.ghostingPersistence * 100);

  const toggleFix = (key: keyof EmulationAccuracyFixes) => {
    system.accuracyFixes[key] = !system.accuracyFixes[key];
    system.saveDisplaySettingsToStorage();
    onUpdate();
  };

  const handleIntensityChange = (val: number) => {
    system.accuracyFixes.stnGhostingAccurate = val > 0 || system.settings.ghostingPersistence > 0;
    system.setGhostingParameters(val, system.settings.ghostingPersistence);
    onUpdate();
  };

  const handlePersistenceChange = (val: number) => {
    system.accuracyFixes.stnGhostingAccurate = system.settings.ghosting > 0 || val > 0;
    system.setGhostingParameters(system.settings.ghosting, val);
    onUpdate();
  };

  const applyGhostingPreset = (intensity: number, persistence: number, enabled: boolean = true) => {
    system.accuracyFixes.stnGhostingAccurate = enabled;
    system.setGhostingParameters(intensity, persistence);
    onUpdate();
  };

  const fixItems: {
    key: keyof EmulationAccuracyFixes;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    technicalProblem: string;
    ourFix: string;
    impact: string;
  }[] = [
    {
      key: 'stnGhostingAccurate',
      title: 'Passive-Matrix STN LCD Ghosting & Persistence',
      subtitle: 'Configurable Liquid-Crystal Response Trail & Frame Decay',
      icon: <Activity className="w-5 h-5 text-amber-400" />,
      technicalProblem:
        'The 1997 passive-matrix STN LCD panel exhibits slow nematic liquid-crystal twist relaxation (~180ms). Many games use rapid frame alternation to create intermediate shading and motion trails.',
      ourFix:
        'Maintains a per-pixel floating-point persistence buffer with independent Ghosting Intensity and Persistence Decay controls.',
      impact: 'Restores authentic passive-matrix motion response and eliminates harsh 1-bit flicker.'
    },
    {
      key: 'correctClockSpeed',
      title: 'SM8521 CPU Clock & LCH/LCV VBlank Timing',
      subtitle: '4.9152 MHz Crystal Oscillator (320 Cycles × 207 Lines @ 74.20 Hz)',
      icon: <Clock className="w-5 h-5 text-emerald-400" />,
      technicalProblem:
        'Running the Sharp SM8521 above its 4.9152 MHz crystal frequency or omitting LCV VBlank lines causes audio pitch drift and screen tearing in VBlank ISRs.',
      ourFix:
        'Locks execution to SM8521 LCH/LCV registers: 320 CPU cycles per column across 200 active + 7 VBlank columns (66,240 cycles/frame at 74.2029 Hz).',
      impact: 'Hardware-accurate game speed, VBlank tear reduction, timer cadence, and DAC pitch.'
    },
    {
      key: 'dualCartridgeSlotFix',
      title: 'Hardware P3 Dual Cartridge Slot Isolation',
      subtitle: 'Port 3 ($0017) Bit 6 ($40) & Bit 7 ($80) Chip-Select Latch',
      icon: <Disc className="w-5 h-5 text-rose-400" />,
      technicalProblem:
        'When both cartridge bays are populated, games that clear upper Port 3 bits during keypad matrix scans can accidentally deselect their own cartridge ROM bank.',
      ourFix:
        'Latches the BIOS-selected cartridge slot chip-select bit when executing inside cartridge ROM space ($2000–$9FFF, MMU >= $20).',
      impact: 'Prevents slot bus contention and ensures reliable dual-slot switching.'
    },
    {
      key: 'preventBankWrapCrash',
      title: 'MMU 8KB Bank Mirroring & Header Alignment',
      subtitle: '5x 8KB MMU Window Registers ($0010–$0013) + 2MB Bus Mirroring',
      icon: <Layers className="w-5 h-5 text-sky-400" />,
      technicalProblem:
        'Cartridges ranging from 32KB to 2MB rely on power-of-two address mirroring across the 2MB physical cartridge bus when high bank indices are written to MMU registers.',
      ourFix:
        'Mirrors smaller ROM images across the 2MB cartridge space and aligns TigerDMGC cartridge headers with BIOS probe banks.',
      impact: 'Eliminates out-of-bounds bank reads across all retail and homebrew cartridges.'
    },
    {
      key: 'timerInterruptFix',
      title: 'SM8521 Edge-Triggered Interrupt Priority & DMA Halt',
      subtitle: 'Hardware Interrupt Vectors ($1000–$101E) & Cycle-Stealing Blitter',
      icon: <Cpu className="w-5 h-5 text-purple-400" />,
      technicalProblem:
        'Level-triggered interrupt handling can re-fire Timer 1 ($1012) or LCDC VBLANK ($100E) before the CPU completes its IRET sequence.',
      ourFix:
        'Implements edge-triggered IR0/IR1 flag clearing on vector dispatch and halts CPU instruction fetch during active DMA blits.',
      impact: 'Prevents stack overflows and sprite tearing during heavy DMA transfers.'
    },
    {
      key: 'touchMatrixCalibrated',
      title: '13x10 Resistive Touchscreen Matrix Lock',
      subtitle: 'Single-Touch Coordinate Quantization (200x160 -> 13x10 Grid)',
      icon: <Grid className="w-5 h-5 text-pink-400" />,
      technicalProblem:
        'Continuous pointer movement while holding the mouse button can trigger unintended repeated cell toggles in grid puzzle games.',
      ourFix:
        'Latches a single discrete 8-frame stylus press per pointer down event and quantizes coordinates to the 13x10 hardware matrix.',
      impact: 'Crisp single-tap responsiveness in Lights Out, Solitaire, and BIOS menus.'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-[#4c5931] dark:text-[#b9c48a]" />
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white tracking-wide">
                Hardware Accuracy &amp; STN LCD Ghosting Configuration
              </h2>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Sharp SM8521 CPU Timing, STN Passive-Matrix LCD Response &amp; Bus Settings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* STN Passive-Matrix LCD Ghosting & Persistence Menu */}
          <div className="p-4 rounded-xl border border-amber-400/50 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/15 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30">
                  <Sliders className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    STN Passive-Matrix LCD Ghosting &amp; Persistence Menu
                  </h3>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    Adjust both the trail blend intensity and frame-to-frame liquid-crystal decay persistence
                  </p>
                </div>
              </div>
              <button
                onClick={() => applyGhostingPreset(0.40, 0.65, true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium border border-zinc-300 dark:border-zinc-700 transition cursor-pointer"
                title="Reset to calibrated 1997 STN hardware defaults (40% Intensity / 65% Persistence)"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Default
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Intensity Slider */}
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">Ghosting Intensity</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{ghostingIntensityPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={system.accuracyFixes.stnGhostingAccurate ? system.settings.ghosting : 0}
                  onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
                  className="w-full accent-[#7a1f5c] cursor-pointer h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg"
                />
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Controls how strongly the passive-matrix afterimage blends into active pixels (`0%` = crisp modern edges, `100%` = maximum trail blend).
                </p>
              </div>

              {/* Persistence / Decay Slider */}
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">Ghosting Persistence (Decay)</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                    {ghostingPersistencePct}% (~{Math.round(ghostingPersistencePct * 3.2)} ms)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={system.accuracyFixes.stnGhostingAccurate ? system.settings.ghostingPersistence : 0}
                  onChange={(e) => handlePersistenceChange(parseFloat(e.target.value))}
                  className="w-full accent-[#7a1f5c] cursor-pointer h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg"
                />
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Controls how many VBLANK frames previous pixel states linger before relaxing (`0%` = 1-frame decay, `100%` = maximum nematic persistence).
                </p>
              </div>
            </div>

            {/* Quick Response Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-500 mr-1">
                Response Profiles:
              </span>
              <button
                onClick={() => applyGhostingPreset(0.0, 0.0, false)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                  !system.accuracyFixes.stnGhostingAccurate || system.settings.ghosting === 0
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Off (0% / 0%)
              </button>
              <button
                onClick={() => applyGhostingPreset(0.25, 0.45, true)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                  system.accuracyFixes.stnGhostingAccurate &&
                  Math.abs(system.settings.ghosting - 0.25) < 0.02 &&
                  Math.abs(system.settings.ghostingPersistence - 0.45) < 0.02
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Subtle STN (25% / 45%)
              </button>
              <button
                onClick={() => applyGhostingPreset(0.40, 0.65, true)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                  system.accuracyFixes.stnGhostingAccurate &&
                  Math.abs(system.settings.ghosting - 0.40) < 0.02 &&
                  Math.abs(system.settings.ghostingPersistence - 0.65) < 0.02
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                1997 Hardware Matrix (40% / 65%)
              </button>
              <button
                onClick={() => applyGhostingPreset(0.75, 0.85, true)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                  system.accuracyFixes.stnGhostingAccurate &&
                  Math.abs(system.settings.ghosting - 0.75) < 0.02 &&
                  Math.abs(system.settings.ghostingPersistence - 0.85) < 0.02
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Heavy Passive Blur (75% / 85%)
              </button>
            </div>
          </div>

          {/* Hardware Accuracy Toggles */}
          <div className="space-y-3">
            {fixItems.map((item) => {
              const isEnabled = fixes[item.key];
              return (
                <div
                  key={item.key}
                  className={`p-3.5 rounded-xl border transition ${
                    isEnabled
                      ? 'bg-[#f8f9f5] dark:bg-zinc-900/90 border-zinc-300 dark:border-zinc-700/80'
                      : 'bg-zinc-100/70 dark:bg-zinc-950/60 border-zinc-200 dark:border-zinc-800/60 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 mt-0.5">
                        {item.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xs font-bold text-zinc-900 dark:text-white">{item.title}</h3>
                          <span
                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                              isEnabled
                                ? 'bg-[#4c5931]/15 text-[#4c5931] dark:text-[#b9c48a] border border-[#4c5931]/30'
                                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {isEnabled ? 'ACTIVE' : 'BYPASSED'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono mt-0.5">{item.subtitle}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleFix(item.key)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
                        isEnabled
                          ? 'bg-[#7a1f5c] hover:bg-[#8e256b] text-white'
                          : 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {isEnabled ? 'Enabled' : 'Enable'}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px] border-t border-zinc-200 dark:border-zinc-800/80 pt-2.5">
                    <div className="bg-white dark:bg-zinc-950/60 p-2 rounded border border-zinc-200 dark:border-zinc-800/60">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold block mb-0.5">Hardware Behavior:</span>
                      <span className="text-zinc-800 dark:text-zinc-300 leading-relaxed">{item.technicalProblem}</span>
                    </div>
                    <div className="bg-white dark:bg-zinc-950/60 p-2 rounded border border-zinc-200 dark:border-zinc-800/60">
                      <span className="text-[#4c5931] dark:text-[#b9c48a] font-semibold block mb-0.5">Implementation:</span>
                      <span className="text-zinc-800 dark:text-zinc-300 leading-relaxed">{item.ourFix}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[#4c5931] dark:text-[#b9c48a]">
            <CheckCircle2 className="w-4 h-4" />
            <span>Changes apply immediately to the live display and CPU core.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#7a1f5c] hover:bg-[#8e256b] text-white text-xs font-semibold transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
