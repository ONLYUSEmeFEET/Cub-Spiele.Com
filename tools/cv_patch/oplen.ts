/** Instruction-length oracle: runs the emulator's step() on every (b0,b1) pair and records how many
 *  bytes of the instruction stream were fetched. Output: tools/cv_patch/work/oplen.json
 *  Run: npx.cmd tsx tools/cv_patch/oplen.ts
 */
import * as fs from 'fs';
import { SM8521CPU } from '../../src/emulator/sm8521';

const cpu = new SM8521CPU();
cpu.reset();
const BASE = 0x0300;
const out: number[][] = [];
const origRead = cpu.mem_readbyte.bind(cpu);
let fetched = 0;
let startPc = BASE;
(cpu as any).mem_readbyte = (a: number) => {
  a &= 0xffff;
  if (a >= startPc && a < startPc + 8) fetched = Math.max(fetched, a - startPc + 1);
  return origRead(a);
};
for (let b0 = 0; b0 < 256; b0++) {
  const row: number[] = [];
  for (let b1 = 0; b1 < 256; b1++) {
    cpu.m_halted = 0 as any;
    cpu.m_PC = BASE; startPc = BASE; fetched = 0;
    const pat = [b0, b1, 0x11, 0x22, 0x33, 0x44];
    for (let i = 0; i < pat.length; i++) cpu.m_p_ram[BASE + i] = pat[i];
    try { cpu.step(); } catch { /* ignore */ }
    row.push(fetched);
  }
  out.push(row);
}
fs.mkdirSync('tools/cv_patch/work', { recursive: true });
fs.writeFileSync('tools/cv_patch/work/oplen.json', JSON.stringify(out));
// summary: per b0, the set of distinct lengths
const lines: string[] = [];
for (let b0 = 0; b0 < 256; b0++) {
  const set = [...new Set(out[b0])].sort();
  lines.push(`${b0.toString(16).padStart(2, '0')}: ${set.join(',')}`);
}
console.log(lines.join('\n'));
