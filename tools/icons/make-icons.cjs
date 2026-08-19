/**
 * Generates the PWA icons for apps/manager/public without any dependency: a turf-green
 * roundel with a white ball and a stick stroke. PNG encoder = raw RGBA scanlines + zlib.
 * Run: node tools/icons/make-icons.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC_TABLE = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const R = maskable ? size / 2 : size * 0.47;
  const set = (x, y, r, g, b, a = 255) => { const i = (y * size + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; };
  // stick: a thick diagonal with a curled toe (two segments), drawn as distance fields
  const segDist = (x, y, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > R) { if (maskable) set(x, y, 0x1f, 0x7a, 0x4f); else set(x, y, 0, 0, 0, 0); continue; }
    // turf with a subtle stripe
    const stripe = Math.floor((x / size) * 8) % 2 === 0 ? 4 : 0;
    let [r, g, b] = [0x1f + stripe, 0x8a + stripe, 0x58 + stripe];
    // stick shaft from (0.30,0.78) to (0.68,0.30), toe from (0.30,0.78) to (0.42,0.86)
    const s1 = segDist(x, y, size * 0.32, size * 0.76, size * 0.70, size * 0.28);
    const s2 = segDist(x, y, size * 0.32, size * 0.76, size * 0.46, size * 0.84);
    const w = size * 0.055;
    if (s1 < w || s2 < w * 1.15) { [r, g, b] = [0xf4, 0xe6, 0xc8]; if (s1 < w * 0.35 && s1 <= s2) [r, g, b] = [0x2b, 0x1d, 0x0e]; }
    // ball
    const bd = Math.hypot(x + 0.5 - size * 0.70, y + 0.5 - size * 0.72);
    if (bd < size * 0.11) [r, g, b] = bd < size * 0.095 ? [0xfb, 0xfa, 0xf2] : [0x8a, 0x8a, 0x80];
    set(x, y, r, g, b, 255);
  }
  return png(size, size, px);
}

const out = path.resolve(__dirname, '../../apps/manager/public');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), draw(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), draw(512, false));
fs.writeFileSync(path.join(out, 'icon-512-maskable.png'), draw(512, true));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), draw(180, true));
fs.writeFileSync(path.join(out, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1f8a58"/><path d="M20 50 L45 18" stroke="#f4e6c8" stroke-width="7" stroke-linecap="round"/><path d="M20 50 L29 55" stroke="#f4e6c8" stroke-width="8" stroke-linecap="round"/><circle cx="45" cy="46" r="7" fill="#fbfaf2" stroke="#8a8a80" stroke-width="1"/></svg>`);
console.log('icons written to', out);
