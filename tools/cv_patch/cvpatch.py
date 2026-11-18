#!/usr/bin/env python3
"""cvpatch - patch tooling for the Game.com Castlevania SotN prototype ("Reborn").

  python cvpatch.py info   <rom>
  python cvpatch.py build  <orig_rom> <patched_rom> <out_basename>   # writes .bps and .ips
  python cvpatch.py apply  <orig_rom> <patch.bps|patch.ips> <out_rom>
  python cvpatch.py edits  <orig_rom> <patches.json> <out_rom>        # apply byte edits

The patch only ever touches ROM bytes (hardware-safe). No ROM data is stored in patches
beyond the changed bytes.
"""
import hashlib, json, struct, sys, zlib

ORIG_SHA1 = "86fc20a233f18c4c7aac8ebed3e4d95dabc6e8bb"
ORIG_SIZE = 0x200000
HEADER_OFF = 0x40000  # "TigerDMGC" header (first 256 KB of the dump is blank)


def read(p):
    with open(p, "rb") as f:
        return bytearray(f.read())


def info(rom):
    d = read(rom)
    print("size", hex(len(d)), "sha1", hashlib.sha1(d).hexdigest(), "ok" if hashlib.sha1(d).hexdigest() == ORIG_SHA1 else "(modified/other)")
    h = d[HEADER_OFF:HEADER_OFF + 0x20]
    print("header sig", bytes(h[5:10]), "title", bytes(h[0x11:0x1A]), "game id", hex(int.from_bytes(h[0x1A:0x1C], "big")))


# ---------------- IPS ----------------
def make_ips(a, b):
    assert len(a) == len(b), "IPS builder requires equal sizes"
    out = bytearray(b"PATCH")
    i, n = 0, len(a)
    while i < n:
        if a[i] == b[i]:
            i += 1
            continue
        j = i
        while j < n and (a[j] != b[j] or (j + 1 < n and a[j + 1] != b[j + 1])) and j - i < 0xFFFF:
            j += 1
        if i == 0x454F46:  # avoid "EOF" offset collision
            i -= 1
        out += i.to_bytes(3, "big") + (j - i).to_bytes(2, "big") + bytes(b[i:j])
        i = j
    return bytes(out + b"EOF")


def apply_ips(a, p):
    a = bytearray(a)
    assert p[:5] == b"PATCH"
    i = 5
    while p[i:i + 3] != b"EOF":
        off = int.from_bytes(p[i:i + 3], "big"); sz = int.from_bytes(p[i + 3:i + 5], "big"); i += 5
        if sz == 0:
            rl = int.from_bytes(p[i:i + 2], "big"); v = p[i + 2]; i += 3
            a[off:off + rl] = bytes([v]) * rl
        else:
            a[off:off + sz] = p[i:i + sz]; i += sz
    return a


# ---------------- BPS ----------------
def enc(n):
    o = bytearray()
    while True:
        x = n & 0x7F; n >>= 7
        if n == 0:
            o.append(0x80 | x); return o
        o.append(x); n -= 1


def dec(p, i):
    d, s = 0, 1
    while True:
        x = p[i]; i += 1
        d += (x & 0x7F) * s
        if x & 0x80: return d, i
        s <<= 7; d += s


def make_bps(a, b):
    """Same-size source/target: SourceRead runs + TargetRead for changes."""
    assert len(a) == len(b)
    out = bytearray(b"BPS1") + enc(len(a)) + enc(len(b)) + enc(0)
    i, n = 0, len(a)
    while i < n:
        j = i
        while j < n and a[j] == b[j]: j += 1
        if j > i:
            out += enc(((j - i - 1) << 2) | 0); i = j
            continue
        k = i
        # extend change run until 8 equal bytes (keeps action count low)
        eq = 0
        while k < n and eq < 8:
            eq = eq + 1 if a[k] == b[k] else 0
            k += 1
        k -= eq if k < n or eq else 0
        k = max(k, i + 1)
        out += enc(((k - i - 1) << 2) | 1) + bytes(b[i:k]); i = k
    out += struct.pack("<I", zlib.crc32(a)) + struct.pack("<I", zlib.crc32(b))
    out += struct.pack("<I", zlib.crc32(out))
    return bytes(out)


def apply_bps(a, p):
    assert p[:4] == b"BPS1"
    i = 4
    ssz, i = dec(p, i); tsz, i = dec(p, i); mlen, i = dec(p, i); i += mlen
    assert zlib.crc32(a) == struct.unpack("<I", p[-12:-8])[0], "source CRC mismatch (wrong ROM)"
    t = bytearray(); end = len(p) - 12
    sr = tr = 0
    while i < end:
        v, i = dec(p, i); act, ln = v & 3, (v >> 2) + 1
        if act == 0: t += a[len(t):len(t) + ln]
        elif act == 1: t += p[i:i + ln]; i += ln
        elif act == 2:
            o, i = dec(p, i); sr += -(o >> 1) if o & 1 else o >> 1
            t += a[sr:sr + ln]; sr += ln
        else:
            o, i = dec(p, i); tr += -(o >> 1) if o & 1 else o >> 1
            for _ in range(ln): t.append(t[tr]); tr += 1
    assert zlib.crc32(t) == struct.unpack("<I", p[-8:-4])[0], "target CRC mismatch"
    return t


def apply_edits(a, edits):
    """edits: [{"name":..,"offset":"0x...","old":"hex(optional)","new":"hex"}] - old is verified when given."""
    a = bytearray(a)
    for e in edits:
        off = int(e["offset"], 16); new = bytes.fromhex(e["new"])
        if "old" in e:
            assert a[off:off + len(new)] == bytes.fromhex(e["old"]), f"{e['name']}: unexpected bytes at {off:#x}"
        a[off:off + len(new)] = new
    return a


if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else ""
    if c == "info": info(sys.argv[2])
    elif c == "build":
        a, b = read(sys.argv[2]), read(sys.argv[3]); base = sys.argv[4]
        open(base + ".bps", "wb").write(make_bps(a, b)); open(base + ".ips", "wb").write(make_ips(a, b))
        assert apply_bps(a, open(base + ".bps", "rb").read()) == b and apply_ips(a, open(base + ".ips", "rb").read()) == b
        print("built + verified", base + ".bps/.ips")
    elif c == "apply":
        a = read(sys.argv[2]); p = open(sys.argv[3], "rb").read()
        open(sys.argv[4], "wb").write(apply_bps(a, p) if p[:4] == b"BPS1" else apply_ips(a, p)); print("ok")
    elif c == "edits":
        a = read(sys.argv[2]); open(sys.argv[4], "wb").write(apply_edits(a, json.load(open(sys.argv[3])))); print("ok")
    else: print(__doc__)
