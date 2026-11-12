# Tiger Game.Com SM8521 Hardware Emulator (Windows x64 & Web)

Cycle-accurate hardware emulator for the 1997 **Tiger Electronics Game.Com** handheld console, powered by a Sharp **SM8521** 8/16-bit microcontroller core (4.9152 MHz), hardware DMA blitter, 16KB 2-bpp STN passive-matrix LCD scanline renderer, 8-bit `SGDA ($004E)` DAC + internal speaker band-pass audio engine, dual cartridge bays with hardware `P3` chip-select isolation, and an **Expanded Battery-Backed NVRAM High Score Vault (`$FC60–$FEDF`)** supporting unlimited 10-slot banks.

---

## Native Windows Desktop Application (`v1.1.0` Win64)

### 1. Instant Portable Windows x64 Release (`GameCom-SM8521-v1.1.0-win64.zip`)
- **Executable**: `GameCom-Emulator.exe` — Native 64-bit Windows GUI Executable (`PE32+ AMD64`, `IMAGE_SUBSYSTEM_WINDOWS_GUI`) with embedded 32-bit ARGB Tiger Game.Com icon (`RT_GROUP_ICON`).
- **Offline Runtime**: Includes pre-bundled official TOSEC Internal (4KB) & External (256KB) BIOS ROMs, **Lights Out** (Slot 1), and **Sonic Jam** (Slot 2) with full offline `file://` asset support.
- **Persistent NVRAM**: Saves battery-backed NVRAM (`$E000–$FFFF`) and High Score Vault banks locally on Windows (`%LOCALAPPDATA%\TigerGameComEmulator`).

### 2. Electron Native Windows Desktop Shell (`electron/`)
- `electron/main.cjs` & `electron/preload.cjs`: Full native Windows desktop shell with native application menu bar (`File`, `Emulation`, `Tools`, `View`), keyboard accelerators (`Ctrl+O`, `Ctrl+Shift+O`, `F5`, `F8`, `F11`), native OS file dialogs, and Windows Explorer `.tgc` / `.bin` ROM file associations.
- `electron-builder.yml`: Configured to build:
  - **Windows x64 NSIS Installer**: `GameCom-SM8521-Setup-1.1.0-x64.exe`
  - **Windows x64 Portable Executable**: `GameCom-SM8521-Portable-1.1.0-x64.exe`
  - **Windows x64 ZIP Bundle**: `GameCom-SM8521-1.1.0-x64.zip`

```bash
# Build the Portable Win64 Release Bundle & PE32+ GameCom-Emulator.exe
npm run release:win

# Build the Electron Windows x64 NSIS Installer & Portable EXE
npm run dist:win
```

---

## GitHub Releases & Automated CI/CD (`.github/workflows/release.yml`)

The repository includes `.github/workflows/release.yml` to automatically compile and publish Windows x64 releases on `windows-latest` whenever a `v*.*.*` tag is pushed or triggered via `workflow_dispatch`, plus an in-app **GitHub Release Publisher** (`Win64 / Releases` button in the top bar).

### Release History
- **`v1.1.0` (Latest)**:
  - Added Native Windows x64 Desktop Application (`GameCom-Emulator.exe` PE32+ GUI launcher, Electron desktop wrapper, `.tgc`/`.bin` file associations, and automated GitHub Releases workflow).
  - Preloaded **Lights Out** in Slot 1 and **Sonic Jam** in Slot 2.
  - Fixed *Lights Out* `"1?5"` starting level bug by preserving the full 64-byte hardware NVRAM slot payload (`rawSlot`), including the 6 raw binary level progress bytes at `+0x12..+0x17`.
  - Audited and verified Sharp SM8521 CPU ALU instructions against the official datasheet (`ADC` 8-bit and `ADDW`/`ADCW` 16-bit signed overflow `FLAG_V`, 16-bit `ANDW`/`ORW`/`XORW` `FLAG_S`/`FLAG_V` flags, and `PS0` `$001E` hardware mirror).
  - Set initial system volume to `20%` with internal speaker band-pass filtering (`380 Hz – 3.6 kHz`).
- **`v1.0.0`**:
  - Initial cycle-accurate Sharp SM8521 CPU (4.9152 MHz) & 2-bpp STN LCD hardware emulator with Expanded NVRAM High Score Vault (`$FC60–$FEDF`).
