import React, { useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { Cpu, X, Play, SkipForward, RotateCcw, Search } from 'lucide-react';

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
  const [memoryAddr, setMemoryAddr] = useState('8000');
  const [, setRefreshKey] = useState(0);

  if (!isOpen) return null;

  // Inspect the live Sharp SM8521 hardware CPU
  const cpu = system.cpu;
  const pc = cpu.pc;
  const sp = cpu.sp;
  const regs = cpu.getRegisters();

  const handleStep = () => {
    cpu.step();
    setRefreshKey(k => k + 1);
  };

  // Generate disassembly lines around PC
  const disLines: Array<{ addr: number; text: string; hex: string; isCurrent: boolean }> = [];
  if (cpu) {
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
  const baseAddr = parseInt(memoryAddr, 16) || 0x8000;
  const hexRows: Array<{ addr: number; bytes: number[] }> = [];
  if (cpu) {
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
              <h2 className="text-lg font-bold text-white tracking-tight">
                Sharp SM8521 CPU Architecture & Memory Debugger
              </h2>
              <p className="text-xs text-slate-400">
                Live register view, instruction disassembler, and 64KB memory map
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
          {/* Registers Bar */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">
              CPU Registers & Flags (Clock: 4.9152 MHz)
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
                    Step
                  </button>
                )}
              </div>

              <div className="space-y-1 font-mono text-xs max-h-56 overflow-y-auto">
                {disLines.length > 0 ? (
                  disLines.map((line, idx) => (
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
                  ))
                ) : (
                  <div className="py-6 text-center text-slate-500 text-xs">
                    Booting active cartridge engine...
                  </div>
                )}
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
                    placeholder="8000"
                  />
                </div>
              </div>

              <div className="space-y-1 font-mono text-[11px] max-h-56 overflow-y-auto">
                {hexRows.length > 0 ? (
                  hexRows.map((row, idx) => (
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
                  ))
                ) : (
                  <div className="py-6 text-center text-slate-500 text-xs">
                    Memory bus active. Enter address above to inspect.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
          <span>Memory regions: $0000-$03FF RAM · $4000-$5FFF VRAM · $8000-$BFFF ROM Bank</span>
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
