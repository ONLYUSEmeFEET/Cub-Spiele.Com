import React, { useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { Cpu, X, SkipForward, ShieldAlert, Lock, Unlock, Edit3 } from 'lucide-react';

interface DebuggerModalProps {
  system: GameComSystem;
  isOpen: boolean;
  onClose: () => void;
}

export const DebuggerModal: React.FC<DebuggerModalProps> = ({
  system,
  isOpen,
  onClose
}) => {
  const [memoryAddr, setMemoryAddr] = useState('01BC');
  const [pokeAddr, setPokeAddr] = useState('01BC');
  const [pokeVal, setPokeVal] = useState('05');
  const [, setRefreshKey] = useState(0);

  if (!isOpen) return null;

  const isHardcore = system.retroAchievements.config.hardcoreMode;
  const cpu = system.cpu;
  const pc = cpu.pc;
  const regs = cpu.getRegisters();

  const handleStep = () => {
    if (isHardcore) {
      system.onHardcoreViolation?.(
        'CPU single-stepping is prohibited in Hardcore Mode per RetroAchievements compliance rules.'
      );
      return;
    }
    system.retroAchievements.taintSession('debugger');
    cpu.step();
    setRefreshKey((k) => k + 1);
  };

  const handleApplyPoke = () => {
    const addr = parseInt(pokeAddr, 16);
    const val = parseInt(pokeVal, 16);
    if (Number.isNaN(addr) || Number.isNaN(val)) return;
    if (system.applyMemoryPoke(addr, val)) {
      setRefreshKey((k) => k + 1);
    }
  };

  const handleSwitchToCasual = () => {
    system.retroAchievements.disableHardcoreMidSession(
      'Switched to Casual Mode mid-session to unlock CPU Debugger & Memory Editor'
    );
    setRefreshKey((k) => k + 1);
  };

  // Generate disassembly lines around PC (only when not locked by Hardcore Mode)
  const disLines: Array<{ addr: number; text: string; hex: string; isCurrent: boolean }> = [];
  if (cpu && !isHardcore) {
    let curAddr = Math.max(0, pc - 8);
    for (let i = 0; i < 12; i++) {
      const dis = cpu.disassemble(curAddr);
      disLines.push({
        addr: curAddr,
        text: dis.text,
        hex: dis.hex,
        isCurrent: curAddr === pc
      });
      curAddr = (curAddr + dis.size) & 0xffff;
    }
  }

  // Parse memory view base
  const baseAddr = parseInt(memoryAddr, 16) || 0x0100;
  const hexRows: Array<{ addr: number; bytes: number[] }> = [];
  if (cpu && !isHardcore) {
    for (let row = 0; row < 8; row++) {
      const rowAddr = (baseAddr + row * 16) & 0xffff;
      const rowBytes: number[] = [];
      for (let col = 0; col < 16; col++) {
        rowBytes.push(cpu.readByte(rowAddr + col));
      }
      hexRows.push({ addr: rowAddr, bytes: rowBytes });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Sharp SM8521 CPU Debugger &amp; Memory Inspector</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${
                    isHardcore
                      ? 'bg-amber-950/90 border-amber-500/70 text-amber-300'
                      : 'bg-emerald-950/90 border-emerald-500/70 text-emerald-300'
                  }`}
                >
                  {isHardcore ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {isHardcore ? 'HARDCORE LOCKED' : 'CASUAL MODE UNLOCKED'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Live register view, instruction disassembler, 64KB memory map, and Casual Mode RAM Poke
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
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Section B Compliance Guard when Hardcore Mode is Active */}
          {isHardcore ? (
            <div className="p-6 bg-amber-950/30 border border-amber-500/60 rounded-xl space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-xl mx-auto">
                <h3 className="text-base font-bold text-white">
                  CPU Debugger, Memory Inspector &amp; Cheats Disabled in Hardcore Mode
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Per <strong>RetroAchievements Hardcore Compliance Requirements (Section B &amp; G)</strong>,
                  memory editors, live RAM inspection, cheats, and CPU single-stepping are strictly
                  disabled during Hardcore sessions. You may switch to <strong>Casual Mode</strong> mid-session
                  without resetting your game to use the debugger and RAM poke tools.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleSwitchToCasual}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition cursor-pointer"
                >
                  Switch to Casual Mode (Mid-Session) &amp; Unlock Debugger
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  Stay in Hardcore Mode
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Registers Bar */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">
                  CPU Registers &amp; Flags (Clock: 4.9152 MHz)
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 font-mono text-xs">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((rIdx) => {
                    const val = (regs as any)[`r${rIdx}`] || 0;
                    return (
                      <div key={rIdx} className="p-2 bg-slate-900 rounded border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">R{rIdx}</span>
                        <span className="font-bold text-white">
                          ${val.toString(16).padStart(2, '0').toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* PC, SP, Flags */}
                <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-800 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400 font-bold">PC:</span>
                    <span className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800 font-bold text-white">
                      ${regs.pc.toString(16).padStart(4, '0').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-bold">SP:</span>
                    <span className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800 font-bold text-white">
                      ${regs.sp.toString(16).padStart(4, '0').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Flags:</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.c ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-900 text-slate-600'}`}>C</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.z ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-900 text-slate-600'}`}>Z</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.s ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-900 text-slate-600'}`}>S</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.v ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-900 text-slate-600'}`}>V</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.i ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-900 text-slate-600'}`}>I</span>
                  </div>
                </div>
              </div>

              {/* Casual Mode Memory Poke / Cheat Byte Writer */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Edit3 className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="font-bold text-white">Casual Mode Memory Poke / Cheat Writer</span>
                    <span className="text-slate-400 block text-[11px]">
                      Write an 8-bit hex value to any SM8521 RAM ($0000-$03FF) or NVRAM ($E000-$FFFF) address
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-slate-400">Addr $</span>
                  <input
                    type="text"
                    value={pokeAddr}
                    onChange={(e) => setPokeAddr(e.target.value.slice(0, 4).toUpperCase())}
                    className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-center"
                    placeholder="01BC"
                  />
                  <span className="text-slate-400">Val $</span>
                  <input
                    type="text"
                    value={pokeVal}
                    onChange={(e) => setPokeVal(e.target.value.slice(0, 2).toUpperCase())}
                    className="w-12 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-center"
                    placeholder="05"
                  />
                  <button
                    onClick={handleApplyPoke}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded cursor-pointer"
                  >
                    Poke Byte
                  </button>
                </div>
              </div>

              {/* Disassembly & Execution Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Disassembler */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-mono font-bold text-slate-400 uppercase">
                      Instruction Disassembly
                    </h4>
                    {cpu && (
                      <button
                        onClick={handleStep}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        Step Instruction
                      </button>
                    )}
                  </div>

                  <div className="space-y-1 font-mono text-xs max-h-56 overflow-y-auto">
                    {disLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between px-2 py-1 rounded ${
                          line.isCurrent
                            ? 'bg-purple-950/70 border border-purple-500 text-white font-bold'
                            : 'text-slate-400 hover:bg-slate-900'
                        }`}
                      >
                        <span className="text-slate-500">
                          ${line.addr.toString(16).padStart(4, '0').toUpperCase()}
                        </span>
                        <span className="text-purple-300 font-semibold">{line.text}</span>
                        <span className="text-[10px] text-slate-600">{line.hex}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Memory Hex Viewer */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-mono font-bold text-slate-400 uppercase">
                      Memory Hex Viewer
                    </h4>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-slate-500">$</span>
                      <input
                        type="text"
                        value={memoryAddr}
                        onChange={(e) => setMemoryAddr(e.target.value.slice(0, 4))}
                        className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-white uppercase text-center"
                        placeholder="01BC"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 font-mono text-[11px] max-h-56 overflow-y-auto">
                    {hexRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-slate-300">
                        <span className="text-slate-600">
                          ${row.addr.toString(16).padStart(4, '0').toUpperCase()}:
                        </span>
                        <div className="grid grid-cols-8 sm:grid-cols-16 gap-1 flex-1 text-slate-400">
                          {row.bytes.map((b, bIdx) => (
                            <span key={bIdx} className="hover:text-white">
                              {b.toString(16).padStart(2, '0').toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
          <span>
            rcheevos Banks: Bank 0 ($0000-$03FF RAM) · Bank 1 ($E000-$FFFF NVRAM) · Bank 2 ($A000-$DFFF VRAM)
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
