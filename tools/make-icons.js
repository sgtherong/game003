// 앱 아이콘 PNG 생성(의존성 없음):  node tools/make-icons.js
// 캐릭터(젤리) 얼굴을 픽셀 단위로 그려 web/icons/에 저장한다. 외부 이미지·폰트를 쓰지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── 최소 PNG 인코더 ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ── 그리기 도구(가장자리 부드럽게) ──
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const cov = d => Math.max(0, Math.min(1, 0.5 - d)); // 부호 거리 → 덮임 비율

function render(size, opts) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2, R = size * opts.radius;
  const bgTop = hex('#ffd9bd'), bgBot = hex('#fff4e8');
  const light = hex('#ffb59f'), mid = hex('#ff7658'), dark = hex('#c9433a');
  const ink = hex('#1f1630');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x + 0.5, fy = y + 0.5;
    // 배경: 세로 그라데이션 + 둥근 사각형(마스크용은 꽉 채움)
    let col = lerp(bgTop, bgBot, fy / size), a = 1;
    if (!opts.fullBleed) {
      const rr = size * 0.22, qx = Math.max(Math.abs(fx - c) - (c - rr), 0), qy = Math.max(Math.abs(fy - c) - (c - rr), 0);
      a = cov(Math.hypot(qx, qy) - rr);
    }
    const blend = (rgb, k) => { col = lerp(col, rgb, k); };
    // 발광
    const d = Math.hypot(fx - c, fy - c);
    blend(hex('#ff8f72'), Math.max(0, 1 - d / (R * 1.6)) * 0.35);
    // 몸(방사형 그라데이션)
    const k = cov(d - R);
    if (k > 0) {
      const t = Math.min(1, Math.hypot(fx - (c - R * 0.38), fy - (c - R * 0.42)) / (R * 1.4));
      const body = t < 0.5 ? lerp(light, mid, t / 0.5) : lerp(mid, dark, (t - 0.5) / 0.5);
      blend(body, k);
      // 광택
      const gx = (fx - (c - R * 0.34)) / (R * 0.22), gy = (fy - (c - R * 0.44)) / (R * 0.11);
      const ca = Math.cos(0.6), sa = Math.sin(0.6);
      const ex = gx * ca - gy * sa * (0.11 / 0.22), ey = gx * sa * (0.22 / 0.11) * 0.5 + gy * ca;
      blend([255, 255, 255], cov((Math.hypot(ex, ey) - 1) * R * 0.11) * 0.55 * k);
      // 눈(흰자 + 눈동자 + 반짝임)
      for (const s of [-1, 1]) {
        const cx = c + s * R * 0.32, cy = c - R * 0.04;
        const ed = Math.hypot((fx - cx) / (R * 0.13), (fy - cy) / (R * 0.155));
        blend([255, 255, 255], cov((ed - 1) * R * 0.13) * k);
        blend(ink, cov(Math.hypot(fx - cx, fy - (cy + R * 0.02)) - R * 0.085) * k);
        blend([255, 255, 255], cov(Math.hypot(fx - (cx - R * 0.03), fy - (cy - R * 0.02)) - R * 0.028) * k);
      }
      // 입(호)
      const mx = c, my = c + R * 0.22, mr = R * 0.12, lw = Math.max(1, R * 0.07);
      const ang = Math.atan2(fy - my, fx - mx);
      if (ang > 0.15 && ang < Math.PI - 0.15) blend(ink, cov(Math.abs(Math.hypot(fx - mx, fy - my) - mr) - lw / 2) * k);
      // 볼
      for (const s of [-1, 1]) {
        const bd = Math.hypot((fx - (c + s * R * 0.56)) / (R * 0.13), (fy - (c + R * 0.17)) / (R * 0.08));
        blend(hex('#ff5a6e'), cov((bd - 1) * R * 0.08) * 0.26 * k);
      }
    }
    const i = (y * size + x) * 4;
    px[i] = Math.round(col[0]); px[i + 1] = Math.round(col[1]); px[i + 2] = Math.round(col[2]); px[i + 3] = Math.round(a * 255);
  }
  return encodePNG(size, size, px);
}

const out = path.join(__dirname, '..', 'web', 'icons');
fs.mkdirSync(out, { recursive: true });
const targets = [
  ['icon-192.png', 192, { radius: 0.3 }],
  ['icon-512.png', 512, { radius: 0.3 }],
  ['icon-maskable-512.png', 512, { radius: 0.24, fullBleed: true }], // 안드로이드 마스크: 안전 영역(지름 80%) 안에 그림
  ['apple-touch-icon.png', 180, { radius: 0.3, fullBleed: true }]
];
for (const [name, size, opts] of targets) {
  fs.writeFileSync(path.join(out, name), render(size, opts));
  console.log('web/icons/' + name);
}
module.exports = { encodePNG };
