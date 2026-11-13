import React, { useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import {
  Trophy,
  Trash2,
  X,
  Layers,
  Play,
  Download,
  Upload,
  HardDriveDownload,
  ShieldAlert,
  BookUser
} from 'lucide-react';

interface HighScoreVaultModalProps {
  system: GameComSystem;
  isOpen: boolean;
  onClose: () => void;
  onOpenInBios: () => void;
  onOpenPhoneBook?: () => void;
  onUpdated: () => void;
  onNotify?: (message: string, sub?: string, type?: 'success' | 'info' | 'error') => void;
}

export const HighScoreVaultModal: React.FC<HighScoreVaultModalProps> = ({
  system,
  isOpen,
  onClose,
  onOpenInBios,
  onOpenPhoneBook,
  onUpdated,
  onNotify
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const hs = system.highScores;
  const totalBanks = hs.getTotalBanks();
  const activeBank = hs.activeBank;
  const bankRecords = hs.records.slice(activeBank * 10, (activeBank + 1) * 10);

  const handleSelectBank = (bankIdx: number) => {
    hs.syncBankToNvram(system.cpu.nvram, bankIdx);
    onUpdated();
  };

  const handleDelete = (globalIdx: number) => {
    hs.deleteRecord(globalIdx, system.cpu.nvram);
    onUpdated();
  };

  const handleClearAll = () => {
    hs.clearAllData(system.cpu.nvram);
    onUpdated();
    onNotify?.('NVRAM Data Cleared', 'All high score slots ($FC60-$FEE1) have been emptied', 'info');
  };

  const handleExportJson = () => {
    const jsonStr = hs.exportVaultJson(system.cpu.nvram, system.phoneBook);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gamecom_nvram_vault_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(
      'Exported NVRAM Vault (.json)',
      `${hs.records.length} high score records + ${system.phoneBook.getTotalEntriesCount()} Phone Book contacts exported`,
      'success'
    );
  };

  const handleExportRawNvram = () => {
    const rawBytes = hs.exportRawNvramBinary(system.cpu.nvram, system.phoneBook);
    const blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gamecom_8k_${Date.now()}.nvram`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.('Exported Raw 8KB NVRAM (.nvram)', 'Saved 8,192-byte ($E000-$FFFF) battery-backed SRAM binary', 'success');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await hs.importDataFromFile(file, system.cpu.nvram, system.phoneBook);
      system.refreshBiosPhoneBookIfOpen();
      onUpdated();
      onNotify?.(
        `Imported ${res.format === 'json' ? 'JSON Vault' : '8KB NVRAM Binary'}`,
        `Loaded ${res.recordsCount} high score(s) & ${res.phoneBookCount} Phone Book contact(s)`,
        'success'
      );
    } catch (err) {
      onNotify?.('Failed to Import NVRAM Data', (err as Error).message, 'error');
    }
  };

  const handleTriggerBiosPrompt = () => {
    system.promptKeepClearData();
    onUpdated();
    onClose();
    onNotify?.(
      'BIOS Keep / Clear Prompt Triggered',
      'Press Button A (Keep Data) or Button B (Clear Data) on the console',
      'info'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Hidden file input for Import Data */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.nvram,.sav,.bin"
          onChange={handleImportFile}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                BIOS NVRAM Data &amp; High Score Vault ($E000–$FFFF)
                <span className="px-2 py-0.5 bg-amber-950 text-amber-300 text-[10px] font-mono rounded border border-amber-800">
                  UNLIMITED (&gt;10 ENTRIES)
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Import/Export 8KB NVRAM &amp; High Score banks · Starts clean with zero pre-populated scores
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

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Import / Export & BIOS Actions Bar */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Total Saved Games: <span className="text-amber-400 font-mono">{hs.records.length}</span> across{' '}
                  <span className="text-purple-400 font-mono">{totalBanks}</span> NVRAM Bank(s) (10 Hardware Slots / Bank)
                </p>
                <p className="text-slate-400">
                  Hardware high scores are stored at <code className="text-purple-300 font-mono">$FC60–$FEDF</code> (10 × 64-byte slots) and Solitaire at <code className="text-purple-300 font-mono">$FEE0–$FEE1</code>. The BIOS cold-boot Keep/Clear Data prompt is suppressed automatically unless triggered below.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onOpenPhoneBook && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenPhoneBook();
                    }}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <BookUser className="w-3.5 h-3.5" />
                    Phone Book Vault ($E000)
                  </button>
                )}
                <button
                  onClick={() => {
                    onOpenInBios();
                    onClose();
                  }}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  View on BIOS Screen
                </button>
              </div>
            </div>

            {/* Import / Export / Prompt Keep-Clear Toolbar */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-purple-950/90 hover:bg-purple-900 text-purple-200 text-xs font-semibold rounded-lg border border-purple-700/70 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Import JSON Vault Backup (.json) or Raw 8KB Battery NVRAM (.nvram / .sav / .bin)"
                >
                  <Upload className="w-3.5 h-3.5 text-purple-400" />
                  Import Data (.json / .nvram)
                </button>
                <button
                  onClick={handleExportJson}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Export Unlimited High Score Vault + 8KB NVRAM as JSON"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  Export Vault (.json)
                </button>
                <button
                  onClick={handleExportRawNvram}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Export raw 8,192-byte ($E000-$FFFF) battery-backed NVRAM binary"
                >
                  <HardDriveDownload className="w-3.5 h-3.5 text-blue-400" />
                  Export 8KB NVRAM (.nvram)
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleTriggerBiosPrompt}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium rounded-lg border border-amber-700/50 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Boot into the authentic BIOS 'DATA FOUND.. PRESS A TO KEEP / PRESS B TO CLEAR' screen"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  Prompt Keep/Clear Data
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900/70 text-red-200 text-xs font-medium rounded-lg border border-red-800/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Clear all saved high scores in Vault and NVRAM"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  Clear All Data
                </button>
              </div>
            </div>
          </div>

          {/* Bank Selector Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: totalBanks }).map((_, idx) => {
              const startNum = idx * 10 + 1;
              const endNum = (idx + 1) * 10;
              const countInBank = hs.records.slice(idx * 10, (idx + 1) * 10).length;
              const isSelected = activeBank === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectBank(idx)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-950/90 border-purple-500 text-white font-bold shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  BANK {idx + 1}: Slots #{startNum}–{endNum} ({countInBank}/10)
                </button>
              );
            })}
          </div>

          {/* 10 Hardware Slots Table for Active Bank */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
            <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
              <div className="col-span-2">Vault #</div>
              <div className="col-span-2">NVRAM Addr</div>
              <div className="col-span-2">Game ID</div>
              <div className="col-span-3">BIOS Game Title</div>
              <div className="col-span-2">Saved Score</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            <div className="divide-y divide-slate-800/70 text-xs font-mono">
              {Array.from({ length: 10 }).map((_, slotIdx) => {
                const rec = bankRecords[slotIdx];
                const globalIdx = activeBank * 10 + slotIdx;
                const nvramAddr = 0xfc60 + slotIdx * 0x40;
                return (
                  <div
                    key={slotIdx}
                    className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="col-span-2 text-slate-400">
                      #{globalIdx + 1} <span className="text-[10px] text-slate-600">(Slot {slotIdx})</span>
                    </div>
                    <div className="col-span-2 text-purple-400">
                      ${nvramAddr.toString(16).toUpperCase()}
                    </div>
                    {rec ? (
                      <>
                        <div className="col-span-2 text-slate-300">
                          ${rec.gameId.toString(16).padStart(4, '0').toUpperCase()}
                        </div>
                        <div className="col-span-3 font-bold text-white">{rec.title}</div>
                        <div className="col-span-2 text-amber-400 font-bold">{rec.scoreText}</div>
                        <div className="col-span-1 text-right">
                          <button
                            onClick={() => handleDelete(globalIdx)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete High Score Record"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-7 text-slate-600 italic">
                        [Empty 64-byte Hardware Slot — Play a Game or Import NVRAM Backup]
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
          <span>
            Built-in Solitaire Score ($FEE0): <strong className="text-white font-mono">{hs.solitaireScore}</strong> · Auto-saved to 8KB Battery NVRAM
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
