/**
 * Game.Com Cartridge & ROM Header Subsystem
 * Handles .bin, .tgc, and .zip file loading, ZIP archive decompression via fflate,
 * official "TigerDMGC" cartridge header parsing (+0x05 signature, +0x11 9-char title, +0x1A 16-bit Game ID),
 * Fletcher-32 & RetroAchievements RFC 1321 MD5 hashing, and cartridge metadata resolution.
 */

import { unzipSync } from 'fflate';
import { CartridgeInfo } from './types';

export interface KnownGame {
  id: string;
  title: string;
  publisher: string;
  year: number;
  genre: string;
  description: string;
  gameIds?: number[];
  headerMatches: string[];
  coverColor: string;
  coverAccent: string;
  scoreUnit?: string;
}

export const KNOWN_GAMECOM_GAMES: Record<string, KnownGame> = {
  lightsout: {
    id: 'lightsout',
    title: 'Lights Out',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Puzzle / Logic',
    description:
      'The pack-in touchscreen puzzle cartridge. Tap cells to toggle adjacent lights and clear the 5x5 or 6x6 board.',
    gameIds: [0x0917],
    headerMatches: ['LIGHTSOUT', 'LIGHTS OUT'],
    coverColor: '#18181b',
    coverAccent: '#22c55e',
    scoreUnit: 'Level / Puzzles'
  },
  solitaire: {
    id: 'solitaire',
    title: 'Built-In Solitaire (BIOS)',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Card / PDA Built-In',
    description:
      'Built-in BIOS Klondike Solitaire stored in external.bin with dedicated NVRAM high score register at $FEE0-$FEE1.',
    gameIds: [0xfee0],
    headerMatches: ['SOLITAIRE'],
    coverColor: '#064e3b',
    coverAccent: '#10b981',
    scoreUnit: 'Points'
  },
  williams: {
    id: 'williams',
    title: 'Williams Arcade Classics',
    publisher: 'Williams / Midway / Tiger',
    year: 1997,
    genre: 'Arcade Classics',
    description: 'Compilation of Joust, Defender, Defender II, Robotron: 2084, and Sinistar.',
    gameIds: [0x0617],
    headerMatches: ['WILLIAMS', 'ARCADE CL'],
    coverColor: '#581c87',
    coverAccent: '#c084fc',
    scoreUnit: 'Points'
  },
  re2: {
    id: 're2',
    title: 'Resident Evil 2',
    publisher: 'Capcom / Tiger Electronics',
    year: 1998,
    genre: 'Survival Horror',
    description:
      'Isometric survival horror adaptation following Leon S. Kennedy through the R.P.D. station.',
    gameIds: [0x1d18],
    headerMatches: ['RESIDENT2', 'RES EVIL2', 'RESIDENT'],
    coverColor: '#1c1917',
    coverAccent: '#dc2626',
    scoreUnit: 'Points'
  },
  duke3d: {
    id: 'duke3d',
    title: 'Duke Nukem 3D',
    publisher: '3D Realms / Tiger Electronics',
    year: 1997,
    genre: 'First-Person Shooter',
    description:
      'First-person shooter adaptation featuring 3D corridor rendering, weapons, and digitized voice clips.',
    gameIds: [0x0b17],
    headerMatches: ['DUKE 3D', 'DUKENUKEM', 'DUKE3D'],
    coverColor: '#78350f',
    coverAccent: '#f59e0b',
    scoreUnit: 'Points'
  },
  batman: {
    id: 'batman',
    title: 'Batman & Robin',
    publisher: 'Warner Bros. / Tiger Electronics',
    year: 1997,
    genre: "Action Beat 'Em Up",
    description:
      'Side-scrolling action beat-em-up across Gotham City with batarangs and boss encounters.',
    gameIds: [0x0317],
    headerMatches: ['BATMAN&R', 'BATMAN'],
    coverColor: '#0f172a',
    coverAccent: '#eab308',
    scoreUnit: 'Points'
  },
  lostworld: {
    id: 'lostworld',
    title: 'The Lost World: Jurassic Park',
    publisher: 'Universal / Tiger Electronics',
    year: 1997,
    genre: 'Action Adventure',
    description: 'Top-down and side-scrolling action adventure across Isla Sorna.',
    gameIds: [0x0817],
    headerMatches: ['LOSTWORLD', 'JURASSIC'],
    coverColor: '#14532d',
    coverAccent: '#84cc16',
    scoreUnit: 'Points'
  },
  mkt: {
    id: 'mkt',
    title: 'Mortal Kombat Trilogy',
    publisher: 'Midway / Tiger Electronics',
    year: 1997,
    genre: 'Fighting',
    description:
      '2D martial arts fighting adaptation with digitized fighter sprites and special moves.',
    gameIds: [0x0a17],
    headerMatches: ['MORTAL K', 'MKTRILOGY', 'MORTALKOM'],
    coverColor: '#450a0a',
    coverAccent: '#ef4444',
    scoreUnit: 'Wins / Points'
  },
  wheel: {
    id: 'wheel',
    title: 'Wheel of Fortune',
    publisher: 'Hasbro / GameTek / Tiger',
    year: 1997,
    genre: 'Game Show',
    description: 'Spin the wheel, guess consonants, and solve word puzzles using the touchscreen.',
    gameIds: [0x0717],
    headerMatches: ['WHEEL OF', 'WHEEL 1'],
    coverColor: '#4c1d95',
    coverAccent: '#a855f7',
    scoreUnit: 'Cash ($)'
  },
  wheel2: {
    id: 'wheel2',
    title: 'Wheel of Fortune 2',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1998,
    genre: 'Game Show',
    description: 'Sequel edition featuring hundreds of new word puzzles and categories.',
    gameIds: [0x1418],
    headerMatches: ['WHEEL 2', 'WHEEL2'],
    coverColor: '#1e3a8a',
    coverAccent: '#60a5fa',
    scoreUnit: 'Cash ($)'
  },
  jeopardy: {
    id: 'jeopardy',
    title: 'Jeopardy!',
    publisher: 'Hasbro / GameTek / Tiger',
    year: 1998,
    genre: 'Trivia Quiz',
    description:
      'Television quiz show adaptation with Daily Doubles, Final Jeopardy, and touchscreen input.',
    gameIds: [0x0f18],
    headerMatches: ['JEOPARDY!', 'JEOPARDY'],
    coverColor: '#1e1b4b',
    coverAccent: '#60a5fa',
    scoreUnit: 'Cash ($)'
  },
  frogger: {
    id: 'frogger',
    title: 'Frogger',
    publisher: 'Hasbro Interactive / Tiger',
    year: 1999,
    genre: 'Arcade Classic',
    description: 'Hop across highway traffic and river logs to guide your frogs safely home.',
    gameIds: [0x1a18],
    headerMatches: ['FROGGER'],
    coverColor: '#064e3b',
    coverAccent: '#10b981',
    scoreUnit: 'Points'
  },
  centipede: {
    id: 'centipede',
    title: 'Centipede',
    publisher: 'Hasbro Interactive / Atari',
    year: 1999,
    genre: 'Arcade Shooter',
    description: 'Arcade insect shooter supporting both stylus and D-Pad control.',
    gameIds: [0x1b18],
    headerMatches: ['CENTIPEDE'],
    coverColor: '#701a75',
    coverAccent: '#ec4899',
    scoreUnit: 'Points'
  },
  monopoly: {
    id: 'monopoly',
    title: 'Monopoly',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1999,
    genre: 'Board Game',
    description: 'Buy, trade, and develop properties using the touchscreen interface.',
    gameIds: [0x1918],
    headerMatches: ['MONOPOLY'],
    coverColor: '#065f46',
    coverAccent: '#34d399',
    scoreUnit: 'Net Worth ($)'
  },
  scrabble: {
    id: 'scrabble',
    title: 'Scrabble',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1999,
    genre: 'Word Board Game',
    description: 'Touchscreen crossword board game with built-in word validation.',
    gameIds: [0x1c18],
    headerMatches: ['SCRABBLE'],
    coverColor: '#115e59',
    coverAccent: '#2dd4bf',
    scoreUnit: 'Points'
  },
  casino: {
    id: 'casino',
    title: 'Tiger Casino',
    publisher: 'Tiger Electronics',
    year: 1998,
    genre: 'Card & Casino',
    description: 'Touchscreen casino suite featuring Blackjack, Poker, and Slot Machines.',
    gameIds: [0x0e18],
    headerMatches: ['TIGER CAS', 'CASINO'],
    coverColor: '#713f12',
    coverAccent: '#facc15',
    scoreUnit: 'Bankroll ($)'
  },
  quizwiz: {
    id: 'quizwiz',
    title: 'Quiz Wiz: Cyber Trivia',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Trivia',
    description: 'General knowledge trivia cartridge with touchscreen multiple-choice questions.',
    gameIds: [0x0417],
    headerMatches: ['QUIZ WIZ', 'QUIZWIZ'],
    coverColor: '#312e81',
    coverAccent: '#818cf8',
    scoreUnit: 'Points'
  },
  henry: {
    id: 'henry',
    title: 'Henry',
    publisher: 'Tiger Electronics',
    year: 1998,
    genre: 'Puzzle / Memory',
    description: 'Interactive pattern and word puzzle cartridge.',
    gameIds: [0x0c17],
    headerMatches: ['HENRY'],
    coverColor: '#581c87',
    coverAccent: '#d8b4fe',
    scoreUnit: 'Points'
  }
};

export function resolveKnownGameByGameIdOrTitle(
  gameId: number,
  rawTitle?: string
): KnownGame | null {
  if (gameId !== 0) {
    for (const key in KNOWN_GAMECOM_GAMES) {
      const g = KNOWN_GAMECOM_GAMES[key];
      if (g.gameIds?.includes(gameId)) return g;
    }
    const hiByte = (gameId >> 8) & 0xff;
    const loByte = gameId & 0xff;
    for (const key in KNOWN_GAMECOM_GAMES) {
      const g = KNOWN_GAMECOM_GAMES[key];
      if (g.gameIds?.some((id) => ((id >> 8) & 0xff) === hiByte && (id & 0xff) === loByte)) {
        return g;
      }
    }
  }
  if (rawTitle) {
    const norm = rawTitle.toUpperCase().replace(/\s+/g, ' ').trim();
    const compact = norm.replace(/\s+/g, '');
    for (const key in KNOWN_GAMECOM_GAMES) {
      const g = KNOWN_GAMECOM_GAMES[key];
      for (const pat of g.headerMatches) {
        const np = pat.toUpperCase().trim();
        const cp = np.replace(/\s+/g, '');
        if (norm === np || compact === cp || norm.startsWith(np) || compact.startsWith(cp)) {
          return g;
        }
      }
    }
  }
  return null;
}

export interface ParsedGameComHeader {
  found: boolean;
  headerOffset: number;
  rawHeaderTitle: string;
  gameId: number;
  entryBank: number;
  entryAddr: number;
  flags: number;
}

/**
 * Parses the official Game.Com "TigerDMGC" cartridge header.
 *
 * Official SM8521 Cartridge Header Layout (mapped at $6000..$601F in bank $20/$40/$80/$00):
 * - +0x00: Entry point MMU bank
 * - +0x01..+0x02: Entry point 16-bit address (little-endian)
 * - +0x04: Slot compatibility flags
 * - +0x05..+0x0D: 9-byte ASCII signature "TigerDMGC"
 * - +0x11..+0x19: 9-byte ASCII Game Title (used by BIOS main menu & NVRAM high scores)
 * - +0x1A..+0x1B: 16-bit Big-Endian Game ID (e.g. $0917 = Lights Out)
 */
export function parseGameComRomHeader(romBytes: Uint8Array): ParsedGameComHeader {
  const sig = [0x54, 0x69, 0x67, 0x65, 0x72, 0x44, 0x4d, 0x47, 0x43]; // "TigerDMGC"

  const checkAt = (base: number): ParsedGameComHeader | null => {
    if (base < 0 || base + 0x1c > romBytes.length) return null;
    for (let i = 0; i < sig.length; i++) {
      if (romBytes[base + 0x05 + i] !== sig[i]) {
        return null;
      }
    }

    let rawTitle = '';
    for (let i = 0; i < 9; i++) {
      const ch = romBytes[base + 0x11 + i];
      if (ch === 0x00) break;
      if (ch >= 0x20 && ch <= 0x7e) {
        rawTitle += String.fromCharCode(ch);
      }
    }

    const gameId = (romBytes[base + 0x1a] << 8) | romBytes[base + 0x1b];
    const entryBank = romBytes[base + 0x00];
    const entryAddr = romBytes[base + 0x01] | (romBytes[base + 0x02] << 8);
    const flags = romBytes[base + 0x04];

    return {
      found: true,
      headerOffset: base,
      rawHeaderTitle: rawTitle.trim(),
      gameId,
      entryBank,
      entryAddr,
      flags
    };
  };

  // 1. Check standard BIOS probe offsets first (0x40000 = MMU $20, 0x80000 = MMU $40, 0x00000 = MMU $00)
  for (const base of [0x40000, 0x80000, 0x00000]) {
    const res = checkAt(base);
    if (res && res.rawHeaderTitle.length > 0) return res;
  }

  // 2. Check all 8KB (0x2000) MMU bank boundaries
  for (let base = 0; base + 0x20 <= romBytes.length; base += 0x2000) {
    const res = checkAt(base);
    if (res && res.rawHeaderTitle.length > 0) return res;
  }

  // 3. Full scan if header is at a non-standard offset
  for (let base = 0; base + 0x1c <= romBytes.length; base++) {
    const res = checkAt(base);
    if (res) return res;
  }

  return {
    found: false,
    headerOffset: -1,
    rawHeaderTitle: '',
    gameId: 0,
    entryBank: 0,
    entryAddr: 0,
    flags: 0
  };
}

/**
 * Calculates 32-bit Fletcher checksum for ROM verification
 */
export function calculateChecksum(data: Uint8Array): string {
  let sum1 = 0xffff;
  let sum2 = 0xffff;
  const len = Math.min(data.length, 65536);

  for (let i = 0; i < len; i++) {
    sum1 = (sum1 + data[i]) % 65535;
    sum2 = (sum2 + sum1) % 65535;
  }
  const checksum = ((sum2 << 16) | sum1) >>> 0;
  return checksum.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Pure RFC 1321 MD5 implementation for RetroAchievements (rcheevos) ROM identification
 * and leaderboard/achievement submission signing.
 */
export function calculateMd5Hex(input: Uint8Array | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;

  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ]);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  const origLen = bytes.length;
  const bitLenLo = (origLen * 8) >>> 0;
  const bitLenHi = Math.floor((origLen * 8) / 0x100000000) >>> 0;
  const padLen = ((56 - ((origLen + 1) % 64)) + 64) % 64;
  const totalLen = origLen + 1 + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(bytes, 0);
  buf[origLen] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(totalLen - 8, bitLenLo, true);
  dv.setUint32(totalLen - 4, bitLenHi, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = dv.getUint32(offset + j * 4, true);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const rot = ((F << S[i]) | (F >>> (32 - S[i]))) >>> 0;
      B = (B + rot) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, a0, true);
  outDv.setUint32(4, b0, true);
  outDv.setUint32(8, c0, true);
  outDv.setUint32(12, d0, true);
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatHeaderTitleDisplay(rawHeaderTitle: string): string {
  const cleaned = rawHeaderTitle.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned)) {
    return cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return cleaned;
}

/**
 * Parses a ROM file (.bin, .tgc, or .zip) into a CartridgeInfo structure using its
 * official "TigerDMGC" ROM header (+0x11 9-char title and +0x1A 16-bit Game ID).
 */
export async function loadCartridgeFromFile(file: File): Promise<CartridgeInfo> {
  const arrayBuffer = await file.arrayBuffer();
  let romBytes = new Uint8Array(arrayBuffer);
  let fileName = file.name;

  // Check if it's a ZIP archive
  if (fileName.toLowerCase().endsWith('.zip') || (romBytes[0] === 0x50 && romBytes[1] === 0x4b)) {
    try {
      const unzipped = unzipSync(romBytes);
      const entryNames = Object.keys(unzipped);
      let targetEntry = entryNames.find((name) => {
        const lower = name.toLowerCase();
        return (
          (lower.endsWith('.bin') || lower.endsWith('.tgc') || lower.endsWith('.rom')) &&
          !name.startsWith('__MACOSX')
        );
      });

      if (!targetEntry && entryNames.length > 0) {
        let maxLen = 0;
        for (const name of entryNames) {
          if (!name.startsWith('__MACOSX') && unzipped[name].length > maxLen) {
            maxLen = unzipped[name].length;
            targetEntry = name;
          }
        }
      }

      if (targetEntry && unzipped[targetEntry]) {
        romBytes = unzipped[targetEntry];
        fileName = targetEntry;
      } else {
        throw new Error('No valid Game.com ROM file found inside ZIP archive.');
      }
    } catch (err) {
      throw new Error(`Failed to extract ZIP archive: ${(err as Error).message}`);
    }
  }

  const header = parseGameComRomHeader(romBytes);
  const checksum = calculateChecksum(romBytes);
  const cleanFileTitle =
    fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[\(_].*$/, '')
      .trim() || 'Game.Com Cartridge';

  const matchedGame = resolveKnownGameByGameIdOrTitle(header.gameId, header.rawHeaderTitle);

  if (matchedGame) {
    return {
      id: `${matchedGame.id}_${Date.now()}`,
      title: matchedGame.title,
      headerTitle: header.rawHeaderTitle || matchedGame.title,
      headerGameId: header.gameId || matchedGame.gameIds?.[0],
      publisher: matchedGame.publisher,
      year: matchedGame.year,
      genre: matchedGame.genre,
      description: matchedGame.description,
      sizeBytes: romBytes.length,
      isBuiltin: false,
      coverColor: matchedGame.coverColor,
      coverAccent: matchedGame.coverAccent,
      romData: romBytes
    };
  }

  // If the ROM has a valid TigerDMGC header with a custom/unlisted title, use its genuine header title
  if (header.found && header.rawHeaderTitle) {
    const displayTitle = formatHeaderTitleDisplay(header.rawHeaderTitle) || cleanFileTitle;
    const hexId = `$${header.gameId.toString(16).toUpperCase().padStart(4, '0')}`;
    return {
      id: `cart_${header.gameId.toString(16)}_${Date.now()}`,
      title: displayTitle,
      headerTitle: header.rawHeaderTitle,
      headerGameId: header.gameId,
      publisher: 'Tiger Electronics',
      year: 1998,
      genre: 'Game.Com Cartridge',
      description: `Header "${header.rawHeaderTitle}" (Game ID ${hexId}, ${(romBytes.length / 1024).toFixed(0)} KB, CRC: ${checksum}).`,
      sizeBytes: romBytes.length,
      isBuiltin: false,
      coverColor: '#1e293b',
      coverAccent: '#10b981',
      romData: romBytes
    };
  }

  // Fallback for raw unheadered binaries: use cleaned filename
  return {
    id: `custom_${Date.now()}`,
    title: cleanFileTitle,
    publisher: 'External Cartridge Image',
    year: 1998,
    genre: 'Game.Com Cartridge',
    description: `Loaded Game.Com ROM image (${(romBytes.length / 1024).toFixed(0)} KB, CRC: ${checksum}).`,
    sizeBytes: romBytes.length,
    isBuiltin: false,
    coverColor: '#1e293b',
    coverAccent: '#3b82f6',
    romData: romBytes
  };
}

/**
 * Preloaded Cartridge ROM binary served from /roms/ (Lights Out pack-in cartridge only)
 */
export const PRELOADED_CARTRIDGES: CartridgeInfo[] = [
  {
    id: 'lightsout',
    title: 'Lights Out',
    headerTitle: 'LightsOut',
    headerGameId: 0x0917,
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Puzzle / Logic',
    description:
      'Official 32KB pack-in cartridge binary (Header: "LightsOut", ID: $0917). Executes natively on the cycle-accurate SM8521 CPU.',
    sizeBytes: 32768,
    isBuiltin: false,
    coverColor: '#18181b',
    coverAccent: '#22c55e',
    romUrl: './roms/lightsout.bin'
  }
];
