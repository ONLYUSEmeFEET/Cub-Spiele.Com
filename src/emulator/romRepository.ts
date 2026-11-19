/**
 * Cub Spiele.Com — Online ROM Repository Scanner, Deduplicator & Persistent Library Manager
 *
 * Supports Archive.org collections (e.g. `https://archive.org/download/gamecom/1997%20-%20Game.com/`,
 * `https://archive.org/download/gamecom_202211`) via Archive.org's CORS metadata API and `cors.archive.org`
 * gateway, as well as generic HTTP directory indexes and JSON ROM manifests.
 *
 * Deduplicates discovered ROM files so each Game.Com title appears as a single canonical entry enriched
 * with Diskman (`diskman.com`) historical metadata and scanned cartridge label artwork.
 */

import {
  KNOWN_GAMECOM_GAMES,
  KnownGame,
  isBiosFilename,
  resolveKnownGameFromFilename
} from './cartridge';

export interface OnlineRomEntry {
  /** Canonical deduplication key (e.g. 'batman', 'megamix', 'castlevania') */
  gameId: string;
  title: string;
  publisher: string;
  year: number;
  genre: string;
  description: string;
  partNumber?: string;
  labelImage?: string;
  diskmanUrl?: string;
  manualUrl?: string;
  diskmanHighlights?: string[];
  linkPlaySupport?: boolean;
  coverColor: string;
  coverAccent: string;
  fileName: string;
  downloadUrl: string;
  fallbackUrl?: string;
  repoUrl: string;
  sizeBytes?: number;
  autoPatchReborn?: boolean;
}

export interface PersistedRepositoryState {
  repositoryUrls: string[];
  entries: OnlineRomEntry[];
  lastUpdated?: number;
}

const REPO_STORAGE_KEY = 'cub_spiele_online_rom_repos_v1';

const romByteCache = new Map<string, Uint8Array>();

const VALID_ROM_EXT_RE = /\.(zip|tgc|bin|rom)$/i;

function scoreCandidateFilename(fileName: string): number {
  let score = 0;
  const lower = fileName.toLowerCase();
  if (lower.includes('[!]')) score += 30;
  if (/71-\d{3}/.test(lower)) score += 20;
  if (lower.endsWith('.tgc')) score += 10;
  if (lower.endsWith('.zip')) score += 5;
  return score;
}

function buildOnlineEntryFromFile(
  fileName: string,
  downloadUrl: string,
  repoUrl: string,
  fallbackUrl?: string,
  sizeBytes?: number
): OnlineRomEntry | null {
  const baseName = fileName.split(/[\\/]/).pop() || fileName;
  if (!VALID_ROM_EXT_RE.test(baseName)) return null;
  if (isBiosFilename(baseName)) return null;

  const known: KnownGame | null = resolveKnownGameFromFilename(baseName);
  if (known) {
    if (known.isSystemCart) return null;
    return {
      gameId: known.id,
      title: known.title,
      publisher: known.publisher,
      year: known.year,
      genre: known.genre,
      description: known.description,
      partNumber: known.partNumber,
      labelImage: known.labelImage,
      diskmanUrl: known.diskmanUrl,
      manualUrl: known.manualUrl,
      diskmanHighlights: known.diskmanHighlights,
      linkPlaySupport: known.linkPlaySupport,
      coverColor: known.coverColor,
      coverAccent: known.coverAccent,
      fileName: baseName,
      downloadUrl,
      fallbackUrl,
      repoUrl,
      sizeBytes
    };
  }

  const cleanTitle =
    baseName
      .replace(/\.[^/.]+$/, '')
      .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
      .replace(/[_-]+/g, ' ')
      .trim() || baseName;
  const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '') || baseName.toLowerCase();

  return {
    gameId: `custom_${slug}`,
    title: cleanTitle,
    publisher: 'Tiger Electronics',
    year: 1998,
    genre: 'Game.Com Cartridge',
    description: `Online Game.Com cartridge ROM (${baseName}).`,
    coverColor: '#1e293b',
    coverAccent: '#38bdf8',
    fileName: baseName,
    downloadUrl,
    fallbackUrl,
    repoUrl,
    sizeBytes
  };
}

export function ensureCastlevaniaRebornEntry(entries: OnlineRomEntry[]): OnlineRomEntry[] {
  const hasReborn = entries.some((e) => e.gameId === 'castlevaniareborn');
  if (hasReborn) return entries;

  const proto = entries.find((e) => e.gameId === 'castlevania');
  const rebornKnown = KNOWN_GAMECOM_GAMES.castlevaniareborn;
  if (!proto || !rebornKnown) return entries;

  return [
    ...entries,
    {
      gameId: rebornKnown.id,
      title: rebornKnown.title,
      publisher: rebornKnown.publisher,
      year: rebornKnown.year,
      genre: rebornKnown.genre,
      description: rebornKnown.description,
      partNumber: rebornKnown.partNumber,
      labelImage: rebornKnown.labelImage,
      diskmanUrl: rebornKnown.diskmanUrl,
      manualUrl: rebornKnown.manualUrl,
      diskmanHighlights: rebornKnown.diskmanHighlights,
      linkPlaySupport: rebornKnown.linkPlaySupport,
      coverColor: rebornKnown.coverColor,
      coverAccent: rebornKnown.coverAccent,
      fileName: 'Castlevania - Symphony of the Night Reborn (v0.2).tgc',
      downloadUrl: proto.downloadUrl,
      fallbackUrl: proto.fallbackUrl,
      repoUrl: proto.repoUrl,
      sizeBytes: proto.sizeBytes,
      autoPatchReborn: true
    }
  ];
}

export function deduplicateOnlineRomEntries(entries: OnlineRomEntry[]): OnlineRomEntry[] {
  const byGameId = new Map<string, OnlineRomEntry>();
  for (const entry of entries) {
    const existing = byGameId.get(entry.gameId);
    if (!existing) {
      byGameId.set(entry.gameId, entry);
    } else {
      const existingScore = scoreCandidateFilename(existing.fileName);
      const nextScore = scoreCandidateFilename(entry.fileName);
      if (nextScore >= existingScore) {
        byGameId.set(entry.gameId, entry);
      }
    }
  }
  return ensureCastlevaniaRebornEntry(Array.from(byGameId.values())).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
}

function parseArchiveOrgUrl(rawUrl: string): { ident: string; subpath: string } | null {
  try {
    const u = new URL(rawUrl.trim());
    if (!/(^|\.)archive\.org$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && /^(download|details|metadata|cors)$/i.test(parts[0])) {
      const ident = decodeURIComponent(parts[1]);
      const subpath = parts
        .slice(2)
        .map((p) => decodeURIComponent(p))
        .join('/');
      return { ident, subpath };
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

function encodePathSegments(pathStr: string): string {
  return pathStr
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export async function scanRomRepositoryUrl(rawUrl: string): Promise<OnlineRomEntry[]> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Please enter a valid repository URL.');
  }

  const archiveParsed = parseArchiveOrgUrl(trimmed);
  if (archiveParsed) {
    const { ident, subpath } = archiveParsed;
    const metaUrl = `https://archive.org/metadata/${encodeURIComponent(ident)}`;
    const res = await fetch(metaUrl);
    if (!res.ok) {
      throw new Error(`Archive.org metadata request failed (${res.status}).`);
    }
    const data = await res.json();
    const files: Array<{ name?: string; size?: string | number }> = Array.isArray(data?.files)
      ? data.files
      : [];

    const normSub = subpath.replace(/^\/+|\/+$/g, '').toLowerCase();
    const discovered: OnlineRomEntry[] = [];

    for (const f of files) {
      const name = typeof f?.name === 'string' ? f.name : '';
      if (!name) continue;
      if (normSub) {
        const lowerName = name.toLowerCase();
        if (!lowerName.startsWith(normSub + '/') && lowerName !== normSub) {
          continue;
        }
      }
      const baseName = name.split('/').pop() || name;
      if (!VALID_ROM_EXT_RE.test(baseName)) continue;
      if (isBiosFilename(baseName)) continue;

      const encodedPath = encodePathSegments(name);
      const corsUrl = `https://cors.archive.org/cors/${encodeURIComponent(ident)}/${encodedPath}`;
      const directUrl = `https://archive.org/download/${encodeURIComponent(ident)}/${encodedPath}`;
      const sizeNum = f.size !== undefined ? Number(f.size) : undefined;

      const entry = buildOnlineEntryFromFile(
        baseName,
        corsUrl,
        trimmed,
        directUrl,
        Number.isFinite(sizeNum) ? sizeNum : undefined
      );
      if (entry) {
        discovered.push(entry);
      }
    }

    return deduplicateOnlineRomEntries(discovered);
  }

  // Generic HTTP directory listing or JSON manifest
  const res = await fetch(trimmed);
  if (!res.ok) {
    throw new Error(`Repository request failed (${res.status}).`);
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  const baseUrl = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  const discovered: OnlineRomEntry[] = [];

  if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.files)
        ? parsed.files
        : Array.isArray(parsed?.roms)
        ? parsed.roms
        : [];
      for (const item of list) {
        const rawHref = typeof item === 'string' ? item : item?.url || item?.name || item?.file;
        if (typeof rawHref !== 'string') continue;
        const resolvedUrl = new URL(rawHref, baseUrl).toString();
        const decodedName = decodeURIComponent(resolvedUrl.split('/').pop() || rawHref);
        const entry = buildOnlineEntryFromFile(decodedName, resolvedUrl, trimmed);
        if (entry) discovered.push(entry);
      }
      if (discovered.length > 0) {
        return deduplicateOnlineRomEntries(discovered);
      }
    } catch {
      // fall through to HTML link parsing
    }
  }

  const hrefRegex = /href=["']([^"']+\.(?:zip|tgc|bin|rom))["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(text)) !== null) {
    const href = match[1];
    if (!href || href.startsWith('?') || href.startsWith('#')) continue;
    try {
      const resolvedUrl = new URL(href, baseUrl).toString();
      const decodedName = decodeURIComponent(resolvedUrl.split('/').pop() || href);
      const entry = buildOnlineEntryFromFile(decodedName, resolvedUrl, trimmed);
      if (entry) {
        discovered.push(entry);
      }
    } catch {
      // ignore malformed href
    }
  }

  return deduplicateOnlineRomEntries(discovered);
}

export async function fetchOnlineRomBytes(entry: OnlineRomEntry): Promise<Uint8Array> {
  const cached = romByteCache.get(entry.downloadUrl);
  if (cached) return cached;

  const urlsToTry = [entry.downloadUrl];
  if (entry.fallbackUrl && entry.fallbackUrl !== entry.downloadUrl) {
    urlsToTry.push(entry.fallbackUrl);
  }

  let lastError: Error | null = null;
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length < 256) {
        throw new Error('Downloaded file is too small to be a valid Game.Com ROM.');
      }
      romByteCache.set(entry.downloadUrl, bytes);
      return bytes;
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw new Error(
    `Failed to download "${entry.title}" (${entry.fileName}): ${lastError?.message || 'Network error'}`
  );
}

export function loadPersistedRepositoryState(): PersistedRepositoryState {
  try {
    const raw = localStorage.getItem(REPO_STORAGE_KEY);
    if (!raw) {
      return { repositoryUrls: [], entries: [] };
    }
    const parsed = JSON.parse(raw);
    const repositoryUrls = Array.isArray(parsed?.repositoryUrls)
      ? parsed.repositoryUrls.filter((u: unknown): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    const rawEntries = Array.isArray(parsed?.entries) ? (parsed.entries as OnlineRomEntry[]) : [];
    // Refresh metadata fields from KNOWN_GAMECOM_GAMES so updated Diskman descriptions/labels always stay current
    const refreshedEntries: OnlineRomEntry[] = rawEntries
      .filter((e) => e && typeof e.gameId === 'string' && typeof e.downloadUrl === 'string')
      .map((e) => {
        const known = KNOWN_GAMECOM_GAMES[e.gameId];
        if (!known) return e;
        return {
          ...e,
          title: known.title,
          publisher: known.publisher,
          year: known.year,
          genre: known.genre,
          description: known.description,
          partNumber: known.partNumber,
          labelImage: known.labelImage,
          diskmanUrl: known.diskmanUrl,
          manualUrl: known.manualUrl,
          diskmanHighlights: known.diskmanHighlights,
          linkPlaySupport: known.linkPlaySupport,
          coverColor: known.coverColor,
          coverAccent: known.coverAccent
        };
      });
    return {
      repositoryUrls,
      entries: deduplicateOnlineRomEntries(refreshedEntries),
      lastUpdated: typeof parsed?.lastUpdated === 'number' ? parsed.lastUpdated : undefined
    };
  } catch {
    return { repositoryUrls: [], entries: [] };
  }
}

export function savePersistedRepositoryState(state: PersistedRepositoryState): void {
  try {
    localStorage.setItem(
      REPO_STORAGE_KEY,
      JSON.stringify({
        repositoryUrls: state.repositoryUrls,
        entries: state.entries,
        lastUpdated: Date.now()
      })
    );
  } catch {
    // ignore storage quota errors
  }
}
