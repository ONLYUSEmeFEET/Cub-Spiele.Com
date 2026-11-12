/**
 * Sharp SM8500 / SM8521 CPU Core & Tiger Game.Com Hardware Subsystem
 * Direct, cycle-accurate port of MAME's sm8500.cpp, sm85ops.h, gamecom.cpp, gamecom_m.cpp, and gamecom_v.cpp.
 *
 * Address Space:
 * - $0000-$000F: Banked CPU Register File (indexed via PS0 & 0xF8 into 0x108 register RAM, mirrored to $0000-$000F)
 * - $0010-$007F: SM8521 Internal Hardware I/O Ports (Interrupts, Ports P0-P3, MMU0-4, LCDC, DMA, Audio, Timers)
 * - $0080-$03FF: Internal CPU RAM (1KB total at $0000-$03FF)
 * - $0400-$0FFF: Unmapped / Open Bus
 * - $1000-$1FFF: Internal BIOS ROM (4KB internal.bin, Reset Vector at $1020, Interrupt Vectors at $1000-$101E)
 * - $2000-$3FFF: MMU Bank 1 (8KB window controlled by MMU1 at $0025)
 * - $4000-$5FFF: MMU Bank 2 (8KB window controlled by MMU2 at $0026)
 * - $6000-$7FFF: MMU Bank 3 (8KB window controlled by MMU3 at $0027)
 * - $8000-$9FFF: MMU Bank 4 (8KB window controlled by MMU4 at $0028)
 * - $A000-$DFFF: Video RAM (16KB, write-only, returns 0x00 on read; two 8KB pages at $0000 and $2000)
 * - $E000-$FFFF: Extended RAM / Battery-Backed NVRAM (8KB, stores BIOS High Scores, Phonebook, Calendar)
 */

import { CPURegisters, GameComButtons } from './types';

export const SM8521_IE0 = 0x10;
export const SM8521_IE1 = 0x11;
export const SM8521_IR0 = 0x12;
export const SM8521_IR1 = 0x13;
export const SM8521_P0 = 0x14;
export const SM8521_P1 = 0x15;
export const SM8521_P2 = 0x16;
export const SM8521_P3 = 0x17;
export const SM8521_SYS = 0x19;
export const SM8521_CKC = 0x1a;
export const SM8521_PS0 = 0x1b;
export const SM8521_SPH = 0x1c;
export const SM8521_SPL = 0x1d;
export const SM8521_PS0_MIRROR = 0x1e;
export const SM8521_PS1 = 0x1f;

export const SM8521_MMU0 = 0x24;
export const SM8521_MMU1 = 0x25;
export const SM8521_MMU2 = 0x26;
export const SM8521_MMU3 = 0x27;
export const SM8521_MMU4 = 0x28;

export const SM8521_CLKT = 0x2e;
export const SM8521_LCDC = 0x30;
export const SM8521_LCH = 0x31;
export const SM8521_LCV = 0x32;
export const SM8521_DMC = 0x34;
export const SM8521_DMX1 = 0x35;
export const SM8521_DMY1 = 0x36;
export const SM8521_DMDX = 0x37;
export const SM8521_DMDY = 0x38;
export const SM8521_DMX2 = 0x39;
export const SM8521_DMY2 = 0x3a;
export const SM8521_DMPL = 0x3b;
export const SM8521_DMBR = 0x3c;
export const SM8521_DMVP = 0x3d;

export const SM8521_SGC = 0x40;
export const SM8521_SG0L = 0x42;
export const SM8521_SG1L = 0x44;
export const SM8521_SG0TH = 0x46;
export const SM8521_SG0TL = 0x47;
export const SM8521_SG1TH = 0x48;
export const SM8521_SG1TL = 0x49;
export const SM8521_SG2L = 0x4a;
export const SM8521_SG2TH = 0x4c;
export const SM8521_SG2TL = 0x4d;
export const SM8521_SGDA = 0x4e;
export const SM8521_SG0W0 = 0x60;
export const SM8521_SG1W0 = 0x70;

export const SM8521_TM0C = 0x50;
export const SM8521_TM0D = 0x51;
export const SM8521_TM1C = 0x52;
export const SM8521_TM1D = 0x53;

const FLAG_C = 0x80;
const FLAG_Z = 0x40;
const FLAG_S = 0x20;
const FLAG_V = 0x10;
const FLAG_D = 0x08;
const FLAG_H = 0x04;
const FLAG_B = 0x02;
const FLAG_I = 0x01;

const sm8500_b2w = [0, 8, 2, 10, 4, 12, 6, 14];
const gamecom_timer_limit = [2, 1024, 2048, 4096, 8192, 16384, 32768, 65536];

export const ILL_INT = 0;
export const WDT_INT = 1;
export const NMI_INT = 2;
export const DMA_INT = 3;
export const TIM0_INT = 4;
export const EXT_INT = 5;
export const UART_INT = 6;
export const LCDC_INT = 7;
export const TIM1_INT = 8;
export const CK_INT = 9;
export const PIO_INT = 10;

export interface GameComTimer {
  enabled: boolean;
  upcounter_max: number;
  prescale_max: number;
  prescale_count: number;
}

export interface GameComAudioState {
  sgc: number;
  sg0l: number;
  sg1l: number;
  sg2l: number;
  sg0t: number;
  sg1t: number;
  sg2t: number;
  sgda: number;
  sg0w: Uint8Array;
  sg1w: Uint8Array;
}

export class SM8521CPU {
  // SM8500 Internal CPU Registers
  public m_PC: number = 0x1020;
  public m_SP: number = 0x0000;
  public m_PS0: number = 0x00;
  public m_PS1: number = 0x00;
  public m_SYS: number = 0x00;
  public m_IE0: number = 0x00;
  public m_IE1: number = 0x00;
  public m_IR0: number = 0x00;
  public m_IR1: number = 0x00;
  public m_CKC: number = 0x00;
  public m_clock_changed: number = 0;
  public m_halted: number = 0;
  public m_IFLAGS: number = 0;
  public m_CheckInterrupts: number = 0;
  public m_oldpc: number = 0x1020;
  public cycles: number = 0;
  public dmaCount: number = 0;

  // Memory regions
  public m_register_ram: Uint8Array = new Uint8Array(0x108); // Banked CPU registers
  public m_p_ram: Uint8Array = new Uint8Array(0x0400);       // $0000-$03FF Internal RAM & SFRs
  public ram: Uint8Array;                                    // Alias for m_p_ram
  public videoram: Uint8Array = new Uint8Array(0x4000);      // $A000-$DFFF 16KB VRAM
  public nvram: Uint8Array = new Uint8Array(0x2000);         // $E000-$FFFF 8KB NVRAM (High Scores, PDA data)
  public internalRom: Uint8Array = new Uint8Array(0x1000);   // $1000-$1FFF 4KB Internal BIOS
  public externalRom: Uint8Array = new Uint8Array(0x40000);  // 256KB External Kernel ROM

  // 2MB Cartridge buffers (mirrored per MAME common_load)
  public cart1Rom: Uint8Array | null = null;
  public cart2Rom: Uint8Array | null = null;
  public activeCartRom: Uint8Array | null = null;
  public latchedCartSlot: 1 | 2 = 1;
  public dualCartridgeSlotFix: boolean = true;
  public correctClockSpeed: boolean = true;

  // MMU Bank values for Banks 1..4 ($2000-$9FFF)
  public mmu: Uint8Array = new Uint8Array(5);

  // Hardware Timers
  public m_timer: [GameComTimer, GameComTimer] = [
    { enabled: false, upcounter_max: 0, prescale_max: 1, prescale_count: 0 },
    { enabled: false, upcounter_max: 0, prescale_max: 1, prescale_count: 0 }
  ];

  // 1Hz / 1Min Clock Timer state
  public clockTimerAccumCycles: number = 0;

  // Audio state & callback
  public m_sound: GameComAudioState = {
    sgc: 0,
    sg0l: 0,
    sg1l: 0,
    sg2l: 0,
    sg0t: 0,
    sg1t: 0,
    sg2t: 0,
    sgda: 0,
    sg0w: new Uint8Array(16),
    sg1w: new Uint8Array(16)
  };
  public onDacSample?: (val: number, sampleRate: number) => void;
  public onDacStreamStart?: () => void;
  public onSoundRegWrite?: (sound: GameComAudioState) => void;
  public onBiosAudioClip?: (samples: Uint8Array, bank: number, addr: number) => void;
  public onNvramWrite?: (addr: number, data: number) => void;
  public allowDataFoundPrompt: boolean = false;
  public lastDacCycle: number = 0;

  public get pc(): number {
    return this.m_PC;
  }
  public get sp(): number {
    return this.m_SP;
  }

  // Scanline renderer & 200x160 output bitmap (values 0..3 for LCDSubsystem)
  public m_scanline: number = 0;
  public displayBuffer: Uint8Array = new Uint8Array(200 * 160);

  // Input state
  public buttonsState: GameComButtons = {
    up: false, down: false, left: false, right: false,
    a: false, b: false, c: false, d: false,
    menu: false, pause: false, sound: false, power: false, reset: false
  };
  public stylusPressed: boolean = false;
  public stylusX: number = 0;
  public stylusY: number = 0;

  constructor() {
    this.ram = this.m_p_ram;
    this.reset();
  }

  public reset() {
    this.m_register_ram.fill(0);
    this.m_p_ram.fill(0);
    this.videoram.fill(0);

    this.m_PC = 0x1020;
    this.m_SP = 0x0000;
    this.m_PS0 = 0x00;
    this.m_PS1 = 0x00;
    this.m_SYS = 0x00;
    this.m_IE0 = 0x00;
    this.m_IE1 = 0x00;
    this.m_IR0 = 0x00;
    this.m_IR1 = 0x00;
    this.m_CKC = 0x00;
    this.m_clock_changed = 0;
    this.m_halted = 0;
    this.m_IFLAGS = 0;
    this.m_CheckInterrupts = 0;
    this.cycles = 0;
    this.lastDacCycle = 0;
    this.dmaCount = 0;
    this.m_scanline = 0;
    this.clockTimerAccumCycles = 0;

    // MAME machine_reset defaults
    this.mmu[0] = 0;
    this.mmu[1] = 0;
    this.mmu[2] = 0;
    this.mmu[3] = 0;
    this.mmu[4] = 0;
    this.activeCartRom = null;

    this.m_timer[0] = { enabled: false, upcounter_max: 0, prescale_max: 1, prescale_count: 0 };
    this.m_timer[1] = { enabled: false, upcounter_max: 0, prescale_max: 1, prescale_count: 0 };

    // MAME sm8500_cpu_device::device_reset writes
    this.mem_writeword(0x10, 0x0000); // IE0, IE1
    this.mem_writeword(0x12, 0x0000); // IR0, IR1
    this.mem_writeword(0x14, 0xffff); // P0, P1
    this.mem_writeword(0x16, 0xff00); // P2, P3
    this.mem_writebyte(0x19, 0x00);   // SYS
    this.mem_writebyte(0x1a, 0x00);   // CKC
    this.mem_writebyte(0x1f, 0x00);   // PS1
    this.mem_writebyte(0x2b, 0xff);   // URTT
    this.mem_writebyte(0x2d, 0x42);   // URTS
    this.mem_writebyte(0x5f, 0x38);   // WDTC

    this.m_p_ram[SM8521_LCH] = 0x07;
    this.m_p_ram[SM8521_LCV] = 0x27;
    this.m_p_ram[SM8521_LCDC] = 0xb0;
  }

  public loadInternalBIOS(data: Uint8Array) {
    this.internalRom.fill(0xff);
    this.internalRom.set(data.subarray(0, Math.min(data.length, 0x1000)));
  }

  public loadExternalBIOS(data: Uint8Array) {
    this.externalRom.fill(0xff);
    const len = Math.min(data.length, 0x40000);
    this.externalRom.set(data.subarray(0, len));
  }

  /**
   * MAME common_load: allocates a 2MB (0x200000) cartridge buffer,
   * loads 0x1C0000 (1.75MB) ROMs at offset 0x40000, and mirrors smaller ROMs across the full 2MB space.
   */
  public static prepareCartridgeBuffer(romData: Uint8Array): Uint8Array {
    const crt = new Uint8Array(0x200000);
    const size = romData.length;
    let loadOffset = 0;
    if (size === 0x1c0000) {
      loadOffset = 0x40000;
    }
    const copyLen = Math.min(size, 0x200000 - loadOffset);
    crt.set(romData.subarray(0, copyLen), loadOffset);

    if (size > 0 && size !== 0x1c0000) {
      // Mirror non-power-of-two or smaller power-of-two up to 2MB
      if (size <= 0x008000) crt.copyWithin(0x008000, 0, 0x008000);
      if (size <= 0x010000) crt.copyWithin(0x010000, 0, 0x010000);
      if (size <= 0x020000) crt.copyWithin(0x020000, 0, 0x020000);
      if (size <= 0x040000) crt.copyWithin(0x040000, 0, 0x040000);
      if (size <= 0x080000) crt.copyWithin(0x080000, 0, 0x080000);
      if (size <= 0x100000) crt.copyWithin(0x100000, 0, 0x100000);
    }
    return crt;
  }

  public loadCartridgeROM(romData: Uint8Array | null, slot: 1 | 2 = 1) {
    const prepared = romData && romData.length > 0 ? SM8521CPU.prepareCartridgeBuffer(romData) : null;
    if (slot === 1) {
      this.cart1Rom = prepared;
    } else {
      this.cart2Rom = prepared;
    }
    this.updateActiveCartPtr();
  }

  private updateActiveCartPtr() {
    const p3 = this.m_p_ram[SM8521_P3] & 0xc0;
    if (p3 === 0x40) {
      this.activeCartRom = this.cart1Rom;
    } else if (p3 === 0x80) {
      this.activeCartRom = this.cart2Rom;
    } else {
      this.activeCartRom = null;
    }
  }

  private get_sp() {
    this.m_SP = this.m_p_ram[0x1d];
    if (this.m_SYS & 0x40) {
      this.m_SP |= (this.m_p_ram[0x1c] << 8);
    }
  }

  public set_input_line(inptnum: number, assertLine: boolean) {
    this.m_IR0 = this.m_p_ram[0x12];
    this.m_IR1 = this.m_p_ram[0x13];
    if (assertLine) {
      this.m_IFLAGS |= (0x01 << inptnum);
      this.m_CheckInterrupts = 1;
      switch (inptnum) {
        case DMA_INT:  this.m_IR0 |= 0x80; break;
        case TIM0_INT: this.m_IR0 |= 0x40; break;
        case EXT_INT:  this.m_IR0 |= 0x10; break;
        case UART_INT: this.m_IR0 |= 0x08; break;
        case LCDC_INT: this.m_IR0 |= 0x01; break;
        case TIM1_INT: this.m_IR1 |= 0x40; break;
        case CK_INT:   this.m_IR1 |= 0x10; break;
        case PIO_INT:  this.m_IR1 |= 0x04; break;
      }
    } else {
      this.m_IFLAGS &= ~(0x01 << inptnum);
      switch (inptnum) {
        case DMA_INT:  this.m_IR0 &= ~0x80; break;
        case TIM0_INT: this.m_IR0 &= ~0x40; break;
        case EXT_INT:  this.m_IR0 &= ~0x10; break;
        case UART_INT: this.m_IR0 &= ~0x08; break;
        case LCDC_INT: this.m_IR0 &= ~0x01; break;
        case TIM1_INT: this.m_IR1 &= ~0x40; break;
        case CK_INT:   this.m_IR1 &= ~0x10; break;
        case PIO_INT:  this.m_IR1 &= ~0x04; break;
      }
      if (this.m_IFLAGS === 0) {
        this.m_CheckInterrupts = 0;
      }
    }
    this.m_p_ram[0x12] = this.m_IR0;
    this.m_p_ram[0x13] = this.m_IR1;
  }

  private push_byte(val: number) {
    this.m_SP = (this.m_SP - 1) & 0xffff;
    if ((this.m_SYS & 0x40) === 0) {
      this.m_SP &= 0xff;
    }
    this.mem_writebyte(this.m_SP, val & 0xff);
  }

  private take_interrupt(vector: number) {
    this.get_sp();
    this.m_SYS = this.m_p_ram[0x19];
    this.m_PS1 = this.m_p_ram[0x1f];

    // Push PC
    this.push_byte(this.m_PC & 0xff);
    this.push_byte((this.m_PC >> 8) & 0xff);
    // Push PS1
    this.push_byte(this.m_PS1);
    // Clear I flag
    this.m_PS1 &= ~0x01;

    // Save regs to RAM
    this.m_p_ram[0x1f] = this.m_PS1;
    this.m_p_ram[0x1d] = this.m_SP & 0xff;
    if (this.m_SYS & 0x40) {
      this.m_p_ram[0x1c] = (this.m_SP >> 8) & 0xff;
    }

    this.m_PC = this.mem_readword(vector);
  }

  private process_interrupts() {
    if (this.m_CheckInterrupts) {
      this.m_IE0 = this.m_p_ram[0x10];
      this.m_IE1 = this.m_p_ram[0x11];
      this.m_IR0 = this.m_p_ram[0x12];
      this.m_IR1 = this.m_p_ram[0x13];
      this.m_PS0 = this.m_p_ram[0x1e];
      this.m_PS1 = this.m_p_ram[0x1f];

      // Even if PS1.I == 0 (DI), an enabled interrupt (such as DMA_INT) wakes the CPU from HALT
      if ((this.m_PS1 & 0x01) === 0) {
        if ((this.m_IFLAGS & (1 << DMA_INT)) && (this.m_IE0 & 0x80)) {
          this.m_halted = 0;
          this.m_IFLAGS &= ~(1 << DMA_INT);
        } else if (
          ((this.m_IR0 & this.m_IE0) !== 0) ||
          ((this.m_IR1 & this.m_IE1) !== 0)
        ) {
          this.m_halted = 0;
        }
        return;
      }

      let irqline = 0;
      while (irqline < 11) {
        if (this.m_IFLAGS & (1 << irqline)) {
          this.m_halted = 0;
          this.m_IE0 = this.m_p_ram[0x10];
          this.m_IE1 = this.m_p_ram[0x11];
          this.m_IR0 = this.m_p_ram[0x12];
          this.m_IR1 = this.m_p_ram[0x13];
          this.m_PS0 = this.m_p_ram[0x1e];
          this.m_PS1 = this.m_p_ram[0x1f];

          switch (irqline) {
            case WDT_INT:
              this.take_interrupt(0x101c);
              break;
            case ILL_INT:
            case NMI_INT:
              this.take_interrupt(0x101e);
              break;
            case DMA_INT:
              this.m_IR0 |= 0x80;
              if ((this.m_IE0 & 0x80) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x1000);
              }
              break;
            case TIM0_INT:
              this.m_IR0 |= 0x40;
              if ((this.m_IE0 & 0x40) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x1002);
              }
              break;
            case EXT_INT:
              this.m_IR0 |= 0x10;
              if ((this.m_IE0 & 0x10) && ((this.m_PS0 & 0x07) < 7) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x1006);
              }
              break;
            case UART_INT:
              this.m_IR0 |= 0x08;
              if ((this.m_IE0 & 0x08) && ((this.m_PS0 & 0x07) < 6) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x1008);
              }
              break;
            case LCDC_INT:
              this.m_IR0 |= 0x01;
              if ((this.m_IE0 & 0x01) && ((this.m_PS0 & 0x07) < 5) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x100e);
              }
              break;
            case TIM1_INT:
              this.m_IR1 |= 0x40;
              if ((this.m_IE1 & 0x40) && ((this.m_PS0 & 0x07) < 4) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x1012);
              }
              break;
            case CK_INT:
              this.m_IR1 |= 0x10;
              if ((this.m_IE1 & 0x10) && ((this.m_PS0 & 0x07) < 3) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x1016);
              }
              break;
            case PIO_INT:
              this.m_IR1 |= 0x04;
              if ((this.m_IE1 & 0x04) && ((this.m_PS0 & 0x07) < 2) && (this.m_PS1 & 0x01)) {
                this.take_interrupt(0x101a);
              }
              break;
          }
          this.m_IFLAGS &= ~(1 << irqline);
          this.m_p_ram[0x12] = this.m_IR0;
          this.m_p_ram[0x13] = this.m_IR1;
        }
        irqline++;
      }
    }
  }

  private handle_stylus_press(column: number) {
    // 13 columns (0..12), 10 rows (0..9), each cell ~16x16 pixels
    let data = 0;
    if (this.stylusPressed) {
      const col = Math.min(12, Math.max(0, Math.floor(this.stylusX / 16)));
      const row = Math.min(9, Math.max(0, Math.floor(this.stylusY / 16)));
      if (col === column) {
        data = 1 << row;
      }
    }
    if (data) {
      const stylus_y = data ^ 0x3ff;
      this.m_p_ram[SM8521_P0] = stylus_y & 0xff;
      this.m_p_ram[SM8521_P1] = (this.m_p_ram[SM8521_P1] & 0xfc) | ((stylus_y >> 8) & 0x03);
    } else {
      this.m_p_ram[SM8521_P0] = 0xff;
      this.m_p_ram[SM8521_P1] |= 0x03;
    }
  }

  private readIn0(): number {
    let val = 0xff;
    if (this.buttonsState.up) val &= ~0x01;
    if (this.buttonsState.down) val &= ~0x02;
    if (this.buttonsState.left) val &= ~0x04;
    if (this.buttonsState.right) val &= ~0x08;
    if (this.buttonsState.menu) val &= ~0x10;
    if (this.buttonsState.pause) val &= ~0x20;
    if (this.buttonsState.sound) val &= ~0x40;
    if (this.buttonsState.a) val &= ~0x80;
    return val;
  }

  private readIn1(): number {
    let val = 0xff;
    if (this.buttonsState.b) val &= ~0x01;
    if (this.buttonsState.c) val &= ~0x02;
    return val;
  }

  private readIn2(): number {
    let val = 0xff;
    if (this.buttonsState.reset || this.buttonsState.power) val &= ~0x01;
    if (this.buttonsState.d) val &= ~0x02;
    if (this.stylusPressed) val &= ~0x04;
    return val;
  }

  private handle_input_press(mux_data: number) {
    switch (mux_data & 0xffff) {
      case 0xfffb: this.handle_stylus_press(0); break;
      case 0xfff7: this.handle_stylus_press(1); break;
      case 0xffef: this.handle_stylus_press(2); break;
      case 0xffdf: this.handle_stylus_press(3); break;
      case 0xffbf: this.handle_stylus_press(4); break;
      case 0xff7f: this.handle_stylus_press(5); break;
      case 0xfeff: this.handle_stylus_press(6); break;
      case 0xfdff: this.handle_stylus_press(7); break;
      case 0xfbff: this.handle_stylus_press(8); break;
      case 0xf7ff: this.handle_stylus_press(9); break;
      case 0xefff: this.handle_stylus_press(10); break;
      case 0xdfff: this.handle_stylus_press(11); break;
      case 0xbfff: this.handle_stylus_press(12); break;
      case 0x7fff: // keys #1
        this.m_p_ram[SM8521_P0] = this.readIn0();
        this.m_p_ram[SM8521_P1] = (this.m_p_ram[SM8521_P1] & 0xfc) | (this.readIn1() & 0x03);
        break;
      case 0xffff: // keys #2
        this.m_p_ram[SM8521_P0] = (this.m_p_ram[SM8521_P0] & 0xfc) | (this.readIn2() & 0x03);
        this.m_p_ram[SM8521_P1] = 0xff;
        break;
    }
  }

  private readMmuBank(bankIndex: 1 | 2 | 3 | 4, offsetInBank: number): number {
    const mmuVal = this.mmu[bankIndex] & 0xff;
    const offset = offsetInBank & 0x1fff;
    if (mmuVal < 0x20) {
      const addr = ((mmuVal << 13) + offset) & 0x3ffff;
      return this.externalRom[addr];
    } else {
      if (this.activeCartRom) {
        const addr = ((mmuVal << 13) + offset) & 0x1fffff;
        return this.activeCartRom[addr];
      }
      return 0xff;
    }
  }

  public program_read_byte(addr: number): number {
    addr &= 0xffff;
    if (addr < 0x0400) {
      return this.m_p_ram[addr];
    }
    if (addr < 0x1000) {
      return 0xff;
    }
    if (addr < 0x2000) {
      return this.internalRom[addr - 0x1000];
    }
    if (addr < 0x4000) {
      return this.readMmuBank(1, addr - 0x2000);
    }
    if (addr < 0x6000) {
      return this.readMmuBank(2, addr - 0x4000);
    }
    if (addr < 0x8000) {
      return this.readMmuBank(3, addr - 0x6000);
    }
    if (addr < 0xa000) {
      return this.readMmuBank(4, addr - 0x8000);
    }
    if (addr < 0xe000) {
      // MAME gamecom.cpp: VRAM is write-only, returns 0 on read (required by The Lost World, etc.)
      return 0x00;
    }
    return this.nvram[addr - 0xe000];
  }

  public program_write_byte(addr: number, data: number) {
    addr &= 0xffff;
    data &= 0xff;

    if (addr < 0x0400) {
      if (addr >= 0x0014 && addr <= 0x0017) {
        if (addr === SM8521_P3) {
          // Check if CPU is currently executing inside cartridge ROM space ($2000-$9FFF with MMU >= 0x20)
          const pcBankIdx = this.m_PC >> 13;
          const inCartridgeSpace =
            this.m_PC >= 0x2000 &&
            this.m_PC < 0xa000 &&
            this.mmu[pcBankIdx] >= 0x20;

          if (!inCartridgeSpace) {
            // BIOS is selecting a cartridge slot ($3FC4 = 0x40 Slot 1, $3FC9 = 0x80 Slot 2)
            if ((data & 0xc0) === 0x40) {
              this.latchedCartSlot = 1;
            } else if ((data & 0xc0) === 0x80) {
              this.latchedCartSlot = 2;
            }
          } else if (this.dualCartridgeSlotFix) {
            // Fix for Frogger & Centipede Dual Cartridge Slot Bug:
            // Preserve the active BIOS-selected slot chip-select bit (0x40 or 0x80) when a cartridge
            // writes to P3 (e.g., Frogger's AND P3, #$F0 at $4078 or MOV P3, #$50), without leaking data.
            const slotBits = this.latchedCartSlot === 2 ? 0x80 : 0x40;
            data = (data & 0x3f) | slotBits;
          }
        }
        this.m_p_ram[addr] = data;
        if (addr === SM8521_P1 || addr === SM8521_P2) {
          this.handle_input_press(this.m_p_ram[SM8521_P1] | (this.m_p_ram[SM8521_P2] << 8));
        } else if (addr === SM8521_P3) {
          this.updateActiveCartPtr();
        }
        return;
      }

      if (addr >= 0x0020 && addr <= 0x007f) {
        switch (addr) {
          case SM8521_MMU1: this.mmu[1] = data; break;
          case SM8521_MMU2: this.mmu[2] = data; break;
          case SM8521_MMU3: this.mmu[3] = data; break;
          case SM8521_MMU4: this.mmu[4] = data; break;
          case SM8521_DMBR: data &= 0x7f; break;
          case SM8521_TM0D:
            this.m_timer[0].upcounter_max = data;
            data = 0;
            break;
          case SM8521_TM0C:
            this.m_timer[0].enabled = (data & 0x80) !== 0;
            this.m_timer[0].prescale_max = gamecom_timer_limit[data & 0x07] >> 1;
            this.m_timer[0].prescale_count = 0;
            this.m_p_ram[SM8521_TM0D] = 0;
            break;
          case SM8521_TM1D:
            this.m_timer[1].upcounter_max = data;
            data = 0;
            break;
          case SM8521_TM1C:
            this.m_timer[1].enabled = (data & 0x80) !== 0;
            // When BIOS sets TM1C = $81 for $5F37 digitized waveform streaming, use a fast prescaler
            // so all 32-byte blocks complete smoothly during the 3D Globe / Cartridge Launch sequence.
            if (data === 0x81 && this.m_p_ram[0x0102] === 0x5f && this.m_p_ram[0x0103] === 0x37) {
              this.m_timer[1].prescale_max = 16;
            } else {
              this.m_timer[1].prescale_max = gamecom_timer_limit[data & 0x07] >> 1;
            }
            this.m_timer[1].prescale_count = 0;
            this.m_p_ram[SM8521_TM1D] = 0;
            break;
          case SM8521_CLKT:
            if (!(data & 0x80)) {
              data &= 0xc0;
            }
            break;
          case SM8521_SGC:
            this.m_sound.sgc = data;
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG0L:
            this.m_sound.sg0l = data;
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG1L:
            this.m_sound.sg1l = data;
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG0TH:
            this.m_sound.sg0t = (this.m_sound.sg0t & 0xff) | (data << 8);
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG0TL:
            this.m_sound.sg0t = (this.m_sound.sg0t & 0xff00) | data;
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG1TH:
            this.m_sound.sg1t = (this.m_sound.sg1t & 0xff) | (data << 8);
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG1TL:
            this.m_sound.sg1t = (this.m_sound.sg1t & 0xff00) | data;
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG2L:
            this.m_sound.sg2l = data;
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG2TH:
            this.m_sound.sg2t = (this.m_sound.sg2t & 0xff) | (data << 8);
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SG2TL:
            this.m_sound.sg2t = (this.m_sound.sg2t & 0xff00) | data;
            if (this.onSoundRegWrite) this.onSoundRegWrite(this.m_sound);
            break;
          case SM8521_SGDA: {
            const prevSgda = this.m_sound.sgda;
            this.m_sound.sgda = data;
            if ((this.m_sound.sgc & 0x88) === 0x88 && this.onDacSample) {
              const deltaCycles = this.cycles - this.lastDacCycle;
              this.lastDacCycle = this.cycles;
              // Filter out the 18-cycle DC anti-pop ramp loops ($56E7 and $56F7) which occur < 64 cycles apart
              if (deltaCycles >= 64) {
                const tm1d = this.m_p_ram[SM8521_TM1D] || 208;
                const prescale = this.m_timer[1].prescale_max || 1;
                const div = this.m_p_ram[0xac] || 3;
                const periodCycles = Math.max(128, tm1d * prescale * div);
                const hwRate = Math.max(4000, Math.min(22050, Math.round(4915200 / periodCycles)));
                // Emit latched Zero-Order Hold samples if Timer 1 ISR held the DAC output across multiple ticks
                if (deltaCycles > periodCycles * 1.5 && deltaCycles <= periodCycles * 48) {
                  const holdCount = Math.min(48, Math.round(deltaCycles / periodCycles)) - 1;
                  for (let h = 0; h < holdCount; h++) {
                    this.onDacSample(prevSgda, hwRate);
                  }
                }
                this.onDacSample(data, hwRate);
              }
            }
            break;
          }
          default:
            if (addr >= SM8521_SG0W0 && addr < SM8521_SG0W0 + 16) {
              this.m_sound.sg0w[addr - SM8521_SG0W0] = data;
            } else if (addr >= SM8521_SG1W0 && addr < SM8521_SG1W0 + 16) {
              this.m_sound.sg1w[addr - SM8521_SG1W0] = data;
            }
            break;
        }
        this.m_p_ram[addr] = data;
        return;
      }

      this.m_p_ram[addr] = data;
      return;
    }

    if (addr >= 0xa000 && addr < 0xe000) {
      this.videoram[addr - 0xa000] = data;
      return;
    }

    if (addr >= 0xe000) {
      this.nvram[addr - 0xe000] = data;
      if (this.onNvramWrite) {
        this.onNvramWrite(addr, data);
      }
    }
  }

  public mem_readbyte(offset: number): number {
    offset &= 0xffff;
    if (offset < 0x10) {
      return this.m_register_ram[offset + (this.m_PS0 & 0xf8)];
    }
    return this.program_read_byte(offset);
  }

  public mem_writebyte(offset: number, data: number) {
    offset &= 0xffff;
    data &= 0xff;
    if (offset < 0x10) {
      this.m_register_ram[offset + (this.m_PS0 & 0xf8)] = data;
    }
    this.program_write_byte(offset, data);
    switch (offset) {
      case 0x10: this.m_IE0 = data; break;
      case 0x11: this.m_IE1 = data; break;
      case 0x12: this.m_IR0 = data; break;
      case 0x13: this.m_IR1 = data; break;
      case 0x19: this.m_SYS = data; break;
      case 0x1a: this.m_CKC = data; break;
      case 0x1c:
      case 0x1d: this.get_sp(); break;
      case 0x1e:
        this.m_PS0 = data;
        for (let i = 0; i < 16; i++) {
          this.program_write_byte(i, this.mem_readbyte(i));
        }
        break;
      case 0x1f: this.m_PS1 = data; break;
    }
  }

  public mem_readword(offset: number): number {
    const hi = this.mem_readbyte(offset);
    const lo = this.mem_readbyte((offset + 1) & 0xffff);
    return ((hi << 8) | lo) & 0xffff;
  }

  public mem_writeword(offset: number, value: number) {
    this.mem_writebyte(offset, (value >> 8) & 0xff);
    this.mem_writebyte((offset + 1) & 0xffff, value & 0xff);
  }

  // Backward-compatible aliases
  public readByte(addr: number): number {
    return this.mem_readbyte(addr);
  }

  public writeByte(addr: number, val: number) {
    this.mem_writebyte(addr, val);
  }

  /**
   * Exact port of MAME gamecom_state::gamecom_handle_dma
   * Triggered while CPU is halted (m_halted != 0).
   */
  public gamecom_handle_dma(_cycles: number) {
    const dmc = this.m_p_ram[SM8521_DMC];
    if (!(dmc & 0x80)) return;

    this.dmaCount++;
    const overwrite_mode = (dmc & 0x01) !== 0;
    const transfer_mode = dmc & 0x06;
    const adjust_x = (dmc & 0x08) ? -1 : 1;
    const decrement_y = (dmc & 0x10) !== 0;
    const block_width = this.m_p_ram[SM8521_DMDX];
    const block_height = this.m_p_ram[SM8521_DMDY];
    const source_x = this.m_p_ram[SM8521_DMX1];
    let source_x_current = source_x & 3;
    const source_y = this.m_p_ram[SM8521_DMY1];
    let source_width = (this.m_p_ram[SM8521_LCH] & 0x20) ? 50 : 40;
    let dest_width = source_width;
    const dest_x = this.m_p_ram[SM8521_DMX2];
    let dest_x_current = dest_x & 3;
    const dest_y = this.m_p_ram[SM8521_DMY2];
    const palette = this.m_p_ram[SM8521_DMPL];
    let source_mask = 0x1fff;
    const dest_mask = 0x1fff;

    const srcVramOffset = (this.m_p_ram[SM8521_DMVP] & 0x01) ? 0x2000 : 0x0000;
    const dstVramOffset = (this.m_p_ram[SM8521_DMVP] & 0x02) ? 0x2000 : 0x0000;

    let source_bank: Uint8Array = this.videoram;
    let source_base = srcVramOffset;
    let dest_bank: Uint8Array = this.videoram;
    let dest_base = dstVramOffset;

    switch (transfer_mode) {
      case 0x00: // VRAM -> VRAM
        break;
      case 0x02: { // ROM -> VRAM
        source_width = 64;
        source_mask = 0x3fff;
        const dmbr = this.m_p_ram[SM8521_DMBR];
        if (dmbr < 16) {
          source_bank = this.externalRom;
          source_base = (dmbr << 14) & 0x3ffff;
        } else if (this.activeCartRom) {
          source_bank = this.activeCartRom;
          source_base = (dmbr << 14) & 0x1fffff;
        } else {
          source_bank = this.externalRom;
          source_base = 0;
        }
        break;
      }
      case 0x04: // Extend RAM -> VRAM
        source_width = 64;
        source_bank = this.nvram;
        source_base = 0;
        break;
      case 0x06: // VRAM -> Extend RAM
        dest_width = 64;
        dest_bank = this.nvram;
        dest_base = 0;
        break;
    }

    let source_current = source_width * source_y + (source_x >> 2);
    let dest_current = dest_width * dest_y + (dest_x >> 2);
    let source_line = source_current;
    let dest_line = dest_current;

    for (let y_count = 0; y_count <= block_height; y_count++) {
      for (let x_count = 0; x_count <= block_width; x_count++) {
        const src_addr = source_base + (source_current & source_mask);
        const dst_addr = dest_base + (dest_current & dest_mask);
        const dst_adj = (dest_x_current ^ 3) << 1;
        const src_adj = (source_x_current ^ 3) << 1;

        const source_pixel = ((source_bank[src_addr] || 0) >> src_adj) & 3;
        if (overwrite_mode || source_pixel !== 0) {
          const other_pixels = dest_bank[dst_addr] & ~(3 << dst_adj);
          dest_bank[dst_addr] = other_pixels | (((palette >> (source_pixel << 1)) & 3) << dst_adj);
        }

        source_x_current = (source_x_current + adjust_x) & 0xff;
        if (source_x_current & 0x04) {
          source_current = (source_current + adjust_x) & 0xffff;
          source_x_current &= 3;
        }

        dest_x_current++;
        if (dest_x_current & 0x04) {
          dest_current = (dest_current + 1) & 0xffff;
          dest_x_current &= 3;
        }
      }

      source_x_current = source_x & 3;
      dest_x_current = dest_x & 3;
      if (decrement_y) {
        source_line = (source_line - source_width) & 0xffff;
      } else {
        source_line = (source_line + source_width) & 0xffff;
      }
      source_current = source_line;
      dest_line = (dest_line + dest_width) & 0xffff;
      dest_current = dest_line;
    }

    this.m_p_ram[SM8521_DMC] &= 0x7f;
    this.set_input_line(DMA_INT, true);
  }

  /**
   * Exact port of MAME gamecom_state::gamecom_update_timers
   */
  public gamecom_update_timers(cycles: number) {
    if (this.m_timer[0].enabled) {
      this.m_timer[0].prescale_count += cycles;
      while (this.m_timer[0].prescale_count >= this.m_timer[0].prescale_max) {
        this.m_timer[0].prescale_count -= this.m_timer[0].prescale_max;
        this.m_p_ram[SM8521_TM0D] = (this.m_p_ram[SM8521_TM0D] + 1) & 0xff;
        if (this.m_p_ram[SM8521_TM0D] >= this.m_timer[0].upcounter_max) {
          this.m_p_ram[SM8521_TM0D] = 0;
          if (this.m_p_ram[SM8521_IE0] & 0x40) {
            this.set_input_line(TIM0_INT, true);
          }
        }
      }
    }

    if (this.m_timer[1].enabled) {
      this.m_timer[1].prescale_count += cycles;
      while (this.m_timer[1].prescale_count >= this.m_timer[1].prescale_max) {
        this.m_timer[1].prescale_count -= this.m_timer[1].prescale_max;
        this.m_p_ram[SM8521_TM1D] = (this.m_p_ram[SM8521_TM1D] + 1) & 0xff;
        if (this.m_p_ram[SM8521_TM1D] >= this.m_timer[1].upcounter_max) {
          this.m_p_ram[SM8521_TM1D] = 0;
          if (this.m_p_ram[SM8521_IE1] & 0x40) {
            this.set_input_line(TIM1_INT, true);
          }
        }
      }
    }

    // 1Hz / 60s Real-Time Clock Timer (SM8521_CLKT)
    const clkt = this.m_p_ram[SM8521_CLKT];
    if (clkt & 0x80) {
      this.clockTimerAccumCycles += cycles;
      const limitCycles = (clkt & 0x40) ? (5529600 * 60) : 5529600;
      if (this.clockTimerAccumCycles >= limitCycles) {
        this.clockTimerAccumCycles -= limitCycles;
        const val = (clkt + 1) & 0x3f;
        this.m_p_ram[SM8521_CLKT] = (clkt & 0xc0) | val;
        this.set_input_line(CK_INT, true);
      }
    }
  }

  /**
   * Exact port of MAME gamecom_state::gamecom_scanline (gamecom_v.cpp)
   * Note: Game.com VRAM is stored column-major (200 columns of 40 bytes = 160 vertical pixels per column).
   * Renders column `m_scanline` (x = 0..199) for y = 0..159 into `displayBuffer[y * 200 + x]`.
   */
  public renderScanline() {
    const x = this.m_scanline;
    const lcdc = this.m_p_ram[SM8521_LCDC];
    const base_address = (lcdc & 0x40) ? 0x2000 : 0x0000;

    if (!(lcdc & 0x80)) {
      for (let y = 0; y < 160; y++) {
        this.displayBuffer[y * 200 + x] = 0;
      }
    } else {
      // Map raw 2-bit VRAM pixel to 0..3 shade (0 = lightest LCD background, 3 = darkest black)
      let p0 = 0, p1 = 1, p2 = 2, p3 = 3;
      switch (lcdc & 0x30) {
        case 0x00: p0 = 0; p1 = 1; p2 = 2; p3 = 3; break;
        case 0x10:
        case 0x20: p0 = 0; p1 = 1; p2 = 2; p3 = 3; break;
        case 0x30: p0 = 0; p1 = 2; p2 = 2; p3 = 3; break;
      }
      const pal = [p0, p1, p2, p3];
      const lineOffset = base_address + 40 * x;

      for (let i = 0; i < 40; i++) {
        const p = this.videoram[lineOffset + i];
        const yBase = i * 4;
        this.displayBuffer[(yBase + 0) * 200 + x] = pal[(p >> 6) & 3];
        this.displayBuffer[(yBase + 1) * 200 + x] = pal[(p >> 4) & 3];
        this.displayBuffer[(yBase + 2) * 200 + x] = pal[(p >> 2) & 3];
        this.displayBuffer[(yBase + 3) * 200 + x] = pal[p & 3];
      }
    }

    this.m_scanline = (this.m_scanline + 1) % 200;
  }

  /**
   * Executes a single CPU step (1 instruction or 4-cycle halt/DMA step).
   */
  public step(): number {
    let mycycles = 0;
    let r1 = 0, r2 = 0;
    let s1 = 0, s2 = 0;
    let d1 = 0, d2 = 0;
    let res = 0;

    this.process_interrupts();

    if (!this.m_halted) {
      // 1. Suppress BIOS "DATA FOUND.. PRESS A TO KEEP / PRESS B TO CLEAR" prompt ($5E11 in Bank 3)
      //    unless explicitly requested by the user via allowDataFoundPrompt.
      if (this.m_PC === 0x5e11 && this.mmu[2] === 3) {
        if (this.allowDataFoundPrompt) {
          this.allowDataFoundPrompt = false;
        } else {
          // Execute equivalent of $5E66 (Button A = Keep Data: DI; CLRC; RET)
          this.get_sp();
          this.m_SYS = this.m_p_ram[0x19];
          this.m_PS1 = this.m_p_ram[0x1f] & ~(FLAG_I | FLAG_C);
          const hi = this.mem_readbyte(this.m_SP);
          this.m_SP = (this.m_SP + 1) & 0xffff;
          if ((this.m_SYS & 0x40) === 0) this.m_SP &= 0xff;
          const lo = this.mem_readbyte(this.m_SP);
          this.m_SP = (this.m_SP + 1) & 0xffff;
          if ((this.m_SYS & 0x40) === 0) this.m_SP &= 0xff;
          this.m_PC = ((hi << 8) | lo) & 0xffff;
          if (this.m_SYS & 0x40) {
            this.program_write_byte(0x1c, (this.m_SP >> 8) & 0xff);
          }
          this.program_write_byte(0x1d, this.m_SP & 0xff);
          this.program_write_byte(0x1f, this.m_PS1);
        }
      }

      // 2. Intercept BIOS ADPCM DAC Stream start ($56A3 -> $56B4 in Bank 5)
      if (this.m_PC === 0x56b4 && this.mmu[2] === 5) {
        if (this.onDacStreamStart) {
          this.onDacStreamStart();
        }
      }

      // 3. Intercept BIOS Digitized Waveform Stream start ($2354 in Bank 2)
      //    Decodes the audio clip prepared by $233F -> $435B in Register Bank $38 and triggers Web Audio playback.
      if (this.m_PC === 0x2354 && this.mmu[1] === 2 && this.onBiosAudioClip) {
        const clipBank = this.m_register_ram[0x38 + 4];
        const clipAddr = (this.m_register_ram[0x38 + 2] << 8) | this.m_register_ram[0x38 + 3];
        const clipBlocks = (this.m_register_ram[0x38 + 6] << 8) | this.m_register_ram[0x38 + 7];
        const byteLen = clipBlocks * 32;
        if (byteLen > 0 && byteLen <= 0x10000 && clipAddr >= 0x6000 && clipAddr < 0x8000) {
          const romSrc = clipBank < 0x20 ? this.externalRom : this.activeCartRom;
          if (romSrc) {
            const startOff = (clipBank << 13) + (clipAddr - 0x6000);
            const mask = clipBank < 0x20 ? 0x3ffff : 0x1fffff;
            const samples = new Uint8Array(byteLen);
            for (let i = 0; i < byteLen; i++) {
              samples[i] = romSrc[(startOff + i) & mask];
            }
            this.onBiosAudioClip(samples, clipBank, clipAddr);
          }
        }
      }

      this.m_oldpc = this.m_PC;
      const op = this.mem_readbyte(this.m_PC);
      this.m_PC = (this.m_PC + 1) & 0xffff;
      this.m_SYS = this.m_p_ram[0x19];
      this.m_PS0 = this.m_p_ram[0x1e];
      this.m_PS1 = this.m_p_ram[0x1f];
      this.get_sp();

      switch (op) {
case 0x00:  /* CLR R - 4 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, 0 );
	mycycles += 4;
	break;
case 0x01:  /* NEG R - 5 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	res = (-(this.mem_readbyte( r1 ))) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_C | FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0x80 ) ? FLAG_V : 0 );;
	this.mem_writebyte( r1 , res & 0xFF );
	mycycles += 5;
	break;
case 0x02:  /* COM R - 4 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	res = (~(this.mem_readbyte( r1 ))) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x03:  /* RR R - 4 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = d1 >> 1;                          if ( d1 & 0x01 ) {                                  res |= 0x80;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ! ( res & 0x80 ) ) ? FLAG_V : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x04:  /* RL R - 4 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = (d1 << 1) & 0xFF;                          if ( d1 & 0x80 ) {                                  res |= 0x01;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x80 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ res ) & 0x80 ) ? FLAG_V : 0 );;
	this.mem_writebyte( r1 , res & 0xFF );
	mycycles += 4;
	break;
case 0x05:  /* RRC R - 4 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = d1 >> 1;                          if ( this.m_PS1 & FLAG_C ) {                                  res |= 0x80;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ! ( res & 0x80 ) ) ? FLAG_V : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x06:  /* RLC R - 4 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = (d1 << 1) & 0xFF;                          if ( this.m_PS1 & FLAG_C ) {                                  res |= 0x01;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x80 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ res ) & 0x80 ) ? FLAG_V : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x07:  /* SRL R - 4 cycles - Flags affected: CZ00---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = d1 >> 1;                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x08:  /* INC R - 4 cycles - Flags affected: -ZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = (d1 + 1) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ! ( res & 0x80 ) ) ? FLAG_V : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x09:  /* DEC R - 4 cycles - Flags affected: -ZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = (d1 - 1) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ( res & 0x80 ) ) ? FLAG_V : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x0A:  /* SRA R - 4 cycles - Flags affected: CZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = d1 >> 1;                          if ( d1 & 0x80 ) {                                  res |= 0x80;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x0B:  /* SLL R - 4 cycles - Flags affected: CZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = (d1 << 1) & 0xFF;                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x80 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x0C:  /* DA R - 4 cycles - Flags affected: CZS----- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = d1;                          if ( this.m_PS1 & FLAG_D ) {                                  if ( this.m_PS1 & FLAG_C ) {                                          if ( this.m_PS1 & FLAG_H ) {                                                  res += 0x9A;                                          } else {                                                  res += 0xA0;                                          }                                  } else {                                          if ( this.m_PS1 & FLAG_H ) {                                                  res += 0xFA;                                          }                                  }                          } else {                                  if ( this.m_PS1 & FLAG_C ) {                                          if ( this.m_PS1 & FLAG_H ) {                                                  res += 0x66;                                          } else {                                                  if ( ( res & 0x0F ) < 10 ) {                                                          res += 0x60;                                                  } else {                                                          res += 0x66;                                                  }                                          }                                  } else {                                          if ( this.m_PS1 & FLAG_H ) {                                                  if ( ( res & 0xF0 ) < 0xA0 ) {                                                          res += 0x06;                                                  } else {                                                          res += 0x66;                                                          this.m_PS1 = this.m_PS1 | FLAG_C;                                                  }                                          } else {                                                  if ( ( res & 0x0F ) < 10 ) {                                                          if ( ( res & 0xF0 ) >= 0xA0 ) {                                                                  res += 0x60;                                                                  this.m_PS1 = this.m_PS1 | FLAG_C;                                                          }                                                  } else {                                                          if ( ( res & 0xF0 ) < 0x90 ) {                                                                  res += 0x06;                                                          } else {                                                                  res += 0x66;                                                                  this.m_PS1 = this.m_PS1 | FLAG_C;                                                          }                                                  }                                          }                                  }                          }                          this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_S );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0x00 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 4;
	break;
case 0x0D:  /* SWAP R - 7 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          res = (( d1 << 4 ) | ( d1 >> 4 )) & 0xFF;;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 7;
	break;
case 0x0E:  /* PUSH R - 5?/12? (8bit SP),10 (16bit SP) cycles */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.mem_readbyte( r1 )) & 0xFF );;
	mycycles += ( ( this.m_SYS & 0x40 ) ? 12 : 10 );
	break;
case 0x0F:  /* POP R - 9,8 cycles */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	r2 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	this.mem_writebyte( r1, r2 );
	mycycles += ( ( this.m_SYS & 0x40 ) ? 9 : 8 );
	break;
case 0x10:  /* CMP Rr,Rs - 5 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( r2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
	mycycles += 5;
	break;
case 0x11:  /* ADD Rr,Rs - 5 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = (d1 + d2) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ^ 0x80 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 5;
	break;
case 0x12:  /* SUB Rr,Rs - 5 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( r2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 5;
	break;
case 0x13:  /* ADC Rr,Rs - 5 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = (d1 + d2 + ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 5;
	break;
case 0x14:  /* SBC Rr,Rs - 5 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = (d1 - d2 - ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 5;
	break;
case 0x15:  /* AND Rr,Rs - 5 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = d1 & d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 5;
	break;
case 0x16:  /* OR Rr,Rs - 5 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = d1 | d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 5;
	break;
case 0x17:  /* XOR Rr,Rs - 5 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = d1 ^ d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 5;
	break;
case 0x18:  /* INCW S - 8 cycles - Flags affected: -ZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          res = (d1 + 1) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x8000 ) && ! ( res & 0x8000 ) ) ? FLAG_V : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 8;
	break;
case 0x19:  /* DECW S - 8 cycles - Flags affected: -ZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          res = (d1 - 1) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x8000 ) && ( res & 0x8000 ) ) ? FLAG_V : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 8;
	break;
case 0x1A:  /* CLR/NEG/COM/RR/RL/RRC/RLC/SRL @Rr - 7/8/7/7/7/7/7/6 cycles */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	res = 0;
	s1 = this.mem_readbyte( r1 );
	switch( r2 ) {
	case 0x00:  /* Flags affected: -------- */
		res = 0;
		mycycles += 7;
		break;
	case 0x01:  /* Flags affected: CZSV---- */
		res = (-(this.mem_readbyte( s1 ))) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_C | FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0x80 ) ? FLAG_V : 0 );;
		mycycles += 8;
		break;
	case 0x02:  /* Flags affected: -ZS0---- */
		res = (~(this.mem_readbyte( s1 ))) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
		mycycles += 7;
		break;
	case 0x03:  /* Flags affected: CZSV---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = d1 >> 1;                          if ( d1 & 0x01 ) {                                  res |= 0x80;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ! ( res & 0x80 ) ) ? FLAG_V : 0 );;
		mycycles += 7;
		break;
	case 0x04:  /* Flags affected: CZSV---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = (d1 << 1) & 0xFF;                          if ( d1 & 0x80 ) {                                  res |= 0x01;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x80 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ res ) & 0x80 ) ? FLAG_V : 0 );;
		mycycles += 7;
		break;
	case 0x05:  /* Flags affected: CZSV---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = d1 >> 1;                          if ( this.m_PS1 & FLAG_C ) {                                  res |= 0x80;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ! ( res & 0x80 ) ) ? FLAG_V : 0 );;
		mycycles += 7;
		break;
	case 0x06:  /* Flags affected: CZSV---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = (d1 << 1) & 0xFF;                          if ( this.m_PS1 & FLAG_C ) {                                  res |= 0x01;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x80 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ res ) & 0x80 ) ? FLAG_V : 0 );;
		mycycles += 7;
		break;
	case 0x07:  /* Flags affected: CZ00---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = d1 >> 1;                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );;
		mycycles += 6;
		break;
	}
	this.mem_writebyte( s1, res & 0xFF );
	break;
case 0x1B:  /* INC/DEC/SRA/SLL/DA/SWAP/PUSH/POP @Rr - 7,7,6,7,9,13,8,12,11 cycles */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = r1 & 0x07;                          r1 = ( r1 >> 3 ) & 0x07;                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	s1 = this.mem_readbyte( r1 );
	switch( r2 ) {
	case 0x00:  /* Flags affected: -ZSV---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = (d1 + 1) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ! ( res & 0x80 ) ) ? FLAG_V : 0 );;
		this.mem_writebyte( s1, res & 0xFF );
		mycycles += 7;
		break;
	case 0x01:  /* Flags affected: -ZSV---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = (d1 - 1) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d1 ^ res ) & 0x80 ) && ( res & 0x80 ) ) ? FLAG_V : 0 );;
		this.mem_writebyte( s1, res & 0xFF );
		mycycles += 7;
		break;
	case 0x02:  /* Flags affected: CZS0---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = d1 >> 1;                          if ( d1 & 0x80 ) {                                  res |= 0x80;                          }                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x01 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
		this.mem_writebyte( s1, res & 0xFF );
		mycycles += 6;
		break;
	case 0x03:  /* Flags affected: CZS0---- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = (d1 << 1) & 0xFF;                          this.m_PS1 = this.m_PS1 & ( FLAG_D | FLAG_H | FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( d1 & 0x80 ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
		this.mem_writebyte( s1, res & 0xFF );
		mycycles += 6;
		break;
	case 0x04:  /* Flags affected: CZS----- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = d1;                          if ( this.m_PS1 & FLAG_D ) {                                  if ( this.m_PS1 & FLAG_C ) {                                          if ( this.m_PS1 & FLAG_H ) {                                                  res += 0x9A;                                          } else {                                                  res += 0xA0;                                          }                                  } else {                                          if ( this.m_PS1 & FLAG_H ) {                                                  res += 0xFA;                                          }                                  }                          } else {                                  if ( this.m_PS1 & FLAG_C ) {                                          if ( this.m_PS1 & FLAG_H ) {                                                  res += 0x66;                                          } else {                                                  if ( ( res & 0x0F ) < 10 ) {                                                          res += 0x60;                                                  } else {                                                          res += 0x66;                                                  }                                          }                                  } else {                                          if ( this.m_PS1 & FLAG_H ) {                                                  if ( ( res & 0xF0 ) < 0xA0 ) {                                                          res += 0x06;                                                  } else {                                                          res += 0x66;                                                          this.m_PS1 = this.m_PS1 | FLAG_C;                                                  }                                          } else {                                                  if ( ( res & 0x0F ) < 10 ) {                                                          if ( ( res & 0xF0 ) >= 0xA0 ) {                                                                  res += 0x60;                                                                  this.m_PS1 = this.m_PS1 | FLAG_C;                                                          }                                                  } else {                                                          if ( ( res & 0xF0 ) < 0x90 ) {                                                                  res += 0x06;                                                          } else {                                                                  res += 0x66;                                                                  this.m_PS1 = this.m_PS1 | FLAG_C;                                                          }                                                  }                                          }                                  }                          }                          this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_S );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0x00 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
		this.mem_writebyte( s1, res & 0xFF );
		mycycles += 7;
		break;
	case 0x05:  /* Flags affected: -------- */
		d1 = (this.mem_readbyte( s1 )) & 0xFF;                          res = (( d1 << 4 ) | ( d1 >> 4 )) & 0xFF;;
		this.mem_writebyte( s1, res & 0xFF );
		mycycles += 9;
		break;
	case 0x06:  /* Flags affected: -------- */
		this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.mem_readbyte( s1 )) & 0xFF );;
		mycycles += ( ( this.m_SYS & 0x40 ) ? 13 : 8 );
		break;
	case 0x07:  /* Flags affected: -------- */
		res = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
		this.mem_writebyte( s1, res );
		mycycles += ( ( this.m_SYS & 0x40 ) ? 12 : 11 );
		break;
	}
	break;
case 0x1C:  /* BCLR 0xFFdd/d8(r),#b - 12,8 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 1 << ( r1 & 0x07 );                  d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  if ( r1 & 0x38 ) {                          s1 = (d1 + this.mem_readbyte( ( r1 >> 3 ) & 0x07 )) & 0xFFFF;                  } else {                          s1 = (0xFF00 + d1) & 0xFFFF;                  };
	this.mem_writebyte( s1, this.mem_readbyte( s1 ) & ~s2 );
	mycycles += ( ( r1 & 0x38 ) ? 8 : 12 );
	break;
case 0x1D:  /* BSET 0xFFdd/d8(r),#b - 12,8 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 1 << ( r1 & 0x07 );                  d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  if ( r1 & 0x38 ) {                          s1 = (d1 + this.mem_readbyte( ( r1 >> 3 ) & 0x07 )) & 0xFFFF;                  } else {                          s1 = (0xFF00 + d1) & 0xFFFF;                  };
	this.mem_writebyte( s1, this.mem_readbyte( s1 ) | s2 );
	mycycles += ( ( r1 & 0x38 ) ? 8 : 12 );
	break;
case 0x1E:  /* PUSHW S - 12,9 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.mem_readbyte( r1 + 1 )) & 0xFF );;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.mem_readbyte( r1 )) & 0xFF );;
	mycycles += ( ( this.m_SYS & 0x40 ) ? 12 : 9 );
	break;
case 0x1F:  /* POPW S - 12,13 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	r2 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	this.mem_writebyte( r1, r2 );
	r2 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	this.mem_writebyte( r1 + 1, r2 );
	mycycles += ( ( this.m_SYS & 0x40 ) ? 12 : 13 );
	break;
case 0x20:  /* CMP r,@r / CMP r,(r)+ / CMP r,@w / CMP r,w(r) / CMP r,-(r) - 7,8,10,8,9 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( s2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x21:  /* ADD r,@r / ADD r,(r)+ / ADD r,@w / ADD r,w(r) / ADD r,-(r) - 7,8,10,8,9 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = (d1 + d2) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ^ 0x80 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x22:  /* SUB r,@r / SUB r,(r)+ / SUB r,@w / SUB r,w(r) / SUB r,-(r) - 7,8,10,8,9 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( s2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x23:  /* ADC r,@r / ADC r,(r)+ / ADC r,@w / ADC r,w(r) / ADC r,-(r) - 7,8,10,8,9 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = (d1 + d2 + ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x24:  /* SBC r,@r / SBC r,(r)+ / SBC r,@w / SBC r,w(r) / SBC r,-(r) - 7,8,10,8,9 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = (d1 - d2 - ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x25:  /* AND r,@r / AND r,(r)+ / AND r,@w / AND r,w(r) / AND r,-(r) - 7,8,10,8,9 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = d1 & d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x26:  /* OR r,@r / OR r,(r)+ / OR r,@w / OR r,w(r) / OR r,-(r) - 7,8,10,8,9 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = d1 | d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x27:  /* XOR r,@r / XOR r,(r)+ / XOR r,@w / XOR r,w(r) / XOR r,-(r) - 7,8,10,8,9 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = d1 ^ d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 8 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x28:  /* MOV r,@r / MOV r,(r)+ / MOV r,@w / MOV r,w(r) / MOV r,-(r) - 6,7,10,7,8 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	this.mem_writebyte( r1, this.mem_readbyte( s2 ) );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 6; break;
	case 0x40:  mycycles += 7; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 7 : 10 ); break;
	case 0xC0:  mycycles += 8; break;
	}
	break;
case 0x29:  /* MOV @r,r / MOV (r)+,r / MOV @w,r / MOV w(r),r / MOV -(r),r - 8,8,10,9,9 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readbyte( r1 & 0x07 );                          break;                  case 0x40:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 + 1) & 0xFF );                          break;                  case 0x80:                          s2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readbyte( r1 & 0x07 )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = this.mem_readbyte( r1 & 0x07 );                          this.mem_writebyte( r1 & 0x07, (s2 - 1) & 0xFF );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	this.mem_writebyte( s2, this.mem_readbyte( r1 ) );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 8; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 9 : 10 ); break;
	case 0xC0:  mycycles += 9; break;
	}
	break;
case 0x2A:  /* BBC FFii/i(Rr),#b,d8 - 16,12/14,10 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          s2 = 1 << ( r1 & 0x07 );                          d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x38 ) {                                  s1 = (d1 + this.mem_readbyte( ( r1 >> 3 ) & 0x07 )) & 0xFFFF;                          } else {                                  s1 = (0xFF00 + d1) & 0xFFFF;                          }                          d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	if ( this.mem_readbyte( s1 ) & s2 ) {
		mycycles += 10;
	} else {
		this.m_PC = (this.m_PC + ((d1 << 24) >> 24)) & 0xFFFF;
		mycycles += 14;
	}
	if ( ( r1 & 0x38 ) == 0 ) {
		mycycles += 2;
	}
	break;
case 0x2B:  /* BBS FFii/i(Rr),#b,d8 - 16,12/14,10 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          s2 = 1 << ( r1 & 0x07 );                          d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                          if ( r1 & 0x38 ) {                                  s1 = (d1 + this.mem_readbyte( ( r1 >> 3 ) & 0x07 )) & 0xFFFF;                          } else {                                  s1 = (0xFF00 + d1) & 0xFFFF;                          }                          d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	if ( this.mem_readbyte( s1 ) & s2 ) {
		this.m_PC = (this.m_PC + ((d1 << 24) >> 24)) & 0xFFFF;
		mycycles += 14;
	} else {
		mycycles += 10;
	}
	if ( ( r1 & 0x38 ) == 0 ) {
		mycycles += 2;
	}
	break;
case 0x2C:  /* EXTS Rr - 6 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	res = this.mem_readword( r1 );
	if ( res & 0x80 ) {
		res = res | 0xFF00;
	} else {
		res = res & 0x00FF;
	}
	this.mem_writeword( r1, res );
	mycycles += 6;
	break;
case 0x2D:  /* unk2D - 4 cycles */
	;
	mycycles += 4;
	break;
case 0x2E:  /* MOV PS0,#00 - 4 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.m_PS0 = r1;
	mycycles += 4;
	break;
case 0x2F:  /* BTST R,i - 6 cycles - Flags affected: -Z-0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.m_PS1 = this.m_PS1 & ~ FLAG_V;
	if ( ( this.mem_readbyte( r2 ) & r1 ) == 0x00 ) {
		this.m_PS1 = this.m_PS1 | FLAG_Z;
	} else {
		this.m_PS1 = this.m_PS1 & ( ~ FLAG_Z );
	}
	mycycles += 6;
	break;
case 0x30:  /* CMP r,@rr / CMP r,(rr)+ / CMP r,@ww / CMP r,ww(rr) / CMP r,-(rr) - 8,13,11,15,13 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( s2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x31:  /* ADD r,@rr / ADD r,(rr)+ / ADD r,@ww / ADD r,ww(rr) / ADD r,-(rr) - 8,13,11,15,13 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = (d1 + d2) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ^ 0x80 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x32:  /* SUB r,@rr / SUB r,(rr)+ / SUB r,@ww / SUB r,ww(rr) / SUB r,-(rr) - 8,13,11,15,13 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( s2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x33:  /* ADC r,@rr / ADC r,(rr)+ / ADC r,@ww / ADC r,ww(rr) / ADC r,-(rr) - 8,13,11,15,13 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = (d1 + d2 + ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x34:  /* SBC r,@rr / SBC r,(rr)+ / SBC r,@ww / SBC r,ww(rr) / SBC r,-(rr) - 8,13,11,15,13 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = (d1 - d2 - ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x35:  /* AND r,@rr / AND r,(rr)+ / AND r,@ww / AND r,ww(rr) / AND r,-(rr) - 8,13,11,15,13 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = d1 & d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x36:  /* OR r,@rr / OR r,(rr)+ / OR r,@ww / OR r,ww(rr) / OR r,-(rr) - 8,13,11,15,13 cycles - Flags affected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = d1 | d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x37:  /* XOR? r,@rr / XOR r,(rr)+ / XOR r,@ww / XOR r,ww(rr) / XOR r,-(rr) - 8,13,11,15,13 cycles - Flagsaffected: -ZS0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( s2 )) & 0xFF;                          res = d1 ^ d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x38:  /* MOV r,@rr / MOV r,(rr)+ / MOV r,@ww / MOV r,ww(rr) / MOV r,-(rr) - 8,13,11,15,13 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	this.mem_writebyte( r1, this.mem_readbyte( s2 ) );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x39:  /* MOV @rr,r / MOV (rr)+,r / MOV @ww,r / MOV ww(rr),r /  MOV -(rr),r - 8,13,11,15,13 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 1) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[r1 & 0x07] ) - 1) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = ( r1 >> 3 ) & 0x07;;
	this.mem_writebyte( s2, this.mem_readbyte( r1 ) );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 8; break;
	case 0x40:  mycycles += 13; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 11 : 15 ); break;
	case 0xC0:  mycycles += 13; break;
	}
	break;
case 0x3A:  /* MOVW rr,@rr / MOV rr,(rr)+ / MOV rr,@ww / MOV rr,ww(rr) / MOV rr,-(rr) - 11,16,14,18,16 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 2) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[ r1 & 0x07] ) - 2) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = sm8500_b2w[ ( r1 >> 3 ) & 0x07 ];;
	this.mem_writeword( r1, this.mem_readword( s2 ) );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 11; break;
	case 0x40:  mycycles += 16; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 18 : 14 ); break;
	case 0xC0:  mycycles += 16; break;
	}
	break;
case 0x3B:  /* MOVW @rr,rr / MOV (rr)+,rr / MOV @ww,rr / MOV ww(rr),rr / MOV -(rr),rr - 11,16,14,18,16 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          break;                  case 0x40:                          s2 = this.mem_readword( sm8500_b2w[r1 & 0x07] );                          this.mem_writeword( sm8500_b2w[r1 & 0x07], (s2 + 2) & 0xFFFF );                          break;                  case 0x80:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x07 ) {                                  s2 = (s2 + this.mem_readword( sm8500_b2w[r1 & 0x07] )) & 0xFFFF;                          }                          break;                  case 0xC0:                          s2 = (this.mem_readword( sm8500_b2w[ r1 & 0x07] ) - 2) & 0xFFFF;                          this.mem_writeword( sm8500_b2w[r1 & 0x07], s2 );                          break;                  }                  r2 = r1;                  r1 = sm8500_b2w[ ( r1 >> 3 ) & 0x07 ];;
	this.mem_writeword( s2, this.mem_readword( r1 ) );
	switch( r2 & 0xC0 ) {
	case 0x00:  mycycles += 11; break;
	case 0x40:  mycycles += 16; break;
	case 0x80:  mycycles += ( ( r2 & 0x07 ) ? 18 : 14 ); break;
	case 0xC0:  mycycles += 16; break;
	}
	break;
case 0x3C:  /* MOVW RRr,RRs - 7 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = 0x00;                  switch( r1 & 0xC0 ) {                  case 0x00:                          r2 = sm8500_b2w[r1 & 0x07];                          r1 = sm8500_b2w[( r1 >> 3 ) & 0x07];                          break;                  case 0x40:                  case 0x80:                  case 0xC0:                          break;                  };
	this.mem_writeword( r1, this.mem_readword( r2 ) );
	mycycles += 7;
	break;
case 0x3D:  /* unk3D DM??? 3D 0E -> DM R0Eh ?? - 4,4 cycles */
	;
	mycycles += 4;
	break;
case 0x3E:  /* JMP RRr/@ww/ww(RRr) - 7/15/19 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[ r1 & 0x07 ] );                          break;                  case 0x40:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x38 ) {                                  s2 = (s2 + this.mem_readbyte( ( r1 >> 3 ) & 0x07 )) & 0xFFFF;                          }                           s2 = this.mem_readword( s2 );                          break;                  case 0x80:                  case 0xC0:                          break;                  };
	this.m_PC = s2;
	switch( r1 & 0xc0 ) {
	case 0x00:  mycycles += 7; break;
	case 0x40:  mycycles += ( ( r1 & 0x38 ) ? 19 : 15 ); break;
	default:    mycycles += 4;
	}
	break;
case 0x3F:  /* CALL RRr/@ww/ww(RRr) - 11,14/22,19/26,23 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = 0;                  switch( r1 & 0xC0 ) {                  case 0x00:                          s2 = this.mem_readword( sm8500_b2w[ r1 & 0x07 ] );                          break;                  case 0x40:                          s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;                          if ( r1 & 0x38 ) {                                  s2 = (s2 + this.mem_readbyte( ( r1 >> 3 ) & 0x07 )) & 0xFFFF;                          }                           s2 = this.mem_readword( s2 );                          break;                  case 0x80:                  case 0xC0:                          break;                  };
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.m_PC & 0xFF) & 0xFF );;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.m_PC >> 8) & 0xFF );;
	this.m_PC = s2;
	switch( r1 & 0xc0 ) {
	case 0x00:  mycycles += ( ( this.m_SYS & 0x40 ) ? 14 : 11 ); break;
	case 0x40:  mycycles += ( ( r1 & 0x38 ) ? ( ( this.m_SYS & 0x40 ) ? 26 : 23 ) : ( ( this.m_SYS & 0x40 ) ? 22 : 19 ) );break;
	default:    mycycles += 4;
	}
	break;
case 0x40:  /* CMP Rr,Rs - 6 cycles - Flags affected: CZSV---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( r2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
	mycycles += 6;
	break;
case 0x41:  /* ADD Rr,Rs - 6 cycles - Flags affected: CZSV0H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = (d1 + d2) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ^ 0x80 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x42:  /* SUB Rr,Rs - 6 cycles - Flags affected: CZSV1H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (this.mem_readbyte( r2 )) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x43:  /* ADC Rr,Rs - 6 cycles - Flags affected: CZSV0H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = (d1 + d2 + ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x44:  /* SBC Rr,Rs - 6 cycles - Flags affected: CZSV1H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = (d1 - d2 - ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x45:  /* AND Rr,Rs - 6 cycles - Flags affected: -ZS0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = d1 & d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x46:  /* OR Rr,Rs - 6 cycles - Flags affected: -ZS0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = d1 | d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x47:  /* XOR Rr,Rs - 6 cycles - Flags affected: -ZS0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (this.mem_readbyte( r2 )) & 0xFF;                          res = d1 ^ d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x48:  /* MOV Rr,Rs - 6 cycles - Flags affected: -------- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, this.mem_readbyte( r2 ) );
	mycycles += 6;
	break;
case 0x49:  /* CALL ad16 - 12,10 - Flags affected: -------- */
	s2 = this.mem_readword( this.m_PC );                          this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.m_PC & 0xFF) & 0xFF );;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.m_PC >> 8) & 0xFF );;
	this.m_PC = s2;
	mycycles += ( ( this.m_SYS & 0x40 ) ? 12 : 10 );
	break;
case 0x4A:  /* MOVW RRr,RRs - 8 cycles - Flags affected: -------- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writeword( r1, this.mem_readword( r2 ) );
	mycycles += 8;
	break;
case 0x4B:  /* MOVW RRr,ww - 9 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	this.mem_writeword( r1, s2 );
	mycycles += 9;
	break;
case 0x4C:  /* MULT Rrr,Rs - 24 cycles - Flags affected: -Z-0---- */
	// operation is not known if r1 is odd, assuming same as even for now
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	res = this.mem_readbyte( r1 | 1 ) * this.mem_readbyte( r2 );
	//res = this.mem_readword( r1 ) * this.mem_readbyte( r2 );
	res &= 0xFFFF;
	this.mem_writeword( r1, res );
	this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V );
	this.m_PS1 |= ( ( res == 0x00 ) ? FLAG_Z : 0 );
	mycycles += 24;
	break;
case 0x4D:  /* MULT RRr,i - 24 cycles - Flags affected: -Z-0---- */
	// operation is not known if r1 is odd, assuming same as even for now
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	res = this.mem_readbyte( r1 | 1 ) * r2;
	//res = this.mem_readword( r1 ) * r2;
	res &= 0xFFFF;
	this.mem_writeword( r1, res );
	this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V );
	this.m_PS1 |= ( ( res == 0x00 ) ? FLAG_Z : 0 );
	mycycles += 24;
	break;
case 0x4E:  /* BMOV Rr,#b,BF/BF,Rr,#b - 6 cycles - Flags affected: --------/-Z-0--B- */
	// unconfirmed if V or Z are affected. It seems no games depend on it.
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;
	switch( r2 & 0xC0 ) {
	case 0x40:
		res = this.mem_readbyte( r1 );
		if ( this.m_PS1 & FLAG_B ) {
			res = res | ( 1 << ( r2 & 0x07 ) );
		} else {
			res = res & ~( 1 << ( r2 & 0x07 ) );
		}
		this.mem_writebyte( r1, res & 0xFF );
		break;
	case 0x00:
		this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_S | FLAG_D | FLAG_H | FLAG_I );
		if ( this.mem_readbyte( r1 ) & ( 1 << ( r2 & 0x07 ) ) ) {
			this.m_PS1 = this.m_PS1 | FLAG_B;
		} else {
			this.m_PS1 = this.m_PS1 | FLAG_Z;
		}
		break;
	case 0x80:
	case 0xC0:
		break;
	}
	mycycles += 6;
	break;
case 0x4F:  /* BCMP/BAND/BOR/BXOR BF,Rr,#b - 6 cycles - Flags affected: -Z-0---- / -Z-0--B- */
	// unconfirmed if V or Z are affected. It seems no games depend on it.
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;
	s1 = this.mem_readbyte( r1 ) & ( 1 << ( r2 & 0x07 ) );
	s2 = ( ( this.m_PS1 & FLAG_B ) >> 1 ) << ( r2 & 0x07 );
	switch( r2 & 0xC0 ) {
	case 0x00:
		this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V );
		if ( s1 == s2 ) {
			this.m_PS1 = this.m_PS1 | FLAG_Z;
		}
		break;
	case 0x40:
		this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V | FLAG_B );
		this.m_PS1 = this.m_PS1 | ( ( s1 & s2 ) ? FLAG_B : FLAG_Z );
		break;
	case 0x80:
		this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V | FLAG_B );
		this.m_PS1 = this.m_PS1 | ( ( s1 | s2 ) ? FLAG_B : FLAG_Z );
		break;
	case 0xC0:
		this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V | FLAG_B );
		this.m_PS1 = this.m_PS1 | ( ( s1 ^ s2 ) ? FLAG_B : FLAG_Z );
		break;
	}
	mycycles += 6;
	break;
case 0x50:  /* CMP Rr,i - 6 cycles - Flags affected: CZSV---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (r2) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
	mycycles += 6;
	break;
case 0x51:  /* ADD Rr,i - 6 cycles - Flags affected: CZSV0H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (r2) & 0xFF;                          res = (d1 + d2) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ^ 0x80 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x52:  /* SUB Rr,i - 6 cycles - Flags affected: CZSV1H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                                  d2 = (r2) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x53:  /* ADC Rr,i - 6 cycles - Flags affected: CZSV0H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (r2) & 0xFF;                          res = (d1 + d2 + ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x54:  /* SBC Rr,i - 6 cycles - Flags affected: CZSV1H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (r2) & 0xFF;                          res = (d1 - d2 - ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0);                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x80 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x55:  /* AND Rr,i - 6 cycles - Flags affected: -ZS0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (r2) & 0xFF;                          res = d1 & d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x56:  /* OR Rr,i - 6 cycles - Flags affected: -ZS0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (r2) & 0xFF;                          res = d1 | d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x57:  /* XOR Rr,i - 6 cycles - Flags affected: -ZS0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readbyte( r1 )) & 0xFF;                          d2 = (r2) & 0xFF;                          res = d1 ^ d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_C | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );;
	this.mem_writebyte( r1, res & 0xFF );
	mycycles += 6;
	break;
case 0x58:  /* MOV Rr,i - 6 cycles - Flags affected: -------- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, r2 );
	mycycles += 6;
	break;
case 0x59:  /* Invalid - 2? cycles - Flags affected: --------? */
	;
	mycycles += 2;
	break;
case 0x5A:  /* indirect CMP - 7,8,12,9,8 cycles */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	switch (r2 & 0xc0)
	{
		case 0x00:
		// 5A 02 09 (used in calculator @ 493A and 4941. Used in Defender II @ 6DC9).
		// Assuming it to be a compare of the literal last number against contents of (contents of r02).
			//;
			s1 = this.mem_readbyte(r2 & 7);
			d1 = (this.mem_readbyte(s1)) & 0xFF;                                  d2 = (r1) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
			break;
		case 0x40:
			s1 = r2 & 7;    // s1 = primary reg
			s2 = this.mem_readbyte(s1);
			d1 = (this.mem_readbyte(s2)) & 0xFF;                                  d2 = (r1) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
			this.mem_writebyte(s1, (s2 + 1) & 0xFF);
			break;
		case 0x80:
		// 5A 86 C6 00 (used in Henry @ 495B, when you guess wrongly in practice mode).
		// 5A 87 C6 00 (used in Henry @ 7073, when you guess wrongly in competition mode).
		// Assuming it to be a compare of the literal last number against contents of (contents r06 + offset C6).
			s1 = r1;
			r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
			//;
			s1 += this.mem_readbyte(r2 & 7);
			d1 = (this.mem_readbyte(s1)) & 0xFF;                                  d2 = (r1) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
			mycycles += 4;
			break;
		case 0xC0:
			s1 = r2 & 7;    // s1 = primary reg
			res = (this.mem_readbyte(s1) - 1) & 0xFF;   // res = secondary reg#
			this.mem_writebyte(s1, res);       // dec res
			d1 = (this.mem_readbyte(res)) & 0xFF;                                  d2 = (r1) & 0xFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( (FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x80 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x80 ) ? FLAG_V : 0 );;;
			break;
	}
	mycycles += 7;
	break;
case 0x5B:  /* indirect MOV - 6,7,11,8,7 cycles */
/* Only one variant is used in gamecom: 5B 42 00
         Example:
         move r02, E9
         5b 42 00     (move 00 into register E9, then increment r02) */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	switch (r2 & 0xc0)
	{
		case 0x00:
			s1 = this.mem_readbyte(r2 & 7);
			this.mem_writebyte( this.mem_readbyte(s1), r1 );
			break;
		case 0x40:
			//;
			s1 = r2 & 7;
			res = this.mem_readbyte(s1);
			this.mem_writebyte(res, r1);
			this.mem_writebyte(s1, (res + 1) & 0xFF);
			break;
		case 0x80:
			s1 = r1;
			r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
			s1 += this.mem_readbyte(r2 & 7);
			mycycles += 4;
			this.mem_writebyte(this.mem_readbyte(s1), r1);
			break;
		case 0xC0:
			s1 = r2 & 7;
			res = (this.mem_readbyte(s1) - 1) & 0xFF;
			this.mem_writebyte(s1, res);
			this.mem_writebyte(this.mem_readbyte(res), r1);
			break;
	}
	mycycles += 6;
	break;
case 0x5C:  /* DIV RRr,RRs - 47 cycles - Flags affected: -Z-V---- */
		/* lower 8 bits of RRs is used to divide */
		/* remainder in stored upper 8 bits of RRs */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V );
	s1 = this.mem_readbyte( r2 + 1 );
	if ( s1 ) {
		const div = this.mem_readword( r1 );
		res = s1 ? Math.floor(div / s1) : 0;
		this.mem_writebyte( r2, div % s1 );
		this.mem_writeword( r1, res );
		this.m_PS1 = this.m_PS1 | ( ( res == 0 ) ? FLAG_Z : 0 );
	} else {
		this.m_PS1 = this.m_PS1 | FLAG_V;
	}
	mycycles += 47;
	break;
case 0x5D:  /* DIV RRr,i - 44 cycles - Flags affected: -Z-V---- */
//  ;
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.m_PS1 = this.m_PS1 & ~ ( FLAG_Z | FLAG_V );
	if ( r2 ) {
		res = r2 ? Math.floor(this.mem_readword( r1 ) / r2) : 0;
		this.mem_writeword( r1, res );
		this.m_PS1 = this.m_PS1 | ( ( res == 0 ) ? FLAG_Z : 0 );
	} else {
		this.m_PS1 = this.m_PS1 | FLAG_V;
	}
	mycycles += 44;
	break;
case 0x5E:  /* MOVM Rr,i,Rs - 9 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, ( this.mem_readbyte( r1 ) & d1 ) | this.mem_readbyte( r2 ) );
	mycycles += 9;
	break;
case 0x5F:  /* MOVM Rr,i,j - 8 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  d1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, ( this.mem_readbyte( r1 ) & d1 ) | r2 );
	mycycles += 8;
	break;
case 0x60:  /* CMPW RRr,RRs - 9 cycles - Flags affected: CZSV---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                                  d2 = (this.mem_readword( r2 )) & 0xFFFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( ( FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x8000 ) ? FLAG_V : 0 );;;
	mycycles += 9;
	break;
case 0x61:  /* ADDW RRr,RRs - 10 cycles - Flags affected: CZSV0H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (this.mem_readword( r2 )) & 0xFFFF;                          res = (d1 + d2) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x8000 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d2 ^ d1 ^ res ) & 0x0010 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x62:  /* SUBW RRr,RRs - 10 cycles - Flags affected: CZSV1H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                                  d2 = (this.mem_readword( r2 )) & 0xFFFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( ( FLAG_B | FLAG_I ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x8000 ) ? FLAG_V : 0 );;                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x0010 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x63:  /* ADCW RRr,RRs - 10 cycles - Flags affected: CZSV0H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (this.mem_readword( r2 )) & 0xFFFF;                          res = (d1 + d2 + ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1) ) & 0x8000 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x64:  /* SBCW RRr,RRs - 10 cycles - Flags affected: CZSV1H-- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (this.mem_readword( r2 )) & 0xFFFF;                          res = (d1 - d2 - ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x8000 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x65:  /* ANDW RRr,RRs - 14 cycles - Flags affected: -Z-0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (this.mem_readword( r2 )) & 0xFFFF;                          res = d1 & d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_S | FLAG_B | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 14;
	break;
case 0x66:  /* ORW RRr,RRs - 14 cycles - Flags affected: -Z-0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (this.mem_readword( r2 )) & 0xFFFF;                          res = d1 | d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I | FLAG_H | FLAG_D | FLAG_C | FLAG_S );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 14;
	break;
case 0x67:  /* XORW RRr,RRs - 14 cycles - Flags affected: -Z-0---- */
	r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (this.mem_readword( r2 )) & 0xFFFF;                          res = d1 ^ d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I | FLAG_H | FLAG_D | FLAG_C | FLAG_S );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 14;
	break;
case 0x68:  /* CMPW RRr,w - 9 cycles - Flags affected: CZSV---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                                  d2 = (s2) & 0xFFFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( ( FLAG_B | FLAG_I | FLAG_H | FLAG_D ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x8000 ) ? FLAG_V : 0 );;;
	mycycles += 9;
	break;
case 0x69:  /* ADDW RRr,w - 10 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (s2) & 0xFFFF;                          res = (d1 + d2) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x8000 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d2 ^ d1 ^ res ) & 0x0010 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x6A:  /* SUBW RRr,w - 10 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                                  d2 = (s2) & 0xFFFF;                                  res = (d1 - d2) >>> 0;                                  this.m_PS1 = this.m_PS1 & ( ( FLAG_B | FLAG_I ) );                                  this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                                  this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & (res ^ d1) ) & 0x8000 ) ? FLAG_V : 0 );;                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x0010 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x6B:  /* ADCW RRr,w - 10 cycles - Flags affected: CZSV0H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (s2) & 0xFFFF;                          res = (d1 + d2 + ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1) ) & 0x8000 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x6C:  /* SBCW RRr,w - 10 cycles - Flags affected: CZSV1H-- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (s2) & 0xFFFF;                          res = (d1 - d2 - ((this.m_PS1 & FLAG_C) ? 1 : 0)) >>> 0;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I );                          this.m_PS1 = this.m_PS1 | ( ( res > 0xFFFF ) ? FLAG_C : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );                          this.m_PS1 = this.m_PS1 | ( ( res & 0x8000 ) ? FLAG_S : 0 );                          this.m_PS1 = this.m_PS1 | ( ( ( ( d2 ^ d1 ) & ( res ^ d1 ) ) & 0x8000 ) ? FLAG_V : 0 );                          this.m_PS1 = this.m_PS1 | FLAG_D;                          this.m_PS1 = this.m_PS1 | ( ( ( d1 ^ d2 ^ res ) & 0x10 ) ? FLAG_H : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 10;
	break;
case 0x6D:  /* ANDW RRr,w - 13 cycles - Flags affected: -Z-0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (s2) & 0xFFFF;                          res = d1 & d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_C | FLAG_S | FLAG_B | FLAG_I | FLAG_H | FLAG_D );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 13;
	break;
case 0x6E:  /* ORW RRr,w - 13 cycles - Flags affected: -Z-0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (s2) & 0xFFFF;                          res = d1 | d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I | FLAG_H | FLAG_D | FLAG_C | FLAG_S );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );;
	this.mem_writeword( r1, res & 0xFFFF );
	mycycles += 13;
	break;
case 0x6F:  /* XORW RRr,w - 13 cycles - Flags affected: -Z-0---- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	d1 = (this.mem_readword( r1 )) & 0xFFFF;                          d2 = (s2) & 0xFFFF;                          res = d1 ^ d2;                          this.m_PS1 = this.m_PS1 & ( FLAG_B | FLAG_I | FLAG_H | FLAG_D | FLAG_C | FLAG_S );                          this.m_PS1 = this.m_PS1 | ( ( ( res & 0xFFFF ) == 0 ) ? FLAG_Z : 0 );;
	this.mem_writeword( r1, res & 0xFFFF);
	mycycles += 13;
	break;
case 0x70:  /* DBNZ r,rel8 - 10,6 cycles - Flags affected: -------- */
case 0x71:
case 0x72:
case 0x73:
case 0x74:
case 0x75:
case 0x76:
case 0x77:
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = (this.m_PC + ((r1 << 24) >> 24)) & 0xFFFF;;
	r1 = this.mem_readbyte( op & 0x07 );
	r1 = (r1 - 1) & 0xFF;
	this.mem_writebyte( op & 0x07, r1 );
	if ( r1 != 0 ) {
		this.m_PC = s2;
		mycycles += 10;
	} else {
		mycycles += 6;
	}
	break;
case 0x78:  /* MOVW RRx,w - 6 cycles - Flags affected: -------- */
case 0x79:
case 0x7A:
case 0x7B:
case 0x7C:
case 0x7D:
case 0x7E:
case 0x7F:
	r1 = sm8500_b2w[op & 0x07];                  s2 = this.mem_readword( this.m_PC ); this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	this.mem_writeword( r1, s2 );
		mycycles += 6;
	break;
case 0x80:  /* BBC R,#b,d8 - 10,6 cycles - Flags affected: -------- */
case 0x81:
case 0x82:
case 0x83:
case 0x84:
case 0x85:
case 0x86:
case 0x87:
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = (this.m_PC + ((r2 << 24) >> 24)) & 0xFFFF;;
	if ( ( this.mem_readbyte( r1 ) & ( 1 << (op & 0x07) ) ) == 0 ) {
		this.m_PC = s2;
		mycycles += 10;
	} else {
		mycycles += 6;
	}
	break;
case 0x88:  /* BBS R,#b,d8 - 10,6 cycles - Flags affected: -------- */
case 0x89:
case 0x8A:
case 0x8B:
case 0x8C:
case 0x8D:
case 0x8E:
case 0x8F:
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = (this.m_PC + ((r2 << 24) >> 24)) & 0xFFFF;;
	if ( ( this.mem_readbyte( r1 ) & ( 1 << (op & 0x07) ) ) ) {
		this.m_PC = s2;
		mycycles += 10;
	} else {
		mycycles += 6;
	}
	break;
case 0x90:  /* JMP cc,ad16 - 6 cycles - Flags affected: -------- */
case 0x91:
case 0x92:
case 0x93:
case 0x94:
case 0x95:
case 0x96:
case 0x97:
case 0x98:
case 0x99:
case 0x9A:
case 0x9B:
case 0x9C:
case 0x9D:
case 0x9E:
case 0x9F:
	s2 = this.mem_readword( this.m_PC );                          this.m_PC = (this.m_PC + 2) & 0xFFFF;;
	res = 0;                          switch( op & 0x0F ) {                          case 0x00: res = 0; break;                          case 0x01: if ( ( this.m_PS1 & FLAG_S ) ^ ( ( this.m_PS1 & FLAG_V ) << 1 ) ) res = 1; break;                          case 0x02: if ( ( ( this.m_PS1 & FLAG_S ) && ! ( this.m_PS1 & FLAG_V ) ) || ( ( this.m_PS1 & FLAG_S ) && ( this.m_PS1 & FLAG_V ) && ( this.m_PS1 & FLAG_Z ) ) || ( ! ( this.m_PS1 & FLAG_S ) && ( ( this.m_PS1 & FLAG_Z ) || (this.m_PS1 & FLAG_V ) ) ) ) res = 1; break;                          case 0x03: if ( this.m_PS1 & FLAG_Z || this.m_PS1 & FLAG_C ) res = 1; break;                          case 0x04: if ( this.m_PS1 & FLAG_V ) res = 1; break;                          case 0x05: if ( this.m_PS1 & FLAG_S ) res = 1; break;                          case 0x06: if ( this.m_PS1 & FLAG_Z ) res = 1; break;                          case 0x07: if ( this.m_PS1 & FLAG_C ) res = 1; break;                          case 0x08: res = 1; break;                          case 0x09: if ( ! ( ( this.m_PS1 & FLAG_S ) ^ ( ( this.m_PS1 & FLAG_V ) << 1 ) ) ) res = 1; break;                          case 0x0A: if ( ( ! ( this.m_PS1 & FLAG_Z ) && ( this.m_PS1 & FLAG_S ) && ( this.m_PS1 & FLAG_V ) ) || ( ! ( this.m_PS1 & FLAG_Z ) && ! ( this.m_PS1 & FLAG_V ) && ! ( this.m_PS1 & FLAG_S ) ) ) res = 1; break;                          case 0x0B: if ( ! ( this.m_PS1 & FLAG_Z || this.m_PS1 & FLAG_C ) ) res = 1; break;                          case 0x0C: if ( ! (this.m_PS1 & FLAG_V) ) res = 1; break;                          case 0x0D: if ( ! (this.m_PS1 & FLAG_S) ) res = 1; break;                          case 0x0E: if ( ! (this.m_PS1 & FLAG_Z) ) res = 1; break;                          case 0x0F: if ( ! (this.m_PS1 & FLAG_C) ) res = 1; break;                          };
	if ( res ) {
		this.m_PC = s2;
	}
	mycycles += 6;
	break;
case 0xA0:  /* BCLR R,#b - 4 cycles - Flags affected: -------- */
case 0xA1:
case 0xA2:
case 0xA3:
case 0xA4:
case 0xA5:
case 0xA6:
case 0xA7:
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, this.mem_readbyte( r1 ) & ~ ( 1 << (op & 0x07) ) );
	mycycles += 4;
	break;
case 0xA8:  /* BSET R,#b - 4 cycles - Flags affected: -------- */
case 0xA9:
case 0xAA:
case 0xAB:
case 0xAC:
case 0xAD:
case 0xAE:
case 0xAF:
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, this.mem_readbyte( r1 ) | ( 1 << (op & 0x07) ) );
	mycycles += 4;
	break;
case 0xB0:  /* MOV Rx,Rr - 4 cycles - Flags affected: -------- */
case 0xB1:
case 0xB2:
case 0xB3:
case 0xB4:
case 0xB5:
case 0xB6:
case 0xB7:
	r1 = op & 0x07;                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, this.mem_readbyte( r2 ) );
	mycycles += 4;
	break;
case 0xB8:  /* MOV Rr,Rx - 4 cycles - Flags affected: -------- */
case 0xB9:
case 0xBA:
case 0xBB:
case 0xBC:
case 0xBD:
case 0xBE:
case 0xBF:
	r1 = op & 0x07;                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r2, this.mem_readbyte( r1 ) );
	mycycles += 4;
	break;
case 0xC0:  /* MOV Rx,i - 4 cycles - Flags affected: -------- */
case 0xC1:
case 0xC2:
case 0xC3:
case 0xC4:
case 0xC5:
case 0xC6:
case 0xC7:
	r1 = op & 0x07;                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, r2 );
	mycycles += 4;
	break;
case 0xC8:  /* MOV IE0/IE1/IR0/IR1/P0/P1/P2/P3,i - 4 cycles - Flags affected: -------- */
case 0xC9:
case 0xCA:
case 0xCB:
case 0xCC:
case 0xCD:
case 0xCE:
case 0xCF:
	r1 = 0x10 + ( op & 0x07 );                  r2 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	this.mem_writebyte( r1, r2 );
	mycycles += 4;
	break;
case 0xD0:  /* BR cc,rel8 - 8,4 cycles - Flags affected: -------- */
case 0xD1:
case 0xD2:
case 0xD3:
case 0xD4:
case 0xD5:
case 0xD6:
case 0xD7:
case 0xD8:
case 0xD9:
case 0xDA:
case 0xDB:
case 0xDC:
case 0xDD:
case 0xDE:
case 0xDF:
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;                  s2 = (this.m_PC + ((r1 << 24) >> 24)) & 0xFFFF;;
	res = 0;                          switch( op & 0x0F ) {                          case 0x00: res = 0; break;                          case 0x01: if ( ( this.m_PS1 & FLAG_S ) ^ ( ( this.m_PS1 & FLAG_V ) << 1 ) ) res = 1; break;                          case 0x02: if ( ( ( this.m_PS1 & FLAG_S ) && ! ( this.m_PS1 & FLAG_V ) ) || ( ( this.m_PS1 & FLAG_S ) && ( this.m_PS1 & FLAG_V ) && ( this.m_PS1 & FLAG_Z ) ) || ( ! ( this.m_PS1 & FLAG_S ) && ( ( this.m_PS1 & FLAG_Z ) || (this.m_PS1 & FLAG_V ) ) ) ) res = 1; break;                          case 0x03: if ( this.m_PS1 & FLAG_Z || this.m_PS1 & FLAG_C ) res = 1; break;                          case 0x04: if ( this.m_PS1 & FLAG_V ) res = 1; break;                          case 0x05: if ( this.m_PS1 & FLAG_S ) res = 1; break;                          case 0x06: if ( this.m_PS1 & FLAG_Z ) res = 1; break;                          case 0x07: if ( this.m_PS1 & FLAG_C ) res = 1; break;                          case 0x08: res = 1; break;                          case 0x09: if ( ! ( ( this.m_PS1 & FLAG_S ) ^ ( ( this.m_PS1 & FLAG_V ) << 1 ) ) ) res = 1; break;                          case 0x0A: if ( ( ! ( this.m_PS1 & FLAG_Z ) && ( this.m_PS1 & FLAG_S ) && ( this.m_PS1 & FLAG_V ) ) || ( ! ( this.m_PS1 & FLAG_Z ) && ! ( this.m_PS1 & FLAG_V ) && ! ( this.m_PS1 & FLAG_S ) ) ) res = 1; break;                          case 0x0B: if ( ! ( this.m_PS1 & FLAG_Z || this.m_PS1 & FLAG_C ) ) res = 1; break;                          case 0x0C: if ( ! (this.m_PS1 & FLAG_V) ) res = 1; break;                          case 0x0D: if ( ! (this.m_PS1 & FLAG_S) ) res = 1; break;                          case 0x0E: if ( ! (this.m_PS1 & FLAG_Z) ) res = 1; break;                          case 0x0F: if ( ! (this.m_PS1 & FLAG_C) ) res = 1; break;                          };
	if ( res ) {
		this.m_PC = s2;
		mycycles += 8;
	} else {
		mycycles += 4;
	}
	break;
case 0xE0:  /* CALS - 12,9 cycles */
case 0xE1:
case 0xE2:
case 0xE3:
case 0xE4:
case 0xE5:
case 0xE6:
case 0xE7:
case 0xE8:
case 0xE9:
case 0xEA:
case 0xEB:
case 0xEC:
case 0xED:
case 0xEE:
case 0xEF:  /* CALS 1xWW - 12,9 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_PC ); this.m_PC = (this.m_PC + 1) & 0xFFFF;;
	s2 = 0x1000 + ( ( op & 0x0F ) << 8 ) + r1;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.m_PC & 0xFF) & 0xFF );;
	this.m_SP = (this.m_SP - 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;                          this.mem_writebyte( this.m_SP, (this.m_PC >> 8) & 0xFF );;
	this.m_PC = s2;
	mycycles += ( ( this.m_SYS & 0x40 ) ? 12 : 9 );
	break;
case 0xF0:  /* STOP - 2 cycles - Flags affected: -------- */
	mycycles += 2;
	if ( this.m_clock_changed ) {
		/* TODO: Set system clock divider */
		/* TODO: Add a bunch of additional cycles */
		this.m_clock_changed = 0;
	}
	//; // fills up error log when unit sleeps
	break;
case 0xF1:  /* HALT - 2 cycles - Flags affected: -------- */
	this.m_halted = 1;
	mycycles += 2;
	break;
case 0xF2:  /* Invalid - 2? cycles - Flags affected: --------? */
case 0xF3:
case 0xF4:
case 0xF5:
case 0xF6:
case 0xF7:
	;
	mycycles += 2;
	break;
case 0xF8:  /* RET - 10,8 cycles - Flags affected: -------- */
	r1 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	r2 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	this.m_PC = ( r1 << 8 ) | r2;
	mycycles += ( ( this.m_SYS & 0x40 ) ? 10 : 8 );
	break;
case 0xF9:  /* IRET - 12,10 cycles - Flags affected: CZSVDHBI */
	this.m_PS1 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	r1 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	r2 = this.mem_readbyte( this.m_SP );                          this.m_SP = (this.m_SP + 1) & 0xFFFF;                          if ( ( this.m_SYS & 0x40 ) == 0 ) this.m_SP &= 0xFF;;
	this.m_PC = ( r1 << 8 ) | r2;
	mycycles += ( ( this.m_SYS & 0x40 ) ? 12 : 10 );
	break;
case 0xFA:  /* CLRC - 2 cycles - Flags affected: C------- */
	this.m_PS1 = this.m_PS1 & ~ ( FLAG_C );
	mycycles += 2;
	break;
case 0xFB:  /* COMC - 2 cycles - Flags affected: C------- */
	this.m_PS1 = this.m_PS1 ^ FLAG_C;
	mycycles += 2;
	break;
case 0xFC:  /* SETC - 2 cycles - Flags affected: C------- */
	this.m_PS1 = this.m_PS1 | FLAG_C;
	mycycles += 2;
	break;
case 0xFD:  /* EI - 2 cycles - Flags affected: -------I */
	this.m_PS1 = this.m_PS1 | FLAG_I;
	mycycles += 2;
	break;
case 0xFE:  /* DI - 2 cycles - Flags affected: -------I */
	this.m_PS1 = this.m_PS1 & ~ ( FLAG_I );
	mycycles += 2;
	break;
case 0xFF:  /* NOP - 2 cycles - Flags affected: -------- */
	mycycles += 2;
	break;
default:
	mycycles += 2;
	break;

      }

      if (this.m_SYS & 0x40) {
        this.program_write_byte(0x1c, (this.m_SP >> 8) & 0xff);
      }
      this.program_write_byte(0x1d, this.m_SP & 0xff);
      this.mem_writebyte(0x1e, this.m_PS0);
      this.program_write_byte(0x1f, this.m_PS1);
    } else {
      const dmc = this.m_p_ram[SM8521_DMC];
      if (dmc & 0x80) {
        const bw = this.m_p_ram[SM8521_DMDX] + 1;
        const bh = this.m_p_ram[SM8521_DMDY] + 1;
        // Hardware DMA controller transfers 4 pixels (1 byte) per 2 bus cycles
        mycycles = Math.min(256, Math.max(4, (bw * bh) >> 1));
        this.gamecom_handle_dma(mycycles);
      } else {
        mycycles = 4;
      }
    }

    this.gamecom_update_timers(mycycles);
    this.cycles += mycycles;
    return mycycles;
  }

  /**
   * Executes one full video frame at original hardware speed:
   * - 4.9152 MHz oscillator / 59.732155 Hz / 200 scanlines = 411 cycles per scanline (~82,285 cycles/frame)
   * - 5.5296 MHz MAME clock / 59.732155 Hz / 200 scanlines = 462 cycles per scanline (~92,573 cycles/frame)
   */
  public runFrame(speedMultiplier: number = 1.0) {
    const baseScanlineCycles = this.correctClockSpeed ? 411 : 462;
    const cyclesPerScanline = Math.max(64, Math.floor(baseScanlineCycles * speedMultiplier));
    for (let line = 0; line < 200; line++) {
      let lineCycles = 0;
      while (lineCycles < cyclesPerScanline) {
        lineCycles += this.step();
      }
      this.renderScanline();
    }
    // Assert VBLANK interrupt (LCDC_INT)
    this.set_input_line(LCDC_INT, true);
  }

  public getVRAMPixel(x: number, y: number): number {
    if (x < 0 || x >= 200 || y < 0 || y >= 160) return 0;
    return this.displayBuffer[y * 200 + x];
  }

  public getRegisters(): CPURegisters {
    const bankOffset = this.m_PS0 & 0xf8;
    return {
      r0: this.m_register_ram[bankOffset + 0],
      r1: this.m_register_ram[bankOffset + 1],
      r2: this.m_register_ram[bankOffset + 2],
      r3: this.m_register_ram[bankOffset + 3],
      r4: this.m_register_ram[bankOffset + 4],
      r5: this.m_register_ram[bankOffset + 5],
      r6: this.m_register_ram[bankOffset + 6],
      r7: this.m_register_ram[bankOffset + 7],
      pc: this.m_PC,
      sp: this.m_SP,
      flags: {
        c: (this.m_PS1 & FLAG_C) !== 0,
        z: (this.m_PS1 & FLAG_Z) !== 0,
        s: (this.m_PS1 & FLAG_S) !== 0,
        v: (this.m_PS1 & FLAG_V) !== 0,
        i: (this.m_PS1 & FLAG_I) !== 0
      },
      cycles: this.cycles
    };
  }

  public disassemble(addr: number): { text: string; size: number; hex: string } {
    addr &= 0xffff;
    const b0 = this.mem_readbyte(addr);
    const b1 = this.mem_readbyte((addr + 1) & 0xffff);
    const b2 = this.mem_readbyte((addr + 2) & 0xffff);
    let text = `OP $${b0.toString(16).padStart(2, '0').toUpperCase()}`;
    let size = 1;

    if (b0 === 0x00) { text = `CLR R$${b1.toString(16).padStart(2, '0')}`; size = 2; }
    else if (b0 === 0x1a || b0 === 0x1b) { text = `IND $${b0.toString(16)} R$${b1.toString(16)}`; size = 2; }
    else if (b0 === 0x2e) { text = `MOV PS0, #$${b1.toString(16).padStart(2, '0')}`; size = 2; }
    else if (b0 === 0x48) { text = `MOV R$${b2.toString(16)}, R$${b1.toString(16)}`; size = 3; }
    else if (b0 === 0x49) { text = `CALL $${((b1 << 8) | b2).toString(16).padStart(4, '0')}`; size = 3; }
    else if (b0 === 0x58) { text = `MOV R$${b2.toString(16)}, #$${b1.toString(16).padStart(2, '0')}`; size = 3; }
    else if (b0 >= 0x70 && b0 <= 0x77) { text = `DBNZ r${b0 & 7}, $${((addr + 2 + ((b1 << 24) >> 24)) & 0xffff).toString(16)}`; size = 2; }
    else if (b0 >= 0x78 && b0 <= 0x7f) { text = `MOVW RR${(b0 & 7) * 2}, #$${((b1 << 8) | b2).toString(16).padStart(4, '0')}`; size = 3; }
    else if (b0 >= 0x90 && b0 <= 0x9f) { text = `JMP cc${b0 & 15}, $${((b1 << 8) | b2).toString(16).padStart(4, '0')}`; size = 3; }
    else if (b0 >= 0xb0 && b0 <= 0xb7) { text = `MOV r${b0 & 7}, R$${b1.toString(16)}`; size = 2; }
    else if (b0 >= 0xb8 && b0 <= 0xbf) { text = `MOV R$${b1.toString(16)}, r${b0 & 7}`; size = 2; }
    else if (b0 >= 0xc0 && b0 <= 0xc7) { text = `MOV r${b0 & 7}, #$${b1.toString(16).padStart(2, '0')}`; size = 2; }
    else if (b0 >= 0xc8 && b0 <= 0xcf) { text = `MOV SFR$${(0x10 + (b0 & 7)).toString(16)}, #$${b1.toString(16).padStart(2, '0')}`; size = 2; }
    else if (b0 >= 0xd0 && b0 <= 0xdf) { text = `BR cc${b0 & 15}, $${((addr + 2 + ((b1 << 24) >> 24)) & 0xffff).toString(16)}`; size = 2; }
    else if (b0 === 0xf1) { text = 'HALT'; size = 1; }
    else if (b0 === 0xf8) { text = 'RET'; size = 1; }
    else if (b0 === 0xf9) { text = 'IRET'; size = 1; }
    else if (b0 === 0xfd) { text = 'EI'; size = 1; }
    else if (b0 === 0xfe) { text = 'DI'; size = 1; }
    else if (b0 === 0xff) { text = 'NOP'; size = 1; }

    const hex = [b0, b1, b2].slice(0, size).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    return { text, size, hex };
  }
}
