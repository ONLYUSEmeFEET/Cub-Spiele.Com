import React, { useState, useRef, useMemo } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import {
  NvramPhoneBookManager,
  PhoneBookEntry,
  PHONEBOOK_ENTRIES_PER_BANK
} from '../emulator/nvramPhoneBook';
import {
  BookUser,
  Plus,
  Trash2,
  X,
  Play,
  Download,
  Upload,
  HardDriveDownload,
  Star,
  Pencil,
  Search,
  Layers,
  Check
} from 'lucide-react';

interface PhoneBookModalProps {
  system: GameComSystem;
  isOpen: boolean;
  onClose: () => void;
  onOpenInBios: () => void;
  onUpdated: () => void;
  onNotify?: (message: string) => void;
}

export const PhoneBookModal: React.FC<PhoneBookModalProps> = ({
  system,
  isOpen,
  onClose,
  onOpenInBios,
  onUpdated,
  onNotify
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Add / Edit Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [marked, setMarked] = useState(false);
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const pb = system.phoneBook;
  const totalBanks = pb.getTotalBanks();
  const activeBank = pb.activeBank;
  const totalEntriesAllBanks = pb.getTotalEntriesCount();
  const hwLayout = pb.getActiveBankHardwareLayout();

  // Compute live encoded record byte size for current form inputs
  const previewRecordBytes = useMemo(() => {
    const sample: PhoneBookEntry = {
      id: 'preview',
      name: name.trim() || 'NAME',
      marked,
      phone,
      addressLine1,
      addressLine2,
      note,
      updatedAt: 0
    };
    return NvramPhoneBookManager.encodeRecord(sample).length;
  }, [name, marked, phone, addressLine1, addressLine2, note]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setMarked(false);
    setPhone('');
    setAddressLine1('');
    setAddressLine2('');
    setNote('');
    setFormError(null);
  };

  const handleStartEdit = (entry: PhoneBookEntry) => {
    setEditingId(entry.id);
    setName(entry.name);
    setMarked(entry.marked);
    setPhone(entry.phone);
    setAddressLine1(entry.addressLine1);
    setAddressLine2(entry.addressLine2);
    setNote(entry.note);
    setFormError(null);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    try {
      if (editingId) {
        const updated = pb.updateEntry(
          editingId,
          { name, marked, phone, addressLine1, addressLine2, note },
          system.cpu.nvram
        );
        system.refreshBiosPhoneBookIfOpen();
        onUpdated();
        if (updated) {
          onNotify?.(`Updated "${updated.name}" in Phone Book Bank ${pb.activeBank + 1}`);
        }
        resetForm();
      } else {
        const res = pb.addEntry(
          { name, marked, phone, addressLine1, addressLine2, note },
          system.cpu.nvram
        );
        system.refreshBiosPhoneBookIfOpen();
        onUpdated();
        onNotify?.(
          `Added "${res.entry.name}" to Phone Book Bank ${res.bankIndex + 1} ($E000-$F3FB)`
        );
        resetForm();
      }
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const handleSelectBank = (bankIdx: number) => {
    pb.syncBankToNvram(system.cpu.nvram, bankIdx);
    system.refreshBiosPhoneBookIfOpen();
    resetForm();
    onUpdated();
  };

  const handleCreateBank = () => {
    const newIdx = pb.createNewBank(system.cpu.nvram);
    system.refreshBiosPhoneBookIfOpen();
    resetForm();
    onUpdated();
    onNotify?.(`Created Phone Book Bank ${newIdx + 1}`);
  };

  const handleToggleMark = (entry: PhoneBookEntry) => {
    pb.toggleEntryMark(entry.id, system.cpu.nvram);
    system.refreshBiosPhoneBookIfOpen();
    onUpdated();
  };

  const handleDeleteEntry = (entry: PhoneBookEntry) => {
    if (editingId === entry.id) {
      resetForm();
    }
    pb.deleteEntry(entry.id, system.cpu.nvram);
    system.refreshBiosPhoneBookIfOpen();
    onUpdated();
    onNotify?.(`Removed "${entry.name}" from Phone Book`);
  };

  const handleClearAll = () => {
    resetForm();
    pb.clearAllEntries(system.cpu.nvram);
    system.refreshBiosPhoneBookIfOpen();
    onUpdated();
    onNotify?.('Cleared all Phone Book entries ($E000-$F3FB)');
  };

  const handleExportPhoneBookJson = () => {
    const jsonStr = pb.exportPhoneBookJson(system.cpu.nvram);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cub_spiele_phonebook_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(`Exported ${pb.getTotalEntriesCount()} Phone Book contact(s) (.json)`);
  };

  const handleExportRawNvram = () => {
    const rawBytes = system.highScores.exportRawNvramBinary(system.cpu.nvram, pb);
    const blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gamecom_8k_${Date.now()}.nvram`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.('Exported Raw 8KB NVRAM (.nvram) with Phone Book & High Scores');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await system.highScores.importDataFromFile(file, system.cpu.nvram, pb);
      system.refreshBiosPhoneBookIfOpen();
      onUpdated();
      onNotify?.(
        `Imported ${res.phoneBookCount} Phone Book contact(s) (${res.format.toUpperCase()})`
      );
    } catch (err) {
      setFormError(`Import failed: ${(err as Error).message}`);
    }
  };

  const filteredRecords = hwLayout.records.filter(({ entry }) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      entry.name.toLowerCase().includes(q) ||
      entry.phone.toLowerCase().includes(q) ||
      entry.addressLine1.toLowerCase().includes(q) ||
      entry.addressLine2.toLowerCase().includes(q) ||
      entry.note.toLowerCase().includes(q)
    );
  });

  const usagePercent = Math.min(
    100,
    Math.round((hwLayout.usedBytes / hwLayout.totalPartitionBytes) * 100)
  );
  const terminatorAddr = 0xe000 + hwLayout.usedBytes - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Hidden File Input for Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.nvram,.sav,.bin"
          onChange={handleImportFile}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#4c5931]/15 dark:bg-[#4c5931]/30 rounded-lg text-[#4c5931] dark:text-[#b9c48a]">
              <BookUser className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
                Expanded BIOS Phone Book Vault ($E000–$F3FF)
                <span className="px-2 py-0.5 bg-[#4c5931]/15 dark:bg-[#4c5931]/30 text-[#4c5931] dark:text-[#b9c48a] text-[10px] font-mono rounded border border-[#4c5931]/40">
                  UNLIMITED BANKS · CYCLE-ACCURATE
                </span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Add &amp; edit Game.Com Phone Book contacts from the frontend · Encoded directly into hardware NVRAM ($E003–$F3FB)
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

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Top Status & Actions Bar */}
          <div className="p-4 bg-[#f6f7f3] dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
                <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#4c5931] dark:text-[#b9c48a]" />
                  Total Contacts: <span className="text-[#4c5931] dark:text-[#b9c48a] font-mono">{totalEntriesAllBanks}</span> across{' '}
                  <span className="text-[#7a1f5c] dark:text-[#d974b8] font-mono">{totalBanks}</span> Phone Book Bank(s) (Up to{' '}
                  {PHONEBOOK_ENTRIES_PER_BANK} Contacts / Bank)
                </p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Active Bank {activeBank + 1} uses{' '}
                  <code className="text-[#4c5931] dark:text-[#b9c48a] font-mono">
                    {hwLayout.usedBytes} / {hwLayout.totalPartitionBytes} bytes ({usagePercent}%)
                  </code>{' '}
                  in <code className="text-[#4e3d73] dark:text-[#b39ddb] font-mono">$E000–$F3FB</code> · End Marker{' '}
                  <code className="text-amber-700 dark:text-amber-300 font-mono">0xFF</code> at{' '}
                  <code className="text-amber-700 dark:text-amber-300 font-mono">${terminatorAddr.toString(16).toUpperCase()}</code>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    onOpenInBios();
                    onClose();
                  }}
                  className="px-3.5 py-2 bg-[#4c5931] hover:bg-[#5c6b3d] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Open Phone Book on BIOS Screen
                </button>
              </div>
            </div>

            {/* Hardware NVRAM Partition Capacity Bar */}
            <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-900 rounded-full overflow-hidden border border-zinc-300 dark:border-zinc-800">
              <div
                className="h-full bg-[#4c5931] dark:bg-[#b9c48a] transition-all duration-300"
                style={{ width: `${Math.max(1, usagePercent)}%` }}
              />
            </div>

            {/* Import / Export / Clear Toolbar */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#4e3d73]/15 dark:bg-[#4e3d73]/40 hover:bg-[#4e3d73]/25 text-[#4e3d73] dark:text-[#c4b5e6] text-xs font-semibold rounded-lg border border-[#4e3d73]/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Import Phone Book JSON (.json) or Raw 8KB Battery NVRAM (.nvram / .sav / .bin)"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import (.json / .nvram)
                </button>
                <button
                  onClick={handleExportPhoneBookJson}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Export all Unlimited Phone Book Banks as JSON"
                >
                  <Download className="w-3.5 h-3.5 text-[#4c5931] dark:text-[#b9c48a]" />
                  Export Phone Book (.json)
                </button>
                <button
                  onClick={handleExportRawNvram}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Export raw 8,192-byte ($E000-$FFFF) battery-backed NVRAM binary"
                >
                  <HardDriveDownload className="w-3.5 h-3.5 text-[#4e3d73] dark:text-[#b39ddb]" />
                  Export 8KB NVRAM (.nvram)
                </button>
              </div>

              <button
                onClick={handleClearAll}
                disabled={totalEntriesAllBanks === 0}
                className="px-3 py-1.5 bg-rose-50 dark:bg-red-950/60 hover:bg-rose-100 dark:hover:bg-red-900/70 disabled:opacity-40 disabled:pointer-events-none text-rose-700 dark:text-red-200 text-xs font-medium rounded-lg border border-rose-300 dark:border-red-800/60 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-red-400" />
                Clear All Contacts
              </button>
            </div>
          </div>

          {/* Add / Edit Contact Form */}
          <form
            onSubmit={handleSubmitForm}
            className="p-4 bg-[#f6f7f3] dark:bg-zinc-950/90 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3.5"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4c5931] dark:text-[#b9c48a] font-mono flex items-center gap-2">
                {editingId ? (
                  <>
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Phone Book Entry (Bank {activeBank + 1})</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Entry to Game.Com Phone Book (Bank {activeBank + 1})</span>
                  </>
                )}
              </h3>
              <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                Record Size: <strong className="text-[#4c5931] dark:text-[#b9c48a]">{previewRecordBytes} bytes</strong>{' '}
                (Format: <code className="text-[#4e3d73] dark:text-[#b39ddb]">F0 [len] F0\0 F1\0 F2\0 F3\0 [len]</code>)
              </span>
            </div>

            {formError && (
              <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-red-950/80 border border-rose-300 dark:border-red-800 text-rose-700 dark:text-red-200 text-xs">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Field 0: Name + Mark ('!') */}
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
                  <span>
                    NAME <span className="text-[#7a1f5c] dark:text-[#d974b8]">*</span>{' '}
                    <span className="text-zinc-500">($0211–$0222)</span>
                  </span>
                  <span className="text-zinc-500">{name.length}/18</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMarked(!marked)}
                    className={`px-2.5 py-2 rounded-lg border text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                      marked
                        ? 'bg-amber-100 dark:bg-amber-950/90 border-amber-500 text-amber-800 dark:text-amber-300 font-bold'
                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                    title="Toggle BIOS '!' Mark / Star Flag ($0210 byte 0)"
                  >
                    <Star className={`w-3.5 h-3.5 ${marked ? 'fill-amber-400 text-amber-500 dark:text-amber-400' : ''}`} />
                    <span>{marked ? '!' : ' '}</span>
                  </button>
                  <input
                    type="text"
                    maxLength={18}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. TIGER HOTLINE"
                    required
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#7a1f5c] rounded-lg text-xs text-zinc-900 dark:text-white font-mono outline-none"
                  />
                </div>
              </div>

              {/* Field 1: Phone Number */}
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
                  <span>
                    PHONE NUMBER <span className="text-zinc-500">($0224–$0235)</span>
                  </span>
                  <span className="text-zinc-500">{phone.length}/18</span>
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 1-800-844-3733"
                  className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#7a1f5c] rounded-lg text-xs text-zinc-900 dark:text-white font-mono outline-none"
                />
              </div>

              {/* Field 3: Note / Email / 2nd Phone */}
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
                  <span>
                    NOTE / EMAIL <span className="text-zinc-500">($025C)</span>
                  </span>
                  <span className="text-zinc-500">{note.length}/18</span>
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. EXT 1997"
                  className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#7a1f5c] rounded-lg text-xs text-zinc-900 dark:text-white font-mono outline-none"
                />
              </div>

              {/* Field 2 Line 1: Address Line 1 */}
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
                  <span>
                    ADDRESS LINE 1 <span className="text-zinc-500">($0237–$0248)</span>
                  </span>
                  <span className="text-zinc-500">{addressLine1.length}/18</span>
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="e.g. 440 LAMBDEN AVE"
                  className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#7a1f5c] rounded-lg text-xs text-zinc-900 dark:text-white font-mono outline-none"
                />
              </div>

              {/* Field 2 Line 2: Address Line 2 */}
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
                  <span>
                    ADDRESS LINE 2 <span className="text-zinc-500">($0249–$025A)</span>
                  </span>
                  <span className="text-zinc-500">{addressLine2.length}/18</span>
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="e.g. VERNON HILLS IL"
                  className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#7a1f5c] rounded-lg text-xs text-zinc-900 dark:text-white font-mono outline-none"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="sm:col-span-4 flex items-end gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#7a1f5c] hover:bg-[#8e256b] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  {editingId ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Game.Com</span>
                    </>
                  )}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Bank Selector Tabs + Search Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {Array.from({ length: totalBanks }).map((_, idx) => {
                const countInBank = (pb.banks[idx] || []).length;
                const isSelected = activeBank === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectBank(idx)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#7a1f5c] border-[#7a1f5c] text-white font-bold shadow-sm'
                        : 'bg-[#f6f7f3] dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200'
                    }`}
                  >
                    BANK {idx + 1} ({countInBank}/{PHONEBOOK_ENTRIES_PER_BANK})
                  </button>
                );
              })}

              <button
                onClick={handleCreateBank}
                className="px-3 py-2 rounded-lg text-xs font-mono border border-dashed border-zinc-400 dark:border-zinc-700 hover:border-[#7a1f5c] text-zinc-600 dark:text-zinc-400 hover:text-[#7a1f5c] dark:hover:text-[#d974b8] flex items-center gap-1 transition-colors cursor-pointer"
                title="Create a new 50-entry Virtual Phone Book Bank"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Bank</span>
              </button>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter active bank..."
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-[#7a1f5c] rounded-lg text-xs text-zinc-900 dark:text-white font-mono outline-none"
              />
            </div>
          </div>

          {/* Directory Table for Active Bank */}
          <div className="border border-zinc-300 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-950/60">
            <div className="grid grid-cols-12 px-4 py-2.5 bg-[#f6f7f3] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 uppercase">
              <div className="col-span-1">#</div>
              <div className="col-span-2">NVRAM Addr</div>
              <div className="col-span-3">Name (Field 0)</div>
              <div className="col-span-2">Phone (Field 1)</div>
              <div className="col-span-3">Address &amp; Note (Fields 2–3)</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800/70 text-xs font-mono max-h-64 overflow-y-auto">
              {filteredRecords.length === 0 ? (
                <div className="px-4 py-8 text-center text-zinc-500 italic">
                  {hwLayout.records.length === 0
                    ? 'No contacts in this Phone Book Bank yet — use the form above to add entries or add them inside the BIOS Phone Book screen.'
                    : 'No contacts match your search filter.'}
                </div>
              ) : (
                filteredRecords.map(({ entry, nvramAddress, byteLength }, idx) => (
                  <div
                    key={entry.id}
                    className={`grid grid-cols-12 items-center px-4 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 transition-colors ${
                      editingId === entry.id ? 'bg-[#7a1f5c]/10 dark:bg-[#7a1f5c]/20' : ''
                    }`}
                  >
                    <div className="col-span-1 text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                      <button
                        onClick={() => handleToggleMark(entry)}
                        className="text-zinc-400 hover:text-amber-500 cursor-pointer"
                        title="Toggle BIOS '!' Mark Flag"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            entry.marked ? 'fill-amber-400 text-amber-500 dark:text-amber-400' : ''
                          }`}
                        />
                      </button>
                      <span>{idx + 1}</span>
                    </div>

                    <div className="col-span-2 text-[#4e3d73] dark:text-[#b39ddb]">
                      ${nvramAddress.toString(16).toUpperCase()}{' '}
                      <span className="text-[10px] text-zinc-500">({byteLength}B)</span>
                    </div>

                    <div className="col-span-3 font-bold text-zinc-900 dark:text-white truncate pr-2">
                      {entry.marked && <span className="text-amber-500 dark:text-amber-400 mr-1">!</span>}
                      {entry.name}
                    </div>

                    <div className="col-span-2 text-[#4c5931] dark:text-[#b9c48a] truncate pr-2">
                      {entry.phone || <span className="text-zinc-400 dark:text-zinc-600">—</span>}
                    </div>

                    <div className="col-span-3 text-zinc-700 dark:text-zinc-300 truncate pr-2">
                      {entry.addressLine1 || entry.addressLine2 || entry.note ? (
                        <div className="truncate">
                          {[entry.addressLine1, entry.addressLine2].filter(Boolean).join(' · ')}
                          {entry.note ? (
                            <span className="text-amber-700 dark:text-amber-300/90 ml-1">[{entry.note}]</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </div>

                    <div className="col-span-1 text-right flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleStartEdit(entry)}
                        className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-[#4c5931] dark:hover:text-[#b9c48a] transition-colors cursor-pointer"
                        title="Edit Contact"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(entry)}
                        className="p-1 text-zinc-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                        title="Delete Contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950/70 text-xs text-zinc-600 dark:text-zinc-400">
          <span>
            NVRAM Partition Signature (<code className="text-[#4e3d73] dark:text-[#b39ddb] font-mono">$F3FC–$F3FF</code>):{' '}
            <strong className="text-[#4c5931] dark:text-[#b9c48a] font-mono">AA AA AA AA</strong> · Bidirectional BIOS Sync Active
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
