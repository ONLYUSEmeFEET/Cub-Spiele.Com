export type LCDPaletteId = 'original' | 'custom';

export interface LCDPalette {
  id: LCDPaletteId;
  name: string;
  description: string;
  colors: [string, string, string, string]; // [shade0 (lightest/off), shade1, shade2, shade3 (darkest/on)]
  rgbColors: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
  bezelTint: string;
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
    name: 'Original 1997 STN Olive',
    description: 'Calibrated 1997 passive-matrix reflective olive-green STN LCD',
    colors: ['#b9c48a', '#84915a', '#4c5931', '#192310'],
    rgbColors: [
      [185, 196, 138],
      [132, 145, 90],
      [76, 89, 49],
      [25, 35, 16]
    ],
    bezelTint: '#a3ae76'
  },
  custom: {
    id: 'custom',
    name: 'Custom 2-Shade Blend',
    description: 'Blends two user-selected shades across all four 2-bpp LCD levels',
    colors: ['#b9c48a', '#84915a', '#4c5931', '#192310'],
    rgbColors: [
      [185, 196, 138],
      [132, 145, 90],
      [76, 89, 49],
      [25, 35, 16]
    ],
    bezelTint: '#84915a'
  }
};

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
