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
import { calculateMd5Hex, resolveKnownGameByGameIdOrTitle } from './cartridge';

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

interface LeaderboardAdminLocalConfig {
  username: string;
  passwordHash: string;
  isDefaultPassword: boolean;
}

const ONLINE_LB_CACHE_KEY = 'cub_spiele_online_leaderboard_cache_v1';
const ONLINE_LB_ENDPOINT_KEY = 'cub_spiele_online_lb_endpoint_v1';
const ONLINE_LB_ADMIN_CONFIG_KEY = 'cub_spiele_lb_admin_config_v1';
const ONLINE_LB_USER_ACCOUNTS_KEY = 'cub_spiele_lb_user_accounts_v1';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'cubspiele-admin';

interface LocalUserAccountRecord {
  username: string;
  passwordHash: string;
  fingerprints: string[];
  token: string;
  updatedAt: number;
}

export function isDefaultPlayerProfileName(name: string = ''): boolean {
  const norm = name.trim().toLowerCase();
  return !norm || norm === 'player 1' || norm === 'player 2' || norm === 'admin';
}

export function normalizeLeaderboardGameTitle(title: string = '', biosTitle: string = ''): string {
  const check = (val: string) => {
    const norm = val.toUpperCase().replace(/\s+/g, ' ').trim();
    const compact = norm.replace(/\s+/g, '');
    return /^SONIC\s*3(?:\b|$)/.test(norm) || compact === 'SONIC3';
  };
  if (check(biosTitle) || check(title)) {
    return 'SONIC 3';
  }
  return title || biosTitle || 'Game.Com';
}

/**
 * Utility / modem / settings cartridges (such as Internet $0313 and Tiger Web Link $0208)
 * share the $FC60-$FEDF BIOS NVRAM slot table to persist phone numbers/baud rate or transfer metadata
 * with a blank space score byte (which decodes to 0). Keep those raw slots in NVRAM, but exclude
 * them from Competitive Score Leaderboards so they never pollute rankings with "0" entries.
 */
export function isNonScoringUtilitySave(
  gameId: number,
  title: string = '',
  scoreText: string = '',
  numericScore: number = 0
): boolean {
  const norm = title.trim().toUpperCase();
  if (gameId === 0x0313 || norm === 'INTERNET') {
    return true;
  }
  const cleanScore = scoreText.trim();
  const hasZeroScore = numericScore <= 0 && (!cleanScore || cleanScore === '0');
  if ((gameId === 0x0208 || norm === 'WEB LINK' || norm === 'TIGER WEB LINK') && hasZeroScore) {
    return true;
  }
  return false;
}

export class OnlineLeaderboardManager {
  public entries: OnlineLeaderboardEntry[] = [];
  public customEndpointUrl: string = '';
  public lastSyncAt: number = 0;
  public syncStatus: 'idle' | 'syncing' | 'online' | 'local_only' = 'idle';
  public adminLoggedIn: boolean = false;
  public adminUsername: string = DEFAULT_ADMIN_USERNAME;
  public adminSessionToken: string = '';
  private broadcastChannel: BroadcastChannel | null = null;
  private onUpdateCallback?: () => void;

  constructor(onUpdate?: () => void) {
    this.onUpdateCallback = onUpdate;
    this.loadCache();
    this.initBroadcastChannel();
    this.syncWithServer().catch(() => {});
  }

  private getRelayEndpoints(): string[] {
    const endpoints = ['/api/leaderboards', 'http://localhost:3197/api/leaderboards'];
    if (this.customEndpointUrl.trim()) {
      endpoints.unshift(this.customEndpointUrl.trim().replace(/\/+$/, ''));
    }
    return endpoints;
  }

  private static hashLocalAdminPassword(password: string): string {
    return calculateMd5Hex(`CUB_SPIELE_LOCAL_ADMIN_V1:${password}`).toUpperCase();
  }

  private loadOrInitLocalAdminConfig(): LeaderboardAdminLocalConfig {
    try {
      const raw = localStorage.getItem(ONLINE_LB_ADMIN_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.username && parsed.passwordHash) {
          return {
            username: String(parsed.username),
            passwordHash: String(parsed.passwordHash),
            isDefaultPassword: Boolean(parsed.isDefaultPassword)
          };
        }
      }
    } catch {
      // ignore storage errors
    }
    const initCfg: LeaderboardAdminLocalConfig = {
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash: OnlineLeaderboardManager.hashLocalAdminPassword(DEFAULT_ADMIN_PASSWORD),
      isDefaultPassword: true
    };
    this.saveLocalAdminConfig(initCfg);
    return initCfg;
  }

  private saveLocalAdminConfig(cfg: LeaderboardAdminLocalConfig) {
    try {
      localStorage.setItem(ONLINE_LB_ADMIN_CONFIG_KEY, JSON.stringify(cfg));
    } catch {
      // ignore storage errors
    }
  }

  public isUsingDefaultAdminPassword(): boolean {
    return this.loadOrInitLocalAdminConfig().isDefaultPassword;
  }

  public getConfiguredAdminUsername(): string {
    return this.loadOrInitLocalAdminConfig().username;
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
          if (!data) return;
          if (data.type === 'NEW_VERIFIED_SCORE' && data.entry) {
            this.ingestEntry(data.entry, false);
            this.onUpdateCallback?.();
          } else if (data.type === 'ADMIN_DELETE_ENTRY' && data.entryId) {
            this.entries = this.entries.filter((e) => e.id !== data.entryId);
            this.saveCache();
            this.onUpdateCallback?.();
          } else if (data.type === 'ADMIN_RESET') {
            this.applyLocalResetFilter(data.scope || 'all', data.gameId);
            this.saveCache();
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
          this.entries = parsed
            .filter(
              (e) =>
                e &&
                typeof e.gameId === 'number' &&
                typeof e.numericScore === 'number' &&
                Number.isFinite(e.numericScore) &&
                e.numericScore > 0 &&
                !isDefaultPlayerProfileName(e.playerName || '') &&
                e.verification &&
                !isNonScoringUtilitySave(
                  e.gameId,
                  e.biosTitle || e.gameTitle || '',
                  e.scoreText || '',
                  e.numericScore || 0
                )
            )
            .map((e) => {
              const known = resolveKnownGameByGameIdOrTitle(
                e.gameId,
                e.biosTitle || e.gameTitle
              );
              const rawTitle = known ? known.title : e.gameTitle;
              return {
                ...e,
                gameTitle: normalizeLeaderboardGameTitle(rawTitle, e.biosTitle)
              };
            });
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
    if (isDefaultPlayerProfileName(entry.playerName || '')) {
      return {
        accepted: false,
        reason: 'Change your default player profile name before submitting scores to leaderboards.',
        isNewPersonalBest: false
      };
    }

    if (
      typeof entry.numericScore !== 'number' ||
      !Number.isFinite(entry.numericScore) ||
      entry.numericScore <= 0
    ) {
      return {
        accepted: false,
        reason: 'Scores of 0 or less are not accepted on leaderboards.',
        isNewPersonalBest: false
      };
    }

    // Prevent unverified duplicate-name impersonation across distinct userFingerprints
    if (entry.source === 'local_user') {
      const cleanLower = entry.playerName.trim().toLowerCase();
      const collision = this.entries.find(
        (e) =>
          e.playerName.trim().toLowerCase() === cleanLower &&
          e.userFingerprint !== entry.userFingerprint
      );
      if (collision && !this.hasVerifiedAccountOwnership(cleanLower, entry.userFingerprint)) {
        return {
          accepted: false,
          reason: `Username "${entry.playerName.trim()}" belongs to another player. Verify its account password to claim it or choose another name.`,
          isNewPersonalBest: false
        };
      }
    }

    if (
      isNonScoringUtilitySave(
        entry.gameId,
        entry.biosTitle || entry.gameTitle || '',
        entry.scoreText || '',
        entry.numericScore || 0
      )
    ) {
      return {
        accepted: false,
        reason: 'Utility / configuration NVRAM save slot does not participate in score leaderboards.',
        isNewPersonalBest: false
      };
    }

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
      gameTitle: normalizeLeaderboardGameTitle(
        known ? known.title : entry.gameTitle || entry.biosTitle,
        entry.biosTitle
      ),
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
    entry: OnlineLeaderboardEntry,
    accountToken?: string
  ): Promise<{ syncedOnline: boolean; message: string }> {
    const localRes = this.ingestEntry(entry, true);
    if (!localRes.accepted) {
      return { syncedOnline: false, message: localRes.reason };
    }

    const endpoints = this.getRelayEndpoints();
    const userToken = accountToken || this.getStoredUserToken(entry.playerName);

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(userToken ? { 'X-User-Token': userToken } : {})
          },
          body: JSON.stringify({ entry, accountToken: userToken || undefined })
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
    const endpoints = this.getRelayEndpoints();

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

  /**
   * Authenticates an administrator for leaderboard score moderation, deletion, and resets.
   * Validates against the active Leaderboard Relay server when reachable, or local admin credentials offline.
   */
  public async loginAdmin(
    username: string,
    password: string
  ): Promise<{ ok: boolean; message: string; syncedServer: boolean }> {
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      return { ok: false, message: 'Enter both admin username and password.', syncedServer: false };
    }

    for (const base of this.getRelayEndpoints()) {
      try {
        const res = await fetch(`${base}/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUser, password })
        });
        if (res.status === 401 || res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          return {
            ok: false,
            message: errData?.error || 'Invalid leaderboard admin credentials.',
            syncedServer: true
          };
        }
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data?.token) {
            this.adminLoggedIn = true;
            this.adminUsername = String(data.username || cleanUser);
            this.adminSessionToken = String(data.token);
            this.saveLocalAdminConfig({
              username: this.adminUsername,
              passwordHash: OnlineLeaderboardManager.hashLocalAdminPassword(password),
              isDefaultPassword: Boolean(data.isDefaultPassword)
            });
            this.onUpdateCallback?.();
            return {
              ok: true,
              message: `Signed in to Leaderboard Admin Console as "${this.adminUsername}".`,
              syncedServer: true
            };
          }
        }
      } catch {
        // Relay endpoint unreachable — try next or fall back to local verification
      }
    }

    const localCfg = this.loadOrInitLocalAdminConfig();
    const userMatch = cleanUser.toLowerCase() === localCfg.username.toLowerCase();
    const passMatch =
      OnlineLeaderboardManager.hashLocalAdminPassword(password) === localCfg.passwordHash;
    if (!userMatch || !passMatch) {
      return {
        ok: false,
        message: 'Invalid leaderboard admin username or password.',
        syncedServer: false
      };
    }

    this.adminLoggedIn = true;
    this.adminUsername = localCfg.username;
    this.adminSessionToken = `LOCAL-${calculateMd5Hex(`${localCfg.username}:${Date.now()}`).toUpperCase()}`;
    this.onUpdateCallback?.();
    return {
      ok: true,
      message: `Signed in to Local Admin Console as "${this.adminUsername}".`,
      syncedServer: false
    };
  }

  public logoutAdmin() {
    this.adminLoggedIn = false;
    this.adminSessionToken = '';
    this.onUpdateCallback?.();
  }

  public async changeAdminCredentials(
    currentPassword: string,
    newUsername: string,
    newPassword: string
  ): Promise<{ ok: boolean; message: string; syncedServer: boolean }> {
    if (!this.adminLoggedIn) {
      return { ok: false, message: 'Admin authentication required.', syncedServer: false };
    }
    const cleanNewUser = newUsername.trim() || this.adminUsername;
    if (!newPassword || newPassword.length < 4) {
      return {
        ok: false,
        message: 'New password must be at least 4 characters.',
        syncedServer: false
      };
    }

    const localCfg = this.loadOrInitLocalAdminConfig();
    let syncedServer = false;

    for (const base of this.getRelayEndpoints()) {
      try {
        const res = await fetch(`${base}/admin/password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': this.adminSessionToken,
            Authorization: `Bearer ${this.adminSessionToken}`
          },
          body: JSON.stringify({
            currentPassword,
            newUsername: cleanNewUser,
            newPassword
          })
        });
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          const errData = await res.json().catch(() => ({}));
          return {
            ok: false,
            message: errData?.error || 'Could not update admin password on relay.',
            syncedServer: true
          };
        }
        if (res.ok) {
          const data = await res.json();
          if (data?.ok) {
            if (data.token) this.adminSessionToken = String(data.token);
            syncedServer = true;
            break;
          }
        }
      } catch {
        // Offline / relay unavailable
      }
    }

    if (
      !syncedServer &&
      OnlineLeaderboardManager.hashLocalAdminPassword(currentPassword) !== localCfg.passwordHash
    ) {
      return { ok: false, message: 'Current admin password is incorrect.', syncedServer: false };
    }

    this.adminUsername = cleanNewUser;
    this.saveLocalAdminConfig({
      username: cleanNewUser,
      passwordHash: OnlineLeaderboardManager.hashLocalAdminPassword(newPassword),
      isDefaultPassword: false
    });
    this.onUpdateCallback?.();
    return {
      ok: true,
      message: `Updated admin credentials for "${cleanNewUser}".`,
      syncedServer
    };
  }

  private applyLocalResetFilter(
    scope: 'all' | 'softcore' | 'hardcore' | 'game' | 'zero',
    gameId?: number
  ): number {
    const before = this.entries.length;
    if (scope === 'all') {
      this.entries = [];
    } else if (scope === 'softcore') {
      this.entries = this.entries.filter((e) => Boolean(e.verification?.hardcoreVerified));
    } else if (scope === 'hardcore') {
      this.entries = this.entries.filter((e) => !e.verification?.hardcoreVerified);
    } else if (scope === 'zero') {
      this.entries = this.entries.filter(
        (e) => typeof e.numericScore === 'number' && Number.isFinite(e.numericScore) && e.numericScore > 0
      );
    } else if (scope === 'game' && typeof gameId === 'number') {
      this.entries = this.entries.filter((e) => e.gameId !== gameId);
    }
    return before - this.entries.length;
  }

  /**
   * Deletes an individual score entry from both the local leaderboard cache and connected relays.
   */
  public async adminDeleteEntry(
    entryId: string
  ): Promise<{ ok: boolean; removedCount: number; syncedServer: boolean; message: string }> {
    if (!this.adminLoggedIn) {
      return {
        ok: false,
        removedCount: 0,
        syncedServer: false,
        message: 'Admin sign-in is required to delete scores.'
      };
    }

    const target = this.entries.find((e) => e.id === entryId);
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== entryId);
    const removedLocal = before - this.entries.length;
    this.saveCache();

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'ADMIN_DELETE_ENTRY', entryId });
      } catch {}
    }

    let syncedServer = false;
    for (const base of this.getRelayEndpoints()) {
      try {
        const res = await fetch(`${base}/admin/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': this.adminSessionToken,
            Authorization: `Bearer ${this.adminSessionToken}`
          },
          body: JSON.stringify({
            id: entryId,
            gameId: target?.gameId,
            playerName: target?.playerName,
            numericScore: target?.numericScore,
            signature: target?.verification?.signature
          })
        });
        if (res.ok) {
          syncedServer = true;
          break;
        }
      } catch {
        // Relay offline
      }
    }

    this.onUpdateCallback?.();
    return {
      ok: true,
      removedCount: removedLocal,
      syncedServer,
      message: target
        ? `Deleted ${target.playerName}'s ${target.gameTitle} score (${target.scoreText}).`
        : 'Score entry deleted.'
    };
  }

  /**
   * Resets leaderboard scores for the chosen scope ('all' | 'softcore' | 'hardcore' | 'game' | 'zero').
   */
  public async adminResetLeaderboard(
    scope: 'all' | 'softcore' | 'hardcore' | 'game' | 'zero',
    gameId?: number
  ): Promise<{ ok: boolean; removedCount: number; syncedServer: boolean; message: string }> {
    if (!this.adminLoggedIn) {
      return {
        ok: false,
        removedCount: 0,
        syncedServer: false,
        message: 'Admin sign-in is required to reset leaderboard scores.'
      };
    }

    const removedLocal = this.applyLocalResetFilter(scope, gameId);
    this.saveCache();

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'ADMIN_RESET', scope, gameId });
      } catch {}
    }

    let syncedServer = false;
    for (const base of this.getRelayEndpoints()) {
      try {
        const res = await fetch(`${base}/admin/reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': this.adminSessionToken,
            Authorization: `Bearer ${this.adminSessionToken}`
          },
          body: JSON.stringify({ scope, gameId })
        });
        if (res.ok) {
          syncedServer = true;
          break;
        }
      } catch {
        // Relay offline
      }
    }

    this.onUpdateCallback?.();
    const label =
      scope === 'all'
        ? 'all leaderboard scores'
        : scope === 'softcore'
          ? 'Softcore leaderboard scores'
          : scope === 'hardcore'
            ? 'Hardcore leaderboard scores'
            : scope === 'zero'
              ? 'zero/non-positive scores'
              : `scores for game $${(gameId ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
    return {
      ok: true,
      removedCount: removedLocal,
      syncedServer,
      message: `Reset ${label} (removed ${removedLocal} local entry/entries${syncedServer ? ' + synced server relay' : ''}).`
    };
  }

  private static hashUserPassword(password: string): string {
    return calculateMd5Hex(`CUB_SPIELE_USER_ACCT_V1:${password}`).toUpperCase();
  }

  private loadUserAccounts(): Record<string, LocalUserAccountRecord> {
    try {
      const raw = localStorage.getItem(ONLINE_LB_USER_ACCOUNTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return {};
  }

  private saveUserAccounts(accounts: Record<string, LocalUserAccountRecord>) {
    try {
      localStorage.setItem(ONLINE_LB_USER_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {
      // ignore storage errors
    }
  }

  public getStoredUserToken(username: string): string {
    const key = username.trim().toLowerCase();
    if (!key) return '';
    return this.loadUserAccounts()[key]?.token || '';
  }

  public hasVerifiedAccountOwnership(username: string, userFingerprint: string): boolean {
    const key = username.trim().toLowerCase();
    if (!key) return false;
    const acct = this.loadUserAccounts()[key];
    return Boolean(acct && acct.fingerprints.includes(userFingerprint));
  }

  /**
   * Claims a new custom player username with a password, or verifies ownership of an existing
   * username with its account password to prevent duplicate username impersonation.
   */
  public async claimPlayerAccount(
    username: string,
    password: string,
    userFingerprint: string
  ): Promise<{ ok: boolean; mode?: 'created' | 'verified'; username: string; token?: string; message: string }> {
    const cleanName = username.trim().slice(0, 24);
    if (isDefaultPlayerProfileName(cleanName) || cleanName.length < 2) {
      return {
        ok: false,
        username: cleanName,
        message: 'Choose a custom player name (at least 2 characters, not Player 1 / Player 2 / admin).'
      };
    }
    if (!password || password.length < 4) {
      return {
        ok: false,
        username: cleanName,
        message: 'Account password must be at least 4 characters.'
      };
    }

    const accounts = this.loadUserAccounts();
    const key = cleanName.toLowerCase();
    const passHash = OnlineLeaderboardManager.hashUserPassword(password);

    for (const base of this.getRelayEndpoints()) {
      try {
        const res = await fetch(`${base}/users/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanName, password, userFingerprint })
        });
        if (res.status === 400 || res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          return {
            ok: false,
            username: cleanName,
            message: errData?.error || 'Username could not be claimed.'
          };
        }
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data?.token) {
            const fps = new Set<string>(accounts[key]?.fingerprints || []);
            if (userFingerprint) fps.add(userFingerprint);
            accounts[key] = {
              username: String(data.username || cleanName),
              passwordHash: passHash,
              fingerprints: Array.from(fps),
              token: String(data.token),
              updatedAt: Date.now()
            };
            this.saveUserAccounts(accounts);
            return {
              ok: true,
              mode: data.mode === 'verified' ? 'verified' : 'created',
              username: String(data.username || cleanName),
              token: String(data.token),
              message:
                data.mode === 'verified'
                  ? `Verified ownership of "${data.username || cleanName}".`
                  : `Registered player name "${data.username || cleanName}".`
            };
          }
        }
      } catch {
        // Relay unreachable — fall back to local account registry verification
      }
    }

    const existing = accounts[key];
    if (existing) {
      if (existing.passwordHash !== passHash) {
        return {
          ok: false,
          username: cleanName,
          message: `Username "${existing.username}" is already registered. Enter its account password or choose another name.`
        };
      }
      if (userFingerprint && !existing.fingerprints.includes(userFingerprint)) {
        existing.fingerprints.push(userFingerprint);
      }
      existing.updatedAt = Date.now();
      this.saveUserAccounts(accounts);
      return {
        ok: true,
        mode: 'verified',
        username: existing.username,
        token: existing.token,
        message: `Verified ownership of "${existing.username}".`
      };
    }

    // Also guard against claiming a name already present on leaderboard under another fingerprint offline
    const lbCollision = this.entries.find(
      (e) =>
        e.playerName.trim().toLowerCase() === key &&
        e.userFingerprint !== userFingerprint
    );
    if (lbCollision) {
      return {
        ok: false,
        username: cleanName,
        message: `Username "${lbCollision.playerName}" is already in use on the leaderboard by another player.`
      };
    }

    const localToken = `USR-${calculateMd5Hex(`${cleanName}:${userFingerprint}:${Date.now()}`).toUpperCase()}`;
    accounts[key] = {
      username: cleanName,
      passwordHash: passHash,
      fingerprints: userFingerprint ? [userFingerprint] : [],
      token: localToken,
      updatedAt: Date.now()
    };
    this.saveUserAccounts(accounts);
    return {
      ok: true,
      mode: 'created',
      username: cleanName,
      token: localToken,
      message: `Registered player name "${cleanName}".`
    };
  }
}
