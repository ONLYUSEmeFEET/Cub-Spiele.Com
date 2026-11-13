/**
 * Game.Com Cartridge & ROM Header Subsystem
 * Handles .bin, .tgc, and .zip file loading, ZIP archive decompression via fflate,
 * official "TigerDMGC" cartridge header parsing (+0x05 signature, +0x11 9-char title, +0x1A 16-bit Game ID),
 * checksum verification, and cartridge metadata resolution.
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
}

export const KNOWN_GAMECOM_GAMES: Record<string, KnownGame> = {
  lightsout: {
    id: 'lightsout',
    title: 'Lights Out',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Puzzle / Logic',
    description: 'The pack-in touchscreen puzzle cartridge. Tap cells to toggle adjacent lights and clear the 5x5 or 6x6 board.',
    gameIds: [0x0917],
    headerMatches: ['LIGHTSOUT', 'LIGHTS OUT'],
    coverColor: '#18181b',
    coverAccent: '#22c55e'
  },
  sonic: {
    id: 'sonic',
    title: 'Sonic Jam',
    publisher: 'Sega / Tiger Electronics',
    year: 1998,
    genre: 'Platformer',
    description: 'Official adaptation featuring Sonic, Tails, and Knuckles across Sonic 2, Sonic 3, and Sonic & Knuckles zones.',
    gameIds: [0x2015],
    headerMatches: ['SONIC JAM', 'SONICJAM'],
    coverColor: '#1e3a8a',
    coverAccent: '#38bdf8'
  },
  indy500: {
    id: 'indy500',
    title: 'Indy 500',
    publisher: 'Sega / Tiger Electronics',
    year: 1997,
    genre: 'Arcade Racing',
    description: 'High-speed open-wheel racing at the Indianapolis Motor Speedway with dual-gear acceleration and drafting.',
    headerMatches: ['INDY 500', 'INDY500'],
    coverColor: '#b91c1c',
    coverAccent: '#f59e0b'
  },
  williams: {
    id: 'williams',
    title: 'Williams Arcade Classics',
    publisher: 'Williams / Midway / Tiger',
    year: 1997,
    genre: 'Arcade Classics',
    description: 'Compilation of Joust, Defender, Defender II, Robotron: 2084, and Sinistar.',
    headerMatches: ['WILLIAMS', 'ARCADE CL'],
    coverColor: '#581c87',
    coverAccent: '#c084fc'
  },
  re2: {
    id: 're2',
    title: 'Resident Evil 2',
    publisher: 'Capcom / Tiger Electronics',
    year: 1998,
    genre: 'Survival Horror',
    description: 'Isometric survival horror adaptation following Leon S. Kennedy through the R.P.D. station.',
    headerMatches: ['RESIDENT2', 'RES EVIL2', 'RESIDENT'],
    coverColor: '#1c1917',
    coverAccent: '#dc2626'
  },
  duke3d: {
    id: 'duke3d',
    title: 'Duke Nukem 3D',
    publisher: '3D Realms / Tiger Electronics',
    year: 1997,
    genre: 'First-Person Shooter',
    description: 'First-person shooter adaptation featuring 3D corridor rendering, weapons, and digitized voice clips.',
    headerMatches: ['DUKE 3D', 'DUKENUKEM', 'DUKE3D'],
    coverColor: '#78350f',
    coverAccent: '#f59e0b'
  },
  batman: {
    id: 'batman',
    title: 'Batman & Robin',
    publisher: 'Warner Bros. / Tiger Electronics',
    year: 1997,
    genre: 'Action Beat \'Em Up',
    description: 'Side-scrolling action beat-em-up across Gotham City with batarangs and boss encounters.',
    headerMatches: ['BATMAN&R', 'BATMAN'],
    coverColor: '#0f172a',
    coverAccent: '#eab308'
  },
  lostworld: {
    id: 'lostworld',
    title: 'The Lost World: Jurassic Park',
    publisher: 'Universal / Tiger Electronics',
    year: 1997,
    genre: 'Action Adventure',
    description: 'Top-down and side-scrolling action adventure across Isla Sorna.',
    headerMatches: ['LOSTWORLD', 'JURASSIC'],
    coverColor: '#14532d',
    coverAccent: '#84cc16'
  },
  mkt: {
    id: 'mkt',
    title: 'Mortal Kombat Trilogy',
    publisher: 'Midway / Tiger Electronics',
    year: 1997,
    genre: 'Fighting',
    description: '2D martial arts fighting adaptation with digitized fighter sprites and special moves.',
    headerMatches: ['MORTAL K', 'MKTRILOGY', 'MORTALKOM'],
    coverColor: '#450a0a',
    coverAccent: '#ef4444'
  },
  fighters: {
    id: 'fighters',
    title: 'Fighters Megamix',
    publisher: 'Sega / Tiger Electronics',
    year: 1998,
    genre: 'Fighting',
    description: 'Crossover fighting cartridge featuring Virtua Fighter and Fighting Vipers characters.',
    headerMatches: ['FIGHTERS', 'MEGAMIX'],
    coverColor: '#9a3412',
    coverAccent: '#fb923c'
  },
  wheel: {
    id: 'wheel',
    title: 'Wheel of Fortune',
    publisher: 'Hasbro / GameTek / Tiger',
    year: 1997,
    genre: 'Game Show',
    description: 'Spin the wheel, guess consonants, and solve word puzzles using the touchscreen.',
    headerMatches: ['WHEEL OF', 'WHEEL 1'],
    coverColor: '#4c1d95',
    coverAccent: '#a855f7'
  },
  wheel2: {
    id: 'wheel2',
    title: 'Wheel of Fortune 2',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1998,
    genre: 'Game Show',
    description: 'Sequel edition featuring hundreds of new word puzzles and categories.',
    headerMatches: ['WHEEL 2', 'WHEEL2'],
    coverColor: '#1e3a8a',
    coverAccent: '#60a5fa'
  },
  jeopardy: {
    id: 'jeopardy',
    title: 'Jeopardy!',
    publisher: 'Hasbro / GameTek / Tiger',
    year: 1998,
    genre: 'Trivia Quiz',
    description: 'Television quiz show adaptation with Daily Doubles, Final Jeopardy, and touchscreen input.',
    headerMatches: ['JEOPARDY!', 'JEOPARDY'],
    coverColor: '#1e1b4b',
    coverAccent: '#60a5fa'
  },
  frogger: {
    id: 'frogger',
    title: 'Frogger',
    publisher: 'Hasbro Interactive / Tiger',
    year: 1999,
    genre: 'Arcade Classic',
    description: 'Hop across highway traffic and river logs to guide your frogs safely home.',
    headerMatches: ['FROGGER'],
    coverColor: '#064e3b',
    coverAccent: '#10b981'
  },
  centipede: {
    id: 'centipede',
    title: 'Centipede',
    publisher: 'Hasbro Interactive / Atari',
    year: 1999,
    genre: 'Arcade Shooter',
    description: 'Arcade insect shooter supporting both stylus and D-Pad control.',
    headerMatches: ['CENTIPEDE'],
    coverColor: '#701a75',
    coverAccent: '#ec4899'
  },
  monopoly: {
    id: 'monopoly',
    title: 'Monopoly',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1999,
    genre: 'Board Game',
    description: 'Buy, trade, and develop properties using the touchscreen interface.',
    headerMatches: ['MONOPOLY'],
    coverColor: '#065f46',
    coverAccent: '#34d399'
  },
  scrabble: {
    id: 'scrabble',
    title: 'Scrabble',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1999,
    genre: 'Word Board Game',
    description: 'Touchscreen crossword board game with built-in word validation.',
    headerMatches: ['SCRABBLE'],
    coverColor: '#115e59',
    coverAccent: '#2dd4bf'
  },
  casino: {
    id: 'casino',
    title: 'Tiger Casino',
    publisher: 'Tiger Electronics',
    year: 1998,
    genre: 'Card & Casino',
    description: 'Touchscreen casino suite featuring Blackjack, Poker, and Slot Machines.',
    headerMatches: ['TIGER CAS', 'CASINO'],
    coverColor: '#713f12',
    coverAccent: '#facc15'
  },
  quizwiz: {
    id: 'quizwiz',
    title: 'Quiz Wiz: Cyber Trivia',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Trivia',
    description: 'General knowledge trivia cartridge with touchscreen multiple-choice questions.',
    headerMatches: ['QUIZ WIZ', 'QUIZWIZ'],
    coverColor: '#312e81',
    coverAccent: '#818cf8'
  },
  henry: {
    id: 'henry',
    title: 'Henry',
    publisher: 'Tiger Electronics',
    year: 1998,
    genre: 'Puzzle / Memory',
    description: 'Interactive pattern and word puzzle cartridge.',
    headerMatches: ['HENRY'],
    coverColor: '#581c87',
    coverAccent: '#d8b4fe'
  }
};

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
 * - +0x1A..+0x1B: 16-bit Big-Endian Game ID (e.g. $0917 = Lights Out, $2015 = Sonic Jam)
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

  let matchedGame: KnownGame | null = null;

  // 1. Match by exact 16-bit Game ID from the TigerDMGC header (+0x1A..+0x1B)
  if (header.found && header.gameId !== 0) {
    for (const gameKey in KNOWN_GAMECOM_GAMES) {
      const game = KNOWN_GAMECOM_GAMES[gameKey];
      if (game.gameIds && game.gameIds.includes(header.gameId)) {
        matchedGame = game;
        break;
      }
    }
  }

  // 2. Match by the 9-character ASCII Title in the TigerDMGC header (+0x11..+0x19)
  if (!matchedGame && header.found && header.rawHeaderTitle) {
    const normHeader = header.rawHeaderTitle.toUpperCase().replace(/\s+/g, ' ').trim();
    const compactHeader = normHeader.replace(/\s+/g, '');

    for (const gameKey in KNOWN_GAMECOM_GAMES) {
      const game = KNOWN_GAMECOM_GAMES[gameKey];
      for (const pattern of game.headerMatches) {
        const normPattern = pattern.toUpperCase().trim();
        const compactPattern = normPattern.replace(/\s+/g, '');
        if (
          normHeader === normPattern ||
          compactHeader === compactPattern ||
          normHeader.startsWith(normPattern) ||
          compactHeader.startsWith(compactPattern)
        ) {
          matchedGame = game;
          break;
        }
      }
      if (matchedGame) break;
    }
  }

  if (matchedGame) {
    return {
      id: `${matchedGame.id}_${Date.now()}`,
      title: matchedGame.title,
      headerTitle: header.rawHeaderTitle || matchedGame.title,
      headerGameId: header.gameId || undefined,
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

  // 3. If the ROM has a valid TigerDMGC header with a custom/unlisted title, use its genuine header title
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

  // 4. Fallback for raw unheadered binaries: use cleaned filename
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
 * Preloaded Cartridge ROM binaries served from /roms/
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
    description: 'Official 32KB pack-in cartridge binary (Header: "LightsOut", ID: $0917). Executes natively on the cycle-accurate SM8521 CPU.',
    sizeBytes: 32768,
    isBuiltin: false,
    coverColor: '#18181b',
    coverAccent: '#22c55e',
    romUrl: './roms/lightsout.bin'
  },
  {
    id: 'sonic',
    title: 'Sonic Jam',
    headerTitle: 'SONIC JAM',
    headerGameId: 0x2015,
    publisher: 'Sega / Tiger Electronics',
    year: 1998,
    genre: 'Platformer',
    description: 'Official retail cartridge binary (Header: "SONIC JAM", ID: $2015). Executes natively on the cycle-accurate SM8521 CPU.',
    sizeBytes: 2097152,
    isBuiltin: false,
    coverColor: '#1e3a8a',
    coverAccent: '#38bdf8',
    romUrl: './roms/sonicjam.bin'
  }
];
