// Command palette (⌘K / Ctrl+K). `commands()` returns [{ label, hint, icon, run }];
// `parse(text)` can turn free text ("100 -200", "seed foo") into extra commands.
import { svg, esc } from './icons.js';

export function initCommands({ commands, parse }) {
  const root = document.createElement('div');
  root.id = 'cmdk';
  root.hidden = true;
  root.innerHTML = `
    <div class="cmdk-box glass" role="dialog" aria-label="Command palette">
      <div class="cmdk-input">${svg('search', 16)}<input placeholder="Go to 100 -200, seed abc, find cherry grove, nether…" aria-label="Command" autocomplete="off" spellcheck="false"></div>
      <ol role="listbox"></ol>
      <div class="cmdk-foot"><kbd>↑↓</kbd> choose <kbd>↵</kbd> run <kbd>esc</kbd> close</div>
    </div>`;
  document.body.append(root);
  const input = root.querySelector('input'), list = root.querySelector('ol');
  let items = [], sel = 0;

  // Fuzzy-ish match: every word of the query appears in the label or keywords.
  const matches = (c, q) => {
    const hay = `${c.label} ${c.keywords ?? ''}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  };
  function update() {
    const q = input.value.trim().toLowerCase();
    items = [...parse(input.value.trim()), ...commands().filter((c) => !q || matches(c, q))].slice(0, 40);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.replaceChildren(...items.map((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === sel);
      li.className = i === sel ? 'on' : '';
      li.innerHTML = `${svg(c.icon ?? 'command', 15)}<span>${esc(c.label)}</span>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}`;
      li.onmousemove = () => { if (sel !== i) { sel = i; update(); } };
      li.onclick = () => run(i);
      return li;
    }));
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  function run(i) {
    const c = items[i];
    if (!c) return;
    close();
    c.run();
  }
  function open() {
    root.hidden = false;
    input.value = '';
    sel = 0;
    update();
    input.focus();
  }
  function close() { root.hidden = true; }

  input.oninput = () => { sel = 0; update(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); update(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); update(); e.preventDefault(); }
    if (e.key === 'Enter') { run(sel); e.preventDefault(); }
    if (e.key === 'Escape') { close(); e.preventDefault(); }
  };
  root.onclick = (e) => { if (e.target === root) close(); };
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); root.hidden ? open() : close(); }
  });
  return { open, close };
}
