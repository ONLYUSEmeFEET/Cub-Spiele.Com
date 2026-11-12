export type LCDPaletteId = 'original' | 'pocket_pro' | 'backlit' | 'amber' | 'grayscale' | 'custom';

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

export interface CustomPalettePreset {
  id: string;
  name: string;
  category: 'sgb' | 'gbc' | 'classic' | 'user';
  shortcutHint?: string;
  colors: [string, string, string, string];
}

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

export const SGB_GBC_PRESETS: CustomPalettePreset[] = [
  {
    id: 'sgb_1a',
    name: 'SGB 1-A (Super Game Boy Default)',
    category: 'sgb',
    shortcutHint: 'SGB Palette 1-A',
    colors: ['#f8e8c8', '#d89048', '#a82820', '#301850']
  },
  {
    id: 'sgb_1e',
    name: 'SGB 1-E (Tropical Coral & Teal)',
    category: 'sgb',
    shortcutHint: 'SGB Palette 1-E',
    colors: ['#f8f0d8', '#f09068', '#408880', '#182030']
  },
  {
    id: 'sgb_2a',
    name: 'SGB 2-A (Ocean Blue & Gold)',
    category: 'sgb',
    shortcutHint: 'SGB Palette 2-A',
    colors: ['#f8f8b8', '#90c8e8', '#3060b0', '#101840']
  },
  {
    id: 'sgb_3a',
    name: 'SGB 3-A (Emerald Forest)',
    category: 'sgb',
    shortcutHint: 'SGB Palette 3-A',
    colors: ['#e0f8d0', '#88c070', '#346856', '#081820']
  },
  {
    id: 'sgb_4e',
    name: 'SGB 4-E (Neon Cyber Violet)',
    category: 'sgb',
    shortcutHint: 'SGB Palette 4-E',
    colors: ['#f8d8f8', '#c878e8', '#682898', '#180828']
  },
  {
    id: 'gbc_up',
    name: 'GBC Brown (Boot: Up)',
    category: 'gbc',
    shortcutHint: 'D-Pad Up',
    colors: ['#ffefff', '#f7b58c', '#84739c', '#181010']
  },
  {
    id: 'gbc_up_a',
    name: 'GBC Crimson Red (Boot: Up + A)',
    category: 'gbc',
    shortcutHint: 'Up + A',
    colors: ['#ffffff', '#ffad63', '#843100', '#000000']
  },
  {
    id: 'gbc_down',
    name: 'GBC Pastel Mix (Boot: Down)',
    category: 'gbc',
    shortcutHint: 'D-Pad Down',
    colors: ['#ffffa5', '#ff9494', '#9494ff', '#000000']
  },
  {
    id: 'gbc_left',
    name: 'GBC Cobalt Blue (Boot: Left)',
    category: 'gbc',
    shortcutHint: 'D-Pad Left',
    colors: ['#ffffff', '#63a5ff', '#0000ff', '#000000']
  },
  {
    id: 'gbc_right',
    name: 'GBC Lime & Wave (Boot: Right)',
    category: 'gbc',
    shortcutHint: 'D-Pad Right',
    colors: ['#ffffff', '#7bff31', '#0063c6', '#000000']
  },
  {
    id: 'gbc_down_b',
    name: 'GBC Solar Gold (Boot: Down + B)',
    category: 'gbc',
    shortcutHint: 'Down + B',
    colors: ['#ffffff', '#ffff00', '#7b4a00', '#000000']
  },
  {
    id: 'gbc_right_b',
    name: 'GBC Inverted Dark (Boot: Right + B)',
    category: 'gbc',
    shortcutHint: 'Right + B',
    colors: ['#000000', '#008484', '#ffde00', '#ffffff']
  },
  {
    id: 'dmg_classic',
    name: 'DMG-01 Original Game Boy (1989)',
    category: 'classic',
    shortcutHint: 'Dot Matrix',
    colors: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f']
  },
  {
    id: 'virtual_boy',
    name: 'Virtual Red LED (1995)',
    category: 'classic',
    shortcutHint: 'Red Matrix',
    colors: ['#ff4d4d', '#b31212', '#590000', '#140000']
  }
];

export const PALETTES: Record<LCDPaletteId, LCDPalette> = {
  original: {
    id: 'original',
    name: 'Original Game.com (1997 STN)',
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
  pocket_pro: {
    id: 'pocket_pro',
    name: 'Pocket Pro (Silver/Grey)',
    description: 'Reflective silver-grey LCD with improved contrast',
    colors: ['#d1d5db', '#9ca3af', '#4b5563', '#111827'],
    rgbColors: [
      [209, 213, 219],
      [156, 163, 175],
      [75, 85, 99],
      [17, 24, 39]
    ],
    bezelTint: '#9ca3af'
  },
  backlit: {
    id: 'backlit',
    name: 'Pocket Pro Backlit (Cyan)',
    description: 'Electroluminescent teal-cyan backlight display',
    colors: ['#a7f3d0', '#34d399', '#059669', '#064e3b'],
    rgbColors: [
      [167, 243, 208],
      [52, 211, 153],
      [5, 150, 105],
      [6, 78, 59]
    ],
    bezelTint: '#34d399'
  },
  amber: {
    id: 'amber',
    name: 'Amber Glow',
    description: 'Warm retro amber phosphor style display',
    colors: ['#fef3c7', '#f59e0b', '#b45309', '#451a03'],
    rgbColors: [
      [254, 243, 199],
      [245, 158, 11],
      [180, 83, 9],
      [69, 26, 3]
    ],
    bezelTint: '#d97706'
  },
  grayscale: {
    id: 'grayscale',
    name: 'High-Contrast B&W',
    description: 'Crisp black & white modern OLED rendering',
    colors: ['#ffffff', '#a3a3a3', '#525252', '#000000'],
    rgbColors: [
      [255, 255, 255],
      [163, 163, 163],
      [82, 82, 82],
      [0, 0, 0]
    ],
    bezelTint: '#a3a3a3'
  },
  custom: {
    id: 'custom',
    name: 'Custom 4-Shade (SGB / GBC)',
    description: 'User-customizable 4-shade Super Game Boy / Game Boy Color style palette',
    colors: ['#f8e8c8', '#d89048', '#a82820', '#301850'],
    rgbColors: [
      [248, 232, 200],
      [216, 144, 72],
      [168, 40, 32],
      [48, 24, 80]
    ],
    bezelTint: '#d89048'
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
  customPaletteColors: [string, string, string, string]; // [Shade 0, Shade 1, Shade 2, Shade 3]
  activeCustomPresetId?: string;
  ghosting: number; // 0.0 to 0.9 (STN LCD response blur)
  pixelGrid: boolean; // render pixel grid lines
  showTouchGrid: boolean; // render 13x10 hardware resistive touch matrix overlay
  touchGridOpacity: number; // 0.0 to 1.0 visibility slider for touch grid
  viewMode: 'screen-only' | 'console'; // mGBA/melonDS screen-only mode vs full handheld shell
  screenScale: number; // 2, 3, or 4 integer scale in screen-only mode
  contrast: number; // 0.5 to 1.5
  volume: number; // 0.0 to 1.0
  muted: boolean;
  speed: number; // 0.5, 1, 2, 4
  showFps: boolean;
  smoothMode: boolean; // 60fps vs authentic ~15-20fps Game.com timing
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
    c: boolean; // Carry
    z: boolean; // Zero
    s: boolean; // Sign / Negative
    v: boolean; // Overflow
    i: boolean; // Interrupt Enable
  };
  cycles: number;
}
