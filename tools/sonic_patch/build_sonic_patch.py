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

    # 1. Ground acceleration: every 4 frames instead of 8, +2 speed per tick
    assert rom[0x52873:0x52876] == b"\x55\x07\x01"
    rom[0x52874] = 0x03
    assert rom[0x52881:0x52888] == b"\x86\x00\x02\x08\x01\x08\x01"
    rom[0x52883] = 0x00

    # 2. Midair horizontal steering: every 4 frames instead of 16
    assert rom[0x52994:0x52997] == b"\x55\x0f\x00"
    rom[0x52995] = 0x03

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
        "00e2"
        "5802e4"
        "8aea08"
        "8bea0d"
        "8aec02"
        "d808"
        "aaec"
        "5896e1"
        "98613b"
        "a2ec"
        "5816e1"
        "98613b"
    )
    assert all(b in (0x00, 0xFF) for b in rom[0x41F7D : 0x41F7D + len(glide_code)])
    rom[0x41F7D : 0x41F7D + len(glide_code)] = glide_code

    # Knuckles st 21 descriptor: Knuckles air sprite (8CC4) + custom release-to-fall table (9F40)
    assert rom[0x4ECEA:0x4ECF2] == bytes.fromhex("00908259826b82c1")
    rom[0x4ECEA:0x4ECF2] = bytes.fromhex("00909f50826b9f40")

    assert all(b in (0x00, 0xFF) for b in rom[0x4FF40:0x4FF45])
    rom[0x4FF40:0x4FF45] = bytes.fromhex("02a0085021")

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

    # 11. 2-bpp LCD Readability: boost non-player foreground contrast via DMPL (R3B = 0xF8) in 4ADAh,
    #     while keeping player sprites (marked via @02E2h = 1 at 0x4A123/0x4A126) at 0xE4 so Knuckles'
    #     gray body, light muzzle/gloves, and sprite details match his full 4-shade palette.
    assert rom[0x4A123:0x4A129] == bytes.fromhex("9862c04962c0")
    rom[0x4A123:0x4A129] = bytes.fromhex("987f40497f40")
    pdraw_hook = bytes.fromhex("0e00c001398002e20f009862c0")
    assert all(b in (0x00, 0xFF) for b in rom[0x4BF40 : 0x4BF40 + len(pdraw_hook)])
    rom[0x4BF40 : 0x4BF40 + len(pdraw_hook)] = pdraw_hook

    assert rom[0x40B43:0x40B47] == bytes.fromhex("3e484653")
    rom[0x40B43:0x40B47] = bytes.fromhex("985fb8ff")
    pal_code = bytes.fromhex(
        "7a5fd7" "1e02"
        "388002e2" "1600" "d609"
        "0000" "398002e2" "58e43b" "d803"
        "58f83b"
        "3e484653"
        "58e43bf8"
    )
    assert all(b in (0x00, 0xFF) for b in rom[0x41FB8 : 0x41FB8 + len(pal_code)])
    rom[0x41FB8 : 0x41FB8 + len(pal_code)] = pal_code

    # 11b. Custom S3&K Glide sprite for Knuckles (47x24 on LCD, transposed 24x47 in dmbr 0x50)
    #      Authentic 2-bpp palette: 3=black outline/pupil, 2=gray body/dreads/shoe, 1=light muzzle/gloves/chest
    rows0 = [
        (0, "00000000eaf0"), (1, "000000039af0"), (2, "00000003aaf0"), (3, "00000007ebf0"),
        (4, "000000077ff0"), (5, "0000000955c0"), (6, "000000195ec0"), (7, "0000001a5f00"),
        (8, "0000302faf00"), (9, "0000ec3bac00"), (10, "0003aceeb000"), (11, "0003afaeb000"),
        (12, "030ebebef000"), (13, "0ecebebfb000"), (14, "0efababeb000"), (15, "3afabafac000"),
        (16, "3afafafac000"), (17, "3aeaeaeb0000"), (18, "3aeaebeb0000"), (19, "eaaaababc000"),
        (20, "eaaaabafc000"), (21, "eaaaaeaec000"), (22, "eaaaaeaeb000"), (23, "eaaaaabfac00"),
        (24, "aaaaaabf5c00"), (25, "aaaaaabd7fc0"), (26, "aaaaa9bdd57c"), (27, "aa6aa96f5557"),
        (28, "a8bd696f5557"), (29, "eab419dd5555"), (30, "eaa90965555d"), (31, "3aad0165555c"),
        (32, "3aab01557557"), (33, "0eabf5697557"), (34, "03aad56eb574"), (35, "00eab563afc0"),
        (36, "003e99a05ff0"), (37, "00000b8155dc"), (38, "000003c155d7"), (39, "0000000155d7"),
        (40, "000000017f57"), (41, "000000015557"), (42, "000000035557"), (43, "00000000555c"),
        (44, "00000000d7ff"), (45, "0000000035c7"), (46, "000000000fc0"),
    ]
    assert all(b == 0x00 for b in rom[0x140000:0x140C00])
    for y, hx in rows0:
        b = bytes.fromhex(hx)
        rom[0x140000 + y * 64 : 0x140000 + y * 64 + len(b)] = b

    # 11c. Allow rings (including scattered rings during knockback/i-frames) to be collected while i-frames active
    assert rom[0x48323:0x48335] == bytes.fromhex("b0df500c00d605501d00de06b0ed8c0001f8")
    rom[0x48323:0x48335] = b"\xff" * 18

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

    # Bank 0x22 sprite header at 0x45370 ($9370): 47x24 on LCD, src=(0,0), dmbr=0x50
    assert all(b in (0x00, 0xFF) for b in rom[0x45370:0x45375])
    rom[0x45370:0x45375] = bytes.fromhex("2f18000050")

    # Bank 0x27 animation entry at 0x4FF50 ($9F50): ptr=9370, xOff=0x17, yOff=0x0C, dur=0x00
    assert all(b in (0x00, 0xFF) for b in rom[0x4FF50:0x4FF55])
    rom[0x4FF50:0x4FF55] = bytes.fromhex("9370170c00")

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
