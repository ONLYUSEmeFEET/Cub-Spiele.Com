# Cub Spiele.Com — Cycle-Accurate Sharp SM8521 (Tiger Game.Com) Handheld Emulator (Windows, macOS, Android & Web)

**Cub Spiele.Com** (`v0.0.9`) is a cycle-accurate standalone handheld emulator for the 1997 **Tiger Electronics Game.Com** console, powered by a Sharp **SM8521** 8/16-bit microcontroller core (4.9152 MHz), hardware DMA blitter, 16KB 2-bpp STN passive-matrix LCD scanline renderer, 8-bit `SGDA ($004E)` DAC + internal speaker band-pass audio engine, dual cartridge bays with hardware `P3` chip-select isolation, and a competitive **Multi-Player High Score Vault, Online Leaderboards & Hardcore Mode Ecosystem**.

## Supported Platforms (`v0.0.9`)
- **Windows 10 / 11 (x64)**: Standalone 64-bit PE32+ GUI executable (`CubSpieleCom.exe`) and Portable Archive (`CubSpieleCom-v0.0.9-win64.zip`)
- **macOS 11+ (Universal)**: Native macOS Application Bundle (`Cub Spiele.Com.app` inside `CubSpieleCom-v0.0.9-macos-universal.zip`) with Universal Mach-O (`Apple Silicon ARM64` + `Intel x86_64`) support
- **Android 8.0+ & Mobile Touch**: Android Universal Package (`CubSpieleCom-v0.0.9-android.apk`), Capacitor runtime config, and offline-capable Progressive Web App (`manifest.webmanifest` + Service Worker) with multi-touch D-Pad/A/B/C/D and 13×10 resistive touchscreen support

## Key Features
- **Full Retail & Prototype Game Compatibility**: Supports the entire official Game.Com library (including *Sonic Jam*, *Resident Evil 2*, *Fighters Megamix*, *Duke Nukem 3D*, and *Lights Out*) as well as the unreleased prototype *Castlevania: Symphony of the Night* (`$0448`) with double-buffered VRAM page-flip synchronization and `MMU1..MMU4` cartridge detection.
- **Streamlined UI with Screen-Only Default, Touch View, Contrast & Light/Dark Mode**: Opens in a clean **Screen-Only** viewport by default (`2×`/`3×`/`4×` integer scaling), with a handheld-mobile-inspired **Touch** view (button-only border controls), direct **LCD Contrast** sliders on both TopBar and Touch View, Light/Dark appearance toggle using authentic Tiger Game.Com colors, Basic access to **Phone Book Manager** and **LCD Ghosting**, and an optional **Advanced Mode** (`View -> Advanced Mode`) unlocking dual-slot manual controls, raw hex NVRAM inspection (`$FC60`), CPU debugger, and developer tools.
- **Competitive Hardcore Mode**: Locks save state loading (`F8`), enforces `>=1.0×` native 4.9152 MHz clock speed, disables CPU debugger stepping, and cryptographically signs every NVRAM score write with your rolling input entropy hash (`FNV-1a` + `MD5` seal).
- **Multi-Player High Score Vault (`$FC60–$FEDF`)**: Create, rename, and switch between player profiles, and import `.json` or `.nvram` high score data from other players so scores from multiple players are saved side-by-side.
- **Champions Leaderboard & Online Leaderboards**: View the best scores for each game, sync with `/api/leaderboards`, and share/verify portable Signed Score Certificates (`CSC1-...`).
- **Authentic STN Hardware Screen Presets**: Includes calibrated display profiles for the 1997 Original Olive Green (`#71-500`), 1999 Pocket Pro Backlit Green (`#71-520`), Silver Grey (`#71-530`), Warm Amber Compact (`#71-510`), Crisp High Contrast, and custom 2-shade color blending.

## Credits
See [credits.txt](./credits.txt) for a complete list of open-source libraries, hardware datasheets, and emulation references utilized by **Cub Spiele.Com**.

## License
**Cub Spiele.Com** is released under the [MIT License](./LICENSE). Copyright © 2026 AJ Ryan (`@ONLYUSEmeFEET`). Third-party open-source attributions and hardware trademark notices are included in [LICENSE](./LICENSE) and [credits.txt](./credits.txt).

## Tags
`emulator` `gamecom` `tiger-game-com` `sm8521` `sharp-sm8521` `hardcore-mode` `online-leaderboards` `high-scores` `handheld-emulator` `retro-gaming` `nvram` `stn-lcd` `typescript` `electron` `windows-x64`
