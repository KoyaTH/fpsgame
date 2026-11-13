// =============================================================================
// MODELOS DAS ARMAS E PRÉVIAS (FOTOS) DE ARMAS E MAPAS
// =============================================================================
// buildWeaponModel(key) monta a arma no espaço local: empunhadura perto da
// origem, cano apontando para -Z. É usada no viewmodel (1ª pessoa), na mão dos
// outros jogadores e para gerar as imagens de prévia do loadout/hotbar.

function weaponMaterials(key) {
  const w = WEAPONS[key] || WEAPONS.smg;
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.45, metalness: 0.75 }),
    body: new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.6, metalness: 0.35 }),
    accent: new THREE.MeshStandardMaterial({ color: w.color || 0x4ade80, roughness: 0.4, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc4cbd4, roughness: 0.25, metalness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.7, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.75 }),
    glow: new THREE.MeshBasicMaterial({ color: w.color || 0x22cc88 }),
  };
}

// Pontinho da massa de mira: cor fixa e sem iluminação (sempre visível)
const SIGHT_DOT_MAT = new THREE.MeshBasicMaterial({ color: 0xa3ff4f });
const RED_DOT_GLASS = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.12, depthWrite: false });

function buildWeaponModel(key) {
  const group = new THREE.Group();
  const m = weaponMaterials(key);
  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
    return mesh;
  };
  const cyl = (r, len, mat, x, y, z, seg = 12, rTop = r) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, len, seg), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
    return mesh;
  };

  // Alça e massa de mira: entalhe traseiro (dois postes) + poste frontal.
  // O topo dos postes fica exatamente na altura da linha de visada (eyeY).
  const ironSights = (rearZ, frontZ, eyeY, baseY, frontMat = m.accent) => {
    const rearH = eyeY - baseY + 0.012;
    box(0.016, rearH, 0.02, m.dark, -0.022, baseY + rearH / 2, rearZ);
    box(0.016, rearH, 0.02, m.dark, 0.022, baseY + rearH / 2, rearZ);
    const frontH = eyeY - baseY;
    box(0.012, frontH, 0.018, frontMat, 0, baseY + frontH / 2, frontZ);
    // pontinho brilhante no topo da massa (fácil de ver contra o fundo)
    box(0.012, 0.01, 0.01, SIGHT_DOT_MAT, 0, eyeY - 0.005, frontZ - 0.006);
  };

  // Red dot: base, moldura retangular, vidro e retícula acesa no centro
  const redDot = (z, eyeY, baseY, reticleColor = 0xff2a2a) => {
    const winH = 0.07; const winW = 0.075;
    box(0.06, eyeY - winH / 2 - baseY, 0.1, m.dark, 0, (baseY + eyeY - winH / 2) / 2, z + 0.02);
    box(0.012, winH, 0.03, m.dark, -winW / 2, eyeY, z);
    box(0.012, winH, 0.03, m.dark, winW / 2, eyeY, z);
    box(winW + 0.012, 0.012, 0.03, m.dark, 0, eyeY + winH / 2, z);
    box(winW, 0.008, 0.03, m.dark, 0, eyeY - winH / 2, z);
    // vidro quase transparente: dá para ver o alvo através dele
    box(winW, winH, 0.002, RED_DOT_GLASS, 0, eyeY, z - 0.012);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.0065, 16),
      new THREE.MeshBasicMaterial({ color: reticleColor, depthTest: false, transparent: true }),
    );
    dot.position.set(0, eyeY, z - 0.014);
    dot.renderOrder = 20;
    group.add(dot);
  };

  let muzzleZ = -0.6;
  let support = new THREE.Vector3(0, -0.06, -0.38); // posição da mão de apoio
  let sightY = null; // altura da linha de visada (null = arma sem mira)

  switch (key) {
    case 'smg':
      box(0.12, 0.14, 0.44, m.body, 0, 0, -0.18);
      box(0.08, 0.2, 0.1, m.dark, 0, -0.14, -0.02, -0.25);
      box(0.07, 0.24, 0.09, m.dark, 0, -0.17, -0.22, 0.12);
      box(0.08, 0.035, 0.34, m.accent, 0, 0.085, -0.18);
      redDot(-0.12, 0.15, 0.1025);
      cyl(0.032, 0.22, m.steel, 0, 0.01, -0.48);
      cyl(0.045, 0.16, m.dark, 0, 0.01, -0.62);
      box(0.05, 0.05, 0.22, m.dark, 0, -0.02, 0.15);
      box(0.06, 0.12, 0.04, m.dark, 0, -0.05, 0.26);
      muzzleZ = -0.71; support.set(0, -0.08, -0.36); sightY = 0.15;
      break;
    case 'rifle':
      box(0.11, 0.15, 0.5, m.body, 0, 0, -0.1);
      box(0.12, 0.12, 0.34, m.dark, 0, 0.0, -0.5);
      for (let i = 0; i < 6; i++) box(0.13, 0.02, 0.03, m.steel, 0, 0.07, -0.38 - i * 0.05);
      box(0.08, 0.2, 0.11, m.dark, 0, -0.14, 0.05, -0.3);
      box(0.07, 0.16, 0.09, m.accent, 0, -0.14, -0.2, 0.15);
      box(0.07, 0.12, 0.09, m.accent, 0, -0.26, -0.24, 0.45);
      box(0.09, 0.14, 0.26, m.dark, 0, -0.02, 0.27);
      box(0.1, 0.18, 0.06, m.body, 0, -0.04, 0.41);
      cyl(0.026, 0.3, m.steel, 0, 0.0, -0.8);
      box(0.06, 0.04, 0.08, m.dark, 0, 0.0, -0.96);
      redDot(-0.1, 0.155, 0.075, 0x2bff88);
      muzzleZ = -1.0; support.set(0, -0.07, -0.5); sightY = 0.155;
      break;
    case 'sniper':
      box(0.12, 0.14, 0.8, m.body, 0, 0, -0.3);
      box(0.08, 0.2, 0.12, m.dark, 0, -0.14, 0.02, -0.3);
      box(0.1, 0.2, 0.36, m.dark, 0, -0.02, 0.3);
      box(0.08, 0.1, 0.1, m.accent, 0, -0.12, -0.22);
      cyl(0.03, 0.9, m.steel, 0, 0.02, -1.15);
      box(0.06, 0.06, 0.12, m.dark, 0, 0.02, -1.62);
      box(0.04, 0.05, 0.06, m.dark, 0, 0.09, -0.1);
      box(0.04, 0.05, 0.06, m.dark, 0, 0.09, -0.4);
      cyl(0.05, 0.46, m.dark, 0, 0.16, -0.25, 16);
      cyl(0.065, 0.1, m.dark, 0, 0.16, -0.52, 16);
      cyl(0.06, 0.08, m.dark, 0, 0.16, 0.02, 16);
      box(0.1, 0.1, 0.01, m.glass, 0, 0.16, -0.575);
      box(0.03, 0.03, 0.12, m.steel, 0.08, 0.04, -0.02, 0, 0, 0.3);
      muzzleZ = -1.68; support.set(0, -0.08, -0.6); sightY = 0.16;
      break;
    case 'pistol':
      box(0.08, 0.09, 0.32, m.dark, 0, 0.02, -0.12);
      box(0.075, 0.06, 0.28, m.body, 0, -0.045, -0.1);
      box(0.07, 0.2, 0.1, m.body, 0, -0.15, 0.0, -0.2);
      box(0.02, 0.06, 0.06, m.dark, 0, -0.1, -0.1);
      ironSights(0.02, -0.25, 0.092, 0.065);
      cyl(0.02, 0.04, m.steel, 0, 0.02, -0.3);
      muzzleZ = -0.32; support.set(0, -0.16, -0.02); sightY = 0.092;
      break;
    case 'revolver':
      cyl(0.03, 0.38, m.steel, 0, 0.04, -0.32);
      box(0.04, 0.03, 0.36, m.steel, 0, 0.08, -0.32);
      cyl(0.065, 0.12, m.dark, 0, 0.0, -0.08, 8);
      box(0.08, 0.12, 0.18, m.body, 0, 0.0, 0.02);
      box(0.07, 0.22, 0.1, m.wood, 0, -0.15, 0.11, -0.35);
      box(0.02, 0.05, 0.04, m.dark, 0, 0.09, 0.1, 0.5);
      ironSights(-0.15, -0.47, 0.118, 0.095);
      box(0.02, 0.05, 0.06, m.dark, 0, -0.08, -0.02);
      muzzleZ = -0.52; support.set(0, -0.17, 0.08); sightY = 0.118;
      break;
    case 'shotgun':
      box(0.12, 0.15, 0.34, m.body, 0, 0, -0.06);
      cyl(0.04, 0.8, m.steel, 0, 0.03, -0.62);
      cyl(0.032, 0.62, m.dark, 0, -0.05, -0.52);
      box(0.11, 0.1, 0.24, m.accent, 0, -0.05, -0.52);
      box(0.08, 0.2, 0.1, m.dark, 0, -0.14, 0.06, -0.3);
      box(0.1, 0.16, 0.36, m.wood, 0, -0.04, 0.3);
      box(0.11, 0.2, 0.05, m.dark, 0, -0.05, 0.5);
      ironSights(-0.1, -0.98, 0.098, 0.07);
      muzzleZ = -1.03; support.set(0, -0.09, -0.52); sightY = 0.098;
      break;
    case 'grapple': {
      box(0.18, 0.18, 0.4, m.body, 0, 0, -0.12);
      box(0.08, 0.2, 0.12, m.dark, 0, -0.15, 0.02, -0.2);
      cyl(0.065, 0.24, m.glow, 0, 0.0, -0.12, 14);
      cyl(0.075, 0.14, m.dark, 0, 0.0, -0.38, 14);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        box(0.03, 0.03, 0.16, m.steel, Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.5, 0, 0, a);
      }
      box(0.04, 0.1, 0.04, m.accent, 0, 0.12, -0.02);
      muzzleZ = -0.58; support.set(0, -0.12, -0.24);
      break;
    }
    case 'knife':
    default:
      box(0.05, 0.08, 0.2, m.dark, 0, 0, 0.0);
      box(0.1, 0.1, 0.03, m.steel, 0, 0, -0.11);
      box(0.018, 0.08, 0.32, m.steel, 0, 0.0, -0.28);
      box(0.012, 0.04, 0.12, m.steel, 0, 0.035, -0.47, 0.35);
      box(0.02, 0.025, 0.26, m.accent, 0, -0.03, -0.27);
      muzzleZ = -0.55; support.set(0, -0.3, 0.2);
      break;
  }

  // Quanto a arma se estende para trás da empunhadura (para não entrar na câmera ao mirar)
  const bbox = new THREE.Box3().setFromObject(group);
  return {
    group,
    muzzle: new THREE.Vector3(0, 0.02, muzzleZ),
    support,
    sight: sightY === null ? null : new THREE.Vector3(0, sightY, 0),
    rearZ: bbox.max.z,
  };
}

// -----------------------------------------------------------------------------
// RENDERIZADOR DE PRÉVIAS (uma única instância compartilhada)
// -----------------------------------------------------------------------------
let previewRenderer = null;
const previewCache = {};

function getPreviewRenderer() {
  if (!previewRenderer) {
    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    previewRenderer.setPixelRatio(1);
  }
  return previewRenderer;
}

// Foto lateral da arma em fundo transparente
function renderWeaponPreview(key, width = 256, height = 128) {
  const cacheKey = `w:${key}:${width}x${height}`;
  if (previewCache[cacheKey]) return previewCache[cacheKey];

  const renderer = getPreviewRenderer();
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1));
  const key1 = new THREE.DirectionalLight(0xffffff, 1.0);
  key1.position.set(2, 3, 2);
  scene.add(key1);
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.6);
  rim.position.set(-2, 1, -3);
  scene.add(rim);

  const { group } = buildWeaponModel(key);
  group.rotation.y = -Math.PI / 2; // cano para a direita
  group.rotation.z = 0.08;
  scene.add(group);

  // Enquadra pela bounding box
  const bbox = new THREE.Box3().setFromObject(group);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  group.position.sub(center);
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.01, 50);
  const fitW = size.x / (2 * Math.tan(THREE.MathUtils.degToRad(15)) * (width / height));
  const fitH = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
  const dist = Math.max(fitW, fitH) * 1.25 + size.z;
  camera.position.set(0.15 * dist, 0.25 * dist, dist);
  camera.lookAt(0, 0, 0);

  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  previewCache[cacheKey] = url;
  return url;
}

// Foto aérea do mapa (usada na votação)
function renderMapPreview(mapId, width = 400, height = 225) {
  const cacheKey = `m:${mapId}`;
  if (previewCache[cacheKey]) return previewCache[cacheKey];
  if (!MAP_BUILDERS[mapId]) return '';

  const renderer = getPreviewRenderer();
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  const built = MAP_BUILDERS[mapId](scene);
  applySurfaceTextures(scene);
  const theme = built.theme;
  scene.add(createSky(theme));
  scene.fog = new THREE.Fog(theme.fog, 80, 220);
  scene.add(new THREE.HemisphereLight(theme.skyHorizon, theme.hemiGround, 0.9));
  const sun = new THREE.DirectionalLight(theme.sun, 1.0);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 500);
  camera.position.set(46, 44, 46);
  camera.lookAt(0, 0, 0);
  renderer.setClearColor(theme.skyHorizon, 1);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.85);

  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map && o.userData.isGround) o.material.map.dispose();
      o.material.dispose();
    }
  });
  previewCache[cacheKey] = url;
  return url;
}
