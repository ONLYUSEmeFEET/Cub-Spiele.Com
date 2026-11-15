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
    system.resetSystem(system.settings.fastBoot ? 'MAIN_MENU' : 'NONE');
    onBiosUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#4e3d73]/15 dark:bg-[#4e3d73]/30 rounded-lg text-[#4e3d73] dark:text-[#c4b5e6]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
                Official Tiger Game.Com BIOS
                <span className="px-2 py-0.5 bg-[#4c5931]/15 dark:bg-[#4c5931]/30 text-[#4c5931] dark:text-[#b9c48a] text-[10px] font-mono rounded border border-[#4c5931]/40">
                  AUTHENTIC
                </span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Hardware microcode, interrupt vectors ($0400), and system OS firmware
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
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active Firmware Status Banner */}
          <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#4c5931] dark:bg-[#b9c48a] ring-2 ring-[#4c5931]/25 dark:ring-[#b9c48a]/25 shrink-0" />
              <div>
                <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                  {biosInfo.version}
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {biosInfo.source === 'official_tosec_archive'
                    ? 'Verified from Tiger_Game_Com_TOSEC_2012_04_23 archive (Archive.org)'
                    : 'Custom user-uploaded BIOS image active'}
                </span>
              </div>
            </div>
            <button
              onClick={handleResetToOfficial}
              className="px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg border border-zinc-300 dark:border-zinc-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset TOSEC Official
            </button>
          </div>

          {/* BIOS ROM Partitions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Internal BIOS */}
            <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-[#7a1f5c] dark:text-[#d974b8] flex items-center gap-1.5">
                  <Cpu className="w-4 h-4" /> internal.bin
                </span>
                <span className="px-1.5 py-0.5 bg-[#4c5931]/15 dark:bg-[#4c5931]/30 text-[#4c5931] dark:text-[#b9c48a] rounded font-mono text-[10px]">
                  ACTIVE
                </span>
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 text-[11px] mb-2">
                4KB Sharp SM8521 on-chip microcode, system reset vector ($0400), and hardware register initialization.
              </p>
              <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
                CRC32: <span className="text-zinc-900 dark:text-white">{biosInfo.internalCrc}</span>
              </div>
            </div>

            {/* External BIOS */}
            <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-[#4e3d73] dark:text-[#b39ddb] flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4" /> external.bin
                </span>
                <span className="px-1.5 py-0.5 bg-[#4c5931]/15 dark:bg-[#4c5931]/30 text-[#4c5931] dark:text-[#b9c48a] rounded font-mono text-[10px]">
                  ACTIVE
                </span>
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 text-[11px] mb-2">
                256KB Game.Com OS firmware containing Main Menu, Solitaire, High Score Vault, Calculator, and Phone Book.
              </p>
              <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
                CRC32: <span className="text-zinc-900 dark:text-white">{biosInfo.externalCrc}</span>
              </div>
            </div>
          </div>

          {/* Boot Target Selector */}
          <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white mb-2">Boot Sequence Preference</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  system.bios.bootTarget = 'auto_cartridge';
                  system.resetSystem(system.settings.fastBoot ? 'CART_1' : 'NONE');
                  onBiosUpdated();
                }}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                  system.bios.bootTarget === 'auto_cartridge'
                    ? 'bg-[#7a1f5c]/10 dark:bg-[#7a1f5c]/30 border-[#7a1f5c] text-zinc-900 dark:text-white font-bold'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Auto-Boot Cartridge
                <span className="block text-[11px] font-normal text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Boots directly to Cartridge Slot 1 through the official BIOS
                </span>
              </button>

              <button
                onClick={() => {
                  system.bios.bootTarget = 'os_menu';
                  system.resetSystem(system.settings.fastBoot ? 'MAIN_MENU' : 'NONE');
                  onBiosUpdated();
                }}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                  system.bios.bootTarget === 'os_menu'
                    ? 'bg-[#7a1f5c]/10 dark:bg-[#7a1f5c]/30 border-[#7a1f5c] text-zinc-900 dark:text-white font-bold'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Boot to OS Main Menu
                <span className="block text-[11px] font-normal text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Displays the authentic 6-icon Game.Com BIOS Main Menu
                </span>
              </button>
            </div>
          </div>

          {/* Custom BIOS Upload */}
          <div className="p-4 bg-[#f6f7f3]/70 dark:bg-zinc-950/40 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin,.rom,.zip"
              onChange={handleFileUpload}
              className="hidden"
            />
            <p className="text-xs text-zinc-900 dark:text-white font-semibold mb-1">
              Upload Custom Official BIOS File
            </p>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-3 max-w-sm">
              Accepts internal.bin, external.bin, or a zipped BIOS archive (.zip)
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-[#4e3d73] hover:bg-[#5d4a8a] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Select BIOS File
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950/70 text-xs text-zinc-600 dark:text-zinc-400">
          <span>Official Reset Vector at $0400 · VBLANK Interrupt Vector at $040C</span>
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
