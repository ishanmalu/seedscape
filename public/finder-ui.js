// Seed finder panel: builds conditions, runs a pool of finder workers, lists hits.
import { svg } from './icons.js';

const MAX_RESULTS = 100;
const BLOCK = 1 << 20; // seeds per worker before jumping ahead by the pool stride
const KIND = { struct: 1, biome: 2, cluster: 3, spawnBiome: 4 };

export function initFinder({ structs, biomes, mc, parseSeed, randomSeed, open, pretty }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('finder'), condsBox = $('conds'), runBtn = $('find-run');
  const stats = $('find-stats'), results = $('find-results');
  // type: 'struct' | 'biome' | 'spawnBiome'; count/cluster for structures, pct for biomes.
  let conds = [{ type: 'struct', id: 5, radius: 400, count: 1, cluster: 0, pct: 0 }];
  let pool = [], running = false, checked = 0, found = 0, t0 = 0, statTimer = 0;

  $('close-finder').innerHTML = svg('close', 16);
  $('add-cond').innerHTML = `${svg('plus', 14)} Add condition`;
  $('open-finder').insertAdjacentHTML('afterbegin', svg('search', 14));

  function toggle(open) {
    panel.hidden = !open;
    document.body.classList.toggle('finding', open);
    $('open-finder').setAttribute('aria-expanded', open);
    if (open) renderConds();
  }
  $('open-finder').onclick = () => toggle(panel.hidden);
  $('close-finder').onclick = () => toggle(false);

  // ---------- conditions ----------
  const structOptions = (sel) => structs.map((st) => {
    const where = st.dim === -1 ? ' (Nether)' : st.dim === 1 ? ' (End)' : '';
    return `<option value="${st.id}"${sel === st.id ? ' selected' : ''}>${st.name}${where}</option>`;
  }).join('');
  const biomeOptions = (sel) => biomes().map(([id, name]) =>
    `<option value="${id}"${sel === id ? ' selected' : ''}>${pretty(name)}</option>`).join('');

  function row(c, i) {
    const el = document.createElement('div');
    el.className = 'cond';
    const isStruct = c.type === 'struct';
    const targets = isStruct ? structOptions(c.id) : biomeOptions(c.id) || '<option>Loading biomes…</option>';
    el.innerHTML = `
      <div class="cond-top">
        <select class="kind" aria-label="Condition type">
          <option value="struct"${isStruct ? ' selected' : ''}>Structure</option>
          <option value="biome"${c.type === 'biome' ? ' selected' : ''}>Biome</option>
          <option value="spawnBiome"${c.type === 'spawnBiome' ? ' selected' : ''}>Spawn in biome</option>
        </select>
        <select class="target" aria-label="Which">${targets}</select>
        <button class="icon-btn del" aria-label="Remove condition"${conds.length === 1 ? ' disabled' : ''}>${svg('close', 14)}</button>
      </div>
      ${c.type === 'spawnBiome' ? '' : `
      <div class="within">${isStruct ? `at least <input class="count" type="number" min="1" max="8" value="${c.count}" aria-label="How many"> ` : ''}within
        <input class="range" type="range" min="50" max="3000" step="50" value="${Math.min(c.radius, 3000)}" aria-label="Radius">
        <input class="radius" type="number" min="16" max="10000" step="16" value="${c.radius}" aria-label="Radius in blocks"> blocks
      </div>
      <label class="extra">${isStruct
        ? `<input type="checkbox" class="use-extra"${c.cluster ? ' checked' : ''}> all within <input class="extra-n" type="number" min="16" max="2000" step="16" value="${c.cluster || 200}" aria-label="Cluster distance"> blocks of each other`
        : `<input type="checkbox" class="use-extra"${c.pct ? ' checked' : ''}> covering at least <input class="extra-n" type="number" min="1" max="100" value="${c.pct || 25}" aria-label="Minimum coverage">% of the area`}
      </label>`}`;
    const q = (s) => el.querySelector(s);
    q('.kind').onchange = (e) => {
      c.type = e.target.value;
      c.id = c.type === 'struct' ? 5 : biomes()[0]?.[0] ?? 1;
      stop(); renderConds();
    };
    q('.target').onchange = (e) => { c.id = +e.target.value; stop(); };
    q('.del').onclick = () => { conds.splice(i, 1); stop(); renderConds(); };
    if (c.type !== 'spawnBiome') {
      const range = q('.range'), num = q('.radius');
      const setR = (v) => { c.radius = Math.max(16, Math.min(10000, Math.round(+v) || 16)); range.value = Math.min(c.radius, 3000); num.value = c.radius; stop(); };
      range.oninput = () => setR(range.value);
      num.onchange = () => setR(num.value);
      if (isStruct) q('.count').onchange = (e) => { c.count = Math.max(1, Math.min(8, Math.round(+e.target.value) || 1)); e.target.value = c.count; stop(); };
      const use = q('.use-extra'), n = q('.extra-n');
      const setExtra = () => {
        const v = Math.round(+n.value) || 0;
        if (isStruct) c.cluster = use.checked ? Math.max(16, Math.min(2000, v)) : 0;
        else c.pct = use.checked ? Math.max(1, Math.min(100, v)) : 0;
        stop();
      };
      use.onchange = setExtra; n.onchange = setExtra;
    }
    return el;
  }
  function renderConds() {
    condsBox.replaceChildren(...conds.map(row));
    $('add-cond').disabled = conds.length >= 6;
  }
  $('add-cond').onclick = () => {
    conds.push({ type: 'biome', id: biomes()[0]?.[0] ?? 1, radius: 1000, count: 1, cluster: 0, pct: 0 });
    stop();
    renderConds();
  };
  $('find-from').onchange = () => stop();

  // ---------- running ----------
  function packed() {
    // Cheapest checks first: structures (seed-only positions) before biomes and spawn.
    const order = { struct: 0, biome: 1, spawnBiome: 2 };
    return [...conds].sort((a, b) => order[a.type] - order[b.type]).map((c) =>
      c.type === 'struct'
        ? { kind: c.cluster ? KIND.cluster : KIND.struct, id: c.id, radius: c.radius, count: c.cluster ? Math.max(2, c.count) : c.count, extra: c.cluster }
        : c.type === 'biome'
          ? { kind: KIND.biome, id: c.id, radius: c.radius, count: 1, extra: c.pct }
          : { kind: KIND.spawnBiome, id: c.id, radius: 0, count: 1, extra: 0 });
  }
  const fmt = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
  const dur = (s) => s < 1 ? '<1s' : s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
  function showStats() {
    const secs = (performance.now() - t0) / 1000;
    const rate = secs > 0 ? checked / secs : 0;
    let line = `<b>${found}</b> found · ${fmt(checked)} checked · ${fmt(rate)}/s`;
    // Rarity and time to the next hit, once there's something to go on.
    if (found > 0) {
      const oneIn = checked / found;
      line += `<br>≈ 1 in ${fmt(oneIn)} seeds · a new one every ~${dur(oneIn / Math.max(rate, 1))}`;
    } else if (checked > 5000) line += `<br>rarer than 1 in ${fmt(checked)} so far`;
    stats.innerHTML = line + (running ? '' : ' · stopped');
  }
  function start() {
    stop();
    results.replaceChildren();
    const list = packed();
    const fromSpawn = $('find-from').value === 'spawn';
    const firstStruct = (list[0].kind === KIND.struct || list[0].kind === KIND.cluster) && structs.find((s) => s.id === list[0].id);
    const dim = firstStruct ? firstStruct.dim : 0;
    const text = $('find-start').value.trim();
    const base = BigInt.asUintN(64, BigInt(parseSeed(text) ?? parseSeed(randomSeed())));
    const W = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    running = true; checked = 0; found = 0; t0 = performance.now();
    runBtn.classList.add('stop');
    runBtn.innerHTML = `${svg('stop', 14)} Stop`;
    for (let k = 0; k < W; k++) {
      const w = new Worker('finder.js', { type: 'module' });
      w.onmessage = ({ data }) => {
        if (data.ready) {
          w.postMessage({ mc: mc(), conds: list, fromSpawn, start: BigInt.asUintN(64, base + BigInt(k * BLOCK)).toString(), stride: W * BLOCK, block: BLOCK });
          return;
        }
        checked += data.checked;
        for (const hit of data.found) {
          if (found >= MAX_RESULTS) break;
          found++;
          const li = document.createElement('li');
          li.tabIndex = 0;
          li.innerHTML = `<span>${hit.seed}</span><span class="at">${hit.x}, ${hit.z}</span>`;
          li.onclick = li.onkeydown = (e) => { if (!e.key || e.key === 'Enter') open(hit.seed, hit.x, hit.z, dim); };
          results.append(li);
        }
        if (found >= MAX_RESULTS) stop();
      };
      w.onerror = (e) => { console.error('Finder worker failed:', e.message); stop(); };
      pool.push(w);
    }
    statTimer = setInterval(showStats, 250);
    showStats();
  }
  function stop() {
    if (!running) return;
    running = false;
    pool.forEach((w) => w.terminate());
    pool = [];
    clearInterval(statTimer);
    runBtn.classList.remove('stop');
    runBtn.innerHTML = `${svg('play', 14)} Search`;
    showStats();
  }
  runBtn.innerHTML = `${svg('play', 14)} Search`;
  runBtn.onclick = () => (running ? stop() : start());

  return {
    stop,
    toggle,
    refresh: () => { if (!panel.hidden) renderConds(); },
  };
}
