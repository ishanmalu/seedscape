// Seed-finder worker: scans a stream of seeds against the conditions and
// reports matches. The page stops it by terminating the worker.
import createModule from './cubiomes.mjs';

const mod = await createModule();
const BATCH_MS = 120; // report progress about this often

self.onmessage = ({ data: { mc, conds, start, stride, block } }) => {
  const flat = conds.flatMap((c) => [c.kind, c.id, c.radius]);
  const cp = mod._malloc(flat.length * 4);
  mod.HEAP32.set(flat, cp >> 2);

  let base = BigInt.asUintN(64, BigInt(start));
  let size = 256; // seeds per sm_find call, tuned so each call takes ~BATCH_MS
  const loop = () => {
    const t0 = performance.now();
    let checked = 0;
    const found = [];
    while (performance.now() - t0 < BATCH_MS) {
      // This worker owns seeds [base, base + block), then jumps by stride.
      const n = Math.min(size, block - Number(base % BigInt(block)));
      const hits = mod._sm_find(mc, base, n, cp, conds.length, 256);
      const done = mod._sm_fdone(); // < n if the result buffer filled up
      const sp = mod._sm_fout_seed() >> 3, pp = mod._sm_fout_pos() >> 2;
      for (let i = 0; i < hits; i++)
        found.push({ seed: BigInt.asIntN(64, mod.HEAP64[sp + i]).toString(), x: mod.HEAP32[pp + i * 2], z: mod.HEAP32[pp + i * 2 + 1] });
      checked += done;
      base = BigInt.asUintN(64, base + BigInt(done));
      if (base % BigInt(block) === 0n) base = BigInt.asUintN(64, base + BigInt(stride - block));
    }
    // Aim each inner call at ~1/4 of the batch window.
    const perSeed = (performance.now() - t0) / checked;
    size = Math.max(16, Math.min(1 << 16, Math.round(BATCH_MS / 4 / perSeed)));
    self.postMessage({ checked, found });
    setTimeout(loop, 0);
  };
  loop();
};
self.postMessage({ ready: true });
