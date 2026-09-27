// Generation worker: owns one cubiomes instance and renders map tiles.
import createModule from './cubiomes.mjs';
import { PALETTES, hexRGB } from './palette.js';

const TILE = 256;
const SEA = 63;
const END_ISLANDS = 1000; // pseudo structure type for small End islands
const CACHE_V = 4;        // bump when tile output changes, to ignore old cache entries
const mod = await createModule();
let current = '';

// ---------- tile cache (IndexedDB) ----------
// Generated tiles are kept between visits so returning to a seed is instant.
// Failures (private mode, quota) just mean no caching.
const db = new Promise((resolve) => {
  try {
    const req = indexedDB.open('seedscape-tiles', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('tiles').createIndex('t', 't');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  } catch { resolve(null); }
});
async function cacheGet(key) {
  const d = await db;
  if (!d) return null;
  return new Promise((res) => {
    try {
      const r = d.transaction('tiles').objectStore('tiles').get(key);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function cachePut(key, value) {
  const d = await db;
  if (!d) return;
  try { d.transaction('tiles', 'readwrite').objectStore('tiles').put({ ...value, t: Date.now() }, key); } catch {}
}
// Keep the cache under ~4000 entries by dropping the oldest.
async function prune() {
  const d = await db;
  if (!d) return;
  const store = d.transaction('tiles', 'readwrite').objectStore('tiles');
  const count = await new Promise((res) => { const r = store.count(); r.onsuccess = () => res(r.result); r.onerror = () => res(0); });
  if (count < 4000) return;
  let drop = count - 3000;
  store.index('t').openKeyCursor().onsuccess = (e) => {
    const c = e.target.result;
    if (!c || drop-- <= 0) return;
    store.delete(c.primaryKey);
    c.continue();
  };
}

// Biome colours follow the palette named in each request; switching is cheap.
let palette = 'classic';
function usePalette(name) {
  if (name === palette || !PALETTES[name]) return;
  mod._sm_reset_colors();
  const table = PALETTES[name];
  for (let id = 0; id < 256; id++) {
    const hex = table[mod.UTF8ToString(mod._sm_biome_name(id))];
    if (hex) mod._sm_set_color(id, ...hexRGB(hex));
  }
  palette = name;
}

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

// Biome image (+ biome ids and slime chunks) for one tile. `y` is a block
// height for an underground slice, or null for the surface.
async function tile({ tx, tz, bpp, relief, y, mc, seed, dim }) {
  const key = `b|${CACHE_V}|${mc}|${seed}|${dim}|${relief ? 1 : 0}|${y ?? 's'}|${palette}|${bpp}|${tx}|${tz}`;
  const hit = await cacheGet(key);
  if (hit) return { bitmap: await createImageBitmap(hit.png), ids: hit.ids, cells: hit.cells, slime: hit.slime };
  // Messages can interleave while awaiting the cache; restore this request's
  // generator and palette before generating.
  init(mc, seed, dim);
  usePalette(key.split('|')[7]);

  const span = TILE * bpp;
  const s = cellScale(bpp);
  const cells = span / s;
  const x0 = tx * span, z0 = tz * span;
  // "Surface" samples at the top of the world: 1.18+ cave biomes (lush caves,
  // deep dark...) only exist below ground, so this gives what a player sees.
  const cy = Math.floor((y ?? 320) / s);

  const ptr = mod._sm_biomes(s, x0 / s, z0 / s, cells, cells, cy);
  if (!ptr) return null;
  const rgba = new Uint8ClampedArray(mod.HEAPU8.buffer, ptr, cells * cells * 4).slice();
  const idp = mod._sm_ids() >> 2;
  const ids = Uint8Array.from(mod.HEAP32.subarray(idp, idp + cells * cells));

  if (relief && y == null) {
    const hs = heights(s, x0 - s, z0 - s, cells + 2, cells + 2);
    if (hs) shade(rgba, hs, cells, s);
  }

  const canvas = new OffscreenCanvas(cells, cells);
  canvas.getContext('2d').putImageData(new ImageData(rgba, cells, cells), 0, 0);

  let slime = null;
  if (bpp <= 2 && dim === 0) {
    const c = span / 16;
    const sp = mod._sm_slime(x0 / 16, z0 / 16, c, c);
    slime = mod.HEAPU8.slice(sp, sp + c * c);
  }
  // Cache as PNG (a fraction of the raw size); don't hold up the reply.
  canvas.convertToBlob({ type: 'image/png' }).then((png) => cachePut(key, { png, ids, cells, slime }));
  return { bitmap: canvas.transferToImageBitmap(), ids, cells, slime };
}

// Structure positions of the given types within one tile, per type.
async function structs({ tx, tz, bpp, types, mc, seed, dim }) {
  const span = TILE * bpp, x0 = tx * span, z0 = tz * span;
  const byType = {};
  for (const t of types) {
    const key = `s|${CACHE_V}|${mc}|${seed}|${dim}|${t}|${bpp}|${tx}|${tz}`;
    const hit = await cacheGet(key);
    if (hit) { byType[t] = hit.found; continue; }
    const found = [];
    if (t === END_ISLANDS) {
      const n = mod._sm_end_islands(x0, z0, x0 + span - 1, z0 + span - 1), o = out();
      for (let i = 0; i < n; i++) found.push({ t, x: mod.HEAP32[o + i * 3], z: mod.HEAP32[o + i * 3 + 1], r: mod.HEAP32[o + i * 3 + 2] });
    } else {
      const n = mod._sm_structures(t, x0, z0, x0 + span - 1, z0 + span - 1);
      for (const [x, z] of pairs(n)) found.push({ t, x, z });
      // End cities: note which have a ship (the elytra).
      if (t === 20) for (const f of found) { mod._sm_variant(20, f.x, f.z); f.ship = mod.HEAP32[out() + 8] === 1; }
    }
    byType[t] = found;
    cachePut(key, { found });
  }
  return { byType };
}

// Variant details for one structure (see sm_variant in api.c).
function variant({ type, x, z }) {
  mod._sm_variant(type, x, z);
  const o = out(), v = [...mod.HEAP32.subarray(o, o + 9)];
  return { biome: v[0], abandoned: !!v[1], start: v[2], giant: !!v[3], underground: !!v[4], basement: !!v[5], size: v[6], cracked: !!v[7], ship: !!v[8] };
}

function fortress({ x, z }) {
  const n = mod._sm_fortress_pieces(x, z), o = out();
  return { boxes: [...mod.HEAP32.subarray(o, o + n * 4)] };
}

function locate({ biome, x, z, maxR }) {
  const ok = mod._sm_locate_biome(biome, Math.round(x), Math.round(z), maxR);
  return ok ? { x: mod.HEAP32[out()], z: mod.HEAP32[out() + 1] } : { none: true };
}

// ---------- 3D terrain mesh ----------
// A square of n*n cells, `s` blocks each, centred on (x, z). Only visible faces
// are emitted: every top, plus cliff sides where a neighbour is lower.
// 1 unit = 1 cell horizontally; heights are exaggerated a little.
const exaggeration = (s) => 1.35 * Math.sqrt(s / 4);

function biomeRGB(id) {
  const c = mod._sm_color(id);
  return [mod.HEAPU8[c], mod.HEAPU8[c + 1], mod.HEAPU8[c + 2]];
}
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) & 255) / 255; };

function mesh({ x, z, n, s, structs }) {
  const x0 = Math.floor((x - (n * s) / 2) / s) * s, z0 = Math.floor((z - (n * s) / 2) / s) * s;
  const hs = heights(s, x0, z0, n, n);
  if (!hs) return { error: '3D terrain is only available in the Overworld on 1.18+.' };
  const ip = mod._sm_surface_biomes(s, x0, z0, n, n) >> 2;
  const ids = Uint8Array.from(mod.HEAP32.subarray(ip, ip + n * n));

  const E = exaggeration(s);
  const Y = (h) => (Math.round(h) / s) * E;
  let minY = Infinity;
  const top = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) { top[k] = Y(hs[k]); if (top[k] < minY) minY = top[k]; }
  const base = minY - 4;
  const seaY = Y(SEA - 1) + (0.5 / s) * E;

  const MAXQ = n * n * 5 + n * 4;
  const pos = new Float32Array(MAXQ * 12), nor = new Int8Array(MAXQ * 12), col = new Uint8Array(MAXQ * 12);
  let q = 0;
  // Quad a-b-c-d, counter-clockwise seen from outside; lo/hi colours per edge.
  function quad(v, nx, ny, nz, c1, c2) {
    const o = q * 4;
    for (let k = 0; k < 4; k++) {
      pos.set(v[k], (o + k) * 3);
      nor[(o + k) * 3] = nx * 127; nor[(o + k) * 3 + 1] = ny * 127; nor[(o + k) * 3 + 2] = nz * 127;
      col.set(k < 2 ? c1 : c2, (o + k) * 3);
    }
    q++;
  }
  const off = n / 2;
  const tint = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const SAND = [150, 140, 108], STONE = [118, 118, 124], DIRT = [112, 86, 60], SNOW = [244, 247, 251];

  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i, h = hs[k], t = top[k];
      let c = biomeRGB(ids[k]);
      const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
      c = mix(c, [lum, lum, lum], 0.12);
      if (h < SEA - 1) c = tint(mix(c, SAND, 0.6), 0.85);
      else if (h > 150) c = mix(c, SNOW, Math.min(1, (h - 150) / 25));
      c = tint(c, 0.94 + hash(i + x0, j + z0) * 0.12);
      const xa = i - off, xb = xa + 1, za = j - off, zb = za + 1;
      quad([[xa, t, za], [xa, t, zb], [xb, t, zb], [xb, t, za]], 0, 1, 0, c, c);

      const side = mix(c, h > 100 ? STONE : DIRT, 0.55), hi = tint(side, 0.8);
      const nb = (ii, jj) => (ii < 0 || jj < 0 || ii >= n || jj >= n ? base : top[jj * n + ii]);
      const face = (lo, verts, nx, nz) => {
        if (lo >= t) return;
        // Darker at the foot of tall cliffs, a cheap stand-in for ambient occlusion.
        const drop = t - lo, ao = drop > 3 ? 0.45 : 0.45 + 0.55 * (1 - drop / 3);
        const loC = tint(side, 0.8 * ao);
        quad(verts(lo), nx, 0, nz, loC, hi);
      };
      face(nb(i + 1, j), (lo) => [[xb, lo, zb], [xb, lo, za], [xb, t, za], [xb, t, zb]], 1, 0);
      face(nb(i - 1, j), (lo) => [[xa, lo, za], [xa, lo, zb], [xa, t, zb], [xa, t, za]], -1, 0);
      face(nb(i, j + 1), (lo) => [[xa, lo, zb], [xb, lo, zb], [xb, t, zb], [xa, t, zb]], 0, 1);
      face(nb(i, j - 1), (lo) => [[xb, lo, za], [xa, lo, za], [xa, t, za], [xb, t, za]], 0, -1);
    }
  const landQuads = q;

  // Water: a surface over every submerged cell, plus walls on the outer edge.
  const W = [34, 96, 178], Wd = [16, 44, 96];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const t = top[j * n + i];
      if (t >= seaY) continue;
      const xa = i - off, xb = xa + 1, za = j - off, zb = za + 1;
      quad([[xa, seaY, za], [xa, seaY, zb], [xb, seaY, zb], [xb, seaY, za]], 0, 1, 0, W, W);
      if (i === n - 1) quad([[xb, t, zb], [xb, t, za], [xb, seaY, za], [xb, seaY, zb]], 1, 0, 0, Wd, W);
      if (i === 0) quad([[xa, t, za], [xa, t, zb], [xa, seaY, zb], [xa, seaY, za]], -1, 0, 0, Wd, W);
      if (j === n - 1) quad([[xa, t, zb], [xb, t, zb], [xb, seaY, zb], [xa, seaY, zb]], 0, 0, 1, Wd, W);
      if (j === 0) quad([[xb, t, za], [xa, t, za], [xa, seaY, za], [xb, seaY, za]], 0, 0, -1, Wd, W);
    }

  const index = new Uint32Array(q * 6);
  for (let k = 0; k < q; k++) {
    const o = k * 4;
    index.set([o, o + 1, o + 2, o, o + 2, o + 3], k * 6);
  }

  const found = [];
  for (const t of structs) {
    const c = mod._sm_structures(t, x0, z0, x0 + n * s - 1, z0 + n * s - 1);
    for (const [px, pz] of pairs(c)) found.push({ t, x: px, z: pz });
  }
  return {
    x0, z0, n, s, base, seaY, E,
    pos: pos.slice(0, q * 12), nor: nor.slice(0, q * 12), col: col.slice(0, q * 12), index,
    landIndexCount: landQuads * 6,
    heights: hs, ids, top, found,
  };
}

function world({ dim, mc }) {
  let spawn = null;
  if (dim === 0) { mod._sm_spawn(); spawn = pairs(1)[0]; }
  const names = {};
  for (let i = 0; i < 256; i++) {
    const name = mod.UTF8ToString(mod._sm_biome_name(i));
    if (name && name !== '?') names[i] = name;
  }
  // Overworld biomes this version can generate, for the seed finder.
  const overworld = Object.keys(names).map(Number).filter((i) => mod._sm_biome_generates(mc, i));
  const colors = {};
  for (const i of Object.keys(names)) { const c = biomeRGB(+i); colors[i] = `rgb(${c[0]},${c[1]},${c[2]})`; }
  return { spawn, names, overworld, colors };
}

self.onmessage = async ({ data }) => {
  const { id, kind, mc, seed, dim } = data;
  try {
    if (kind === 'prune') { await prune(); self.postMessage({ id }); return; }
    init(mc, seed, dim);
    usePalette(data.palette ?? 'classic');
    if (kind === 'tile') {
      const r = await tile(data);
      self.postMessage({ id, ...r }, r ? [r.bitmap] : []);
    } else if (kind === 'structs') {
      self.postMessage({ id, ...(await structs(data)) });
    } else if (kind === 'mesh') {
      const r = mesh(data);
      self.postMessage({ id, ...r }, r.pos ? [r.pos.buffer, r.nor.buffer, r.col.buffer, r.index.buffer, r.heights.buffer, r.top.buffer] : []);
    } else if (kind === 'world') {
      self.postMessage({ id, ...world(data) });
    } else if (kind === 'strongholds') {
      self.postMessage({ id, strongholds: pairs(mod._sm_strongholds(128)) });
    } else if (kind === 'variant') {
      self.postMessage({ id, ...variant(data) });
    } else if (kind === 'fortress') {
      self.postMessage({ id, ...fortress(data) });
    } else if (kind === 'locate') {
      self.postMessage({ id, ...locate(data) });
    }
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
self.postMessage({ ready: true });
