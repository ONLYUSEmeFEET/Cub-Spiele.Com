/**
 * Headless Game.com harness for the Castlevania patch project.
 * Usage (from repo root):
 *   npx tsx tools/cv_patch/harness.ts <rom> <script.json> [outDir]
 * script.json: [{"f":120}, {"press":"a","f":3}, {"shot":"name"}, {"ram":"name","from":256,"len":1024}, ...]
 *   {"f":N}           run N frames
 *   {"press":"b","f":N}  hold button b for N frames then release
 *   {"shot":"x"}      write x.png (4-shade LCD)
 *   {"ram":"x","from":A,"len":L}  write x.bin of internal memory via mem_readbyte
 *   {"poke":A,"v":V}  write one byte
 *   {"log":[A,...]}   print bytes at addresses
 * Never touches the ROM file.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { unzipSync } from 'fflate';
import { SM8521CPU } from '../../src/emulator/sm8521';
import { buildSaveStatePayload, applySaveStateToCpu } from '../../src/emulator/saveStates';

const [romPath, scriptPath, outDir = 'tools/cv_patch/work/out'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

function loadRom(p: string): Uint8Array {
  const b = new Uint8Array(fs.readFileSync(p));
  if (p.toLowerCase().endsWith('.zip')) { const f = unzipSync(b); return f[Object.keys(f)[0]]; }
  return b;
}

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf: Buffer) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(t: string, d: Buffer) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }
function png(w: number, h: number, gray: Uint8Array, scale = 2) {
  const W = w * scale, H = h * scale; const raw = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = gray[Math.floor(y / scale) * w + Math.floor(x / scale)];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const cpu = new SM8521CPU();
cpu.loadExternalBIOS(new Uint8Array(fs.readFileSync('public/bios/external.bin')));
cpu.loadInternalBIOS(new Uint8Array(fs.readFileSync('public/bios/internal.bin')));
cpu.loadCartridgeROM(loadRom(romPath), 1);
cpu.reset();
cpu.syncDeviceDateTime();
cpu.allowDataFoundPrompt = false;

const run = (n: number) => { for (let i = 0; i < n; i++) cpu.runFrame(); };
const shades = [255, 170, 85, 0];

for (const s of JSON.parse(fs.readFileSync(scriptPath, 'utf8'))) {
  if (s.save) {
    const st = buildSaveStatePayload(cpu, { slot1Title: 'CV', slot1HeaderTitle: 'CVA', slot1HeaderGameId: 0x448, slot1RomHash: '' }, 1);
    fs.writeFileSync(s.save, JSON.stringify(st));
  }
  if (s.load) applySaveStateToCpu(cpu, JSON.parse(fs.readFileSync(s.load, 'utf8')));
  if (s.watch) {
    // {"watch":[0x1ab,...],"n":N,"sched":{"2":["c"],"8":[]}}: logs writers (PC) of the watched addresses
    const set = new Set<number>(s.watch);
    const orig = cpu.mem_writebyte.bind(cpu);
    const log = new Map<string, { n: number; vals: Set<number> }>();
    let curPc = 0;
    (cpu as any).mem_writebyte = (a: number, v: number) => {
      if (set.has(a & 0xffff)) {
        const pc = (cpu as any).m_PC;
        const bank = cpu.mmu[pc >> 13];
        const key = `pc=${bank.toString(16)}:${pc.toString(16)} addr=${(a & 0xffff).toString(16)}`;
        const e = log.get(key) ?? { n: 0, vals: new Set<number>() };
        e.n++; if (e.vals.size < 8) e.vals.add(v & 0xff); log.set(key, e);
      }
      return orig(a, v);
    };
    let cur: string[] = [];
    for (let i = 0; i < s.n; i++) {
      if (s.sched && s.sched[String(i)] !== undefined) cur = s.sched[String(i)];
      for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd']) (cpu.buttonsState as any)[k] = cur.includes(k) || (s.hold ?? []).includes(k);
      cpu.runFrame();
    }
    for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd', 'pause', 'menu']) (cpu.buttonsState as any)[k] = false;
    (cpu as any).mem_writebyte = orig;
    void curPc;
    console.log('WATCH ' + JSON.stringify(s.watch) + ' mmu=' + Array.from(cpu.mmu).map((x: number) => x.toString(16)).join(','));
    for (const [k, e] of [...log.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k} n=${e.n} vals=${[...e.vals].map((x) => x.toString(16)).join(',')}`);
  }
  if (s.pcprof) {
    // {"pcprof":"name","n":N,"sched":{...}}: histogram of executed PCs (cart code only) -> name.pcs (JSON {"mmu:pc":count})
    const hist: Record<string, number> = {};
    const origStep = cpu.step.bind(cpu);
    (cpu as any).step = () => {
      const pc = cpu.m_PC;
      if (pc >= 0x4000 && pc < 0xA000) {
        const bank = cpu.mmu[pc >> 13];
        if (bank >= 0x20) { const key = (bank * 0x2000 + (pc & 0x1fff)).toString(16); hist[key] = (hist[key] ?? 0) + 1; }
      }
      return origStep();
    };
    let cur: string[] = [];
    for (let i = 0; i < s.n; i++) {
      if (s.sched && s.sched[String(i)] !== undefined) cur = s.sched[String(i)];
      for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd', 'pause', 'menu']) (cpu.buttonsState as any)[k] = cur.includes(k);
      cpu.runFrame();
    }
    for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd', 'pause', 'menu']) (cpu.buttonsState as any)[k] = false;
    (cpu as any).step = origStep;
    fs.writeFileSync(path.join(outDir, s.pcprof + '.pcs'), JSON.stringify(hist));
  }
  if (s.rec) {
    // {"rec":"name","n":N,"hold":["right"],"hold_until":{"3":["a"]}} : per-frame dump of $0000-$03FF (N*1024 bytes)
    const out = Buffer.alloc(s.n * 0x400);
    for (let i = 0; i < s.n; i++) {
      const held: string[] = [...(s.hold ?? []), ...((s.sched && s.sched[String(i)]) ?? [])];
      if (s.sched && s.sched[String(i)] !== undefined) s._cur = s.sched[String(i)];
      const cur: string[] = [...(s.hold ?? []), ...((s._cur as string[]) ?? [])];
      for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd', 'pause', 'menu']) (cpu.buttonsState as any)[k] = cur.includes(k);
      cpu.runFrame();
      for (let j = 0; j < 0x400; j++) out[i * 0x400 + j] = cpu.mem_readbyte(j);
      if (s.ptrdump) {
        // {"ptrdump":[ptrAddr,len]}: follow 16-bit pointer at ptrAddr each frame and dump len bytes -> name.obj
        const p = (cpu.mem_readbyte(s.ptrdump[0]) << 8) | cpu.mem_readbyte(s.ptrdump[0] + 1);
        if (!s._obj) { s._obj = Buffer.alloc(s.n * (s.ptrdump[1] + 2)); }
        const rec = s.ptrdump[1] + 2;
        s._obj[i * rec] = p >> 8; s._obj[i * rec + 1] = p & 0xff;
        for (let j = 0; j < s.ptrdump[1]; j++) s._obj[i * rec + 2 + j] = cpu.mem_readbyte(p + j);
      }
      if (s.shotEvery && i % s.shotEvery === 0) {
        const g = new Uint8Array(200 * 160);
        for (let y = 0; y < 160; y++) for (let x = 0; x < 200; x++) g[y * 200 + x] = shades[cpu.getVRAMPixel(x, y) & 3];
        fs.writeFileSync(path.join(outDir, `${s.rec}_${i / s.shotEvery + 1}.png`), png(200, 160, g));
      }
      void held;
    }
    for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd', 'pause', 'menu']) (cpu.buttonsState as any)[k] = false;
    fs.writeFileSync(path.join(outDir, s.rec + '.rec'), out);
    if (s._obj) fs.writeFileSync(path.join(outDir, s.rec + '.obj'), s._obj);
  }
  if (s.tap) { cpu.stylusPressed = true; cpu.stylusX = s.tap[0]; cpu.stylusY = s.tap[1]; run(s.f ?? 12); cpu.stylusPressed = false; run(s.after ?? 2); }
  else if (s.press) { (cpu.buttonsState as any)[s.press] = true; run(s.f ?? 3); (cpu.buttonsState as any)[s.press] = false; run(s.after ?? 2); }
  else if (s.f) run(s.f);
  if (s.shot) {
    const g = new Uint8Array(200 * 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 200; x++) g[y * 200 + x] = shades[cpu.getVRAMPixel(x, y) & 3];
    fs.writeFileSync(path.join(outDir, s.shot + '.png'), png(200, 160, g));
  }
  if (s.ram) {
    const b = Buffer.alloc(s.len); for (let i = 0; i < s.len; i++) b[i] = cpu.mem_readbyte(s.from + i);
    fs.writeFileSync(path.join(outDir, s.ram + '.bin'), b);
  }
  if (s.poke !== undefined) cpu.mem_writebyte(s.poke, s.v);
  if (s.log) console.log(s.log.map((a: number) => `${a.toString(16)}=${cpu.mem_readbyte(a).toString(16)}`).join(' '));
}
console.log('done; PC=' + cpu.pc.toString(16));

