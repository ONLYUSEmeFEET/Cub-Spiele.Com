/**
 * Cub Spiele.Com — Online Competitive Leaderboard & Cryptographic Score Certificate Engine
 *
 * Provides:
 * 1. Real-time Online Leaderboard synchronization via HTTP REST (/api/leaderboards),
 *    configurable remote/cloud endpoint, and cross-instance BroadcastChannel sync.
 * 2. Strict cryptographic & Hardcore Mode validation (rejects tampered scores or save-state runs
 *    from Ranked Hardcore Leaderboards).
 * 3. Portable Signed Score Certificates (CSC1-...) for zero-trust peer-to-peer score sharing.
 */

import {
  RetroAchievementsEngine,
  ScoreVerificationProof
} from './retroAchievements';
import { resolveKnownGameByGameIdOrTitle } from './cartridge';

export interface OnlineLeaderboardEntry {
  id: string;
  gameId: number;       // 16-bit TigerDMGC Game ID (e.g. $0917 = Lights Out, $FEE0 = Solitaire)
  gameTitle: string;    // Full resolved game title
  biosTitle: string;    // 11-char BIOS NVRAM title
  playerName: string;   // Player handle
  userFingerprint: string; // Cryptographic user/device ID (e.g. CSC-8F3A-91C2)
  scoreText: string;
  numericScore: number;
  submittedAt: number;
  source: 'local_user' | 'imported_user' | 'online_server' | 'retroachievements';
  verification: ScoreVerificationProof;
  rawSlot?: number[];
}

const ONLINE_LB_CACHE_KEY = 'cub_spiele_online_leaderboard_cache_v1';
const ONLINE_LB_ENDPOINT_KEY = 'cub_spiele_online_lb_endpoint_v1';

export class OnlineLeaderboardManager {
  public entries: OnlineLeaderboardEntry[] = [];
  public customEndpointUrl: string = '';
  public lastSyncAt: number = 0;
  public syncStatus: 'idle' | 'syncing' | 'online' | 'local_only' = 'idle';
  private broadcastChannel: BroadcastChannel | null = null;
  private onUpdateCallback?: () => void;

  constructor(onUpdate?: () => void) {
    this.onUpdateCallback = onUpdate;
    this.loadCache();
    this.initBroadcastChannel();
    this.syncWithServer().catch(() => {});
  }

  public setOnUpdate(cb: () => void) {
    this.onUpdateCallback = cb;
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('cub_spiele_online_leaderboard_v1');
        this.broadcastChannel.onmessage = (ev) => {
          const data = ev.data;
          if (data && data.type === 'NEW_VERIFIED_SCORE' && data.entry) {
            this.ingestEntry(data.entry, false);
            this.onUpdateCallback?.();
          }
        };
      } catch {
        // Ignore BroadcastChannel errors
      }
    }
  }

  private loadCache() {
    try {
      const savedEndpoint = localStorage.getItem(ONLINE_LB_ENDPOINT_KEY);
      if (savedEndpoint) {
        this.customEndpointUrl = savedEndpoint;
      }
      const raw = localStorage.getItem(ONLINE_LB_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.entries = parsed.filter((e) => e && typeof e.gameId === 'number' && e.verification);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  public saveCache() {
    try {
      localStorage.setItem(ONLINE_LB_CACHE_KEY, JSON.stringify(this.entries.slice(0, 500)));
      if (this.customEndpointUrl) {
        localStorage.setItem(ONLINE_LB_ENDPOINT_KEY, this.customEndpointUrl);
      } else {
        localStorage.removeItem(ONLINE_LB_ENDPOINT_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Validates and ingests a leaderboard entry, keeping the highest score per
   * (gameId, userFingerprint, playerName, hardcoreVerified) tuple.
   */
  public ingestEntry(
    entry: OnlineLeaderboardEntry,
    broadcast: boolean = true
  ): { accepted: boolean; reason: string; isNewPersonalBest: boolean } {
    const check = RetroAchievementsEngine.verifyScoreProof(
      entry.gameId,
      entry.numericScore,
      entry.scoreText,
      entry.verification
    );

    if (!check.validSignature) {
      return {
        accepted: false,
        reason: check.reason,
        isNewPersonalBest: false
      };
    }

    const known = resolveKnownGameByGameIdOrTitle(entry.gameId, entry.biosTitle || entry.gameTitle);
    const normalizedEntry: OnlineLeaderboardEntry = {
      ...entry,
      gameTitle: known ? known.title : entry.gameTitle || entry.biosTitle,
      biosTitle: (entry.biosTitle || entry.gameTitle || 'Game.Com').slice(0, 11),
      playerName: (entry.playerName || 'Player 1').trim().slice(0, 24),
      verification: {
        ...entry.verification,
        hardcoreVerified: check.isHardcoreLegit
      }
    };

    const existingIdx = this.entries.findIndex(
      (e) =>
        e.gameId === normalizedEntry.gameId &&
        e.userFingerprint === normalizedEntry.userFingerprint &&
        e.playerName.toLowerCase() === normalizedEntry.playerName.toLowerCase() &&
        e.verification.hardcoreVerified === normalizedEntry.verification.hardcoreVerified
    );

    let isNewPersonalBest = false;
    if (existingIdx >= 0) {
      const prev = this.entries[existingIdx];
      if (normalizedEntry.numericScore >= prev.numericScore) {
        isNewPersonalBest = normalizedEntry.numericScore > prev.numericScore;
        this.entries[existingIdx] = normalizedEntry;
      } else {
        return {
          accepted: true,
          reason: 'Existing verified score for this player is already higher.',
          isNewPersonalBest: false
        };
      }
    } else {
      isNewPersonalBest = true;
      this.entries.push(normalizedEntry);
    }

    // Sort highest score first, prioritizing Hardcore Verified on ties
    this.entries.sort((a, b) => {
      if (b.numericScore !== a.numericScore) return b.numericScore - a.numericScore;
      if (a.verification.hardcoreVerified !== b.verification.hardcoreVerified) {
        return a.verification.hardcoreVerified ? -1 : 1;
      }
      return a.submittedAt - b.submittedAt;
    });

    this.saveCache();

    if (broadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'NEW_VERIFIED_SCORE',
          entry: normalizedEntry
        });
      } catch {}
    }

    return {
      accepted: true,
      reason: check.reason,
      isNewPersonalBest
    };
  }

  /**
   * Submits a verified score to the Online Leaderboard Server (/api/leaderboards + optional custom endpoint).
   */
  public async submitScoreOnline(
    entry: OnlineLeaderboardEntry
  ): Promise<{ syncedOnline: boolean; message: string }> {
    const localRes = this.ingestEntry(entry, true);
    if (!localRes.accepted) {
      return { syncedOnline: false, message: localRes.reason };
    }

    const endpoints = ['/api/leaderboards', 'http://localhost:3197/api/leaderboards'];
    if (this.customEndpointUrl.trim()) {
      endpoints.unshift(this.customEndpointUrl.trim());
    }

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.entries)) {
            for (const remoteEntry of data.entries) {
              this.ingestEntry(remoteEntry, false);
            }
          }
          this.syncStatus = 'online';
          this.lastSyncAt = Date.now();
          this.onUpdateCallback?.();
          return {
            syncedOnline: true,
            message: `Synced to Online Leaderboard (${entry.verification.hardcoreVerified ? 'Hardcore Verified' : 'Softcore'})`
          };
        }
      } catch {
        // Fallback to local/peer cache if server unreachable
      }
    }

    this.syncStatus = 'local_only';
    return {
      syncedOnline: false,
      message: `Saved to Verified Leaderboard Vault (${localRes.reason})`
    };
  }

  /**
   * Fetches the latest global leaderboard rankings from the Online Leaderboard Server.
   */
  public async syncWithServer(): Promise<{ ok: boolean; count: number }> {
    this.syncStatus = 'syncing';
    const endpoints = ['/api/leaderboards', 'http://localhost:3197/api/leaderboards'];
    if (this.customEndpointUrl.trim()) {
      endpoints.unshift(this.customEndpointUrl.trim());
    }

    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.entries)) {
            for (const remoteEntry of data.entries) {
              this.ingestEntry(remoteEntry, false);
            }
            this.syncStatus = 'online';
            this.lastSyncAt = Date.now();
            this.onUpdateCallback?.();
            return { ok: true, count: this.entries.length };
          }
        }
      } catch {
        // Try next endpoint
      }
    }

    this.syncStatus = 'local_only';
    return { ok: false, count: this.entries.length };
  }

  /**
   * Renames a player across all their own local entries (matching their userFingerprint)
   * and re-seals the cryptographic verification proof for this user's own scores.
   */
  public renameOwnPlayerEntries(
    userFingerprint: string,
    oldName: string,
    newName: string,
    raEngine: RetroAchievementsEngine
  ) {
    const cleanNew = newName.trim().slice(0, 24);
    if (!cleanNew) return;

    for (const entry of this.entries) {
      if (
        entry.userFingerprint === userFingerprint &&
        (!oldName || entry.playerName.toLowerCase() === oldName.toLowerCase())
      ) {
        entry.playerName = cleanNew;
        // Re-sign with the user's own device identity
        const prevProof = entry.verification;
        const savedSession = { ...raEngine.session };
        raEngine.session = {
          ...raEngine.session,
          sessionId: prevProof.sessionId,
          hardcoreActive: prevProof.hardcoreVerified,
          saveStateLoaded: prevProof.saveStateUsed,
          slowdownUsed: prevProof.slowdownUsed,
          debuggerUsed: prevProof.debuggerUsed,
          framesExecuted: prevProof.sessionFrames,
          inputEventCount: prevProof.inputCount,
          inputRollingHash: parseInt(prevProof.inputHash, 16) || 0x811c9dc5,
          activeRomMd5: prevProof.romMd5,
          activeRomCrc32: prevProof.romCrc32
        };
        entry.verification = raEngine.createScoreProof(
          entry.gameId,
          entry.numericScore,
          entry.scoreText,
          cleanNew
        );
        raEngine.session = savedSession;
      }
    }
    this.saveCache();
  }

  /**
   * Encodes a single verified score entry into a portable, tamper-evident Certificate Code (CSC1-...)
   * that can be shared with other players and imported into their leaderboard.
   */
  public static encodeScoreCertificate(entry: OnlineLeaderboardEntry): string {
    const json = JSON.stringify(entry);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return `CSC1-${btoa(bin)}`;
  }

  /**
   * Decodes and cryptographically verifies a shared Score Certificate (CSC1-...).
   */
  public importScoreCertificate(certString: string): {
    ok: boolean;
    entry?: OnlineLeaderboardEntry;
    message: string;
  } {
    const trimmed = certString.trim();
    if (!trimmed.startsWith('CSC1-')) {
      return { ok: false, message: 'Invalid certificate prefix (expected CSC1-...).' };
    }
    try {
      const b64 = trimmed.slice(5);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as OnlineLeaderboardEntry;
      if (!parsed || typeof parsed.gameId !== 'number' || !parsed.verification) {
        return { ok: false, message: 'Malformed score certificate payload.' };
      }

      const verifyRes = RetroAchievementsEngine.verifyScoreProof(
        parsed.gameId,
        parsed.numericScore,
        parsed.scoreText,
        parsed.verification
      );
      if (!verifyRes.validSignature) {
        return {
          ok: false,
          message: `Rejected tampered certificate: ${verifyRes.reason}`
        };
      }

      const importedEntry: OnlineLeaderboardEntry = {
        ...parsed,
        source: 'imported_user'
      };
      const ingest = this.ingestEntry(importedEntry, true);
      if (!ingest.accepted) {
        return { ok: false, message: ingest.reason };
      }

      return {
        ok: true,
        entry: importedEntry,
        message: `Verified & imported ${importedEntry.playerName}'s ${importedEntry.gameTitle} score (${importedEntry.scoreText})!`
      };
    } catch (err) {
      return {
        ok: false,
        message: `Certificate decode failed: ${(err as Error).message}`
      };
    }
  }

  /**
   * Returns ranked leaderboard entries filtered by gameId and Hardcore verification status.
   */
  public getLeaderboardForGame(
    gameIdFilter: number | 'ALL',
    hardcoreOnly: boolean = false
  ): OnlineLeaderboardEntry[] {
    return this.entries
      .filter((e) => {
        if (gameIdFilter !== 'ALL' && e.gameId !== gameIdFilter) return false;
        if (hardcoreOnly && !e.verification.hardcoreVerified) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.numericScore !== a.numericScore) return b.numericScore - a.numericScore;
        if (a.verification.hardcoreVerified !== b.verification.hardcoreVerified) {
          return a.verification.hardcoreVerified ? -1 : 1;
        }
        return a.submittedAt - b.submittedAt;
      });
  }

  /**
   * Returns the #1 Best Score for each distinct game across all players.
   */
  public getBestScorePerGameSummary(hardcoreOnly: boolean = false): OnlineLeaderboardEntry[] {
    const bestMap = new Map<number, OnlineLeaderboardEntry>();
    const filtered = this.getLeaderboardForGame('ALL', hardcoreOnly);
    for (const entry of filtered) {
      const existing = bestMap.get(entry.gameId);
      if (!existing || entry.numericScore > existing.numericScore) {
        bestMap.set(entry.gameId, entry);
      }
    }
    return Array.from(bestMap.values()).sort((a, b) => a.gameTitle.localeCompare(b.gameTitle));
  }
}
