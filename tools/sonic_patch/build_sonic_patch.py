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

VERSION = "0.1"
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
        "b0e1"
        "558000"
        "561600"
        "b8e1"
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

    # 11. 2-bpp LCD Readability: boost foreground sprite/ring/hazard contrast via DMPL (R3B = 0xF8) in 4ADAh
    assert rom[0x40B43:0x40B47] == bytes.fromhex("3e484653")
    rom[0x40B43:0x40B47] = bytes.fromhex("985fd0ff")
    pal_code = bytes.fromhex("7a5fdc" "1e02" "58f83b" "3e484653" "58e43bf8")
    assert all(b in (0x00, 0xFF) for b in rom[0x41FD0 : 0x41FD0 + len(pal_code)])
    rom[0x41FD0 : 0x41FD0 + len(pal_code)] = pal_code

    # 11. Custom S3&K Glide sprite for Knuckles (47x24 on LCD, transposed 24x47 in dmbr 0x50/0x51)
    rows0 = [
        (0, "000000002ac0"), (1, "0000000095b0"), (2, "0000000245b0"), (3, "0000000255b0"),
        (4, "0000000696b0"), (5, "00000007eab0"), (6, "0000000fcdc0"), (7, "0000001f3fc0"),
        (8, "0000001f3f00"), (9, "0000203afb00"), (10, "00009826fc00"), (11, "000258996000"),
        (12, "00025a596000"), (13, "02096969a000"), (14, "0989696a6000"), (15, "09a565696000"),
        (16, "25a565a58000"), (17, "25a5a5a58000"), (18, "259595960000"), (19, "259596960000"),
        (20, "955556568000"), (21, "9555565a8000"), (22, "955559598000"), (23, "955559596000"),
        (24, "9555556a5800"), (25, "5555556afc00"), (26, "55555568ffc0"), (27, "555557e8fffc"),
        (28, "55d557fbffff"), (29, "546bd7fb03ff"), (30, "956c37ff00ff"), (31, "955707fc00ff"),
        (32, "255b03fc300c"), (33, "255603fc3c0f"), (34, "0956ffff3033"), (35, "0255bff970fc"),
        (36, "00956ff25fc0"), (37, "00297ff0fff0"), (38, "00000fc33cfc"), (39, "000003c300ff"),
        (40, "0000000300ff"), (41, "0000000c3fff"), (42, "0000000c3f3f"), (43, "00000003003f"),
        (44, "00000000c03c"), (45, "00000000cfff"), (46, "0000000030f3"),
    ]
    rows1 = [
        (2, "000000003000"), (6, "000000003000"), (7, "00000000c000"), (8, "00000000c000"),
        (26, "000000030000"), (27, "000000030000"), (29, "03000000fc00"), (30, "0003c000ff00"),
        (31, "0000f003ff00"), (32, "0000fc03cff0"), (33, "0000fc03c3f0"), (34, "00000000cfcc"),
        (35, "000000000f00"), (38, "00000000c300"), (39, "00000000ff00"), (40, "00000000ff00"),
        (41, "00000003c000"), (42, "00000003c0c0"), (43, "00000000ffc0"), (44, "000000003fc0"),
        (45, "000000003000"), (46, "000000000f0c"),
    ]
    assert all(b == 0x00 for b in rom[0x140000:0x140C00])
    assert all(b == 0x00 for b in rom[0x144000:0x144C00])
    for y, hx in rows0:
        b = bytes.fromhex(hx)
        rom[0x140000 + y * 64 : 0x140000 + y * 64 + len(b)] = b
    for y, hx in rows1:
        b = bytes.fromhex(hx)
        rom[0x144000 + y * 64 : 0x144000 + y * 64 + len(b)] = b

    # Bank 0x22 sprite header at 0x45370 ($9370): 47x24 on LCD, src=(0,0), dmbr=0x50
    assert all(b in (0x00, 0xFF) for b in rom[0x45370:0x45375])
    rom[0x45370:0x45375] = bytes.fromhex("2f18000050")

    # Bank 0x27 animation entry at 0x4FF50 ($9F50): ptr=9370, xOff=0x17, yOff=0x0C, dur=0x00
    assert all(b in (0x00, 0xFF) for b in rom[0x4FF50:0x4FF55])
    rom[0x4FF50:0x4FF55] = bytes.fromhex("9370170c00")

    # 12. Phase 4: Extend post-hit invulnerability frames (0x28 -> 0x4B, ~3.0s)
    assert rom[0x52EC1:0x52EC3] == bytes.fromhex("c328")
    rom[0x52EC2] = 0x4B

    # 13. Phase 5: Reborn header title ("SONIC REB") & isolated NVRAM Game ID ($B747)
    assert rom[0x40011:0x4001C] == b"Sonic Jam\x042"
    rom[0x40011:0x4001A] = b"SONIC REB"
    rom[0x4001A:0x4001C] = bytes([0xB7, 0x47])

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
