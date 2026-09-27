// 3D diorama of a square of terrain, from a face-culled mesh built in a worker.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { badgeEvents, esc } from './icons.js';

const FONT = '600 30px Inter, system-ui, sans-serif';

// Text on a rounded dark chip, as a sprite. `h` is the world-space height.
function label(text, h, { color = '#eef1f6', bg = 'rgba(12,14,19,.82)' } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = FONT;
  const w = Math.ceil(g.measureText(text).width) + 28;
  c.width = w; c.height = 48;
  g.font = FONT;
  g.fillStyle = bg;
  g.beginPath(); g.roundRect(0, 0, w, 48, 14); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, w / 2, 25);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set((h * w) / 48, h, 1);
  s.renderOrder = 20;
  return s;
}

const niceStep = (blocks) => [50, 100, 200, 250, 500, 1000].find((s) => blocks / s <= 9) ?? 1000;

export function createView3D(container, { tooltip, readout, onPick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x131a29, 300, 800);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.4;
  controls.minDistance = 12;
  controls.autoRotateSpeed = 0.3;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x30281c, 1.15));
  const sun = new THREE.DirectionalLight(0xffe6c0, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);

  // Hover marker: an outlined column over the hovered cell.
  const cursor = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    new THREE.LineBasicMaterial({ color: 0x9cf27a, transparent: true, opacity: 0.9, depthTest: false })
  );
  cursor.renderOrder = 30;
  cursor.visible = false;
  scene.add(cursor);

  let data = null, group = null, pins = [], coordLayer = null, raf = 0, running = false, intro = 0, showCoords = true;

  const texture = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  badgeEvents.addEventListener('load', () => pins.forEach((p) => (p.material.map.needsUpdate = true)));

  function dispose(obj) {
    obj.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose(); x.dispose(); });
    });
  }

  // ---------- coordinates ----------
  function buildCoords() {
    if (coordLayer) { group.remove(coordLayer); dispose(coordLayer); }
    coordLayer = new THREE.Group();
    const { n, s, x0, z0, base } = data, off = n / 2, size = n * s;
    const step = niceStep(size), h = Math.max(2.6, n / 55);
    const tickMat = new THREE.LineBasicMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.7 });
    const ticks = [];
    // X along the south edge, Z along the west edge.
    for (let bx = Math.ceil(x0 / step) * step; bx <= x0 + size; bx += step) {
      const u = (bx - x0) / s - off;
      ticks.push(u, base, off + 1.5, u, base, off + 4);
      const l = label(`X ${bx}`, h); l.position.set(u, base - 1, off + 4 + h); coordLayer.add(l);
    }
    for (let bz = Math.ceil(z0 / step) * step; bz <= z0 + size; bz += step) {
      const v = (bz - z0) / s - off;
      ticks.push(-off - 1.5, base, v, -off - 4, base, v);
      const l = label(`Z ${bz}`, h); l.position.set(-off - 5 - h * 1.6, base - 1, v); coordLayer.add(l);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
    coordLayer.add(new THREE.LineSegments(tg, tickMat));
    const north = label('N', h * 1.3, { color: '#0b0d12', bg: '#9cf27a' });
    north.position.set(0, base + 2, -off - 6);
    coordLayer.add(north);
    coordLayer.visible = showCoords;
    group.add(coordLayer);
  }

  // ---------- build ----------
  function build(d, markers, keepCamera) {
    if (group) { scene.remove(group); dispose(group); }
    data = d;
    pins = [];
    coordLayer = null;
    group = new THREE.Group();
    const { n, pos, nor, col, index, landIndexCount, base, seaY } = d;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, landIndexCount);
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }));
    land.castShadow = land.receiveShadow = true;

    const wgeo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'color']) wgeo.setAttribute(k, geo.getAttribute(k));
    wgeo.setIndex(geo.getIndex());
    wgeo.setDrawRange(landIndexCount, index.length - landIndexCount);
    const water = new THREE.Mesh(wgeo, new THREE.MeshPhysicalMaterial({
      vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.2, depthWrite: false,
    }));
    water.receiveShadow = true;
    water.renderOrder = 1;

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(n + 3, 3, n + 3),
      new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 0.55 })
    );
    plinth.position.y = base - 1.5;
    plinth.receiveShadow = true;
    group.add(land, water, plinth);

    // Pins.
    const pinH = Math.max(5, n / 32);
    for (const p of markers) {
      const i = Math.floor((p.x - d.x0) / d.s), j = Math.floor((p.z - d.z0) / d.s);
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const y = Math.max(d.top[j * n + i], seaY);
      const at = new THREE.Vector3(i - n / 2 + 0.5, y + pinH * 1.8, j - n / 2 + 0.5);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(p.badge), depthTest: false }));
      sprite.scale.setScalar(pinH);
      sprite.position.copy(at);
      sprite.renderOrder = 10;
      sprite.userData = p;
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(at.x, y, at.z), new THREE.Vector3(at.x, at.y - pinH / 2, at.z)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
      );
      group.add(sprite, stem);
      pins.push(sprite);
      if (p.label) {
        const l = label(p.label, pinH * 0.55, { color: '#0b0d12', bg: p.color });
        l.position.set(at.x, at.y + pinH * 0.9, at.z);
        group.add(l);
      }
    }

    scene.add(group);
    buildCoords();

    const r = n * 0.62;
    sun.position.set(-r, r * 1.4, -r * 0.6);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: r * 5 });
    sun.shadow.camera.updateProjectionMatrix();
    controls.maxDistance = n * 2.4;
    scene.fog.near = n * 1.1;
    scene.fog.far = n * 3.2;
    if (!keepCamera) {
      controls.target.set(0, seaY, 0);
      camera.position.set(n * 0.7, seaY + n * 0.7, n * 0.9);
      controls.autoRotate = true;
      intro = performance.now();
    }
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (group && intro) {
      const t = Math.min(1, (performance.now() - intro) / 1000);
      group.scale.y = 0.03 + 0.97 * (1 - (1 - t) ** 3);
      if (t === 1) intro = 0;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function setRay(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  // March the ray over the heightfield (cheaper than raycasting 400k vertices).
  function pickCell() {
    if (!data || intro) return null;
    const { n, top, seaY } = data, off = n / 2;
    const o = ray.ray.origin, d = ray.ray.direction, p = new THREE.Vector3();
    for (let t = 0; t < n * 4; t += 0.35) {
      p.copy(d).multiplyScalar(t).add(o);
      const i = Math.floor(p.x + off), j = Math.floor(p.z + off);
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const k = j * n + i;
      if (p.y <= Math.max(top[k], seaY)) return { i, j, k };
    }
    return null;
  }
  function cellInfo({ i, j, k }) {
    const { x0, z0, s, heights, ids } = data;
    return { x: x0 + i * s + s / 2, z: z0 + j * s + s / 2, y: Math.round(heights[k]), biome: ids[k] };
  }

  let hoverQueued = false, lastEvent = null;
  renderer.domElement.addEventListener('pointermove', (e) => {
    lastEvent = e;
    if (hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      const e = lastEvent;
      setRay(e);
      const hit = ray.intersectObjects(pins)[0];
      const rect = container.getBoundingClientRect();
      if (hit) {
        const p = hit.object.userData;
        tooltip.innerHTML = `${esc(p.name)}<small>${p.x}, ${p.z}</small>`;
        tooltip.style.left = e.clientX - rect.left + 'px';
        tooltip.style.top = e.clientY - rect.top + 'px';
        tooltip.hidden = false;
      } else tooltip.hidden = true;

      const c = pickCell();
      if (c) {
        const info = cellInfo(c), { n, top, seaY, base } = data;
        const t = Math.max(top[c.k], seaY);
        cursor.scale.set(1.02, t - base + 0.05, 1.02);
        cursor.position.set(c.i - n / 2 + 0.5, base, c.j - n / 2 + 0.5);
        cursor.visible = true;
        readout(info);
      } else {
        cursor.visible = false;
        readout(null);
      }
    });
  });
  renderer.domElement.addEventListener('pointerleave', () => { cursor.visible = false; tooltip.hidden = true; readout(null); });
  renderer.domElement.addEventListener('dblclick', (e) => {
    setRay(e);
    const c = pickCell();
    if (c) onPick(cellInfo(c));
  });

  return {
    show(d, markers, { keepCamera = false } = {}) {
      build(d, markers, keepCamera);
      resize();
      if (!running) { running = true; loop(); }
    },
    setCoords(on) { showCoords = on; if (coordLayer) coordLayer.visible = on; },
    stop() { running = false; cancelAnimationFrame(raf); tooltip.hidden = true; cursor.visible = false; },
  };
}
