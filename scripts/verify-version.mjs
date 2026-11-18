#!/usr/bin/env node
/**
 * Cub Spiele.Com — Automated Version Consistency Enforcer & Verifier
 * Ensures package.json, package-lock.json, public/sw.js, README.md, GEMINI.md,
 * scripts/build-windows-release.py, and public/releases/releases-manifest.json
 * are 100% synchronized to the single-source-of-truth version in package.json.
 */
import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(import.meta.dirname, '..');
const postBuild = process.argv.includes('--post-build');

const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = String(pkg.version || '').replace(/^v/, '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[version:check] Invalid version in package.json: "${pkg.version}"`);
  process.exit(1);
}

const tag = `v${version}`;
let healedCount = 0;

// 1. Ensure package-lock.json matches package.json
const lockPath = path.join(rootDir, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  let changed = false;
  if (lock.version !== version) {
    lock.version = version;
    changed = true;
  }
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== version) {
    lock.packages[''].version = version;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
    healedCount++;
    console.log(`[version:check] Synced package-lock.json -> ${version}`);
  }
}

// 2. Ensure public/sw.js CACHE_NAME matches package.json
const swPath = path.join(rootDir, 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8');
  const expectedLine = `const CACHE_NAME = 'cub-spiele-com-${tag}';`;
  const updated = sw.replace(/const CACHE_NAME = ['"]cub-spiele-com-v[^'"]+['"];/, expectedLine);
  if (updated !== sw) {
    fs.writeFileSync(swPath, updated, 'utf8');
    healedCount++;
    console.log(`[version:check] Synced public/sw.js CACHE_NAME -> cub-spiele-com-${tag}`);
  }
}

// 3. Ensure README.md and GEMINI.md artifact filenames & header badges match package.json
for (const docName of ['README.md', 'GEMINI.md']) {
  const docPath = path.join(rootDir, docName);
  if (!fs.existsSync(docPath)) continue;
  const orig = fs.readFileSync(docPath, 'utf8');
  let next = orig
    .replace(/CubSpieleCom-v\d+\.\d+\.\d+-win64\.zip/g, `CubSpieleCom-${tag}-win64.zip`)
    .replace(
      /CubSpieleCom-v\d+\.\d+\.\d+-macos-universal\.zip/g,
      `CubSpieleCom-${tag}-macos-universal.zip`
    )
    .replace(/CubSpieleCom-v\d+\.\d+\.\d+-android\.apk/g, `CubSpieleCom-${tag}-android.apk`)
    .replace(/\*\*Cub Spiele\.Com\*\* \(`v\d+\.\d+\.\d+`\)/g, `**Cub Spiele.Com** (\`${tag}\`)`)
    .replace(/## Supported Platforms \(`v\d+\.\d+\.\d+`\)/g, `## Supported Platforms (\`${tag}\`)`);
  if (next !== orig) {
    fs.writeFileSync(docPath, next, 'utf8');
    healedCount++;
    console.log(`[version:check] Synced ${docName} version references -> ${tag}`);
  }
}

// 4. Post-build verification of releases-manifest.json and built artifacts
if (postBuild) {
  const manifestPath = path.join(rootDir, 'public', 'releases', 'releases-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`[version:check] Missing ${manifestPath} after build!`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.latestVersion !== tag) {
    console.error(
      `[version:check] Manifest latestVersion mismatch: expected ${tag}, got ${manifest.latestVersion}`
    );
    process.exit(1);
  }
  const latestRel = manifest.releases?.[0];
  if (!latestRel || latestRel.tag !== tag || !latestRel.isLatest) {
    console.error(
      `[version:check] Manifest first release entry mismatch: expected ${tag} (isLatest=true)`
    );
    process.exit(1);
  }
  for (const asset of latestRel.assets || []) {
    const assetPath = path.join(rootDir, 'public', asset.url.replace(/^\.\//, ''));
    if (!fs.existsSync(assetPath)) {
      console.error(`[version:check] Missing built release asset on disk: ${assetPath}`);
      process.exit(1);
    }
  }
  console.log(`[version:check] Verified post-build manifest & assets for ${tag}.`);
} else if (healedCount === 0) {
  console.log(`[version:check] All project files are consistent at ${tag}.`);
}
