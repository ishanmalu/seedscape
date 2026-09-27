// Seed finder panel: builds conditions, runs a pool of finder workers, lists hits.
import { svg } from './icons.js';

const MAX_RESULTS = 100;
const BLOCK = 1 << 20; // seeds per worker before jumping ahead by the pool stride

export function initFinder({ structs, biomes, mc, parseSeed, randomSeed, open, pretty }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('finder'), condsBox = $('conds'), runBtn = $('find-run');
  const stats = $('find-stats'), results = $('find-results');
  let conds = [{ key: 's:5', radius: 400 }];
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
  function options(selected) {
    const s = structs.map((st) => {
      const where = st.dim === -1 ? ' (Nether)' : st.dim === 1 ? ' (End)' : '';
      return `<option value="s:${st.id}"${selected === `s:${st.id}` ? ' selected' : ''}>${st.name}${where}</option>`;
    }).join('');
    const b = biomes().map(([id, name]) =>
      `<option value="b:${id}"${selected === `b:${id}` ? ' selected' : ''}>${pretty(name)}</option>`).join('');
    return `<optgroup label="Structures">${s}</optgroup>` + (b ? `<optgroup label="Biomes">${b}</optgroup>` : '');
  }
  function renderConds() {
    condsBox.replaceChildren(...conds.map((c, i) => {
      const row = document.createElement('div');
      row.className = 'cond';
      row.innerHTML = `
        <select aria-label="Condition ${i + 1}">${options(c.key)}</select>
        <button class="icon-btn" aria-label="Remove condition"${conds.length === 1 ? ' disabled' : ''}>${svg('close', 14)}</button>
        <div class="within">within
          <input type="range" min="50" max="3000" step="50" value="${c.radius}" aria-label="Radius">
          <input type="number" min="16" max="10000" step="16" value="${c.radius}" aria-label="Radius in blocks"> blocks
        </div>`;
      const [sel, del] = [row.querySelector('select'), row.querySelector('button')];
      const [range, num] = row.querySelectorAll('input');
      sel.onchange = () => { c.key = sel.value; stop(); };
      const setR = (v) => { c.radius = Math.max(16, Math.min(10000, Math.round(+v) || 16)); range.value = c.radius; num.value = c.radius; stop(); };
      range.oninput = () => setR(range.value);
      num.onchange = () => setR(num.value);
      del.onclick = () => { conds.splice(i, 1); stop(); renderConds(); };
      return row;
    }));
    $('add-cond').disabled = conds.length >= 6;
  }
  $('add-cond').onclick = () => {
    conds.push({ key: biomes().length ? `b:${biomes()[0][0]}` : 's:8', radius: 1000 });
    stop();
    renderConds();
  };

  // ---------- running ----------
  function packed() {
    // Cheapest checks first: structures (seed-only positions) before biomes.
    return conds
      .map((c) => ({ kind: c.key[0] === 's' ? 1 : 2, id: +c.key.slice(2), radius: c.radius }))
      .sort((a, b) => a.kind - b.kind);
  }
  function fmt(n) {
    return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
  }
  function showStats() {
    const secs = (performance.now() - t0) / 1000;
    const rate = secs > 0 ? checked / secs : 0;
    stats.innerHTML = `<b>${found}</b> found · ${fmt(checked)} checked · ${fmt(Math.round(rate))}/s` + (running ? '' : ' · stopped');
  }
  function start() {
    stop();
    results.replaceChildren();
    const list = packed();
    // Hit positions belong to the first packed condition.
    const firstStruct = list[0].kind === 1 && structs.find((s) => s.id === list[0].id);
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
          w.postMessage({ mc: mc(), conds: list, start: BigInt.asUintN(64, base + BigInt(k * BLOCK)).toString(), stride: W * BLOCK, block: BLOCK });
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

  return { stop, refresh: () => { if (!panel.hidden) renderConds(); } };
}
