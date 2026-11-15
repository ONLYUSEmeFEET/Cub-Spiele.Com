# Cub Spiele.Com — Google Antigravity Project Context (`GEMINI.md`)

## Project Overview
**Cub Spiele.Com** is a cycle-accurate standalone handheld emulator for the 1997 **Sharp SM8521** 8/16-bit microcontroller architecture (originally used in the Tiger Game.Com handheld console), designed for both **Native Windows x64 Desktop** (`CubSpieleCom.exe` / Electron) and **Web** execution.

The interface follows standalone handheld emulators such as **mGBA**, offering:
- **Native Desktop Menu Bar** (`File`, `Emulation`, `View`, `Display`, `Settings`, `Tools`, `About`)
- **Platform-Adaptive Views**: **Screen-Only Mode** default on Windows/macOS (`1×`–`8×` / `Full` scaling) & **Touch View** default on Android/mobile (with Touch screen scaling presets and `Compact`/`Standard`/`Large` control sizing) plus **Light / Dark Mode** and hidden-by-default **Status Bar** (`Ctrl+B`)
- **Multi-Format ROM Loading**: Supports `.bin`, `.tgc`, `.rom`, and `.zip` archives with **Recently Played ROMs** tracking and 1-click boot into **Cartridge Slot 1** or **Cartridge Slot 2**
- **Dedicated Display & Overlay Controls**: **Display** menu consolidating **Screen Color Presets**, **Custom Screen Colors**, **LCD Contrast (`0%–100%`)**, **LCD Ghosting (`0%–100%`)**, and **LCD Pixel Grid**; plus **Touch Grid Visibility (`0%–100%`)** under **View -> Overlays**
- **Expanded Battery-Backed NVRAM High Score Vault (`$FC60–$FEDF`)** supporting unlimited 10-slot banks via automatic bank paging

---

## Core Architecture & File Map

| Path | Description |
| :--- | :--- |
| `src/emulator/sm8521.ts` | Cycle-accurate **Sharp SM8521 CPU** (4.9152 MHz), MMU (`$0010–$0013`), DMA Blitter (`$0020–$002D`), 16KB VRAM (`$A000–$DFFF`), 8KB NVRAM (`$E000–$FFFF`), and hardware P3 bit 6 dual cartridge slot isolation. |
| `src/emulator/lcd.ts` | 200×160 2-bpp (4-shade) passive-matrix STN LCD renderer with calibrated reflective olive-green palette (`#b9c48a`) and frame ghosting. |
| `src/emulator/sound.ts` | Hardware audio engine: `SGDA ($004E)` 8-bit DAC streamer (~7,877 Hz sample-rate conversion), `SG0`/`SG1`/`SG2` programmable tone generators, and 28mm internal speaker band-pass filter (`310 Hz – 3,450 Hz`). Default volume: `20%` (`0.2`). |
| `src/emulator/nvramHighScores.ts` | Multi-player battery-backed NVRAM High Score & binary save manager (`$FC60–$FEDF`). Supports player profile creation, renaming, multi-user `.json`/`.nvram` score import, and preserves the full 64-byte hardware slot (`rawSlot`), including *Lights Out* (`Game ID $0917`) binary level progress bytes at offsets `+0x12..+0x17`. |
| `src/emulator/retroAchievements.ts` | Competitive Hardcore Mode, RFC 1321 MD5 ROM hashing, and rolling input entropy attestation engine (optional UI components hidden by default behind `Tools -> Advanced Tools`). |
| `src/emulator/onlineLeaderboard.ts` | Online Competitive Leaderboard manager (`/api/leaderboards` REST sync, `BroadcastChannel` peer sync, best-score-per-game aggregation, and `CSC1-...` Signed Score Certificates). |
| `src/emulator/gamecomSystem.ts` | System coordinator managing fast-boot states, dual cartridge bays (unloaded by default, user-loadable `.bin`/`.tgc`/`.rom`/`.zip`), Hardcore/Softcore Mode enforcement, and Recently Played ROM persistence. |
| `src/components/TopBar.tsx` | Standalone desktop menu bar (`File`, `Emulation`, `View`, `Display`, `Settings`, `Tools`, `About`) and quick toolbar with streamlined Standard Mode and `Tools -> Advanced Mode`. |
| `src/components/ScreenOnlyView.tsx` | Standalone Screen-Only viewport with `1×`–`8×` / `Full` integer/smooth scaling. |
| `src/components/GameComConsole.tsx` | Mobile-inspired **Touch View** (`TouchView` / `GameComConsole`) with configurable screen scaling and `Compact`/`Standard`/`Large` button-only controls styled with Tiger Game.Com accents. |
| `src/components/AboutModal.tsx` | Project overview, credits (including Diskman / `diskman.com`), and MIT License + Hardware Attribution dialog opened from `TopBar`. |
| `electron/main.cjs` & `preload.cjs` | Electron Native desktop main process and IPC preload bridge (`window.gamecomDesktop`). |
| `scripts/build-windows-release.py` | Reads `package.json` version, compiles `CubSpieleCom.exe`, and packages `CubSpieleCom-v0.1.0-win64.zip` + macOS/Android builds. |

---

## Development Commands in Google Antigravity

```bash
# 1. Install dependencies
npm install

# 2. Start local development server on http://localhost:3000
npm run dev

# 3. Typecheck codebase
npm run lint

# 4. Bump incremental 0.0.x version cleanly across package.json, sw.js & docs
npm run version:bump

# 5. Build production web & desktop bundle + CubSpieleCom.exe + Win64 ZIP + manifest
npm run release:win

# 6. Build Electron Windows x64 NSIS Setup & Portable EXE
npm run dist:win
```

---

## Hardware Accuracy Invariants (Do Not Break)
1. **SM8521 Internal RAM Addressing (`w(r)` Indexed Mode `0x5A`/`0x5B`)**:
   Keep 16-bit address masking (`& 0xFFFF`) on `w(r)` indexed modes (`case 0x80` in `sm8521.ts`). The SM8521 has 1KB of internal RAM (`$0000–$03FF`), and the BIOS uses `w = 0xFF` to index into `$0100–$01FE`.
2. **SM8521 ALU Flags**:
   - 8-bit `ADC` and 16-bit `ADDW`/`ADCW` signed overflow (`FLAG_V`) uses `((d2 ^ d1 ^ 0x80) & (res ^ d1)) & 0x80` (and `0x8000` for 16-bit).
   - 16-bit logical instructions (`ANDW`, `ORW`, `XORW`) update `FLAG_S` (`res & 0x8000`) and clear `FLAG_V`.
   - Writes to `PS0` (`$001B`) and its hardware mirror (`$001E`) must stay synchronized.
3. **Lights Out (`$0917`) 64-Byte NVRAM Slot**:
   Never pad unused bytes in `$FC60–$FEDF` slots with `0xFF` or strip bytes after the `$00` title/score terminator. *Lights Out* stores 6 binary puzzle-level progress bytes at slot offsets `+0x12..+0x17` (`$01BC–$01C2`).
4. **Pure Hardware Audio**:
   Do not add synthetic frontend `onclick` or `onpress` UI beeps; only genuine SM8521 hardware audio registers and BIOS audio clips should produce sound.
