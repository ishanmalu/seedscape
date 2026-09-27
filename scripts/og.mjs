// Renders the raw map for public/og.png (1200x630): biome colours with relief
// shading from the WebAssembly build. scripts/og.py adds the title on top.
// Usage: node scripts/og.mjs <out.rgba>
import { writeFileSync } from 'node:fs';
import createModule from '../public/cubiomes.mjs';
import { NATURAL, hexRGB } from '../public/palette.js';

const W = 1200, H = 630, S = 4, SEED = 12345n, X0 = -1400, Z0 = -1500;
const m = await createModule();
m._sm_init(28, SEED, 0);
for (let id = 0; id < 256; id++) {
  const hex = NATURAL[m.UTF8ToString(m._sm_biome_name(id))];
  if (hex) m._sm_set_color(id, ...hexRGB(hex));
}
const p = m._sm_biomes(S, X0 / S, Z0 / S, W, H, 80);
const rgba = new Uint8ClampedArray(m.HEAPU8.buffer, p, W * H * 4).slice();
const hp = m._sm_heights(S, X0 - S, Z0 - S, W + 2, H + 2) >> 2;
const hs = m.HEAPF32.slice(hp, hp + (W + 2) * (H + 2));
// Same hillshade as the site (worker.js), simplified.
const L = [-0.6, 0.75, -0.45].map((c, _, v) => c / Math.hypot(...v));
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const c = (j + 1) * (W + 2) + i + 1, h = hs[c];
    const dx = (hs[c + 1] - hs[c - 1]) * 0.275, dz = (hs[c + W + 2] - hs[c - W - 2]) * 0.275;
    let f = 1 + ((-dx * L[0] + L[1] - dz * L[2]) / Math.hypot(dx, 1, dz) - L[1]) * 1.6;
    if (h < 62) f = 1 + (f - 1) * 0.25;
    f = Math.max(0.35, Math.min(1.55, f));
    const o = (j * W + i) * 4;
    for (let k = 0; k < 3; k++) rgba[o + k] *= f;
  }
writeFileSync(process.argv[2], rgba);
