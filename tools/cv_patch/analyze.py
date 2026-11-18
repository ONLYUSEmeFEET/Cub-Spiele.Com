"""Analyze .rec traces: python analyze.py <outdir> <name> [maxprint]
Prints addresses that change, their value ranges, and a compact per-frame sequence for small sets."""
import sys
d, name = sys.argv[1], sys.argv[2]
mx = int(sys.argv[3]) if len(sys.argv) > 3 else 40
b = open(f"{d}/{name}.rec", "rb").read()
n = len(b) // 0x400
rows = [b[i * 0x400:(i + 1) * 0x400] for i in range(n)]
chg = []
for a in range(0x400):
    vals = [r[a] for r in rows]
    c = sum(1 for i in range(1, n) if vals[i] != vals[i - 1])
    if c:
        chg.append((a, c, min(vals), max(vals)))
print(f"{name}: {n} frames, {len(chg)} changing addrs")
for a, c, lo, hi in sorted(chg, key=lambda x: -x[1])[:mx]:
    seq = " ".join(f"{rows[i][a]:02x}" for i in range(0, n, max(1, n // 24)))
    print(f"  ${a:03x} changes={c:3d} range={lo:02x}-{hi:02x} | {seq}")
