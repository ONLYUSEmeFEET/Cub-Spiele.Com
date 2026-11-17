import React, { useRef, useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { KNOWN_GAMECOM_GAMES, KnownGame } from '../emulator/cartridge';
import { OnlineRomEntry } from '../emulator/romRepository';
import {
  HardDrive,
  Upload,
  X,
  Disc,
  Play,
  Sparkles,
  History,
  Globe,
  Search,
  ExternalLink,
  Cable,
  Trash2,
  CheckCircle2,
  Loader2,
  Plus
} from 'lucide-react';

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
  const [repoInput, setRepoInput] = useState('');
  const [repoStatus, setRepoStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [loadingGameId, setLoadingGameId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'online' | 'link'>('all');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  if (!isOpen) return null;

  const refresh = () => setTick((t) => t + 1);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadRomFile(file, slot);
      onClose();
    }
  };

  const handleAddRepository = async (urlToScan?: string) => {
    const targetUrl = (urlToScan ?? repoInput).trim();
    if (!targetUrl || isScanning) return;
    setIsScanning(true);
    setRepoStatus(null);
    try {
      const res = await system.addRomRepositoryUrl(targetUrl);
      if (!urlToScan) setRepoInput('');
      setRepoStatus({
        type: 'ok',
        msg: `Found ${res.addedCount} valid ROMs (${res.totalCount} unique games ready in File → Library).`
      });
      refresh();
    } catch (err) {
      setRepoStatus({
        type: 'err',
        msg: (err as Error).message || 'Failed to scan online ROM repository.'
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handlePlayOnlineEntry = async (entry: OnlineRomEntry, slot: 1 | 2) => {
    if (loadingGameId) return;
    setLoadingGameId(entry.gameId);
    setRepoStatus(null);
    try {
      await system.loadOnlineRomEntry(entry, slot);
      onClose();
    } catch (err) {
      setRepoStatus({
        type: 'err',
        msg: (err as Error).message || `Failed to load ${entry.title}.`
      });
    } finally {
      setLoadingGameId(null);
    }
  };

  const isAdvanced = system.settings.advancedMode;
  const onlineByGameId = new Map<string, OnlineRomEntry>();
  for (const item of system.onlineLibrary) {
    onlineByGameId.set(item.gameId, item);
  }

  // Merge known catalog games (excluding internal BIOS/diagnostic entries) with any custom online ROMs
  const catalogGames: KnownGame[] = Object.values(KNOWN_GAMECOM_GAMES)
    .filter((g) => !g.isSystemCart)
    .sort((a, b) => a.title.localeCompare(b.title));

  const q = searchQuery.trim().toLowerCase();
  const filteredGames = catalogGames.filter((g) => {
    const hasOnline = onlineByGameId.has(g.id);
    if (filterMode === 'online' && !hasOnline) return false;
    if (filterMode === 'link' && !g.linkPlaySupport) return false;
    if (!q) return true;
    return (
      g.title.toLowerCase().includes(q) ||
      g.genre.toLowerCase().includes(q) ||
      g.publisher.toLowerCase().includes(q) ||
      (g.partNumber && g.partNumber.toLowerCase().includes(q)) ||
      g.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-[#eceee7] dark:bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#7a1f5c]/15 rounded-lg text-[#7a1f5c] dark:text-[#eab5d8]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                {isAdvanced ? 'Dual Cartridge Bays & GameCom Library' : 'GameCom Cartridge Library'}
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Load local ROMs (.bin, .tgc, .rom, .zip) or stream directly from your configured Online ROM Repository
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Active Game / Cartridge Loader */}
          <div className={`grid grid-cols-1 ${isAdvanced ? 'sm:grid-cols-2' : ''} gap-4`}>
            {/* Primary Game / Slot 1 */}
            <div className="p-4 bg-[#f5f6f1] dark:bg-zinc-950/70 border border-[#7a1f5c]/40 rounded-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-[#7a1f5c] dark:text-[#eab5d8] flex items-center gap-1.5">
                  <Disc className="w-4 h-4" />
                  {isAdvanced ? 'CARTRIDGE SLOT 1' : 'CURRENT GAME'}
                </span>
                {system.slot1 && (
                  <button
                    onClick={() => {
                      system.ejectCartridge(1);
                      refresh();
                    }}
                    className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-mono cursor-pointer"
                  >
                    Unload
                  </button>
                )}
              </div>

              {system.slot1 ? (
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">{system.slot1.title}</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {system.slot1.publisher} ({system.slot1.year}) · {system.slot1.genre}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 italic py-1">No game loaded</p>
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
                  className="px-3.5 py-2 bg-[#7a1f5c] hover:bg-[#8e266c] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isAdvanced ? 'Load File into Slot 1...' : 'Open Local ROM File (.bin, .tgc, .rom, .zip)...'}
                </button>
                {system.slot1 && (
                  <button
                    onClick={() => {
                      system.launchCartridge(1);
                      onClose();
                    }}
                    className="px-3.5 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </button>
                )}
              </div>
            </div>

            {/* Secondary Slot 2 (Advanced Mode Only) */}
            {isAdvanced && (
              <div className="p-4 bg-[#f5f6f1] dark:bg-zinc-950/70 border border-[#4e3d73]/40 rounded-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold text-[#4e3d73] dark:text-[#b39ddb] flex items-center gap-1.5">
                    <Disc className="w-4 h-4" /> CARTRIDGE SLOT 2
                  </span>
                  {system.slot2 && (
                    <button
                      onClick={() => {
                        system.ejectCartridge(2);
                        refresh();
                      }}
                      className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-mono cursor-pointer"
                    >
                      Unload
                    </button>
                  )}
                </div>

                {system.slot2 ? (
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">{system.slot2.title}</h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {system.slot2.publisher} ({system.slot2.year}) · {system.slot2.genre}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 italic py-1">Slot 2 is empty</p>
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
                    className="px-3.5 py-2 bg-[#4e3d73] hover:bg-[#5c4987] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Load File into Slot 2...
                  </button>
                  {system.slot2 && (
                    <button
                      onClick={() => {
                        system.launchCartridge(2);
                        onClose();
                      }}
                      className="px-3.5 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Boot Slot 2
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Online ROM Repository Configuration */}
          <div className="p-4 bg-[#f5f6f1] dark:bg-zinc-950/70 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                  Online ROM Repository
                </h3>
                {system.onlineLibrary.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                    {system.onlineLibrary.length} Games Synced to File → Library
                  </span>
                )}
              </div>
              {system.repositoryUrls.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    system.clearAllRomRepositories();
                    setRepoStatus(null);
                    refresh();
                  }}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear All Repositories
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRepository();
                  }
                }}
                placeholder="Enter repository URL (e.g. https://archive.org/download/gamecom_202211)..."
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                disabled={isScanning || !repoInput.trim()}
                onClick={() => handleAddRepository()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Add &amp; Scan Repository
                  </>
                )}
              </button>
            </div>

            {system.repositoryUrls.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {system.repositoryUrls.map((url) => (
                  <span
                    key={url}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 max-w-full"
                  >
                    <span className="truncate max-w-[340px]" title={url}>
                      {url}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        system.removeRomRepositoryUrl(url);
                        refresh();
                      }}
                      className="text-zinc-400 hover:text-rose-500 cursor-pointer"
                      title="Remove repository"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {repoStatus && (
              <div
                className={`text-xs px-3 py-2 rounded-lg border ${
                  repoStatus.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                }`}
              >
                {repoStatus.msg}
              </div>
            )}
          </div>

          {/* Cartridge Library with Diskman Labels & Metadata */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#7a1f5c] dark:text-[#d974b8]" />
                  Game.Com Cartridge Collection ({filteredGames.length} Titles)
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>Cartridge artwork, manuals &amp; metadata courtesy of Diskman:</span>
                  <a
                    href="https://www.diskman.com/presents/gamecom/scans.htm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>Box &amp; Catalog Scans</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <span>·</span>
                  <a
                    href="https://www.diskman.com/presents/gamecom/music.htm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>OST Music</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <span>·</span>
                  <a
                    href="https://www.diskman.com/presents/gamecom/commercials.htm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>TV Commercials</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter games, genre, #71-..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 w-48"
                  />
                </div>
                <div className="flex rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1.5 cursor-pointer ${
                      filterMode === 'all'
                        ? 'bg-[#7a1f5c] text-white'
                        : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    All ({catalogGames.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('online')}
                    className={`px-2.5 py-1.5 border-l border-zinc-300 dark:border-zinc-700 cursor-pointer ${
                      filterMode === 'online'
                        ? 'bg-[#7a1f5c] text-white'
                        : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    Ready ({onlineByGameId.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('link')}
                    className={`px-2.5 py-1.5 border-l border-zinc-300 dark:border-zinc-700 cursor-pointer ${
                      filterMode === 'link'
                        ? 'bg-[#7a1f5c] text-white'
                        : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    2P Link
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGames.map((game) => {
                const onlineEntry = onlineByGameId.get(game.id);
                const isLoadingThis = loadingGameId === game.id;
                const isExpanded = expandedGameId === game.id;

                return (
                  <div
                    key={game.id}
                    className={`group rounded-xl border transition-all overflow-hidden flex flex-col justify-between bg-[#f5f6f1] dark:bg-zinc-950/60 ${
                      onlineEntry
                        ? 'border-indigo-500/40 dark:border-indigo-500/40 shadow-sm hover:border-indigo-500'
                        : 'border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      {/* Cartridge Label Artwork Header */}
                      {game.labelImage && (
                        <div className="relative bg-zinc-950 p-2 border-b border-zinc-300 dark:border-zinc-800 overflow-hidden">
                          <img
                            src={game.labelImage}
                            alt={`${game.title} Cartridge Label`}
                            loading="lazy"
                            className="w-full aspect-[480/258] object-cover rounded-lg shadow-md group-hover:scale-[1.015] transition-transform duration-200"
                          />
                          <div className="absolute top-3.5 left-3.5 flex items-center gap-1.5">
                            {game.partNumber && (
                              <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-zinc-200 border border-white/15 text-[10px] font-mono">
                                #{game.partNumber}
                              </span>
                            )}
                            {game.linkPlaySupport && (
                              <span
                                className="px-1.5 py-0.5 rounded bg-indigo-950/90 text-indigo-200 border border-indigo-400/30 text-[10px] font-semibold flex items-center gap-1"
                                title="Supports 2-Player Compete.Com Link Cable"
                              >
                                <Cable className="w-2.5 h-2.5" />
                                2P Link
                              </span>
                            )}
                          </div>
                          {onlineEntry && (
                            <span className="absolute top-3.5 right-3.5 px-2 py-0.5 rounded-full bg-emerald-600/95 text-white text-[10px] font-semibold flex items-center gap-1 shadow">
                              <CheckCircle2 className="w-3 h-3" />
                              Ready
                            </span>
                          )}
                        </div>
                      )}

                      <div className="p-3.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-mono font-semibold text-[#7a1f5c] dark:text-[#d974b8] truncate">
                            {game.genre}
                          </span>
                          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                            {game.year}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">
                          {game.title}
                        </h4>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">
                          {game.publisher}
                        </div>

                        <p
                          className={`text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed ${
                            isExpanded ? '' : 'line-clamp-3'
                          }`}
                        >
                          {game.description}
                        </p>

                        {isExpanded && game.diskmanHighlights && game.diskmanHighlights.length > 0 && (
                          <ul className="mt-2.5 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-2">
                            {game.diskmanHighlights.map((pt, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-[#7a1f5c] dark:text-[#d974b8] font-bold">·</span>
                                <span>{pt}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="px-3.5 pb-3.5 pt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedGameId(isExpanded ? null : game.id)}
                          className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white underline cursor-pointer"
                        >
                          {isExpanded ? 'Less info' : 'Details'}
                        </button>
                        {game.manualUrl && (
                          <a
                            href={game.manualUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 inline-flex items-center gap-0.5"
                            title="Open Original Instruction Manual (PDF)"
                          >
                            <span>Manual</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {game.diskmanUrl && (
                          <a
                            href={game.diskmanUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 inline-flex items-center gap-0.5"
                            title="View archival page on Diskman.com"
                          >
                            <span>Diskman</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>

                      {onlineEntry ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={Boolean(loadingGameId)}
                            onClick={() => handlePlayOnlineEntry(onlineEntry, 1)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            {isLoadingThis ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                Play
                              </>
                            )}
                          </button>
                          {isAdvanced && (
                            <button
                              type="button"
                              disabled={Boolean(loadingGameId)}
                              onClick={() => handlePlayOnlineEntry(onlineEntry, 2)}
                              className="px-2 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-mono cursor-pointer"
                              title="Load into Cartridge Slot 2"
                            >
                              S2
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef1.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-200/80 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          Load File...
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-[#eceee7] dark:bg-zinc-950/70 text-xs text-zinc-600 dark:text-zinc-400">
          <span>
            Supports .bin, .tgc, .rom &amp; .zip archives · Online repositories &amp; library persist across sessions
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
