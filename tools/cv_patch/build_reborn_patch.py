#!/usr/bin/env python3
"""
Castlevania: Symphony of the Night Reborn — Definitive ROM Patch Builder
=========================================================================
Generates `tools/cv_patch/reborn_edits.json` and builds:
  - `patches/Castlevania - Symphony of the Night Reborn.bps` (primary, CRC32-verified)
  - `patches/Castlevania - Symphony of the Night Reborn.ips` (legacy IPS)
  - `tools/cv_patch/work/Castlevania - Symphony of the Night Reborn.tgc` (local test ROM, gitignored)

All patches are 100% Sharp SM8521 / Tiger Game.com hardware-compatible.
"""
import json
import os
import shutil
import subprocess
import sys
import zipfile

REBORN_VERSION = "0.1"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ORIG_ROM = os.path.join(
    ROOT, "tools", "cv_patch", "work", "orig",
    "Castlevania - Symphony of the Night (Unknown) (Proto).tgc"
)
PATCHED_ROM = os.path.join(
    ROOT, "tools", "cv_patch", "work",
    "Castlevania - Symphony of the Night Reborn.tgc"
)
EDITS_JSON = os.path.join(ROOT, "tools", "cv_patch", "reborn_edits.json")
PATCH_DIR = os.path.join(ROOT, "patches")
PUBLIC_PATCH_DIR = os.path.join(ROOT, "public", "patches")
BPS_OUT = os.path.join(PATCH_DIR, f"Castlevania - Symphony of the Night Reborn-v{REBORN_VERSION}.bps")
IPS_OUT = os.path.join(PATCH_DIR, f"Castlevania - Symphony of the Night Reborn-v{REBORN_VERSION}.ips")


def s8(v: int) -> int:
    return v & 0xFF


def make_edits(orig: bytes) -> list[dict]:
    edits = []

    def add(offset: int, new_bytes: bytes | list[int], desc: str):
        nb = bytes(new_bytes)
        ob = orig[offset:offset + len(nb)]
        edits.append({
            "name": desc,
            "offset": f"0x{offset:06X}",
            "old": ob.hex(),
            "new": nb.hex(),
            "desc": desc,
        })

    # =========================================================================
    # 1. PASSWORD & NVRAM SAVE SYSTEM FIXES (Bank 0x20, Bank 0x21, Bank 0x22)
    # =========================================================================
    # Fix 1A: Always write the 0x2A initialized marker at Slot 0x0448+0x11 on Save
    # so passwords work across power cycles even if you save in the first room.
    # (Note: BIOS CALL 5470h already returns slot_base + 0x03, skipping the 3-byte NVRAM header!)
    add(0x043BDD, [
        0x98, 0x7F, 0xA1,       # 7BDD: JMP T,7FA1h
        0xFF, 0xFF, 0xFF, 0xFF, # 7BE0..7BE3: NOPx4
    ], "21:7BDD Set 0x0448+0x11=0x2A initialized marker on Save")

    add(0x043FA1, [
        0x69, 0x00, 0x00, 0x11, # 7FA1: ADDW RR0,#0011h
        0xC6, 0x2A,             # 7FA5: MOV R6,#2Ah
        0x39, 0x70,             # 7FA7: MOV (RR0)+,R6
        0x18, 0x00,             # 7FA9: INCW RR0 (RR0 is now slot_0448 + 0x13)
        0x7A, 0x7C, 0x23,       # 7FAB: MOVW RR2,#7C23h
        0x98, 0x7B, 0xE4,       # 7FAE: JMP T,7BE4h
    ], "21:7FA1 Helper to write 0x2A marker to Slot 0x0448+0x11 on Save")

    # Guard 21:7BFE (Load Slot 1 0x0449) against uninitialized/corrupted 0xFFFF header
    add(0x043BFE, [0x49, 0x7F, 0xB1], "21:7BFE CALL 7FB1h (guarded Slot 1 load)")
    add(0x043FB1, [
        0x3A, 0x20,             # 7FB1: MOVW RR4,@RR0
        0x68, 0x04, 0xFF, 0xFF, # 7FB3: CMPW RR4,#FFFFh
        0xD6, 0x03,             # 7FB7: BR Z,7FBCh (skip corrupt/uninit Slot 1)
        0x98, 0x7C, 0x14,       # 7FB9: JMP T,7C14h
        0xF8,                   # 7FBC: RET
    ], "21:7FB1 Skip loading Slot 1 (0x0449) if 0xFFFF uninitialized/corrupted")

    # Fix 1E: Give Reborn its own NVRAM entry "CV REBORN" so its saves never share the original
    # Castlevania ($0448/$0449) slots. Game ID $B745 = slot 0 (title/score), $B746 = slot 1 (binary
    # save data). The cartridge header (title + ID) and every BIOS CALL 5470h lookup must agree.
    add(0x040011, b"CV REBORN", "Header title 'CV REBORN'")
    add(0x04001A, [0xB7, 0x45, 0x59], "Header Game ID $B745 + BIOS ID checksum ((hi+lo)&FF)^A5 = 59; low nibble 9 = same BIOS security entry as the original cart")
    add(0x04223F, [0xB7, 0x45], "20:623F slot 0 lookup ID $B745")
    add(0x04224B, [0xB7, 0x46], "20:624B slot 1 create ID $B746")
    add(0x042253, [0xB7, 0x45], "20:6253 slot 0 ID $B745")
    add(0x04226D, b"CV REBORN  ", "Slot 0 title template 'CV REBORN  '")
    add(0x043BC8, [0xB7, 0x46], "21:7BC8 save: slot 1 ID $B746")
    add(0x043BD6, [0xB7, 0x45], "21:7BD6 save: slot 0 ID $B745")
    add(0x043BF4, [0xB7, 0x46], "21:7BF4 load: slot 1 ID $B746")
    add(0x043C02, [0xB7, 0x45], "21:7C02 load: slot 0 ID $B745")
    add(0x043CDA, [0xB7, 0x45], "21:7CDA slot 0 ID $B745")

    # Fix 1D: Press A to skip the intro crawl pages ("It was Richter Belmont, the legendary vampire
    # hunter..."). The dialogue before it is untouched. In the crawl state (RD2 == 03h) the original
    # code only accepted A once the last page was reached ($020B == 5). Now an A press starts the game
    # once the crawl has begun (RD3 > 1; RD3 == 1 on the first crawl frame). RD3 is set to 18h
    # (crawl complete) so the normal 20:4345 cleanup (CALL 41ABh when RD3 >= 18h) removes the crawl.
    add(0x0402FC, [
        0xB0, 0xD3,             # 42FC: MOV R0,RD3
        0x50, 0x01, 0x00,       # 42FE: CMP R0,#01h
        0xD3, 0x32,             # 4301: BR ULE,4335h (RD3 <= 1: ignore this A press)
        0x58, 0x18, 0xD3,       # 4303: MOV RD3,#18h
        0xD8, 0x02,             # 4306: BR T,430Ah   (start game)
    ], "20:42FC A during the intro crawl starts the game")

    # Fix 1B: On Password Screen init (20:4391), read saved password from slot_0449 + 0x2D
    # (BIOS CALL 5470h already skips the 3-byte header) into $0341..$0348 AND pre-fill
    # $020B..$0212 with the saved password so a single A press loads the saved game!
    add(0x040391, [
        0x78, 0xB7, 0x45,       # 4391: MOVW RR0,#B745h (CV REBORN slot 0)
        0x00, 0x02,             # 4394: CLR R2
        0x49, 0x54, 0x70,       # 4396: CALL 5470h
        0x69, 0x00, 0x00, 0x11, # 4399: ADDW RR0,#0011h
        0x38, 0x08,             # 439D: MOV R1,@RR0
        0x50, 0x2A, 0x01,       # 439F: CMP R1,#2Ah
        0xD6, 0x1B,             # 43A2: BR Z,43BFh
        0x78, 0xFF, 0xFF,       # 43A4: MOVW RR0,#FFFFh
        0x3B, 0x80, 0x02, 0x0B, # 43A7: MOVW @020Bh,RR0
        0x3B, 0x80, 0x02, 0x0D, # 43AB: MOVW @020Dh,RR0
        0x3B, 0x80, 0x02, 0x0F, # 43AF: MOVW @020Fh,RR0
        0x3B, 0x80, 0x02, 0x11, # 43B3: MOVW @0211h,RR0
        0xC0, 0x23,             # 43B7: MOV R0,#23h
        0x39, 0x80, 0x02, 0x0B, # 43B9: MOV @020Bh,R0
        0xD8, 0x1D,             # 43BD: BR T,43DCh
        0x78, 0xB7, 0x46,       # 43BF: MOVW RR0,#B746h (CV REBORN slot 1)
        0xC2, 0x01,             # 43C2: MOV R2,#01h
        0x49, 0x54, 0x70,       # 43C4: CALL 5470h
        0x69, 0x00, 0x00, 0x2D, # 43C7: ADDW RR0,#002Dh (+0x2D offset after BIOS +0x03)
        0x7A, 0x03, 0x41,       # 43CB: MOVW RR2,#0341h
        0x7E, 0x02, 0x0B,       # 43CE: MOVW RR6,#020Bh
        0xC5, 0x08,             # 43D1: MOV R5,#08h
        0x38, 0x60,             # 43D3: MOV R4,(RR0)+
        0x39, 0x62,             # 43D5: MOV (RR2)+,R4
        0x39, 0x66,             # 43D7: MOV (RR6)+,R4
        0x75, 0xF8,             # 43D9: DBNZ R5,43D3h
        0xFF,                   # 43DB: NOP
    ], "20:4391 Load saved password from slot 0x0449+0x2D and pre-fill $020B..$0212")

    # Fix 1C: Deterministic password generator (22:7BB8 -> CALL 7D50h) so touching the
    # Save Room coffin repeatedly with the same state produces the exact same 8 icons.
    add(0x045BB8, [
        0x49, 0x7D, 0x50,       # 7BB8: CALL 7D50h (deterministic password generator)
    ], "22:7BB8 Call deterministic password generator instead of random 4AC8h")

    add(0x045D50, [
        0x78, 0x02, 0x21,       # 7D50: MOVW RR0,#0221h
        0xC2, 0x35,             # 7D53: MOV R2,#35h
        0xC3, 0x17,             # 7D55: MOV R3,#17h
        0x38, 0x60,             # 7D57: MOV R4,(RR0)+
        0x11, 0x1C,             # 7D59: ADD R3,R4
        0x06, 0x03,             # 7D5B: RLC R3
        0x72, 0xF8,             # 7D5D: DBNZ R2,7D57h
        0x38, 0xA0, 0x02, 0x71, # 7D5F: MOV R4,@0271h (Level)
        0x11, 0x1C,             # 7D63: ADD R3,R4
        0x38, 0xA0, 0x02, 0xEE, # 7D65: MOV R4,@02EEh (Relics lo)
        0x17, 0x1C,             # 7D69: XOR R3,R4
        0x38, 0xA0, 0x02, 0xEF, # 7D6B: MOV R4,@02EFh (Relics hi)
        0x11, 0x1C,             # 7D6F: ADD R3,R4
        0x38, 0xA0, 0x02, 0x42, # 7D71: MOV R4,@0242h (Zone)
        0x17, 0x1C,             # 7D75: XOR R3,R4
        0x38, 0xA0, 0x02, 0x43, # 7D77: MOV R4,@0243h (Room)
        0x11, 0x1C,             # 7D7B: ADD R3,R4
        0x7C, 0x03, 0x41,       # 7D7D: MOVW RR4,#0341h
        0xC2, 0x08,             # 7D80: MOV R2,#08h
        0x51, 0x0D, 0x03,       # 7D82: ADD R3,#0Dh
        0xB1, 0x03,             # 7D85: MOV R1,R3
        0x55, 0x1F, 0x01,       # 7D87: AND R1,#1Fh
        0x50, 0x0D, 0x01,       # 7D8A: CMP R1,#0Dh
        0xDE, 0x02,             # 7D8D: BR NZ,7D91h
        0x08, 0x01,             # 7D8F: INC R1
        0x50, 0x1F, 0x01,       # 7D91: CMP R1,#1Fh
        0xDE, 0x02,             # 7D94: BR NZ,7D98h
        0xC1, 0x20,             # 7D96: MOV R1,#20h
        0x39, 0x4C,             # 7D98: MOV (RR4)+,R1
        0x06, 0x03,             # 7D9A: RLC R3
        0x72, 0xE4,             # 7D9C: DBNZ R2,7D82h
        0xF8,                   # 7D9E: RET
    ], "22:7D50 Deterministic 8-icon password generator from player state")

    # =========================================================================
    # 2. ROOM ITEM LOADER & RELIC PLACEMENT FIXES (Bank 0x24 & Bank 0x27)
    # =========================================================================
    # Fix 2A: Fix 24:6ACA so despawned/collected slots ($0262 == 0xFF) are reclaimed
    # first before overwriting active items via the ring buffer $0270.
    add(0x048ACA, [
        0x49, 0x7F, 0x90,       # 6ACA: CALL 7F90h (prefer empty/0xFF slot before ring buffer)
        0xFF,                   # 6ACD: NOP
    ], "24:6ACA Call smart slot allocator 7F90h")

    add(0x049F90, [
        0x7C, 0x00, 0x00,       # 7F90: MOVW RR4,#0000h
        0x38, 0x8C, 0x02, 0x44, # 7F93: MOV R1,0244h(RR4)
        0x50, 0x00, 0x01,       # 7F97: CMP R1,#00h
        0xD6, 0x17,             # 7F9A: BR Z,7FB3h
        0x38, 0x8C, 0x02, 0x62, # 7F9C: MOV R1,0262h(RR4)
        0x50, 0xFF, 0x01,       # 7FA0: CMP R1,#FFh
        0xD6, 0x0E,             # 7FA3: BR Z,7FB3h
        0x08, 0x05,             # 7FA5: INC R5
        0x50, 0x0A, 0x05,       # 7FA7: CMP R5,#0Ah
        0xDF, 0x03,             # 7FAA: BR NC,7FAFh
        0x98, 0x7F, 0x93,       # 7FAC: JMP T,7F93h
        0x38, 0xA8, 0x02, 0x70, # 7FAF: MOV R5,@0270h
        0xF8,                   # 7FB3: RET
    ], "24:7F90 Smart room-object slot allocator (reuses empty/0xFF slots first)")

    # Fix 2C: Allow opening Inventory (37:6000) with Pause, and Map (3B:6000) with D+Pause!
    # In the original prototype, 3B:6000 (Map) intercepted RBF==0x8A (Pause) before 37:6000 (Inventory).
    add(0x076012, [
        0x98, 0x7F, 0xB0,       # 6012: JMP T,7FB0h
        0xFF, 0xFF,             # 6015..6016: NOPx2
    ], "3B:6012 Only open Map on D+Pause so Pause opens Inventory (37:6000)")

    add(0x077FB0, [
        0x50, 0x8A, 0xBF,       # 7FB0: CMP RBF,#8Ah
        0x9E, 0x60, 0x1B,       # 7FB3: JMP NZ,601Bh
        0x84, 0xD9, 0x03,       # 7FB6: BBC RD9,#4,7FBCh (if D NOT held -> let 37:6000 open Inventory!)
        0x98, 0x60, 0x21,       # 7FB9: JMP T,6021h (D+Pause -> open Map!)
        0xF8,                   # 7FBC: RET
    ], "3B:7FB0 Map trigger (D+Pause) vs Inventory trigger (Pause)")

    # Fix 2B: Reorder all 14 rooms in Bank 0x27 that have >10 items and late non-heart/gold
    # items so unique relics/equipment/consumables always sit at the start of the room list!
    for z in range(16):
        zptr_off = 0x048AFA + z * 2
        zptr = (orig[zptr_off] << 8) | orig[zptr_off + 1]
        zfile = 0x24 * 0x2000 + (zptr & 0x1FFF)
        next_zptr = (orig[zptr_off + 2] << 8) | orig[zptr_off + 3] if z < 15 else 0x6CC9
        nrooms = (next_zptr - zptr) // 3
        for r in range(nrooms):
            eoff = zfile + r * 3
            rbank = orig[eoff]
            rptr = (orig[eoff + 1] << 8) | orig[eoff + 2]
            if rbank < 0x20 or not (0x8000 <= rptr <= 0x9FFF):
                continue
            rfile_start = rbank * 0x2000 + (rptr & 0x1FFF)
            rfile = rfile_start
            items = []
            while orig[rfile] != 0xFF and len(items) < 40:
                items.append(bytearray(orig[rfile:rfile + 8]))
                rfile += 8
            # Also fix Zone 03 Room 06 Stopwatch (#15) flag from 0x03 to 0x01 (floor item)
            if z == 3 and r == 6:
                for it in items:
                    if it[0] == 0x5C and it[1] == 0x03:
                        it[1] = 0x01
            # Also fix Zone 04 Room 05 HeartMaxUp (#14) flag from 0x05 to 0x01 (floor item)
            if z == 4 and r == 5:
                for it in items:
                    if it[0] == 0x62 and it[1] == 0x05:
                        it[1] = 0x01
            if len(items) > 10:
                late = [it for it in items[10:] if it[0] not in (0x5E, 0x5F, 0x60)]
                if late:
                    unique = [bytes(it) for it in items if it[0] not in (0x5E, 0x5F, 0x60)]
                    candles = [bytes(it) for it in items if it[0] in (0x5E, 0x5F, 0x60)]
                    reordered = b"".join(unique + candles)
                    add(rfile_start, reordered, f"Bank 0x27 Zone 0x{z:02X} Room 0x{r:02X}: prioritize {len(unique)} unique items/relics before candles")

    # =========================================================================
    # 3. TRANSFORMATION CONTROLS & MP DRAIN FIXES (Bank 0x22)
    # =========================================================================
    # Fix 3A: Make D = Bat (or Mist if player only has Form of Mist),
    # Down + D OR Double-Tap D (within 10 frames) = Mist immediately without needing a 3rd D press!
    add(0x0442A3, [
        0x84, 0xD9, 0x1F,       # 62A3: BBC RD9,#4,62C5h
        0xA6, 0xE4,             # 62A6: BCLR RE4,#6 (keep RE4.#5 set so 629E continues dispatching 0x27!)
        0xAE, 0xE4,             # 62A8: BSET RE4,#6 (Mist pending!)
        0xF8,                   # 62AA: RET
    ], "22:62A3 Keep RE4.#5 set on D double-tap so Mist triggers automatically")

    add(0x0445E4, [
        0x89, 0xD9, 0x28,       # 65E4: BBS RD9,#1,660Fh (Down+D -> Mist immediately!)
        0x8D, 0xE4, 0x0B,       # 65E7: BBS RE4,#5,65F5h
        0xAD, 0xE4,             # 65EA: BSET RE4,#5
        0xC0, 0x08,             # 65EC: MOV R0,#08h (8-frame double-tap window)
        0x39, 0x80, 0x02, 0xE5, # 65EE: MOV @02E5h,R0
        0x98, 0x64, 0x5C,       # 65F2: JMP T,645Ch (keep ticking current animation frame!)
        0x8E, 0xE4, 0x17,       # 65F5: BBS RE4,#6,660Fh (if double-tapped -> Mist immediately!)
        0x38, 0x80, 0x02, 0xE5, # 65F8: MOV R0,@02E5h
        0x50, 0x00, 0x00,       # 65FC: CMP R0,#00h
        0x9E, 0x64, 0x5C,       # 65FF: JMP NZ,645Ch
        0x0E, 0x03,             # 6602: PUSH R3
        0xC3, 0x2E,             # 6604: MOV R3,#2Eh (Soul of Bat)
        0x49, 0x47, 0x9B,       # 6606: CALL 479Bh
        0x0F, 0x03,             # 6609: POP R3
        0x98, 0x7D, 0x20,       # 660B: JMP T,7D20h
        0xFF,                   # 660E: NOP
    ], "22:65E4 Improved Bat & Mist transformation trigger (D=Bat/Mist fallback, Down+D or 2xD=Mist)")

    add(0x045D20, [
        0xA5, 0xE4,             # 7D20: BCLR RE4,#5
        0x9F, 0x66, 0x0F,       # 7D22: JMP NC,660Fh (if no Soul of Bat, try Form of Mist!)
        0xC0, 0x0E,             # 7D25: MOV R0,#0Eh (Transform to Bat)
        0x98, 0x63, 0xF0,       # 7D27: JMP T,63F0h
    ], "22:7D20 Fallback to Form of Mist if player presses D without Soul of Bat")

    add(0x044618, [
        0x98, 0x7D, 0xD2,       # 6618: JMP T,7DD2h (preserve Carry check & clear RE4.#5/#6!)
        0xFF,                   # 661B: NOP
        0xC0, 0x50,             # 661C: MOV R0,#50h
        0xFF,                   # 661E: NOP
    ], "22:6618 Clear RE4.#5/#6 on Mist transform and increase base Mist duration to 80 frames")

    add(0x045DD2, [
        0xA5, 0xE4,             # 7DD2: BCLR RE4,#5 (does not affect Carry!)
        0xA6, 0xE4,             # 7DD4: BCLR RE4,#6 (does not affect Carry!)
        0x9F, 0x66, 0x45,       # 7DD6: JMP NC,6645h (if no Form of Mist, cancel!)
        0xC0, 0x50,             # 7DD9: MOV R0,#50h (80 frames Mist duration instead of 35!)
        0x98, 0x66, 0x1F,       # 7DDB: JMP T,661Fh
    ], "22:7DD2 Mist transform Carry check and 80-frame duration helper")

    # Fix 3B: Reduce Bat & Mist MP drain from 2 MP every 3rd frame (~40 MP/s)
    # to 1 MP every 8th frame (RD0.#5, ~7.5 MP/s) so Bat can reach high rooms at low level.
    add(0x045913, [
        0x85, 0xD0, 0x0D,       # 7913: BBC RD0,#5,7923h (every 8th frame instead of 3rd)
        0x38, 0x88, 0x02, 0x74, # 7916: MOV R1,@0274h
        0x52, 0x01, 0x01,       # 791A: SUB R1,#01h (1 MP instead of 2)
    ], "22:7913 Reduce Mist MP drain to 1 MP every 8th frame")

    add(0x04593C, [
        0x85, 0xD0, 0x0D,       # 793C: BBC RD0,#5,794Ch (every 8th frame instead of 3rd)
        0x38, 0x88, 0x02, 0x74, # 793F: MOV R1,@0274h
        0x52, 0x01, 0x01,       # 7943: SUB R1,#01h (1 MP instead of 2)
    ], "22:793C Reduce Bat MP drain to 1 MP every 8th frame")

    # =========================================================================
    # 4. ALUCARD MOVEMENT, JUMP, DOUBLE JUMP & BACKDASH PHYSICS (Bank 0x22 & 0x29)
    # =========================================================================
    # Fix 4A: Remove 4-frame walk startup freeze in Act 02 (0x052007) and boost walk speed
    # from +4 to +5 px/step across Act 02 and Act 03 (0x052038).
    act02_new = bytearray(orig[0x052007:0x052007 + 8 * 6])
    for i in range(8):
        act02_new[i * 6 + 0] = 5  # dx = +5
        act02_new[i * 6 + 3] = 1  # duration = 1 (removes t=3 freeze on frame 0!)
    add(0x052007, act02_new, "29:8007 (Act 02 Walk Start): remove 4-frame startup freeze and set dx=+5")

    act03_new = bytearray(orig[0x052038:0x052038 + 12 * 6])
    for i in range(12):
        act03_new[i * 6 + 0] = 5  # dx = +5
    add(0x052038, act03_new, "29:8038 (Act 03 Walk Loop): increase walk speed from +4 to +5 px/step")

    # Fix 4B: Improve Normal Jump (Act 05 at 0x052128, 19 keyframes) for responsive height & reach
    # Original: 12x(+5,-5), 4x(+6,-5), 3x(+4,0) -> dx=+96, dy=-80
    # New:      12x(+6,-6), 4x(+6,-5), 3x(+5,-2) -> dx=+111, dy=-98 (clears Long Library gap & ledges cleanly!)
    act05_new = bytearray(orig[0x052128:0x052128 + 19 * 6])
    for i in range(12):
        act05_new[i * 6 + 0] = 6
        act05_new[i * 6 + 1] = s8(-6)
    for i in range(12, 16):
        act05_new[i * 6 + 0] = 6
        act05_new[i * 6 + 1] = s8(-5)
    for i in range(16, 19):
        act05_new[i * 6 + 0] = 5
        act05_new[i * 6 + 1] = s8(-2)
    add(0x052128, act05_new, "29:8128 (Act 05 Jump Forward): boost arc from (+96,-80) to (+111,-98)")

    # Fix 4C: Improve Vertical/Super Jump (Act 07 at 0x0520B3, 9 keyframes)
    # Original: 1x(0,0), 8x(0,-6) -> dy=-48
    # New:      9x(0,-9) -> dy=-81
    act07_new = bytearray(orig[0x0520B3:0x0520B3 + 9 * 6])
    for i in range(9):
        act07_new[i * 6 + 1] = s8(-9)
    add(0x0520B3, act07_new, "29:80B3 (Act 07 Vertical/Super Jump): boost vertical rise from -48 to -81 px")

    # Fix 4D: Fix Leap Stone Double Jump (Act 06 at 0x052088, 7 keyframes)
    # Original: 1x(0,0,t=2), 6x(+4,-6,t=1) -> dx=+24, dy=-36 (anemic!)
    # New:      7x(+6,-10,t=1) -> dx=+42, dy=-70 (proper full double jump with zero startup lag!)
    act06_new = bytearray(orig[0x052088:0x052088 + 7 * 6])
    for i in range(7):
        act06_new[i * 6 + 0] = 6
        act06_new[i * 6 + 1] = s8(-10)
        act06_new[i * 6 + 3] = 1
    add(0x052088, act06_new, "29:8088 (Act 06 Double Jump): remove t=2 pause and boost arc from (+24,-36) to (+42,-70)")

    # Fix 4E: Allow Leap Stone Double Jump to trigger during Jump Forward (Act 05 after keyframe 4),
    # Jump Apex (Act 08), and Falling (Act 09 / Act 0A), and fix 22:6274 so holding/pressing C in
    # Act 05 does not reset RE4.#2 (double-jump used flag).
    add(0x044274, [
        0xFF, 0xFF,             # 6274: NOPx2 (do not BCLR RE4,#2 during Act 05; landing at 69A1 clears it!)
    ], "22:6274 Do not clear RE4.#2 in midair during Act 05")

    add(0x044ADF, [
        0x98, 0x7D, 0x30,       # 6ADF: JMP T,7D30h
    ], "22:6ADF Allow Double Jump from Act 05 (rising/peak), Act 08 (apex), Act 09, and Act 0A")

    add(0x045D30, [
        0x50, 0x05, 0x04,       # 7D30: CMP R4,#05h
        0xD6, 0x0D,             # 7D33: BR Z,7D42h
        0x50, 0x08, 0x04,       # 7D35: CMP R4,#08h
        0xD6, 0x11,             # 7D38: BR Z,7D4Bh
        0x50, 0x09, 0x04,       # 7D3A: CMP R4,#09h
        0xD6, 0x0C,             # 7D3D: BR Z,7D4Bh
        0x98, 0x6A, 0xE4,       # 7D3F: JMP T,6AE4h (checks CMP R4,#0Ah)
        0x38, 0x98, 0x02, 0x89, # 7D42: MOV R3,@0289h
        0x50, 0x04, 0x03,       # 7D46: CMP R3,#04h
        0xD7, 0x03,             # 7D49: BR C,7D4Eh
        0x98, 0x6A, 0xEA,       # 7D4B: JMP T,6AEAh (triggers Act 06 if Leap Stone owned!)
        0xF8,                   # 7D4E: RET
    ], "22:7D30 Expanded midair window for Leap Stone Double Jump")

    # Fix 4F: Improve Falling horizontal control (Act 09 at 0x052109)
    # Increase horizontal speed during forward fall from +4/+1 to +5/+4 so Alucard doesn't drop like a stone at jump end
    act09_new = bytearray(orig[0x052109:0x052109 + 5 * 6])
    for i in range(4):
        act09_new[i * 6 + 0] = 5
    act09_new[4 * 6 + 0] = 4
    add(0x052109, act09_new, "29:8109 (Act 09 Fall Forward): improve horizontal momentum at end of jump")

    # Fix 4G: Faster Bat & Mist flight speed (Bank 0x36)
    # Increase Bat flight speed from 3 px/step to 4 px/step (36:9905, 9936, 9967, 9998, 99C9)
    # and Mist drift speed from 3 px/step to 4 px/step (36:9A19..9A35)
    for base_off, dx, dy in [
        (0x06D905, +4,  0),
        (0x06D936,  0, -4),
        (0x06D967, +4, -4),
        (0x06D998,  0, +4),
        (0x06D9C9, +4, +4),
    ]:
        bat_kf = bytearray(orig[base_off:base_off + 8 * 6])
        for i in range(8):
            bat_kf[i * 6 + 0] = s8(dx)
            bat_kf[i * 6 + 1] = s8(dy)
        add(base_off, bat_kf, f"36:{0x8000+(base_off&0x1FFF):04X} Boost Bat flight speed to ({dx:+d},{dy:+d})")

    for base_off, dx, dy in [
        (0x06DA19, +4,  0),
        (0x06DA20,  0, +4),
        (0x06DA27,  0, -4),
        (0x06DA2E, +4, +4),
        (0x06DA35, +4, -4),
    ]:
        mist_kf = bytearray(orig[base_off:base_off + 6])
        mist_kf[0] = s8(dx)
        mist_kf[1] = s8(dy)
        add(base_off, mist_kf, f"36:{0x8000+(base_off&0x1FFF):04X} Boost Mist drift speed to ({dx:+d},{dy:+d})")

    # =========================================================================
    # 5. SPELLS MENU & D-PAD CARDINAL SPELL INPUTS (Bank 0x22 & Bank 0x37)
    # =========================================================================
    # Fix 5A: Unlock all 4 spells in gameplay and Pause -> Spells menu from Level 1
    add(0x0448B2, [1, 1, 1, 1, 1], "22:68B2 Unlock all spells from Level 1")
    add(0x06E76D, [1, 1, 1, 1], "37:676D Display all 4 spells in Pause -> Spells menu from Level 1")

    # Fix 5B: Replace diagonal-heavy spell sequences at 22:68CF..690D with reliable
    # cardinal D-pad sequences while keeping the exact same pointer addresses!
    # Facing Right:
    #   Spell #1 (Hellfire, 22:68CF, 6 bytes):      Up -> Down -> Right -> Right+A [FF] Right+B
    add(0x0448CF, [0x01, 0x02, 0x08, 0x88, 0xFF, 0x48], "22:68CF Hellfire (Right): Up, Down, Right, Right+A/B")
    #   Spell #2 (Summon Spirit, 22:68D5, 7 bytes): Left -> Right -> Up -> Down -> Down+A [FF] Down+B (already cardinal!)
    #   Spell #3 (Soul Steal, 22:68DC, 9 bytes):    Left -> Right -> Down -> Right -> Right+A [FF] Right+B (padded with FF)
    add(0x0448DC, [0x04, 0x08, 0x02, 0x08, 0x88, 0xFF, 0x48, 0xFF, 0xFF], "22:68DC Soul Steal (Right): Left, Right, Down, Right, Right+A/B")
    #   Spell #4 (Tetra Spirit, 22:68E5, 8 bytes):  Up -> Right -> Down -> Down+A [FF] Down+B
    add(0x0448E5, [0x01, 0x08, 0x02, 0x82, 0xFF, 0x42, 0xFF, 0xFF], "22:68E5 Tetra Spirit (Right): Up, Right, Down, Down+A/B")

    # Facing Left:
    #   Spell #1 (Hellfire, 22:68F1, 6 bytes):      Up -> Down -> Left -> Left+A [FF] Left+B
    add(0x0448F1, [0x01, 0x02, 0x04, 0x84, 0xFF, 0x44], "22:68F1 Hellfire (Left): Up, Down, Left, Left+A/B")
    #   Spell #3 (Soul Steal, 22:68FE, 9 bytes):    Right -> Left -> Down -> Left -> Left+A [FF] Left+B
    add(0x0448FE, [0x08, 0x04, 0x02, 0x04, 0x84, 0xFF, 0x44, 0xFF, 0xFF], "22:68FE Soul Steal (Left): Right, Left, Down, Left, Left+A/B")
    #   Spell #4 (Tetra Spirit, 22:6907, 8 bytes):  Up -> Left -> Down -> Down+A [FF] Down+B
    add(0x044907, [0x01, 0x04, 0x02, 0x82, 0xFF, 0x42, 0xFF, 0xFF], "22:6907 Tetra Spirit (Left): Up, Left, Down, Down+A/B")

    # Also increase spell input timeout at 22:6794 from 0x2D (45 frames) to 0x46 (70 frames)
    add(0x044795, [0x46], "22:6795 Increase spell input window from 45 to 70 frames")
    add(0x04474F, [0x98, 0x7D, 0xA0, 0xFF], "22:674F Reset spell timeout and preserve matched spell step during brief neutral D-pad release")
    add(0x045DA0, [
        0x38, 0x88, 0x02, 0x83, # 7DA0: MOV R1,@0283h (preserve 674Dh: FA F8 = CLRC; RET!)
        0x50, 0x01, 0x01,       # 7DA4: CMP R1,#01h
        0x9E, 0x67, 0x4D,       # 7DA7: JMP NZ,674Dh
        0x38, 0x80, 0x02, 0x20, # 7DAA: MOV R0,@0220h
        0x50, 0x00, 0x00,       # 7DAE: CMP R0,#00h
        0x9E, 0x67, 0x58,       # 7DB1: JMP NZ,6758h
        0x00, 0xE5,             # 7DB4: CLR RE5 (timeout expired -> clear stale spell step!)
        0x98, 0x67, 0x58,       # 7DB6: JMP T,6758h
        0x18, 0x04,             # 7DB9: INCW RR4 (point to B-button final byte after 0xFF)
        0x38, 0x04,             # 7DBB: MOV R0,@RR4
        0x40, 0xD9, 0x00,       # 7DBD: CMP R0,RD9
        0x96, 0x68, 0x27,       # 7DC0: JMP Z,6827h (matched B-button final byte!)
        0x6A, 0x04, 0x00, 0x03, # 7DC3: SUBW RR4,#0003h (reach prev step @ (RR4-1))
        0x38, 0x04,             # 7DC7: MOV R0,@RR4
        0x40, 0xD9, 0x00,       # 7DC9: CMP R0,RD9
        0x96, 0x68, 0x1C,       # 7DCC: JMP Z,681Ch (if holding prev step right before 0xFF, wait!)
        0x98, 0x67, 0xD0,       # 7DCF: JMP T,67D0h (otherwise check fallback table)
    ], "22:7DA0 Clear stale RE5 on timeout and allow holding last D-pad step before final A/B press")
    add(0x044806, [
        0x98, 0x7D, 0xB9,       # 6806: JMP T,7DB9h
    ], "22:6806 Check held previous step before final 0xFF spell step")
    add(0x04490F, [
        0x04, 0x03, 0xFF, 0xFF, 0xFF, 0xFF,
        0x0A, 0x09, 0xFF, 0xFF, 0xFF, 0xFF,
    ], "22:690F Keep prefix fallback #1->#4 and #2->#3 while removing #3->#4 and #4->#5 collisions")

    # =========================================================================
    # 6. BOSS & SUBWEAPON FIXES (Bank 0x22, Bank 0x23, Bank 0x36, Bank 0x39)
    # =========================================================================
    # Fix 6A: Richter Belmont finite HP (800 HP instead of 65,535 HP at 23:6B25)
    # and check HP in Richter's AI (39:72C8) so defeating Richter without Holy Glasses finishes the fight!
    add(0x046B25, [0x03, 0x20], "23:6B25 Set Richter Belmont HP to 800 (0x0320) instead of 65535 (0xFFFF)")

    add(0x0732C8, [
        0x49, 0x7B, 0xE0,       # 72C8: CALL 7BE0h
        0xFF,                   # 72CB: NOP
    ], "39:72C8 Check Richter HP and trigger fight end when defeated")

    add(0x073BE0, [
        0x49, 0x48, 0x32,       # 7BE0: CALL 4832h
        0xD6, 0x0D,             # 7BE3: BR Z,7BF2h
        0x49, 0x47, 0xE2,       # 7BE5: CALL 47E2h (apply damage & check if HP <= 0)
        0xDF, 0x02,             # 7BE8: BR NC,7BECh
        0x98, 0x73, 0xDF,       # 7BEA: JMP T,73DFh (Richter defeated -> end fight!)
        0xB0, 0xDD,             # 7BEC: MOV R0,RDD
        0xFA,                   # 7BEE: CLRC
        0x98, 0x72, 0xCD,       # 7BEF: JMP T,72CDh
        0x98, 0x72, 0xDB,       # 7BF2: JMP T,72DBh
    ], "39:7BE0 Richter damage & defeat handler")

    # Fix 6B: Prevent Bat Familiar from damaging/killing Dracula during Shaft's death cutscene (39:76E5)
    add(0x0736E5, [
        0x98, 0x7B, 0xF6,       # 76E5: JMP T,7BF6h
    ], "39:76E5 Protect Dracula from Bat Familiar damage during intro cutscene")

    add(0x073BF6, [
        0x87, 0xD2, 0x06,       # 7BF6: BBC RD2,#7,7BFFh (if in cutscene, clear hit flags & skip)
        0x49, 0x48, 0x22,       # 7BF9: CALL 4822h
        0x98, 0x76, 0xE8,       # 7BFC: JMP T,76E8h
        0x00, 0x04,             # 7BFF: CLR R4
        0x39, 0xA0, 0x02, 0xFB, # 7C01: MOV @02FBh,R4
        0x39, 0xA0, 0x02, 0xFC, # 7C05: MOV @02FCh,R4
        0x98, 0x77, 0x28,       # 7C09: JMP T,7728h
    ], "39:7BF6 Clear pending familiar/weapon hit flags on Dracula during cutscene")

    # Fix 6C: Fix Stopwatch subweapon duration bug (22:7110 & 22:7156)
    # Skip decrementing $02E6 while RE4.#7 is 0 (State 1), and set $02E6 = 0x78 (120 frames = 2 sec) on State 2 start!
    add(0x045110, [
        0x87, 0xE4, 0x0C,       # 7110: BBC RE4,#7,711Fh (only decrement $02E6 once RE4.#7 is active!)
        0x38, 0xA0, 0x02, 0xE6, # 7113: MOV R4,@02E6h
        0x09, 0x04,             # 7117: DEC R4
        0x39, 0xA0, 0x02, 0xE6, # 7119: MOV @02E6h,R4
        0xD6, 0x41,             # 711D: BR Z,7160h
    ], "22:7110 Only decrement Stopwatch timer $02E6 when time-stop RE4.#7 is active")

    add(0x045156, [
        0xC0, 0x78,             # 7156: MOV R0,#78h (120 frames = 2 seconds)
    ], "22:7156 Set Stopwatch time-stop duration to 120 frames (0x78)")

    # Fix 6D: Improve Axe subweapon forward throwing arc (36:96EC, file 0x06D6EC)
    axe_s2 = bytearray(orig[0x06D6EC:0x06D6EC + 12 * 5])
    for i in range(4):
        axe_s2[i * 5 + 0] = 5   # dx = +5 (was +2)
    for i in range(4, 12):
        axe_s2[i * 5 + 0] = 5   # dx = +5 (was +4)
    add(0x06D6EC, axe_s2, "36:96EC (Proj 03 Axe State 2): widen forward parabolic arc dx to +5")

    axe_s3 = bytearray(orig[0x06D729:0x06D729 + 8 * 5])
    for i in range(8):
        axe_s3[i * 5 + 0] = 4   # dx = +4 (was +2)
    add(0x06D729, axe_s3, "36:9729 (Proj 03 Axe State 3): widen falling forward arc dx to +4")

    # =========================================================================
    # 7. TEXT & TYPO FIXES (Bank 0x38, exact in-place lengths)
    # =========================================================================
    add(0x0707D9, b"Clan? \xff", "38:87D9 Fix 'Belmont Chlan?' -> 'Belmont Clan? '")
    add(0x071734, b"Elixir\xff", "38:9734 Fix 'Elixer' -> 'Elixir'")
    add(0x07173B, b"Library card\xff", "38:973B Fix 'Libaray card' -> 'Library card'")
    add(0x071779, b"Sirloin\xff", "38:9779 Fix 'Sirlion' -> 'Sirloin'")
    add(0x07184B, b"Diamond mail\xff", "38:984B Fix 'Diamon plate' -> 'Diamond mail'")
    add(0x07197E, b"Goddess shield \xff", "38:997E Fix 'Goddness shield' -> 'Goddess shield '")
    add(0x071B8D, b"1 of 5 Treasures. INT +10\xff", "38:9B8D Fix Ring of Vlad description 'STR +10' -> 'INT +10'")
    add(0x071BD1, b"Tetra Spirit \xff", "38:9BD1 Fix 'Tertra Spirit' -> 'Tetra Spirit '")

    return edits


def main():
    if not os.path.exists(ORIG_ROM):
        print(f"Error: original prototype ROM not found at {ORIG_ROM}", file=sys.stderr)
        sys.exit(1)

    with open(ORIG_ROM, "rb") as f:
        orig = f.read()

    edits = make_edits(orig)
    with open(EDITS_JSON, "w", encoding="utf-8") as f:
        json.dump(edits, f, indent=2)
    print(f"Wrote {len(edits)} edits to {EDITS_JSON}")

    os.makedirs(PATCH_DIR, exist_ok=True)
    cvpatch = os.path.join(ROOT, "tools", "cv_patch", "cvpatch.py")

    # Apply edits to build local patched ROM
    subprocess.run([sys.executable, cvpatch, "edits", ORIG_ROM, EDITS_JSON, PATCHED_ROM], check=True)

    # Build versioned (v0.1) and canonical .bps / .ips patches and self-verify
    versioned_base = os.path.join(PATCH_DIR, f"Castlevania - Symphony of the Night Reborn-v{REBORN_VERSION}")
    canonical_base = os.path.join(PATCH_DIR, "Castlevania - Symphony of the Night Reborn")
    subprocess.run([sys.executable, cvpatch, "build", ORIG_ROM, PATCHED_ROM, versioned_base], check=True)
    for ext in (".bps", ".ips"):
        shutil.copy2(versioned_base + ext, canonical_base + ext)

    # Stage canonical .ips into public/patches/ for runtime auto-patching in Cub Spiele.Com
    os.makedirs(PUBLIC_PATCH_DIR, exist_ok=True)
    shutil.copy2(IPS_OUT, os.path.join(PUBLIC_PATCH_DIR, "Castlevania - Symphony of the Night Reborn.ips"))

    # Copy & auto-patch Castlevania prototype in local roms/ if found
    nointro_dir = os.path.join(ROOT, "roms", "NOINTRO Game.com")
    proto_candidates = [
        os.path.join(nointro_dir, "Castlevania - Symphony of the Night (Unknown) (Proto).zip"),
        os.path.join(nointro_dir, "Castlevania - Symphony of the Night (Unknown) (Proto).tgc"),
        os.path.join(ROOT, "roms", "TOSEC Game.com", "Castlevania - Symphony of the Night (1998)(Konami)(proto).zip"),
    ]
    for cand in proto_candidates:
        if os.path.exists(cand):
            out_dir = os.path.dirname(cand)
            out_tgc = os.path.join(out_dir, f"Castlevania - Symphony of the Night Reborn (v{REBORN_VERSION}).tgc")
            out_zip = os.path.join(out_dir, f"Castlevania - Symphony of the Night Reborn (v{REBORN_VERSION}).zip")
            proto_tmp = PATCHED_ROM + ".proto_tmp"
            if cand.lower().endswith(".zip"):
                with zipfile.ZipFile(cand, "r") as zf:
                    rom_members = [m for m in zf.namelist() if m.lower().endswith((".tgc", ".bin", ".rom"))]
                    if not rom_members:
                        continue
                    with open(proto_tmp, "wb") as pf:
                        pf.write(zf.read(rom_members[0]))
            else:
                shutil.copy2(cand, proto_tmp)
            subprocess.run([sys.executable, cvpatch, "edits", proto_tmp, EDITS_JSON, out_tgc], check=True)
            os.remove(proto_tmp)
            with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(out_tgc, arcname=os.path.basename(out_tgc))
            print(f"Auto-patched prototype -> {out_tgc} & {out_zip}")
            break

    # Print info on the patched ROM
    subprocess.run([sys.executable, cvpatch, "info", PATCHED_ROM], check=True)


if __name__ == "__main__":
    main()




