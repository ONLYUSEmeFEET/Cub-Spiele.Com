/**
 * Game.com 200 x 160 Monochrome / 4-Shade LCD Display Subsystem
 * Emulates the passive-matrix STN LCD with authentic pixel response time,
 * ghosting/persistence, customizable palettes, and contrast controls.
 */

import { LCDPaletteId, PALETTES } from './types';

export const SCREEN_WIDTH = 200;
export const SCREEN_HEIGHT = 160;
export const VRAM_SIZE = (SCREEN_WIDTH * SCREEN_HEIGHT) / 4; // 8,000 bytes at 2 bpp

// Built-in 5x7 retro bitmap font for Game.com UI, menus, and text
export const FONT_5X7: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0],
  '!': [0, 0, 0x5f, 0, 0],
  '"': [0, 0x07, 0, 0x07, 0],
  '#': [0x14, 0x7f, 0x14, 0x7f, 0x14],
  '$': [0x24, 0x2a, 0x7f, 0x2a, 0x12],
  '%': [0x23, 0x13, 0x08, 0x64, 0x62],
  '&': [0x36, 0x49, 0x55, 0x22, 0x50],
  "'": [0, 0x05, 0x03, 0, 0],
  '(': [0, 0x1c, 0x22, 0x41, 0],
  ')': [0, 0x41, 0x22, 0x1c, 0],
  '*': [0x14, 0x08, 0x3e, 0x08, 0x14],
  '+': [0x08, 0x08, 0x3e, 0x08, 0x08],
  ',': [0, 0x50, 0x30, 0, 0],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '.': [0, 0x60, 0x60, 0, 0],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0, 0x42, 0x7f, 0x40, 0],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  ':': [0, 0x36, 0x36, 0, 0],
  ';': [0, 0x56, 0x36, 0, 0],
  '<': [0x08, 0x14, 0x22, 0x41, 0],
  '=': [0x14, 0x14, 0x14, 0x14, 0x14],
  '>': [0, 0x41, 0x22, 0x14, 0x08],
  '?': [0x02, 0x01, 0x51, 0x09, 0x06],
  '@': [0x32, 0x49, 0x79, 0x41, 0x3e],
  'A': [0x7e, 0x11, 0x11, 0x11, 0x7e],
  'B': [0x7f, 0x49, 0x49, 0x49, 0x36],
  'C': [0x3e, 0x41, 0x41, 0x41, 0x22],
  'D': [0x7f, 0x41, 0x41, 0x22, 0x1c],
  'E': [0x7f, 0x49, 0x49, 0x49, 0x41],
  'F': [0x7f, 0x09, 0x09, 0x09, 0x01],
  'G': [0x3e, 0x41, 0x49, 0x49, 0x7a],
  'H': [0x7f, 0x08, 0x08, 0x08, 0x7f],
  'I': [0, 0x41, 0x7f, 0x41, 0],
  'J': [0x20, 0x40, 0x41, 0x3f, 0x01],
  'K': [0x7f, 0x08, 0x14, 0x22, 0x41],
  'L': [0x7f, 0x40, 0x40, 0x40, 0x40],
  'M': [0x7f, 0x02, 0x0c, 0x02, 0x7f],
  'N': [0x7f, 0x04, 0x08, 0x10, 0x7f],
  'O': [0x3e, 0x41, 0x41, 0x41, 0x3e],
  'P': [0x7f, 0x09, 0x09, 0x09, 0x06],
  'Q': [0x3e, 0x41, 0x51, 0x21, 0x5e],
  'R': [0x7f, 0x09, 0x19, 0x29, 0x46],
  'S': [0x46, 0x49, 0x49, 0x49, 0x31],
  'T': [0x01, 0x01, 0x7f, 0x01, 0x01],
  'U': [0x3f, 0x40, 0x40, 0x40, 0x3f],
  'V': [0x1f, 0x20, 0x40, 0x20, 0x1f],
  'W': [0x3f, 0x40, 0x38, 0x40, 0x3f],
  'X': [0x63, 0x14, 0x08, 0x14, 0x63],
  'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
  'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
  '[': [0, 0x7f, 0x41, 0x41, 0],
  '\\': [0x02, 0x04, 0x08, 0x10, 0x20],
  ']': [0, 0x41, 0x41, 0x7f, 0],
  '^': [0x04, 0x02, 0x01, 0x02, 0x04],
  '_': [0x40, 0x40, 0x40, 0x40, 0x40],
  'a': [0x20, 0x54, 0x54, 0x54, 0x78],
  'b': [0x7f, 0x48, 0x44, 0x44, 0x38],
  'c': [0x38, 0x44, 0x44, 0x44, 0x20],
  'd': [0x38, 0x44, 0x44, 0x48, 0x7f],
  'e': [0x38, 0x54, 0x54, 0x54, 0x18],
  'f': [0x08, 0x7e, 0x09, 0x01, 0x02],
  'g': [0x0c, 0x52, 0x52, 0x52, 0x3e],
  'h': [0x7f, 0x08, 0x04, 0x04, 0x78],
  'i': [0, 0x44, 0x7d, 0x40, 0],
  'j': [0x20, 0x40, 0x44, 0x3d, 0],
  'k': [0x7f, 0x10, 0x28, 0x44, 0],
  'l': [0, 0x41, 0x7f, 0x40, 0],
  'm': [0x7c, 0x04, 0x18, 0x04, 0x78],
  'n': [0x7c, 0x08, 0x04, 0x04, 0x78],
  'o': [0x38, 0x44, 0x44, 0x44, 0x38],
  'p': [0x7c, 0x14, 0x14, 0x14, 0x08],
  'q': [0x08, 0x14, 0x14, 0x18, 0x7c],
  'r': [0x7c, 0x08, 0x04, 0x04, 0x08],
  's': [0x48, 0x54, 0x54, 0x54, 0x20],
  't': [0x04, 0x3f, 0x44, 0x40, 0x20],
  'u': [0x3c, 0x40, 0x40, 0x20, 0x7c],
  'v': [0x1c, 0x20, 0x40, 0x20, 0x1c],
  'w': [0x3c, 0x40, 0x30, 0x40, 0x3c],
  'x': [0x44, 0x28, 0x10, 0x28, 0x44],
  'y': [0x0c, 0x50, 0x50, 0x50, 0x3c],
  '♥': [0x0e, 0x1f, 0x3f, 0x1f, 0x0e],
  '♦': [0x08, 0x1c, 0x3e, 0x1c, 0x08],
  '♣': [0x18, 0x3e, 0x7f, 0x3e, 0x18],
  '♠': [0x18, 0x3c, 0x7e, 0x3c, 0x18],
  '·': [0, 0x18, 0x18, 0, 0],
  '•': [0, 0x18, 0x18, 0, 0],
  '★': [0x24, 0x7e, 0x3c, 0x7e, 0x24],
  '▲': [0x04, 0x0e, 0x1f, 0x0e, 0x04],
  '▼': [0x10, 0x38, 0x7c, 0x38, 0x10],
  '◄': [0x10, 0x38, 0x7c, 0xfe, 0],
  '►': [0, 0xfe, 0x7c, 0x38, 0x10],
  '■': [0x3e, 0x3e, 0x3e, 0x3e, 0x3e],
  '□': [0x3e, 0x22, 0x22, 0x22, 0x3e]
};

export class LCDSubsystem {
  // Current raw frame buffer (each byte stores four 2-bit pixels or 1 byte per pixel for simplicity)
  // 0 = Shade 0 (lightest background), 1 = Shade 1, 2 = Shade 2, 3 = Shade 3 (darkest pixel)
  public currentBuffer: Uint8Array;
  // Ghosting / persistence buffer (floating values 0.0 - 3.0)
  private persistenceBuffer: Float32Array;
  // Offscreen rendering canvas & imageData
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private imageData: ImageData;

  public paletteId: LCDPaletteId = 'original';
  public ghosting: number = 0.45; // 0.0 = no ghosting, 0.8 = heavy passive STN response
  public contrast: number = 1.0;
  public pixelGrid: boolean = true;

  constructor() {
    this.currentBuffer = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    this.persistenceBuffer = new Float32Array(SCREEN_WIDTH * SCREEN_HEIGHT);

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = SCREEN_WIDTH;
    this.offscreenCanvas.height = SCREEN_HEIGHT;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: false })!;
    this.imageData = this.offscreenCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  public clear(shade: number = 0) {
    this.currentBuffer.fill(shade & 0x03);
  }

  public setPixel(x: number, y: number, shade: number) {
    if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
    this.currentBuffer[y * SCREEN_WIDTH + x] = shade & 0x03;
  }

  public getPixel(x: number, y: number): number {
    if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return 0;
    return this.currentBuffer[y * SCREEN_WIDTH + x];
  }

  public drawHLine(x: number, y: number, width: number, shade: number) {
    if (y < 0 || y >= SCREEN_HEIGHT) return;
    const startX = Math.max(0, x);
    const endX = Math.min(SCREEN_WIDTH, x + width);
    const offset = y * SCREEN_WIDTH;
    const s = shade & 0x03;
    for (let curX = startX; curX < endX; curX++) {
      this.currentBuffer[offset + curX] = s;
    }
  }

  public drawVLine(x: number, y: number, height: number, shade: number) {
    if (x < 0 || x >= SCREEN_WIDTH) return;
    const startY = Math.max(0, y);
    const endY = Math.min(SCREEN_HEIGHT, y + height);
    const s = shade & 0x03;
    for (let curY = startY; curY < endY; curY++) {
      this.currentBuffer[curY * SCREEN_WIDTH + x] = s;
    }
  }

  public drawRect(x: number, y: number, w: number, h: number, shade: number, filled: boolean = false) {
    if (filled) {
      for (let curY = y; curY < y + h; curY++) {
        this.drawHLine(x, curY, w, shade);
      }
    } else {
      this.drawHLine(x, y, w, shade);
      this.drawHLine(x, y + h - 1, w, shade);
      this.drawVLine(x, y, h, shade);
      this.drawVLine(x + w - 1, y, h, shade);
    }
  }

  public drawText(text: string, x: number, y: number, shade: number = 3, scale: number = 1) {
    let curX = x;
    const s = shade & 0x03;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\n') {
        y += 8 * scale;
        curX = x;
        continue;
      }

      const glyph = FONT_5X7[char] || FONT_5X7['?'] || [0x7f, 0x7f, 0x7f, 0x7f, 0x7f];
      for (let col = 0; col < 5; col++) {
        const colBits = glyph[col];
        for (let row = 0; row < 7; row++) {
          if ((colBits >> row) & 1) {
            if (scale === 1) {
              this.setPixel(curX + col, y + row, s);
            } else {
              for (let sx = 0; sx < scale; sx++) {
                for (let sy = 0; sy < scale; sy++) {
                  this.setPixel(curX + col * scale + sx, y + row * scale + sy, s);
                }
              }
            }
          }
        }
      }
      curX += 6 * scale;
    }
  }

  public drawTextCentered(text: string, centerX: number, y: number, shade: number = 3, scale: number = 1) {
    const textWidth = text.length * 6 * scale - scale;
    const x = Math.floor(centerX - textWidth / 2);
    this.drawText(text, x, y, shade, scale);
  }

  /**
   * Draw a 1-bit or 2-bit bitmap
   */
  public drawBitmap(
    destX: number,
    destY: number,
    w: number,
    h: number,
    bitmap: number[] | Uint8Array,
    bpp: 1 | 2 = 1,
    invert: boolean = false
  ) {
    if (bpp === 1) {
      let byteIdx = 0;
      let bitIdx = 7;
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          if (byteIdx >= bitmap.length) break;
          const bit = (bitmap[byteIdx] >> bitIdx) & 1;
          const shade = invert ? (bit ? 0 : 3) : (bit ? 3 : 0);
          if (bit) {
            this.setPixel(destX + c, destY + r, shade);
          }
          bitIdx--;
          if (bitIdx < 0) {
            bitIdx = 7;
            byteIdx++;
          }
        }
      }
    } else {
      // 2bpp bitmap: 4 pixels per byte
      let byteIdx = 0;
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c += 4) {
          if (byteIdx >= bitmap.length) break;
          const byteVal = bitmap[byteIdx++];
          for (let p = 0; p < 4 && c + p < w; p++) {
            const shift = (3 - p) * 2;
            const shade = (byteVal >> shift) & 0x03;
            this.setPixel(destX + c + p, destY + r, shade);
          }
        }
      }
    }
  }

  /**
   * Render the 200x160 frame onto a target canvas with STN persistence and optional LCD grid
   */
  public renderToCanvas(targetCanvas: HTMLCanvasElement, targetCtx: CanvasRenderingContext2D) {
    const palette = PALETTES[this.paletteId] || PALETTES.original;
    const rgb = palette.rgbColors;
    const pixels = this.imageData.data;

    // Decay rate for STN LCD ghosting:
    // alpha = 1.0 means no ghosting (instant switch)
    // alpha = 0.5 means 50% previous frame remains
    const alpha = 1.0 - Math.min(0.85, Math.max(0, this.ghosting));

    const totalPixels = SCREEN_WIDTH * SCREEN_HEIGHT;
    for (let i = 0; i < totalPixels; i++) {
      const targetShade = this.currentBuffer[i];
      // Smooth interpolation toward target shade
      const currentVal = this.persistenceBuffer[i];
      const newVal = currentVal + (targetShade - currentVal) * alpha;
      this.persistenceBuffer[i] = newVal;

      // Map floating shade to palette colors with sub-shade interpolation
      const floorShade = Math.min(2, Math.max(0, Math.floor(newVal)));
      const ceilShade = floorShade + 1;
      const frac = newVal - floorShade;

      const c0 = rgb[floorShade];
      const c1 = rgb[ceilShade];

      let r = c0[0] + (c1[0] - c0[0]) * frac;
      let g = c0[1] + (c1[1] - c0[1]) * frac;
      let b = c0[2] + (c1[2] - c0[2]) * frac;

      // Apply contrast curve
      if (this.contrast !== 1.0) {
        r = Math.min(255, Math.max(0, ((r / 255 - 0.5) * this.contrast + 0.5) * 255));
        g = Math.min(255, Math.max(0, ((g / 255 - 0.5) * this.contrast + 0.5) * 255));
        b = Math.min(255, Math.max(0, ((b / 255 - 0.5) * this.contrast + 0.5) * 255));
      }

      const pixelOffset = i * 4;
      pixels[pixelOffset] = r;
      pixels[pixelOffset + 1] = g;
      pixels[pixelOffset + 2] = b;
      pixels[pixelOffset + 3] = 255;
    }

    this.offscreenCtx.putImageData(this.imageData, 0, 0);

    // Now render offscreen canvas to target canvas
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(
      this.offscreenCanvas,
      0,
      0,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      0,
      0,
      targetCanvas.width,
      targetCanvas.height
    );

    // Draw subtle passive-matrix pixel grid overlay if enabled
    if (this.pixelGrid && targetCanvas.width > SCREEN_WIDTH * 1.5) {
      const scaleX = targetCanvas.width / SCREEN_WIDTH;
      const scaleY = targetCanvas.height / SCREEN_HEIGHT;

      targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      targetCtx.lineWidth = 0.5;
      targetCtx.beginPath();
      // Vertical grid
      for (let x = 0; x <= SCREEN_WIDTH; x += 2) {
        const px = Math.floor(x * scaleX);
        targetCtx.moveTo(px, 0);
        targetCtx.lineTo(px, targetCanvas.height);
      }
      // Horizontal grid
      for (let y = 0; y <= SCREEN_HEIGHT; y += 2) {
        const py = Math.floor(y * scaleY);
        targetCtx.moveTo(0, py);
        targetCtx.lineTo(targetCanvas.width, py);
      }
      targetCtx.stroke();
    }
  }
}
