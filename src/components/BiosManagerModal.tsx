import React, { useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { ShieldCheck, Upload, X, CheckCircle2, RotateCcw, FileText, Cpu, HardDrive } from 'lucide-react';

interface BiosManagerModalProps {
  system: GameComSystem;
  isOpen: boolean;
  onClose: () => void;
  onBiosUpdated: () => void;
}

export const BiosManagerModal: React.FC<BiosManagerModalProps> = ({
  system,
  isOpen,
  onClose,
  onBiosUpdated
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const biosInfo = system.bios.getBiosInfo();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await system.loadBiosFile(file);
        onBiosUpdated();
      } catch (err) {
        console.error((err as Error).message);
      }
      e.target.value = '';
    }
  };

  const handleResetToOfficial = () => {
    system.bios.initOfficialBios();
    system.resetSystem('MAIN_MENU');
    onBiosUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Official Tiger Game.Com BIOS
                <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-[10px] font-mono rounded border border-emerald-800">
                  AUTHENTIC
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Hardware microcode, interrupt vectors ($0400), and system OS firmware
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
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active Firmware Status Banner */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80 ring-2 ring-emerald-400/20" />
              <div>
                <span className="text-xs font-bold text-white block">
                  {biosInfo.version}
                </span>
                <span className="text-xs text-slate-400">
                  {biosInfo.source === 'official_tosec_archive'
                    ? 'Verified from Tiger_Game_Com_TOSEC_2012_04_23 archive (Archive.org)'
                    : 'Custom user-uploaded BIOS image active'}
                </span>
              </div>
            </div>
            <button
              onClick={handleResetToOfficial}
              className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset TOSEC Official
            </button>
          </div>

          {/* BIOS ROM Partitions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Internal BIOS */}
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-purple-400 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4" /> internal.bin
                </span>
                <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-300 rounded font-mono text-[10px]">
                  ACTIVE
                </span>
              </div>
              <p className="text-slate-300 text-[11px] mb-2">
                4KB Sharp SM8521 on-chip microcode, system reset vector ($0400), and hardware register initialization.
              </p>
              <div className="font-mono text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                CRC32: <span className="text-white">{biosInfo.internalCrc}</span>
              </div>
            </div>

            {/* External BIOS */}
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-blue-400 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4" /> external.bin
                </span>
                <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-300 rounded font-mono text-[10px]">
                  ACTIVE
                </span>
              </div>
              <p className="text-slate-300 text-[11px] mb-2">
                256KB Game.Com OS firmware containing Main Menu, Solitaire, High Score Vault, Calculator, and Phone Book.
              </p>
              <div className="font-mono text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                CRC32: <span className="text-white">{biosInfo.externalCrc}</span>
              </div>
            </div>
          </div>

          {/* Boot Target Selector */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
            <h4 className="text-xs font-bold text-white mb-2">Boot Sequence Preference</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  system.bios.bootTarget = 'auto_cartridge';
                  system.resetSystem('CART_1');
                  onBiosUpdated();
                }}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                  system.bios.bootTarget === 'auto_cartridge'
                    ? 'bg-purple-950/70 border-purple-500 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Auto-Boot Cartridge
                <span className="block text-[11px] font-normal text-slate-400 mt-0.5">
                  Boots directly to Cartridge Slot 1 through the official BIOS
                </span>
              </button>

              <button
                onClick={() => {
                  system.bios.bootTarget = 'os_menu';
                  system.resetSystem('MAIN_MENU');
                  onBiosUpdated();
                }}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                  system.bios.bootTarget === 'os_menu'
                    ? 'bg-purple-950/70 border-purple-500 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Boot to OS Main Menu
                <span className="block text-[11px] font-normal text-slate-400 mt-0.5">
                  Displays the authentic 6-icon Game.Com BIOS Main Menu
                </span>
              </button>
            </div>
          </div>

          {/* Custom BIOS Upload */}
          <div className="p-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin,.rom,.zip"
              onChange={handleFileUpload}
              className="hidden"
            />
            <p className="text-xs text-white font-semibold mb-1">
              Upload Custom Official BIOS File
            </p>
            <p className="text-[11px] text-slate-400 mb-3 max-w-sm">
              Accepts internal.bin, external.bin, or official MAME gamecom.zip archive
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Select BIOS File
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
          <span>Official Reset Vector at $0400 · VBLANK Interrupt Vector at $040C</span>
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
