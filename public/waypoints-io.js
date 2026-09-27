// Pin import/export: Seedscape JSON (all dimensions) and Xaero's Minimap
// waypoint lines (one dimension per file).
const DIM_NAME = { 0: 'overworld', '-1': 'nether', 1: 'end' };
const XAERO_COLORS = 16; // Xaero colour index range

export function exportJSON(waypoints, seed) {
  const data = { seedscape: 1, seed, waypoints: waypoints.map(({ name, x, z, dim }) => ({ name, x, z, dim: DIM_NAME[dim] })) };
  download(`seedscape-pins-${seed}.json`, JSON.stringify(data, null, 2), 'application/json');
}

// Xaero line format: waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination
// Heights aren't known from a seed map, so y is 64.
export function exportXaero(waypoints, dim) {
  const clean = (s) => s.replace(/[:\r\n]/g, ' ').trim() || 'Pin';
  const lines = waypoints.filter((w) => w.dim === dim).map((w, i) => {
    const name = clean(w.name);
    return `waypoint:${name}:${name[0].toUpperCase()}:${w.x}:64:${w.z}:${i % XAERO_COLORS}:false:0:gui.xaero_default:false:0:0:false`;
  });
  download(`seedscape-${DIM_NAME[dim]}.txt`, ['#', '#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination', '#', ...lines].join('\n') + '\n', 'text/plain');
}

// Returns [{ name, x, z, dim }]. Xaero files carry no dimension, so they go
// into `currentDim`.
export function parsePins(text, currentDim) {
  const t = text.trim();
  if (t.startsWith('{')) {
    const data = JSON.parse(t);
    const dims = { overworld: 0, nether: -1, end: 1 };
    return (data.waypoints ?? []).flatMap((w) => {
      const x = Math.round(+w.x), z = Math.round(+w.z), dim = dims[w.dim] ?? currentDim;
      return Number.isFinite(x) && Number.isFinite(z) ? [{ name: String(w.name ?? 'Pin').slice(0, 40), x, z, dim }] : [];
    });
  }
  return t.split(/\r?\n/).filter((l) => l.startsWith('waypoint:')).flatMap((l) => {
    const f = l.split(':');
    const x = Math.round(+f[3]), z = Math.round(+f[5]);
    return Number.isFinite(x) && Number.isFinite(z) ? [{ name: (f[1] || 'Pin').slice(0, 40), x, z, dim: currentDim }] : [];
  });
}

export function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
