---
description: Enforce Sharp SM8521 hardware accuracy, NVRAM slot integrity, and mGBA/melonDS standalone desktop UX standards.
globs:
  - "src/**/*"
  - "electron/**/*"
  - "scripts/**/*"
---

# Cub Spiele.Com — SM8521 Hardware & Standalone Emulator Rules

1. **Sharp SM8521 CPU Accuracy (`src/emulator/sm8521.ts`)**:
   - Preserve 16-bit effective addressing (`& 0xFFFF`) for `w(r)` indexed modes (`0x5A`/`0x5B`, `case 0x80`) so `$0100–$03FF` internal RAM accesses do not wrap into `$0000–$00FF` SFRs.
   - Maintain datasheet-accurate `FLAG_V` signed overflow calculation on `ADD`/`ADC`/`ADDW`/`ADCW` and `FLAG_S`/`FLAG_V` updates on `ANDW`/`ORW`/`XORW`.
   - Keep `PS0` (`$001B`) and `PS0_MIRROR` (`$001E`) synchronized on all register writes.

2. **NVRAM High Score & Binary Save Integrity (`src/emulator/nvramHighScores.ts`)**:
   - Always preserve the full 64-byte hardware slot (`rawSlot`) across NVRAM and Vault syncs.
   - Pad uninitialized bytes with `0x00` (never `0xFF`) so *Lights Out* (`Game ID $0917`) binary level progress bytes at `+0x12..+0x17` never corrupt to `255` (`"1?5"`).

3. **Audio & Visual Cleanliness**:
   - Do not add frontend `onclick` / `onpress` UI beeps (`playTouchBeep`, `playButtonPress`, `playCartridgeClick` must remain silent).
   - Do not add touch ripple/pulse animations to `LCDScreen.tsx`.
   - Maintain the continuous `0%–100%` Touch Grid Visibility Slider (`touchGridOpacity`).
