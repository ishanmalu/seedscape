// Generation worker: owns one cubiomes instance and renders map tiles.
import createModule from './cubiomes.mjs';

const TILE = 256;
const SEA = 63;
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
  return { spawn, names, overworld };
}

self.onmessage = ({ data }) => {
  const { id, kind, mc, seed, dim } = data;
  try {
    init(mc, seed, dim);
    if (kind === 'tile') {
      const r = tile(data);
      self.postMessage({ id, ...r }, r ? [r.bitmap] : []);
    } else if (kind === 'mesh') {
      const r = mesh(data);
      self.postMessage({ id, ...r }, r.pos ? [r.pos.buffer, r.nor.buffer, r.col.buffer, r.index.buffer, r.heights.buffer, r.top.buffer] : []);
    } else if (kind === 'world') {
      self.postMessage({ id, ...world(data) });
    } else if (kind === 'strongholds') {
      self.postMessage({ id, strongholds: pairs(mod._sm_strongholds(128)) });
    }
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
self.postMessage({ ready: true });
