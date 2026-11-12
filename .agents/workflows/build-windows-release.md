---
description: Build and verify the Cub Spiele.Com web bundle, native Windows x64 PE32+ executable (CubSpieleCom.exe), and Win64 portable release ZIP.
---

# Build Cub Spiele.Com Windows x64 Release (`/build-windows-release`)

1. Run the TypeScript compiler check to ensure zero type or syntax errors:
// turbo
```bash
npm run lint
```

2. Build the production Vite bundle and run the Python PE32+ Windows release packager:
// turbo
```bash
npm run release:win
```

3. Verify the generated artifacts in `public/releases/`:
   - `public/releases/CubSpieleCom.exe` (64-bit Windows PE32+ GUI executable)
   - `public/releases/CubSpieleCom-v1.2.0-win64.zip` (Portable Windows x64 archive)
   - `public/releases/releases-manifest.json` (SHA-256 hashes & release metadata)
