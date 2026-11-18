"""Contact sheet: python sheet.py <outdir> <prefix> <count> [cols]"""
import sys
from PIL import Image
d, pre, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 4
ims = [Image.open(f"{d}/{pre}{i}.png").resize((300, 240)) for i in range(1, n + 1)]
rows = (n + cols - 1) // cols
s = Image.new("L", (cols * 300, rows * 240))
for i, m in enumerate(ims):
    s.paste(m, ((i % cols) * 300, (i // cols) * 240))
s.save(f"{d}/sheet_{pre}.png")
