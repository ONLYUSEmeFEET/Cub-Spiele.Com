/**
 * Cub Spiele.Com — Minimal IPS (International Patching System) Binary Patcher
 * Used to auto-patch the Castlevania: Symphony of the Night prototype ROM
 * into Castlevania - Symphony of the Night Reborn in-memory when loaded via the Library.
 */

export function applyIpsPatch(source: Uint8Array, patch: Uint8Array): Uint8Array {
  if (
    patch.length < 8 ||
    patch[0] !== 0x50 || // 'P'
    patch[1] !== 0x41 || // 'A'
    patch[2] !== 0x54 || // 'T'
    patch[3] !== 0x43 || // 'C'
    patch[4] !== 0x48    // 'H'
  ) {
    throw new Error('Invalid IPS patch header.');
  }

  let out = new Uint8Array(source);
  const ensureCapacity = (needed: number) => {
    if (needed <= out.length) return;
    const grown = new Uint8Array(needed);
    grown.set(out);
    out = grown;
  };

  let pos = 5;
  while (pos + 3 <= patch.length) {
    // 'EOF' (0x45 0x4F 0x46)
    if (patch[pos] === 0x45 && patch[pos + 1] === 0x4f && patch[pos + 2] === 0x46) {
      pos += 3;
      if (pos + 3 === patch.length) {
        const truncLen = (patch[pos] << 16) | (patch[pos + 1] << 8) | patch[pos + 2];
        if (truncLen < out.length) {
          out = out.subarray(0, truncLen);
        }
      }
      return out;
    }

    const offset = (patch[pos] << 16) | (patch[pos + 1] << 8) | patch[pos + 2];
    pos += 3;
    if (pos + 2 > patch.length) {
      throw new Error('Truncated IPS record.');
    }
    const size = (patch[pos] << 8) | patch[pos + 1];
    pos += 2;

    if (size === 0) {
      if (pos + 3 > patch.length) {
        throw new Error('Truncated IPS RLE record.');
      }
      const rleSize = (patch[pos] << 8) | patch[pos + 1];
      const value = patch[pos + 2];
      pos += 3;
      ensureCapacity(offset + rleSize);
      out.fill(value, offset, offset + rleSize);
    } else {
      if (pos + size > patch.length) {
        throw new Error('Truncated IPS data record.');
      }
      ensureCapacity(offset + size);
      out.set(patch.subarray(pos, pos + size), offset);
      pos += size;
    }
  }

  throw new Error('IPS patch missing EOF marker.');
}
