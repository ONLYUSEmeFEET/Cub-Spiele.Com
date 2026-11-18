import React, { useState } from 'react';
import { X, Info, Users, Scale, ExternalLink, Cpu } from 'lucide-react';
import { APP_VERSION_TAG } from '../version';
import { GameComLogo } from './GameComLogo';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AboutTab = 'overview' | 'credits' | 'license';

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<AboutTab>('overview');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh] text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#7a1f5c]/15 text-[#7a1f5c] dark:text-[#eab5d8]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                  About Cub Spiele.Com
                </h2>
                <GameComLogo className="h-3.5 w-auto opacity-85" fill="currentColor" dotFill="#be123c" />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                {APP_VERSION_TAG} · Sharp SM8521 Handheld Emulator · MIT License
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close About dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="px-6 pt-3 pb-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#7a1f5c] text-white'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('credits')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'credits'
                ? 'bg-[#7a1f5c] text-white'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Credits</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('license')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'license'
                ? 'bg-[#7a1f5c] text-white'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>License</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm leading-relaxed">
          {activeTab === 'overview' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1.5">
                  Project Summary
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  <strong>Cub Spiele.Com</strong> is an independent, cycle-accurate standalone
                  emulator for the 1997 <strong>Tiger Electronics Game.Com</strong> handheld
                  console built around the <strong>Sharp SM8521</strong> 8/16-bit microcontroller
                  architecture. Designed for Windows, macOS, Android, and modern web browsers, it
                  focuses on hardware accuracy, responsive touch/desktop ergonomics, and cartridge
                  preservation.
                </p>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2.5">
                  Emulated Hardware & Features
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">CPU Architecture</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                      Sharp SM8521 @ 4.9152 MHz
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Display Pipeline</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                      200×160 · 2-bpp STN LCD + Ghosting
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Audio Synthesis</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                      SGDA ($004E) DAC · SG0/SG1/SG2
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Supported ROM Formats</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                      .bin · .tgc · .rom · .zip
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Touchscreen & Input</dt>
                    <dd className="text-zinc-900 dark:text-zinc-100">
                      13×10 Resistive Matrix · Dual-Slot P3 Bus
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Persistent Storage</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                      8KB NVRAM ($FC60–$FEDF High Scores)
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-zinc-600 dark:text-zinc-400">
                  <span>Author: </span>
                  <strong className="text-zinc-900 dark:text-zinc-100">AJ Ryan</strong>
                  <span> · @ONLYUSEmeFEET</span>
                </div>
                <a
                  href="https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#7a1f5c] dark:text-[#eab5d8] hover:underline font-medium"
                >
                  <span>GitHub Repository</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </>
          )}

          {activeTab === 'credits' && (
            <div className="space-y-5 text-xs">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                  Author & Lead Developer
                </h3>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  AJ Ryan (@ONLYUSEmeFEET) — Architecture, SM8521 Core, Audio/LCD Engine & Desktop/Touch UI
                </p>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                  Historical Preservation & Community Archives
                </h3>
                <div className="space-y-2">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Diskman (Brandon Cobb) — &ldquo;Diskman Presents / The end of the game.com&rdquo;
                      </span>
                      <a
                        href="https://www.diskman.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#7a1f5c] dark:text-[#eab5d8] hover:underline"
                      >
                        <span>diskman.com</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                      Historical Tiger Game.Com preservation archive documenting hardware specifications,
                      commercial and unreleased prototype releases, scans, developer interviews, music
                      rips, and archival resources.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                  Hardware & Emulation References
                </h3>
                <ul className="space-y-2 text-zinc-600 dark:text-zinc-400">
                  <li>
                    <strong className="text-zinc-900 dark:text-zinc-100">Sharp Corporation</strong> — Sharp
                    SM8521 8/16-Bit Single-Chip Microcomputer Datasheet & Instruction Set Manual.
                  </li>
                  <li>
                    <strong className="text-zinc-900 dark:text-zinc-100">Tiger Electronics, Inc. (1997)</strong> —
                    Creator of the Tiger Game.Com handheld console, BIOS, dual-cartridge Port 3 bus
                    isolation, NVRAM High Score format, Tiger Web Link, and Game.Com Modem hardware.
                  </li>
                  <li>
                    <strong className="text-zinc-900 dark:text-zinc-100">MiSTer FPGA Core Developers</strong>{' '}
                    (<span className="font-mono">MiSTer-devel/GameCom_MiSTer</span>) — FPGA hardware
                    research for SG0/SG1 wavetable &amp; SG2 LFSR audio, HALT/DMA preemption, and
                    LCDC timing/inversion behavior.
                  </li>
                  <li>
                    <strong className="text-zinc-900 dark:text-zinc-100">MAME Project</strong> (Wilbert Pol,
                    Robbbert, MAMEdev) — <span className="font-mono">gamecom.cpp</span> &{' '}
                    <span className="font-mono">sm8500</span> historical hardware documentation.
                  </li>
                  <li>
                    <strong className="text-zinc-900 dark:text-zinc-100">mGBA Project</strong> — Standalone
                    handheld menu bar, integer scaling, and multi-window ergonomics inspiration.
                  </li>
                </ul>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                  Open-Source Libraries & Technologies
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  React · TypeScript · Vite · Electron · Tailwind CSS · Lucide Icons · Motion · fflate
                  (ZIP extraction & bundling) · Express · Web Audio API · HTML5 Canvas 2D · BroadcastChannel
                  API · Web Gamepad API · Python 3 Standard Library.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'license' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
{`MIT License

Copyright (c) 2026 AJ Ryan (@ONLYUSEmeFEET)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
              </div>

              <div className="space-y-2 text-zinc-600 dark:text-zinc-400 leading-relaxed">
                <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Third-Party Open-Source & Hardware Attribution Notice
                </h4>
                <p>
                  &ldquo;Game.Com&rdquo; and &ldquo;Tiger Electronics&rdquo; are registered trademarks
                  of Tiger Electronics, Ltd. / Hasbro, Inc. &ldquo;SM8521&rdquo; is a trademark of
                  Sharp Corporation. Cub Spiele.Com is an independent hardware preservation and
                  emulation project and is not affiliated with, endorsed by, or sponsored by Tiger
                  Electronics, Hasbro, Inc., or Sharp Corporation.
                </p>
                <p>
                  Full third-party dependency licenses and archival attributions are documented in{' '}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">credits.txt</span> and{' '}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">LICENSE</span>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
          <span>Cub Spiele.Com {APP_VERSION_TAG}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
