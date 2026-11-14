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
        'CPU single-stepping is prohibited in Hardcore Mode to protect competitive integrity.'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#4e3d73]/15 dark:bg-[#4e3d73]/30 rounded-lg text-[#4e3d73] dark:text-[#c4b5e6]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
                <span>Sharp SM8521 CPU Debugger &amp; Memory Inspector</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${
                    isHardcore
                      ? 'bg-amber-100 dark:bg-amber-950/90 border-amber-400 dark:border-amber-500/70 text-amber-800 dark:text-amber-300'
                      : 'bg-[#4c5931]/15 dark:bg-[#4c5931]/30 border-[#4c5931]/40 text-[#4c5931] dark:text-[#b9c48a]'
                  }`}
                >
                  {isHardcore ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {isHardcore ? 'HARDCORE LOCKED' : 'CASUAL MODE UNLOCKED'}
                </span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Live register view, instruction disassembler, 64KB memory map, and Casual Mode RAM Poke
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Compliance Guard when Hardcore Mode is Active */}
          {isHardcore ? (
            <div className="p-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-400 dark:border-amber-500/60 rounded-xl space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-xl mx-auto">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  CPU Debugger, Memory Inspector &amp; Cheats Disabled in Hardcore Mode
                </h3>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Per <strong>Competitive Hardcore Mode rules</strong>,
                  memory editors, live RAM inspection, cheats, and CPU single-stepping are strictly
                  disabled during Hardcore sessions. You may switch to <strong>Casual Mode</strong> mid-session
                  without resetting your game to use the debugger and RAM poke tools.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                <button
                  onClick={handleSwitchToCasual}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-lg transition cursor-pointer"
                >
                  Switch to Casual Mode (Mid-Session) &amp; Unlock Debugger
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  Stay in Hardcore Mode
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Registers Bar */}
              <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <h3 className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-3">
                  CPU Registers &amp; Flags (Clock: 4.9152 MHz)
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 font-mono text-xs">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((rIdx) => {
                    const val = (regs as any)[`r${rIdx}`] || 0;
                    return (
                      <div key={rIdx} className="p-2 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800">
                        <span className="text-zinc-500 block text-[10px]">R{rIdx}</span>
                        <span className="font-bold text-zinc-900 dark:text-white">
                          ${val.toString(16).padStart(2, '0').toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* PC, SP, Flags */}
                <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-[#7a1f5c] dark:text-[#d974b8] font-bold">PC:</span>
                    <span className="px-2 py-0.5 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 font-bold text-zinc-900 dark:text-white">
                      ${regs.pc.toString(16).padStart(4, '0').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#4e3d73] dark:text-[#b39ddb] font-bold">SP:</span>
                    <span className="px-2 py-0.5 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 font-bold text-zinc-900 dark:text-white">
                      ${regs.sp.toString(16).padStart(4, '0').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Flags:</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.c ? 'bg-[#4c5931] text-white dark:text-[#b9c48a]' : 'bg-zinc-200 dark:bg-zinc-900 text-zinc-500'}`}>C</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.z ? 'bg-[#4c5931] text-white dark:text-[#b9c48a]' : 'bg-zinc-200 dark:bg-zinc-900 text-zinc-500'}`}>Z</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.s ? 'bg-[#4c5931] text-white dark:text-[#b9c48a]' : 'bg-zinc-200 dark:bg-zinc-900 text-zinc-500'}`}>S</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.v ? 'bg-[#4c5931] text-white dark:text-[#b9c48a]' : 'bg-zinc-200 dark:bg-zinc-900 text-zinc-500'}`}>V</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${regs.flags.i ? 'bg-[#4c5931] text-white dark:text-[#b9c48a]' : 'bg-zinc-200 dark:bg-zinc-900 text-zinc-500'}`}>I</span>
                  </div>
                </div>
              </div>

              {/* Casual Mode Memory Poke / Cheat Byte Writer */}
              <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Edit3 className="w-4 h-4 text-[#4c5931] dark:text-[#b9c48a]" />
                  <div>
                    <span className="font-bold text-zinc-900 dark:text-white">Casual Mode Memory Poke / Cheat Writer</span>
                    <span className="text-zinc-600 dark:text-zinc-400 block text-[11px]">
                      Write an 8-bit hex value to any SM8521 RAM ($0000-$03FF) or NVRAM ($E000-$FFFF) address
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">Addr $</span>
                  <input
                    type="text"
                    value={pokeAddr}
                    onChange={(e) => setPokeAddr(e.target.value.slice(0, 4).toUpperCase())}
                    className="w-16 px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-white text-center"
                    placeholder="01BC"
                  />
                  <span className="text-zinc-600 dark:text-zinc-400">Val $</span>
                  <input
                    type="text"
                    value={pokeVal}
                    onChange={(e) => setPokeVal(e.target.value.slice(0, 2).toUpperCase())}
                    className="w-12 px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-white text-center"
                    placeholder="05"
                  />
                  <button
                    onClick={handleApplyPoke}
                    className="px-3 py-1 bg-[#7a1f5c] hover:bg-[#8e256b] text-white font-bold rounded cursor-pointer"
                  >
                    Poke Byte
                  </button>
                </div>
              </div>

              {/* Disassembly & Execution Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Disassembler */}
                <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400 uppercase">
                      Instruction Disassembly
                    </h4>
                    {cpu && (
                      <button
                        onClick={handleStep}
                        className="px-2.5 py-1 bg-[#4e3d73] hover:bg-[#5e4a8a] text-white rounded text-xs font-medium flex items-center gap-1 cursor-pointer"
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
                            ? 'bg-[#7a1f5c]/15 dark:bg-[#7a1f5c]/40 border border-[#7a1f5c] text-zinc-900 dark:text-white font-bold'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-900'
                        }`}
                      >
                        <span className="text-zinc-500">
                          ${line.addr.toString(16).padStart(4, '0').toUpperCase()}
                        </span>
                        <span className="text-[#4e3d73] dark:text-[#c4b5e6] font-semibold">{line.text}</span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-600">{line.hex}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Memory Hex Viewer */}
                <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400 uppercase">
                      Memory Hex Viewer
                    </h4>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-zinc-500">$</span>
                      <input
                        type="text"
                        value={memoryAddr}
                        onChange={(e) => setMemoryAddr(e.target.value.slice(0, 4))}
                        className="w-16 px-1.5 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-xs font-mono text-zinc-900 dark:text-white uppercase text-center"
                        placeholder="01BC"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 font-mono text-[11px] max-h-56 overflow-y-auto">
                    {hexRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <span className="text-zinc-500">
                          ${row.addr.toString(16).padStart(4, '0').toUpperCase()}:
                        </span>
                        <div className="grid grid-cols-8 sm:grid-cols-16 gap-1 flex-1 text-zinc-700 dark:text-zinc-400">
                          {row.bytes.map((b, bIdx) => (
                            <span key={bIdx} className="hover:text-zinc-950 dark:hover:text-white">
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
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950/70 text-xs text-zinc-600 dark:text-zinc-400">
          <span>
            Hardware Banks: Bank 0 ($0000-$03FF RAM) · Bank 1 ($E000-$FFFF NVRAM) · Bank 2 ($A000-$DFFF VRAM)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#7a1f5c] hover:bg-[#8e256b] text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
