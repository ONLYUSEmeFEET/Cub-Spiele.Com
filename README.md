# Cub Spiele.Com — Cycle-Accurate Tiger GameCom / Game.Com (SM8521) Emulator

**Cub Spiele.Com** (`v0.1.11`) is a cycle-accurate standalone **Tiger GameCom** (**Game.Com**) emulator for the 1997 **Tiger Electronics** handheld console, powered by a Sharp **SM8521** 8/16-bit microcontroller core (4.9152 MHz), hardware DMA blitter, 16KB 2-bpp STN passive-matrix LCD scanline renderer, 8-bit `SGDA ($004E)` DAC + SG0/SG1/SG2 audio engine, dual cartridge bays with hardware `P3` chip-select isolation, **Tiger Web Link** (`gclink`), **Virtual Hayes AT Modem** (`Internet`), and a competitive **Multi-Player High Score Vault, Online Leaderboards & Hardcore Mode Ecosystem**.

## Play Online (Latest Web Version)
- **Web Emulator (GitHub Pages)**: [https://onlyusemefeet.github.io/Cub-Spiele.Com/](https://onlyusemefeet.github.io/Cub-Spiele.Com/) — automatically built and deployed from `main`.

## Supported Platforms (`v0.1.11`)
- **Windows 10 / 11 (x64)**: Self-Contained Single-File 64-bit PE32+ GUI executable (`CubSpieleCom.exe`, embedding the offline emulator bundle and BIOS) and Portable Archive (`CubSpieleCom-v0.1.11-win64.zip`)
- **macOS 11+ (Universal)**: Native macOS Application Bundle (`Cub Spiele.Com.app` inside `CubSpieleCom-v0.1.11-macos-universal.zip`) with Universal Mach-O (`Apple Silicon ARM64` + `Intel x86_64`) support
- **Android 8.0+ & Mobile Touch**: Android Universal Package (`CubSpieleCom-v0.1.11-android.apk`), Capacitor runtime config, and offline-capable Progressive Web App (`manifest.webmanifest` + Service Worker) with multi-touch D-Pad/A/B/C/D and 13×10 resistive touchscreen support

## Key Features
- **Full Retail, Prototype & `.zip` ROM Compatibility**: Supports `.bin`, `.tgc`, `.rom`, and `.zip` cartridge archives across the official Game.Com library (including *Sonic Jam*, *Resident Evil 2*, *Fighters Megamix*, *Duke Nukem 3D*, and *Lights Out*) as well as the unreleased prototype *Castlevania: Symphony of the Night* (`$0448`) with double-buffered VRAM page-flip synchronization and `MMU1..MMU4` cartridge detection.
- **Adaptive Views, Display Menu & Touch Scaling**: Opens in **Screen-Only** view by default on Windows and macOS (`1×`–`8×` integer scaling or `Full`), and **Touch View** by default on Android and mobile devices (with configurable screen scale presets and `Compact` / `Standard` / `Large` button-only border controls). Features compact **View** submenus, a dedicated **Display** menu (**Screen Color Presets**, **Custom Screen Colors**, **LCD Contrast** & **LCD Ghosting** `0%–100%` sliders, **LCD Pixel Grid**), optional **Status Bar** (`Ctrl+B`, hidden by default), Light/Dark toggle, an **About** dialog, and **Advanced Mode** (`Tools -> Advanced Mode`).
- **Competitive Hardcore Mode**: Locks save state loading (`F8`), enforces `>=1.0×` native 4.9152 MHz clock speed, disables CPU debugger stepping, and cryptographically signs every NVRAM score write with your rolling input entropy hash (`FNV-1a` + `MD5` seal).
- **Multi-Player High Score Vault (`$FC60–$FEDF`)**: Create, rename, and switch between player profiles, and import `.json` or `.nvram` high score data from other players so scores from multiple players are saved side-by-side.
- **Champions Leaderboard & Online Leaderboards**: View the best scores for each game, sync with `/api/leaderboards`, and share/verify portable Signed Score Certificates (`CSC1-...`).
- **Authentic STN Hardware Screen Presets**: Includes calibrated display profiles for the 1997 Original Olive Green (`#71-500`), 1999 Pocket Pro Backlit Green (`#71-520`), Silver Grey (`#71-530`), Warm Amber Compact (`#71-510`), Crisp High Contrast, and custom 2-shade color blending.

## Credits
Special thanks to **Tiger Electronics** (creators of the 1997 **Tiger Game.Com** console and peripherals), the **MiSTer FPGA Game.Com core developers** (`MiSTer-devel/GameCom_MiSTer`), **Diskman (Brandon Cobb)** and *Diskman Presents / The end of the game.com* ([diskman.com](https://www.diskman.com/)) for Tiger Game.Com historical preservation, prototype documentation, scans, and archival resources, and the **MAME** / **mGBA** projects. See [credits.txt](./credits.txt) for a complete list of open-source libraries, hardware datasheets, and emulation references utilized by **Cub Spiele.Com**.

## License
**Cub Spiele.Com** is released under the [MIT License](./LICENSE). Copyright © 2026 AJ Ryan (`@ONLYUSEmeFEET`). Third-party open-source attributions and hardware trademark notices are included in [LICENSE](./LICENSE) and [credits.txt](./credits.txt).

## Tags
`emulator` `gamecom` `tiger-game-com` `sm8521` `sharp-sm8521` `hardcore-mode` `online-leaderboards` `high-scores` `handheld-emulator` `retro-gaming` `nvram` `stn-lcd` `typescript` `electron` `windows-x64`
