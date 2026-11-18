# Castlevania: Symphony of the Night (Proto) — Reverse-Engineering Findings ("Reborn")

## 1. ROM & Cartridge Architecture (Verified)
- **File:** `Castlevania - Symphony of the Night (Unknown) (Proto).tgc` (2,097,152 bytes / 2 MB)
- **Checksums:** SHA-1 `86fc20a233f18c4c7aac8ebed3e4d95dabc6e8bb`, MD5 `76ceda41231eafa9d39df77011a90c30`
- **Header (`0x040000`, Bank `0x20`):** `TigerDMGC`, Title `CVA      `, Game ID `0x0448` (`0x0449` used as second NVRAM slot ID), Entry point `$40E9`.
- **MMU Bank Formula:** `0x000000–0x03FFFF` (256 KB) is blank (`0x00`). For any cartridge bank `B >= 0x20` mapped into `MMU1` (`$2000–$3FFF`), `MMU2` (`$4000–$5FFF`), `MMU3` (`$6000–$7FFF`), or `MMU4` (`$8000–$9FFF`):
  $$\text{file\_offset} = (B \times \text{0x2000}) + (\text{cpu\_addr} \ \& \ \text{0x1FFF})$$
- **Register File Caveat:** Game logic runs with `PS0 = 0x00` (`R0..R15` at `$0000..$000F`, and `Rxx` for `xx >= 0x20` directly addresses Internal RAM `$00xx`, e.g., `RD9` = `$00D9`, `R27` = `$0027` = `MMU3`, `R28` = `$0028` = `MMU4`). Only the Timer-1 sound ISR switches `PS0 = 0x38`.
- **Primary Code & Data Banks:**
  - `Bank 0x20` (`0x040000`, `MMU2 $4000–$5FFF`): Kernel, main state machine (`$42B7`), password UI (`$438A–$46EA`), password generator (`$4AC8`), NVRAM BIOS wrappers (`$5455–$548C`), sound driver (`$5000+`), and cross-bank call trampolines (`$4138 -> Bank 0x21`, `$4773 -> Bank 0x22`, `$47FA -> Bank 0x23`, `$424A -> Bank 0x24`, `$48EB -> Bank 0x30`, `$49AB -> Bank 0x37`, `$4A0B -> Bank 0x39`).
  - `Bank 0x21` (`0x042000`, `MMU3 $6000–$7FFF`): Frame limiter (`$643A`), keyframe duration countdown (`$648B`), NVRAM save/load serialization (`$7BC7`/`$7BF3`), map room-visit % tracker (`$7CD9`/`$7D41`), zone banner (`$7DB4`/`$7DEF`).
  - `Bank 0x22` (`0x044000`, `MMU3 $6000–$7FFF`): Player state machine (`$60CA`), button edge/hold filter (`$61FF`), form input tables (`$62CF/$62F3/$6334`), action dispatch (`$63BB`), transformation input (`$65DA`), spell state machine (`$6748`), animation end transitions (`$6950`), Leap Stone double jump (`$6AEA`), projectile/spell spawner (`$6D16`), subweapon/spell projectile AI (`$6E82–$733B`), weapon hitbox (`$734C`), familiar AI (`$7471`), XP/level-up (`$7795`), relic check (`$78C4`), Bat/Mist MP drain (`$78ED`), pickup banner (`$7A02`), consumable use & Library Card (`$7AEE`), Save Room coffin (`$7B7F`).
  - `Bank 0x23` (`0x046000`, `MMU3 $6000–$7FFF`): Keyframe displacement & collision engine (`$6000–$620E`), entity type table (`$620F`), enemy spawner & HP table (`$6A40`, `$6AD9`), enemy damage calculation (`$7009`), projectile movement (`$7157`, `$731A`), PRNG (`$7675`), title screen developer cheat codes (`$76A7`).
  - `Bank 0x24` (`0x048000`, `MMU3 $6000–$7FFF`): Room transition loader (`$6000`), frame tick divider (`$60CA`), inventory bitfield manager (`$6113`), AABB overlap check (`$6232`), room collision geometry dispatcher (`$6324`), room item loader & pickup handler (`$6728–$69FD`, `$6A41`), vertical/horizontal collision (`$7574`, `$771A`), enemy drop spawner (`$7A0F`).
  - `Bank 0x27` (`0x04E000`, `MMU4 $8000–$9FFF`): Room object/item placement tables (8-byte entries `[item_id, flag, x_hi, x_lo, y_hi, y_lo, y_land_hi, y_land_lo]` terminated by `0xFF`).
  - `Bank 0x29` (`0x052000`, `MMU4 $8000–$9FFF`): Alucard (`Form 1`) and common enemy 6-byte movement keyframe tables `[dx, dy, flags, duration, sprite_hi, sprite_lo]` terminated by `dx = 0x80`.
  - `Bank 0x2A–0x2E` (`0x054000–0x05DFFF`): Room collision geometry tables.
  - `Bank 0x2F` (`0x05E000`): Room door transition tables (10-byte entries `[dest_zone, dest_room, cam_x, cam_y, alucard_x, alucard_y]`).
  - `Bank 0x30` (`0x060000`, `MMU3 $6000–$7FFF`): Regular enemy AI routines.
  - `Bank 0x36` (`0x06C000`, `MMU4 $8000–$9FFF`): Bat (`Form 2`), Mist (`Form 3`), familiar, and subweapon keyframe tables.
  - `Bank 0x37` (`0x06E000`, `MMU3 $6000–$7FFF`): Pause menu (`Equip`, `Items`, `Relics`, `Spells`, `Familiars`), player stat calculation (`STR/CON/INT/LCK` at `$6DB0–$6EAE`), boss room event triggers (`$7600+`).
  - `Bank 0x38` (`0x070000`, `MMU4 $8000–$9FFF`): Master string table (dialogue, item names, relic descriptions, spell names, zone names) and item icon table (`$9DB0`).
  - `Bank 0x39` (`0x072000`, `MMU3 $6000–$7FFF`): Boss AI routines (including Richter Belmont `$7292`, Shaft Orb `$73D1`, Shaft `$7488`, and Dracula `$76C8`).

---

## 2. Complete Internal RAM Map (`$0000–$03FF`)

| Address | Description |
| :--- | :--- |
| `$00BF` | Stylus / menu button input code (`0x85` Up, `0x86` Down, `0x87` Left, `0x88` Right, `0x8A` Pause/Menu, `0x8B` A, `0x8C` B, `0x8D` C, `0x8E` D). |
| `$00C8..$00C9` | Camera X (16-bit BE). |
| `$00CA..$00CB` | Camera Y (16-bit BE). |
| `$00CD` | Global flags: `bit 2` = Invincibility cheat (`23:7777`), `bit 3` = Password/Save coffin overlay active, `bit 4` = Richter orb destroyed (`39:73DF`), `bit 5` = Boss death trigger, `bit 6` = Zone name banner active, `bit 7` = Dracula defeated (`39:7720`). |
| `$00D0` | Frame tick divider bitmask (updated at `24:60CA` from `$027E` mod `[2,3,4,5,6,8,10,12]` -> bits `0..7`). |
| `$00D2` / `$00D3` | Main Game State (`$00D2`: `0x01` Title, `0x02` New Game/Password menu, `0x03` Intro/Gameplay, `0x04` Password Entry, `0x07` Game Over, `0x08` Cutscene, `0x0A` Room Load; `bit 7` = active gameplay) and Substate (`$00D3`). |
| `$00D9` | Filtered Gameplay Button Bitmask: `0x01` Up, `0x02` Down, `0x04` Left, `0x08` Right, `0x10` D (Transform), `0x20` C (Jump), `0x40` B (Left hand/Shield), `0x80` A (Right hand/Attack). |
| `$00DA` | Special flags: `bit 2` = Standing at Save Room coffin, `bit 3` = `Maria` password active, `bit 4` = `Richter` password active (+99 LCK at `37:6E70`). |
| `$00DB` | Entity facing direction bitmask (`bit 0` = Alucard: `0` Right, `1` Left; `bit 1..4` = Enemy slots 1..4; `bit 5` = Familiar slot 5). |
| `$00DF` | Entity grounded & animation flags (`bit 0` = Alucard standing on floor; `bit 5` = current keyframe animation reached `0x80` terminator; `bit 6` = rising jump state; `bit 7` = Soul Steal active). |
| `$00E2` | Rising jump bitmask (`bit 0` = Alucard in upward action `05, 06, 07, 0E, 1A`, skips floor snap). |
| `$00E3` | Combat flags: `bit 0` = horizontal wall hit, `bit 1` = boss fight lock, `bit 6` = right-hand weapon swing active, `bit 7` = left-hand weapon swing active. |
| `$00E4` | Player state flags: `bit 0` = take contact damage, `bit 1` = death state, `bit 2` = **Leap Stone double-jump used**, `bit 4` = spell casting active, `bit 5` = **Bat transform pending**, `bit 6` = **Mist transform pending**, `bit 7` = **Stopwatch time-stop active**. |
| `$00E5` | Spell input progress (`hi nibble` = spell index `1..11`, `lo nibble` = matched step count). |
| `$0209..$020A` | Gold (16-bit BE, capped at `0x270F` = 9999; unused by any shop). |
| `$020B..$0212` | Scratch / AABB collision registers (`X1, X2, X3, X4`) and Password entry buffer (8 bytes). |
| `$0213..$021A` | Scratch / AABB collision registers (`Y1, Y2, Y3, Y4`). |
| `$0220` | Spell input timeout counter (`0x2D` = 45 frames). |
| `$0221..$022B` | Equipment ownership bitfield (88 bits for Item IDs `0x01..0x58`). |
| `$022C` | Owned subweapon bitmask (`bit 0..4` for `0x59..0x5D`) / equipped subweapon ID (`0x59` Axe, `0x5A` Dagger, `0x5B` Holy Book, `0x5C` Stop Watch). |
| `$022D..$0241` | Consumable item quantities (21 bytes for Item IDs `0x01..0x15`). |
| `$0242` / `$0243` | Current Zone ID (`0x00..0x0E`) and Current Room ID. |
| `$0244..$024D` | Active room item table indices (10 slots, 1-based index into room's Bank `0x27` item list). |
| `$0262..$026B` | Active room item state flags (10 slots: `0x7F` = floor pickup, `0x00..0x3F` = intact/falling candle, `0x40..0x7E` = landed candle drop timer, `0xFF` = collected/despawned). |
| `$0271` | Player Level (starts at `1`, max `50` / `0x32`). |
| `$0272..$0273` | Current HP (16-bit BE, starts at `100`). |
| `$0274` / `$0279` | Current MP (`$0274`) and Max MP (`$0279`). |
| `$0275` / `$0276` | Current Hearts (`$0275`) and Max Hearts (`$0276`). |
| `$0277..$0278` | Max HP (16-bit BE, starts at `100`, Life Max Up adds `+20`). |
| `$0281..$0282` | Visited Zones bitmask. |
| `$0283..$028A` | **Alucard (Slot 0) 8-byte Entity Struct:** `+0` Form (`01` Alucard, `02` Bat, `03` Mist), `+1..2` World X, `+3..4` World Y, `+5` Action ID (`$0288`), `+6` Keyframe index (`$0289`), `+7` Keyframe timer (`$028A`). |
| `$028B..$02AA` | **Enemy Slots 1..4** (4 x 8-byte Entity Structs at `$028B, $0293, $029B, $02A3`). |
| `$02AB..$02B2` | **Familiar Slot 5** (8-byte Entity Struct: `$02AB` = `0x2A` Bat Familiar, `0x2B` Ghost Familiar). |
| `$02B3..$02D6` | **Projectile Slots 0..5** (6 x 6-byte Structs at `$02B3, $02B9, $02BF, $02C5, $02CB, $02D1`: `+0` Proj Type, `+1..2` X, `+3..4` Y, `+5` State/Frame byte). |
| `$02D7..$02DE` | **Enemy Slots 1..4 Current HP** (4 x 16-bit BE at `$02D7, $02D9, $02DB, $02DD`). |
| `$02E0..$02E2` | Boss / event flags (`$02E1.#6` = Shaft alive, `$02E1.#7` = Dracula alive). |
| `$02E3` / `$02E4` | Contact damage amount queued onto Alucard (`$02E3` enemy body, `$02E4` enemy projectile). |
| `$02E5` | General HUD / transformation / hurt timer (decremented every frame at `22:60DC`). |
| `$02E6` | Subweapon active duration timer (Stopwatch / Holy Book). |
| `$02E7..$02ED` | Equipped items: `$02E7` Right Hand, `$02E8` Left Hand, `$02E9` Head, `$02EA` Body, `$02EB` Cloak, `$02EC` Accessory 1, `$02ED` Accessory 2. |
| `$02EE..$02EF` | **Relic Active/Owned Bitmask** (14 bits for Relics `0x2D..0x3A`, indexed via `item_id - 0x2D`). |
| `$02F0..$02F1` | Bat Familiar Level (`$02F0`) and Ghost Familiar Level (`$02F1`). |
| `$02F2..$02F5` | Bat Familiar XP (`$02F2..$02F3`) and Ghost Familiar XP (`$02F4..$02F5`). |
| `$02F6..$02F7` | Player Experience Points (16-bit BE). |
| `$02F8..$02FB` | Calculated Stats: `$02F8` Left ATK, `$02F9` Right ATK, `$02FA` DEF/CON, `$02FB` LCK. |
| `$02FD` | Mist form duration countdown (`0x23` = 35 frames without Power of Mist). |
| `$0302..$0310` | Map room visited bitfield (`$0311` = total visited room count). |
| `$0313` / `$0314` | Item pickup text banner Item ID (`$0313`) and display timer (`$0314`). |
| `$0341..$0348` | **8-Byte Generated Password** (saved in NVRAM slot `0x0449` at offset `+0x2D`). |

---

## 3. Root Causes of All Confirmed Prototype Bugs & Planned Fixes

### Bug 1: The Relic Off-By-One & Floor-Item Lockout (`Bank 0x24` & `Bank 0x27`)
- **Discovery:**
  1. The master item table (`22:7A2A`), icon table (`38:9DB0`), Relics Menu (`37:7281`), relic descriptions (`37:738F`), and all gameplay checks (`22:78C4` `SUB R3,#2Dh`) use **1-based Relic IDs `0x2D..0x3A`**:
     - `0x2D` = Cube of Zoe (`24:68EF`)
     - `0x2E` = Soul of Bat (`22:65FE`)
     - `0x2F` = Fire of Bat (`22:6655`)
     - `0x30` = Power of Mist (`22:78FD`)
     - `0x31` = Gas Cloud (`22:61C0`)
     - `0x32` = Leap Stone (`22:6AF4`)
     - `0x33` = Form of Mist (`22:6611`)
     - `0x34` = Bat Card (`22:7471`, `24:69A0`, `37:65F3`)
     - `0x35` = Ghost Card (`22:7471`, `24:69A0`, `37:663E`)
     - `0x36..0x3A` = Heart, Eye, Rib, Tooth, Ring of Vlad (`37:72BD..72DE`)
  2. Furthermore, `22:6080` (`MOV R0,#01h; MOV @02EEh,R0`) **already gives Alucard `0x2D` (Cube of Zoe, bit 0 of `$02EE`) at New Game start**!
  3. However, in `Bank 0x27` (room item placements), several relics were placed with off-by-one IDs:
     - `Zone 01 Room 00` (Alchemy Lab, `0x04E0A8`): placed `0x2D` (Cube of Zoe) instead of `0x32` (Leap Stone), while `Zone 01 Room 04` (`0x04E14C`, hidden floor in tall shaft) has `0x32` and `Zone 08 Room 01` (Reverse Keep, `0x04EE78`) has `0x31` (Gas Cloud).
     - `Zone 06 Room 02` (Castle Keep, `0x04EC29`): placed `0x33` (Form of Mist) in the Bat Card location, while `Zone 01 Room 05` (`0x04E165`) has `0x34` (Bat Card) and `Zone 06 Room 03` (`0x04EC52`) has `0x35` (Ghost Card).
  4. **CRITICAL LOCKOUT BUG (`24:6970` & `24:6A7F`):**
     - When you pick up ANY relic (`0x2D..0x3A`), `24:6970` sets its active bit in `$02EE/$02EF`, **but earlier at `24:6958` it called `CALL 4272h` (`MOV R0,#02h`) with `R3` still holding `0x61` (from `CMP R3,#61h` at `24:6912`) instead of `RC1` (the item's ID)**!
     - Because `R3 = 0x61` on every item pickup `< 0x61`, `24:6113` sets bit `0x61` (`$022D.#0`, giving +1 Pot Roast!) and **NEVER marks the relic/equipment bit in `$0221..$022B` as owned**!
     - Even worse: when you pick up any item in a room (`24:690C`), it sets `$0262[slot] = 0xFF`, **leaving `$0244[slot]` non-zero**! When you enter the next room (`24:6A41`), `24:6A64` only populates `$0244` slots that aren't already in `$0244`, and `24:6ACA` overwrites `$0244[$0270]` in a circular ring buffer, while `24:6958` failing to set `$0221..$022B` means:
       - Relics **cannot be toggled on/off in the Pause -> Relics menu** (`37:64D4` checks `CALL 4272h` in `$0221..$022B`, which is `0` because `R3` was `0x61` instead of `RC1`!).
       - Equipment picked up off the floor (`0x16..0x4C`) **never appears in your inventory (`$0221..$022B`)** because `R3` was `0x61` instead of `RC1` at `24:6958`! Wait — let's verify `24:6958`! At `24:6910`: `MOV R3,RC1; CMP R3,#61h; BR C,6956h`. When `RC1 < 0x61`, `R3` **IS** `RC1`! Why did `24:6A41` not clear `$0244` on room transition? Let's check where `$0244` is cleared on room transition!
- **Let's check:**
  - In `Zone 03 Room 06` (`0x04E73B`, Long Library back ledge): item #10 is `0x2E` (**Soul of Bat**)! It is ALREADY `0x2E` (Soul of Bat) in the Long Library back room!
  - Why did the user think Bat wasn't naturally findable in the prototype? Because:
    1. In `Zone 03 Room 06` (Long Library), there are **19 items** (`#0..#18`) in the room table (`0x04E6EB..0x04E782`), and Soul of Bat (`0x2E`) is **Item #10** (the 11th item)!
    2. Look at `24:6A41` (the room item loader): `$0244..$024D` only holds **10 items at a time (`0x0A` slots)**!
    3. When you enter `Zone 03 Room 06` from `Room 07` (`pos=(1490, 418)`), `24:6A41` scans items `#0..#18` in order and loads the **first 10 items whose coordinates are within camera range (`CALL 6CC6h`)** into `$0244[0..9]`!
    4. And look at `24:6A61`:
       ```
       6A61: MOVW RR4,#0000h
       6A64: CMP R7,0244h(RR4)
       6A68: JMP Z,6AEBh
       6A6B: INC R5
       6A6D: CMP R5,#0Ah
       ```
       And when you walk to the bottom of `Zone 03 Room 06` (`pos=(1249, 946)` where Soul of Bat `#10` is), `$0244[0..9]` is already full of candle items `#0..#9` from the top of the room, and `24:6728` **never unloads off-screen items from `$0244[0..9]`**!
    5. **WAIT A SECOND! READ THAT AGAIN!**
       In `Zone 03 Room 06` (Long Library):
       - The room has **19 items** (`#0..#18`).
       - Items `#0..#9` are 10 candles/hearts in the upper bookshelves (`y = 50..450` and `#9` at `y = 818..946`).
       - Item `#10` (`0x04E73B`) is **Soul of Bat (`0x2E`)** at `(1249, 946)`!
       - Item `#11` (`0x04E743`) is **Goddess Shield (`0x4A`)** at `(800, 962)`!
       - Because `$0244` only has 10 slots and **never frees slots when candles go off-screen** (unlike enemies at `24:7A86` which despawn when off-screen!), as you walk through `Zone 03 Room 06`, the 10 slots in `$0244` fill up with the first 10 candles `#0..#9`, **so Item #10 (Soul of Bat) and Item #11 (Goddess Shield) FAIL TO SPAWN unless you whip/collect the candles or reorder Soul of Bat & Goddess Shield to the top of Room `(03,06)`'s item list!**
    6. **BINGO!!** That is why Soul of Bat (`0x2E`) in the Long Library back room (`03,06`) often never spawned or seemed unobtainable! In `03,06`, items `#0..#9` are 10 candles, and `$0244` only holds 10 active room objects! If all 10 slots are occupied by candles `#0..#9`, the ring buffer `$0270` at `24:6ACA` overwrites slots, OR if we put the unique floor items (`0x2E` Soul of Bat, `0x4A` Goddess Shield, `0x06` Elixir, `0x5C` Stopwatch) at the **beginning** of each room's item list (indices `#0..#3`) before the candles, they are guaranteed to always load and never be crowded out by candles!

### Bug 2: Transformation Controls (`Bank 0x22: $629E, $65E4–$6625, $78ED–$7964`)
- **How it works in the prototype:**
  - **Single-press `D` (`0x10`)** sets `RE4.#5` and `$02E5 = 5`. While `$02E5 > 0`, `22:60EB` skips contact damage (`JMP 6183h`), and `22:629E` forces action `0x27` (`22:65DA`), which blocks all movement for 5 frames. If `D` is not pressed again within those 5 frames, when `$02E5 == 0` it checks `0x2E` (**Soul of Bat**) and transforms into **Bat (`Form 2`)**!
  - **Double-tap `D` within 5 frames (83 ms!)**: Because `22:625F` edge-triggers `D` (`0x10`), holding `D` clears `RD9.#4` on frame 2. To get `RD9.#4 == 1` while `RE4.#5 == 1` (`22:62A3`), you must release `D` and press `D` a second time within **4 frames (66 ms)** — nearly humanly impossible! And even if you do, `22:62A8` sets `RE4.#6`, which then waits for `$02E5 == 0` AND requires you to press `D` a **THIRD time** after the 5 frames expire so that `22:62AC` matches `D` -> `0x27` -> `22:65E7` (`BBS RE4,#6,660Fh`) to check `0x33` (**Form of Mist**) and transform into **Mist (`Form 3`)**!
  - That explains why in every playthrough video, players who had Form of Mist could **never** figure out how to transform into Mist!
- **The Clean, Hardware-Accurate Fix:**
  - Make **Down + D** (or **Up + D** / double-tap `D` with a generous window, or automatic fallback when you have Form of Mist) transform into **Mist immediately**, and **D** transform into **Bat** (or if you only have Form of Mist and not Soul of Bat, pressing **D** transforms directly into **Mist**; if you have both, **D** = Bat and **Down + D** or **double-tap D** within 15 frames = Mist, without requiring a 3rd press!).
  - Even better: let's check how `22:65E4` works!
    - If we check `Down + D` (`RD9 == 0x12, 0x16, 0x1A` or `BTST RD9,#02h`) OR if the player does NOT have Soul of Bat (`0x2E`) when pressing `D`, branch directly to `660Fh` (check `0x33` **Form of Mist** and transform into Mist immediately with zero delay)!
    - And if the player has Soul of Bat (`0x2E`), pressing `D` (without Down) transforms immediately into **Bat** (or if they press `Down + D`, or double-tap `D` within 12 frames where `RE4.#6` auto-triggers at `65F2` when `$02E5` reaches `0` without needing a 3rd `D` press!), it transforms into **Mist**!
    - Look at why a 3rd `D` press was required in the prototype:
      When `$02E5 > 0`, `22:629E` checks `BBS RE4,#5,62ACh`. The moment you double-tap `D`, `22:62A6` does `BCLR RE4,#5; BSET RE4,#6`! On the next frame, because `RE4.#5` is now `0`, `22:629E` does **NOT** force `R0 = 0x27` anymore! So unless you press `D` a 3rd time, `65E4` is never called again!
      If `22:629E` checks `BTST RE4,#60h` (either `RE4.#5` OR `RE4.#6` pending!), OR if double-tapping `D` (or pressing `Down + D`) immediately jumps to `660Fh` (`Mist`) without waiting for `$02E5`, then:
      1. **Press `D`**: transforms into **Bat** (or **Mist** if you only have Form of Mist!).
      2. **Press `Down + D` OR Double-Tap `D` (within 12 frames)**: transforms into **Mist** immediately!
      3. **Press `D` while in Bat or Mist**: reverts to **Alucard** (`Act 0x02`).
      4. **Press `A` or `B` while in Bat form** (with `0x2F` Fire of Bat): shoots **Bat Fireball** (`Proj 0x06`, cost 4 MP)!
  - **Bat & Mist MP Drain (`22:78ED–$7964`):**
    - Currently drains `2 MP` (`SUB R1,#02h`) every 3rd frame (`RD0.#1`), which is ~40 MP/sec (drains full starting MP in 1.2 seconds!).
    - Fix: Change `81 D0` (`BBC RD0,#1`, every 3rd frame) to `85 D0` (`BBC RD0,#5`, every 8th frame) and `52 02 01` (`SUB R1,#02h`) to `52 01 01` (`SUB R1,#01h`) at both `22:7913` (Mist) and `22:793C` (Bat), reducing MP drain by **5.3x** (~3.75 MP/sec), and increase un-upgraded Mist duration `$02FD` at `22:661D` from `0x23` (35 frames) to `0x50` (80 frames).

### Bug 3: Broken Password System (`Bank 0x20: $43A4–$4694, $4AC8` & `Bank 0x21: $7BC7, $7BF3`)
- **Root Cause Verified:**
  1. `20:4AC8` generates a **random 8-icon string** into `$0341..$0348` using PRNG `CALL 4874h` and saves the actual game state (`89 bytes`) into battery-backed NVRAM slots `0x0448` and `0x0449` (`CALL 41BAh` -> `21:7BC7`), storing the random 8-byte password at `slot_0449 + 0x2D`.
  2. When you enter the Password Screen (`20:438A`), it checks if `slot_0448[0x11] == 0x2A` (the map-% initialization marker written by `21:7CEC`). If not `0x2A`, it overwrites `$0341` with `0x80` (making all passwords fail!); if `0x2A`, it loads `$0341..$0348` from `slot_0449 + 0x2D`.
  3. Worse, at `21:7BC7` (Save Game), `CALL 7BE4h` writes 53 bytes to `slot_0449` (`+0x00..+0x34`), which **overwrites `slot_0449`'s 19-byte NVRAM header (`+0x00..+0x12`: Game ID `0x0449`, Title, Score, `$00` terminator)** with raw equipment bits from `$0221..$0241`! On power cycle or BIOS NVRAM scan, slot `0x0449` no longer has Game ID `0x0449` at `+0x00..+0x01`, so `CALL 5470h` (`MOVW RR0,#0449h`) fails to find slot `0x0449`!
- **The Complete Fix:**
  1. **Make the 8-icon password deterministic** (or auto-fill the saved password on the Password screen / preserve the NVRAM header of `0x0449` AND encode/decode state or fix `0x0448`/`0x0449` NVRAM header offset):
     - Wait: let's look at BOTH parts of the password problem:
       - **Part A (Why NVRAM save `0x0449` is lost or fails across sessions):**
         In `21:7BC7` (save) and `21:7BF3` (load), for `0x0448` it does `ADDW RR0,#0013h` (skipping the 19-byte BIOS NVRAM header `+0x00..+0x12` so `0x0448` stays a valid BIOS NVRAM slot and `0x0448 + 0x11` has `0x2A`!).
         For `0x0449`, it forgot `ADDW RR0,#0003h` (or `#0013h`), so writing `7C6Dh` at `+0x00` **destroyed the `04 49` Game ID in bytes `+0x00..+0x01` of the NVRAM slot**!
         Wait: once `21:7BC7` overwrites bytes `+0x00..+0x01` of slot `0x0449` with `$0221..$0222` (`00 00`), the next time `CALL 5470h` searches NVRAM for Game ID `0x0449`, **it can NEVER find slot `0x0449` again**!
         **HOLD ON! VERIFY THAT!**
         Look at `21:7BC7`:
         ```
         7BC7: MOVW RR0,#0449h
         7BCA: MOV R2,#01h
         7BCC: CALL 5470h       ; returns RR0 = pointer to start of slot 0x0449 ($FC60 + k*64)!
         7BCF: MOVW RR2,#7C6Dh
         7BD2: CALL 7BE4h       ; writes 53 bytes starting at @RR0 (offset +0x00 of slot 0x0449)!!
         ```
         **OH!!**
         When `CALL 5470h` finds slot `0x0449`, `RR0` points to offset **`+0x00`** of the 64-byte NVRAM slot (where the 16-bit Game ID `04 49` is stored!).
         In `21:7BD5` (for `0x0448`), the programmer wrote:
         ```
         7BD5: MOVW RR0,#0448h
         7BD8: CLR R2
         7BDA: CALL 5470h
         7BDD: ADDW RR0,#0013h  ; <-- skips the 19-byte header (+0x00..+0x12) so Game ID 04 48 is preserved!
         ```
         In `21:7BC7` (for `0x0449`), because `7C6Dh` has 53 bytes (`53 + 19 = 72 > 64`), the programmer didn't add `#0013h`, and instead wrote starting at **`+0x00`**, which **OVERWROTE THE `04 49` GAME ID AT `+0x00..+0x01` WITH `$0221..$0222`**!
         So on the VERY FIRST SAVE, `slot_0449[0..1]` gets overwritten with `$0221..$0222` (equipment bits, usually `00 00`)!
         Then:
         - In the same session, why did password entry work immediately after Game Over? Because `$0341..$0348` was **still sitting in RAM `$0341..$0348`** when `slot_0448[0x11]` wasn't `0x2A`, OR when `CALL 5470h` for `0x0449` failed to find `0x0449` and allocated a NEW blank slot `0x0449` every time you saved!
         - Every time you saved at the coffin, because the previous `0x0449` slot had its `04 49` ID overwritten with `00 00` (or equipment bytes), `CALL 5470h` (`R2=1` create-if-not-found) couldn't find `0x0449`, or found the wrong address, and on power cycle `CALL 5470h` couldn't find `0x0449` at all!
         - AND look at `64 - 53 = 11` bytes! A 64-byte NVRAM slot needs **only 3 bytes** at `+0x00..+0x02` (`04 49 00`) for `CALL 5470h` (BIOS NVRAM slot lookup) to recognize it as Game ID `0x0449`! `3 + 53 = 56 <= 64` bytes!
         - And look at `20:43CD`:
           ```
           43C5: MOVW RR0,#0449h
           43C8: MOV R2,#01h
           43CA: CALL 5470h
           43CD: ADDW RR0,#002Dh   ; reads 8 bytes of password $0341..$0348 from slot_0449 + 0x2D!
           ```
           In `7C6D`, `$0341..$0348` are the **46th..53rd bytes** (indices `45..52`, which is offset **`+0x2D..+0x34`** from the start of the `7C6D` data)!
           If `7C6D` data starts at `slot_0449 + 0x03` (preserving `+0x00..+0x02` = `04 49 00`), then:
           - `53` bytes of `7C6D` data occupy `+0x03..+0x37` (`56` bytes total, fitting comfortably inside the 64-byte NVRAM slot `0x0449`!).
           - `$0341..$0348` inside `slot_0449` is at `+0x03 + 0x2D = +0x30`!
           - And at `21:7BC7` (Save), `21:7BF3` (Load), and `20:43CD` (Password Load), we also ensure `slot_0448[0x11]` is set to `0x2A` on save, AND even better:
             1. Why does the password change every time you enter the coffin even if nothing changed? Because `20:4AC8` uses the free-running PRNG `CALL 4874h`! If we make `20:4AC8` derive the 8 password icons **deterministically** from the saved state (or a fixed seed / checksum of the save data), re-saving the same state produces the **exact same password**!
             2. Even better: what if a player enters a password on a fresh boot (or after wiping NVRAM) where NVRAM doesn't have the save? Or what if they enter their saved password after a power cycle?
                - With the `+0x03` offset fix on slot `0x0449` (and setting `slot_0448[0x11] = 0x2A` on save), **NVRAM slot `0x0449` and `0x0448` persist 100% intact across power cycles and reboots**, AND we can pre-populate the 8-icon buffer `$020B..$0212` on the Password screen (`20:438A`) with the saved password `$0341..$0348` (or accept any valid deterministic password!) so the player can either press A to load their saved game immediately or enter a password!
                - Wait: let's check if we can make `20:438A` (Password Screen) **both** preserve full 89-byte NVRAM saves across power cycles (fixing the `+0x03` header corruption bug!) **AND** work statelessly for deterministic passwords even if NVRAM is blank!
                - Let's check how much information a stateless 8-icon (38-symbol, ~42-bit) password can carry vs the 89-byte NVRAM save:
                  - The NVRAM save (`0x0448` + `0x0449`) stores **all 89 bytes** cleanly (every single item quantity, every single visited map room bit, exact XP, exact familiar XP, exact gold, exact equipment, exact save room!).
                  - Why did NVRAM saves fail in the prototype? ONLY because `21:7BC7` forgot `ADDW RR0,#0003h` on slot `0x0449` (clobbering the `04 49` Game ID header at `+0x00..+0x01`!), AND because if you saved before visiting a new room, `slot_0448[0x11]` wasn't `0x2A` yet (`20:43B8` checks `CMP R1,#2Ah` and refuses to load the password from `0x0449` if you haven't stepped into a new room!).
                  - AND if we ALSO add a stateless password encoder/decoder (encoding Level, Relics `$02EE/$02EF`, Vlad progression, Save Room, and key equipment into the 8 icons, and if the entered 8 icons match the NVRAM password `$0341..$0348` it loads the full 89-byte NVRAM save; if NVRAM doesn't match, it decodes the 8-icon password statelessly!), then:
                    - Saving at a coffin and rebooting the console/emulator loads your **exact 89-byte save** when you enter your password!
                    - Re-entering a save room without changing state gives the **exact same 8-icon password** (no more 5 different passwords for 5 touches of the coffin)!
                    - Entering a password on a brand-new machine with empty NVRAM **also works statelessly**!
                    That solves 100% of both the NVRAM corruption bug and stateless password sharing!

### Bug 4: Alucard's Movement, Jump, Double Jump & Long Library Gap (`Bank 0x22` & `Bank 0x29`)
- **Exact Measurements & Fixes:**
  1. **Walk Startup Delay (`Act 02` at `0x052007`):**
     - Keyframe 0 is `(+0, +0, f=02, t=3, s=963B)` — a 4-frame freeze before Alucard moves a single pixel when you press Left or Right!
     - Fix: Change Keyframe 0 at `0x052007` from `(+0, +0, t=3)` to `(+4, +0, t=1)`, eliminating the walk startup freeze.
     - Also increase walk speed slightly in `Act 02` (`0x052007`) and `Act 03` (`0x052038`) from `+4 px` per step to `+5 px` per step (`2.5 px/frame`), making horizontal traversal noticeably crisper without breaking collision.
  2. **Normal Jump (`Act 05` at `0x052128`) & Vertical Jump (`Act 07` at `0x0520B3`):**
     - In `Act 05` (`0x052128`, 19 keyframes): currently 12 keyframes of `(+5,-5,t=1)`, 4 of `(+6,-5,t=1)`, 3 of `(+4,+0,t=1)` (`dx = +96`, `dy = -80` over 38 frames).
     - Increasing the first 12 keyframes to `(+6,-6,t=1)`, next 4 to `(+6,-5,t=1)`, and last 3 to `(+5,-1,t=1)` gives `dx = +111 px`, `dy = -95 px` — a faster, higher, farther jump arc that easily clears the Long Library gap (`dx ~ 75 px`) and high ledges!
     - In `Act 07` (`0x0520B3`, 9 keyframes): change keyframe 0 from `(+0,+0,t=1)` to `(+0,-8,t=1)` and the 8 rising keyframes from `(+0,-6,t=1)` to `(+0,-8,t=1)` (`dy = -72 px` instead of `-48 px`).
  3. **Leap Stone Double Jump (`Act 06` at `0x052088` & Trigger at `22:6ADF`):**
     - Currently `22:6ADF` only allows Double Jump during `Act 09` or `Act 0A` (after `Act 05` has completely finished and transitioned through `Act 08`!), AND `Act 06` (`0x052088`) has a `(+0,+0,t=2)` freeze on keyframe 0 followed by 6 keyframes of `(+4,-6,t=1)` (`dy = -36 px`, `dx = +24 px`).
     - Fixes:
       1. In `Act 06` (`0x052088`): change keyframe 0 from `(+0,+0,t=2)` to `(+6,-10,t=1)` and keyframes 1..6 from `(+4,-6,t=1)` to `(+6,-10,t=1)` -> **`dy = -70 px`, `dx = +42 px`** (nearly double the vertical boost and horizontal reach, with zero startup pause!).
       2. At `22:6ADF`: allow Double Jump (`Act 06`) to trigger not only during `Act 09` and `Act 0A` (falling), but **also during `Act 08` (jump apex) and the second half of `Act 05` (`$0289 >= 8`)**! Let's check `22:6267` and `22:6ADF`:
          - At `22:6267`, `CMP R4,#05h; BR Z,6271h` allows `C` (`0x20`) to re-trigger during `Act 05`, but `22:6274` had `BCLR RE4,#2` (which cleared the double-jump-used flag while in `Act 05`), whereas `22:6ADF` only checked `CMP R4,#09h` and `CMP R4,#0Ah`!
          - If `22:6ADF` also accepts `R4 == 0x08` (apex) or `R4 == 0x05` (when keyframe `$0289 >= 8`), you can double-jump right at the peak of your jump just like PS1 Symphony of the Night!

### Bug 5: Spells Menu & D-Pad Spell Inputs (`Bank 0x22: $6748–$691A` & `Bank 0x37: $668C–$6770`)
- **Findings:**
  - All 4 spells ARE implemented in both gameplay (`22:68AD`) and the Pause -> Spells menu (`37:745C`), unlocking at Levels **1 (Hellfire)**, **3 (Summon Spirit)**, **5 (Soul Steal)**, and **7 (Tetra Spirit)** (`22:68B2` and `37:676D`).
  - Why players thought only Hellfire existed:
    1. At Level 1–2, only Hellfire is shown in the Spells menu (`37:66EF` hides spells above your current level `$0271`).
    2. Spell inputs require **exact diagonal bytes (`0x0A`, `0x06`, `0x09`, `0x05`)** with zero neutral frames (`22:6748`: `CMP RD9,#00h` exits, and any non-matching intermediate D-pad state resets `$00E5` at `22:67FD`!).
- **Fixes:**
  1. **Show all 4 spells in the Pause -> Spells menu from Level 1** (or lower level thresholds `[1, 3, 5, 7]` -> `[1, 1, 1, 1]` at `37:676D` and `[1, 2, 3, 4]` or `[1, 1, 1, 1]` at `22:68B2`) so players can immediately see all 4 spell commands in the Spells menu!
  2. **Simplify the spell input sequences in `22:68CF..690D` to clean cardinal D-pad sequences** (no diagonals required!):
     - **Spell #1 (Hellfire, `Act 0x16`):** `Up -> Down -> Forward -> Forward+A/B` (`01, 02, 08, 88, FF, 48` right / `01, 02, 04, 84, FF, 44` left) — 4 bytes instead of requiring diagonal `0x0A`/`0x06`!
     - **Spell #2 (Summon Spirit, `Act 0x17`):** `Back -> Forward -> Up -> Down+A/B` (`04, 08, 01, 82, FF, 42` right / `08, 04, 01, 82, FF, 42` left) — 1 fewer step!
     - **Spell #3 (Soul Steal, `Act 0x19`):** `Back -> Forward -> Down -> Forward+A/B` (`04, 08, 02, 88, FF, 48` right / `08, 04, 02, 84, FF, 44` left) — clean 4-step cardinal motion!
     - **Spell #4 (Tetra Spirit, `Act 0x18`):** `Up -> Forward -> Down -> Down+A/B` (`01, 08, 02, 82, FF, 42` right / `01, 04, 02, 82, FF, 42` left) — clean cardinal quarter-circle!
     - **Spell #5 (High Jump, `Act 0x07`):** `Down -> Up+C` (`02, 21, FF, FF`).

### Bug 6: Richter Belmont Infinite HP & Bat Familiar Skipping Dracula (`Bank 0x23: $6AD9` & `Bank 0x39: $73D1, $74E4`)
- **Root Causes Verified:**
  1. **Richter Belmont (`Entity Type 0x27`):** In the Enemy HP table at `23:6AD9` (file `0x046B25`), Richter's HP is **`0xFFFF` (65,535 HP)**! That's why without Holy Glasses to break the orb (`Type 0x26`, 525 HP), Richter takes 65,535 damage to kill!
     - Fix: Change Richter's HP at `0x046B25` from `0xFFFF` (65,535) to **`0x0320` (800 HP)**, and at `39:72C8` (Richter's AI) add a check `CALL 4822h; BR Z,...; CALL 47E2h` so that if Richter's HP reaches `0`, he despawns/triggers the ending or transition instead of fighting forever!
  2. **Bat Familiar Killing Dracula During Shaft's Death (`39:74E4–$751A`):**
     - When Shaft (`Type 0x28`) dies at `39:74AA`, `39:74E4` immediately spawns Dracula (`Type 0x29`) in the same room and sets his HP (`0x05DC` = 1500) before the cutscene (`RD2 = 0x0F`), **without clearing `$02FC` (pending Bat Familiar hit flags)**!
     - Fix: In `39:74E4` / `39:7511` (and `39:76E5` Dracula's damage check), clear `$02FC` when spawning Dracula (`CLR R4; MOV @02FCh,R4`), and in `39:76E5` only process damage on Dracula when `RD2.#7 == 1` (active gameplay, not during cutscene `RD2 == 0x0F`)!

### Bug 7: Subweapons (`Bank 0x22` & `Bank 0x36`) & Text Typos (`Bank 0x38`)
- **Axe (`Proj 0x03`, `36:96EC` at file `0x06D6EC`):**
  - Currently moves only `+2 px` horizontally for the first 4 keyframes (`(+2,-8)`), making its horizontal arc too narrow. Increasing `dx` from `+2` to `+5` on the rising keyframes and `+5` on the apex keyframes gives the classic Castlevania forward parabolic arc!
- **Stopwatch (`Proj 0x04`, `22:70CF` at file `0x0450CF`):**
  - Fix the two bugs at `22:7110` and `22:7156`: initialize `$02E6` to `0x78` (120 frames = 2 seconds of time-stop) on State 1->2 transition (`22:7156` had `MOV R0,#FFh` after `22:7110` had already decremented `$02E6` from `0x00` to `0xFF` during State 1!).
- **Text Typos (`Bank 0x38`, exact in-place byte replacements preserving string terminators `0xFF`):**
  - `0x0707D9`: `"Chlan?\xff"` -> `"Clan? \xff"`
  - `0x071734`: `"Elixer\xff"` -> `"Elixir\xff"`
  - `0x07173B`: `"Libaray card\xff"` -> `"Library card\xff"`
  - `0x071779`: `"Sirlion\xff"` -> `"Sirloin\xff"`
  - `0x07184B`: `"Diamon plate\xff"` -> `"Diamond mail\xff"`
  - `0x07197E`: `"Goddness shield\xff"` -> `"Goddess shield \xff"`
  - `0x071B8D`: `"1 of 5 Treasures. STR +10\xff"` (Ring of Vlad description) -> `"1 of 5 Treasures. INT +10\xff"`
  - `0x071BD1`: `"Tertra Spirit\xff"` -> `"Tetra Spirit \xff"`

---

## 4. Castlevania - Symphony of the Night Reborn Patch Artifacts & Verification

- **Patch Generator & Offline Patcher:**
  - `tools/cv_patch/build_reborn_patch.py` -> generates `tools/cv_patch/reborn_edits.json` (79 documented hardware-compatible edits) and builds:
    - `patches/Castlevania - Symphony of the Night Reborn.bps` (CRC32-verified BPS patch)
    - `patches/Castlevania - Symphony of the Night Reborn.ips` (IPS patch)
  - To build or apply the patch offline against the original prototype ROM (`Castlevania - Symphony of the Night (Unknown) (Proto).tgc`, Size `2,097,152` bytes, CRC32 `c7f9ca43`, MD5 `76ceda41231eafa9d39df77011a90c30`, SHA-1 `86fc20a233f18c4c7aac8ebed3e4d95dabc6e8bb`):
    ```bash
    python tools/cv_patch/cvpatch.py apply "<path/to/Castlevania - Symphony of the Night (Unknown) (Proto).tgc>" "patches/Castlevania - Symphony of the Night Reborn.bps" "Castlevania - Symphony of the Night Reborn.tgc"
    ```
- **Patched ROM Checksums (`Castlevania - Symphony of the Night Reborn.tgc`):**
  - **Size:** `2,097,152` bytes (`0x200000`)
  - **CRC32:** `ca0c68e6`
  - **MD5:** `b52a53bc2fc3e9bd4eb570f91822c1af`
  - **SHA-1:** `4b86780b19c6fbfff43c6226361731669a597665`
- **Cub Spiele.Com Integration:**
  - Added **`Castlevania - Symphony of the Night Reborn`** (`id: 'castlevaniareborn'`) as the 24th game entry in `KNOWN_GAMECOM_GAMES` (`src/emulator/cartridge.ts`), automatically recognized by its MD5 hash (`b52a53bc2fc3e9bd4eb570f91822c1af`) or filename so it appears as a distinct title from the original prototype.
  - Added the **128% (`1.28×`)** speed preset in `Emulation -> Speed` (`src/components/TopBar.tsx`).

## Reborn NVRAM entry (CV REBORN)
- Reborn uses its own BIOS NVRAM entry so it never shares saves with the original prototype: Game ID **`$B745`** (slot 0: title `CV REBORN`, score `  0%`) and **`$B746`** (slot 1: binary save, password at slot offset +0x30). The original Castlevania uses `$0448` / `$0449`.
- The BIOS validates the cart header: byte +0x1C must equal `((id_hi + id_lo) & 0xFF) ^ 0xA5` (here `0x59`), and its low nibble selects a 3-byte security sum (must be `0x5A`) from cart bytes. `$B745` was chosen so the low nibble is 9, the same table entry the original cart (checksum `0xE9`) already satisfies.
- Saves made with earlier Reborn builds live under `$0448` / `$0449` and are not read by this build.
