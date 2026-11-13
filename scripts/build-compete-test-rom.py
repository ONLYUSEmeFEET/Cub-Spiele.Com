#!/usr/bin/env python3
"""
Builds public/roms/compete_test.bin — Official-Format Sharp SM8521 Cartridge ROM
for testing Tiger Game.Com Compete.Com Link Cable (Port 3 Crossover + UART + Burst Sync).
All opcodes verified against src/emulator/sm8521.ts (Sharp SM8500 / SM8521).
"""

import os

# 5x7 uppercase ASCII bitmap font (each char is 5 columns, bit 0 = top row, bit 6 = bottom row)
FONT_5X7 = {
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
    '!': [0x00, 0x00, 0x5F, 0x00, 0x00],
    '#': [0x14, 0x7F, 0x14, 0x7F, 0x14],
    '$': [0x24, 0x2A, 0x7F, 0x2A, 0x12],
    '%': [0x23, 0x13, 0x08, 0x64, 0x62],
    '&': [0x36, 0x49, 0x55, 0x22, 0x50],
    '(': [0x00, 0x1C, 0x22, 0x41, 0x00],
    ')': [0x00, 0x41, 0x22, 0x1C, 0x00],
    '*': [0x14, 0x08, 0x3E, 0x08, 0x14],
    '+': [0x08, 0x08, 0x3E, 0x08, 0x08],
    ',': [0x00, 0x50, 0x30, 0x00, 0x00],
    '-': [0x08, 0x08, 0x08, 0x08, 0x08],
    '.': [0x00, 0x60, 0x60, 0x00, 0x00],
    '/': [0x20, 0x10, 0x08, 0x04, 0x02],
    '0': [0x3E, 0x51, 0x49, 0x45, 0x3E],
    '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
    '2': [0x42, 0x61, 0x51, 0x49, 0x46],
    '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
    '4': [0x18, 0x14, 0x12, 0x7F, 0x10],
    '5': [0x27, 0x45, 0x45, 0x45, 0x39],
    '6': [0x3C, 0x4A, 0x49, 0x49, 0x30],
    '7': [0x01, 0x71, 0x09, 0x05, 0x03],
    '8': [0x36, 0x49, 0x49, 0x49, 0x36],
    '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
    ':': [0x00, 0x36, 0x36, 0x00, 0x00],
    '<': [0x08, 0x14, 0x22, 0x41, 0x00],
    '=': [0x14, 0x14, 0x14, 0x14, 0x14],
    '>': [0x00, 0x41, 0x22, 0x14, 0x08],
    '?': [0x02, 0x01, 0x51, 0x09, 0x06],
    'A': [0x7E, 0x11, 0x11, 0x11, 0x7E],
    'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
    'C': [0x3E, 0x41, 0x41, 0x41, 0x22],
    'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
    'E': [0x7F, 0x49, 0x49, 0x49, 0x41],
    'F': [0x7F, 0x09, 0x09, 0x09, 0x01],
    'G': [0x3E, 0x41, 0x49, 0x49, 0x7A],
    'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
    'I': [0x00, 0x41, 0x7F, 0x41, 0x00],
    'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
    'K': [0x7F, 0x08, 0x14, 0x22, 0x41],
    'L': [0x7F, 0x40, 0x40, 0x40, 0x40],
    'M': [0x7F, 0x02, 0x0C, 0x02, 0x7F],
    'N': [0x7F, 0x04, 0x08, 0x10, 0x7F],
    'O': [0x3E, 0x41, 0x41, 0x41, 0x3E],
    'P': [0x7F, 0x09, 0x09, 0x09, 0x06],
    'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E],
    'R': [0x7F, 0x09, 0x19, 0x29, 0x46],
    'S': [0x46, 0x49, 0x49, 0x49, 0x31],
    'T': [0x01, 0x01, 0x7F, 0x01, 0x01],
    'U': [0x3F, 0x40, 0x40, 0x40, 0x3F],
    'V': [0x1F, 0x20, 0x40, 0x20, 0x1F],
    'W': [0x3F, 0x40, 0x38, 0x40, 0x3F],
    'X': [0x63, 0x14, 0x08, 0x14, 0x63],
    'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
    'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
}


def col_bits_to_vram_bytes(col_bits: int, fg_shade: int = 3, bg_shade: int = 0) -> tuple[int, int]:
    """
    Converts a 7-bit vertical column (rows 0..6) into 2 Game.Com VRAM bytes (8 vertical pixels).
    """
    b0 = 0
    b1 = 0
    for r in range(4):
        shade = fg_shade if ((col_bits >> r) & 1) else bg_shade
        b0 |= (shade & 0x03) << (6 - r * 2)
    for r in range(4):
        bit_idx = r + 4
        shade = fg_shade if (bit_idx < 7 and ((col_bits >> bit_idx) & 1)) else bg_shade
        b1 |= (shade & 0x03) << (6 - r * 2)
    return b0, b1


class SM8521Assembler:
    def __init__(self, base_addr: int = 0x4000):
        self.base_addr = base_addr
        self.buf = bytearray()
        self.labels: dict[str, int] = {}
        self.fixups: list[tuple[int, str, str]] = []

    @property
    def pc(self) -> int:
        return self.base_addr + len(self.buf)

    def label(self, name: str):
        self.labels[name] = self.pc

    def emit(self, *bytes_vals: int):
        for b in bytes_vals:
            self.buf.append(b & 0xFF)

    def emit_word_be(self, w: int):
        self.emit((w >> 8) & 0xFF, w & 0xFF)

    def emit_abs16(self, opcode_bytes: list[int], label_name: str):
        self.emit(*opcode_bytes)
        self.fixups.append((len(self.buf), label_name, 'abs16'))
        self.emit(0x00, 0x00)

    def emit_rel8(self, opcode_byte: int, label_name: str):
        self.emit(opcode_byte)
        self.fixups.append((len(self.buf), label_name, 'rel8'))
        self.emit(0x00)

    def resolve(self):
        for offset, name, kind in self.fixups:
            if name not in self.labels:
                raise KeyError(f"Undefined label: {name}")
            target = self.labels[name]
            if kind == 'abs16':
                self.buf[offset] = (target >> 8) & 0xFF
                self.buf[offset + 1] = target & 0xFF
            elif kind == 'rel8':
                next_pc = self.base_addr + offset + 1
                disp = target - next_pc
                if not (-128 <= disp <= 127):
                    raise ValueError(f"Relative branch to {name} ({target:04X}) out of range from {next_pc:04X} (disp={disp})")
                self.buf[offset] = disp & 0xFF


def build_rom() -> bytes:
    asm = SM8521Assembler(0x4000)

    # =========================================================================
    # 1. OFFICIAL TIGER GAME.COM CARTRIDGE HEADER ($4000..$401F)
    # =========================================================================
    asm.emit(0x04)                    # +0x00: Bank count
    asm.emit(0x20)                    # +0x01: Entry point MMU bank ($20)
    asm.emit_word_be(0x4020)          # +0x02..+0x03: Entry point address ($4020)
    asm.emit(0x03)                    # +0x04: Flags (Slot 1 & Slot 2 compatible)
    asm.buf.extend(b'TigerDMGC')      # +0x05..+0x0D: 9-byte signature
    asm.emit(0x21)                    # +0x0E: Icon bank ($21)
    asm.emit(0xBF)                    # +0x0F: Icon X (191)
    asm.emit(0xC0)                    # +0x10: Icon Y (192)
    asm.buf.extend(b'LINK TEST')      # +0x11..+0x19: 9-byte ASCII Cartridge Title
    asm.emit_word_be(0xC0DE)          # +0x1A..+0x1B: Game ID ($C0DE)
    asm.emit(0x85, 0x00, 0x00, 0x00)  # +0x1C..+0x1F: Header padding

    assert asm.pc == 0x4020

    # =========================================================================
    # 2. GAME ENTRY DISPATCH ($4020)
    #    R2 = 0 (ini_game), 1 (exe_game), 2 (close_game), 3 (reset_game)
    # =========================================================================
    asm.label('GameEntry')
    # cmp r2, #01h -> 50 01 02
    asm.emit(0x50, 0x01, 0x02)
    # jmp eq, Game_Exe -> 96 <addr16>
    asm.emit_abs16([0x96], 'Game_Exe')
    # mov r0, #00h; ret (for ini_game / close_game / reset_game)
    asm.emit(0xC0, 0x00, 0xF8)

    # =========================================================================
    # 3. BIOS SYSCALL WRAPPERS
    #    pushw rr6 (1E 06); mov r7, #id (C7 <id>); jmp $20F1 (98 20 F1)
    # =========================================================================
    def define_syscall(name: str, call_id: int):
        asm.label(name)
        asm.emit(0x1E, 0x06, 0xC7, call_id, 0x98, 0x20, 0xF1)

    define_syscall('Disp_setup', 0x00)
    define_syscall('UART_setup', 0x3C)
    define_syscall('UART_enable', 0x3D)
    define_syscall('Reset_UART_queue', 0x3E)
    define_syscall('Send_a_byte', 0x3F)
    define_syscall('Receive_a_byte', 0x40)

    # =========================================================================
    # 4. HELPER SUBROUTINES FOR VRAM RENDERING ($A000..$BFFF)
    # =========================================================================
    # Subroutine: Draw_Glyph_R0
    # Inputs: R0 = glyph index, RR2 = VRAM destination address
    asm.label('Draw_Glyph_R0')
    # mov r5, r0 (B8 05); clr r4 (00 04) -> RR4 = R0
    asm.emit(0xB8, 0x05, 0x00, 0x04)
    # addw rr4, rr4 (61 04 04) -> *2
    asm.emit(0x61, 0x04, 0x04)
    # addw rr4, rr4 (61 04 04) -> *4
    asm.emit(0x61, 0x04, 0x04)
    # movw rr6, rr4 (4A 04 06) -> RR6 = *4
    asm.emit(0x4A, 0x04, 0x06)
    # addw rr4, rr4 (61 04 04) -> *8
    asm.emit(0x61, 0x04, 0x04)
    # addw rr4, rr6 (61 06 04) -> *12
    asm.emit(0x61, 0x06, 0x04)
    # addw rr4, #GlyphTable -> 69 04 <hi> <lo>
    asm.emit_abs16([0x69, 0x04], 'GlyphTable')

    # Loop 6 columns (R1 = 6):
    asm.emit(0xC1, 0x06)  # mov r1, #06h
    asm.label('Draw_Glyph_ColLoop')
    # mov r0, (rr4)+ -> 38 44
    # mov @rr2, r0   -> 39 02
    asm.emit(0x38, 0x44, 0x39, 0x02)
    # incw rr2 -> 18 02
    asm.emit(0x18, 0x02)
    # mov r0, (rr4)+ -> 38 44
    # mov @rr2, r0   -> 39 02
    asm.emit(0x38, 0x44, 0x39, 0x02)
    # Advance RR2 to next column: addw rr2, #39 (0x0027) -> 69 02 00 27
    asm.emit(0x69, 0x02, 0x00, 0x27)
    # dec r1 (09 01); br ne, Draw_Glyph_ColLoop (DE <rel8>)
    asm.emit(0x09, 0x01)
    asm.emit_rel8(0xDE, 'Draw_Glyph_ColLoop')
    asm.emit(0xF8)  # ret

    # Subroutine: Draw_Hex_Byte
    # Draws 2 hex digits from R0 at VRAM address RR2
    asm.label('Draw_Hex_Byte')
    # push r0 -> 0E 00
    asm.emit(0x0E, 0x00)
    # swap r0 -> 0D 00; and r0, #0Fh -> 55 0F 00
    asm.emit(0x0D, 0x00, 0x55, 0x0F, 0x00)
    # call Draw_Glyph_R0 -> 49 <addr16>
    asm.emit_abs16([0x49], 'Draw_Glyph_R0')
    # pop r0 -> 0F 00
    asm.emit(0x0F, 0x00)
    # and r0, #0Fh -> 55 0F 00
    asm.emit(0x55, 0x0F, 0x00)
    # jmp Draw_Glyph_R0 -> 98 <addr16>
    asm.emit_abs16([0x98], 'Draw_Glyph_R0')

    # Subroutine: Draw_String
    # Reads $FF-terminated glyph indices from (RR8)+ and draws each at RR2
    asm.label('Draw_String')
    # mov r0, (rr8)+ -> 38 41 (since sm8500_b2w[1] = 8)
    asm.emit(0x38, 0x41)
    # cmp r0, #0FFh -> 50 FF 00
    asm.emit(0x50, 0xFF, 0x00)
    # br eq, Draw_String_Done
    asm.emit_rel8(0xD6, 'Draw_String_Done')
    # call Draw_Glyph_R0 -> 49 <addr16>
    asm.emit_abs16([0x49], 'Draw_Glyph_R0')
    asm.emit_rel8(0xD8, 'Draw_String')
    asm.label('Draw_String_Done')
    asm.emit(0xF8)  # ret

    # Subroutine: Draw_Pass_Or_Wait
    # If R0 != 0 draws "PASS", else draws "WAIT"
    asm.label('Draw_Pass_Or_Wait')
    asm.emit(0x50, 0x00, 0x00)  # cmp r0, #0
    asm.emit_rel8(0xD6, 'Draw_Wait_Label')
    # movw rr8, #Str_PASS -> 79 <hi> <lo> (sm8500_b2w[1] = 8)
    asm.emit_abs16([0x79], 'Str_PASS')
    asm.emit_abs16([0x98], 'Draw_String')
    asm.label('Draw_Wait_Label')
    asm.emit_abs16([0x79], 'Str_WAIT')
    asm.emit_abs16([0x98], 'Draw_String')

    # =========================================================================
    # 5. MAIN EXECUTABLE: Game_Exe
    # =========================================================================
    asm.label('Game_Exe')
    # Ensure 16-bit stack pointer at $03C0 (SYS |= $40, SPH=$03, SPL=$C0)
    # and Register Pointer PS0 = $00
    asm.emit(0x58, 0x00, 0x1B)  # mov PS0 ($1B), #00h
    asm.emit(0x58, 0x00, 0x1E)  # mov PS0_mirror ($1E), #00h
    asm.emit_abs16([0x49], 'Disp_setup')
    # Ensure LCDC ($0030) = $80 (display ON, Page 0 $A000-$BFFF visible)
    asm.emit(0x58, 0x80, 0x30)  # mov 30h, #80h

    # Clear VRAM $A000..$BFFF to $00 (light olive background)
    asm.emit(0x7A, 0xA0, 0x00)  # movw rr2, #A000h
    asm.emit(0xC0, 0x00)        # mov r0, #00h
    asm.label('Clear_VRAM_Loop')
    asm.emit(0x39, 0x42)        # mov (rr2)+, r0
    # cmpw rr2, #C000h -> 68 02 C0 00
    asm.emit(0x68, 0x02, 0xC0, 0x00)
    asm.emit_rel8(0xDE, 'Clear_VRAM_Loop')

    # Draw dark header bar at top of screen (rows 0..11 = 3 bytes per column across 200 columns)
    asm.emit(0x7A, 0xA0, 0x00)  # movw rr2, #A000h
    asm.emit(0xC1, 200)         # mov r1, #200
    asm.emit(0xC0, 0xFF)        # mov r0, #FFh (black)
    asm.label('Header_Bar_Loop')
    asm.emit(0x39, 0x02)        # mov @rr2, r0
    asm.emit(0x18, 0x02)        # incw rr2
    asm.emit(0x39, 0x02)        # mov @rr2, r0
    asm.emit(0x18, 0x02)        # incw rr2
    asm.emit(0x39, 0x02)        # mov @rr2, r0
    asm.emit(0x69, 0x02, 0x00, 38)  # addw rr2, #38
    asm.emit(0x09, 0x01)        # dec r1
    asm.emit_rel8(0xDE, 'Header_Bar_Loop')

    # Clear test state RAM $0300..$030F
    asm.emit(0x7A, 0x03, 0x00)  # movw rr2, #0300h
    asm.emit(0xC0, 0x00)        # mov r0, #00h
    asm.emit(0xC1, 16)          # mov r1, #16
    asm.label('Clear_RAM_Loop')
    asm.emit(0x39, 0x42)        # mov (rr2)+, r0
    asm.emit(0x09, 0x01)        # dec r1
    asm.emit_rel8(0xDE, 'Clear_RAM_Loop')

    def vram_addr(col: int, row_byte: int) -> int:
        return 0xA000 + col * 40 + row_byte

    def emit_draw_str_at(col: int, row_byte: int, label_str: str):
        addr = vram_addr(col, row_byte)
        asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)  # movw rr2, #addr
        asm.emit_abs16([0x79], label_str)                # movw rr8, #label_str
        asm.emit_abs16([0x49], 'Draw_String')            # call Draw_String

    emit_draw_str_at(10, 4, 'Str_Title')
    emit_draw_str_at(8, 8, 'Str_Row1_P3')
    emit_draw_str_at(8, 14, 'Str_Row2_UART')
    emit_draw_str_at(8, 20, 'Str_Row3_Burst')
    emit_draw_str_at(8, 26, 'Str_Row4_State')
    emit_draw_str_at(8, 32, 'Str_Row5_Data')

    # =========================================================================
    # 6. INITIALIZE HARDWARE UART & PORT 3 VIA BIOS SYSCALLS
    # =========================================================================
    # and P3 ($17), #0F0h -> 55 F0 17
    asm.emit(0x55, 0xF0, 0x17)
    # mov r0, #1Fh; mov r1, #00h; call UART_setup ($3C)
    asm.emit(0xC0, 0x1F, 0xC1, 0x00)
    asm.emit_abs16([0x49], 'UART_setup')
    # call Reset_UART_queue ($3E)
    asm.emit_abs16([0x49], 'Reset_UART_queue')
    # mov r0, #03h; call UART_enable ($3D)
    asm.emit(0xC0, 0x03)
    asm.emit_abs16([0x49], 'UART_enable')
    # ei (FD)
    asm.emit(0xFD)

    # =========================================================================
    # 7. MAIN DIAGNOSTIC & MULTIPLAYER SYNC LOOP
    # =========================================================================
    asm.label('Main_Loop')

    # Increment frame counter ($030A)
    asm.emit(0x38, 0x80, 0x03, 0x0A)  # mov r0, @030Ah
    asm.emit(0x08, 0x00)              # inc r0
    asm.emit(0x39, 0x80, 0x03, 0x0A)  # mov @030Ah, r0

    # -------------------------------------------------------------------------
    # STAGE 1: PORT 3 CROSSOVER HANDSHAKE TEST (P3.0/1 <-> P3.2/3)
    #   Exact same Master/Slave negotiation as open_h2hx in Fighters Megamix:
    #   - If Role ($0300) == 0:
    #     - If P3.0 is not yet asserted, check if remote P3.2 (bit 2 = $04) is already 1:
    #       - If remote P3.2 == 1 -> we are Slave (Role = 2), assert P3.0=1 & P3.1=1
    #       - If remote P3.2 == 0 -> assert P3.0=1 (we are claiming Master)
    #     - If we already asserted P3.0=1 on an earlier check and remote P3.2/3 is now != 0:
    #       - Remote acknowledged -> we are Master (Role = 1), assert P3.1=1
    # -------------------------------------------------------------------------
    asm.emit(0x38, 0x80, 0x03, 0x00)  # mov r0, @0300h (Role)
    asm.emit(0x50, 0x00, 0x00)        # cmp r0, #00h
    asm.emit_rel8(0xDE, 'Role_Already_Set')

    # Check if we already set P3.0 (claiming Master):
    asm.emit(0xB0, 0x17)              # mov r0, P3 ($17)
    asm.emit(0x55, 0x01, 0x00)        # and r0, #01h
    asm.emit(0x50, 0x00, 0x00)        # cmp r0, #00h
    asm.emit_rel8(0xDE, 'Waiting_For_Slave_Ack')

    # P3.0 is 0: check if remote console already asserted P3.2/3
    asm.emit(0xB0, 0x17)              # mov r0, P3 ($17)
    asm.emit(0x55, 0x0C, 0x00)        # and r0, #0Ch
    asm.emit(0x50, 0x00, 0x00)        # cmp r0, #00h
    asm.emit_rel8(0xDE, 'Become_Slave')

    # Remote P3.2/3 is 0 -> Assert P3.0=1 (bset 17h, #0 -> A8 17) to claim Master
    asm.emit(0xA8, 0x17)
    asm.emit_abs16([0x98], 'Update_P3_Telemetry')

    asm.label('Waiting_For_Slave_Ack')
    # We already set P3.0=1; check if remote responded with P3.2/3 != 0
    asm.emit(0xB0, 0x17)              # mov r0, P3 ($17)
    asm.emit(0x55, 0x0C, 0x00)        # and r0, #0Ch
    asm.emit(0x50, 0x00, 0x00)        # cmp r0, #00h
    asm.emit_abs16([0x96], 'Update_P3_Telemetry')

    # Remote responded! Set Role = 1 (Master) and P3 Test = PASS (1)
    asm.emit(0xC0, 0x01)
    asm.emit(0x39, 0x80, 0x03, 0x00)  # $0300 = 1 (Master)
    asm.emit(0x39, 0x80, 0x03, 0x01)  # $0301 = 1 (P3 PASS)
    asm.emit(0xA9, 0x17)              # bset 17h, #1 (P3.0/1 = 11b)
    asm.emit_rel8(0xD8, 'Role_Already_Set')

    asm.label('Become_Slave')
    # Remote had P3.2/3 active -> Assert P3.0=1, P3.1=1 and become Slave (Role = 2)
    asm.emit(0xA8, 0x17)              # bset 17h, #0
    asm.emit(0xA9, 0x17)              # bset 17h, #1
    asm.emit(0xC0, 0x02)
    asm.emit(0x39, 0x80, 0x03, 0x00)  # $0300 = 2 (Slave)
    asm.emit(0xC0, 0x01)
    asm.emit(0x39, 0x80, 0x03, 0x01)  # $0301 = 1 (P3 PASS)

    asm.label('Role_Already_Set')
    # Toggle P3 handshake bits (1..3) every frame while keeping Slot select bits [7:6] intact
    asm.emit(0x38, 0x80, 0x03, 0x0A)  # mov r0, @030Ah (frame counter)
    asm.emit(0x55, 0x03, 0x00)        # and r0, #03h
    asm.emit(0x56, 0x01, 0x00)        # or r0, #01h
    asm.emit(0xB1, 0x17)              # mov r1, P3 ($17)
    asm.emit(0x55, 0xFC, 0x01)        # and r1, #0FCh
    asm.emit(0x16, 0x08)              # or r1, r0
    asm.emit(0xB9, 0x17)              # mov P3 ($17), r1

    # -------------------------------------------------------------------------
    # STAGE 2 & 3: BIOS UART PING-PONG & PACKET CHECKSUM EXCHANGE
    # -------------------------------------------------------------------------
    asm.emit(0x38, 0x80, 0x03, 0x00)  # mov r0, @0300h (Role)
    asm.emit(0x50, 0x02, 0x00)        # cmp r0, #02h (Slave?)
    asm.emit_rel8(0xD6, 'Slave_UART_Exchange')

    # Master UART Exchange:
    # 1. Send signature byte $5A via Send_a_byte ($3F)
    asm.emit(0xC0, 0x5A)              # mov r0, #5Ah
    asm.emit(0x39, 0x80, 0x03, 0x08)  # $0308 (Last TX) = $5A
    asm.emit_abs16([0x49], 'Send_a_byte')
    # 2. Wait for Slave's reply via Receive_a_byte ($40) -> returns Carry=0 (NC) and byte in R0
    asm.emit(0x7C, 0x00, 0x40)        # movw rr4, #0040h
    asm.label('Master_Wait_Rx1')
    asm.emit_abs16([0x49], 'Receive_a_byte')
    asm.emit_rel8(0xDF, 'Master_Got_Rx1')  # br nc, Master_Got_Rx1
    asm.emit(0x19, 0x04)              # decw rr4
    asm.emit_rel8(0xDE, 'Master_Wait_Rx1')
    asm.emit_abs16([0x98], 'Update_P3_Telemetry')

    asm.label('Master_Got_Rx1')
    # R0 holds received byte! Save to $0309 (Last RX)
    asm.emit(0x39, 0x80, 0x03, 0x09)  # mov @0309h, r0
    # Mark UART test PASS ($0302 = 1) and increment Ping-Pong counter ($0304)
    asm.emit(0xC0, 0x01)
    asm.emit(0x39, 0x80, 0x03, 0x02)  # $0302 = 1 (UART PASS)
    asm.emit(0x38, 0x80, 0x03, 0x04)
    asm.emit(0x08, 0x00)              # inc r0
    asm.emit(0x39, 0x80, 0x03, 0x04)

    # Now send checksum byte (frameCnt ^ $A5):
    asm.emit(0x38, 0x80, 0x03, 0x0A)  # mov r0, @030Ah (frameCnt)
    asm.emit(0x57, 0xA5, 0x00)        # xor r0, #0A5h
    asm.emit(0x39, 0x80, 0x03, 0x0B)  # save checksum to $030B
    asm.emit_abs16([0x49], 'Send_a_byte')
    # Mark Burst test PASS ($0303 = 1) and increment Burst counter ($0305)
    asm.emit(0xC0, 0x01)
    asm.emit(0x39, 0x80, 0x03, 0x03)
    asm.emit(0x38, 0x80, 0x03, 0x05)
    asm.emit(0x08, 0x00)              # inc r0
    asm.emit(0x39, 0x80, 0x03, 0x05)
    asm.emit_abs16([0x98], 'Update_P3_Telemetry')

    # Slave UART Exchange:
    asm.label('Slave_UART_Exchange')
    asm.emit(0x7C, 0x00, 0x40)        # movw rr4, #0040h
    asm.label('Slave_Wait_Rx1')
    asm.emit_abs16([0x49], 'Receive_a_byte')
    asm.emit_rel8(0xDF, 'Slave_Got_Rx1')   # br nc, Slave_Got_Rx1
    asm.emit(0x19, 0x04)              # decw rr4
    asm.emit_rel8(0xDE, 'Slave_Wait_Rx1')
    asm.emit_abs16([0x98], 'Update_P3_Telemetry')

    asm.label('Slave_Got_Rx1')
    asm.emit(0x39, 0x80, 0x03, 0x09)  # $0309 (Last RX) = R0
    # Send reply $A5 via Send_a_byte
    asm.emit(0xC0, 0xA5)
    asm.emit(0x39, 0x80, 0x03, 0x08)  # $0308 (Last TX) = $A5
    asm.emit_abs16([0x49], 'Send_a_byte')
    # Mark UART PASS ($0302 = 1) & increment counter ($0304)
    asm.emit(0xC0, 0x01)
    asm.emit(0x39, 0x80, 0x03, 0x02)
    asm.emit(0x38, 0x80, 0x03, 0x04)
    asm.emit(0x08, 0x00)              # inc r0
    asm.emit(0x39, 0x80, 0x03, 0x04)

    # Wait for Master's checksum byte:
    asm.emit(0x7C, 0x00, 0x40)        # movw rr4, #0040h
    asm.label('Slave_Wait_Rx2')
    asm.emit_abs16([0x49], 'Receive_a_byte')
    asm.emit_rel8(0xDF, 'Slave_Got_Rx2')   # br nc, Slave_Got_Rx2
    asm.emit(0x19, 0x04)              # decw rr4
    asm.emit_rel8(0xDE, 'Slave_Wait_Rx2')
    asm.emit_abs16([0x98], 'Update_P3_Telemetry')

    asm.label('Slave_Got_Rx2')
    asm.emit(0x39, 0x80, 0x03, 0x0B)  # save received checksum to $030B
    asm.emit(0xC0, 0x01)
    asm.emit(0x39, 0x80, 0x03, 0x03)  # $0303 = 1 (Burst PASS)
    asm.emit(0x38, 0x80, 0x03, 0x05)
    asm.emit(0x08, 0x00)              # inc r0
    asm.emit(0x39, 0x80, 0x03, 0x05)

    # -------------------------------------------------------------------------
    # STAGE 4: SAMPLE P3 TELEMETRY & UPDATE LIVE LCD DASHBOARD
    # -------------------------------------------------------------------------
    asm.label('Update_P3_Telemetry')
    asm.emit(0xB0, 0x17)              # mov r0, P3 ($17)
    asm.emit(0x55, 0x03, 0x00)        # and r0, #03h
    asm.emit(0x39, 0x80, 0x03, 0x06)  # $0306 = local P3[1:0]
    asm.emit(0xB0, 0x17)              # mov r0, P3 ($17)
    asm.emit(0x07, 0x00)              # srl r0
    asm.emit(0x07, 0x00)              # srl r0
    asm.emit(0x55, 0x03, 0x00)        # and r0, #03h
    asm.emit(0x39, 0x80, 0x03, 0x07)  # $0307 = remote P3[3:2]

    # Render Row 1 Status (Col 116, RowByte 8): P3 Crossover PASS/WAIT + P3 Hex
    addr = vram_addr(116, 8)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x01)
    asm.emit_abs16([0x49], 'Draw_Pass_Or_Wait')

    addr = vram_addr(152, 8)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x06)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    addr = vram_addr(172, 8)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x07)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    # Render Row 2 Status (Col 116, RowByte 14): UART Ping-Pong PASS/WAIT + Count
    addr = vram_addr(116, 14)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x02)
    asm.emit_abs16([0x49], 'Draw_Pass_Or_Wait')

    addr = vram_addr(158, 14)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x04)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    # Render Row 3 Status (Col 116, RowByte 20): Burst Checksum PASS/WAIT + Count
    addr = vram_addr(116, 20)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x03)
    asm.emit_abs16([0x49], 'Draw_Pass_Or_Wait')

    addr = vram_addr(158, 20)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x05)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    # Render Row 4 Status (Col 116, RowByte 26): Role (MSTR / SLAV / WAIT) + FrameCnt
    addr = vram_addr(116, 26)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x00)
    asm.emit(0x50, 0x01, 0x00)
    asm.emit_rel8(0xD6, 'Draw_Role_Master')
    asm.emit(0x50, 0x02, 0x00)
    asm.emit_rel8(0xD6, 'Draw_Role_Slave')
    asm.emit_abs16([0x79], 'Str_WAIT')
    asm.emit_rel8(0xD8, 'Do_Draw_Role')
    asm.label('Draw_Role_Master')
    asm.emit_abs16([0x79], 'Str_MSTR')
    asm.emit_rel8(0xD8, 'Do_Draw_Role')
    asm.label('Draw_Role_Slave')
    asm.emit_abs16([0x79], 'Str_SLAV')
    asm.label('Do_Draw_Role')
    asm.emit_abs16([0x49], 'Draw_String')

    addr = vram_addr(158, 26)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x0A)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    # Render Row 5 Status (Col 116, RowByte 32): TX byte, RX byte, Checksum byte
    addr = vram_addr(116, 32)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x08)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    addr = vram_addr(142, 32)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x09)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    addr = vram_addr(168, 32)
    asm.emit(0x7A, (addr >> 8) & 0xFF, addr & 0xFF)
    asm.emit(0x38, 0x80, 0x03, 0x0B)
    asm.emit_abs16([0x49], 'Draw_Hex_Byte')

    # Short frame delay before repeating Main_Loop
    asm.emit(0x7C, 0x08, 0x00)        # movw rr4, #0800h
    asm.label('Frame_Delay_Loop')
    asm.emit(0x19, 0x04)              # decw rr4
    asm.emit_rel8(0xDE, 'Frame_Delay_Loop')

    # jmp Main_Loop
    asm.emit_abs16([0x98], 'Main_Loop')

    # =========================================================================
    # 8. GLYPH TABLE & STRING CONSTANTS
    # =========================================================================
    CHAR_ORDER = "0123456789ABCDEFGHIKLMNOPRSTUVWXYZ:.-/ "
    CHAR_TO_INDEX = {ch: idx for idx, ch in enumerate(CHAR_ORDER)}

    asm.label('GlyphTable')
    for ch in CHAR_ORDER:
        cols = FONT_5X7.get(ch, FONT_5X7[' '])
        for c in cols:
            b0, b1 = col_bits_to_vram_bytes(c, fg_shade=3, bg_shade=0)
            asm.emit(b0, b1)
        b0, b1 = col_bits_to_vram_bytes(0x00, fg_shade=3, bg_shade=0)
        asm.emit(b0, b1)

    def emit_encoded_string(label_name: str, text: str):
        asm.label(label_name)
        for ch in text.upper():
            idx = CHAR_TO_INDEX.get(ch, CHAR_TO_INDEX[' '])
            asm.emit(idx)
        asm.emit(0xFF)

    emit_encoded_string('Str_Title', 'COMPETE.COM LINK TEST V1.3')
    emit_encoded_string('Str_Row1_P3', '1.P3 CROSSOVER:')
    emit_encoded_string('Str_Row2_UART', '2.BIOS UART IO:')
    emit_encoded_string('Str_Row3_Burst', '3.BURST CKSUM:')
    emit_encoded_string('Str_Row4_State', '4.CONSOLE ROLE:')
    emit_encoded_string('Str_Row5_Data', '5.TX/RX/CKSUM:')
    emit_encoded_string('Str_PASS', 'PASS')
    emit_encoded_string('Str_WAIT', 'WAIT')
    emit_encoded_string('Str_MSTR', 'MSTR')
    emit_encoded_string('Str_SLAV', 'SLAV')

    asm.resolve()

    bank0 = bytes(asm.buf) + bytes(8192 - len(asm.buf))

    lightsout_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'roms', 'lightsout.bin')
    if os.path.exists(lightsout_path):
        with open(lightsout_path, 'rb') as f:
            lo_rom = f.read()
        bank1 = lo_rom[0x2000:0x4000]
    else:
        bank1 = bytes(8192)

    full_rom = bank0 + bank1 + bank0 + bank1
    assert len(full_rom) == 32768
    return full_rom


if __name__ == '__main__':
    out_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'roms', 'compete_test.bin')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    rom_bytes = build_rom()
    with open(out_path, 'wb') as f:
        f.write(rom_bytes)
    print(f"Built {out_path} ({len(rom_bytes)} bytes)")
