// Checks the WebAssembly build and the pure JS modules against known results.
// Run: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import createModule from '../public/cubiomes.mjs';
import { NATURAL } from '../public/palette.js';
import { parseSeed, javaHash, signed } from '../public/seed.js';
import { parsePins } from '../public/waypoints-io.js';

const m = await createModule();
const out = () => m._sm_out() >> 2;
const pairs = (n) => Array.from({ length: n }, (_, i) => [m.HEAP32[out() + i * 2], m.HEAP32[out() + i * 2 + 1]]);
const biomeName = (id) => m.UTF8ToString(m._sm_biome_name(id));
const MC = 28; // 1.21.4

function find(conds, { fromSpawn = 0, count = 5000, start = 1000000n } = {}) {
  const flat = conds.flat(), p = m._malloc(flat.length * 4);
  m.HEAP32.set(flat, p >> 2);
  const n = m._sm_find(MC, start, count, p, conds.length, fromSpawn, 16);
  m._free(p);
  const sp = m._sm_fout_seed() >> 3;
  return Array.from({ length: n }, (_, i) => BigInt.asUintN(64, m.HEAP64[sp + i]));
}

test('spawn for seed 12345 matches the known value', () => {
  m._sm_init(MC, 12345n, 0);
  m._sm_spawn();
  assert.deepEqual(pairs(1)[0], [96, -32]);
});

test('known village is found', () => {
  m._sm_init(MC, 12345n, 0);
  const villages = pairs(m._sm_structures(5, -2000, -2000, 2000, 2000));
  assert.ok(villages.some(([x, z]) => x === -144 && z === -832));
});

test('finder: every hit really has 3 villages within 700 blocks', () => {
  const seeds = find([[1, 5, 700, 3, 0]]);
  assert.ok(seeds.length > 0);
  for (const s of seeds.slice(0, 5)) {
    m._sm_init(MC, s, 0);
    const near = pairs(m._sm_structures(5, -700, -700, 700, 700)).filter(([x, z]) => x * x + z * z <= 700 * 700);
    assert.ok(near.length >= 3, `seed ${s} has ${near.length}`);
  }
});

test('finder: spawn-relative hits have a village near the exact spawn', () => {
  for (const s of find([[1, 5, 300, 1, 0]], { fromSpawn: 1, count: 300 }).slice(0, 3)) {
    m._sm_init(MC, s, 0);
    m._sm_spawn();
    const [sx, sz] = pairs(1)[0];
    const near = pairs(m._sm_structures(5, sx - 400, sz - 400, sx + 400, sz + 400))
      .filter(([x, z]) => (x - sx) ** 2 + (z - sz) ** 2 <= 400 ** 2); // estimate vs exact spawn: small slack
    assert.ok(near.length >= 1, `seed ${s}`);
  }
});

test('finder: End city hits match the map (terrain check included)', () => {
  const seeds = find([[1, 20, 1500, 1, 0]], { count: 300 });
  assert.ok(seeds.length > 0);
  for (const s of seeds.slice(0, 4)) {
    m._sm_init(MC, s, 1);
    const near = pairs(m._sm_structures(20, -1500, -1500, 1500, 1500)).filter(([x, z]) => x * x + z * z <= 1500 ** 2);
    assert.ok(near.length >= 1, `seed ${s}`);
  }
});

test('biome search lands on the requested biome', () => {
  m._sm_init(MC, 12345n, 0);
  const cherry = [...Array(256).keys()].find((i) => biomeName(i) === 'cherry_grove');
  assert.equal(m._sm_locate_biome(cherry, 0, 0, 8000), 1);
  const [x, z] = pairs(1)[0];
  assert.equal(biomeName(m._sm_biome_at(x, 64, z)), 'cherry_grove');
});

test('every Natural palette name is a real biome', () => {
  m._sm_init(MC, 0n, 0);
  const names = new Set([...Array(256).keys()].map(biomeName));
  const unknown = Object.keys(NATURAL).filter((n) => !names.has(n));
  assert.deepEqual(unknown, []);
});

test('surface map (sampled at y 320) shows no cave biomes', () => {
  m._sm_init(MC, 12345n, 0);
  m._sm_biomes(4, -128, -128, 256, 256, 80); // what worker.js does for the surface
  const ids = m.HEAP32.subarray(m._sm_ids() >> 2, (m._sm_ids() >> 2) + 256 * 256);
  const caves = new Set(['lush_caves', 'dripstone_caves', 'deep_dark']);
  assert.ok(![...ids].some((id) => caves.has(biomeName(id))));
  // ...while the same area at sea level does contain them (under mountains).
  m._sm_biomes(4, -128, -128, 256, 256, 16);
  assert.ok([...m.HEAP32.subarray(m._sm_ids() >> 2, (m._sm_ids() >> 2) + 256 * 256)].some((id) => caves.has(biomeName(id))));
});

test('seed text matches Java', () => {
  assert.equal(javaHash('hello'), 99162322);
  assert.equal(javaHash('\u{1F600}'), 1772899); // surrogate pair, as Java sees it
  assert.equal(signed(parseSeed('-12345')), '-12345');
  assert.equal(signed(parseSeed('hello')), '99162322');
  assert.equal(signed(parseSeed('99999999999999999999')), String(javaHash('99999999999999999999')));
  assert.equal(parseSeed('  '), null);
});

test('pin files round-trip', () => {
  const json = JSON.stringify({ seedscape: 1, waypoints: [{ name: 'Base', x: 10, z: -20, dim: 'nether' }] });
  assert.deepEqual(parsePins(json, 0), [{ name: 'Base', x: 10, z: -20, dim: -1 }]);
  const xaero = 'waypoint:Home:H:100:64:-50:0:false:0:gui.xaero_default:false:0:0:false';
  assert.deepEqual(parsePins(xaero, 0), [{ name: 'Home', x: 100, z: -50, dim: 0 }]);
});

test('CSP in vercel.json allows exactly the inline scripts in the pages', async () => {
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const csp = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))
    .headers[0].headers.find((h) => h.key.startsWith('Content-Security-Policy')).value;
  for (const page of ['index.html', 'compare.html']) {
    const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
    for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
      assert.ok(csp.includes(hash), `${page}: inline script hash ${hash} missing from the CSP`);
    }
  }
});
