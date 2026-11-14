import pkg from '../package.json';

/**
 * Single Source of Truth for Cub Spiele.Com semantic version & Android versionCode.
 * Driven directly by package.json ("0.0.1", "0.0.2", ..., "0.0.8", etc.).
 */
export const APP_VERSION: string = String(pkg.version || '0.0.8').replace(/^v/, '');
export const APP_VERSION_TAG: string = `v${APP_VERSION}`;

export function getAndroidVersionCode(version: string = APP_VERSION): number {
  const parts = version
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const [major = 0, minor = 0, patch = 0] = parts;
  return major * 10000 + minor * 100 + patch;
}
