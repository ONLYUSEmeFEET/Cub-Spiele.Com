import React, { useRef } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { KNOWN_GAMECOM_GAMES } from '../emulator/cartridge';
import { HardDrive, Upload, X, Disc, Play, Sparkles, History } from 'lucide-react';

interface RomLibraryModalProps {
  system: GameComSystem;
  isOpen: boolean;
  onClose: () => void;
  onLoadRomFile: (file: File, slot: 1 | 2) => void;
}

export const RomLibraryModal: React.FC<RomLibraryModalProps> = ({
  system,
  isOpen,
  onClose,
  onLoadRomFile
}) => {
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadRomFile(file, slot);
      onClose();
    }
  };

  const isAdvanced = system.settings.advancedMode;
  const knownGamesList = Object.values(KNOWN_GAMECOM_GAMES);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {isAdvanced ? 'Dual Cartridge Bays & Game Library' : 'Game Library'}
              </h2>
              <p className="text-xs text-slate-400">
                Load any Game.Com ROM file (.bin, .tgc, or .zip) to start playing
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
          {/* Active Game / Cartridge Loader */}
          <div className={`grid grid-cols-1 ${isAdvanced ? 'sm:grid-cols-2' : ''} gap-4`}>
            {/* Primary Game / Slot 1 */}
            <div className="p-4 bg-slate-950/70 border border-purple-500/30 rounded-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-purple-400 flex items-center gap-1.5">
                  <Disc className="w-4 h-4" />
                  {isAdvanced ? 'CARTRIDGE SLOT 1' : 'CURRENT GAME'}
                </span>
                {system.slot1 && (
                  <button
                    onClick={() => system.ejectCartridge(1)}
                    className="text-[11px] text-red-400 hover:text-red-300 font-mono cursor-pointer"
                  >
                    [Unload]
                  </button>
                )}
              </div>

              {system.slot1 ? (
                <div>
                  <h3 className="text-base font-bold text-white">{system.slot1.title}</h3>
                  <p className="text-xs text-slate-400">
                    {system.slot1.publisher} ({system.slot1.year}) · {system.slot1.genre}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic py-1">No game loaded</p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <input
                  ref={fileInputRef1}
                  type="file"
                  accept=".bin,.zip,.tgc,.rom"
                  onChange={(e) => handleFileChange(e, 1)}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef1.current?.click()}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isAdvanced ? 'Load ROM into Slot 1...' : 'Open Game File (.bin / .zip)...'}
                </button>
                {system.slot1 && (
                  <button
                    onClick={() => {
                      system.launchCartridge(1);
                      onClose();
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </button>
                )}
              </div>
            </div>

            {/* Secondary Slot 2 (Advanced Mode Only) */}
            {isAdvanced && (
              <div className="p-4 bg-slate-950/70 border border-blue-500/30 rounded-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold text-blue-400 flex items-center gap-1.5">
                    <Disc className="w-4 h-4" /> CARTRIDGE SLOT 2
                  </span>
                  {system.slot2 && (
                    <button
                      onClick={() => system.ejectCartridge(2)}
                      className="text-[11px] text-red-400 hover:text-red-300 font-mono cursor-pointer"
                    >
                      [Unload]
                    </button>
                  )}
                </div>

                {system.slot2 ? (
                  <div>
                    <h3 className="text-base font-bold text-white">{system.slot2.title}</h3>
                    <p className="text-xs text-slate-400">
                      {system.slot2.publisher} ({system.slot2.year}) · {system.slot2.genre}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic py-1">Slot 2 is empty</p>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <input
                    ref={fileInputRef2}
                    type="file"
                    accept=".bin,.zip,.tgc,.rom"
                    onChange={(e) => handleFileChange(e, 2)}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef2.current?.click()}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Load ROM into Slot 2...
                  </button>
                  {system.slot2 && (
                    <button
                      onClick={() => {
                        system.launchCartridge(2);
                        onClose();
                      }}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Boot Slot 2
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Recently Played Games */}
          {system.recentGames.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  Recently Played
                </h3>
                <button
                  onClick={() => system.clearRecentGames()}
                  className="text-xs text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  Clear History
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {system.recentGames.map((item) => (
                  <div
                    key={`${item.id}_${item.slot}`}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.title}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {item.publisher} ({item.year})
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await system.launchRecentGame(item, 1);
                        if (ok) {
                          onClose();
                        } else {
                          fileInputRef1.current?.click();
                        }
                      }}
                      className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-medium shrink-0 cursor-pointer"
                    >
                      Play
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supported Games Catalog */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Supported Library ({knownGamesList.length} Games)
              </h3>
              <span className="text-xs text-slate-400">
                Full High Score, Leaderboard &amp; Achievement support
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {knownGamesList.map((game) => (
                <div
                  key={game.id}
                  className="p-3.5 bg-slate-950/50 border border-slate-800 hover:border-slate-700 rounded-xl transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-[11px] font-mono font-semibold"
                        style={{ color: game.coverAccent }}
                      >
                        {game.genre}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{game.year}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">{game.title}</h4>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {game.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
          <span>Supports .bin, .tgc, and compressed .zip ROM files</span>
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
