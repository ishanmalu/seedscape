// Map tools: a distance ruler and a Nether portal link helper.
// Click-driven; the map asks handleClick() first and skips its own click if consumed.

export function createTools({ dim, addWaypoint, draw, status }) {
  let tool = null;          // 'ruler' | 'portal' | null
  let a = null, b = null;   // ruler endpoints in blocks

  const factor = () => (dim() === 0 ? 1 / 8 : 8);
  const other = () => (dim() === 0 ? 'Nether' : 'Overworld');

  function set(name) {
    tool = tool === name ? null : name;
    a = b = null;
    status(tool === 'ruler' ? 'Click two points to measure. Esc to stop.'
      : tool === 'portal' ? `Click where your portal is to pin its ${other()} twin. Esc to stop.` : '');
    draw();
    return tool;
  }

  function handleClick(x, z) {
    if (!tool) return false;
    x = Math.round(x); z = Math.round(z);
    if (tool === 'ruler') {
      if (!a || b) { a = [x, z]; b = null; } else b = [x, z];
      draw();
      return true;
    }
    if (tool === 'portal') {
      if (dim() === 1) { status('Portal links only exist between the Overworld and the Nether.'); return true; }
      const f = factor(), tx = Math.round(x * f), tz = Math.round(z * f), to = dim() === 0 ? -1 : 0;
      addWaypoint(x, z, 'Portal', dim());
      addWaypoint(tx, tz, `Portal link (${x}, ${z})`, to);
      status(`Pinned. Build the ${other()} side at ${tx}, ${tz} (switch dimension to see it).`);
      return true;
    }
    return false;
  }

  function drawOverlay(ctx, { toScreen }) {
    if (tool !== 'ruler' || !a) return;
    const [ax, ay] = toScreen(...a);
    ctx.save();
    ctx.fillStyle = '#9cf27a';
    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
    if (b) {
      const [bx, by] = toScreen(...b);
      ctx.strokeStyle = '#9cf27a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const text = `${Math.round(d)} blocks` + (dim() !== 1 ? ` · ${Math.round(d * factor())} in ${other()}` : '');
      ctx.font = '600 12.5px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(text).width + 18, mx = (ax + bx) / 2, my = (ay + by) / 2 - 16;
      ctx.fillStyle = 'rgba(12,14,19,.88)';
      ctx.beginPath(); ctx.roundRect(mx - tw / 2, my - 12, tw, 24, 8); ctx.fill();
      ctx.fillStyle = '#eef1f6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, mx, my + 0.5);
    }
    ctx.restore();
  }

  return {
    set,
    handleClick,
    draw: drawOverlay,
    active: () => tool,
    clear: () => { if (tool) set(tool); },
  };
}
