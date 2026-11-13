# Cub Spiele.Com — Cycle-Accurate Sharp SM8521 (Tiger Game.Com) Handheld Emulator (Windows x64 & Web)

**Cub Spiele.Com** (`v1.4.0`) is a cycle-accurate standalone handheld emulator for the 1997 **Tiger Electronics Game.Com** console, powered by a Sharp **SM8521** 8/16-bit microcontroller core (4.9152 MHz), hardware DMA blitter, 16KB 2-bpp STN passive-matrix LCD scanline renderer, 8-bit `SGDA ($004E)` DAC + internal speaker band-pass audio engine, dual cartridge bays with hardware `P3` chip-select isolation, and a competitive **Multi-Player High Score, Online Leaderboard & RetroAchievements (`rcheevos`) Hardcore Ecosystem**.

## Key Features
- **Competitive Hardcore Mode (RetroAchievements Compatible)**: Locks save state loading (`F8`), enforces `>=1.0×` native 4.9152 MHz clock speed, disables CPU debugger stepping, and cryptographically signs every NVRAM score write with your rolling input entropy hash (`FNV-1a` + `MD5` seal).
- **Multi-Player High Score Vault (`$FC60–$FEDF`)**: Create, rename, and switch between player profiles, and import `.json` or `.nvram` high score data from other players so scores from multiple players are saved side-by-side.
- **Champions Leaderboard & Online Leaderboards**: View the best scores for each game, sync with `/api/leaderboards`, and share/verify portable Signed Score Certificates (`CSC1-...`).
- **RetroAchievements (`rcheevos` / `dorequest.php`) Integration**: Exposes the flat 32KB SM8521 address space (`$0000–$03FF` Internal RAM, `$E000–$FFFF` 8KB NVRAM, `$A000–$DFFF` 16KB VRAM), RFC 1321 MD5 ROM hashing, live Rich Presence, and an `RAIntegration` submission export kit.

## Tags
`emulator` `gamecom` `tiger-game-com` `sm8521` `sharp-sm8521` `retroachievements` `rcheevos` `hardcore-mode` `online-leaderboards` `high-scores` `handheld-emulator` `retro-gaming` `nvram` `stn-lcd` `typescript` `electron` `windows-x64`
