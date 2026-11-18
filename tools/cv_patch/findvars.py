"""Find candidate state variables: python findvars.py <outdir>
Compares idle/right/left/jump traces. Reports addrs that are stable in idle but move during an action."""
import sys
d = sys.argv[1]
def load(n):
    b = open(f"{d}/{n}.rec", "rb").read()
    return [b[i*0x400:(i+1)*0x400] for i in range(len(b)//0x400)]
T = {n: load(n) for n in ["idle", "right", "left", "jumpb", "jumpc", "jumpbR"]}
def col(rows, a): return [r[a] for r in rows]
def changes(v): return sum(1 for i in range(1, len(v)) if v[i] != v[i-1])
def mono(v):
    up = all(v[i] >= v[i-1] or v[i-1]-v[i] > 0x80 for i in range(1, len(v)))
    dn = all(v[i] <= v[i-1] or v[i]-v[i-1] > 0x80 for i in range(1, len(v)))
    return up, dn
print("== walking vars (stable idle, move right/left) ==")
for a in range(0x100, 0x400):
    i = changes(col(T["idle"], a))
    r, l = col(T["right"], a), col(T["left"], a)
    if i <= 1 and changes(r) >= 5:
        ru, rd = mono(r); lu, ld = mono(l)
        print(f"${a:03x} idle_ch={i} right_ch={changes(r)} left_ch={changes(l)} right:{'up' if ru else 'dn' if rd else '-'} left:{'up' if lu else 'dn' if ld else '-'} r0={r[0]:02x} r-1={r[-1]:02x} l-1={l[-1]:02x}")
print("== jump vars (stable idle, move on B jump) ==")
for n in ["jumpb", "jumpc"]:
    for a in range(0x100, 0x400):
        if changes(col(T["idle"], a)) <= 1:
            j = col(T[n], a)
            if 4 <= changes(j) <= 60 and len(set(j)) > 2:
                print(f"{n} ${a:03x} ch={changes(j)} seq={' '.join(f'{x:02x}' for x in j[:40:2])}")
