import type { LCDPaletteId } from './types';

export interface RecompLaunchContext {
  isRecompLauncher: boolean;
  version: string | null;
  mode: 'desktop' | 'bigpicture';
  pad: 'xbox' | 'playstation' | null;
  fullscreen: boolean | null;
  viewMode: 'screen-only' | 'touch' | null;
  screenScale: number | 'full' | null;
  palette: Exclude<LCDPaletteId, 'custom'> | null;
  pixelGrid: boolean | null;
  vsync: boolean | null;
  volume: number | null;
  hardcore: boolean | null;
  fastBoot: boolean | null;
  romUrl: string | null;
  rom2Url: string | null;
}

const VALID_PALETTES = new Set<string>([
  'original',
  'pocket_pro_el',
  'pocket_pro_fstn',
  'pocket_warm',
  'transflective'
]);

function parseBoolParam(val: string | null | undefined): boolean | null {
  if (val == null) return null;
  const v = val.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return null;
}

export function parseRecompLaunchContext(desktopInfo?: {
  recompLauncher?: {
    active?: boolean;
    version?: string | null;
    mode?: string | null;
    pad?: string | null;
  };
  launchOptions?: {
    fullscreen?: boolean | null;
    viewMode?: string | null;
    scale?: string | null;
    palette?: string | null;
    pixelGrid?: boolean | null;
    vsync?: boolean | null;
    volume?: number | null;
    hardcore?: boolean | null;
    fastBoot?: boolean | null;
  };
}): RecompLaunchContext {
  const params = new URLSearchParams(window.location.search);

  const recompEnvActive = desktopInfo?.recompLauncher?.active === true;
  const recompParam = parseBoolParam(params.get('recomp'));
  const isRecompLauncher = recompEnvActive || recompParam === true;

  const rawMode = (
    desktopInfo?.recompLauncher?.mode ||
    params.get('recomp_mode') ||
    'desktop'
  )
    .trim()
    .toLowerCase();
  const mode: 'desktop' | 'bigpicture' =
    rawMode === 'bigpicture' ? 'bigpicture' : 'desktop';

  const rawPad = (
    desktopInfo?.recompLauncher?.pad ||
    params.get('recomp_pad') ||
    ''
  )
    .trim()
    .toLowerCase();
  const pad: 'xbox' | 'playstation' | null =
    rawPad === 'xbox' || rawPad === 'playstation' ? rawPad : null;

  const version =
    desktopInfo?.recompLauncher?.version || params.get('recomp_version') || null;

  const fsParam = parseBoolParam(params.get('fullscreen'));
  const fullscreen =
    desktopInfo?.launchOptions?.fullscreen !== undefined &&
    desktopInfo?.launchOptions?.fullscreen !== null
      ? desktopInfo.launchOptions.fullscreen
      : fsParam !== null
        ? fsParam
        : mode === 'bigpicture' && isRecompLauncher
          ? true
          : null;

  const rawView = (
    desktopInfo?.launchOptions?.viewMode ||
    params.get('view') ||
    ''
  )
    .trim()
    .toLowerCase();
  const viewMode: 'screen-only' | 'touch' | null =
    rawView === 'screen-only'
      ? 'screen-only'
      : rawView === 'touch' || rawView === 'touch-view'
        ? 'touch'
        : mode === 'bigpicture' && isRecompLauncher
          ? 'screen-only'
          : null;

  const rawScale = (
    desktopInfo?.launchOptions?.scale ||
    params.get('scale') ||
    ''
  )
    .trim()
    .toLowerCase();
  let screenScale: number | 'full' | null = null;
  if (rawScale === 'full') {
    screenScale = 'full';
  } else if (rawScale) {
    const n = parseInt(rawScale.replace(/x$/i, ''), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 8) {
      screenScale = n;
    }
  }

  const rawPalette = (
    desktopInfo?.launchOptions?.palette ||
    params.get('palette') ||
    ''
  )
    .trim()
    .toLowerCase();
  const palette = VALID_PALETTES.has(rawPalette)
    ? (rawPalette as Exclude<LCDPaletteId, 'custom'>)
    : null;

  const pixelGrid =
    desktopInfo?.launchOptions?.pixelGrid !== undefined &&
    desktopInfo?.launchOptions?.pixelGrid !== null
      ? desktopInfo.launchOptions.pixelGrid
      : parseBoolParam(params.get('pixel_grid'));

  const vsync =
    desktopInfo?.launchOptions?.vsync !== undefined &&
    desktopInfo?.launchOptions?.vsync !== null
      ? desktopInfo.launchOptions.vsync
      : parseBoolParam(params.get('vsync'));

  let volume: number | null =
    typeof desktopInfo?.launchOptions?.volume === 'number'
      ? desktopInfo.launchOptions.volume
      : null;
  if (volume === null && params.has('volume')) {
    const parsedVol = Number(params.get('volume'));
    if (!Number.isNaN(parsedVol)) {
      volume = Math.max(0, Math.min(100, parsedVol));
    }
  }

  const hardcore =
    desktopInfo?.launchOptions?.hardcore !== undefined &&
    desktopInfo?.launchOptions?.hardcore !== null
      ? desktopInfo.launchOptions.hardcore
      : parseBoolParam(params.get('hardcore'));

  const fastBoot =
    desktopInfo?.launchOptions?.fastBoot !== undefined &&
    desktopInfo?.launchOptions?.fastBoot !== null
      ? desktopInfo.launchOptions.fastBoot
      : parseBoolParam(params.get('fast_boot'));

  const romUrl = params.get('rom') || null;
  const rom2Url = params.get('rom2') || null;

  return {
    isRecompLauncher,
    version,
    mode,
    pad,
    fullscreen,
    viewMode,
    screenScale,
    palette,
    pixelGrid,
    vsync,
    volume,
    hardcore,
    fastBoot,
    romUrl,
    rom2Url
  };
}
