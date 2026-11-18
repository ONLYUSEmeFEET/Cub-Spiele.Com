#!/usr/bin/env python3
"""Jump test: python jumptest.py <rom> [label] [button]
Loads work/gp.cgstate, presses a button (default c), records per-frame screenshots and reports
apex height, time and airtime of Alucard's feet (black-pixel bounding box in his screen column)."""
import subprocess, sys, os, json
from PIL import Image
import numpy as np

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
rom = os.path.abspath(sys.argv[1]); label = sys.argv[2] if len(sys.argv) > 2 else "t"
btn = sys.argv[3] if len(sys.argv) > 3 else "c"
N = 110
script = [{"load": "tools/cv_patch/work/gp.cgstate"}, {"f": 3},
          {"rec": f"jt_{label}", "n": N, "shotEvery": 1, "sched": {"2": [btn], "8": []}}]
sp = os.path.join(root, "tools/cv_patch/work", f"jt_{label}.json")
json.dump(script, open(sp, "w"))
out = os.path.join(root, "tools/cv_patch/work/jt_out")
subprocess.run(["npx.cmd", "tsx", "tools/cv_patch/harness.ts", rom, sp, out], cwd=root, capture_output=True, text=True)
frames = [np.array(Image.open(f"{out}/jt_{label}_{i}.png").convert("L"), dtype=int) for i in range(1, N + 1)]


ref = frames[-1]


def union_top(f):
    d = np.abs(f - ref) > 60
    d[:90, :] = False
    d[226:, :] = False
    sub = d[:, 140:320]
    ys = np.where(sub.any(axis=1))[0]
    return (int(ys.min() // 2), int(sub.sum())) if len(ys) else (None, 0)


res = [union_top(f) for f in frames]
print(label, "top_y:", " ".join("-" if t is None else str(t) for t, _ in res[::3]))
air = [i for i, (t, c) in enumerate(res) if t is not None and c > 120]
if air:
    ap_i = min(air, key=lambda i: res[i][0])
    print(f"{label}: apex_top_y={res[ap_i][0]} at frame {ap_i}; diff-active frames {air[0]}..{air[-1]} ({air[-1] - air[0] + 1})")
else:
    print(label, "no airborne frames detected")
