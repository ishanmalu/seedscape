// Generation worker: owns one cubiomes instance and renders map tiles.
import createModule from './cubiomes.mjs';

const TILE = 256;
const mod = await createModule();
let current = '';

function init(mc, seed, dim) {
  const key = `${mc}|${seed}|${dim}`;
  if (key === current) return;
  mod._sm_init(mc, BigInt(seed), dim);
  current = key;
}

const out = () => mod._sm_out() >> 2;
const pairs = (n) => {
  const o = out(), r = [];
  for (let i = 0; i < n; i++) r.push([mod.HEAP32[o + i * 2], mod.HEAP32[o + i * 2 + 1]]);
  return r;
};

// Biome cell size for a tile: the smallest of 4/16/64/256 that keeps a tile
// at no more than 256 cells across.
const cellScale = (bpp) => [4, 16, 64, 256].find((s) => s >= bpp) ?? 256;

function tile({ tx, tz, bpp, structs }) {
  const span = TILE * bpp;
  const s = cellScale(bpp);
  const cells = span / s;
  const x0 = tx * span, z0 = tz * span;
  const y = s === 4 ? 16 : s === 16 ? 4 : s === 64 ? 1 : 0;

  const ptr = mod._sm_biomes(s, x0 / s, z0 / s, cells, cells, y);
  if (!ptr) return null;
  const rgba = new Uint8ClampedArray(mod.HEAPU8.buffer, ptr, cells * cells * 4).slice();
  const idp = mod._sm_ids() >> 2;
  const ids = Uint8Array.from(mod.HEAP32.subarray(idp, idp + cells * cells));

  const canvas = new OffscreenCanvas(cells, cells);
  canvas.getContext('2d').putImageData(new ImageData(rgba, cells, cells), 0, 0);
  const bitmap = canvas.transferToImageBitmap();

  const found = [];
  for (const t of structs) {
    const n = mod._sm_structures(t, x0, z0, x0 + span - 1, z0 + span - 1);
    for (const [x, z] of pairs(n)) found.push({ t, x, z });
  }

  let slime = null;
  if (bpp <= 2) {
    const c = span / 16;
    const sp = mod._sm_slime(x0 / 16, z0 / 16, c, c);
    slime = mod.HEAPU8.slice(sp, sp + c * c);
  }
  return { bitmap, ids, cells, found, slime };
}

function world({ strongholds }) {
  mod._sm_spawn();
  const spawn = pairs(1)[0];
  const sh = strongholds ? pairs(mod._sm_strongholds(128)) : [];
  const names = {}, colors = {};
  for (let i = 0; i < 256; i++) {
    const name = mod.UTF8ToString(mod._sm_biome_name(i));
    if (!name || name === '?' ) continue;
    const c = mod._sm_color(i);
    names[i] = name;
    colors[i] = `rgb(${mod.HEAPU8[c]},${mod.HEAPU8[c + 1]},${mod.HEAPU8[c + 2]})`;
  }
  return { spawn, strongholds: sh, names, colors };
}

self.onmessage = ({ data }) => {
  const { id, kind, mc, seed, dim } = data;
  try {
    init(mc, seed, dim);
    if (kind === 'tile') {
      const r = tile(data);
      self.postMessage({ id, ...r }, r ? [r.bitmap] : []);
    } else if (kind === 'world') {
      self.postMessage({ id, ...world(data) });
    }
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
self.postMessage({ ready: true });
