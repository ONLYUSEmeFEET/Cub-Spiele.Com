/**
 * Tiger Game.Com Cartridge & ROM Subsystem
 * Handles .bin, .tgc, and .zip file loading, ZIP archive decompression via fflate,
 * Game.com internal ROM header parsing, checksum verification, and cartridge database matching.
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
  headerMatches: string[];
  coverColor: string;
  coverAccent: string;
}

export const KNOWN_GAMECOM_GAMES: Record<string, KnownGame> = {
  indy500: {
    id: 'indy500',
    title: 'Indy 500',
    publisher: 'Tiger Electronics / IMS',
    year: 1997,
    genre: 'Arcade Racing',
    description: 'High-speed Formula 1 open-wheel racing at the Indianapolis Motor Speedway and world circuits. Dual-gear acceleration and drafting.',
    headerMatches: ['INDY 500', 'INDY', 'INDIANAPOLIS', 'RACING'],
    coverColor: '#b91c1c',
    coverAccent: '#f59e0b'
  },
  williams: {
    id: 'williams',
    title: 'Williams Arcade Classics',
    publisher: 'Williams / Midway / Tiger',
    year: 1997,
    genre: 'Arcade Classics',
    description: 'Classic arcade masterpieces: Joust, Defender, Robotron 2084, and Sinistar ported faithfully with touch controls.',
    headerMatches: ['WILLIAMS', 'ARCADE', 'JOUST', 'DEFENDER', 'ROBOTRON'],
    coverColor: '#581c87',
    coverAccent: '#c084fc'
  },
  re2: {
    id: 're2',
    title: 'Resident Evil 2',
    publisher: 'Capcom / Tiger',
    year: 1998,
    genre: 'Survival Horror',
    description: 'The legendary handheld port of Capcom\'s classic. Control Leon S. Kennedy through the undead-infested R.P.D. station.',
    headerMatches: ['RESIDENT EVIL', 'RE2', 'CAPCOM', 'LEON'],
    coverColor: '#1c1917',
    coverAccent: '#dc2626'
  },
  sonic: {
    id: 'sonic',
    title: 'Sonic Jam',
    publisher: 'Sega / Tiger',
    year: 1998,
    genre: 'Platformer',
    description: 'Sega\'s iconic blue hedgehog comes to Game.com! Spin-dash, collect golden rings, and defeat Badniks in Green Hill.',
    headerMatches: ['SONIC JAM', 'SONIC', 'SEGA'],
    coverColor: '#1e3a8a',
    coverAccent: '#38bdf8'
  },
  duke3d: {
    id: 'duke3d',
    title: 'Duke Nukem 3D',
    publisher: 'GT Interactive / 3D Realms / Tiger',
    year: 1997,
    genre: 'First-Person Shooter',
    description: 'Hail to the King! The impressive 2.5D raycaster port with Shotguns, Pig Cops, and explosive action.',
    headerMatches: ['DUKE NUKEM', 'DUKE3D', '3D REALMS', 'NUKEM'],
    coverColor: '#78350f',
    coverAccent: '#f59e0b'
  },
  batman: {
    id: 'batman',
    title: 'Batman & Robin',
    publisher: 'Warner Bros / Tiger',
    year: 1998,
    genre: 'Action Beat \'Em Up',
    description: 'Defend Gotham City with batarangs, martial arts, grappling hooks, and crime-fighting action.',
    headerMatches: ['BATMAN', 'ROBIN', 'GOTHAM', 'WARNER'],
    coverColor: '#0f172a',
    coverAccent: '#eab308'
  },
  lightsout: {
    id: 'lightsout',
    title: 'Lights Out',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Puzzle / Logic',
    description: 'The pack-in touchscreen sensation! Tap cells to flip adjacent lights and clear the 5x5 board.',
    headerMatches: ['LIGHTS OUT', 'LIGHTS', 'TIGER ELECTRONICS'],
    coverColor: '#18181b',
    coverAccent: '#22c55e'
  },
  lostworld: {
    id: 'lostworld',
    title: 'The Lost World: Jurassic Park',
    publisher: 'Universal / Tiger',
    year: 1997,
    genre: 'Action Adventure',
    description: 'InGen dinos have run wild! Survive T-Rex encounters and Velociraptors across Isla Sorna.',
    headerMatches: ['LOST WORLD', 'JURASSIC', 'PARK', 'DINO'],
    coverColor: '#14532d',
    coverAccent: '#84cc16'
  },
  mkt: {
    id: 'mkt',
    title: 'Mortal Kombat Trilogy',
    publisher: 'Midway / Tiger',
    year: 1998,
    genre: 'Fighting',
    description: 'Tiger\'s port featuring Liu Kang, Sub-Zero, and Scorpion with martial arts combos and special moves.',
    headerMatches: ['MORTAL KOMBAT', 'MKT', 'MIDWAY', 'KOMBAT'],
    coverColor: '#450a0a',
    coverAccent: '#ef4444'
  },
  wheel: {
    id: 'wheel',
    title: 'Wheel of Fortune',
    publisher: 'GameTek / Tiger',
    year: 1997,
    genre: 'Game Show',
    description: 'Spin the wheel, guess the consonants, and solve the word puzzle on the Game.com touchscreen.',
    headerMatches: ['WHEEL OF FORTUNE', 'GAMETEK', 'WHEEL'],
    coverColor: '#4c1d95',
    coverAccent: '#a855f7'
  },
  jeopardy: {
    id: 'jeopardy',
    title: 'Jeopardy!',
    publisher: 'GameTek / Tiger',
    year: 1998,
    genre: 'Trivia Quiz',
    description: 'America\'s favorite quiz show with thousands of clues, Daily Doubles, and Final Jeopardy.',
    headerMatches: ['JEOPARDY', 'GAMETEK'],
    coverColor: '#1e1b4b',
    coverAccent: '#60a5fa'
  },
  frogger: {
    id: 'frogger',
    title: 'Frogger',
    publisher: 'Hasbro / Tiger',
    year: 1999,
    genre: 'Arcade Classic',
    description: 'Hop across highway traffic and float across logs to guide your frogs home safely.',
    headerMatches: ['FROGGER', 'HASBRO', 'KONAMI'],
    coverColor: '#064e3b',
    coverAccent: '#10b981'
  },
  centipede: {
    id: 'centipede',
    title: 'Centipede',
    publisher: 'Hasbro / Tiger',
    year: 1999,
    genre: 'Arcade Shooter',
    description: 'Atari\'s arcade legendary insect shooter with trackball stylus or D-pad controls.',
    headerMatches: ['CENTIPEDE', 'ATARI', 'HASBRO'],
    coverColor: '#701a75',
    coverAccent: '#ec4899'
  },
  monopoly: {
    id: 'monopoly',
    title: 'Monopoly',
    publisher: 'Hasbro / Tiger',
    year: 1999,
    genre: 'Board Game',
    description: 'Buy, trade, and build houses and hotels with stylus property management.',
    headerMatches: ['MONOPOLY', 'HASBRO'],
    coverColor: '#065f46',
    coverAccent: '#34d399'
  }
};

/**
 * Calculates 32-bit CRC or Fletcher checksum for ROM verification
 */
export function calculateChecksum(data: Uint8Array): string {
  let sum1 = 0xffff;
  let sum2 = 0xffff;
  const len = Math.min(data.length, 65536); // first 64KB for speed or whole file

  for (let i = 0; i < len; i++) {
    sum1 = (sum1 + data[i]) % 65535;
    sum2 = (sum2 + sum1) % 65535;
  }
  const checksum = ((sum2 << 16) | sum1) >>> 0;
  return checksum.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Inspects a binary buffer for ASCII text strings commonly found in Game.com ROM headers
 */
export function scanRomStrings(data: Uint8Array): string[] {
  const strings: string[] = [];
  let current = '';

  // Scan first 16KB of ROM
  const limit = Math.min(data.length, 16384);
  for (let i = 0; i < limit; i++) {
    const byte = data[i];
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= 4) {
        strings.push(current.trim());
      }
      current = '';
    }
  }
  if (current.length >= 4) strings.push(current.trim());
  return strings;
}

/**
 * Parses a ROM file (.bin, .tgc, or .zip) into a CartridgeInfo structure
 */
export async function loadCartridgeFromFile(file: File): Promise<CartridgeInfo> {
  const arrayBuffer = await file.arrayBuffer();
  let romBytes = new Uint8Array(arrayBuffer);
  let fileName = file.name;

  // Check if it's a ZIP archive
  if (fileName.toLowerCase().endsWith('.zip') || (romBytes[0] === 0x50 && romBytes[1] === 0x4b)) {
    try {
      const unzipped = unzipSync(romBytes);
      // Look for .bin, .tgc, .rom files in archive
      const entryNames = Object.keys(unzipped);
      let targetEntry = entryNames.find(name => {
        const lower = name.toLowerCase();
        return (lower.endsWith('.bin') || lower.endsWith('.tgc') || lower.endsWith('.rom')) && !name.startsWith('__MACOSX');
      });

      // If no extension matches, pick the largest file inside the zip
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

  // Scan ROM strings & match against database
  const extractedStrings = scanRomStrings(romBytes);
  const upperFileName = fileName.toUpperCase();
  const checksum = calculateChecksum(romBytes);

  let matchedGame: KnownGame | null = null;

  // 1. Try matching against known database via strings & filename
  for (const gameKey in KNOWN_GAMECOM_GAMES) {
    const game = KNOWN_GAMECOM_GAMES[gameKey];
    for (const pattern of game.headerMatches) {
      if (upperFileName.includes(pattern)) {
        matchedGame = game;
        break;
      }
      for (const str of extractedStrings) {
        if (str.toUpperCase().includes(pattern)) {
          matchedGame = game;
          break;
        }
      }
      if (matchedGame) break;
    }
    if (matchedGame) break;
  }

  if (matchedGame) {
    return {
      id: matchedGame.id,
      title: matchedGame.title,
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

  // If unknown ROM or homebrew, deduce title from filename or internal strings
  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[\(_].*$/, '').trim() || 'Game.Com Cartridge';
  const detectedPublisher = extractedStrings.find(s =>
    s.includes('TIGER') || s.includes('CAPCOM') || s.includes('SEGA') || s.includes('INC')
  ) || 'Game.Com Homebrew';

  return {
    id: `custom_${Date.now()}`,
    title: cleanTitle,
    publisher: detectedPublisher,
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
 * Official TOSEC Cartridge ROM binaries served from /roms/
 */
export const PRELOADED_CARTRIDGES: CartridgeInfo[] = [
  {
    id: 'lightsout',
    title: 'Lights Out (1997 TOSEC ROM)',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Puzzle / Logic',
    description: 'Official 32KB pack-in cartridge binary (Lights Out (1997)(Tiger Electronics).bin). Executes natively on the cycle-accurate SM8521 CPU.',
    sizeBytes: 32768,
    isBuiltin: false,
    coverColor: '#18181b',
    coverAccent: '#22c55e',
    romUrl: './roms/lightsout.bin'
  },
  {
    id: 'sonic',
    title: 'Sonic Jam (1998 TOSEC ROM)',
    publisher: 'Sega / Tiger Electronics',
    year: 1998,
    genre: 'Platformer',
    description: 'Official 2MB retail cartridge binary (Sonic Jam (1998)(Tiger Electronics).bin). Executes natively on the cycle-accurate SM8521 CPU.',
    sizeBytes: 2097152,
    isBuiltin: false,
    coverColor: '#1e3a8a',
    coverAccent: '#38bdf8',
    romUrl: './roms/sonicjam.bin'
  }
];


