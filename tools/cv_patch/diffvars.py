import sys
d = sys.argv[1]; act = sys.argv[2]; base = sys.argv[3]
def L(n):
    b = open(f"{d}/{n}.rec", "rb").read()
    return [b[i*0x400:(i+1)*0x400] for i in range(len(b)//0x400)]
c, bs = L(act), L(base)
def ch(rows, a): return sum(1 for i in range(1, len(rows)) if rows[i][a] != rows[i-1][a])
print(f"vars quiet in '{base}' but active in '{act}'")
for a in range(0x100, 0x400):
    if ch(bs, a) <= 1 and ch(c, a) >= 3:
        print(f"${a:03x} ch={ch(c, a):2d} | " + " ".join(f"{r[a]:02x}" for r in c))
