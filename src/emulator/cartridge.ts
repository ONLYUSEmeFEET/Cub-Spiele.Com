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
  romMd5s?: string[];
  headerMatches: string[];
  coverColor: string;
  coverAccent: string;
  scoreUnit?: string;
  labelImage?: string;
  partNumber?: string;
  diskmanUrl?: string;
  manualUrl?: string;
  diskmanHighlights?: string[];
  linkPlaySupport?: boolean;
  isSystemCart?: boolean;
}

export const KNOWN_GAMECOM_GAMES: Record<string, KnownGame> = {
  lightsout: {
    id: 'lightsout',
    title: 'Lights Out',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Puzzle / Logic',
    description:
      'This award-winning puzzle game generates billions of puzzle combinations — more than enough to keep your lights on for years! Includes three basic games, two puzzle types per game, and increasing levels of difficulty.',
    gameIds: [0x0917],
    headerMatches: ['LIGHTSOUT', 'LIGHTS OUT', 'LIGHT OUT', 'LIGHTOUT'],
    coverColor: '#18181b',
    coverAccent: '#22c55e',
    scoreUnit: 'Level / Puzzles',
    labelImage: './assets/labels/lightsout.jpg',
    partNumber: '71-735',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/lights.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Lights_Out-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Pack-in launch cartridge included with the original 1997 Game.com',
      'Three game modes with 5x5 and 6x6 grid puzzles',
      'Battery-backed NVRAM progression saving across puzzle sets'
    ]
  },
  sonicjam: {
    id: 'sonicjam',
    title: 'Sonic Jam',
    publisher: 'Sega / Tiger Electronics',
    year: 1998,
    genre: 'Platformer',
    description:
      "Everyone's favorite hedgehog is at it again and he's jammin'! Play classic levels of Sonic 2, Sonic 3, and Sonic & Knuckles as Sonic, Tails, or Knuckles to defeat the evil Dr. Robotnik.",
    gameIds: [0x0432, 0x0518],
    headerMatches: ['SONIC JAM', 'SONICJAM'],
    coverColor: '#1e3a8a',
    coverAccent: '#38bdf8',
    scoreUnit: 'Points',
    labelImage: './assets/labels/sonicjam.jpg',
    partNumber: '71-734',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/sonic.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Sonic_Jam-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Play as Sonic, Tails, or Knuckles',
      'Stages adapted from Sonic 2, Sonic 3 & Sonic & Knuckles',
      'Hidden giant rings unlock special bonus stages'
    ]
  },
  castlevania: {
    id: 'castlevania',
    title: 'Castlevania: Symphony of the Night',
    publisher: 'Konami / Tiger Electronics',
    year: 1998,
    genre: 'Action RPG / Metroidvania',
    description:
      "Unreleased prototype adaptation of Konami's classic. Explore Dracula's castle as Alucard with RPG leveling, sub-weapons, relics, and boss battles.",
    gameIds: [0x0448, 0x4804],
    romMd5s: ['76ceda41231eafa9d39df77011a90c30'],
    headerMatches: ['CVA', 'CASTLEVAN', 'SOTN'],
    coverColor: '#3b0764',
    coverAccent: '#c084fc',
    scoreUnit: 'Points / Gold',
    labelImage: './assets/labels/castlevania.jpg',
    partNumber: 'Prototype',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/unreleased.htm',
    diskmanHighlights: [
      'Unreleased prototype preserved by the community',
      'Play as Alucard across Dracula’s castle with RPG stats & inventory',
      'Double-buffered VRAM rendering and digitized sound effects'
    ]
  },
  castlevaniareborn: {
    id: 'castlevaniareborn',
    title: 'Castlevania - Symphony of the Night Reborn',
    publisher: 'Konami / Tiger Electronics · Reborn v0.1',
    year: 1998,
    genre: 'Action RPG / Metroidvania',
    description:
      "Restored edition of the unreleased 1998 Tiger Game.Com Castlevania: Symphony of the Night prototype (v0.1). Features dedicated CV REBORN ($B745/$B746) battery-backed NVRAM saving with pre-filled password reload, Pause inventory, responsive jump/double-jump & Bat/Mist controls, cardinal D-pad spells from Level 1, Long Library item/relic fixes, and Richter/Dracula boss fixes.",
    // $B745 = "CV REBORN" NVRAM slot 0, $B746 = binary save slot 1 (separate from Castlevania $0448/$0449)
    gameIds: [0xb745],
    romMd5s: [
      '47478855e34268b2247ec96885851dd1',
      '2808451316064cffa9b26a563351b965',
      '8840cacc78cf7c7da8d053e3e6cbfcc1',
      '01d2536cae5df6427fcc3c73d009acdd',
      'b52a53bc2fc3e9bd4eb570f91822c1af'
    ],
    headerMatches: ['CV REBORN', 'CVAREBORN', 'SOTN REBORN', 'CASTLEVANIA - SYMPHONY OF THE NIGHT REBORN'],
    coverColor: '#450a0a',
    coverAccent: '#f43f5e',
    scoreUnit: 'Points / Gold',
    labelImage: './assets/labels/castlevania-reborn.jpg',
    partNumber: 'Reborn v0.1',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/unreleased.htm',
    diskmanHighlights: [
      'Restored battery-backed NVRAM saving under dedicated CV REBORN ($B745/$B746) slots',
      'Pre-filled Password screen & Save Room persistence without corrupting the prototype NVRAM',
      '100% SM8521 hardware-compatible v0.1 patch: Pause inventory, Bat/Mist, spells, physics & bosses'
    ]
  },
  solitaire: {
    id: 'solitaire',
    title: 'Built-In Solitaire',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Card Game',
    description:
      'Built-in Klondike Solitaire stored inside the Tiger Game.Com System BIOS ROM with automatic NVRAM high score tracking.',
    gameIds: [0xfee0],
    headerMatches: ['SOLITAIRE'],
    coverColor: '#064e3b',
    coverAccent: '#10b981',
    scoreUnit: 'Points',
    isSystemCart: true
  },
  williams: {
    id: 'williams',
    title: 'Williams Arcade Classics',
    publisher: 'Midway Games / Tiger Electronics',
    year: 1997,
    genre: 'Arcade Classics',
    description:
      'Five of the greatest arcade hits of all time in one portable collection: Joust, Defender, Robotron: 2084, Defender II (Stargate), and Sinistar!',
    gameIds: [0x1a15, 0x0617],
    headerMatches: ['WILLIAMS', 'ARCADE CL', 'ARCADECL'],
    coverColor: '#581c87',
    coverAccent: '#c084fc',
    scoreUnit: 'Points',
    labelImage: './assets/labels/williams.jpg',
    partNumber: '71-722',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/arcade.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Williams_Arcade_Classics-gamecom_instructions.pdf',
    linkPlaySupport: true,
    diskmanHighlights: [
      'Includes Joust, Defender, Defender II, Robotron & Sinistar',
      'Authentic arcade sound effects ("Beware, I LIVE!")',
      'Supports 2-player Compete.Com Link Cable play'
    ]
  },
  re2: {
    id: 're2',
    title: 'Resident Evil 2',
    publisher: 'Capcom / Tiger Electronics',
    year: 1998,
    genre: 'Survival Horror',
    description:
      "Zombies have overtaken the city. As sworn officer Leon S. Kennedy, uncover unspeakable evil through Raccoon City and the R.P.D. station. Features typewriter ribbon save support.",
    gameIds: [0x1b3a, 0x1d18],
    headerMatches: ['RESIDENT2', 'RES EVIL2', 'RESIDENT', 'GAMECOM'],
    coverColor: '#1c1917',
    coverAccent: '#dc2626',
    scoreUnit: 'Points',
    labelImage: './assets/labels/re2.jpg',
    partNumber: '71-745',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/re2.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Resident_Evil_2-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Only commercial Game.com release with battery-backed game saves via Typewriters',
      'Isometric survival horror following Leon S. Kennedy',
      'Digitized voice clips and creature encounters'
    ]
  },
  duke3d: {
    id: 'duke3d',
    title: 'Duke Nukem 3D',
    publisher: '3D Realms / Tiger Electronics',
    year: 1997,
    genre: 'First-Person Shooter',
    description:
      "Hi-octane action at your fingertips! Pull out your shotgun and start blasting as swarms of aliens gun for your head. Remember: it's a frag-or-be-fragged world.",
    gameIds: [0x1b2b, 0x0b17],
    headerMatches: ['DUKE 3D', 'DUKENUKEM', 'DUKE3D', 'DUKENUKE'],
    coverColor: '#78350f',
    coverAccent: '#f59e0b',
    scoreUnit: 'Points',
    labelImage: './assets/labels/duke3d.jpg',
    partNumber: '71-712',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/duke3d.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Duke_Nukem_3D-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Built-in Duke Nukem speech ("Hail to the king, baby!")',
      '3D-style corridor graphics and boss battles',
      'Classic arsenal including Shotgun, Chaingun, RPG & Freezer'
    ]
  },
  megamix: {
    id: 'megamix',
    title: 'Fighters Megamix',
    publisher: 'Sega AM2 / Tiger Electronics',
    year: 1998,
    genre: 'Fighting',
    description:
      "It's Virtua Fighter 2 vs. Fighting Vipers! Two arcade smash hits smashing into each other in the ultimate battle for supremacy, plus hidden characters from Daytona USA and Virtua Cop.",
    gameIds: [0x0426, 0x1018],
    headerMatches: ['FIGHTMEGA', 'FIGHTERS', 'MEGAMIX', 'FIGHTMIX'],
    coverColor: '#7c2d12',
    coverAccent: '#fb923c',
    scoreUnit: 'Points',
    labelImage: './assets/labels/megamix.jpg',
    partNumber: '71-739',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/fmega.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Fighters_Megamix-gamecom_instructions.pdf',
    linkPlaySupport: true,
    diskmanHighlights: [
      '12 fighters including unlockable Kids Sarah, Janet, Hornet & Siba',
      'Head-to-head 2-player VS mode via Compete.Com Link Cable',
      'Multiple single-player tournament courses (A, B, C, D)'
    ]
  },
  indy500: {
    id: 'indy500',
    title: 'Indy 500',
    publisher: 'IMS / Tiger Electronics',
    year: 1997,
    genre: 'Racing',
    description:
      'START YOUR ENGINES! Zoom around the curves and navigate the thrills of the Indianapolis Motor Speedway with real speech, car customization, and weather hazards.',
    gameIds: [0x1152, 0x0517],
    headerMatches: ['INDY 500', 'INDY500'],
    coverColor: '#1e3a8a',
    coverAccent: '#facc15',
    scoreUnit: 'Points',
    labelImage: './assets/labels/indy500.jpg',
    partNumber: '71-525',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/indy500.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Indy_500-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Built-in speech and engine sound effects',
      'First-person cockpit and third-person chase camera views',
      'Customizable car setups, pit stops, and weather conditions'
    ]
  },
  batman: {
    id: 'batman',
    title: 'Batman & Robin',
    publisher: 'DC Comics / Tiger Electronics',
    year: 1997,
    genre: "Action Beat 'Em Up",
    description:
      "An evil chill confronts Batman and Robin! Encouraged by Poison Ivy and Bane, the sinister Mr. Freeze plans to steal Gotham City's diamonds. Put these criminals in the cooler!",
    gameIds: [0x0a31, 0x0317],
    headerMatches: ['BATMAN&R', 'BATMAN', 'BATMANR'],
    coverColor: '#0f172a',
    coverAccent: '#eab308',
    scoreUnit: 'Points',
    labelImage: './assets/labels/batman.jpg',
    partNumber: '71-709',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/batman.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Batman_and_Robin-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Play as Batman or Robin across Gotham City',
      'Battle Mr. Freeze, Poison Ivy, and Bane',
      'Side-scrolling brawler action with batarangs and gadgets'
    ]
  },
  lostworld: {
    id: 'lostworld',
    title: 'The Lost World: Jurassic Park',
    publisher: 'Universal / Amblin / Tiger',
    year: 1997,
    genre: 'Action Adventure',
    description:
      "Experience all the heart-pounding adventure of The Lost World! With Raptors nipping at your heels and the deadly T-Rex on the loose, survive 6 levels of intense dinosaur challenges.",
    gameIds: [0x0a42, 0x0817],
    headerMatches: ['LOSTWORLD', 'JURASSIC', 'LOSTWRLD'],
    coverColor: '#14532d',
    coverAccent: '#84cc16',
    scoreUnit: 'Points',
    labelImage: './assets/labels/lostworld.jpg',
    partNumber: '71-704',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/lostworld.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/The_Lost_World_Jurassic_Park-gamecom_instructions.pdf',
    diskmanHighlights: [
      '6 levels of vehicle and on-foot dinosaur survival',
      'Sound effects adapted directly from the film',
      'Hidden features and T-Rex / Raptor encounters'
    ]
  },
  mkt: {
    id: 'mkt',
    title: 'Mortal Kombat Trilogy',
    publisher: 'Midway / Tiger Electronics',
    year: 1997,
    genre: 'Fighting',
    description:
      "Enter Shao Kahn's deadly tournament! Features digitized martial arts fighters, special moves, Fatalities, Brutalities, hidden characters (Ermac & Noob Saibot), and 2-player Link Cable play.",
    gameIds: [0x0914, 0x0a17],
    headerMatches: ['MORTAL K', 'MKTRILOGY', 'MORTALKOM', 'MKTRILGY'],
    coverColor: '#450a0a',
    coverAccent: '#ef4444',
    scoreUnit: 'Wins / Points',
    labelImage: './assets/labels/mkt.jpg',
    partNumber: '71-711',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/mktril.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Mortal_Kombat_Trilogy-gamecom_instructions.pdf',
    linkPlaySupport: true,
    diskmanHighlights: [
      '13 fighters including secret characters Ermac & Noob Saibot',
      'Fatalities, Brutalities, Babalities & Friendships',
      'Head-to-head 2-player kombat via Compete.Com Link Cable'
    ]
  },
  wheel: {
    id: 'wheel',
    title: 'Wheel of Fortune',
    publisher: 'Califon / Tiger Electronics',
    year: 1997,
    genre: 'Game Show',
    description:
      "Experience all the vowel-buying fun of America's #1 game show! Spin the wheel, call consonants, and solve 750 authentic Wheel of Fortune puzzles with built-in speech.",
    gameIds: [0x2343, 0x0717],
    headerMatches: ['WHEEL OF', 'WHEEL 1', 'W OF FORT', 'WHEELFOR'],
    coverColor: '#4c1d95',
    coverAccent: '#a855f7',
    scoreUnit: 'Cash ($)',
    labelImage: './assets/labels/wheel.jpg',
    partNumber: '71-523',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/wof.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Wheel_of_Fortune-gamecom_instructions.pdf',
    diskmanHighlights: [
      '750 authentic TV-show word puzzles',
      'Built-in voice clips and touchscreen letter selection',
      'Classic rounds and bonus prize wheel'
    ]
  },
  wheel2: {
    id: 'wheel2',
    title: 'Wheel of Fortune 2',
    publisher: 'Califon / Tiger Electronics',
    year: 1998,
    genre: 'Game Show',
    description:
      '750 brand-new puzzles created by the TV-show producers bring hours of brain-teasing game show challenge home with touchscreen letter selection and speech.',
    gameIds: [0x2344, 0x1418],
    headerMatches: ['WHEEL 2', 'WHEEL2', 'WHEELFO2'],
    coverColor: '#1e3a8a',
    coverAccent: '#60a5fa',
    scoreUnit: 'Cash ($)',
    labelImage: './assets/labels/wheel2.jpg',
    partNumber: '71-527',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/wof2.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Wheel_of_Fortune_2-gamecom_instructions.pdf',
    diskmanHighlights: [
      '750 all-new official Wheel of Fortune puzzles',
      'Touchscreen keyboard interface and digitized speech',
      'Supports 1 to 3 players'
    ]
  },
  jeopardy: {
    id: 'jeopardy',
    title: 'Jeopardy!',
    publisher: 'Jeopardy Productions / Tiger',
    year: 1998,
    genre: 'Trivia Quiz',
    description:
      "The challenge, excitement, and thrill of America's favorite quiz show! Pick categories, uncover Daily Doubles, and wager carefully in Final Jeopardy for 1–3 players.",
    gameIds: [0x2371, 0x0f18],
    headerMatches: ['JEOPARDY!', 'JEOPARDY'],
    coverColor: '#1e1b4b',
    coverAccent: '#60a5fa',
    scoreUnit: 'Cash ($)',
    labelImage: './assets/labels/jeopardy.jpg',
    partNumber: '71-726',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/jeopardy.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Jeopardy!-gamecom_instructions.pdf',
    linkPlaySupport: true,
    diskmanHighlights: [
      'Jeopardy, Double Jeopardy, Daily Doubles & Final Jeopardy',
      'Touchscreen answer selection and wagering',
      'Supports 1–3 players and Compete.Com Link Cable play'
    ]
  },
  frogger: {
    id: 'frogger',
    title: 'Frogger',
    publisher: 'Konami / Tiger Electronics',
    year: 1999,
    genre: 'Arcade Classic',
    description:
      "How does the Frog cross the road? CAREFULLY! Guide every leap across hazardous highways and wild waterways in both Classic Arcade mode and an updated 90's version.",
    gameIds: [0x1a18],
    headerMatches: ['FROGGER', 'FROGGMEGA'],
    coverColor: '#064e3b',
    coverAccent: '#10b981',
    scoreUnit: 'Points',
    labelImage: './assets/labels/frogger.jpg',
    partNumber: '71-756',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/frogger.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Frogger-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Includes both Classic Arcade mode and Updated 90s version',
      'Dodge speeding trucks, logs, turtles, and alligators',
      'High-score saving in battery-backed NVRAM'
    ]
  },
  centipede: {
    id: 'centipede',
    title: 'Centipede',
    publisher: 'Atari Interactive / Tiger',
    year: 1999,
    genre: 'Arcade Shooter',
    description:
      "The insects are back—and this time it's personal! Fend off waves of centipedes, spiders, fleas, and scorpions in both Classic gameplay mode and an updated 90's version.",
    gameIds: [0x1a21, 0x1b18],
    headerMatches: ['CENTIPEDE', 'CENTIPED'],
    coverColor: '#701a75',
    coverAccent: '#ec4899',
    scoreUnit: 'Points',
    labelImage: './assets/labels/centipede.jpg',
    partNumber: '71-755',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/centipede.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Centipede-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Includes Classic Arcade mode and Updated 90s version',
      'Fast-paced mushroom field shooter action',
      'Fleas, Spiders, Scorpions, and multi-segment Centipedes'
    ]
  },
  monopoly: {
    id: 'monopoly',
    title: 'Monopoly',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1999,
    genre: 'Board Game',
    description:
      'Pass GO and go directly to fun! Play against the Game.com AI or up to 6 friends—trade railroads, buy houses, build hotels, and bankrupt your opponents!',
    gameIds: [0x3105, 0x1918],
    headerMatches: ['MONOPOLY'],
    coverColor: '#065f46',
    coverAccent: '#34d399',
    scoreUnit: 'Net Worth ($)',
    labelImage: './assets/labels/monopoly.jpg',
    partNumber: '71-752',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/monopoly.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Monopoly-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Full Monopoly rules for up to 6 players (human or AI)',
      'Touchscreen property management, auctions, and trading',
      'Animated tokens and classic board properties'
    ]
  },
  scrabble: {
    id: 'scrabble',
    title: 'Scrabble',
    publisher: 'Hasbro / Tiger Electronics',
    year: 1999,
    genre: 'Word Board Game',
    description:
      'Portable version of the All-American classic crossword game with a touchscreen tile interface, built-in dictionary validation, and support for up to 4 players.',
    gameIds: [0x3114, 0x1c18],
    headerMatches: ['SCRABBLE'],
    coverColor: '#115e59',
    coverAccent: '#2dd4bf',
    scoreUnit: 'Points',
    labelImage: './assets/labels/scrabble.jpg',
    partNumber: '71-754',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/scrabble.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Scrabble-gamecom_instructions.pdf',
    linkPlaySupport: true,
    diskmanHighlights: [
      'Compete against up to 4 players or computer opponents',
      'Touchscreen drag-and-place tile rack and board zoom',
      'Supports 2-player head-to-head Compete.Com Link Cable play'
    ]
  },
  casino: {
    id: 'casino',
    title: 'Tiger Casino',
    publisher: 'Tiger Electronics',
    year: 1998,
    genre: 'Card & Casino',
    description:
      'Step in and place your bets across 6 casino classics: Video Poker, Video Blackjack, Roulette, Video Hi-Low (War), and two Video Slot Machines with touchscreen wagering.',
    gameIds: [0x3011, 0x0e18],
    headerMatches: ['TIGER CAS', 'CASINO', 'DMGCASINO', 'TCASINO'],
    coverColor: '#713f12',
    coverAccent: '#facc15',
    scoreUnit: 'Bankroll ($)',
    labelImage: './assets/labels/casino.jpg',
    partNumber: '71-731',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/tcasino.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Tiger_Casino-gamecom_instructions.pdf',
    diskmanHighlights: [
      '6 casino games: Blackjack, Poker, Roulette, Hi-Low & 2 Slots',
      'Full touchscreen betting and card control',
      'Persistent bankroll high score tracking'
    ]
  },
  quizwiz: {
    id: 'quizwiz',
    title: 'Quiz Wiz: Cyber Trivia',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Trivia',
    description:
      '1,500 mind-bending cybertrivia questions across 5 categories: Sports, TV & Film, Famous People, Potpourri, and General Knowledge, hosted by the Wise Guy ("Mr. Dude")!',
    gameIds: [0x2351, 0x0417],
    headerMatches: ['QUIZ WIZ', 'QUIZWIZ'],
    coverColor: '#312e81',
    coverAccent: '#818cf8',
    scoreUnit: 'Points',
    labelImage: './assets/labels/quizwiz.jpg',
    partNumber: '71-524',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/quizwiz.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Quiz_Wiz_Cyber_Trivia-gamecom_instructions.pdf',
    diskmanHighlights: [
      '1,500 trivia questions across 5 categories',
      'Hosted by "Mr. Dude" with voice and animation',
      'Touchscreen multiple-choice gameplay'
    ]
  },
  henry: {
    id: 'henry',
    title: 'Henry',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Puzzle / Memory',
    description:
      'Match the Sounds Memory Game! Match sounds and visual clues on the touchscreen board while outsmarting Henry, the consummate confounder—four matches in a row wins!',
    gameIds: [0x0932, 0x0c17],
    headerMatches: ['HENRY', 'DMG HENRY'],
    coverColor: '#581c87',
    coverAccent: '#d8b4fe',
    scoreUnit: 'Points',
    labelImage: './assets/labels/henry.jpg',
    partNumber: '71-728',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/henry.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Henry-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Award-winning sound and visual memory matching game',
      'Thousands of board combinations and touchscreen play',
      'Match four in a row to beat Henry'
    ]
  },
  internet: {
    id: 'internet',
    title: 'Game.com Internet',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Communications / Utility',
    description:
      'Official Tiger Game.com communications cartridge for linking to text-based internet and email services over an external 14.4kbps Hayes-compatible modem.',
    gameIds: [0x0313],
    headerMatches: ['INTERNET', 'GCOM NET'],
    coverColor: '#0f172a',
    coverAccent: '#38bdf8',
    labelImage: './assets/labels/internet.jpg',
    partNumber: '71-529',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/internet.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/gamecom_Internet-instructions.pdf',
    diskmanHighlights: [
      'Connects to Cub Spiele.Com’s built-in Virtual Hayes AT Modem',
      'Supports text-based web browsing and email terminal emulation',
      'Includes ISP dial-up configuration and address book'
    ]
  },
  weblink: {
    id: 'weblink',
    title: 'Tiger Web Link',
    publisher: 'Tiger Electronics',
    year: 1997,
    genre: 'Communications / Utility',
    description:
      'Connects the Game.com system to a PC to upload high scores to the Top 25 leaderboard and download secret cheats and unlockables.',
    gameIds: [0x0213],
    headerMatches: ['WEB LINK', 'WEBLINK', 'TIGER WEB'],
    coverColor: '#1e1b4b',
    coverAccent: '#818cf8',
    labelImage: './assets/labels/weblink.jpg',
    partNumber: '71-747',
    diskmanUrl: 'https://www.diskman.com/presents/gamecom/weblink.htm',
    manualUrl: 'https://www.diskman.com/presents/gamecom/scans/Tiger_Web_Link-gamecom_instructions.pdf',
    diskmanHighlights: [
      'Uploads battery-backed NVRAM high scores to PC / Web Link',
      'Downloads unlock codes and secret game features',
      'Supported natively by Cub Spiele.Com’s Tiger Web Link bridge'
    ]
  },
  competetest: {
    id: 'competetest',
    title: 'Compete.Com Link Test Cartridge',
    publisher: 'Cub Spiele.Com Diagnostics',
    year: 1998,
    genre: 'Diagnostic / Link Test',
    description:
      'Hardware diagnostic cartridge testing Port 3 ($0017) crossover lines, BIOS UART ($002B-$002E) full-duplex serial I/O, and multi-byte burst checksums.',
    gameIds: [0xc0de],
    headerMatches: ['LINK TEST', 'LINKTEST', 'COMPETE'],
    coverColor: '#064e3b',
    coverAccent: '#10b981',
    scoreUnit: 'Bytes',
    isSystemCart: true
  }
};

export function isBiosFilename(rawName: string): boolean {
  const base = (rawName.split(/[\\/]/).pop() || rawName).toLowerCase();
  const stem = base.replace(/\.[^/.]+$/, '').trim();
  if (
    stem === 'gamecom' ||
    stem === 'internal' ||
    stem === 'external' ||
    base.includes('external bios') ||
    base.includes('internal bios') ||
    base.includes('71-516') ||
    /\bbios\b/i.test(base)
  ) {
    return true;
  }
  return false;
}

export function resolveKnownGameFromFilename(rawName: string): KnownGame | null {
  if (isBiosFilename(rawName)) return null;
  const base = rawName.split(/[\\/]/).pop() || rawName;
  const stem = base.replace(/\.[^/.]+$/, '').trim();
  const upper = stem.toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]/g, '');

  const directMap: Record<string, string> = {
    ARCADECL: 'williams',
    BATMANR: 'batman',
    CENTIPED: 'centipede',
    DUKENUKE: 'duke3d',
    FIGHTMIX: 'megamix',
    FROGGER: 'frogger',
    HENRY: 'henry',
    INDY500: 'indy500',
    JEOPARDY: 'jeopardy',
    LIGHTOUT: 'lightsout',
    LIGHTSOUT: 'lightsout',
    LOSTWRLD: 'lostworld',
    MKTRILGY: 'mkt',
    MONOPOLY: 'monopoly',
    QUIZWIZ: 'quizwiz',
    RE2: 're2',
    SCRABBLE: 'scrabble',
    SONICJAM: 'sonicjam',
    TCASINO: 'casino',
    WHEELFO2: 'wheel2',
    WHEELFOR: 'wheel'
  };
  if (directMap[compact] && KNOWN_GAMECOM_GAMES[directMap[compact]]) {
    return KNOWN_GAMECOM_GAMES[directMap[compact]];
  }

  for (const g of Object.values(KNOWN_GAMECOM_GAMES)) {
    if (g.partNumber && g.partNumber !== 'Prototype' && upper.includes(g.partNumber.toUpperCase())) {
      return g;
    }
  }

  if (upper.includes('WHEEL OF FORTUNE 2') || upper.includes('WHEEL 2') || compact.includes('WHEEL2')) {
    return KNOWN_GAMECOM_GAMES.wheel2;
  }
  if (upper.includes('WHEEL OF FORTUNE')) {
    return KNOWN_GAMECOM_GAMES.wheel;
  }
  if (
    (upper.includes('CASTLEVANIA') || upper.includes('SYMPHONY OF THE NIGHT') || upper.includes('SOTN')) &&
    upper.includes('REBORN')
  ) {
    return KNOWN_GAMECOM_GAMES.castlevaniareborn;
  }
  if (upper.includes('CASTLEVANIA') || upper.includes('SYMPHONY OF THE NIGHT')) {
    return KNOWN_GAMECOM_GAMES.castlevania;
  }
  if (upper.includes('BATMAN')) {
    return KNOWN_GAMECOM_GAMES.batman;
  }
  if (upper.includes('CENTIPEDE')) {
    return KNOWN_GAMECOM_GAMES.centipede;
  }
  if (upper.includes('DUKE NUKEM') || upper.includes('DUKE 3D')) {
    return KNOWN_GAMECOM_GAMES.duke3d;
  }
  if (upper.includes('FIGHTERS MEGAMIX') || upper.includes('MEGAMIX')) {
    return KNOWN_GAMECOM_GAMES.megamix;
  }
  if (upper.includes('FROGGER')) {
    return KNOWN_GAMECOM_GAMES.frogger;
  }
  if (upper.includes('HENRY')) {
    return KNOWN_GAMECOM_GAMES.henry;
  }
  if (upper.includes('INDY 500') || upper.includes('INDY500')) {
    return KNOWN_GAMECOM_GAMES.indy500;
  }
  if (upper.includes('JEOPARDY')) {
    return KNOWN_GAMECOM_GAMES.jeopardy;
  }
  if (upper.includes('LIGHTS OUT') || upper.includes('LIGHT OUT')) {
    return KNOWN_GAMECOM_GAMES.lightsout;
  }
  if (upper.includes('LOST WORLD') || upper.includes('JURASSIC PARK')) {
    return KNOWN_GAMECOM_GAMES.lostworld;
  }
  if (upper.includes('MONOPOLY')) {
    return KNOWN_GAMECOM_GAMES.monopoly;
  }
  if (upper.includes('MORTAL KOMBAT')) {
    return KNOWN_GAMECOM_GAMES.mkt;
  }
  if (upper.includes('QUIZ WIZ')) {
    return KNOWN_GAMECOM_GAMES.quizwiz;
  }
  if (upper.includes('RESIDENT EVIL')) {
    return KNOWN_GAMECOM_GAMES.re2;
  }
  if (upper.includes('SCRABBLE')) {
    return KNOWN_GAMECOM_GAMES.scrabble;
  }
  if (upper.includes('SONIC JAM')) {
    return KNOWN_GAMECOM_GAMES.sonicjam;
  }
  if (upper.includes('TIGER CASINO') || upper.includes('CASINO')) {
    return KNOWN_GAMECOM_GAMES.casino;
  }
  if (upper.includes('WEB LINK') || upper.includes('WEBLINK')) {
    return KNOWN_GAMECOM_GAMES.weblink;
  }
  if (upper.includes('INTERNET')) {
    return KNOWN_GAMECOM_GAMES.internet;
  }
  if (upper.includes('WILLIAMS') || upper.includes('ARCADE CLASSICS')) {
    return KNOWN_GAMECOM_GAMES.williams;
  }

  return resolveKnownGameByGameIdOrTitle(0, stem);
}

export function resolveKnownGameByMd5(romMd5: string): KnownGame | null {
  const normalized = romMd5.trim().toLowerCase();
  if (!normalized) return null;
  for (const key in KNOWN_GAMECOM_GAMES) {
    const g = KNOWN_GAMECOM_GAMES[key];
    if (g.romMd5s?.some((h) => h.toLowerCase() === normalized)) {
      return g;
    }
  }
  return null;
}

export function resolveKnownGameByGameIdOrTitle(
  gameId: number,
  rawTitle?: string
): KnownGame | null {
  if (rawTitle) {
    const norm = rawTitle.toUpperCase().replace(/\s+/g, ' ').trim();
    const compact = norm.replace(/\s+/g, '');
    if (/^SONIC\s*3(?:\b|$)/.test(norm) || compact === 'SONIC3') {
      return {
        ...KNOWN_GAMECOM_GAMES.sonicjam,
        id: 'sonic3',
        title: 'Sonic 3',
        headerMatches: ['SONIC 3', 'SONIC3']
      };
    }
    // Williams Arcade Classics ($1A18 Sinistar) shares Game ID $1A18 with Frogger
    if (gameId === 0x1a18 && /^SINISTAR(?:\b|$)/.test(norm)) {
      return {
        ...KNOWN_GAMECOM_GAMES.williams,
        id: 'sinistar',
        title: 'SINISTAR',
        headerMatches: ['SINISTAR']
      };
    }
  }
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
  return loadCartridgeFromBuffer(new Uint8Array(arrayBuffer), file.name);
}

export function loadCartridgeFromBuffer(
  rawBytes: Uint8Array,
  rawFileName: string,
  romUrl?: string
): CartridgeInfo {
  let romBytes = rawBytes;
  let fileName = rawFileName;

  // Check if it's a ZIP archive
  if (fileName.toLowerCase().endsWith('.zip') || (romBytes[0] === 0x50 && romBytes[1] === 0x4b)) {
    try {
      const unzipped = unzipSync(romBytes);
      const entryNames = Object.keys(unzipped).filter(
        (name) => !name.endsWith('/') && !name.startsWith('__MACOSX') && unzipped[name].length > 0
      );
      let targetEntry = entryNames.find((name) => {
        const lower = name.toLowerCase();
        return lower.endsWith('.bin') || lower.endsWith('.tgc') || lower.endsWith('.rom');
      });

      if (!targetEntry && entryNames.length > 0) {
        let maxLen = 0;
        for (const name of entryNames) {
          if (unzipped[name].length > maxLen) {
            maxLen = unzipped[name].length;
            targetEntry = name;
          }
        }
      }

      if (targetEntry && unzipped[targetEntry]) {
        romBytes = unzipped[targetEntry];
        fileName = targetEntry.split(/[\\/]/).pop() || targetEntry;
      } else {
        throw new Error('No valid Game.com ROM file found inside ZIP archive.');
      }
    } catch (err) {
      throw new Error(`Failed to extract ZIP archive: ${(err as Error).message}`);
    }
  }

  const header = parseGameComRomHeader(romBytes);
  const checksum = calculateChecksum(romBytes);
  const romMd5 = calculateMd5Hex(romBytes);
  const cleanFileTitle =
    fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[\(_].*$/, '')
      .trim() || 'Game.Com Cartridge';

  const byFilename = resolveKnownGameFromFilename(fileName);
  const matchedGame =
    resolveKnownGameByMd5(romMd5) ||
    (byFilename?.id === 'castlevaniareborn' ? byFilename : null) ||
    resolveKnownGameByGameIdOrTitle(header.gameId, header.rawHeaderTitle) ||
    byFilename;

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
      romData: romBytes,
      romUrl
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
      romData: romBytes,
      romUrl
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
    romData: romBytes,
    romUrl
  };
}

/**
 * Preloaded Cartridge ROM list (empty by default; users load their own ROM files)
 */
export const PRELOADED_CARTRIDGES: CartridgeInfo[] = [];
