#!/usr/bin/env node
/**
 * Cub Spiele.Com — Single-Source Version Bump Utility
 * Usage:
 *   npm run version:bump              # increments patch: 0.0.8 -> 0.0.9
 *   npm run version:bump -- minor     # increments minor: 0.0.8 -> 0.1.0
 *   npm run version:bump -- 0.0.10    # sets explicit semver
 */
import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(import.meta.dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const current = String(pkg.version || '0.0.1').replace(/^v/, '');
const arg = process.argv[2] || 'patch';

function nextSemver(ver, mode) {
  if (/^\d+\.\d+\.\d+$/.test(mode)) return mode;
  const parts = ver.split('.').map((n) => parseInt(n, 10) || 0);
  let [major = 0, minor = 0, patch = 0] = parts;
  if (mode === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (mode === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

const nextVersion = nextSemver(current, arg);
if (nextVersion === current) {
  console.error(`Error: Next version (${nextVersion}) is identical to current version (${current}).`);
  process.exit(1);
}

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const lockPath = path.join(rootDir, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
}

const swPath = path.join(rootDir, 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8').replace(
    /const CACHE_NAME = ['"]cub-spiele-com-v[^'"]+['"];/,
    `const CACHE_NAME = 'cub-spiele-com-v${nextVersion}';`
  );
  fs.writeFileSync(swPath, sw, 'utf8');
}

for (const docName of ['README.md', 'GEMINI.md']) {
  const docPath = path.join(rootDir, docName);
  if (fs.existsSync(docPath)) {
    const content = fs.readFileSync(docPath, 'utf8').replaceAll(`v${current}`, `v${nextVersion}`);
    fs.writeFileSync(docPath, content, 'utf8');
  }
}

console.log(`Bumped Cub Spiele.Com version: v${current} -> v${nextVersion}`);
console.log(`Run "npm run release:win" to build v${nextVersion} multi-platform release artifacts and manifest.`);
