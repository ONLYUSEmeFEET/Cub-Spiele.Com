# Castlevania: Symphony of the Night Reborn — v0.2

A hardware-compatible restoration patch (`.bps` / `.ips`) for the unreleased 1998 Tiger Game.Com prototype of *Castlevania: Symphony of the Night*. All changes run natively on Sharp SM8521 hardware with no emulator-only hooks.

---

## Highlight: Restored Battery-Backed Saving (`CV REBORN`)

In the original prototype, battery-backed NVRAM saving was incomplete and could fail to reload player state cleanly. **Reborn v0.2** restores full Save Room persistence:

- **Dedicated `CV REBORN` NVRAM Entry (`$B745` / `$B746`)**: Reborn uses its own cartridge header title (`CV REBORN`) and NVRAM Game IDs (`$B745` for the title/completion slot and `$B746` for binary inventory/progress data), keeping saves completely isolated from the original prototype (`$0448` / `$0449`).
- **Full Save Room Persistence**: Visiting a Save Room coffin writes your current zone/room, HP/MP/Hearts, Level, stats, equipment, relics, and completion percentage directly to NVRAM.
- **Pre-Filled Password Reload**: Opening **Password** from the Title Screen automatically detects your `CV REBORN` save and pre-fills all 8 password icons—press **A** to load straight back into your Save Room.
- **Deterministic Passwords & Slot Guard**: Replaced the random password generator with a deterministic state-based generator, added an initialized-slot marker (`0x2A`), and guarded Slot 1 loading against uninitialized `0xFFFF` NVRAM headers.

---

## What's New in v0.2
- **Title & Credit Screens**: Added a shadowed **Reborn** subtitle to the Title Screen and **AJ Ryan** credit to the pre-title trademark screen.
- **32 Dialogue & Intro Crawl Typo Fixes**: Corrected spelling, grammar, capitalization, and punctuation across character dialogue and the intro text crawl.
- **Midair & Falling Horizontal Steering**: Increased horizontal air control (`+4` to `+5` px/step) during vertical jumps, jump apex, and falling (`Act 07–0A`) when Left/Right is held, while neutral drops straight down.
- **Balanced MP Drain**: Adjusted Bat & Mist MP drain to **1 MP every 6th frame**.
- **Authentic Intro Timing**: Reverted the intro crawl skip so the opening crawl and dialogue play with original timing.

---

## Changelog (v0.1 – v0.2)

### Controls, Menus & Presentation
- **Title & Credit Screens**: Shadowed **Reborn** subtitle on the Title Screen and **AJ Ryan** credit on the pre-title trademark screen.
- **Inventory & Map Split**: Pressing **Pause** now opens the **Inventory** menu (`Equip / Spells / Relics / Familiars`), while **D + Pause** opens the **Map**.

### Room Item & Relic Spawning
- **Smart Object Slot Allocator**: Room object loading reclaims collected/despawned (`0xFF`) slots before overwriting active slots, preventing item/heart collection hangs and missing pickups.
- **Relic Priority Across 14 Rooms**: Reordered item tables in 14 rooms (including Long Library's *Soul of Bat* room) so unique items and relics spawn before candles and hearts.

### Transformations (Bat & Mist)
- **Streamlined Controls**: Press **D** to transform into **Bat** (automatically falling back to **Form of Mist** if you only have Mist). Press **Down + D** or double-tap **D** to trigger **Form of Mist**.
- **Balanced MP Drain & Faster Flight**: Bat and Mist MP drain balanced to **1 MP every 6th frame**, Mist base duration extended to **80 frames**, and Bat/Mist movement speeds boosted.

### Movement & Physics
- **Walk Responsiveness**: Removed the 4-frame walk startup freeze and increased walk speed.
- **Jump, Double Jump & Falling Steering**: Improved normal jump arc, vertical/super jump height, midair & falling horizontal steering (`Act 07–0A`) when Left/Right is held, and expanded the midair **Leap Stone** double-jump window.

### Spells
- **Unlocked from Level 1**: All 4 spells are usable in gameplay and listed in **Pause → Spells** from Level 1.
- **Cardinal D-Pad Inputs**: Replaced diagonal-heavy spell motions with reliable cardinal D-pad sequences, widened the input window from 45 to 70 frames, and fixed prefix collisions.

### Bosses & Subweapons
- **Richter Belmont**: Set Richter's HP to **800** (instead of `65,535`) with a proper defeat handler.
- **Dracula Cutscene Guard**: Prevented the Bat Familiar from damaging or defeating Dracula during Shaft's intro cutscene.
- **Stopwatch & Axe**: Fixed the Stopwatch time-stop countdown bug (120-frame duration) and widened the Axe subweapon's forward throwing arc.

### Text & Dialogue Fixes
- Fixed menu and item typos: `Belmont Clan?`, `Elixir`, `Library card`, `Sirloin`, `Diamond mail`, `Goddess shield`, `Tetra Spirit`, and corrected the *Ring of Vlad* description to `INT +10`.
- Fixed 32 spelling, grammar, capitalization, and punctuation typos across the intro crawl and character dialogue (including `to our side`, `It seems so`, `Good luck`, `Of course, but...`, `triumph`, `you're all right`, and `come for the forces of`).

---

## Applying the Patch
- **Automatic in Cub Spiele.Com**: If the *Castlevania: Symphony of the Night* prototype is present in your ROM library, **Castlevania - Symphony of the Night Reborn** appears automatically as the 24th game and auto-patches the prototype when launched.
- **Manual Patching**: Apply `Castlevania - Symphony of the Night Reborn-v0.2.bps` (recommended, CRC32-verified) or `.ips` to your unmodified `Castlevania - Symphony of the Night (Unknown) (Proto).tgc` dump.
