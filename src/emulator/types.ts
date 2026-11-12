export type LCDPaletteId = 'original' | 'pocket_pro' | 'backlit' | 'amber' | 'grayscale';

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

export const PALETTES: Record<LCDPaletteId, LCDPalette> = {
  original: {
    id: 'original',
    name: 'Original Game.com (1997)',
    description: 'Authentic passive-matrix STN greenish-olive reflective LCD',
    colors: ['#c6cd9b', '#95a06e', '#5b673e', '#212a14'],
    rgbColors: [
      [198, 205, 155],
      [149, 160, 110],
      [91, 103, 62],
      [33, 42, 20]
    ],
    bezelTint: '#9fa876'
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

export interface EmulatorSettings {
  palette: LCDPaletteId;
  ghosting: number; // 0.0 to 0.9 (STN LCD response blur)
  pixelGrid: boolean; // render pixel grid lines
  showTouchGrid: boolean; // render 13x10 hardware resistive touch matrix overlay
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
