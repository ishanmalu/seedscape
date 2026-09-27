// Escape text for HTML (waypoint names come from share links).
export const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Original line icons (24x24, stroke = currentColor). Not Mojang artwork.
const P = {
  village: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  pyramid: '<path d="M2 20h20L12 4z"/><path d="M6.5 14h11M9 10h6"/>',
  jungle: '<path d="M4 20h16M6 20v-4h12v4M8 16v-4h8v4M10 12V8h4v4"/><path d="M11 8V5h2v3"/><path d="M7 16c0 2 1 3 1 4M17 12c0 3-1 5-1 8"/>',
  hut: '<path d="M4 12 12 5l8 7"/><path d="M6 11v5h12v-5"/><path d="M7 16v5M17 16v5M12 16v5"/><path d="M3 21h18" stroke-dasharray="2 2"/>',
  igloo: '<path d="M3 19a9 9 0 0 1 18 0z"/><path d="M9.5 19v-3a2.5 2.5 0 0 1 5 0v3"/><path d="M5 14h14M8 10h8"/>',
  outpost: '<path d="M8 21 9 9h6l1 12"/><path d="M7 9h10l-1-3H8z"/><path d="M12 6V2l4 1.5L12 5"/><path d="M10.5 14h3"/>',
  monument: '<path d="M3 20h18"/><path d="M5 20v-6h14v6"/><path d="M8 14V9h8v5"/><path d="M12 9V3M9.5 5 12 3l2.5 2"/>',
  mansion: '<path d="M2 11 7 6l5 5 5-5 5 5"/><path d="M3 10v10h18V10"/><path d="M10.5 20v-4h3v4"/><path d="M6 13h2M16 13h2"/>',
  ancient: '<path d="M4 21V9a8 8 0 0 1 16 0v12"/><path d="M8 21V10a4 4 0 0 1 8 0v11"/><path d="M2 21h20"/>',
  trial: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>',
  trail: '<path d="M14 3 9 8l7 7 5-5z"/><path d="m9 8-6 6 3 3 6-6"/><path d="M4 20h5"/>',
  oceanRuin: '<path d="M7 18V8M12 18V5M17 18v-6"/><path d="M5 8h4M10 5h4"/><path d="M2 21c2-1.5 3-1.5 5 0s3 1.5 5 0 3-1.5 5 0 3 1.5 5 0"/>',
  shipwreck: '<path d="M3 15h18l-3 5H6z"/><path d="M12 15V3"/><path d="M12 4l6 7h-6"/><path d="M12 6 8 11h4"/>',
  portal: '<path d="M6 21V4h12v17"/><path d="M6 21h5M15 21h3M18 9v5"/><path d="M9 7v11h6V7z" opacity=".5"/>',
  treasure: '<path d="M4 10h16v10H4z"/><path d="M4 10a8 5 0 0 1 16 0"/><path d="M11 13h2v3h-2z"/>',
  fortress: '<path d="M3 21V9h3v2h3V9h3v2h3V9h3v2h3v10z"/><path d="M10 21v-5h4v5"/>',
  bastion: '<path d="M4 21V7l3-2 3 2v3h4V7l3-2 3 2v14z"/><path d="M8 13h8v8H8z"/><path d="M12 13v8"/>',
  endCity: '<path d="M9 21V9l3-6 3 6v12"/><path d="M6 21v-6h3M15 15h3v6"/><path d="M11 12h2M11 16h2"/><path d="M4 21h16"/>',
  spawn: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  stronghold: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3.5"/><path d="M12 10.5v3" stroke-width="2.5"/>',
  slime: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 10h2v2H8zM14 10h2v2h-2zM10 16h3"/>',
  grid: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
  // dimensions
  overworld: '<path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/><path d="M3 8l9 5 9-5-3-1.7c-1 1-2 .5-3 1.5s-2 0-3 1-2-.5-3 .5" opacity=".6"/>',
  nether: '<path d="M12 22c4.4 0 7-2.8 7-6.5 0-3.4-2.3-5.6-3.5-8.5-1.5 2-2 3-3 3.5C12.5 7 11 4.5 8 2c.5 3.5-3 6.5-3 12 0 4 2.8 8 7 8z"/><path d="M12 22c-1.7 0-3-1.3-3-3 0-2 1.5-3 2-5 1.2 1.3 4 2.8 4 5 0 1.7-1.3 3-3 3z"/>',
  end: '<ellipse cx="12" cy="15" rx="9" ry="4"/><path d="M5 13.5c1.5-5 3-8 7-8s5.5 3 7 8"/><circle cx="12" cy="10" r="1.6" fill="currentColor"/>',
  // view modes
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  relief: '<path d="m2 20 7-11 4 6 3-4 6 9z"/><path d="m7.5 11.5 1.5 1.5 1.5-1.5"/>',
  cube: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  coords: '<path d="M3 3v18h18"/><path d="M7 17V9M11 17v-5M15 17V7M19 17v-3" opacity=".55"/><path d="M3 12h2M3 7h2"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  mineshaft: '<path d="M3 21 21 3"/><path d="M14 3c3 0 6 1.5 7 4"/><path d="M3 14l7 7M6 11l7 7" opacity=".6"/>',
  geode: '<path d="M12 2 20 7v10l-8 5-8-5V7z"/><path d="m8 9 4-2 4 2v6l-4 2-4-2z"/>',
  well: '<path d="M4 10h16M6 10v10h12V10"/><path d="M5 10 12 4l7 6"/><path d="M12 13v4"/>',
  gateway: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
  island: '<path d="M3 13c2-3 5-4 9-4s7 1 9 4c-2 2-5 3-9 3s-7-1-9-3z"/><path d="M8 16l2 4M15 16l-1 3"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  portalLink: '<rect x="5" y="3" width="8" height="12" rx="1"/><path d="M15 9h6M18 6l3 3-3 3"/><path d="M9 21v-6" opacity=".6"/>',
  density: '<circle cx="8" cy="9" r="4"/><circle cx="15" cy="14" r="6" opacity=".6"/><circle cx="17" cy="6" r="2"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  compare: '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 3h16"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4M12 2v13"/>',
};

export function svg(name, size = 16) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

// Round coloured badge with the icon inside, drawn to a canvas. Used for map
// markers and 3D pins. badgeEvents fires 'load' once an icon has rasterised.
export const badgeEvents = new EventTarget();
const badges = new Map();
export function badge(name, color) {
  const k = `${name}|${color}`;
  if (badges.has(k)) return badges.get(k);
  const S = 96, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2);
  g.fillStyle = color; g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(8,10,14,.85)'; g.stroke();
  const img = new Image();
  img.onload = () => { g.drawImage(img, S * 0.22, S * 0.22, S * 0.56, S * 0.56); badgeEvents.dispatchEvent(new Event('load')); };
  img.src = 'data:image/svg+xml,' + encodeURIComponent(
    svg(name, 48).replace('currentColor', '#0b0d12').replace('stroke-width="1.9"', 'stroke-width="2.3"')
      .replace(/fill="currentColor"/g, 'fill="#0b0d12"'));
  badges.set(k, c);
  return c;
}
