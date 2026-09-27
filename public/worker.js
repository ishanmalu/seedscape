// Generation worker: owns one cubiomes instance and renders map tiles.
import createModule from './cubiomes.mjs';

const TILE = 256;
const SEA = 63;
const mod = await createModule();
let current = '';
let dimNow = 0;

function init(mc, seed, dim) {
  const key = `${mc}|${seed}|${dim}`;
  if (key === current) return;
  mod._sm_init(mc, BigInt(seed), dim);
  current = key;
  dimNow = dim;
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

// Heights for a w*h grid of cells `s` blocks apart, or null outside the Overworld.
function heights(s, x, z, w, h) {
  const p = mod._sm_heights(s, x, z, w, h);
  return p ? mod.HEAPF32.slice(p >> 2, (p >> 2) + w * h) : null;
}

// Hillshade + water depth + contour lines, applied in place to RGBA.
const L = (() => { const v = [-0.6, 0.75, -0.45], n = Math.hypot(...v); return v.map((c) => c / n); })();
function shade(rgba, hs, cells, s) {
  const W = cells + 2;
  const k = 1 / s;
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const c = (j + 1) * W + (i + 1);
      const hh = hs[c];
      const dx = (hs[c + 1] - hs[c - 1]) * 0.5 * k * 2.2;
      const dz = (hs[c + W] - hs[c - W]) * 0.5 * k * 2.2;
      const nl = Math.hypot(dx, 1, dz);
      const d = (-dx * L[0] + L[1] - dz * L[2]) / nl;
      let f = 1 + (d - L[1]) * 1.6;
      const p = (j * cells + i) * 4;
      let r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      // Soften cubiomes' saturated palette a little.
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      r = r * 0.85 + lum * 0.15; g = g * 0.85 + lum * 0.15; b = b * 0.85 + lum * 0.15;
      if (hh < SEA - 1) {
        const depth = Math.min(1, (SEA - hh) / 45);
        f = 1 + (f - 1) * 0.25;
        r = r * (1 - depth * 0.55); g = g * (1 - depth * 0.45); b = b * (1 - depth * 0.25);
      } else {
        // Brighten peaks slightly.
        f *= 0.92 + Math.min(0.2, Math.max(0, (hh - 90) / 400));
      }
      if (s <= 16) {
        const band = Math.floor(hh / 16);
        if (band !== Math.floor(hs[c + 1] / 16) || band !== Math.floor(hs[c + W] / 16)) f *= 0.86;
      }
      f = Math.max(0.35, Math.min(1.55, f));
      rgba[p] = r * f; rgba[p + 1] = g * f; rgba[p + 2] = b * f;
    }
}

function tile({ tx, tz, bpp, structs, relief }) {
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

  let hs = null;
  if (relief) {
    hs = heights(s, x0 - s, z0 - s, cells + 2, cells + 2);
    if (hs) shade(rgba, hs, cells, s);
  }

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

// A square of terrain for the 3D view: heights and biome colours, 4 blocks per cell.
function terrain({ x, z, n }) {
  const x0 = Math.floor((x - n * 2) / 4) * 4, z0 = Math.floor((z - n * 2) / 4) * 4;
  const hs = heights(4, x0, z0, n, n);
  if (!hs) return { error: 'Heights are only available in the Overworld on 1.18+.' };
  const ip = mod._sm_hids() >> 2;
  const ids = mod.HEAP32.slice(ip, ip + n * n);
  const colors = new Uint8Array(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    const c = mod._sm_color(ids[i]);
    colors[i * 3] = mod.HEAPU8[c]; colors[i * 3 + 1] = mod.HEAPU8[c + 1]; colors[i * 3 + 2] = mod.HEAPU8[c + 2];
  }
  return { x0, z0, n, heights: hs, ids: Uint8Array.from(ids), colors };
}

function world({ strongholds }) {
  mod._sm_spawn();
  const spawn = pairs(1)[0];
  const sh = strongholds ? pairs(mod._sm_strongholds(128)) : [];
  const names = {}, colors = {};
  for (let i = 0; i < 256; i++) {
    const name = mod.UTF8ToString(mod._sm_biome_name(i));
    if (!name || name === '?') continue;
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
    } else if (kind === 'terrain') {
      const r = terrain(data);
      self.postMessage({ id, ...r }, r.heights ? [r.heights.buffer, r.colors.buffer] : []);
    } else if (kind === 'world') {
      self.postMessage({ id, ...world(data) });
    }
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
self.postMessage({ ready: true });
