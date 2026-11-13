# Cub Spiele.Com — Cycle-Accurate Sharp SM8521 (Tiger Game.Com) Handheld Emulator (Windows, macOS, Linux, Android & Web)

**Cub Spiele.Com** (`v1.5.0`) is a cycle-accurate standalone handheld emulator for the 1997 **Tiger Electronics Game.Com** console, powered by a Sharp **SM8521** 8/16-bit microcontroller core (4.9152 MHz), hardware DMA blitter, 16KB 2-bpp STN passive-matrix LCD scanline renderer, 8-bit `SGDA ($004E)` DAC + internal speaker band-pass audio engine, dual cartridge bays with hardware `P3` chip-select isolation, and a competitive **Multi-Player High Score, Online Leaderboard & RetroAchievements (`rcheevos`) Hardcore Ecosystem**.

## Supported Platforms (`v1.5.0`)
- **Windows 10 / 11 (x64)**: Standalone 64-bit PE32+ GUI executable (`CubSpieleCom.exe`) and Portable Archive (`CubSpieleCom-v1.5.0-win64.zip`)
- **macOS 11+ (Universal)**: Native macOS Application Bundle (`Cub Spiele.Com.app` inside `CubSpieleCom-v1.5.0-macos-universal.zip`) with Universal Mach-O (`Apple Silicon ARM64` + `Intel x86_64`) support
- **Linux & SteamOS / Steam Deck (x86_64)**: Native 64-bit Linux `ELF64` executable (`CubSpieleCom`), FreeDesktop `.desktop` launcher, and portable bundle (`CubSpieleCom-v1.5.0-linux-x86_64.tar.gz`)
- **Android 8.0+ & Mobile Touch**: Android Universal Package (`CubSpieleCom-v1.5.0-android.apk`), Capacitor runtime config, and offline-capable Progressive Web App (`manifest.webmanifest` + Service Worker) with multi-touch D-Pad/A/B/C/D and 13×10 resistive touchscreen support

## Key Features
- **Full Retail & Prototype Game Compatibility**: Supports the entire official Game.Com library (including *Sonic Jam*, *Resident Evil 2*, *Fighters Megamix*, *Duke Nukem 3D*, and *Lights Out*) as well as the unreleased prototype *Castlevania: Symphony of the Night* (`$0448`) with double-buffered VRAM page-flip synchronization and `MMU1..MMU4` cartridge detection.
- **Streamlined UI with Optional Advanced Mode**: Clean, approachable interface by default (starting in **Softcore Mode** and remembering your preference), with an optional **Advanced Mode** (`View -> Advanced Mode`) unlocking dual-slot manual controls, raw hex NVRAM inspection (`$FC60`), CPU debugger, and developer tools.
- **Competitive Hardcore Mode (RetroAchievements Compatible)**: Locks save state loading (`F8`), enforces `>=1.0×` native 4.9152 MHz clock speed, disables CPU debugger stepping, and cryptographically signs every NVRAM score write with your rolling input entropy hash (`FNV-1a` + `MD5` seal).
- **Multi-Player High Score Vault (`$FC60–$FEDF`)**: Create, rename, and switch between player profiles, and import `.json` or `.nvram` high score data from other players so scores from multiple players are saved side-by-side.
- **Champions Leaderboard & Online Leaderboards**: View the best scores for each game, sync with `/api/leaderboards`, and share/verify portable Signed Score Certificates (`CSC1-...`).
- **RetroAchievements (`rcheevos` / `dorequest.php`) Integration**: Exposes the flat 32KB SM8521 address space (`$0000–$03FF` Internal RAM, `$E000–$FFFF` 8KB NVRAM, `$A000–$DFFF` 16KB VRAM), RFC 1321 MD5 ROM hashing, live Rich Presence, and an `RAIntegration` submission export kit.

## Credits
See [credits.txt](./credits.txt) for a complete list of open-source libraries, hardware datasheets, emulation references, and competitive ecosystems utilized by **Cub Spiele.Com**.

## Tags
`emulator` `gamecom` `tiger-game-com` `sm8521` `sharp-sm8521` `retroachievements` `rcheevos` `hardcore-mode` `online-leaderboards` `high-scores` `handheld-emulator` `retro-gaming` `nvram` `stn-lcd` `typescript` `electron` `windows-x64`
