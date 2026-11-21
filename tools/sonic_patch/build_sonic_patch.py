#!/usr/bin/env python3
"""
Sonic Jam Reborn — ROM Patch Builder
====================================
Builds:
  - `patches/Sonic Jam Reborn-v0.1.bps` (CRC32-verified BPS)
  - `patches/Sonic Jam Reborn-v0.1.ips` (IPS)
  - `tools/sonic_patch/work/Sonic Jam Reborn.tgc` (local test ROM)

All patches are 100% Sharp SM8521 / Tiger Game.com hardware-compatible.
"""
import os
import struct
import zipfile
import zlib

VERSION = "0.2"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ORIG_ZIP = os.path.join(ROOT, "roms", "NOINTRO Game.com", "Sonic Jam (USA).zip")
PATCHED_ROM = os.path.join(ROOT, "tools", "sonic_patch", "work", "Sonic Jam Reborn.tgc")
PATCH_DIR = os.path.join(ROOT, "patches")
PUBLIC_PATCH_DIR = os.path.join(ROOT, "public", "patches")
PUBLIC_IPS_OUT = os.path.join(PUBLIC_PATCH_DIR, "Sonic Jam Reborn.ips")
BPS_OUT = os.path.join(PATCH_DIR, f"Sonic Jam Reborn-v{VERSION}.bps")
IPS_OUT = os.path.join(PATCH_DIR, f"Sonic Jam Reborn-v{VERSION}.ips")


def encode_bps_number(n: int) -> bytes:
    out = bytearray()
    while True:
        x = n & 0x7F
        n >>= 7
        if n == 0:
            out.append(0x80 | x)
            return bytes(out)
        out.append(x)
        n -= 1


def build_bps(src: bytes, dst: bytes) -> bytes:
    assert len(src) == len(dst)
    out = bytearray(b"BPS1")
    out += encode_bps_number(len(src))
    out += encode_bps_number(len(dst))
    out += encode_bps_number(0)

    i = 0
    n = len(src)
    while i < n:
        # Find run of matching bytes
        run_start = i
        while i < n and src[i] == dst[i]:
            i += 1
        if i > run_start:
            length = i - run_start
            out += encode_bps_number(((length - 1) << 2) | 0)  # SourceRead
        if i >= n:
            break
        # Find run of differing bytes
        diff_start = i
        while i < n and src[i] != dst[i]:
            i += 1
        length = i - diff_start
        out += encode_bps_number(((length - 1) << 2) | 1)  # TargetRead
        out += dst[diff_start:i]

    out += struct.pack("<III", zlib.crc32(src) & 0xFFFFFFFF, zlib.crc32(dst) & 0xFFFFFFFF, 0)
    # Patch CRC32 over everything before the final 4 bytes
    patch_crc = zlib.crc32(out[:-4]) & 0xFFFFFFFF
    out[-4:] = struct.pack("<I", patch_crc)
    return bytes(out)


def build_ips(src: bytes, dst: bytes) -> bytes:
    assert len(src) == len(dst)
    out = bytearray(b"PATCH")
    i = 0
    n = len(src)
    while i < n:
        if src[i] == dst[i]:
            i += 1
            continue
        start = i
        while i < n and src[i] != dst[i] and (i - start) < 0xFFFF:
            i += 1
        if start == 0x454F46:  # "EOF" guard
            start -= 1
        size = i - start
        out += struct.pack(">I", start)[1:] + struct.pack(">H", size) + dst[start:i]
    out += b"EOF"
    return bytes(out)


def apply_edits(orig: bytes) -> bytearray:
    rom = bytearray(orig)

    # 1. Ground acceleration (all characters): every 2 ticks instead of 8, +3 speed per step,
    #    and higher initial Walk base speed (5..7 instead of 1..3) at shared table 0x4E0F9
    assert rom[0x52873:0x52876] == b"\x55\x07\x01"
    rom[0x52874] = 0x01
    assert rom[0x52881:0x52888] == b"\x86\x00\x02\x08\x01\x08\x01"
    rom[0x52881:0x52888] = bytes.fromhex("510301ffffffff")
    assert rom[0x4E0F9:0x4E105] == bytes.fromhex("410043004300430000004300")
    rom[0x4E0F9:0x4E105] = bytes.fromhex("450047004700470000004700")

    # 2. Midair horizontal steering (all characters): every 2 ticks instead of 16
    assert rom[0x52994:0x52997] == b"\x55\x0f\x00"
    rom[0x52995] = 0x01

    # 3. Forward camera lead (+29px forward vision: deadzone 68..88 instead of 83..117)
    for off in (0x47C4E, 0x47C66, 0x47C6F, 0x47C86):
        assert rom[off] == 0x53
        rom[off] = 0x44
    for off in (0x47C54, 0x47C8A, 0x47CA0, 0x47CA6):
        assert rom[off] == 0x75
        rom[off] = 0x58

    # 4. Map BOTH A (0x10) and B (0x20) to Jump/Ability
    assert rom[0x46000:0x46012] == bytes.fromhex("3880021438880216b001550f00840102af00")
    rom[0x46000:0x46012] = bytes.fromhex("38880216b001550f002f0130d602af00ffff")

    # 5. Knuckles Glide (st 21)
    assert rom[0x4610E:0x46118] == bytes.fromhex("89e00e38a8020a8005dc")
    rom[0x4610E:0x46118] = bytes.fromhex("2fe003de0c9860f4ffff")

    assert rom[0x46129:0x4612D] == bytes.fromhex("388002b7")
    rom[0x46129:0x4612C] = bytes.fromhex("985f7d")

    glide_code = bytes.fromhex(
        "88e016"
        "388002b7"
        "505000"
        "d305"
        "c622"
        "986118"
        "00e2"
        "58efe4"
        "98613b"
        "8fe405"
        "00e2"
        "5802e4"
        "8aea08"
        "8bea15"
        "8aec0b"
        "d819"
        "8aec06"
        "c003"
        "398002e3"
        "aaec"
        "5896e1"
        "d80e"
        "82ec06"
        "c003"
        "398002e3"
        "a2ec"
        "5816e1"
        "388002e3"
        "1600"
        "d606"
        "0900"
        "398002e3"
        "b8e7"
        "98613b"
    )
    assert all(b in (0x00, 0xFF) for b in rom[0x41F7D : 0x41F7D + len(glide_code)])
    rom[0x41F7D : 0x41F7D + len(glide_code)] = glide_code

    # Knuckles st 21 descriptor: attack flag RED=0xB0 (bit 5 set for jump-attack damage/bounce),
    # custom S3&K Glide sprite (9F50), and custom release-to-fall table (9F40)
    assert rom[0x4ECEA:0x4ECF2] == bytes.fromhex("00908259826b82c1")
    rom[0x4ECEA:0x4ECF2] = bytes.fromhex("00b09f50826b9f40")

    # Bounce player upward (RE2=0, RE4=#E8h) when destroying a badnik midair (0x4D326 -> 0x41FEA)
    assert rom[0x4D326:0x4D329] == bytes.fromhex("4949af")
    rom[0x4D326:0x4D329] = bytes.fromhex("495fea")
    bounce_hook = bytes.fromhex("8bec03" "9849af" "00e2" "58e8e4" "9849af")
    assert all(b in (0x00, 0xFF) for b in rom[0x41FEA : 0x41FEA + len(bounce_hook)])
    rom[0x41FEA : 0x41FEA + len(bounce_hook)] = bounce_hook

    assert all(b in (0x00, 0xFF) for b in rom[0x4FF40:0x4FF45])
    rom[0x4FF40:0x4FF45] = bytes.fromhex("02a0088021")

    # 6. Trim Bank 0x24 Ring-loop CPU overhead (0x482B8 -> 0x49B16 coarse +/-64px early-out)
    assert rom[0x482B8:0x482BB] == bytes.fromhex("4afcf2")
    rom[0x482B8:0x482BB] = bytes.fromhex("987b16")
    ring_opt = bytes.fromhex(
        "4afc02" "620c02" "69020040" "68020080" "df16"
        "4afe02" "620e02" "69020040" "68020080" "df06"
        "4afcf2" "9862bb"
        "faf8"
    )
    assert all(b in (0x00, 0xFF) for b in rom[0x49B16 : 0x49B16 + len(ring_opt)])
    rom[0x49B16 : 0x49B16 + len(ring_opt)] = ring_opt

    # 7. Tame harsh SFX: mute grating Spin DAC (#83h) at 0x46151..0x46155
    assert rom[0x46151:0x46156] == bytes.fromhex("c58349488a")
    rom[0x46151:0x46156] = bytes.fromhex("ffffffffff")

    # 8. Fix all 53 solid-embedded rings across Stages 0..11 in Bank 0x2C (0x58000)
    def s16(buf: bytes, off: int) -> int:
        v = (buf[off] << 8) | buf[off + 1]
        return v - 0x10000 if v & 0x8000 else v

    fixed_rings = 0
    for st in range(12):
        meta = 0x4E630 + st * 13
        bank = rom[meta]
        hptr = (rom[meta + 1] << 8) | rom[meta + 2]
        col_tbl_ptr = (rom[meta + 11] << 8) | rom[meta + 12]
        hoff = bank * 0x2000 + (hptr - 0x8000)
        nchunks = rom[hoff + 4]
        solids = []
        for i in range(nchunks):
            c = hoff + 5 + i * 6
            cp = (rom[c] << 8) | rom[c + 1]
            cx = s16(rom, c + 2)
            cy = s16(rom, c + 4)
            coff = bank * 0x2000 + (cp - 0x8000)
            nsub = rom[coff + 4]
            for j in range(nsub):
                s = coff + 5 + j * 5
                tid = rom[s]
                dx = s16(rom, s + 1)
                dy = s16(rom, s + 3)
                tptr_off = 0x5C000 + (col_tbl_ptr - 0x8000) + tid * 2
                bptr = (rom[tptr_off] << 8) | rom[tptr_off + 1]
                boff = 0x5C000 + (bptr - 0x8000)
                bcnt = rom[boff]
                for k in range(bcnt):
                    bo = boff + 1 + k * 7
                    if rom[bo] & 0x10:
                        continue
                    bx = s16(rom, bo + 1)
                    by = s16(rom, bo + 3)
                    bw = rom[bo + 5]
                    bh = rom[bo + 6]
                    if bw > 0 and bh > 0:
                        solids.append((cx + dx + bx, cy + dy + by, cx + dx + bx + bw, cy + dy + by + bh))

        rptr = (rom[0x4847C + st * 2] << 8) | rom[0x4847C + st * 2 + 1]
        roff = 0x58000 + (rptr - 0x8000)
        rcnt = rom[roff]
        for i in range(rcnt):
            ro = roff + 1 + i * 4
            rx = (rom[ro] << 8) | rom[ro + 1]
            ry = (rom[ro + 2] << 8) | rom[ro + 3]
            for x0, y0, x1, y1 in solids:
                if x0 <= rx <= x1 and y0 <= ry <= y1:
                    if ry - y0 <= 40:
                        ry = max(16, y0 - 16)
                    elif (rx - x0) < (x1 - rx):
                        rx = max(16, x0 - 20)
                    else:
                        rx = x1 + 20
                    rom[ro : ro + 4] = struct.pack(">HH", rx, ry)
                    fixed_rings += 1
                    break

    assert fixed_rings == 53, f"expected 53 embedded rings, got {fixed_rings}"

    # 9. Always ascend on type-0x01 elevator segments (@023Ch == 1) even if D-pad is held
    assert rom[0x52740:0x52746] == bytes.fromhex("2fea0c966839")
    rom[0x52743] = 0x98  # JMP Z, 6839h -> JMP T, 6839h

    # 11. 2-bpp LCD Readability: boost foreground sprite/ring/hazard contrast via DMPL (R3B = 0xF8) in 4ADAh
    assert rom[0x40B43:0x40B47] == bytes.fromhex("3e484653")
    rom[0x40B43:0x40B47] = bytes.fromhex("985fdaff")
    pal_code = bytes.fromhex("7a5fe6" "1e02" "58f83b" "3e484653" "58e43bf8")
    assert all(b in (0x00, 0xFF) for b in rom[0x41FDA : 0x41FDA + len(pal_code)])
    rom[0x41FDA : 0x41FDA + len(pal_code)] = pal_code

    # 11b. Custom S3&K Glide sprite for Knuckles (47x24 on LCD, transposed 24x47 in dmbr 0x50/0x51)
    #      Darker Idle-matched Sonic Jam palette: rows0 (2=dark gray main fur, 1=light gray highlights/muzzle/glove shading, 3=black outlines/dreadlock lines)
    #      + rows1 (dmbr 0x51 opaque white gloves, eye sclera, forehead highlight & shoe highlight)
    rows0 = [
        (0, "0000000095b0"), (1, "0000000245b0"), (2, "0000000255b0"), (3, "0000000696b0"),
        (4, "000000076ab0"), (5, "0000000945c0"), (6, "000000291ec0"), (7, "0000002f1f00"),
        (8, "0000303afb00"), (9, "0000ec3bfc00"), (10, "0003aceef000"), (11, "0003efeef000"),
        (12, "030efefef000"), (13, "0ecfbfbfb000"), (14, "0efbbbbeb000"), (15, "3afebbfbc000"),
        (16, "3afefefec000"), (17, "3aeeeeef0000"), (18, "3aeafffb0000"), (19, "eababbbbc000"),
        (20, "eababbbfc000"), (21, "d6aaaeeec000"), (22, "d6aaaeeeb000"), (23, "d6aaabbfac00"),
        (24, "96aaabbfac00"), (25, "96aaaabc7fc0"), (26, "addaa8fcd57c"), (27, "af1be83f5557"),
        (28, "acfeb8170157"), (29, "eff828cd0055"), (30, "e77a0c14005d"), (31, "37fe0014100c"),
        (32, "3aef00043407"), (33, "0eabf0153013"), (34, "03aae0157074"), (35, "00eaf0125fc0"),
        (36, "003eac505ff0"), (37, "00000fc114dc"), (38, "000003c100d7"), (39, "0000000100d7"),
        (40, "000000003f57"), (41, "000000001517"), (42, "000000030017"), (43, "00000000401c"),
        (44, "00000000c7ff"), (45, "0000000030c3"), (46, "000000000fc0"),
    ]
    rows1 = [
        (1, "000000003000"), (5, "000000003000"), (6, "00000000c000"), (7, "00000000c000"),
        (25, "000000030000"), (26, "000003030000"), (27, "00c003c00000"), (28, "030003c0fc00"),
        (29, "0003c330ff00"), (30, "0000f3c3ff00"), (31, "0000ffc3cff0"), (32, "0000fff3c3f0"),
        (33, "00000fc0cfcc"), (34, "00000fc00f00"), (35, "00000fc00000"), (36, "000003000000"),
        (37, "00000000c300"), (38, "00000000ff00"), (39, "00000000ff00"), (40, "00000003c000"),
        (41, "00000003c0c0"), (42, "00000000ffc0"), (43, "000000003fc0"), (44, "000000003000"),
        (45, "000000000f0c"),
    ]
    assert all(b == 0x00 for b in rom[0x140000:0x140C00])
    assert all(b == 0x00 for b in rom[0x144000:0x144C00])
    for y, hx in rows0:
        b = bytes.fromhex(hx)
        rom[0x140000 + y * 64 : 0x140000 + y * 64 + len(b)] = b
    for y, hx in rows1:
        b = bytes.fromhex(hx)
        rom[0x144000 + y * 64 : 0x144000 + y * 64 + len(b)] = b

    # 11b-2. Front-facing S3&K Glide Turn sprite for Knuckles (32x23 on LCD, transposed at sy=196 in dmbr 0x50/0x51)
    turn_rows0 = [
        (0, "003c2f2c0000"), (1, "00efaeab0000"), (2, "03bebffff514"), (3, "03babfabd3cc"),
        (4, "0ebafabf001c"), (5, "0eeaaafd0004"), (6, "0eebabdc3004"), (7, "3aaaafdcf004"),
        (8, "3aaabffc341c"), (9, "3aa9d15f0570"), (10, "eaa94047c3c0"), (11, "eaa990150000"),
        (12, "ea5a67d5c000"), (13, "a9565a55c000"), (14, "a55596dfc000"), (15, "a515aadfc000"),
        (16, "a55596dfc000"), (17, "a9565a55c000"), (18, "ea5a67d5c000"), (19, "eaa990150000"),
        (20, "eaa94047c3c0"), (21, "3aa9d15f0570"), (22, "3aaabffc341c"), (23, "3aaaafdcf004"),
        (24, "0eebabdc3004"), (25, "0eeaaafd0004"), (26, "0ebafabf001c"), (27, "03babfabd3cc"),
        (28, "03bebffff514"), (29, "00efaeab0000"), (30, "003c2f2b0000"), (31, "000000fc0000"),
    ]
    turn_rows1 = [
        (0, "000000c00000"), (3, "000000000c30"), (4, "00000000ffc0"), (5, "00000000fff0"),
        (6, "00000003cff0"), (7, "000000030ff0"), (8, "00000003c3c0"), (9, "00000c00f000"),
        (10, "00003f303c00"), (11, "00000fc00000"), (15, "00c000000000"), (19, "00000fc00000"),
        (20, "00003f303c00"), (21, "00000c00f000"), (22, "00000003c3c0"), (23, "000000030ff0"),
        (24, "00000003cff0"), (25, "00000000fff0"), (26, "00000000ffc0"), (27, "000000000c30"),
        (30, "000000c00000"),
    ]
    for y, hx in turn_rows0:
        b = bytes.fromhex(hx)
        rom[0x140000 + (196 + y) * 64 : 0x140000 + (196 + y) * 64 + len(b)] = b
    for y, hx in turn_rows1:
        b = bytes.fromhex(hx)
        rom[0x144000 + (196 + y) * 64 : 0x144000 + (196 + y) * 64 + len(b)] = b

    # 11c. Allow scattered rings during active i-frames, keep lost rings on screen 3x longer (59 ticks),
    #      give scattered rings a 30-step falling & multi-bouncing trajectory table at 0x49B40 ($7B40),
    #      and animate their 4-frame spinning ring sprites via 0x49F30 ($7F30)
    assert rom[0x48313:0x48316] == bytes.fromhex("501403")
    rom[0x48314] = 0x3B  # 59 ticks (3x longer than 19)
    assert rom[0x48323:0x4833E] == bytes.fromhex("b0df500c00d605501d00de06b0ed8c0001f8000255fe033aa263da")
    rom[0x4832F:0x48335] = bytes.fromhex("500803df01f8")
    rom[0x4833C:0x4833E] = bytes.fromhex("7b40")
    assert rom[0x4852F:0x48538] == bytes.fromhex("000255fe033aa263da")
    rom[0x48536:0x48538] = bytes.fromhex("7b40")

    # Build 30-step pointer table ($7B40..$7B7B) + 34-row x 7-column falling/bouncing (dX, dY) table ($7B7C..$7D57)
    x0 = [-6, 6, -2, -10, 10, -4, 4]
    vx = [-2.4, 2.4, -0.9, -3.4, 3.4, -1.6, 1.6]
    vy0 = [-14.0, -14.0, -17.0, -12.0, -12.0, -10.0, -10.0]
    g = 5.2
    floor_y = 14.0
    col_trajs = []
    for c in range(7):
        y = -8.0
        vy = vy0[c]
        pts = []
        for t in range(34):
            dx = max(-115, min(115, int(round(x0[c] + vx[c] * t))))
            if dx == 0:
                dx = -1 if c % 2 == 0 else 1
            dy = max(-115, min(115, int(round(y))))
            pts.append((dx, dy))
            y += vy
            if y >= floor_y:
                y = floor_y
                vy = -abs(vy) * 0.75
                if abs(vy) < 4.5:
                    vy = -5.5
            else:
                vy += g
        col_trajs.append(pts)

    bounce_table = bytearray()
    for s in range(30):
        bounce_table += struct.pack(">H", 0x7B7C + s * 14)
    for t in range(34):
        for c in range(7):
            dx, dy = col_trajs[c][t]
            bounce_table += struct.pack("bb", dx, dy)
    bounce_table += b"\x00\x00"
    assert all(b in (0x00, 0xFF) for b in rom[0x49B40 : 0x49B40 + len(bounce_table)])
    rom[0x49B40 : 0x49B40 + len(bounce_table)] = bounce_table

    # Animate scattered rings through the 4 spinning ring frames ($8E06, $8E56, $827B, $8E51) at 0x4856F -> 0x49F30
    assert rom[0x4856F:0x48574] == bytes.fromhex("7c8e510000")
    rom[0x4856F:0x48574] = bytes.fromhex("497f30ffff")
    ring_anim_helper = bytes.fromhex(
        "38800272" "550600" "b300" "0002" "3aa27f42" "0000" "f8"
        "8e06" "8e56" "827b" "8e51"
    )
    assert all(b in (0x00, 0xFF) for b in rom[0x49F30 : 0x49F30 + len(ring_anim_helper)])
    rom[0x49F30 : 0x49F30 + len(ring_anim_helper)] = ring_anim_helper

    # 11d. "AJ RYAN" on Pre-Title Trademark Screen (0x4899F) & "REBORN" on Title Screen (0x52066/0x52089)
    aj_rows = [
        (0, "3ffc"), (1, "c300"), (2, "c300"), (3, "c300"), (4, "3ffc"), (5, "0000"),
        (6, "00f0"), (7, "000c"), (8, "c00c"), (9, "fff0"), (10, "c000"), (11, "0000"),
        (12, "0000"), (13, "0000"), (14, "0000"), (15, "0000"), (16, "fffc"), (17, "c300"),
        (18, "c3c0"), (19, "c330"), (20, "3c0c"), (21, "0000"), (22, "f000"), (23, "0c00"),
        (24, "03fc"), (25, "0c00"), (26, "f000"), (27, "0000"), (28, "3ffc"), (29, "c300"),
        (30, "c300"), (31, "c300"), (32, "3ffc"), (33, "0000"), (34, "fffc"), (35, "3000"),
        (36, "0c00"), (37, "0300"), (38, "fffc"),
    ]
    for y, hx in aj_rows:
        b = bytes.fromhex(hx)
        rom[0x140000 + (64 + y) * 64 : 0x140000 + (64 + y) * 64 + len(b)] = b

    reb_rows = [
        (0, "ffffc0"), (1, "d555c0"), (2, "d555c0"), (3, "df7fc0"), (4, "df7c00"), (5, "df5c00"),
        (6, "df5f00"), (7, "df7700"), (8, "df77c0"), (9, "f5fdc0"), (10, "35cdc0"), (11, "ffffc0"),
        (12, "d555c0"), (13, "d555c0"), (14, "df7dc0"), (15, "df7dc0"), (16, "df7dc0"), (17, "df7dc0"),
        (18, "df7dc0"), (19, "df7dc0"), (20, "dffdc0"), (21, "dc0dc0"), (22, "ffffc0"), (23, "d555c0"),
        (24, "d555c0"), (25, "df7dc0"), (26, "df7dc0"), (27, "df7dc0"), (28, "df7dc0"), (29, "df7dc0"),
        (30, "df7dc0"), (31, "f5d7c0"), (32, "35d700"), (33, "3fff00"), (34, "355700"), (35, "f557c0"),
        (36, "dffdc0"), (37, "dc0dc0"), (38, "dc0dc0"), (39, "dc0dc0"), (40, "dc0dc0"), (41, "dffdc0"),
        (42, "f557c0"), (43, "355700"), (44, "ffffc0"), (45, "d555c0"), (46, "d555c0"), (47, "df7fc0"),
        (48, "df7c00"), (49, "df5c00"), (50, "df5f00"), (51, "df7700"), (52, "df77c0"), (53, "f5fdc0"),
        (54, "35cdc0"), (55, "ffffc0"), (56, "d555c0"), (57, "d555c0"), (58, "f7ffc0"), (59, "37c000"),
        (60, "3dc000"), (61, "0df000"), (62, "0f7000"), (63, "ff7fc0"), (64, "d555c0"), (65, "d555c0"),
        (66, "ffffc0"),
    ]
    for y, hx in reb_rows:
        b = bytes.fromhex(hx)
        rom[0x140000 + (128 + y) * 64 : 0x140000 + (128 + y) * 64 + len(b)] = b

    assert rom[0x4899F:0x489A2] == bytes.fromhex("4955bd")
    rom[0x4899F:0x489A2] = bytes.fromhex("497f00")
    tm_hook = bytes.fromhex(
        "580035" "584036" "580637" "582638" "589339" "58503a" "58e43b" "58503c"
        "58003d" "588234" "f1" "58023d" "588234" "f1"
        "9855bd"
    )
    assert all(b in (0x00, 0xFF) for b in rom[0x49F00 : 0x49F00 + len(tm_hook)])
    rom[0x49F00 : 0x49F00 + len(tm_hook)] = tm_hook

    assert rom[0x52097:0x5209A] == bytes.fromhex("49633a")
    rom[0x52097:0x5209A] = bytes.fromhex("497f00")
    title_hook = bytes.fromhex(
        "49633a"
        "580035" "588036" "580837" "584238" "587839" "58423a" "58e43b" "58503c"
        "58003d" "588234" "f1" "58023d" "588234" "f1"
        "f8"
    )
    assert all(b in (0x00, 0xFF) for b in rom[0x53F00 : 0x53F00 + len(title_hook)])
    rom[0x53F00 : 0x53F00 + len(title_hook)] = title_hook

    # Bank 0x22 sprite headers:
    # - 0x45370 ($9370): 47x24 side-facing Glide sprite at src=(0,0), dmbr=0x50
    # - 0x45375 ($9375): 32x23 front-facing Glide Turn sprite at src=(0,196), dmbr=0x50
    assert all(b in (0x00, 0xFF) for b in rom[0x45370:0x4537A])
    rom[0x45370:0x45375] = bytes.fromhex("2f18000050")
    rom[0x45375:0x4537A] = bytes.fromhex("2017c40050")

    # Bank 0x27 animation entries at 0x4FF50 ($9F50):
    # - RE7=0 ($9F50): side-facing Glide (ptr=9370, xOff=0x17, yOff=0x0C, dur=0x00)
    # - RE7=1..2 ($9F55..$9F5E): front-facing Glide Turn (ptr=9375, xOff=0x10, yOff=0x0C, dur=0x00)
    assert all(b in (0x00, 0xFF) for b in rom[0x4FF50:0x4FF5F])
    rom[0x4FF50:0x4FF55] = bytes.fromhex("9370170c00")
    rom[0x4FF55:0x4FF5F] = bytes.fromhex("9375100c00") * 2

    # 12. Phase 4: Extend post-hit invulnerability frames (0x28 -> 0x4B, ~3.0s)
    assert rom[0x52EC1:0x52EC3] == bytes.fromhex("c328")
    rom[0x52EC2] = 0x4B

    # 13. Phase 5: Reborn header title ("SONIC REB"), isolated NVRAM Game ID ($B73F),
    # and BIOS ID checksum ((0xB7 + 0x3F) & 0xFF) ^ 0xA5 = 0x53 (low nibble 3 = same BIOS security entry as orig cart)
    assert rom[0x40011:0x4001C] == b"Sonic Jam\x042"
    rom[0x40011:0x4001A] = b"SONIC REB"
    rom[0x4001A:0x4001D] = bytes([0xB7, 0x3F, 0x53])
    assert rom[0x400C0:0x400C2] == bytes([0x04, 0x32])
    rom[0x400C0:0x400C2] = bytes([0xB7, 0x3F])
    assert rom[0x402C9:0x402CB] == bytes([0x04, 0x32])
    rom[0x402C9:0x402CB] = bytes([0xB7, 0x3F])

    return rom


def main():
    with zipfile.ZipFile(ORIG_ZIP) as z:
        orig = z.read(z.namelist()[0])

    patched = bytes(apply_edits(orig))
    os.makedirs(os.path.dirname(PATCHED_ROM), exist_ok=True)
    os.makedirs(PATCH_DIR, exist_ok=True)

    with open(PATCHED_ROM, "wb") as f:
        f.write(patched)
    with open(BPS_OUT, "wb") as f:
        f.write(build_bps(orig, patched))
    with open(IPS_OUT, "wb") as f:
        f.write(build_ips(orig, patched))

    print(f"Built {PATCHED_ROM} ({len(patched)} bytes)")
    print(f"Built {BPS_OUT} ({os.path.getsize(BPS_OUT)} bytes)")
    os.makedirs(PUBLIC_PATCH_DIR, exist_ok=True)
    with open(PUBLIC_IPS_OUT, "wb") as f:
        f.write(build_ips(orig, patched))
    print(f"Built {IPS_OUT} ({os.path.getsize(IPS_OUT)} bytes)")
    print(f"Built {PUBLIC_IPS_OUT} ({os.path.getsize(PUBLIC_IPS_OUT)} bytes)")


if __name__ == "__main__":
    main()
