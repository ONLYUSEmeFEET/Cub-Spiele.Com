#!/usr/bin/env python3
"""SM8521 (SM8500 core) disassembler for the Castlevania patch project.

Mnemonic map comes from the emulator's opcode comments; operand layouts follow the emulator's decode code,
and every instruction LENGTH is verified against the emulator itself (oplen.ts -> work/oplen.json).

  python dis85.py <rom> --off 0x41030 --base 0x5030 -n 40
  python dis85.py --selftest        # compares lengths with work/oplen.json
"""
import argparse, json, os, sys

CC = ["F", "LT", "LE", "ULE", "OV", "MI", "Z", "C", "T", "GE", "GT", "UGT", "NOV", "PL", "NZ", "NC"]
ALU = ["CMP", "ADD", "SUB", "ADC", "SBC", "AND", "OR", "XOR"]
SINGLE = ["CLR", "NEG", "COM", "RR", "RL", "RRC", "RLC", "SRL", "INC", "DEC", "SRA", "SLL", "DA", "SWAP", "PUSH", "POP"]
G1A = ["CLR", "NEG", "COM", "RR", "RL", "RRC", "RLC", "SRL"]
G1B = ["INC", "DEC", "SRA", "SLL", "DA", "SWAP", "PUSH", "POP"]
PORTS = ["IE0", "IE1", "IR0", "IR1", "P0", "P1", "P2", "P3"]
SFR = {0x10: "IE0", 0x11: "IE1", 0x12: "IR0", 0x13: "IR1", 0x14: "P0", 0x15: "P1", 0x16: "P2", 0x17: "P3",
       0x19: "SYS", 0x1A: "CKC", 0x1B: "PS0", 0x1C: "SPH", 0x1D: "SPL", 0x1F: "PS1"}


def R(n):
    return SFR.get(n, f"R{n:02X}") if n >= 0x10 else f"R{n}"


def RR(n):
    return f"RR{n:02X}" if n >= 0x10 else f"RR{n}"


def h2(v): return f"{v:02X}h"
def h4(v): return f"{v:04X}h"
def s8(v): return v - 256 if v & 0x80 else v


def mode8(b0, b1, rest):
    """addressing mode byte for 0x20-0x29 (byte regs). returns (text, extra_len)"""
    s = b1 & 7
    m = b1 & 0xC0
    if m == 0x00: return f"@{R(s)}", 0
    if m == 0x40: return f"({R(s)})+", 0
    if m == 0xC0: return f"-({R(s)})", 0
    w = rest[0]
    return (f"{h2(w)}({R(s)})" if s else f"@{h2(w)}"), 1


B2W = [0, 8, 2, 10, 4, 12, 6, 14]


def mode16(b1, rest):
    s = B2W[b1 & 7]
    m = b1 & 0xC0
    if m == 0x00: return f"@{RR(s)}", 0
    if m == 0x40: return f"({RR(s)})+", 0
    if m == 0xC0: return f"-({RR(s)})", 0
    w = (rest[0] << 8) | rest[1]
    return (f"{h4(w)}({RR(s)})" if s else f"@{h4(w)}"), 2


def dis(b, pc):
    """b: bytes starting at instruction, pc: logical address. returns (text, length)"""
    o = b[0]; b1 = b[1] if len(b) > 1 else 0; b2 = b[2] if len(b) > 2 else 0; b3 = b[3] if len(b) > 3 else 0
    if o <= 0x0F: return f"{SINGLE[o]} {R(b1)}", 2
    if 0x10 <= o <= 0x17: return f"{ALU[o-0x10]} R{(b1>>3)&7},R{b1&7}", 2
    if o == 0x18: return f"INCW {RR(b1)}", 2
    if o == 0x19: return f"DECW {RR(b1)}", 2
    if o == 0x1A: return f"{G1A[b1 & 7]} @{R((b1>>3)&7)}", 2
    if o == 0x1B: return f"{G1B[b1 & 7]} @{R((b1>>3)&7)}", 2
    if o in (0x1C, 0x1D):
        nm = "BCLR" if o == 0x1C else "BSET"
        reg = (b1 >> 3) & 7
        ad = f"FF{b2:02X}h" if reg == 0 else f"{h2(b2)}({R(reg)})"
        return f"{nm} {ad},#{b1 & 7}", 3
    if o == 0x1E: return f"PUSHW {RR(b1)}", 2
    if o == 0x1F: return f"POPW {RR(b1)}", 2
    if 0x20 <= o <= 0x29:
        t, ex = mode8(o, b1, b[2:])
        r = R((b1 >> 3) & 7)
        if o == 0x29: return f"MOV {t},{r}", 2 + ex
        nm = (ALU + ["MOV"])[o - 0x20]
        return f"{nm} {r},{t}", 2 + ex
    if o in (0x2A, 0x2B):
        nm = "BBC" if o == 0x2A else "BBS"
        reg = (b1 >> 3) & 7
        ad = f"FF{b2:02X}h" if reg == 0 else f"{h2(b2)}({R(reg)})"
        return f"{nm} {ad},#{b1 & 7},{(pc + 4 + s8(b3)) & 0xFFFF:04X}h", 4
    if o == 0x2C: return f"EXTS {RR(b1)}", 2
    if o == 0x2D: return "unk2D", 1
    if o == 0x2E: return f"MOV PS0,#{h2(b1)}", 2
    if o == 0x2F: return f"BTST {R(b1)},#{h2(b2)}", 3
    if 0x30 <= o <= 0x3B:
        t, ex = mode16(b1, b[2:])
        if o == 0x3A: return f"MOVW {RR(B2W[(b1>>3)&7])},{t}", 2 + ex
        if o == 0x3B: return f"MOVW {t},{RR(B2W[(b1>>3)&7])}", 2 + ex
        r = R((b1 >> 3) & 7)
        if o == 0x39: return f"MOV {t},{r}", 2 + ex
        nm = (ALU + ["MOV"])[o - 0x30]
        return f"{nm} {r},{t}", 2 + ex
    if o == 0x3C: return f"MOVW {RR(B2W[(b1>>3)&7])},{RR(B2W[b1&7])}", 2
    if o == 0x3D: return "unk3D", 1
    if o in (0x3E, 0x3F):
        nm = "JMP" if o == 0x3E else "CALL"
        m = b1 & 0xC0; s = B2W[b1 & 7]
        if m == 0x40:
            w = (b2 << 8) | b3; r = (b1 >> 3) & 7
            return (f"{nm} @({h4(w)}+{R(r)})" if r else f"{nm} @{h4(w)}"), 4
        return f"{nm} {RR(s)}" + ("" if m == 0 else f"[m{m:02X}]"), 2
    if 0x40 <= o <= 0x48: return f"{(ALU + ['MOV'])[o-0x40]} {R(b2)},{R(b1)}", 3
    if o == 0x49: return f"CALL {(b1<<8)|b2:04X}h", 3
    if o == 0x4A: return f"MOVW {RR(b2)},{RR(b1)}", 3
    if o == 0x4B: return f"MOVW {RR(b1)},#{(b2<<8)|b3:04X}h", 4
    if o == 0x4C: return f"MULT {RR(b2)},{R(b1)}", 3
    if o == 0x4D: return f"MULT {RR(b2)},#{h2(b1)}", 3
    if o == 0x4E: return f"BMOV {R(b1)},#{b2 & 7}[{b2:02X}]", 3
    if o == 0x4F: return f"BOPS {R(b1)},#{b2 & 7}[{b2:02X}]", 3
    if 0x50 <= o <= 0x58: return f"{(ALU + ['MOV'])[o-0x50]} {R(b2)},#{h2(b1)}", 3
    if o == 0x59: return "INVALID59", 1
    if o in (0x5A, 0x5B):
        m = b1 & 0xC0
        nm = "CMP" if o == 0x5A else "MOV"
        ln = 4 if m == 0x80 else 3
        return f"{nm}ind [{b1:02X} {b2:02X}{(' %02X' % b3) if ln == 4 else ''}]", ln
    if o == 0x5C: return f"DIV {RR(b2)},{RR(b1)}", 3
    if o == 0x5D: return f"DIV {RR(b2)},#{h2(b1)}", 3
    if o in (0x5E, 0x5F): return f"MOVM {R(b1)},#{h2(b2)},{R(b3) if o == 0x5E else '#' + h2(b3)}", 4
    if 0x60 <= o <= 0x67: return f"{ALU[o-0x60]}W {RR(b2)},{RR(b1)}", 3
    if 0x68 <= o <= 0x6F: return f"{ALU[o-0x68]}W {RR(b1)},#{(b2<<8)|b3:04X}h", 4
    if 0x70 <= o <= 0x77: return f"DBNZ {R(o & 7)},{(pc + 2 + s8(b1)) & 0xFFFF:04X}h", 2
    if 0x78 <= o <= 0x7F: return f"MOVW {RR(B2W[o & 7])},#{(b1<<8)|b2:04X}h", 3
    if 0x80 <= o <= 0x87: return f"BBC {R(b1)},#{o & 7},{(pc + 3 + s8(b2)) & 0xFFFF:04X}h", 3
    if 0x88 <= o <= 0x8F: return f"BBS {R(b1)},#{o & 7},{(pc + 3 + s8(b2)) & 0xFFFF:04X}h", 3
    if 0x90 <= o <= 0x9F: return f"JMP {CC[o & 15]},{(b1<<8)|b2:04X}h", 3
    if 0xA0 <= o <= 0xA7: return f"BCLR {R(b1)},#{o & 7}", 2
    if 0xA8 <= o <= 0xAF: return f"BSET {R(b1)},#{o & 7}", 2
    if 0xB0 <= o <= 0xB7: return f"MOV {R(o & 7)},{R(b1)}", 2
    if 0xB8 <= o <= 0xBF: return f"MOV {R(b1)},{R(o & 7)}", 2
    if 0xC0 <= o <= 0xC7: return f"MOV {R(o & 7)},#{h2(b1)}", 2
    if 0xC8 <= o <= 0xCF: return f"MOV {PORTS[o & 7]},#{h2(b1)}", 2
    if 0xD0 <= o <= 0xDF: return f"BR {CC[o & 15]},{(pc + 2 + s8(b1)) & 0xFFFF:04X}h", 2
    if 0xE0 <= o <= 0xEF: return f"CALS {0x1000 + ((o & 0xF) << 8) + b1:04X}h", 2
    names = {0xF0: "STOP", 0xF1: "HALT", 0xF2: "INVALIDF2", 0xF8: "RET", 0xF9: "IRET", 0xFA: "CLRC", 0xFB: "COMC",
             0xFC: "SETC", 0xFD: "EI", 0xFE: "DI", 0xFF: "NOP"}
    return names.get(o, f"db {o:02X}"), 1


def selftest(path):
    t = json.load(open(path))
    bad = {}
    for o in range(256):
        for b1 in range(256):
            want = t[o][b1]
            if want == 0:
                continue
            _, ln = dis(bytes([o, b1, 0x11, 0x22, 0x33, 0x44]), 0x300)
            if ln != want:
                bad.setdefault(o, []).append((b1, ln, want))
    print("length mismatches:", sum(len(v) for v in bad.values()), "opcodes:", len(bad))
    for o, v in sorted(bad.items())[:30]:
        print(f"  {o:02X}: e.g. b1={v[0][0]:02X} mine={v[0][1]} emu={v[0][2]} (n={len(v)})")
    return not bad


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("rom", nargs="?")
    ap.add_argument("--off", type=lambda x: int(x, 0))
    ap.add_argument("--base", type=lambda x: int(x, 0))
    ap.add_argument("-n", type=int, default=32)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        sys.exit(0 if selftest(os.path.join(os.path.dirname(__file__), "work", "oplen.json")) else 1)
    d = open(a.rom, "rb").read()
    off, pc = a.off, a.base
    for _ in range(a.n):
        txt, ln = dis(d[off:off + 6], pc)
        print(f"{pc:04X} [{off:06X}]  {' '.join(f'{x:02X}' for x in d[off:off+ln]):<14} {txt}")
        off += ln; pc += ln
