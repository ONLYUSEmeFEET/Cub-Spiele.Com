import React, { useRef, useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { KNOWN_GAMECOM_GAMES } from '../emulator/cartridge';
import { OnlineLeaderboardManager, OnlineLeaderboardEntry } from '../emulator/onlineLeaderboard';
import { GAMECOM_RA_ACHIEVEMENTS } from '../emulator/retroAchievements';
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
  ShieldCheck,
  BookUser,
  Users,
  UserPlus,
  Edit3,
  Check,
  Globe,
  RefreshCw,
  Copy,
  Award,
  Lock,
  Unlock,
  FileCode,
  Sparkles,
  KeyRound
} from 'lucide-react';

export type HighScoreModalTab = 'leaderboard' | 'profiles' | 'nvram' | 'retroachievements';

interface HighScoreVaultModalProps {
  system: GameComSystem;
  isOpen: boolean;
  initialTab?: HighScoreModalTab;
  onClose: () => void;
  onOpenInBios: () => void;
  onOpenPhoneBook?: () => void;
  onUpdated: () => void;
  onNotify?: (message: string, sub?: string, type?: 'success' | 'info' | 'error') => void;
}

export const HighScoreVaultModal: React.FC<HighScoreVaultModalProps> = ({
  system,
  isOpen,
  initialTab = 'leaderboard',
  onClose,
  onOpenInBios,
  onOpenPhoneBook,
  onUpdated,
  onNotify
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<HighScoreModalTab>(initialTab);

  // Leaderboard tab state
  const [selectedGameFilter, setSelectedGameFilter] = useState<number | 'ALL'>('ALL');
  const [hardcoreOnlyFilter, setHardcoreOnlyFilter] = useState<boolean>(false);
  const [certificateInput, setCertificateInput] = useState<string>('');
  const [customEndpoint, setCustomEndpoint] = useState<string>(
    system.onlineLeaderboard.customEndpointUrl
  );
  const [isSyncingOnline, setIsSyncingOnline] = useState<boolean>(false);
  const [editingEntryKey, setEditingEntryKey] = useState<string | null>(null);
  const [editingEntryName, setEditingEntryName] = useState<string>('');

  // Profiles & Import tab state
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null);
  const [renamingProfileName, setRenamingProfileName] = useState<string>('');
  const [importPlayerName, setImportPlayerName] = useState<string>('');
  const [importMode, setImportMode] = useState<
    'merge_multiplayer' | 'new_profile' | 'overwrite_current'
  >('merge_multiplayer');

  // NVRAM slot player rename state
  const [editingSlotIdx, setEditingSlotIdx] = useState<number | null>(null);
  const [editingSlotPlayerName, setEditingSlotPlayerName] = useState<string>('');

  // RetroAchievements login state
  const [raUsername, setRaUsername] = useState<string>(system.retroAchievements.config.username);
  const [raPasswordOrToken, setRaPasswordOrToken] = useState<string>(
    system.retroAchievements.config.connectToken
  );
  const [raConnecting, setRaConnecting] = useState<boolean>(false);

  if (!isOpen) return null;

  const hs = system.highScores;
  const lb = system.onlineLeaderboard;
  const ra = system.retroAchievements;
  const activeProfile = hs.getActiveProfile();
  const totalBanks = hs.getTotalBanks();
  const activeBank = hs.activeBank;
  const bankRecords = hs.records.slice(activeBank * 10, (activeBank + 1) * 10);

  const knownGamesList = Object.values(KNOWN_GAMECOM_GAMES);

  // Best score per game summary & filtered entries
  const bestPerGameSummary = lb.getBestScorePerGameSummary(hardcoreOnlyFilter);
  const filteredLeaderboardEntries: OnlineLeaderboardEntry[] =
    selectedGameFilter === 'ALL'
      ? lb.entries.filter((e) => (hardcoreOnlyFilter ? e.verification.hardcoreVerified : true))
      : lb.getLeaderboardForGame(selectedGameFilter, hardcoreOnlyFilter);

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
    onNotify?.(
      'Active Profile NVRAM Cleared',
      `Cleared high score slots ($FC60-$FEE1) for ${activeProfile.name}`,
      'info'
    );
  };

  const handleExportJson = () => {
    const jsonStr = hs.exportVaultJson(system.cpu.nvram, system.phoneBook);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = activeProfile.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `cub_spiele_${safeName}_highscores_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(
      'Exported Multi-Player High Score Vault (.json)',
      `${hs.records.length} profile records + ${hs.getTotalStoredScoresCount()} multi-player scores exported`,
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
    onNotify?.(
      'Exported Raw 8KB NVRAM (.nvram)',
      'Saved 8,192-byte ($E000-$FFFF) battery-backed SRAM binary',
      'success'
    );
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await hs.importDataFromFile(file, system.cpu.nvram, system.phoneBook, {
        customPlayerName: importPlayerName.trim() || undefined,
        mode: importMode
      });
      system.refreshBiosPhoneBookIfOpen();
      setImportPlayerName('');
      onUpdated();
      onNotify?.(
        `Imported Scores from "${res.importedPlayerName}"`,
        `Loaded ${res.recordsCount} high score(s) (${res.verifiedCount} cryptographically verified) into Multi-Player Vault`,
        'success'
      );
    } catch (err) {
      onNotify?.('Failed to Import High Score Data', (err as Error).message, 'error');
    }
  };

  const handleCreateProfile = () => {
    const trimmed = newProfileName.trim();
    if (!trimmed) return;
    const created = hs.createProfile(trimmed, system.cpu.nvram, true);
    setNewProfileName('');
    onUpdated();
    onNotify?.(
      'Player Profile Created & Activated',
      `Switched active player to "${created.name}" (${ra.getUserFingerprint()})`,
      'success'
    );
  };

  const handleRenameProfile = (profileId: string) => {
    const trimmed = renamingProfileName.trim();
    if (!trimmed) return;
    hs.renameProfile(profileId, trimmed);
    setRenamingProfileId(null);
    setRenamingProfileName('');
    onUpdated();
    onNotify?.('Player Profile Renamed', `Updated player name to "${trimmed}"`, 'success');
  };

  const handleSwitchProfile = (profileId: string) => {
    hs.switchProfile(profileId, system.cpu.nvram);
    onUpdated();
    const prof = hs.getActiveProfile();
    onNotify?.(
      'Switched Active Player Profile',
      `Now playing as "${prof.name}" (${prof.records.length} saved hardware scores)`,
      'info'
    );
  };

  const handleDeleteProfile = (profileId: string, name: string) => {
    if (hs.deleteProfile(profileId, system.cpu.nvram)) {
      onUpdated();
      onNotify?.('Deleted Player Profile', `Removed profile "${name}"`, 'info');
    }
  };

  const handleSyncOnline = async () => {
    setIsSyncingOnline(true);
    try {
      lb.customEndpointUrl = customEndpoint.trim();
      lb.saveCache();
      hs.syncAllProfileScoresToLeaderboard();
      for (const entry of lb.entries) {
        if (entry.source === 'local_user') {
          await lb.submitScoreOnline(entry);
        }
      }
      const res = await lb.syncWithServer();
      onUpdated();
      onNotify?.(
        res.ok ? 'Online Leaderboard Synchronized' : 'Local Verified Vault Synchronized',
        `${lb.entries.length} total verified score(s) indexed across all games`,
        res.ok ? 'success' : 'info'
      );
    } finally {
      setIsSyncingOnline(false);
    }
  };

  const handleCopyCertificate = (entry: OnlineLeaderboardEntry) => {
    const cert = OnlineLeaderboardManager.encodeScoreCertificate(entry);
    navigator.clipboard?.writeText(cert).catch(() => {});
    onNotify?.(
      'Copied Signed Score Certificate (CSC1)',
      `${entry.playerName} — ${entry.gameTitle}: ${entry.scoreText} (${
        entry.verification.hardcoreVerified ? 'HARDCORE SEAL' : 'SOFTCORE SEAL'
      })`,
      'success'
    );
  };

  const handleImportCertificate = () => {
    const trimmed = certificateInput.trim();
    if (!trimmed) return;
    const res = lb.importScoreCertificate(trimmed);
    if (res.ok && res.entry) {
      setCertificateInput('');
      onUpdated();
      onNotify?.(
        'Verified & Imported Score Certificate',
        `${res.entry.playerName} — ${res.entry.gameTitle}: ${res.entry.scoreText}`,
        'success'
      );
    } else {
      onNotify?.('Certificate Verification Failed', res.message, 'error');
    }
  };

  const handleRaLogin = async () => {
    if (!raUsername.trim() || !raPasswordOrToken.trim()) return;
    setRaConnecting(true);
    try {
      const res = await ra.loginToRetroAchievements(
        raUsername.trim(),
        raPasswordOrToken.trim(),
        raPasswordOrToken.trim().length === 16
      );
      onUpdated();
      onNotify?.(
        res.ok ? 'RetroAchievements Connected' : 'RetroAchievements Notice',
        res.message,
        res.ok ? 'success' : 'info'
      );
    } finally {
      setRaConnecting(false);
    }
  };

  const handleExportRaSpec = () => {
    const specTxt = ra.exportRAIntegrationSubmissionSpec(
      system.cpu,
      system.getActiveCartridge()
    );
    const blob = new Blob([specTxt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CubSpieleCom_RetroAchievements_Integration_Spec.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(
      'Exported RetroAchievements Integration Toolkit',
      'Saved rcheevos SM8521 memory map, MD5 hashes, achievements & leaderboard definitions',
      'success'
    );
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

  const activeGameAchievements = GAMECOM_RA_ACHIEVEMENTS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Hidden file input for Import Data */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.nvram,.sav,.bin"
          onChange={handleImportFile}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/15 rounded-xl text-amber-400 border border-amber-500/30">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex flex-wrap items-center gap-2">
                <span>High Scores, Multi-Player Profiles &amp; Competitive Leaderboards</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono rounded border flex items-center gap-1 ${
                    ra.config.hardcoreMode
                      ? 'bg-amber-950/90 text-amber-300 border-amber-600/70'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {ra.config.hardcoreMode ? 'HARDCORE MODE ACTIVE' : 'SOFTCORE MODE'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Active Player:{' '}
                <strong className="text-amber-300 font-mono">{activeProfile.name}</strong> (
                <code className="text-slate-300">
                  {activeProfile.importedFromFingerprint || ra.getUserFingerprint()}
                </code>
                ) · Cryptographic Score Attestation &amp; RetroAchievements Ecosystem
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

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 px-6 pt-3 bg-slate-950/50 border-b border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2.5 rounded-t-lg font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-slate-900 text-amber-300 border-amber-400'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Leaderboards ({lb.entries.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('profiles')}
            className={`px-4 py-2.5 rounded-t-lg font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'profiles'
                ? 'bg-slate-900 text-emerald-300 border-emerald-400'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Players &amp; Import ({hs.profiles.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('nvram')}
            className={`px-4 py-2.5 rounded-t-lg font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'nvram'
                ? 'bg-slate-900 text-purple-300 border-purple-400'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Hardware NVRAM Vault ($FC60)</span>
          </button>

          <button
            onClick={() => setActiveTab('retroachievements')}
            className={`px-4 py-2.5 rounded-t-lg font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'retroachievements'
                ? 'bg-slate-900 text-sky-300 border-sky-400'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Award className="w-4 h-4 text-sky-400" />
            <span>Hardcore &amp; RetroAchievements</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* ===================================================================== */}
          {/* TAB 1: LEADERBOARDS (BEST SCORES PER GAME & ONLINE RANKINGS)          */}
          {/* ===================================================================== */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-5">
              {/* Top Controls Bar: Game Filter, Hardcore Filter, Online Sync */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold text-slate-300">Game Filter:</label>
                    <select
                      value={selectedGameFilter === 'ALL' ? 'ALL' : String(selectedGameFilter)}
                      onChange={(e) =>
                        setSelectedGameFilter(
                          e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10)
                        )
                      }
                      className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-medium"
                    >
                      <option value="ALL">All Tiger Game.Com Titles ({lb.entries.length})</option>
                      {knownGamesList.map((g) => {
                        const gid = g.gameIds?.[0] || 0;
                        if (!gid) return null;
                        return (
                          <option key={g.id} value={gid}>
                            {g.title} (${gid.toString(16).toUpperCase().padStart(4, '0')})
                          </option>
                        );
                      })}
                    </select>

                    <button
                      onClick={() => setHardcoreOnlyFilter(!hardcoreOnlyFilter)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                        hardcoreOnlyFilter
                          ? 'bg-amber-950/90 border-amber-500 text-amber-300'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {hardcoreOnlyFilter
                          ? 'Showing: Hardcore Verified Only'
                          : 'Showing: All Verified Scores'}
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleSyncOnline}
                      disabled={isSyncingOnline}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOnline ? 'animate-spin' : ''}`} />
                      <span>Sync Online Leaderboard</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('profiles')}
                      className="px-3 py-1.5 bg-purple-950/90 hover:bg-purple-900 text-purple-200 text-xs font-semibold rounded-lg border border-purple-700/70 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-purple-400" />
                      <span>Import Other Player Scores</span>
                    </button>
                  </div>
                </div>

                {/* Online Server Endpoint & Signed Certificate Bar */}
                <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    <input
                      type="text"
                      value={customEndpoint}
                      onChange={(e) => setCustomEndpoint(e.target.value)}
                      placeholder="Online Relay URL (Default: Built-in /api/leaderboards)"
                      className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                    <input
                      type="text"
                      value={certificateInput}
                      onChange={(e) => setCertificateInput(e.target.value)}
                      placeholder="Paste Signed Score Certificate (CSC1-...) from another player"
                      className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                    />
                    <button
                      onClick={handleImportCertificate}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg shrink-0 cursor-pointer"
                    >
                      Verify &amp; Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Best Score for Each Game Summary Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Best Score for Each Game (Champions Board)</span>
                  </h3>
                  {selectedGameFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedGameFilter('ALL')}
                      className="text-xs text-amber-400 hover:underline cursor-pointer"
                    >
                      Show All Games
                    </button>
                  )}
                </div>

                {bestPerGameSummary.length === 0 ? (
                  <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    No high scores recorded yet. Play a game on the console (e.g.,{' '}
                    <strong className="text-white">Lights Out</strong> or{' '}
                    <strong className="text-white">Built-In Solitaire</strong>), or import a player&apos;s
                    high score file / certificate to populate the Champions Board!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {bestPerGameSummary.map((bestEntry) => {
                      const totalForGame = lb.getLeaderboardForGame(
                        bestEntry.gameId,
                        hardcoreOnlyFilter
                      ).length;
                      return (
                        <div
                          key={bestEntry.gameId}
                          onClick={() =>
                            setSelectedGameFilter(
                              selectedGameFilter === bestEntry.gameId ? 'ALL' : bestEntry.gameId
                            )
                          }
                          className={`p-3.5 rounded-xl border transition cursor-pointer ${
                            selectedGameFilter === bestEntry.gameId
                              ? 'bg-amber-950/30 border-amber-500/80'
                              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-bold text-white text-xs truncate">
                              {bestEntry.gameTitle}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              ${bestEntry.gameId.toString(16).toUpperCase().padStart(4, '0')}
                            </span>
                          </div>
                          <div className="text-lg font-extrabold font-mono text-amber-400 tracking-tight">
                            {bestEntry.scoreText}
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-slate-300 truncate">
                              Champion:{' '}
                              <strong className="text-emerald-300">{bestEntry.playerName}</strong>
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {totalForGame} {totalForGame === 1 ? 'entry' : 'entries'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Detailed Leaderboard Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                  <div className="col-span-1">Rank</div>
                  <div className="col-span-3">Game Title</div>
                  <div className="col-span-3">Player</div>
                  <div className="col-span-2">Score</div>
                  <div className="col-span-2">Legitimacy Seal</div>
                  <div className="col-span-1 text-right">Share</div>
                </div>

                {filteredLeaderboardEntries.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-500">
                    No matching leaderboard entries found for the current filter.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70 text-xs font-mono">
                    {filteredLeaderboardEntries.map((entry, idx) => {
                      const isOwn = entry.userFingerprint === ra.getUserFingerprint();
                      const isEditing = editingEntryKey === entry.id;
                      return (
                        <div
                          key={entry.id}
                          className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-slate-900/50 transition-colors"
                        >
                          <div className="col-span-1 font-bold">
                            {idx === 0 ? (
                              <span className="text-amber-400">#1</span>
                            ) : idx === 1 ? (
                              <span className="text-slate-300">#2</span>
                            ) : idx === 2 ? (
                              <span className="text-amber-600">#3</span>
                            ) : (
                              <span className="text-slate-500">#{idx + 1}</span>
                            )}
                          </div>

                          <div className="col-span-3 pr-2">
                            <div className="font-bold text-white truncate">{entry.gameTitle}</div>
                            <div className="text-[10px] text-slate-500">
                              ${entry.gameId.toString(16).toUpperCase().padStart(4, '0')} ·{' '}
                              {entry.source === 'imported_user'
                                ? 'Imported Player'
                                : entry.source === 'retroachievements'
                                  ? 'RetroAchievements'
                                  : isOwn
                                    ? 'You'
                                    : 'Online Peer'}
                            </div>
                          </div>

                          <div className="col-span-3 pr-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editingEntryName}
                                  onChange={(e) => setEditingEntryName(e.target.value)}
                                  className="w-28 px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-white text-xs"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    if (editingEntryName.trim()) {
                                      entry.playerName = editingEntryName.trim().slice(0, 24);
                                      lb.saveCache();
                                      onUpdated();
                                    }
                                    setEditingEntryKey(null);
                                  }}
                                  className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-emerald-300 truncate">
                                  {entry.playerName}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingEntryKey(entry.id);
                                    setEditingEntryName(entry.playerName);
                                  }}
                                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                                  title="Rename Player on this Score"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <div className="text-[10px] text-slate-500">
                              {entry.userFingerprint}
                            </div>
                          </div>

                          <div className="col-span-2 font-bold text-amber-400 text-sm">
                            {entry.scoreText}
                          </div>

                          <div className="col-span-2">
                            {entry.verification.hardcoreVerified ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/90 border border-amber-600/60 text-amber-300 text-[10px]"
                                title={`Hardcore Verified · Seal ${entry.verification.signature.slice(0, 12)}... · No Save States · ${entry.verification.sessionFrames} frames · ${entry.verification.inputCount} inputs`}
                              >
                                <ShieldCheck className="w-3 h-3 text-amber-400" />
                                HARDCORE
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px]"
                                title={`Signed Softcore Score · Seal ${entry.verification.signature.slice(0, 12)}...`}
                              >
                                SOFTCORE
                              </span>
                            )}
                          </div>

                          <div className="col-span-1 text-right">
                            <button
                              onClick={() => handleCopyCertificate(entry)}
                              className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition cursor-pointer"
                              title="Copy Signed Score Certificate (CSC1-...) to share with other players"
                            >
                              <Copy className="w-3.5 h-3.5 inline" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 2: PLAYER PROFILES & MULTI-USER IMPORT                            */}
          {/* ===================================================================== */}
          {activeTab === 'profiles' && (
            <div className="space-y-5">
              {/* Create New Player Profile Card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-emerald-400" />
                    <span>Create or Switch Player Profile</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Each player profile has its own dedicated NVRAM High Score banks while contributing
                    to the shared Multi-Player Leaderboard.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateProfile()}
                    placeholder="New player name (e.g. Alex)"
                    className="flex-1 sm:w-52 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                  />
                  <button
                    onClick={handleCreateProfile}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shrink-0 cursor-pointer"
                  >
                    Create Player
                  </button>
                </div>
              </div>

              {/* Saved Player Profiles List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hs.profiles.map((prof) => {
                  const isCurrent = prof.id === hs.activeProfileId;
                  const isRenaming = renamingProfileId === prof.id;
                  return (
                    <div
                      key={prof.id}
                      className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                        isCurrent
                          ? 'bg-emerald-950/25 border-emerald-500/70'
                          : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {isRenaming ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={renamingProfileName}
                                onChange={(e) => setRenamingProfileName(e.target.value)}
                                onKeyDown={(e) =>
                                  e.key === 'Enter' && handleRenameProfile(prof.id)
                                }
                                className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-xs text-white"
                                autoFocus
                              />
                              <button
                                onClick={() => handleRenameProfile(prof.id)}
                                className="px-2 py-1 bg-emerald-600 text-white text-xs rounded cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setRenamingProfileId(null)}
                                className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{prof.name}</span>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono">
                                  ACTIVE
                                </span>
                              )}
                              {prof.isImportedProfile && (
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-mono">
                                  IMPORTED
                                </span>
                              )}
                            </div>
                          )}
                          <div className="text-[11px] font-mono text-slate-400 mt-1">
                            ID: {prof.importedFromFingerprint || ra.getUserFingerprint()} ·{' '}
                            {prof.records.length} Cartridge Score(s) · Solitaire:{' '}
                            {prof.solitaireScore}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setRenamingProfileId(prof.id);
                              setRenamingProfileName(prof.name);
                            }}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                            title="Rename Player Profile"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {hs.profiles.length > 1 && (
                            <button
                              onClick={() => handleDeleteProfile(prof.id, prof.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg cursor-pointer"
                              title="Delete Player Profile"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                        <span className="text-slate-500">
                          Created {new Date(prof.createdAt).toLocaleDateString()}
                        </span>
                        {!isCurrent ? (
                          <button
                            onClick={() => handleSwitchProfile(prof.id)}
                            className="px-3 py-1 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white font-semibold rounded-lg transition cursor-pointer"
                          >
                            Switch to {prof.name}
                          </button>
                        ) : (
                          <span className="text-emerald-400 font-semibold">
                            Loaded in Console NVRAM
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Import High Score Data from Other Users Card */}
              <div className="p-5 bg-slate-950 rounded-xl border border-purple-800/50 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Upload className="w-4 h-4 text-purple-400" />
                    <span>Import High Score Data from Another Player (.json / .nvram / .sav)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Import another player&apos;s exported Vault (<code>.json</code>) or raw 8KB Battery
                    NVRAM (<code>.nvram</code> / <code>.sav</code>) so multiple players&apos; high scores
                    are saved side-by-side and ranked on the Leaderboard.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Player Name Attribution (Optional override):
                    </label>
                    <input
                      type="text"
                      value={importPlayerName}
                      onChange={(e) => setImportPlayerName(e.target.value)}
                      placeholder="Auto-detect from file or enter player name..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Multi-Player Import Mode:
                    </label>
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    >
                      <option value="merge_multiplayer">
                        Merge into Multi-Player Leaderboard &amp; Save Player Profile (Recommended)
                      </option>
                      <option value="new_profile">
                        Import as New Player Profile &amp; Switch Active Console NVRAM to It
                      </option>
                      <option value="overwrite_current">
                        Merge into Current Active Player ({activeProfile.name})
                      </option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Choose Player High Score File (.json / .nvram / .sav)...</span>
                  </button>
                  <button
                    onClick={handleExportJson}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export My High Scores (.json) to Share</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 3: HARDWARE NVRAM VAULT ($FC60-$FEDF)                             */}
          {/* ===================================================================== */}
          {activeTab === 'nvram' && (
            <div className="space-y-5">
              {/* Import / Export & BIOS Actions Bar */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-purple-400" />
                      Active Profile: <span className="text-emerald-400">{activeProfile.name}</span> ·
                      Saved Games: <span className="text-amber-400 font-mono">{hs.records.length}</span>{' '}
                      across <span className="text-purple-400 font-mono">{totalBanks}</span> NVRAM
                      Bank(s)
                    </p>
                    <p className="text-slate-400">
                      Hardware high scores are stored at{' '}
                      <code className="text-purple-300 font-mono">$FC60–$FEDF</code> (10 × 64-byte
                      slots) and Solitaire at{' '}
                      <code className="text-purple-300 font-mono">$FEE0–$FEE1</code>.
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
                    >
                      <Upload className="w-3.5 h-3.5 text-purple-400" />
                      Import Data (.json / .nvram)
                    </button>
                    <button
                      onClick={handleExportJson}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      Export Vault (.json)
                    </button>
                    <button
                      onClick={handleExportRawNvram}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <HardDriveDownload className="w-3.5 h-3.5 text-blue-400" />
                      Export 8KB NVRAM (.nvram)
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleTriggerBiosPrompt}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium rounded-lg border border-amber-700/50 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      Prompt Keep/Clear Data
                    </button>
                    <button
                      onClick={handleClearAll}
                      className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900/70 text-red-200 text-xs font-medium rounded-lg border border-red-800/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      Clear Profile Data
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
                  <div className="col-span-2">Slot / Addr</div>
                  <div className="col-span-3">Game Title</div>
                  <div className="col-span-3">Player</div>
                  <div className="col-span-2">Saved Score</div>
                  <div className="col-span-1">Mode</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                <div className="divide-y divide-slate-800/70 text-xs font-mono">
                  {Array.from({ length: 10 }).map((_, slotIdx) => {
                    const rec = bankRecords[slotIdx];
                    const globalIdx = activeBank * 10 + slotIdx;
                    const nvramAddr = 0xfc60 + slotIdx * 0x40;
                    const isEditingThisSlot = editingSlotIdx === globalIdx;
                    return (
                      <div
                        key={slotIdx}
                        className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-slate-900/50 transition-colors"
                      >
                        <div className="col-span-2 text-slate-400">
                          #{globalIdx + 1}{' '}
                          <span className="text-purple-400">
                            (${nvramAddr.toString(16).toUpperCase()})
                          </span>
                        </div>
                        {rec ? (
                          <>
                            <div className="col-span-3">
                              <div className="font-bold text-white">{rec.title}</div>
                              <div className="text-[10px] text-slate-500">
                                ID ${rec.gameId.toString(16).padStart(4, '0').toUpperCase()}
                              </div>
                            </div>
                            <div className="col-span-3">
                              {isEditingThisSlot ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={editingSlotPlayerName}
                                    onChange={(e) => setEditingSlotPlayerName(e.target.value)}
                                    className="w-24 px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-white text-xs"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      if (editingSlotPlayerName.trim()) {
                                        hs.renameRecordPlayer(globalIdx, editingSlotPlayerName);
                                        onUpdated();
                                      }
                                      setEditingSlotIdx(null);
                                    }}
                                    className="p-1 text-emerald-400 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-300 truncate">
                                    {rec.playerName || activeProfile.name}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingSlotIdx(globalIdx);
                                      setEditingSlotPlayerName(
                                        rec.playerName || activeProfile.name
                                      );
                                    }}
                                    className="text-slate-500 hover:text-white cursor-pointer"
                                    title="Rename Player for this Slot"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="col-span-2 text-amber-400 font-bold">
                              {rec.scoreText}
                            </div>
                            <div className="col-span-1">
                              {rec.verification?.hardcoreVerified ? (
                                <span className="text-[10px] text-amber-300 font-bold">HC</span>
                              ) : (
                                <span className="text-[10px] text-slate-400">SC</span>
                              )}
                            </div>
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
                          <div className="col-span-10 text-slate-600 italic">
                            [Empty 64-byte Hardware Slot — Play a Game or Import NVRAM Backup]
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 4: HARDCORE MODE & RETROACHIEVEMENTS (RCHEEVOS)                   */}
          {/* ===================================================================== */}
          {activeTab === 'retroachievements' && (
            <div className="space-y-5">
              {/* Competitive Hardcore Mode Status & Telemetry Card */}
              <div
                className={`p-5 rounded-xl border ${
                  ra.config.hardcoreMode
                    ? 'bg-amber-950/20 border-amber-500/60'
                    : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {ra.config.hardcoreMode ? (
                        <Lock className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Unlock className="w-4 h-4 text-slate-400" />
                      )}
                      <span>
                        Competitive Hardcore Mode (RetroAchievements Compatible)
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Guarantees 100% score legitimacy: disables Save State loading (F8), locks native
                      4.9152 MHz clock speed (&ge;1.0×), blocks CPU debugger stepping, and signs every
                      hardware score write with your rolling input entropy hash.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      const next = system.toggleHardcoreMode();
                      onUpdated();
                      onNotify?.(
                        next
                          ? 'Competitive Hardcore Mode Enabled'
                          : 'Switched to Softcore Mode',
                        next
                          ? 'System cold-booted into a clean, untainted competitive session'
                          : 'Save State loading and sub-1.0x speeds are now permitted',
                        next ? 'success' : 'info'
                      );
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition cursor-pointer ${
                      ra.config.hardcoreMode
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {ra.config.hardcoreMode ? 'Disable Hardcore Mode' : 'Enable Hardcore Mode'}
                  </button>
                </div>

                {/* Live Session Cryptographic Telemetry */}
                <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Session Integrity</div>
                    <div
                      className={`font-bold mt-0.5 ${
                        ra.isSessionHardcoreClean() ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {ra.isSessionHardcoreClean() ? 'CLEAN (HARDCORE)' : 'SOFTCORE / TAINTED'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Frames / Inputs</div>
                    <div className="font-bold text-white mt-0.5">
                      {ra.session.framesExecuted.toLocaleString()}f / {ra.session.inputEventCount}i
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Input Entropy Hash</div>
                    <div className="font-bold text-amber-300 mt-0.5">
                      0x{ra.session.inputRollingHash.toString(16).toUpperCase().padStart(8, '0')}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">ROM MD5 (rcheevos)</div>
                    <div
                      className="font-bold text-sky-300 mt-0.5 truncate"
                      title={ra.session.activeRomMd5}
                    >
                      {ra.session.activeRomMd5.slice(0, 16)}...
                    </div>
                  </div>
                </div>
              </div>

              {/* RetroAchievements.org Account & Rich Presence */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Award className="w-4 h-4" />
                      <span>RetroAchievements Account (dorequest.php)</span>
                    </h4>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        ra.connectionStatus === 'connected'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {ra.connectionStatus.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <input
                      type="text"
                      value={raUsername}
                      onChange={(e) => setRaUsername(e.target.value)}
                      placeholder="RetroAchievements Username"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                    <input
                      type="password"
                      value={raPasswordOrToken}
                      onChange={(e) => setRaPasswordOrToken(e.target.value)}
                      placeholder="Password or Connect Token"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRaLogin}
                        disabled={raConnecting}
                        className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        {raConnecting ? 'Authenticating...' : 'Connect to RetroAchievements'}
                      </button>
                      {ra.config.connectToken && (
                        <button
                          onClick={() => {
                            ra.disconnectAccount();
                            setRaPasswordOrToken('');
                            onUpdated();
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                    {ra.lastSyncMessage && (
                      <p className="text-[11px] text-slate-400">{ra.lastSyncMessage}</p>
                    )}
                  </div>
                </div>

                {/* Live Rich Presence & RAIntegration Submission Kit */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                      Live Rich Presence &amp; Ecosystem Submission Kit
                    </h4>
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs font-mono text-emerald-300">
                      {ra.lastRichPresence}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Exposes the flat 32KB SM8521 address space (<code>$0000–$03FF</code> Internal
                      RAM, <code>$E000–$FFFF</code> 8KB NVRAM, <code>$A000–$DFFF</code> 16KB VRAM)
                      and RFC 1321 MD5 ROM hashing for official <code>rcheevos</code> /{' '}
                      <code>RAIntegration</code> integration.
                    </p>
                  </div>

                  <button
                    onClick={handleExportRaSpec}
                    className="w-full px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileCode className="w-4 h-4" />
                    <span>Export RetroAchievements Integration &amp; Memory Map Spec (.txt)</span>
                  </button>
                </div>
              </div>

              {/* Active Game Achievements List */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-bold text-white">
                    Built-In rcheevos Achievement Set ({activeGameAchievements.length})
                  </span>
                  <span className="font-mono text-slate-400">
                    Unlocked: {ra.unlocks.length}
                  </span>
                </div>
                <div className="divide-y divide-slate-800/70 text-xs">
                  {activeGameAchievements.map((ach) => {
                    const unlockInfo = ra.unlocks.find((u) => u.achievementId === ach.id);
                    return (
                      <div
                        key={ach.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{ach.title}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-mono text-[10px]">
                              {ach.points} pts
                            </span>
                            {unlockInfo && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                  unlockInfo.hardcore
                                    ? 'bg-amber-950 text-amber-300 border border-amber-600/60'
                                    : 'bg-emerald-950 text-emerald-300 border border-emerald-600/60'
                                }`}
                              >
                                {unlockInfo.hardcore ? 'UNLOCKED (HARDCORE)' : 'UNLOCKED'}
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400 mt-0.5">{ach.description}</div>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 shrink-0">
                          ID #{ach.id}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 text-xs text-slate-400">
          <span>
            Built-in Solitaire Score ($FEE0):{' '}
            <strong className="text-white font-mono">{hs.solitaireScore}</strong> · Total Profiles:{' '}
            <strong className="text-emerald-400 font-mono">{hs.profiles.length}</strong> · Verified
            Leaderboard Entries:{' '}
            <strong className="text-amber-400 font-mono">{lb.entries.length}</strong>
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
