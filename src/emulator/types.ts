export type LCDPaletteId =
  | 'original'
  | 'pocket_pro_el'
  | 'pocket_pro_fstn'
  | 'pocket_warm'
  | 'transflective'
  | 'custom';

export interface LCDPalette {
  id: LCDPaletteId;
  name: string;
  modelYear: string;
  modelCode: string;
  screenType: string;
  description: string;
  colors: [string, string, string, string]; // [shade0 (lightest/off), shade1, shade2, shade3 (darkest/on)]
  rgbColors: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
  bezelTint: string;
  glassBorderColor: string;
  isBacklit?: boolean;
  defaultGhosting: number;
  defaultPersistence: number;
}

export const DEFAULT_LIGHT_SHADE = '#b9c48a';
export const DEFAULT_DARK_SHADE = '#192310';

export function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }
  return [0, 0, 0];
}

export function rgbTupleToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Blends two user-selected hex shades (Light/Background Shade 0 and Dark/Foreground Shade 3)
 * into the 4 hardware 2-bpp shades (0%, 33.3%, 66.7%, 100%).
 */
export function blendTwoShades(
  lightHex: string = DEFAULT_LIGHT_SHADE,
  darkHex: string = DEFAULT_DARK_SHADE
): [string, string, string, string] {
  const [r0, g0, b0] = hexToRgbTuple(lightHex || DEFAULT_LIGHT_SHADE);
  const [r3, g3, b3] = hexToRgbTuple(darkHex || DEFAULT_DARK_SHADE);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const s0 = rgbTupleToHex(r0, g0, b0);
  const s1 = rgbTupleToHex(lerp(r0, r3, 1 / 3), lerp(g0, g3, 1 / 3), lerp(b0, b3, 1 / 3));
  const s2 = rgbTupleToHex(lerp(r0, r3, 2 / 3), lerp(g0, g3, 2 / 3), lerp(b0, b3, 2 / 3));
  const s3 = rgbTupleToHex(r3, g3, b3);

  return [s0, s1, s2, s3];
}

export const PALETTES: Record<LCDPaletteId, LCDPalette> = {
  original: {
    id: 'original',
    name: 'Original Game.Com (1997 STN)',
    modelYear: '1997',
    modelCode: 'Model #71-500 (Dual-Slot Original)',
    screenType: '3.5" Reflective Olive-Green STN + Matte Resistive Touch',
    description:
      'Factory 1997 passive-matrix reflective yellow-olive polarizer with authentic ~180ms liquid-crystal response and column multiplexing.',
    colors: ['#b9c48a', '#84915a', '#4c5931', '#192310'],
    rgbColors: [
      [185, 196, 138],
      [132, 145, 90],
      [76, 89, 49],
      [25, 35, 16]
    ],
    bezelTint: '#adb87f',
    glassBorderColor: 'rgba(25, 35, 16, 0.52)',
    isBacklit: false,
    defaultGhosting: 0.42,
    defaultPersistence: 0.65
  },
  pocket_pro_el: {
    id: 'pocket_pro_el',
    name: 'Game.Com Pocket Pro (EL Backlit)',
    modelYear: 'Early 1999',
    modelCode: 'Model #71-520 (Front/Backlit Edition)',
    screenType: '3.1" Electroluminescent (EL) Cyan-Green Backlit STN',
    description:
      'Early-1999 Pocket Pro with the switchable Indiglo-style electroluminescent cyan-green backlight panel.',
    colors: ['#a6f2d4', '#4ec49b', '#1b7a5c', '#062c20'],
    rgbColors: [
      [166, 242, 212],
      [78, 196, 155],
      [27, 122, 92],
      [6, 44, 32]
    ],
    bezelTint: '#7adbb6',
    glassBorderColor: 'rgba(6, 44, 32, 0.55)',
    isBacklit: true,
    defaultGhosting: 0.34,
    defaultPersistence: 0.56
  },
  pocket_pro_fstn: {
    id: 'pocket_pro_fstn',
    name: 'Game.Com Pocket Pro (Silver FSTN)',
    modelYear: 'Late 1999',
    modelCode: 'Model #71-530 (Translucent Shell Revision)',
    screenType: '3.1" High-Contrast Reflective Silver-Sage FSTN',
    description:
      'Late-1999 colored translucent Pocket Pro revision featuring a neutral silver-grey film-compensated STN polarizer with higher contrast.',
    colors: ['#ced4ca', '#949d90', '#515a4e', '#171d16'],
    rgbColors: [
      [206, 212, 202],
      [148, 157, 144],
      [81, 90, 78],
      [23, 29, 22]
    ],
    bezelTint: '#bec6ba',
    glassBorderColor: 'rgba(23, 29, 22, 0.48)',
    isBacklit: false,
    defaultGhosting: 0.28,
    defaultPersistence: 0.50
  },
  pocket_warm: {
    id: 'pocket_warm',
    name: 'Game.Com Pocket (Warm Reflective)',
    modelYear: '1998–1999',
    modelCode: 'Model #71-510 (Compact Non-Backlit)',
    screenType: '3.1" Warm Amber-Olive Reflective STN',
    description:
      'Compact reflective STN panel under warm indoor incandescent lighting with deep bronze-olive contrast.',
    colors: ['#d8cc98', '#9e915c', '#5d532b', '#211c0a'],
    rgbColors: [
      [216, 204, 152],
      [158, 145, 92],
      [93, 83, 43],
      [33, 28, 10]
    ],
    bezelTint: '#c8bc88',
    glassBorderColor: 'rgba(33, 28, 10, 0.50)',
    isBacklit: false,
    defaultGhosting: 0.38,
    defaultPersistence: 0.60
  },
  transflective: {
    id: 'transflective',
    name: 'Modern Transflective FSTN (Crisp)',
    modelYear: 'Aftermarket Mod',
    modelCode: '200×160 Paper-White Transflective Panel',
    screenType: 'Fast-Response Paper-White Monochrome LCD',
    description:
      'High-clarity paper-white and charcoal display profile for maximum legibility and minimal motion blur.',
    colors: ['#e8ece6', '#a0a89e', '#525950', '#101410'],
    rgbColors: [
      [232, 236, 230],
      [160, 168, 158],
      [82, 89, 80],
      [16, 20, 16]
    ],
    bezelTint: '#d8ded6',
    glassBorderColor: 'rgba(16, 20, 16, 0.45)',
    isBacklit: false,
    defaultGhosting: 0.15,
    defaultPersistence: 0.30
  },
  custom: {
    id: 'custom',
    name: 'Custom 2-Shade Blend',
    modelYear: 'Custom',
    modelCode: 'User 2-Shade Interpolator',
    screenType: 'Custom 2-bpp Linear Shade Blend',
    description: 'Blends two user-selected shades across all four 2-bpp LCD levels.',
    colors: ['#b9c48a', '#84915a', '#4c5931', '#192310'],
    rgbColors: [
      [185, 196, 138],
      [132, 145, 90],
      [76, 89, 49],
      [25, 35, 16]
    ],
    bezelTint: '#84915a',
    glassBorderColor: 'rgba(0, 0, 0, 0.45)',
    isBacklit: false,
    defaultGhosting: 0.40,
    defaultPersistence: 0.65
  }
};

export const GAMECOM_SCREEN_PRESET_ORDER: Exclude<LCDPaletteId, 'custom'>[] = [
  'original',
  'pocket_pro_el',
  'pocket_pro_fstn',
  'pocket_warm',
  'transflective'
];

export interface GameComButtons {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
  menu: boolean;
  pause: boolean;
  sound: boolean;
  power: boolean;
  reset: boolean;
}

export interface TouchPoint {
  x: number; // 0 to 199
  y: number; // 0 to 159
  isDown: boolean;
}

export interface CartridgeInfo {
  id: string;
  title: string;
  headerTitle?: string;
  headerGameId?: number;
  publisher: string;
  year: number;
  genre: string;
  description: string;
  sizeBytes: number;
  isBuiltin: boolean;
  coverColor: string;
  coverAccent: string;
  romData?: Uint8Array;
  romUrl?: string;
}

export interface RecentGameEntry {
  id: string;
  title: string;
  publisher: string;
  year: number;
  slot: 1 | 2;
  lastPlayedAt: number;
  playCount: number;
  sizeBytes: number;
  isPreloaded?: boolean;
}

export interface EmulatorSettings {
  palette: LCDPaletteId;
  /** Two user-selected hex shades [Light/Background Shade 0, Dark/Foreground Shade 3] */
  twoShadeColors: [string, string];
  /** Computed 4-shade interpolation [Shade 0, Shade 1, Shade 2, Shade 3] */
  customPaletteColors: [string, string, string, string];
  /** STN LCD ghosting intensity (0.0 to 0.90) */
  ghosting: number;
  /** STN LCD ghosting persistence / decay time constant (0.0 to 0.95) */
  ghostingPersistence: number;
  pixelGrid: boolean;
  showTouchGrid: boolean;
  touchGridOpacity: number;
  viewMode: 'screen-only' | 'console';
  screenScale: number;
  contrast: number;
  volume: number;
  muted: boolean;
  speed: number;
  showFps: boolean;
  smoothMode: boolean;
  stylusCursor: boolean;
}

export interface CPURegisters {
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  pc: number;
  sp: number;
  flags: {
    c: boolean;
    z: boolean;
    s: boolean;
    v: boolean;
    i: boolean;
  };
  cycles: number;
}
