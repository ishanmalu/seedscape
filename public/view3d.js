// 3D diorama of a square of terrain: one instanced column per 4x4 blocks.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SEA = 63;
const EXAG = 1.35;          // vertical exaggeration
const yOf = (h) => (Math.round(h) / 4) * EXAG;

function pinTexture(color, letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,.5)';
  g.shadowBlur = 12;
  g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2);
  g.fillStyle = color; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 6; g.strokeStyle = 'rgba(10,12,16,.85)'; g.stroke();
  g.fillStyle = '#0d0f12';
  g.font = '700 50px Inter, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 67);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createView3D(container, tooltip) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e1320, 300, 700);
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.38;
  controls.minDistance = 25;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2418, 1.1));
  const sun = new THREE.DirectionalLight(0xffe7c4, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  let group = null, pins = [], raf = 0, running = false, intro = 0;

  function clear() {
    if (!group) return;
    group.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose(); x.dispose(); });
    });
    scene.remove(group);
    group = null;
    pins = [];
  }

  function build(data, markers) {
    clear();
    const { n, heights, colors, x0, z0 } = data;
    group = new THREE.Group();
    let min = Infinity;
    for (const h of heights) min = Math.min(min, h);
    const base = yOf(min) - 6;

    // Terrain columns.
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geo, mat, n * n);
    mesh.castShadow = mesh.receiveShadow = true;
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), sand = new THREE.Color(0x8d8468), snow = new THREE.Color(0xf4f7fb);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i, h = heights[k], top = yOf(h);
        m4.makeScale(1, top - base, 1);
        m4.setPosition(i - n / 2 + 0.5, base, j - n / 2 + 0.5);
        mesh.setMatrixAt(k, m4);
        col.setRGB(colors[k * 3] / 255, colors[k * 3 + 1] / 255, colors[k * 3 + 2] / 255, THREE.SRGBColorSpace);
        if (h < SEA - 1) col.lerp(sand, 0.55).multiplyScalar(0.8);
        else if (h > 150) col.lerp(snow, Math.min(1, (h - 150) / 30));
        mesh.setColorAt(k, col);
      }
    group.add(mesh);

    // Water volume, cut like a diorama.
    const seaY = yOf(SEA - 0.5);
    if (seaY > base) {
      const water = new THREE.Mesh(
        new THREE.BoxGeometry(n, seaY - base, n),
        new THREE.MeshPhysicalMaterial({ color: 0x2f7fd8, transparent: true, opacity: 0.62, roughness: 0.35, depthWrite: false })
      );
      water.position.y = (seaY + base) / 2;
      water.receiveShadow = true;
      group.add(water);
    }

    // Plinth.
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(n + 3, 4, n + 3),
      new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.6 })
    );
    plinth.position.y = base - 2;
    plinth.receiveShadow = true;
    group.add(plinth);

    // Pins for structures in range.
    for (const p of markers) {
      const i = Math.floor((p.x - x0) / 4), j = Math.floor((p.z - z0) / 4);
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const top = Math.max(yOf(heights[j * n + i]), seaY);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(p.color, p.letter), depthTest: false }));
      sprite.scale.setScalar(7);
      sprite.position.set(i - n / 2 + 0.5, top + 12, j - n / 2 + 0.5);
      sprite.renderOrder = 10;
      sprite.userData = p;
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -12, 0), new THREE.Vector3(0, -3, 0)].map((v) => v.add(sprite.position))),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
      );
      group.add(sprite, stem);
      pins.push(sprite);
    }

    scene.add(group);
    const r = n * 0.62;
    sun.position.set(-r, r * 1.3, -r * 0.7);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: r * 5 });
    sun.shadow.camera.updateProjectionMatrix();
    controls.target.set(0, seaY, 0);
    controls.maxDistance = n * 2;
    camera.position.set(n * 0.72, seaY + n * 0.72, n * 0.92);
    scene.fog.near = n * 0.9;
    scene.fog.far = n * 2.6;
    controls.autoRotate = true;
    intro = performance.now();
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
      const t = Math.min(1, (performance.now() - intro) / 1100);
      group.scale.y = 0.03 + 0.97 * (1 - (1 - t) ** 3);
      if (t === 1) intro = 0;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // Pin hover.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pins)[0];
    if (hit) {
      const p = hit.object.userData;
      tooltip.innerHTML = `${p.name}<small>${p.x}, ${p.z}</small>`;
      tooltip.style.left = e.clientX - container.getBoundingClientRect().left + 'px';
      tooltip.style.top = e.clientY - container.getBoundingClientRect().top + 'px';
      tooltip.hidden = false;
    } else tooltip.hidden = true;
  });

  return {
    show(data, markers) {
      build(data, markers);
      resize();
      if (!running) { running = true; loop(); }
    },
    stop() { running = false; cancelAnimationFrame(raf); tooltip.hidden = true; },
  };
}
