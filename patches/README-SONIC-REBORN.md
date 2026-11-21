# Sonic Jam Reborn — v0.2

A hardware-compatible enhancement patch (`.bps` / `.ips`) for the 1998 Tiger Game.Com release of *Sonic Jam* (`Sonic Jam (USA).tgc`). All changes run natively on Sharp SM8521 hardware with no emulator-only hooks.

---

## What's New in v0.2
* **Title & Credit Screens**: Added an outlined **REBORN** subtitle to the Title Screen and **AJ RYAN** credit to the pre-title Sega/Tiger trademark screen.
* **Bidirectional Knuckles Glide (Left / Right) with Front-Facing Turn Frame**: Knuckles now glides Left or Right just like the Genesis *Sonic 3 & Knuckles* release—gliding in your held D-pad direction (`REA` bits 2/3) or current facing direction (`REC` bit 2), and displaying a custom `32×23` front-facing Glide Turn transition frame (`0x45375` / `RE7 = 1..6`) when changing direction mid-glide.
* **Glide Jump-Attack Damage & Bounce**: Gliding (`st 21`) now enables the jump-attack flag (`RED` bit 5 at `0x4ECB3`) so Knuckles damages and destroys badniks on impact and bounces upward (`RE4 = 0xE8` via `0x4D326 → 0x41FEA`) just like a jump attack.
* **Idle-Matched Dual-Plane S3&K Glide Sprites**: Re-encoded both Knuckles' `47×24` side-facing Glide sprite (`sy = 0`) and `32×23` front-facing Glide Turn sprite (`sy = 196`) across both player DMA planes (`dmbr = 0x50` and `0x51`) so his light-gray fur (`1`), dark-gray shading (`2`), opaque white gloves/eyes/muzzle (`dmbr 0x51`), and black outline (`3`) match his idle sprite brightness and shading.
* **Ring Collection During Active I-Frames & 3× Longer Scattered Rings**: Removed the knockback/i-frame gate (`0x48323–0x48334`) so scattered and stage rings can always be collected during post-hit invulnerability, and extended lost scattered ring lifetime 3× longer (`59` ticks / `~236` hardware frames vs. original `20` ticks) via scaled trajectory table lookup (`0x49F30`).
* **Night-Sky Edition Cartridge Label**: Retains the original *Sonic Jam* cartridge label artwork (`sonicjam-reborn.jpg`) with a darkened night-blue sky backdrop and gold-bordered `REBORN` badge.

---

## Changelog (v0.1 – v0.2)

### Movement, Controls & Camera
* **A + B Jump & Ability Mapping**: Both **A** and **B** now trigger Jump, Tails' Flight, and Knuckles' Glide (previously `B`/`C`/`D` were ignored).
* **2× Ground Acceleration**: Acceleration runs every 4 frames instead of 8 and adds `+2` speed per tick (`X: 0x64 → 0x9A` vs. original `0x83` over 60 frames).
* **4× Responsive Midair Steering**: Horizontal air control (`REF`) updates every 4 frames instead of every 16 frames.
* **+29 px Forward Camera Lead**: Shifted the horizontal camera deadzone from `83–117 px` (`0x53–0x75`) to `68–88 px` (`0x44–0x58`), giving `112 px` of forward visibility on the 200 px screen.

### Knuckles Glide (with S3&K Sprite)
* **Midair Glide (`st 21`)**: Pressing & holding **A** or **B** while falling enters Glide (`RE4 = 0x02`, forward boost `RE1 = (RE1 & 0x80) | 0x16`), and releasing **A**/**B** cleanly transitions back to Fall (`st 08`).
* **Custom S3&K Glide Sprite**: Extracted and encoded the `47×24` horizontal Gliding Knuckles sprite into dual-plane 2-bpp DMA banks (`dmbr = 0x50` / `0x51`).

### Level, Elevator & Ring Fixes
* **53 Solid-Embedded Rings Relocated**: Audited all 1,739 rings across Stages 0–11 against each stage's solid collision geometry and relocated all 53 embedded rings cleanly outside solid boxes (`0` embedded remaining).
* **Auto-Ascend Elevators Fixed**: Fixed `type = 0x01` elevator/tree-trunk segments (Stages 0, 7, 9, and 11) so they always ascend even while holding a D-pad direction.

### Performance, Visuals, Forgiveness & NVRAM
* **2-bpp Foreground Readability**: Boosted foreground sprite, ring, enemy, and hazard contrast (`DMPL = 0xF8` scoped strictly to `4ADAh`) while keeping backgrounds and HUD at `0xE4`.
* **Ring-Loop CPU Optimization**: Added a coarse `±64 px` bounding-box early-out before the 3-step swept ring check (`~4.4%` total CPU saved over 60 frames).
* **Tamed Harsh SFX**: Muted the grating 7.8 kHz Spin DAC static burst (`#83h`).
* **Extended Post-Hit I-Frames**: Increased post-damage invulnerability from `40` ticks (`~1.5 s`) to `75` ticks (`~3.0 s`).
* **Isolated Reborn NVRAM (`SONIC REB` / `$B73F`)**: Uses header title `SONIC REB` and Game ID `$B73F` (checksum `0x53`) so Reborn high scores stay isolated from original `$0432` *Sonic Jam* saves.

---

## Technical Romhacking Description (Sharp SM8521)

Every change in **Sonic Jam Reborn v0.2** is patched directly into the 2 MB Sharp SM8521 ROM image without emulator-side hacks:

- **Cartridge Header & NVRAM Isolation (`0x40011–0x4001C`, `0x400C0`, `0x402C9`)**: Replaces `Sonic Jam` + Game ID `$0432` (`0x93`) with `SONIC REB` + `$B73F` (`0x53` BIOS ID checksum `((0xB7 + 0x3F) & 0xFF) ^ 0xA5`) and updates the NVRAM slot lookups so Reborn high scores stay isolated from retail saves.
- **Title Screen `REBORN` & Trademark Screen `AJ RYAN` (`0x4899F → 0x49F00`, `0x52097 → 0x53F00`, `0x141000`, `0x142000`)**:
  - Encodes `39×7` `AJ RYAN` (`sy = 64`) and `67×9` outlined `REBORN` (`sy = 128`) transposed 2-bpp bitmaps in `dmbr = 0x50` (`0x140000`).
  - Hooks `0x4899F` (`CALL 7F00h` in Bank `0x24`) and `0x52097` (`CALL 7F00h` in Bank `0x29`) to execute hardware DMA transfers (`DMC = 0x82`, `HALT 0xF1`) onto both VRAM planes (`DMVP = 0x00` and `0x02`).
- **Physics & Camera Tuning (`0x52874`, `0x52883`, `0x52995`, `0x47C4E–0x47CA6`)**:
  - Ground acceleration tick mask changed from `0x07` (every 8 frames) to `0x03` (every 4 frames), with `+2` speed per step (`0x52883` `0x02 → 0x00` skip adjustment).
  - Midair horizontal steering (`REF`) tick mask changed from `0x0F` (every 16 frames) to `0x03` (every 4 frames).
  - Horizontal camera deadzone shifted from `0x53–0x75` (`83–117 px`) to `0x44–0x58` (`68–88 px`), adding `+29 px` of forward lookahead.
- **A + B Button Input Mapping (`0x46000–0x46011`)**: Consolidates the button mask check (`0x30` = `A | B`) in the jump/ability dispatcher so both **A** (`0x10`) and **B** (`0x20`) trigger Jump, Tails' Flight, and Knuckles' Glide.
- **Bidirectional Knuckles Glide (`st 21`), Attack/Bounce & Dual-Plane S3&K Sprites (`0x4610E`, `0x46129`, `0x41F7D`, `0x41FEA`, `0x4D326`, `0x4ECEA`, `0x4FF40`, `0x45370`, `0x45375`, `0x4FF50`, `0x140000`, `0x144000`)**:
  - Hooks the midair fall/glide dispatcher (`0x46129 → 0x41F7D`) for Knuckles (`RE0 == 0x01`/`0x02`) when `A`/`B` is held (`REA & 0x80` via `0x4FF40`), checking D-pad Left (`REA` bit 2), D-pad Right (`REA` bit 3), or current facing (`REC` bit 2) to set facing direction (`REC` bit 2) and horizontal velocity (`RE1 = 0x96` left or `0x16` right).
  - Enables `RED` bit 5 (`0x20` jump-attack flag) in Knuckles' `st 21` descriptor at `0x4ECEA` (`0xB0`) and hooks `0x4D326 → 0x41FEA` so destroying an enemy while midair (`BBS REC,#3`) imparts an upward bounce (`RE2 = 0, RE4 = 0xE8`).
  - When reversing glide direction mid-flight (`REC ^ old_REC` bit 2), sets `@02E3h = 3` (`RE7 = 1..6` animation frames at `0x4FF55..0x4FF72`) to display the `32×23` front-facing Glide Turn transition sprite (`0x45375`, `sy = 196`) before resuming the `47×24` horizontal Glide sprite (`0x45370`, `sy = 0`).
  - Encodes both S3&K Glide sprites across `dmbr = 0x50` (plane 0: light-gray fur `1`, dark-gray shading `2`, black outline `3`) and `dmbr = 0x51` (plane 1: opaque white gloves/eyes/muzzle highlight) to match Knuckles' idle sprite shading identically.
- **Ring Collection During I-Frames, 3× Scattered Ring Duration & Ring-Loop Optimization (`0x48314`, `0x48323–0x48334`, `0x4852F`, `0x49F30`, `0x482B8 → 0x49B16`)**:
  - Extends scattered ring lifetime at `0x48314` from `0x14` (`20` ticks) to `0x3B` (`59` ticks, 3× longer) and hooks `0x48323` and `0x4852F` (`CALL 7F30h` at `0x49F30`) to scale the `63DAh` trajectory lookup by `(R3 // 6) * 2` while removing the hurt/i-frame early-return gate.
  - Replaces the direct call at `0x482B8` with a coarse `±64 px` X/Y bounding-box check (`0x49B16`) before invoking the 3-step swept ring collision routine (`$62BB`).
- **Stage 0–11 Ring Audit & Elevator Fix (`0x4E630`, `0x4847C`, `0x52743`)**:
  - Parses all 12 stage chunk/tile collision tables (`0x4E630` metadata, `0x5C000` tile collision bank) and relocates all 53 rings in Bank `0x2C` (`0x58000`) that overlapped solid boxes.
  - Changes `JMP Z, 6839h` (`0x96`) to unconditional `JMP T, 6839h` (`0x98`) at `0x52743` so `type = 0x01` elevator/tree-trunk segments (`@023Ch == 1`) always ascend even when a D-pad direction is held.
- **2-bpp Foreground Contrast with Player 4-Shade Preservation (`0x4A123 → 0x4BF40`, `0x40B43 → 0x41FB8`, `0x46151`, `0x52EC2`)**:
  - Marks player sprite draws at `0x4A123`/`0x4A126` (`@02E2h = 1` via `0x4BF40`) so `0x41FB8` keeps `DMPL = 0xE4` (4-shade full detail) for player sprites while boosting non-player foreground sprites, rings, and hazards to `DMPL = 0xF8`.
  - NOPs out (`0xFF`) the harsh `#83h` Spin DAC call at `0x46151–0x46155` and extends post-hit invulnerability at `0x52EC2` from `0x28` (`40`) to `0x4B` (`75`) ticks.

---

## Applying the Patch
* **Automatic in Cub Spiele.Com**: If *Sonic Jam* is present in your ROM library, **Sonic Jam Reborn** appears automatically and auto-patches when launched.
* **Manual Patching**: Apply `Sonic Jam Reborn-v0.2.bps` (recommended, CRC32-verified) or `.ips` to your unmodified `Sonic Jam (USA).tgc` dump.
