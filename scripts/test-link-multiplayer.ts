import * as fs from 'fs';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { SM8521CPU } from '../src/emulator/sm8521';

const rootDir = process.cwd();

function loadBin(relPath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(rootDir, relPath)));
}

function loadZipRom(relPath: string): Uint8Array {
  const zipBytes = new Uint8Array(fs.readFileSync(path.join(rootDir, relPath)));
  const files = unzipSync(zipBytes);
  const firstKey = Object.keys(files)[0];
  return files[firstKey];
}

const extBios = loadBin('public/bios/external.bin');
const intBios = loadBin('public/bios/internal.bin');
const testRom = loadBin('public/roms/compete_test.bin');
const fmmRom = loadZipRom('roms/NOINTRO Game.com/Fighters Megamix (USA).zip');
const mktRom = loadZipRom('roms/NOINTRO Game.com/Mortal Kombat Trilogy (USA).zip');

function createLinkedPair(rom: Uint8Array) {
  const cpu1 = new SM8521CPU();
  const cpu2 = new SM8521CPU();
  cpu1.loadExternalBIOS(extBios);
  cpu1.loadInternalBIOS(intBios);
  cpu2.loadExternalBIOS(extBios);
  cpu2.loadInternalBIOS(intBios);
  cpu1.loadCartridgeROM(rom, 1);
  cpu2.loadCartridgeROM(rom, 1);
  cpu1.reset();
  cpu2.reset();

  cpu1.linkConnected = true;
  cpu2.linkConnected = true;

  const q1to2: number[] = [];
  const q2to1: number[] = [];

  const flush1to2 = () => {
    while (q1to2.length > 0) {
      cpu2.enqueueUartRxByte(q1to2.shift()!);
    }
  };
  const flush2to1 = () => {
    while (q2to1.length > 0) {
      cpu1.enqueueUartRxByte(q2to1.shift()!);
    }
  };

  cpu1.onUartTxByte = (b) => q1to2.push(b);
  cpu2.onUartTxByte = (b) => q2to1.push(b);
  cpu1.onLinkPort3Change = (bits) => {
    flush1to2();
    cpu2.setRemotePort3Bits(bits, true);
  };
  cpu2.onLinkPort3Change = (bits) => {
    flush2to1();
    cpu1.setRemotePort3Bits(bits, true);
  };
  cpu1.onLinkPoll = () => {
    flush1to2();
    flush2to1();
  };
  cpu2.onLinkPoll = () => {
    flush2to1();
    flush1to2();
  };

  const stepFrames = (n: number) => {
    for (let i = 0; i < n; i++) {
      cpu1.runFrame();
      flush1to2();
      cpu2.runFrame();
      flush2to1();
    }
  };

  return { cpu1, cpu2, stepFrames, flush1to2, flush2to1 };
}

// ============================================================================
// TEST 1: Built-in Compete.Com Link Test ROM (public/roms/compete_test.bin)
// ============================================================================
console.log('--- TEST 1: public/roms/compete_test.bin (2 Linked Consoles) ---');
{
  const { cpu1, cpu2, stepFrames } = createLinkedPair(testRom);
  // Boot BIOS for 120 frames (verifying linkWaitFrames stays 0 during idle!)
  stepFrames(120);
  console.log(`Idle 120 frames: cpu1.linkWaitFrames=${cpu1.linkWaitFrames}, cpu2.linkWaitFrames=${cpu2.linkWaitFrames}`);

  // Jump both CPUs into Cartridge GameEntry ($4020 in bank $20 with R2 = 1 = exe_game)
  for (const cpu of [cpu1, cpu2]) {
    cpu.mem_writebyte(0x0017, (cpu.mem_readbyte(0x0017) & 0x3F) | 0x40); // Select Slot 1 (P3.6=1)
    cpu.mem_writebyte(0x0026, 0x20); // MMU2 = bank $20 ($4000-$5FFF)
    const rp = cpu.mem_readbyte(0x001B) & 0xF8;
    cpu.mem_writebyte(rp + 2, 0x01); // R2 = 1 (exe_game)
    cpu.m_register_ram[rp + 2] = 0x01;
    cpu.m_PC = 0x4020;
  }

  stepFrames(30);

  const role1 = cpu1.mem_readbyte(0x0300);
  const p3Pass1 = cpu1.mem_readbyte(0x0301);
  const uartPass1 = cpu1.mem_readbyte(0x0302);
  const burstPass1 = cpu1.mem_readbyte(0x0303);
  const pingCnt1 = cpu1.mem_readbyte(0x0304);
  const burstCnt1 = cpu1.mem_readbyte(0x0305);

  const role2 = cpu2.mem_readbyte(0x0300);
  const p3Pass2 = cpu2.mem_readbyte(0x0301);
  const uartPass2 = cpu2.mem_readbyte(0x0302);
  const burstPass2 = cpu2.mem_readbyte(0x0303);
  const pingCnt2 = cpu2.mem_readbyte(0x0304);
  const burstCnt2 = cpu2.mem_readbyte(0x0305);

  console.log(`CPU1: Role=${role1} P3=${p3Pass1} UART=${uartPass1} Burst=${burstPass1} PingCnt=${pingCnt1} BurstCnt=${burstCnt1} PC=$${cpu1.pc.toString(16)} IE0=$${cpu1.mem_readbyte(0x10).toString(16)} PS1=$${cpu1.mem_readbyte(0x1f).toString(16)}`);
  console.log(`  CPU1 rxFifo=${cpu1.uartRxFifo.length} A5=$${cpu1.mem_readbyte(0xa5).toString(16)} ISR=$${((cpu1.mem_readbyte(0x100)<<8)|cpu1.mem_readbyte(0x101)).toString(16)} RX_head=$${((cpu1.mem_readbyte(0xa0)<<8)|cpu1.mem_readbyte(0xa1)).toString(16)} RX_tail=$${((cpu1.mem_readbyte(0xa2)<<8)|cpu1.mem_readbyte(0xa3)).toString(16)} URTS=$${cpu1.mem_readbyte(0x2d).toString(16)}`);
  console.log(`CPU2: Role=${role2} P3=${p3Pass2} UART=${uartPass2} Burst=${burstPass2} PingCnt=${pingCnt2} BurstCnt=${burstCnt2} PC=$${cpu2.pc.toString(16)} IE0=$${cpu2.mem_readbyte(0x10).toString(16)} PS1=$${cpu2.mem_readbyte(0x1f).toString(16)}`);
  console.log(`  CPU2 rxFifo=${cpu2.uartRxFifo.length} A5=$${cpu2.mem_readbyte(0xa5).toString(16)} ISR=$${((cpu2.mem_readbyte(0x100)<<8)|cpu2.mem_readbyte(0x101)).toString(16)} RX_head=$${((cpu2.mem_readbyte(0xa0)<<8)|cpu2.mem_readbyte(0xa1)).toString(16)} RX_tail=$${((cpu2.mem_readbyte(0xa2)<<8)|cpu2.mem_readbyte(0xa3)).toString(16)} URTS=$${cpu2.mem_readbyte(0x2d).toString(16)}`);

  if (p3Pass1 !== 1 || uartPass1 !== 1 || burstPass1 !== 1 || p3Pass2 !== 1 || uartPass2 !== 1 || burstPass2 !== 1) {
    throw new Error('compete_test.bin failed one or more link checks!');
  }
  console.log('PASS: compete_test.bin passed all P3, BIOS UART, and Burst Checksum tests!\n');
}

// ============================================================================
// TEST 2: Fighters Megamix (open_h2hx + exchg_openx + p2_decode_data/rec_decode_data + transmit_key/receive_key)
// ============================================================================
console.log('--- TEST 2: Fighters Megamix (open_h2hx + exchg_openx + 68B Burst + Key Sync) ---');
{
  const { cpu1, cpu2, flush1to2, flush2to1 } = createLinkedPair(fmmRom);
  for (let i = 0; i < 120; i++) {
    cpu1.runFrame();
    cpu2.runFrame();
  }

  const bootFmm = (cpu: SM8521CPU) => {
    cpu.mem_writebyte(0x0017, (cpu.mem_readbyte(0x0017) & 0xF0) | 0x40); // Select Slot 1, P3 low bits = 00
    cpu.mem_writebyte(0x0026, 0x20); // MMU2 = bank $20
    const rp = cpu.mem_readbyte(0x001B) & 0xF8;
    cpu.mem_writebyte(rp + 2, 0x01); // R2 = 1 (exe_game)
    cpu.m_register_ram[rp + 2] = 0x01;
    cpu.m_PC = 0x4050; // Game_Exe entry point ($4050)
    for (let f = 0; f < 5; f++) {
      cpu.runFrame();
    }
    cpu.mem_writebyte(0x00BD, 0x20); // $BD bit 5 = 1 ($20) so Scan_Keypad ($43F0) returns immediately without HALTing!
    cpu.remotePort3Bits = 0;
    cpu.remotePort3Queue = [];
    cpu.remotePort3ReadsInState = 4;
  };

  const setupFmmCall = (cpu: SM8521CPU) => {
    cpu.mem_writebyte(0x0026, 0x20); // MMU2 = bank $20
    cpu.mem_writebyte(0x0027, 0x25); // MMU3 = bank $25
    cpu.mem_writebyte(0x001B, 0x00); // PS0 = RP 0
    cpu.mem_writebyte(0x001E, 0x00);
    cpu.mem_writebyte(0x00BD, 0x20); // $BD bit 5 = 1 ($20) so Scan_Keypad ($43F0) returns immediately without HALTing!
    cpu.m_SP = 0x0090;
    cpu.mem_writebyte(0x001D, 0x90);
    cpu.mem_writebyte(0x001F, 0x01); // PS1 = EI (Interrupts Enabled!)
    cpu.mem_writebyte(0x0010, 0x89); // IE0: DMA_INT (0x80) + UART_INT (0x08) + LCDC_INT (0x01)
    cpu.mem_writebyte(0x0011, 0x00); // IE1: 0 (we'll pulse TIM1_INT once per frame in stepFrames!)
    cpu.m_register_ram[0x28 + 2] = 0x3d; // Restore BIOS default UART ISR ($3D0E) before calling init_uart!
    cpu.m_register_ram[0x28 + 3] = 0x0e;
    cpu.mem_writebyte(0x00a5, 0x02);
    cpu.mem_writebyte(0x0100, 0x3d);
    cpu.mem_writebyte(0x0101, 0x0e);
    cpu.mem_writebyte(0x00FA, 0x01); // game_info2 ($00FA): bit 0 = 2-player mode
    cpu.mem_writebyte(0x0251, 0x00); // comm_flag ($0251) = 0
    cpu.mem_writebyte(0x0162, 0x01); // active game flag ($0162) = 1
    cpu.mem_writebyte(0x0244, 0x01); // plyr1_id = 1
    cpu.mem_writebyte(0x0245, 0x02); // plyr2_id = 2

    const code = [
      0x49, 0x4E, 0x72, // call init_uart ($4E72)
      0x49, 0x59, 0xCD, // call custom TIM1 ISR installer ($59CD)!
      0x58, 0x89, 0x10, // mov IE0 ($10), #89h (re-enable LCDC_INT + DMA_INT + UART_INT)
      0xC0, 0x01, 0x39, 0x80, 0x03, 0x11,
      0x49, 0x6C, 0xC8, // call open_h2hx ($6CC8)
      0xC0, 0x02, 0x39, 0x80, 0x03, 0x11,
      0x49, 0x6D, 0x6F, // call exchg_openx ($6D6F)
      0xC0, 0x03, 0x39, 0x80, 0x03, 0x11,
      0x49, 0x4C, 0xEA, // call p2_decode_data / rec_decode_data ($4CEA)
      0xC0, 0x04, 0x39, 0x80, 0x03, 0x11,
      0x49, 0x4F, 0xC2, // call transmit_key / receive_key ($4FC2)
      0xC0, 0x05, 0x39, 0x80, 0x03, 0x11,
      0xB0, 0xFA,       // mov r0, $FA (game_info2)
      0x39, 0x80, 0x03, 0x10, // mov @0310h, r0
      0xD8, 0xFE
    ];
    code.forEach((b, i) => cpu.mem_writebyte(0xE100 + i, b));
    cpu.m_PC = 0xE100;
  };

  bootFmm(cpu1);
  bootFmm(cpu2);
  // Start CPU1 first, wait 5 frames (staggered start!), then start CPU2
  cpu1.onLinkPort3Change = (bits) => {
    console.log(`  [CPU1 -> CPU2 P3] bits=${bits} at PC=$${cpu1.pc.toString(16)} FA=$${cpu1.mem_readbyte(0xfa).toString(16)}`);
    cpu2.setRemotePort3Bits(bits, true);
    console.log(`    -> cpu2.remotePort3Bits=${cpu2.remotePort3Bits} queue=${JSON.stringify(cpu2.remotePort3Queue)}`);
  };
  cpu2.onLinkPort3Change = (bits) => {
    console.log(`  [CPU2 -> CPU1 P3] bits=${bits} at PC=$${cpu2.pc.toString(16)} FA=$${cpu2.mem_readbyte(0xfa).toString(16)}`);
    cpu1.setRemotePort3Bits(bits, true);
    console.log(`    -> cpu1.remotePort3Bits=${cpu1.remotePort3Bits} queue=${JSON.stringify(cpu1.remotePort3Queue)}`);
  };
  const stepFmmFrames = (n: number) => {
    for (let i = 0; i < n; i++) {
      cpu1.mem_writebyte(0x0011, 0x00);
      cpu1.runFrame();
      flush1to2();
      cpu2.mem_writebyte(0x0011, 0x00);
      cpu2.runFrame();
      flush2to1();
    }
  };
  setupFmmCall(cpu1);
  stepFmmFrames(5);
  setupFmmCall(cpu2);
  for (let f = 0; f < 40; f++) {
    stepFmmFrames(1);
    if (f < 15 || (cpu1.mem_readbyte(0x311) >= 4 && cpu2.mem_readbyte(0x311) >= 4)) {
      console.log(`  Frame ${f}: CPU1 stage=${cpu1.mem_readbyte(0x311)} FA=$${cpu1.mem_readbyte(0xfa).toString(16)} P3=$${cpu1.mem_readbyte(0x17).toString(16)} $0164=${cpu1.mem_readbyte(0x164)} PC=$${cpu1.pc.toString(16)} | CPU2 stage=${cpu2.mem_readbyte(0x311)} FA=$${cpu2.mem_readbyte(0xfa).toString(16)} P3=$${cpu2.mem_readbyte(0x17).toString(16)} $0164=${cpu2.mem_readbyte(0x164)} PC=$${cpu2.pc.toString(16)}`);
    }
    if (cpu1.mem_readbyte(0x311) === 5 && cpu2.mem_readbyte(0x311) === 5) break;
  }

  const info1 = cpu1.mem_readbyte(0x0310);
  const info2 = cpu2.mem_readbyte(0x0310);
  const comm1 = cpu1.mem_readbyte(0x0251);
  const comm2 = cpu2.mem_readbyte(0x0251);
  console.log(`FMM open_h2hx + exchg_openx: CPU1 stage=${cpu1.mem_readbyte(0x311)} FA=$${cpu1.mem_readbyte(0xfa).toString(16)} game_info2=$${info1.toString(16)} comm_flag=$${comm1.toString(16)} PC=$${cpu1.pc.toString(16)} rxFifo=${cpu1.uartRxFifo.length}`);
  console.log(`FMM open_h2hx + exchg_openx: CPU2 stage=${cpu2.mem_readbyte(0x311)} FA=$${cpu2.mem_readbyte(0xfa).toString(16)} game_info2=$${info2.toString(16)} comm_flag=$${comm2.toString(16)} PC=$${cpu2.pc.toString(16)} rxFifo=${cpu2.uartRxFifo.length}`);

  if ((info1 & 0x01) === 0 || (info2 & 0x01) === 0 || (comm1 & 0x40) !== 0 || (comm2 & 0x40) !== 0) {
    throw new Error('Fighters Megamix open_h2hx + exchg_openx disconnected!');
  }
  console.log('PASS: Fighters Megamix open_h2hx + exchg_openx succeeded with zero connection errors!\n');
}

// ============================================================================
// TEST 3: Mortal Kombat Trilogy ($8C40 2P Init + $50E4 Fighter Select Pulse + $4490 Match Init + $42AE Round Sync)
// ============================================================================
console.log('--- TEST 3: Mortal Kombat Trilogy ($8C40 Handshake + Fighter Select + $E3/$EF Match Init) ---');
{
  const { cpu1, cpu2, stepFrames } = createLinkedPair(mktRom);
  stepFrames(120);

  const setupMktTest = (cpu: SM8521CPU, fighterId: number) => {
    cpu.mem_writebyte(0x0017, (cpu.mem_readbyte(0x0017) & 0x3F) | 0x40); // Select Slot 1
    cpu.mem_writebyte(0x0026, 0x22); // MMU2 = bank $22 ($4000-$5FFF)
    cpu.mem_writebyte(0x0027, 0x23); // MMU3 = bank $23 ($6000-$7FFF)
    cpu.mem_writebyte(0x0028, 0x27); // MMU4 = bank $27 ($8000-$9FFF)
    cpu.mem_writebyte(0x001B, 0x00); // PS0 = RP 0
    cpu.mem_writebyte(0x001E, 0x00);
    cpu.mem_writebyte(0x0261, fighterId); // Selected fighter

    const code = [
      0x49, 0x8C, 0x40, // call $8C40
      0x49, 0x50, 0xE4, // call $50E4
      0x49, 0x44, 0x90, // call $4490
      0x49, 0x42, 0xAE, // call $42AE
      0xC0, 0xAA,       // mov r0, #AAh
      0x39, 0x80, 0x03, 0x10, // mov @0310h, r0
      0xD8, 0xFE        // br self
    ];
    code.forEach((b, i) => cpu.mem_writebyte(0xE100 + i, b));
    cpu.m_PC = 0xE100;
  };

  setupMktTest(cpu1, 0x03);
  stepFrames(4); // Stagger console 1 and console 2 by 4 frames!
  setupMktTest(cpu2, 0x05);
  stepFrames(40);

  const mkt1 = cpu1.mem_readbyte(0x0310);
  const mkt2 = cpu2.mem_readbyte(0x0310);
  const role1 = cpu1.mem_readbyte(0x0212);
  const role2 = cpu2.mem_readbyte(0x0212);
  const err1 = cpu1.mem_readbyte(0x0210);
  const err2 = cpu2.mem_readbyte(0x0210);
  console.log(`MKT: CPU1 marker=$${mkt1.toString(16)} role($0212)=${role1} err($0210)=${err1} PC=$${cpu1.pc.toString(16)}`);
  console.log(`MKT: CPU2 marker=$${mkt2.toString(16)} role($0212)=${role2} err($0210)=${err2} PC=$${cpu2.pc.toString(16)}`);

  if (mkt1 !== 0xAA || mkt2 !== 0xAA || err1 !== 0 || err2 !== 0) {
    throw new Error('Mortal Kombat Trilogy failed handshake, fighter select pulse, or match start!');
  }
  console.log('PASS: Mortal Kombat Trilogy passed $8C40 handshake, $50E4 P3 pulse, $4490 match start, and $42AE round sync!');
}
