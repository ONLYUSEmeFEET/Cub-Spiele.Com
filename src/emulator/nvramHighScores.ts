/**
 * Tiger Game.Com Cycle-Accurate NVRAM High Score, Multi-Player Profile & Competitive Verification Subsystem
 *
 * Hardware Architecture ($E000-$FFFF 8KB Battery-Backed NVRAM):
 * - $E000-$E003: NVRAM Partition Header (F0 00 00 FF)
 * - $F3FC-$F3FF: NVRAM Initialized Signature (AA AA AA AA)
 * - $FC00-$FC23: BIOS System Configuration & Magic Word ($FC22-$FC23 = CD 70)
 * - $FC60-$FEDF: 10 Hardware High Score Slots (10 x 64 bytes = 640 bytes, $0040 per slot)
 *   - Offset +$00..+$01: 16-bit Big-Endian Game ID (matches cartridge header $601A)
 *   - Offset +$02:       Record flags / sub-index ($00)
 *   - Offset +$03..+N:   ASCII Game Title (up to 11 chars), followed by $01 separator,
 *                        followed by ASCII Score/Progress string, $00 terminator, and binary progress data.
 * - $FEE0-$FEE1: Built-in Solitaire 16-bit High Score (Big-Endian)
 *
 * Multi-Player & Competitive Leaderboard Features:
 * - Multiple Named Player Profiles (create, rename, switch, delete), each with its own
 *   Unlimited 10-Slot NVRAM Banks + Built-In Solitaire score.
 * - Cryptographic Score Attestation (ScoreVerificationProof) verifying that scores were
 *   achieved by the user in Hardcore Mode (zero save states, zero slowdown, zero debugger tampering).
 * - Multi-User Import/Export (.json Vaults, .nvram 8KB binaries, and CSC1-... Signed Certificates)
 *   supporting side-by-side multi-player score merging and New Profile creation.
 */

import { NvramPhoneBookManager } from './nvramPhoneBook';
import {
  RetroAchievementsEngine,
  ScoreVerificationProof
} from './retroAchievements';
import {
  OnlineLeaderboardManager,
  OnlineLeaderboardEntry,
  isNonScoringUtilitySave,
  isDefaultPlayerProfileName,
  normalizeLeaderboardGameTitle
} from './onlineLeaderboard';
import { resolveKnownGameByGameIdOrTitle } from './cartridge';

export interface HighScoreRecord {
  gameId: number;       // 16-bit Game ID (e.g. 0x0917 = Lights Out)
  title: string;        // Up to 11 ASCII characters displayed by BIOS High Score screen
  scoreText: string;    // Score or level string displayed by BIOS High Score screen
  numericScore: number; // Parsed numeric value for sorting/comparison
  updatedAt: number;
  rawSlot?: number[];   // Full 64-byte hardware slot snapshot (preserves binary progress bytes after $00 terminator)
  playerName?: string;  // Player profile handle who achieved or imported this score
  playerId?: string;    // Associated PlayerProfile ID
  verification?: ScoreVerificationProof; // Cryptographic Hardcore / legitimacy proof
}

export interface PlayerProfile {
  id: string;
  name: string;
  hasCustomName?: boolean;
  accountToken?: string;
  createdAt: number;
  isImportedProfile?: boolean;
  importedFromFingerprint?: string;
  activeBank: number;
  solitaireScore: number;
  solitaireVerification?: ScoreVerificationProof;
  records: HighScoreRecord[];
}

const NVRAM_RAW_STORAGE_KEY = 'gamecom_nvram_8k_v3';
const HIGH_SCORE_VAULT_KEY = 'gamecom_unlimited_highscores_v3';
const MULTI_PLAYER_PROFILES_KEY = 'cub_spiele_player_profiles_v1';
const HARDCORE_NVRAM_RAW_STORAGE_KEY = 'gamecom_nvram_8k_hardcore_v1';
const HARDCORE_HIGH_SCORE_VAULT_KEY = 'gamecom_unlimited_highscores_hardcore_v1';
const HARDCORE_PROFILES_KEY = 'cub_spiele_player_profiles_hardcore_v1';

export const DEFAULT_HIGH_SCORE_RECORDS: HighScoreRecord[] = [];

export class NvramHighScoreManager {
  public readonly isSecondaryInstance: boolean;
  public isHardcorePartition: boolean = false;
  private nvramRawKey: string;
  private profilesKey: string;
  private vaultKey: string;
  public profiles: PlayerProfile[] = [];
  public activeProfileId: string = 'player_1';
  public records: HighScoreRecord[] = [];
  public solitaireScore: number = 0;
  public activeBank: number = 0; // Each bank maps 10 entries into $FC60-$FEDF

  public raEngine?: RetroAchievementsEngine;
  public onlineLeaderboard?: OnlineLeaderboardManager;
  private onScoreRecordedCallback?: (
    entry: OnlineLeaderboardEntry,
    meta?: { scoreBroken: boolean }
  ) => void;

  constructor(
    raEngine?: RetroAchievementsEngine,
    onlineLeaderboard?: OnlineLeaderboardManager,
    onScoreRecorded?: (
      entry: OnlineLeaderboardEntry,
      meta?: { scoreBroken: boolean }
    ) => void
  ) {
    this.isSecondaryInstance =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('instance') === '2';
    const keys = this.resolvePartitionKeys(false);
    this.nvramRawKey = keys.nvramRawKey;
    this.profilesKey = keys.profilesKey;
    this.vaultKey = keys.vaultKey;
    this.activeProfileId = this.isSecondaryInstance ? 'player_2' : 'player_1';

    this.raEngine = raEngine;
    this.onlineLeaderboard = this.isSecondaryInstance ? undefined : onlineLeaderboard;
    this.onScoreRecordedCallback = this.isSecondaryInstance ? undefined : onScoreRecorded;
    this.loadVault();
  }

  private resolvePartitionKeys(hardcore: boolean): {
    nvramRawKey: string;
    profilesKey: string;
    vaultKey: string;
  } {
    if (this.isSecondaryInstance) {
      return {
        nvramRawKey: 'gamecom_nvram_8k_instance2_v3',
        profilesKey: 'cub_spiele_player_profiles_instance2_v1',
        vaultKey: 'gamecom_unlimited_highscores_instance2_v3'
      };
    }
    if (hardcore) {
      return {
        nvramRawKey: HARDCORE_NVRAM_RAW_STORAGE_KEY,
        profilesKey: HARDCORE_PROFILES_KEY,
        vaultKey: HARDCORE_HIGH_SCORE_VAULT_KEY
      };
    }
    return {
      nvramRawKey: NVRAM_RAW_STORAGE_KEY,
      profilesKey: MULTI_PLAYER_PROFILES_KEY,
      vaultKey: HIGH_SCORE_VAULT_KEY
    };
  }

  /**
   * Switches NVRAM, Profiles, and Vault storage between isolated Softcore and Hardcore partitions.
   * Ensures Softcore saves/scores never leak or duplicate into Hardcore NVRAM or leaderboards.
   */
  public setModePartition(
    hardcore: boolean,
    cpuNvram?: Uint8Array,
    syncBankToCpu: boolean = false,
    saveOutgoing: boolean = true
  ) {
    const nextHardcore = !this.isSecondaryInstance && Boolean(hardcore);
    if (this.isHardcorePartition !== nextHardcore) {
      if (saveOutgoing) {
        if (cpuNvram) {
          this.saveRawNvram(cpuNvram);
        }
        this.saveVault();
      }
      this.isHardcorePartition = nextHardcore;
      const keys = this.resolvePartitionKeys(nextHardcore);
      this.nvramRawKey = keys.nvramRawKey;
      this.profilesKey = keys.profilesKey;
      this.vaultKey = keys.vaultKey;
      this.records = [];
      this.solitaireScore = 0;
      this.activeBank = 0;
      this.loadVault();
    }
    if (cpuNvram && syncBankToCpu) {
      cpuNvram.fill(0);
      this.initializeNvramSignatures(cpuNvram);
    }
  }

  public attachCompetitiveEngines(
    raEngine: RetroAchievementsEngine,
    onlineLeaderboard: OnlineLeaderboardManager,
    onScoreRecorded?: (
      entry: OnlineLeaderboardEntry,
      meta?: { scoreBroken: boolean }
    ) => void
  ) {
    this.raEngine = raEngine;
    if (this.isSecondaryInstance) {
      // Instance #2 uses isolated NVRAM and does not overwrite Instance #1's competitive leaderboard
      return;
    }
    this.onlineLeaderboard = onlineLeaderboard;
    this.onScoreRecordedCallback = onScoreRecorded;
    this.syncAllProfileScoresToLeaderboard();
  }

  public getActiveProfile(): PlayerProfile {
    let found = this.profiles.find((p) => p.id === this.activeProfileId);
    if (!found) {
      if (this.profiles.length === 0) {
        const defaultId = this.isSecondaryInstance ? 'player_2' : 'player_1';
        const defaultName = this.isSecondaryInstance ? 'Player 2' : 'Player 1';
        found = {
          id: defaultId,
          name: defaultName,
          createdAt: Date.now(),
          activeBank: 0,
          solitaireScore: 0,
          records: []
        };
        this.profiles.push(found);
      } else {
        found = this.profiles[0];
      }
      this.activeProfileId = found.id;
    }
    return found;
  }

  private syncActiveFieldsToProfile() {
    const prof = this.getActiveProfile();
    prof.records = this.records;
    prof.solitaireScore = this.solitaireScore;
    prof.activeBank = this.activeBank;
  }

  private syncActiveFieldsFromProfile() {
    const prof = this.getActiveProfile();
    this.records = prof.records;
    this.solitaireScore = prof.solitaireScore;
    this.activeBank = prof.activeBank;
  }

  /**
   * Returns true only after the user has changed their profile name from the default
   * placeholder ('Player 1' / 'Player 2') so default profiles do not submit to leaderboards.
   */
  public isProfileLeaderboardEligible(profile: PlayerProfile = this.getActiveProfile()): boolean {
    if (!profile || profile.isImportedProfile) return false;
    return (
      (Boolean(profile.hasCustomName) || !isDefaultPlayerProfileName(profile.name)) &&
      !isDefaultPlayerProfileName(profile.name)
    );
  }

  /**
   * Creates a new named Player Profile and optionally switches to it.
   */
  public createProfile(
    name: string,
    nvram?: Uint8Array,
    switchToNew: boolean = true,
    accountToken?: string
  ): PlayerProfile {
    const cleanName = name.trim().slice(0, 24) || `Player ${this.profiles.length + 1}`;
    this.syncActiveFieldsToProfile();

    const newProfile: PlayerProfile = {
      id: `prof_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      hasCustomName: !isDefaultPlayerProfileName(cleanName),
      accountToken,
      createdAt: Date.now(),
      activeBank: 0,
      solitaireScore: 0,
      records: []
    };
    this.profiles.push(newProfile);

    if (switchToNew) {
      this.activeProfileId = newProfile.id;
      this.syncActiveFieldsFromProfile();
      if (nvram) {
        this.syncBankToNvram(nvram, 0);
      }
    }
    this.saveVault();
    return newProfile;
  }

  /**
   * Claims/verifies a custom player username with an account password and creates or renames a profile.
   */
  public async claimAndCreateProfile(
    name: string,
    password: string,
    nvram?: Uint8Array,
    switchToNew: boolean = true
  ): Promise<{ ok: boolean; profile?: PlayerProfile; message: string }> {
    const cleanName = name.trim().slice(0, 24);
    const fp = this.raEngine?.getUserFingerprint() || 'CSC-LOCAL';
    if (this.onlineLeaderboard) {
      const claim = await this.onlineLeaderboard.claimPlayerAccount(cleanName, password, fp);
      if (!claim.ok) {
        return { ok: false, message: claim.message };
      }
      const created = this.createProfile(claim.username, nvram, switchToNew, claim.token);
      return { ok: true, profile: created, message: claim.message };
    }
    if (isDefaultPlayerProfileName(cleanName) || cleanName.length < 2) {
      return {
        ok: false,
        message: 'Choose a custom player name (at least 2 characters, not Player 1 / Player 2).'
      };
    }
    const created = this.createProfile(cleanName, nvram, switchToNew);
    return { ok: true, profile: created, message: `Created player profile "${created.name}".` };
  }

  /**
   * Claims/verifies a custom player username with an account password and renames an existing profile.
   */
  public async claimAndRenameProfile(
    profileId: string,
    newName: string,
    password: string
  ): Promise<{ ok: boolean; message: string }> {
    const cleanName = newName.trim().slice(0, 24);
    const prof = this.profiles.find((p) => p.id === profileId);
    if (!prof) {
      return { ok: false, message: 'Player profile not found.' };
    }
    const fp = this.raEngine?.getUserFingerprint() || 'CSC-LOCAL';
    if (this.onlineLeaderboard) {
      const claim = await this.onlineLeaderboard.claimPlayerAccount(cleanName, password, fp);
      if (!claim.ok) {
        return { ok: false, message: claim.message };
      }
      prof.accountToken = claim.token;
      prof.hasCustomName = true;
      this.renameProfile(profileId, claim.username);
      return { ok: true, message: claim.message };
    }
    if (isDefaultPlayerProfileName(cleanName) || cleanName.length < 2) {
      return {
        ok: false,
        message: 'Choose a custom player name (at least 2 characters, not Player 1 / Player 2).'
      };
    }
    prof.hasCustomName = true;
    this.renameProfile(profileId, cleanName);
    return { ok: true, message: `Updated player name to "${cleanName}".` };
  }

  /**
   * Renames an existing Player Profile and updates all associated records & leaderboard entries.
   */
  public renameProfile(profileId: string, newName: string): boolean {
    const cleanName = newName.trim().slice(0, 24);
    if (!cleanName) return false;
    const prof = this.profiles.find((p) => p.id === profileId);
    if (!prof) return false;

    const oldName = prof.name;
    prof.name = cleanName;
    if (!isDefaultPlayerProfileName(cleanName)) {
      prof.hasCustomName = true;
    }

    const resignProof = (
      gameId: number,
      numericScore: number,
      scoreText: string,
      prev: ScoreVerificationProof
    ): ScoreVerificationProof => {
      if (!this.raEngine) return prev;
      const savedSession = { ...this.raEngine.session };
      this.raEngine.session = {
        ...this.raEngine.session,
        sessionId: prev.sessionId,
        hardcoreActive: prev.hardcoreVerified,
        saveStateLoaded: prev.saveStateUsed,
        slowdownUsed: prev.slowdownUsed,
        debuggerUsed: prev.debuggerUsed,
        framesExecuted: prev.sessionFrames,
        inputEventCount: prev.inputCount,
        inputRollingHash: parseInt(prev.inputHash, 16) || 0x811c9dc5,
        activeRomMd5: prev.romMd5,
        activeRomCrc32: prev.romCrc32
      };
      const reSigned = this.raEngine.createScoreProof(gameId, numericScore, scoreText, cleanName);
      this.raEngine.session = savedSession;
      return reSigned;
    };

    for (const rec of prof.records) {
      rec.playerName = cleanName;
      if (rec.verification && !prof.isImportedProfile && this.raEngine) {
        rec.verification = resignProof(
          rec.gameId,
          rec.numericScore,
          rec.scoreText,
          rec.verification
        );
      }
    }
    if (prof.solitaireVerification && !prof.isImportedProfile && this.raEngine) {
      prof.solitaireVerification = resignProof(
        0xfee0,
        prof.solitaireScore,
        String(prof.solitaireScore),
        prof.solitaireVerification
      );
    }

    if (!prof.isImportedProfile && this.raEngine && this.onlineLeaderboard) {
      this.onlineLeaderboard.renameOwnPlayerEntries(
        this.raEngine.getUserFingerprint(),
        oldName,
        cleanName,
        this.raEngine
      );
    }

    if (prof.id === this.activeProfileId) {
      this.records = prof.records;
    }
    this.saveVault();
    this.syncAllProfileScoresToLeaderboard();
    return true;
  }

  /**
   * Renames the player attribution on a specific High Score Record.
   */
  public renameRecordPlayer(recordIndex: number, newPlayerName: string) {
    const clean = newPlayerName.trim().slice(0, 24);
    if (!clean || !this.records[recordIndex]) return;
    const rec = this.records[recordIndex];
    rec.playerName = clean;
    if (rec.verification && this.raEngine && rec.verification.userFingerprint === this.raEngine.getUserFingerprint()) {
      const savedSession = { ...this.raEngine.session };
      const prev = rec.verification;
      this.raEngine.session = {
        ...this.raEngine.session,
        sessionId: prev.sessionId,
        hardcoreActive: prev.hardcoreVerified,
        saveStateLoaded: prev.saveStateUsed,
        slowdownUsed: prev.slowdownUsed,
        debuggerUsed: prev.debuggerUsed,
        framesExecuted: prev.sessionFrames,
        inputEventCount: prev.inputCount,
        inputRollingHash: parseInt(prev.inputHash, 16) || 0x811c9dc5,
        activeRomMd5: prev.romMd5,
        activeRomCrc32: prev.romCrc32
      };
      rec.verification = this.raEngine.createScoreProof(
        rec.gameId,
        rec.numericScore,
        rec.scoreText,
        clean
      );
      this.raEngine.session = savedSession;
    }
    this.syncActiveFieldsToProfile();
    this.saveVault();
    this.syncAllProfileScoresToLeaderboard();
  }

  /**
   * Switches the active Player Profile and maps their High Score bank into live SM8521 NVRAM ($FC60-$FEE1).
   */
  public switchProfile(profileId: string, nvram: Uint8Array): boolean {
    const target = this.profiles.find((p) => p.id === profileId);
    if (!target) return false;
    this.syncActiveFieldsToProfile();
    this.activeProfileId = target.id;
    this.syncActiveFieldsFromProfile();
    this.syncBankToNvram(nvram, this.activeBank);
    this.saveVault();
    return true;
  }

  /**
   * Deletes a Player Profile (keeps at least 1 default profile).
   */
  public deleteProfile(profileId: string, nvram: Uint8Array): boolean {
    if (this.profiles.length <= 1) return false;
    const idx = this.profiles.findIndex((p) => p.id === profileId);
    if (idx < 0) return false;
    this.profiles.splice(idx, 1);
    if (this.activeProfileId === profileId) {
      this.activeProfileId = this.profiles[0].id;
      this.syncActiveFieldsFromProfile();
      this.syncBankToNvram(nvram, this.activeBank);
    }
    this.saveVault();
    return true;
  }

  /**
   * Sanitizes a 64-byte hardware NVRAM slot ($FC60 + slot * $40).
   * Specifically fixes the Lights Out (Game ID $0917) "1?5" starting level bug:
   * Lights Out stores "Lights Out\x01xxx\x00" at +$03..+$11 and 6 raw binary level
   * progress bytes (1..100 for each of the 6 game modes, loaded into $01BC..$01C2)
   * at slot offsets +$12..+$17 immediately after the $00 string terminator.
   */
  public static sanitizeSlot64(slot: Uint8Array): void {
    if (slot.length < 0x40) return;
    const gameId = (slot[0] << 8) | slot[1];
    if (gameId === 0x0917) {
      const expectedTitle = 'Lights Out';
      for (let i = 0; i < expectedTitle.length; i++) {
        slot[0x03 + i] = expectedTitle.charCodeAt(i);
      }
      slot[0x0d] = 0x01;

      let badAscii = false;
      for (let i = 0x0e; i <= 0x10; i++) {
        const b = slot[i];
        if (b === 0x3f || b < 0x20 || b > 0x39) {
          badAscii = true;
        }
      }
      if (badAscii) {
        slot[0x0e] = 0x20; // ' '
        slot[0x0f] = 0x20; // ' '
        slot[0x10] = 0x31; // '1'
      }
      slot[0x11] = 0x00;

      for (let i = 0x12; i <= 0x17; i++) {
        if (slot[i] === 0x00 || slot[i] > 100) {
          slot[i] = 0x01;
        }
      }
    }
  }

  /**
   * Formats the 8KB NVRAM ($E000-$FFFF) with the authentic Tiger Game.Com BIOS
   * initialization signatures so the BIOS recognizes battery-backed SRAM on cold boot
   * without wiping $FC60-$FEDF.
   */
  public initializeNvramSignatures(nvram: Uint8Array) {
    try {
      const savedB64 = localStorage.getItem(this.nvramRawKey);
      if (savedB64) {
        const bin = atob(savedB64);
        if (bin.length === 0x2000) {
          for (let i = 0; i < 0x2000; i++) {
            nvram[i] = bin.charCodeAt(i) & 0xff;
          }
        }
      }
    } catch {
      // Ignore storage errors
    }

    const hasPhoneBookPartition =
      nvram[0xe000 - 0xe000] === 0xf0 &&
      nvram[0xe001 - 0xe000] === 0x00 &&
      nvram[0xe002 - 0xe000] === 0x00 &&
      nvram[0xf3fc - 0xe000] === 0xaa &&
      nvram[0xf3fd - 0xe000] === 0xaa &&
      nvram[0xf3fe - 0xe000] === 0xaa &&
      nvram[0xf3ff - 0xe000] === 0xaa;

    if (!hasPhoneBookPartition) {
      nvram[0xe000 - 0xe000] = 0xf0;
      nvram[0xe001 - 0xe000] = 0x00;
      nvram[0xe002 - 0xe000] = 0x00;
      nvram[0xe003 - 0xe000] = 0xff;

      nvram[0xf3fc - 0xe000] = 0xaa;
      nvram[0xf3fd - 0xe000] = 0xaa;
      nvram[0xf3fe - 0xe000] = 0xaa;
      nvram[0xf3ff - 0xe000] = 0xaa;
    }

    const fc00Init = [
      0x00, 0x00, 0x00, 0x02, 0xc3, 0xff, 0x40, 0xff,
      0x03, 0x00, 0x02, 0x00, 0x20, 0x02, 0xaa, 0xbf,
      0xff, 0x35, 0xc0, 0x00, 0x00, 0x0c, 0x00, 0x15,
      0x55, 0x55, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xcd, 0x70
    ];
    for (let i = 0; i < fc00Init.length; i++) {
      nvram[0xfc00 - 0xe000 + i] = fc00Init[i];
    }

    nvram[0xfee0 - 0xe000] = (this.solitaireScore >> 8) & 0xff;
    nvram[0xfee1 - 0xe000] = this.solitaireScore & 0xff;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const fee2Init = [
      Math.floor(year / 1000) % 10,
      Math.floor(year / 100) % 10,
      Math.floor(year / 10) % 10,
      year % 10,
      Math.floor(month / 10) % 10,
      month % 10
    ];
    for (let i = 0; i < fee2Init.length; i++) {
      nvram[0xfee2 - 0xe000 + i] = fee2Init[i];
    }

    this.syncBankToNvram(nvram, this.activeBank);
  }

  /**
   * Encodes a single HighScoreRecord into the exact 64-byte ($0040) binary format
   * expected by the Tiger Game.Com BIOS at $FC60 + slot * $0040.
   */
  public static encodeSlot64(rec: HighScoreRecord | null): Uint8Array {
    const slot = new Uint8Array(0x40);
    if (!rec || rec.gameId === 0) {
      slot.fill(0x00);
      return slot;
    }

    if (rec.rawSlot && rec.rawSlot.length === 0x40) {
      for (let i = 0; i < 0x40; i++) {
        slot[i] = rec.rawSlot[i] & 0xff;
      }
    } else {
      slot.fill(0x00);
    }

    slot[0] = (rec.gameId >> 8) & 0xff;
    slot[1] = rec.gameId & 0xff;
    slot[2] = 0x00;

    if (rec.gameId === 0x0917) {
      const loTitle = 'Lights Out';
      for (let i = 0; i < loTitle.length; i++) {
        slot[3 + i] = loTitle.charCodeAt(i);
      }
      slot[0x0d] = 0x01;
      const lvlNum = Math.max(1, Math.min(100, rec.numericScore || 1));
      const lvlStr = String(lvlNum).padStart(3, ' ');
      slot[0x0e] = lvlStr.charCodeAt(0);
      slot[0x0f] = lvlStr.charCodeAt(1);
      slot[0x10] = lvlStr.charCodeAt(2);
      slot[0x11] = 0x00;
      NvramHighScoreManager.sanitizeSlot64(slot);
      return slot;
    }

    const cleanTitle = rec.title.slice(0, 11);
    let pos = 3;
    for (let i = 0; i < cleanTitle.length; i++) {
      slot[pos++] = cleanTitle.charCodeAt(i) & 0x7f;
    }

    slot[pos++] = 0x01;
    const cleanScore = rec.scoreText.slice(0, 16);
    for (let i = 0; i < cleanScore.length && pos < 0x3e; i++) {
      slot[pos++] = cleanScore.charCodeAt(i) & 0x7f;
    }
    slot[pos] = 0x00;

    NvramHighScoreManager.sanitizeSlot64(slot);
    return slot;
  }

  /**
   * Decodes a 64-byte ($0040) BIOS High Score slot from $FC60 + slot * $0040.
   */
  public static decodeSlot64(slot: Uint8Array): HighScoreRecord | null {
    if (slot.length < 0x40) return null;
    const gameId = (slot[0] << 8) | slot[1];
    if (gameId === 0x0000 || gameId === 0xffff) return null;

    const cleanSlot = new Uint8Array(slot.subarray(0, 0x40));
    NvramHighScoreManager.sanitizeSlot64(cleanSlot);

    let title = '';
    const scoreSegments: string[] = [];
    let currentSegment = '';
    let inScore = false;

    for (let i = 3; i < 0x40; i++) {
      const b = cleanSlot[i];
      if (b === 0x00 || b === 0xff) {
        break;
      }
      if (b === 0x01) {
        if (inScore && currentSegment.trim()) {
          scoreSegments.push(currentSegment.trim());
          currentSegment = '';
        }
        inScore = true;
        continue;
      }
      if (b >= 32 && b <= 126) {
        if (!inScore) {
          title += String.fromCharCode(b);
        } else {
          currentSegment += String.fromCharCode(b);
        }
      } else if (inScore && currentSegment.trim()) {
        // Control bytes (< 32) between score values act as boundaries, never concatenate digits across them
        scoreSegments.push(currentSegment.trim());
        currentSegment = '';
      }
    }
    if (inScore && currentSegment.trim()) {
      scoreSegments.push(currentSegment.trim());
    }

    title = title.trim();
    if (!title) return null;

    let bestScoreText = scoreSegments[0] || '';
    let bestNumericScore = 0;
    for (const seg of scoreSegments) {
      const matches = seg.match(/\d[\d,]*/g);
      if (matches) {
        for (const m of matches) {
          const val = parseInt(m.replace(/,/g, ''), 10);
          if (Number.isFinite(val) && val > bestNumericScore) {
            bestNumericScore = val;
            bestScoreText = seg;
          }
        }
      }
    }

    const scoreText = bestScoreText;
    const numericScore = bestNumericScore;
    const isUtility = isNonScoringUtilitySave(gameId, title, scoreText, numericScore);

    return {
      gameId,
      title,
      scoreText: scoreText || (isUtility ? 'Config' : '0'),
      numericScore,
      updatedAt: Date.now(),
      rawSlot: Array.from(cleanSlot)
    };
  }

  /**
   * Writes the 10 entries of the specified Virtual Bank (bankIndex * 10 .. bankIndex * 10 + 9)
   * directly into hardware NVRAM at $FC60-$FEDF.
   */
  public syncBankToNvram(nvram: Uint8Array, bankIndex: number = this.activeBank) {
    this.activeBank = Math.max(0, bankIndex);
    const baseOffset = 0xfc60 - 0xe000;
    const startIdx = this.activeBank * 10;

    for (let slotIdx = 0; slotIdx < 10; slotIdx++) {
      const rec = this.records[startIdx + slotIdx] || null;
      const encoded = NvramHighScoreManager.encodeSlot64(rec);
      nvram.set(encoded, baseOffset + slotIdx * 0x40);
    }

    nvram[0xfee0 - 0xe000] = (this.solitaireScore >> 8) & 0xff;
    nvram[0xfee1 - 0xe000] = this.solitaireScore & 0xff;

    this.syncActiveFieldsToProfile();
    this.saveRawNvram(nvram);
  }

  /**
   * Reads the 10 hardware slots at $FC60-$FEDF from cpu.nvram after the BIOS or a cartridge
   * writes to NVRAM, updating the active Player Profile, generating Hardcore cryptographic proofs,
   * and publishing to the Online Leaderboard and RetroAchievements!
   */
  public syncFromNvram(nvram: Uint8Array) {
    const baseOffset = 0xfc60 - 0xe000;
    const startIdx = this.activeBank * 10;
    let changed = false;
    const activeProfile = this.getActiveProfile();
    const playerName =
      this.raEngine?.config.username || activeProfile.name || 'Player 1';

    for (let slotIdx = 0; slotIdx < 10; slotIdx++) {
      const slotBytes = nvram.subarray(baseOffset + slotIdx * 0x40, baseOffset + (slotIdx + 1) * 0x40);
      NvramHighScoreManager.sanitizeSlot64(slotBytes);
      const decoded = NvramHighScoreManager.decodeSlot64(slotBytes);
      const vaultIdx = startIdx + slotIdx;

      if (decoded) {
        const existing = this.records[vaultIdx];
        const rawChanged =
          !existing?.rawSlot ||
          !decoded.rawSlot ||
          existing.rawSlot.some((b, i) => b !== decoded.rawSlot![i]);

        const scoreChanged =
          !existing ||
          existing.gameId !== decoded.gameId ||
          existing.title !== decoded.title ||
          existing.scoreText !== decoded.scoreText;

        if (scoreChanged || rawChanged) {
          decoded.playerName = playerName;
          decoded.playerId = activeProfile.id;

          if (scoreChanged && this.raEngine) {
            const prevBestForGame = this.records.reduce((max, r) => {
              if (r && r.gameId === decoded.gameId && r.numericScore > max) {
                return r.numericScore;
              }
              return max;
            }, 0);
            const scoreBroken =
              prevBestForGame > 0 && decoded.numericScore > prevBestForGame;
            decoded.verification = this.raEngine.createScoreProof(
              decoded.gameId,
              decoded.numericScore,
              decoded.scoreText,
              playerName
            );
            this.publishVerifiedRecord(decoded, scoreBroken);
          } else if (existing?.verification) {
            decoded.verification = existing.verification;
          }

          this.records[vaultIdx] = decoded;
          changed = true;
        }
      } else if (vaultIdx < this.records.length && slotBytes[0] === 0 && slotBytes[1] === 0) {
        this.records.splice(vaultIdx, 1);
        changed = true;
      }
    }

    const solScore = (nvram[0xfee0 - 0xe000] << 8) | nvram[0xfee1 - 0xe000];
    if (solScore !== this.solitaireScore && solScore < 0xffff) {
      const prevSolScore = this.solitaireScore;
      const isHigher = solScore > this.solitaireScore && solScore > 0;
      const solScoreBroken = prevSolScore > 0 && solScore > prevSolScore;
      this.solitaireScore = solScore;
      changed = true;

      if (isHigher && this.raEngine) {
        const solProof = this.raEngine.createScoreProof(
          0xfee0,
          solScore,
          String(solScore),
          playerName
        );
        activeProfile.solitaireVerification = solProof;
        this.publishVerifiedRecord(
          {
            gameId: 0xfee0,
            title: 'SOLITAIRE',
            scoreText: String(solScore),
            numericScore: solScore,
            updatedAt: Date.now(),
            playerName,
            playerId: activeProfile.id,
            verification: solProof
          },
          solScoreBroken
        );
      }
    }

    if (changed) {
      this.records = this.records.filter(Boolean);
      this.syncActiveFieldsToProfile();
      this.saveVault();
    }
    this.saveRawNvram(nvram);
  }

  private publishVerifiedRecord(rec: HighScoreRecord, scoreBroken: boolean = false) {
    if (!rec.verification) return;
    if (!rec.numericScore || !Number.isFinite(rec.numericScore) || rec.numericScore <= 0) {
      return;
    }
    if (isNonScoringUtilitySave(rec.gameId, rec.title, rec.scoreText, rec.numericScore)) {
      return;
    }
    const prof =
      this.profiles.find((p) => p.id === rec.playerId) || this.getActiveProfile();
    if (!this.isProfileLeaderboardEligible(prof) || isDefaultPlayerProfileName(rec.playerName || '')) {
      return;
    }
    const known = resolveKnownGameByGameIdOrTitle(rec.gameId, rec.title);
    const lbEntry: OnlineLeaderboardEntry = {
      id: `lb_${rec.gameId.toString(16)}_${rec.verification.userFingerprint}_${Date.now()}`,
      gameId: rec.gameId,
      gameTitle: normalizeLeaderboardGameTitle(known ? known.title : rec.title, rec.title),
      biosTitle: rec.title.slice(0, 11),
      playerName: rec.playerName || prof.name,
      userFingerprint: rec.verification.userFingerprint,
      scoreText: rec.scoreText,
      numericScore: rec.numericScore,
      submittedAt: rec.updatedAt || Date.now(),
      source: 'local_user',
      verification: rec.verification,
      rawSlot: rec.rawSlot
    };

    if (this.onlineLeaderboard) {
      this.onlineLeaderboard.submitScoreOnline(lbEntry, prof.accountToken).catch(() => {});
    }
    if (this.raEngine && rec.verification.hardcoreVerified) {
      this.raEngine.submitLeaderboardEntryToRA(rec.gameId, rec.numericScore).catch(() => {});
    }
    this.onScoreRecordedCallback?.(lbEntry, { scoreBroken });
  }

  /**
   * Synchronizes all verified records across all local & imported Player Profiles into the Leaderboard.
   */
  public syncAllProfileScoresToLeaderboard() {
    if (!this.onlineLeaderboard) return;
    for (const prof of this.profiles) {
      if (!prof.isImportedProfile && !this.isProfileLeaderboardEligible(prof)) {
        continue;
      }
      for (const rec of prof.records) {
        if (!rec || !rec.gameId) continue;
        if (!rec.numericScore || !Number.isFinite(rec.numericScore) || rec.numericScore <= 0) {
          continue;
        }
        if (isNonScoringUtilitySave(rec.gameId, rec.title, rec.scoreText, rec.numericScore)) {
          continue;
        }
        const proof = rec.verification;
        if (!proof) continue;
        const known = resolveKnownGameByGameIdOrTitle(rec.gameId, rec.title);
        this.onlineLeaderboard.ingestEntry(
          {
            id: `lb_${rec.gameId.toString(16)}_${proof.userFingerprint}_${prof.id}`,
            gameId: rec.gameId,
            gameTitle: known ? known.title : rec.title,
            biosTitle: rec.title.slice(0, 11),
            playerName: rec.playerName || prof.name,
            userFingerprint: proof.userFingerprint,
            scoreText: rec.scoreText,
            numericScore: rec.numericScore,
            submittedAt: rec.updatedAt || prof.createdAt,
            source: prof.isImportedProfile ? 'imported_user' : 'local_user',
            verification: proof,
            rawSlot: rec.rawSlot
          },
          false
        );
      }

      if (prof.solitaireScore > 0 && prof.solitaireVerification) {
        const proof = prof.solitaireVerification;
        this.onlineLeaderboard.ingestEntry(
          {
            id: `lb_fee0_${proof.userFingerprint}_${prof.id}`,
            gameId: 0xfee0,
            gameTitle: 'Built-In Solitaire (BIOS)',
            biosTitle: 'SOLITAIRE',
            playerName: prof.name,
            userFingerprint: proof.userFingerprint,
            scoreText: String(prof.solitaireScore),
            numericScore: prof.solitaireScore,
            submittedAt: proof.timestamp || prof.createdAt,
            source: prof.isImportedProfile ? 'imported_user' : 'local_user',
            verification: proof
          },
          false
        );
      }
    }
  }

  /**
   * Ensures that when a cartridge is inserted, the High Score Bank containing its 16-bit Game ID
   * (or a bank with an open slot if the current bank has all 10 slots full) is active in $FC60-$FEDF.
   */
  public ensureBankForCartridge(romData: Uint8Array | undefined, nvram: Uint8Array) {
    if (!romData || romData.length < 0x20) return;

    let headerOffset = -1;
    for (const candidate of [0x00000, 0x40000, 0x80000]) {
      if (candidate + 0x20 <= romData.length) {
        const sig = String.fromCharCode(...Array.from(romData.subarray(candidate + 5, candidate + 14)));
        if (sig === 'TigerDMGC') {
          headerOffset = candidate;
          break;
        }
      }
    }
    if (headerOffset < 0) return;

    const gameId16 = (romData[headerOffset + 0x1a] << 8) | romData[headerOffset + 0x1b];
    const gameIdHi = romData[headerOffset + 0x1a];
    if (!gameId16) return;

    const existingIdx = this.records.findIndex(
      (r) =>
        r &&
        (r.gameId === gameId16 ||
          (r.gameId & 0xff) === gameIdHi ||
          ((r.gameId >> 8) & 0xff) === gameIdHi)
    );
    if (existingIdx >= 0) {
      const targetBank = Math.floor(existingIdx / 10);
      if (targetBank !== this.activeBank) {
        this.syncBankToNvram(nvram, targetBank);
      }
      return;
    }

    const currentBankCount = this.records.slice(this.activeBank * 10, (this.activeBank + 1) * 10).length;
    if (currentBankCount >= 10) {
      const openBank = Math.floor(this.records.length / 10);
      this.syncBankToNvram(nvram, openBank);
    }
  }

  public deleteRecord(index: number, nvram: Uint8Array) {
    if (index >= 0 && index < this.records.length) {
      this.records.splice(index, 1);
      this.syncActiveFieldsToProfile();
      this.saveVault();
      const maxBank = Math.max(0, Math.floor((this.records.length - 1) / 10));
      if (this.activeBank > maxBank) {
        this.activeBank = maxBank;
      }
      this.syncBankToNvram(nvram, this.activeBank);
    }
  }

  /**
   * Clears all High Score records in the active profile and resets Solitaire score to 0.
   */
  public clearAllData(nvram: Uint8Array) {
    this.records = [];
    this.solitaireScore = 0;
    this.activeBank = 0;
    this.syncActiveFieldsToProfile();
    this.saveVault();
    this.syncBankToNvram(nvram, 0);
  }

  /**
   * Admin Vault Helper: removes matching score record(s) across all profiles in the active partition
   * so deleted leaderboard scores do not resurrect on subsequent NVRAM syncs.
   */
  public adminPruneVaultScores(
    options: {
      scope: 'entry' | 'all' | 'softcore' | 'hardcore' | 'game' | 'zero';
      gameId?: number;
      playerName?: string;
      numericScore?: number;
      entryHardcore?: boolean;
    },
    nvram: Uint8Array
  ): number {
    // Only touch the matching partition for mode-scoped resets
    if (options.scope === 'softcore' && this.isHardcorePartition) return 0;
    if (options.scope === 'hardcore' && !this.isHardcorePartition) return 0;
    if (
      options.scope === 'entry' &&
      typeof options.entryHardcore === 'boolean' &&
      options.entryHardcore !== this.isHardcorePartition
    ) {
      return 0;
    }

    let removed = 0;
    for (const prof of this.profiles) {
      const before = prof.records.length;
      if (options.scope === 'all' || options.scope === 'softcore' || options.scope === 'hardcore') {
        prof.records = [];
        if (prof.solitaireScore > 0) removed++;
        prof.solitaireScore = 0;
        prof.solitaireVerification = undefined;
      } else if (options.scope === 'game' && typeof options.gameId === 'number') {
        prof.records = prof.records.filter((r) => r.gameId !== options.gameId);
        if (options.gameId === 0xfee0 && prof.solitaireScore > 0) {
          prof.solitaireScore = 0;
          prof.solitaireVerification = undefined;
          removed++;
        }
      } else if (options.scope === 'zero') {
        prof.records = prof.records.filter((r) => r.numericScore > 0);
      } else if (options.scope === 'entry') {
        const targetPlayer = options.playerName?.trim().toLowerCase();
        prof.records = prof.records.filter((r) => {
          const sameGame = options.gameId === undefined || r.gameId === options.gameId;
          const sameScore =
            options.numericScore === undefined || r.numericScore === options.numericScore;
          const samePlayer =
            !targetPlayer ||
            (r.playerName || prof.name || '').trim().toLowerCase() === targetPlayer;
          return !(sameGame && sameScore && samePlayer);
        });
        if (
          options.gameId === 0xfee0 &&
          prof.solitaireScore === options.numericScore &&
          (!targetPlayer || prof.name.trim().toLowerCase() === targetPlayer)
        ) {
          prof.solitaireScore = 0;
          prof.solitaireVerification = undefined;
          removed++;
        }
      }
      removed += before - prof.records.length;
    }

    if (removed > 0) {
      this.syncActiveFieldsFromProfile();
      this.activeBank = 0;
      this.saveVault();
      this.syncBankToNvram(nvram, 0);
    }
    return removed;
  }

  /**
   * Exports all Player Profiles, Unlimited High Score Vault records, Leaderboard entries,
   * Phone Book banks, and the full 8KB battery-backed NVRAM ($E000-$FFFF) as a JSON backup string.
   */
  public exportVaultJson(nvram: Uint8Array, phoneBook?: NvramPhoneBookManager): string {
    this.syncFromNvram(nvram);
    phoneBook?.syncFromNvram(nvram);
    this.syncActiveFieldsToProfile();

    let binary = '';
    for (let i = 0; i < nvram.length; i++) {
      binary += String.fromCharCode(nvram[i]);
    }
    const activeProf = this.getActiveProfile();
    const payload = {
      format: 'CUB_SPIELE_COMPETITIVE_VAULT_V2',
      exportedAt: new Date().toISOString(),
      exportedByPlayer: activeProf.name,
      userFingerprint: this.raEngine?.getUserFingerprint() || 'CSC-LOCAL',
      activeProfileId: this.activeProfileId,
      profiles: this.profiles,
      activeBank: this.activeBank,
      solitaireScore: this.solitaireScore,
      records: this.records,
      leaderboardEntries: this.onlineLeaderboard?.entries || [],
      activePhoneBookBank: phoneBook ? phoneBook.activeBank : 0,
      phoneBookBanks: phoneBook ? phoneBook.banks : undefined,
      nvram8kBase64: btoa(binary)
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Exports the raw 8,192-byte ($E000-$FFFF) battery-backed NVRAM image compatible with MAME gamecom.
   */
  public exportRawNvramBinary(nvram: Uint8Array, phoneBook?: NvramPhoneBookManager): Uint8Array {
    this.syncFromNvram(nvram);
    phoneBook?.syncFromNvram(nvram);
    return new Uint8Array(nvram);
  }

  /**
   * Imports a JSON Vault backup (.json) or raw 8KB NVRAM binary (.nvram, .sav, .bin) from another user.
   *
   * @param mode
   * - 'merge_multiplayer': Keeps all current profiles & scores, creates/updates a profile for the imported
   *   player, and merges all cryptographically verified scores into the Multi-Player Leaderboard!
   * - 'new_profile': Imports the file into a newly created Player Profile and switches to it.
   * - 'overwrite_current': Replaces the active Player Profile's NVRAM bank with the imported data.
   */
  public async importDataFromFile(
    file: File,
    nvram: Uint8Array,
    phoneBook?: NvramPhoneBookManager,
    options?: {
      mode?: 'merge_multiplayer' | 'new_profile' | 'overwrite_current';
      customPlayerName?: string;
    }
  ): Promise<{
    format: 'json' | 'nvram';
    recordsCount: number;
    phoneBookCount: number;
    importedPlayerName: string;
    verifiedCount: number;
  }> {
    const importMode = options?.mode || 'merge_multiplayer';
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    const isJsonName = file.name.toLowerCase().endsWith('.json');
    const startsWithBrace =
      bytes.length > 0 && (bytes[0] === 0x7b || bytes[0] === 0x20 || bytes[0] === 0x0a);

    if (isJsonName || (startsWithBrace && bytes.length !== 0x2000)) {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text);
      if (
        !parsed ||
        (!Array.isArray(parsed.records) &&
          !Array.isArray(parsed.profiles) &&
          !Array.isArray(parsed.leaderboardEntries) &&
          !Array.isArray(parsed.banks) &&
          !Array.isArray(parsed.phoneBookBanks) &&
          typeof parsed.nvram8kBase64 !== 'string')
      ) {
        throw new Error('Invalid Game.Com JSON backup format.');
      }

      const fallbackPlayerName =
        options?.customPlayerName?.trim() ||
        parsed.exportedByPlayer ||
        file.name.replace(/\.[^/.]+$/, '').slice(0, 20) ||
        'Imported Player';

      let verifiedCount = 0;
      let totalImportedRecords = 0;

      // 1. Ingest any signed leaderboardEntries into our Online/Multi-Player Leaderboard
      if (Array.isArray(parsed.leaderboardEntries) && this.onlineLeaderboard) {
        for (const lbEntry of parsed.leaderboardEntries) {
          if (lbEntry && typeof lbEntry.gameId === 'number' && lbEntry.verification) {
            const entryToImport: OnlineLeaderboardEntry = {
              ...lbEntry,
              playerName: options?.customPlayerName?.trim() || lbEntry.playerName || fallbackPlayerName,
              source: 'imported_user'
            };
            const res = this.onlineLeaderboard.ingestEntry(entryToImport, true);
            if (res.accepted) verifiedCount++;
          }
        }
      }

      // 2. Normalize records from parsed.records or parsed.profiles
      const normalizeRecord = (r: HighScoreRecord, pName: string): HighScoreRecord => {
        const cleanRec: HighScoreRecord = {
          gameId: Number(r.gameId) & 0xffff,
          title: String(r.title || 'Game.Com').slice(0, 11),
          scoreText: String(r.scoreText || '0').slice(0, 16),
          numericScore: Number(r.numericScore) || 0,
          updatedAt: Number(r.updatedAt) || Date.now(),
          rawSlot: Array.isArray(r.rawSlot) ? r.rawSlot : undefined,
          playerName: options?.customPlayerName?.trim() || r.playerName || pName,
          verification: r.verification
        };
        if (cleanRec.verification) {
          const check = RetroAchievementsEngine.verifyScoreProof(
            cleanRec.gameId,
            cleanRec.numericScore,
            cleanRec.scoreText,
            cleanRec.verification
          );
          if (check.validSignature) {
            verifiedCount++;
          }
        }
        return cleanRec;
      };

      const incomingRecords: HighScoreRecord[] = Array.isArray(parsed.records)
        ? parsed.records
            .filter((r: HighScoreRecord) => r && typeof r.title === 'string' && typeof r.gameId === 'number')
            .map((r: HighScoreRecord) => normalizeRecord(r, fallbackPlayerName))
        : [];

      totalImportedRecords = incomingRecords.length;

      if (importMode === 'merge_multiplayer' || importMode === 'new_profile') {
        // Create or update a dedicated Player Profile for this imported player
        const importedProf: PlayerProfile = {
          id: `prof_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: fallbackPlayerName,
          createdAt: Date.now(),
          isImportedProfile: true,
          importedFromFingerprint: parsed.userFingerprint || 'EXTERNAL',
          activeBank: typeof parsed.activeBank === 'number' ? Math.max(0, parsed.activeBank) : 0,
          solitaireScore: typeof parsed.solitaireScore === 'number' ? parsed.solitaireScore & 0xffff : 0,
          records: incomingRecords
        };
        this.profiles.push(importedProf);

        if (importMode === 'new_profile') {
          this.activeProfileId = importedProf.id;
          this.syncActiveFieldsFromProfile();
          this.syncBankToNvram(nvram, this.activeBank);
        }
      } else {
        // overwrite_current
        if (typeof parsed.nvram8kBase64 === 'string') {
          const bin = atob(parsed.nvram8kBase64);
          if (bin.length === 0x2000) {
            for (let i = 0; i < 0x2000; i++) {
              nvram[i] = bin.charCodeAt(i) & 0xff;
            }
          }
        }
        this.records = incomingRecords;
        if (typeof parsed.solitaireScore === 'number') {
          this.solitaireScore = parsed.solitaireScore & 0xffff;
        }
        this.activeBank = typeof parsed.activeBank === 'number' ? Math.max(0, parsed.activeBank) : 0;
        this.syncActiveFieldsToProfile();
        this.syncBankToNvram(nvram, this.activeBank);
      }

      let phoneBookCount = 0;
      if (phoneBook) {
        phoneBookCount = phoneBook.importFromParsedJson(parsed, nvram);
      }

      this.saveVault();
      this.syncAllProfileScoresToLeaderboard();
      return {
        format: 'json',
        recordsCount: totalImportedRecords,
        phoneBookCount,
        importedPlayerName: fallbackPlayerName,
        verifiedCount
      };
    }

    // Raw 8KB ($2000) NVRAM binary (.nvram / .sav / .bin)
    if (bytes.length !== 0x2000) {
      throw new Error(
        `Expected 8,192-byte (8KB) NVRAM file or .json Vault, got ${bytes.length} bytes.`
      );
    }

    const importedPlayerName =
      options?.customPlayerName?.trim() ||
      file.name.replace(/\.[^/.]+$/, '').slice(0, 20) ||
      'NVRAM Import';

    const decodedRecords: HighScoreRecord[] = [];
    const baseOffset = 0xfc60 - 0xe000;
    for (let slotIdx = 0; slotIdx < 10; slotIdx++) {
      const slotBytes = bytes.subarray(baseOffset + slotIdx * 0x40, baseOffset + (slotIdx + 1) * 0x40);
      const rec = NvramHighScoreManager.decodeSlot64(slotBytes);
      if (rec) {
        rec.playerName = importedPlayerName;
        decodedRecords.push(rec);
      }
    }

    const solScore = (bytes[0xfee0 - 0xe000] << 8) | bytes[0xfee1 - 0xe000];
    const cleanSolScore = solScore < 0xffff ? solScore : 0;

    if (importMode === 'merge_multiplayer' || importMode === 'new_profile') {
      const importedProf: PlayerProfile = {
        id: `prof_nvram_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: importedPlayerName,
        createdAt: Date.now(),
        isImportedProfile: true,
        activeBank: 0,
        solitaireScore: cleanSolScore,
        records: decodedRecords
      };
      this.profiles.push(importedProf);
      if (importMode === 'new_profile') {
        nvram.set(bytes);
        this.activeProfileId = importedProf.id;
        this.syncActiveFieldsFromProfile();
        this.syncBankToNvram(nvram, 0);
      }
    } else {
      nvram.set(bytes);
      this.records = decodedRecords;
      this.solitaireScore = cleanSolScore;
      this.activeBank = 0;
      this.syncActiveFieldsToProfile();
    }

    let phoneBookCount = 0;
    if (phoneBook && importMode !== 'merge_multiplayer') {
      phoneBook.syncFromNvram(nvram);
      phoneBookCount = phoneBook.getTotalEntriesCount();
    }

    this.saveVault();
    this.saveRawNvram(nvram);
    return {
      format: 'nvram',
      recordsCount: decodedRecords.length,
      phoneBookCount,
      importedPlayerName,
      verifiedCount: 0
    };
  }

  public getTotalBanks(): number {
    return Math.max(1, Math.ceil((this.records.length + 1) / 10));
  }

  public getActiveBankIndex(): number {
    return this.activeBank;
  }

  public getTotalStoredScoresCount(): number {
    return this.profiles.reduce(
      (sum, p) => sum + p.records.length + (p.solitaireScore > 0 ? 1 : 0),
      0
    );
  }

  public loadVault() {
    try {
      const rawProfiles = localStorage.getItem(this.profilesKey);
      if (rawProfiles) {
        const parsedP = JSON.parse(rawProfiles);
        if (parsedP && Array.isArray(parsedP.profiles) && parsedP.profiles.length > 0) {
          this.profiles = parsedP.profiles.map((prof: PlayerProfile) => ({
            ...prof,
            records: Array.isArray(prof.records)
              ? (prof.records
                  .map((r: HighScoreRecord) => {
                    if (!r || !r.gameId) return null;
                    const encoded = NvramHighScoreManager.encodeSlot64(r);
                    const dec = NvramHighScoreManager.decodeSlot64(encoded);
                    if (!dec) return null;
                    return {
                      ...dec,
                      updatedAt: r.updatedAt || dec.updatedAt,
                      playerName: r.playerName || prof.name,
                      playerId: prof.id,
                      verification: r.verification
                    };
                  })
                  .filter(Boolean) as HighScoreRecord[])
              : []
          }));
          this.activeProfileId = parsedP.activeProfileId || this.profiles[0].id;
          this.syncActiveFieldsFromProfile();
          return;
        }
      }

      // Migrate legacy single-profile vault if present (Instance #1 Softcore only)
      const rawLegacy =
        !this.isSecondaryInstance && !this.isHardcorePartition
          ? localStorage.getItem(this.vaultKey)
          : null;
      if (rawLegacy) {
        const parsed = JSON.parse(rawLegacy);
        if (Array.isArray(parsed.records)) {
          const migratedRecords = parsed.records
            .map((r: HighScoreRecord) => {
              if (!r || !r.gameId) return null;
              const encoded = NvramHighScoreManager.encodeSlot64(r);
              const dec = NvramHighScoreManager.decodeSlot64(encoded);
              if (!dec) return null;
              return {
                ...dec,
                playerName: 'Player 1',
                playerId: 'player_1'
              };
            })
            .filter(Boolean) as HighScoreRecord[];
          const sol = typeof parsed.solitaireScore === 'number' ? parsed.solitaireScore : 0;
          this.profiles = [
            {
              id: 'player_1',
              name: 'Player 1',
              createdAt: Date.now(),
              activeBank: 0,
              solitaireScore: sol,
              records: migratedRecords
            }
          ];
          this.activeProfileId = 'player_1';
          this.syncActiveFieldsFromProfile();
          this.saveVault();
          return;
        }
      }
    } catch {
      // Ignore storage error
    }

    const defaultId = this.isSecondaryInstance ? 'player_2' : 'player_1';
    const defaultName = this.isSecondaryInstance ? 'Player 2' : 'Player 1';
    this.profiles = [
      {
        id: defaultId,
        name: defaultName,
        createdAt: Date.now(),
        activeBank: 0,
        solitaireScore: 0,
        records: DEFAULT_HIGH_SCORE_RECORDS.map((r) => ({ ...r }))
      }
    ];
    this.activeProfileId = defaultId;
    this.syncActiveFieldsFromProfile();
  }

  public saveVault() {
    this.syncActiveFieldsToProfile();
    try {
      localStorage.setItem(
        this.profilesKey,
        JSON.stringify({
          activeProfileId: this.activeProfileId,
          profiles: this.profiles
        })
      );
      localStorage.setItem(
        this.vaultKey,
        JSON.stringify({
          records: this.records,
          solitaireScore: this.solitaireScore
        })
      );
    } catch {
      // Ignore storage error
    }
  }

  public saveRawNvram(nvram: Uint8Array) {
    try {
      let binary = '';
      for (let i = 0; i < nvram.length; i++) {
        binary += String.fromCharCode(nvram[i]);
      }
      localStorage.setItem(this.nvramRawKey, btoa(binary));
    } catch {
      // Ignore storage error
    }
  }
}
