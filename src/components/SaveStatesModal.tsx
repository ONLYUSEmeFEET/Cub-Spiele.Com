import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  HardDrive,
  Save,
  Upload,
  Download,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Play
} from 'lucide-react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../emulator/lcd';
import { PALETTES } from '../emulator/types';
import { SAVE_STATE_FILE_EXT, SaveStateSlotSummary } from '../emulator/saveStates';

interface SaveStatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  system: GameComSystem;
  onUpdate: () => void;
  onShowToast?: (message: string) => void;
}

const StateThumbnail: React.FC<{
  buffer?: Uint8Array;
  palette: [string, string, string, string];
}> = ({ buffer, palette }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const rgbPalette = palette.map((hex) => {
      const clean = hex.replace('#', '');
      const n = parseInt(clean, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    });

    const len = Math.min(buffer.length, SCREEN_WIDTH * SCREEN_HEIGHT);
    for (let i = 0; i < len; i++) {
      const shade = buffer[i] & 0x03;
      const [r, g, b] = rgbPalette[shade] || rgbPalette[0];
      const off = i * 4;
      img.data[off] = r;
      img.data[off + 1] = g;
      img.data[off + 2] = b;
      img.data[off + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [buffer, palette]);

  if (!buffer) {
    return (
      <div className="w-[100px] h-[80px] rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/70 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">EMPTY</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      className="w-[100px] h-[80px] rounded border border-zinc-300 dark:border-zinc-700 bg-black shrink-0"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

export const SaveStatesModal: React.FC<SaveStatesModalProps> = ({
  isOpen,
  onClose,
  system,
  onUpdate,
  onShowToast
}) => {
  const [slots, setSlots] = useState<SaveStateSlotSummary[]>([]);
  const [activeSlot, setActiveSlot] = useState<number>(system.activeSaveSlot);
  const [statusBanner, setStatusBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadOnImport, setLoadOnImport] = useState<boolean>(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refreshSlots = () => {
    setSlots(system.getSaveStateSlots());
    setActiveSlot(system.activeSaveSlot);
  };

  useEffect(() => {
    if (isOpen) {
      refreshSlots();
      setStatusBanner(null);
    }
  }, [isOpen, system.slot1?.id, system.slot1?.title]);

  if (!isOpen) return null;

  const slot1 = system.slot1;
  const isPoweredOn = system.isPoweredOn;
  const isHardcore = system.retroAchievements.config.hardcoreMode;
  const palette = (
    system.lcd.paletteId === 'custom'
      ? system.lcd.customColors
      : (PALETTES[system.lcd.paletteId] || PALETTES.original).colors
  ) as [string, string, string, string];

  const reportResult = (ok: boolean, message: string) => {
    setStatusBanner({ ok, text: message });
    onShowToast?.(message);
    refreshSlots();
    onUpdate();
  };

  const handleSelectActiveSlot = (slotIndex: number) => {
    const next = system.setActiveSaveSlot(slotIndex);
    setActiveSlot(next);
    onUpdate();
  };

  const handleSaveSlot = (slotIndex: number) => {
    const res = system.saveState(slotIndex);
    reportResult(res.ok, res.message);
  };

  const handleLoadSlot = (slotIndex: number) => {
    const res = system.loadState(slotIndex);
    reportResult(res.ok, res.message);
  };

  const handleDeleteSlot = (slotIndex: number) => {
    const res = system.deleteSaveState(slotIndex);
    reportResult(res.ok, res.message);
  };

  const handleExportSlot = (slotIndex: number) => {
    const res = system.exportSaveState(slotIndex);
    if (!res.ok || !res.content || !res.filename) {
      reportResult(false, res.message);
      return;
    }
    const blob = new Blob([res.content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename;
    a.click();
    URL.revokeObjectURL(url);
    reportResult(true, res.message);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = system.importSaveState(text, activeSlot, loadOnImport && !isHardcore);
      reportResult(res.ok, res.message);
    } catch {
      reportResult(false, 'Failed to read save state file.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#7a1f5c]/15 text-[#7a1f5c] dark:text-[#eab5d8]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                Save State Manager
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {slot1
                  ? `Slot 1 Locked Title: ${slot1.title}`
                  : 'No cartridge loaded in Slot 1'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
              title="Battery-backed NVRAM ($E000-$FFFF) is locked and never overwritten when loading save states."
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>NVRAM Locked</span>
            </span>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Close Save State Manager"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Info & Warnings */}
        <div className="px-6 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="text-zinc-600 dark:text-zinc-400">
            States are isolated per exact <strong>Slot 1 title</strong>. Loading a state preserves your live{' '}
            <strong>Battery NVRAM</strong> (High Scores, Phonebook, Calendar).
          </div>
          {isHardcore && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Hardcore Mode: Save & Export allowed; Load disabled
            </span>
          )}
        </div>

        {!slot1 && (
          <div className="mx-6 mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Load a game into <strong>Cartridge Slot 1</strong> to save, load, import, or export states.
            </span>
          </div>
        )}

        {statusBanner && (
          <div
            className={`mx-6 mt-3 p-2.5 rounded-lg border text-xs flex items-center gap-2 shrink-0 ${
              statusBanner.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200'
            }`}
          >
            {statusBanner.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
        )}

        {/* 10 Slots Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {slots.map((s) => {
            const isActive = activeSlot === s.slotIndex;
            const dateStr = s.timestamp
              ? new Date(s.timestamp).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })
              : 'No state saved';

            return (
              <div
                key={s.slotIndex}
                className={`p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                  isActive
                    ? 'border-[#7a1f5c] bg-[#7a1f5c]/5 dark:bg-[#7a1f5c]/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'
                }`}
              >
                <StateThumbnail buffer={s.displayBuffer} palette={palette} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectActiveSlot(s.slotIndex)}
                      className="flex items-center gap-1.5 text-left cursor-pointer group"
                      title="Set as Active Quick Slot (F5 / F8)"
                    >
                      <span className="text-sm font-semibold text-zinc-900 dark:text-white group-hover:text-[#7a1f5c] dark:group-hover:text-[#eab5d8]">
                        Slot {s.slotIndex}
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#7a1f5c] text-white">
                          ACTIVE
                        </span>
                      )}
                    </button>

                    {s.exists && s.sizeBytes && (
                      <span className="text-[10px] font-mono text-zinc-400">
                        {(s.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {dateStr}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <button
                      type="button"
                      onClick={() => handleSaveSlot(s.slotIndex)}
                      disabled={!slot1 || !isPoweredOn}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLoadSlot(s.slotIndex)}
                      disabled={!slot1 || !isPoweredOn || !s.exists || isHardcore}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-[#7a1f5c] text-white hover:bg-[#8e286c] disabled:opacity-35 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>Load</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportSlot(s.slotIndex)}
                      disabled={!slot1 || !s.exists}
                      title={`Export Slot ${s.slotIndex} (${SAVE_STATE_FILE_EXT})`}
                      className="px-2 py-1 rounded text-[11px] font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(s.slotIndex)}
                      disabled={!slot1 || !s.exists}
                      title={`Delete Slot ${s.slotIndex}`}
                      className="p-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Import */}
        <div className="px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <input
              ref={importInputRef}
              type="file"
              accept=".cgstate,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={!slot1}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import State into Slot {activeSlot}...</span>
            </button>

            <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={loadOnImport && !isHardcore}
                disabled={isHardcore}
                onChange={(e) => setLoadOnImport(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span>Load immediately after import</span>
            </label>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
