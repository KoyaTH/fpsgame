// =============================================================================
// MAPAS E GEOMETRIA DO MUNDO
// =============================================================================
// Cada builder monta o cenário e retorna { obstacles, bounds, theme }.
// - obstacles: meshes com colisão (AABB). Só BoxGeometry/CylinderGeometry, sem
//   rotação — o servidor lê este arquivo (lib/mapObstacles.js) para validar spawns.
// - Decoração usa addDeco*/Cone/Sphere e nunca colide.
// - userData.surface define a textura procedural aplicada pelo cliente
//   (concrete, panel, metal, brick, plaster, wood, crate, rock, sand, snow,
//   ice, asphalt, tiles, glass, neon). Sem surface = cor lisa.
//
// Este arquivo também roda no servidor com um THREE mínimo: use apenas
// Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry,
// PlaneGeometry, GridHelper, MeshStandardMaterial e Vector3.applyAxisAngle.

function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.opacity,
    opacity: opts.opacity ?? 1,
  });
}

function placeMesh(scene, geometry, color, x, y, z, opts) {
  const mesh = new THREE.Mesh(geometry, makeMat(color, opts));
  mesh.position.set(x, y, z);
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  mesh.userData.surface = opts.surface || null;
  scene.add(mesh);
  return mesh;
}

// Caixa com colisão
function addBox(scene, obstacles, w, h, d, x, y, z, color, opts = {}) {
  const mesh = placeMesh(scene, new THREE.BoxGeometry(w, h, d), color, x, y, z, { surface: 'concrete', ...opts });
  obstacles.push(mesh);
  return mesh;
}

// Caixa decorativa (sem colisão)
function addDeco(scene, w, h, d, x, y, z, color, opts = {}) {
  return placeMesh(scene, new THREE.BoxGeometry(w, h, d), color, x, y, z, { shadow: false, ...opts });
}

// Cilindro com colisão (aproximado por AABB)
function addCylinder(scene, obstacles, r, height, x, y, z, color, opts = {}) {
  const mesh = placeMesh(scene, new THREE.CylinderGeometry(r, r, height, opts.segments || 10), color, x, y, z, opts);
  obstacles.push(mesh);
  return mesh;
}

function addDecoCylinder(scene, rTop, rBot, height, x, y, z, color, opts = {}) {
  return placeMesh(scene, new THREE.CylinderGeometry(rTop, rBot, height, opts.segments || 10), color, x, y, z, { shadow: false, ...opts });
}

function addCone(scene, r, height, x, y, z, color, opts = {}) {
  return placeMesh(scene, new THREE.ConeGeometry(r, height, opts.segments || 8), color, x, y, z, opts);
}

function addSphere(scene, r, x, y, z, color, opts = {}) {
  return placeMesh(scene, new THREE.SphereGeometry(r, opts.segments || 12, 10), color, x, y, z, opts);
}

// Material que brilha (lâmpadas, neon, janelas acesas)
function glow(color, intensity = 1) {
  return { emissive: color, emissiveIntensity: intensity, surface: 'neon', shadow: false };
}

function addGround(scene, size, color, surface) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), makeMat(color, { roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.surface = surface;
  ground.userData.isGround = true;
  scene.add(ground);
  return ground;
}

// Paredes perimetrais altas com friso e pilares
function addPerimeter(scene, obstacles, half, height, baseColor, trimColor, surface, accent) {
  const thick = 2.0;
  const h2 = height / 2;
  const len = half * 2 + thick * 2;
  const o = half + thick / 2;
  addBox(scene, obstacles, len, height, thick, 0, h2, -o, baseColor, { surface });
  addBox(scene, obstacles, len, height, thick, 0, h2, o, baseColor, { surface });
  addBox(scene, obstacles, thick, height, len, -o, h2, 0, baseColor, { surface });
  addBox(scene, obstacles, thick, height, len, o, h2, 0, baseColor, { surface });

  // Friso superior e rodapé
  const trim = thick + 0.4;
  [[len, trim, 0, -o], [len, trim, 0, o], [trim, len, -o, 0], [trim, len, o, 0]].forEach(([w, d, x, z]) => {
    addDeco(scene, w, 1.2, d, x, height + 0.6, z, trimColor, { surface: 'metal' });
    addDeco(scene, w, 0.6, d, x, 0.3, z, trimColor, { surface: 'metal' });
  });

  // Faixa de luz ao longo das paredes
  if (accent !== undefined) {
    const inner = half - 0.02;
    [[len - 4, 0.12, 0, -inner], [len - 4, 0.12, 0, inner], [0.12, len - 4, -inner, 0], [0.12, len - 4, inner, 0]].forEach(([w, d, x, z]) => {
      addDeco(scene, w, 0.18, d, x, height * 0.55, z, accent, glow(accent, 0.9));
    });
  }

  // Pilares nos cantos
  const c = thick + 1.2;
  [[-o, -o], [o, -o], [-o, o], [o, o]].forEach(([x, z]) => {
    addBox(scene, obstacles, c, height + 2, c, x, (height + 2) / 2, z, trimColor, { surface: 'metal' });
  });
}

function addCrateStack(scene, obstacles, x, z, count, color) {
  for (let i = 0; i < count; i++) {
    const ox = i % 2 === 0 ? 0 : 0.4;
    const oz = i % 2 === 0 ? 0 : -0.3;
    addBox(scene, obstacles, 1.9, 1.9, 1.9, x + ox, 0.95 + i * 1.9, z + oz, color, { surface: 'crate' });
  }
}

function addRamp(scene, obstacles, x, z, width, length, height, rotY = 0, color = 0x666677, surface = 'metal') {
  // Rampa em degraus baixos (sobe correndo); passos não rotacionam, só a posição
  const steps = 6;
  const stepLen = length / steps;
  const stepHeight = height / steps;
  const sideways = Math.abs(Math.sin(rotY)) > 0.5;
  for (let i = 0; i < steps; i++) {
    const sy = (i + 1) * stepHeight;
    const sz = -length / 2 + (i + 0.5) * stepLen;
    const p = new THREE.Vector3(0, sy / 2, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const w = sideways ? stepLen + 0.05 : width;
    const d = sideways ? width : stepLen + 0.05;
    addBox(scene, obstacles, w, sy, d, x + p.x, p.y, z + p.z, color, { surface });
  }
}

// Faixa zebrada de perigo sobre uma mureta
function addHazardStripe(scene, w, d, x, y, z) {
  addDeco(scene, w + 0.02, 0.3, d + 0.02, x, y, z, 0xfacc15, { surface: 'hazard' });
}

// Poste de luz com lâmpada
function addLamp(scene, obstacles, x, z, height, color, lightColor) {
  addCylinder(scene, obstacles, 0.14, height, x, height / 2, z, color, { surface: 'metal', metalness: 0.6, roughness: 0.4 });
  addDeco(scene, 1.0, 0.18, 0.3, x + 0.4, height, z, color, { surface: 'metal' });
  addDeco(scene, 0.5, 0.1, 0.24, x + 0.7, height - 0.12, z, lightColor, glow(lightColor, 1.4));
}

// ---------------------------------------------------------------------------
// MAPA 1 — ARENA CLÁSSICA
// ---------------------------------------------------------------------------
function buildArenaMap(scene) {
  const obstacles = [];
  const half = 39;
  const accent = 0x4ade80;

  addGround(scene, 84, 0x52645a, 'tiles');
  addPerimeter(scene, obstacles, half, 16, 0x596170, 0x2c2f35, 'panel', accent);

  // Torre central: base, plataforma, passarelas e ninho de sniper
  addBox(scene, obstacles, 10, 2.0, 10, 0, 1.0, 0, 0x4a505c, { surface: 'concrete' });
  addRamp(scene, obstacles, 0, 6.5, 3.5, 4.0, 2.0, 0, 0x5b6170);
  addRamp(scene, obstacles, 0, -6.5, 3.5, 4.0, 2.0, Math.PI, 0x5b6170);
  addBox(scene, obstacles, 6, 6.0, 6, 0, 4.0, 0, 0x3a404d, { surface: 'panel' });
  addBox(scene, obstacles, 14, 0.8, 4, 0, 7.4, 0, 0x6b7487, { surface: 'metal' });
  addBox(scene, obstacles, 4, 0.8, 14, 0, 7.4, 0, 0x6b7487, { surface: 'metal' });
  addBox(scene, obstacles, 4, 3.5, 4, 0, 9.5, 0, 0x2b303b, { surface: 'panel' });
  addBox(scene, obstacles, 6, 0.6, 6, 0, 11.5, 0, 0x7a8499, { surface: 'metal' });
  addBox(scene, obstacles, 6, 1.2, 0.4, 0, 12.2, 2.8, 0x3e4554, { surface: 'metal' });
  addBox(scene, obstacles, 6, 1.2, 0.4, 0, 12.2, -2.8, 0x3e4554, { surface: 'metal' });
  // Detalhes de neon na torre
  addDeco(scene, 10.1, 0.12, 10.1, 0, 2.02, 0, accent, glow(accent));
  addDeco(scene, 6.1, 0.12, 6.1, 0, 6.9, 0, accent, glow(accent));
  addDeco(scene, 6.1, 0.1, 6.1, 0, 11.82, 0, accent, glow(accent));
  [[-6.8, 0], [6.8, 0], [0, -6.8], [0, 6.8]].forEach(([x, z]) => addDeco(scene, 0.4, 0.4, 0.4, x, 7.9, z, accent, glow(accent, 1.5)));
  // Corrimões das passarelas (só visual)
  [[-7, 1.9], [-7, -1.9], [7, 1.9], [7, -1.9]].forEach(([x, z]) => addDeco(scene, 0.12, 0.9, 0.12, x, 8.25, z, 0x9aa3b5, { surface: 'metal' }));

  // 4 pilares com anéis de energia e topo
  [[-15, -15], [15, -15], [-15, 15], [15, 15]].forEach(([x, z]) => {
    addBox(scene, obstacles, 3.6, 10, 3.6, x, 5.0, z, 0x646c7d, { surface: 'panel' });
    addDeco(scene, 4.2, 0.5, 4.2, x, 8.5, z, accent, glow(accent, 1.2));
    addDeco(scene, 4.0, 0.3, 4.0, x, 2.0, z, 0x2c2f35, { surface: 'metal' });
    addBox(scene, obstacles, 5, 0.6, 5, x, 10.3, z, 0x3b404d, { surface: 'metal' });
  });
  addBox(scene, obstacles, 12, 0.6, 2.2, -7.5, 7.4, -15, 0x566074, { surface: 'metal' });
  addBox(scene, obstacles, 12, 0.6, 2.2, 7.5, 7.4, 15, 0x566074, { surface: 'metal' });

  // Postos fortificados nos cantos com sacos de areia
  [[-28, -28], [28, -28], [-28, 28], [28, 28]].forEach(([x, z]) => {
    addBox(scene, obstacles, 8, 5, 8, x, 2.5, z, 0x4b505c, { surface: 'concrete' });
    addBox(scene, obstacles, 9, 0.6, 9, x, 5.3, z, 0x6a7385, { surface: 'metal' });
    addBox(scene, obstacles, 9, 1.3, 0.5, x, 6.1, z + 4.2, 0x7d7258, { surface: 'sandbag' });
    addBox(scene, obstacles, 9, 1.3, 0.5, x, 6.1, z - 4.2, 0x7d7258, { surface: 'sandbag' });
    addBox(scene, obstacles, 0.5, 1.3, 9, x + 4.2, 6.1, z, 0x7d7258, { surface: 'sandbag' });
    addBox(scene, obstacles, 0.5, 1.3, 9, x - 4.2, 6.1, z, 0x7d7258, { surface: 'sandbag' });
    addDeco(scene, 8.05, 0.15, 8.05, x, 4.0, z, 0xfacc15, { surface: 'hazard' });
  });
  addRamp(scene, obstacles, -28, -20, 3, 7, 5, 0, 0x5b6170);
  addRamp(scene, obstacles, 28, 20, 3, 7, 5, Math.PI, 0x5b6170);
  addRamp(scene, obstacles, -20, 28, 3, 7, 5, Math.PI / 2, 0x5b6170);
  addRamp(scene, obstacles, 20, -28, 3, 7, 5, -Math.PI / 2, 0x5b6170);

  // Muretas táticas com faixa de perigo
  [
    [0, 22, 14, 2.4, 1.2], [0, -22, 14, 2.4, 1.2],
    [22, 0, 1.2, 2.4, 14], [-22, 0, 1.2, 2.4, 14],
    [-24, 0, 6, 2.2, 1.5], [24, 0, 6, 2.2, 1.5],
    [0, 28, 1.5, 2.2, 6], [0, -28, 1.5, 2.2, 6],
  ].forEach(([x, z, w, h, d]) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, 0x7a8294, { surface: 'concrete' });
    addHazardStripe(scene, w, d, x, h - 0.15, z);
  });

  [[-18, 24, 2], [18, -24, 2], [-24, -18, 3], [24, 18, 3], [-7, 18, 1], [7, -18, 1], [-18, -7, 2], [18, 7, 2]]
    .forEach(([x, z, n]) => addCrateStack(scene, obstacles, x, z, n, 0xb87333));

  // Holofotes nas paredes e banners
  [[-20, -38.9], [20, -38.9], [-20, 38.9], [20, 38.9]].forEach(([x, z]) => {
    addDeco(scene, 2.4, 0.5, 0.6, x, 13.5, z, 0x1f2329, { surface: 'metal' });
    addDeco(scene, 2.0, 0.3, 0.2, x, 13.2, z + (z > 0 ? -0.35 : 0.35), 0xfff7d6, glow(0xfff7d6, 1.6));
  });
  [[-38.9, -10, 0x2563eb], [-38.9, 10, 0xdc2626], [38.9, -10, 0xdc2626], [38.9, 10, 0x2563eb]].forEach(([x, z, color]) => {
    addDeco(scene, 0.1, 6, 3, x + (x > 0 ? -0.06 : 0.06), 9, z, color, { surface: 'cloth' });
  });

  return {
    obstacles, bounds: 38.8,
    theme: { skyTop: 0x3b82c4, skyHorizon: 0xbfdcf0, fog: 0xa9cbe3, fogNear: 45, fogFar: 140, sun: 0xfff3dc, hemiGround: 0x3d4a40 },
  };
}

// ---------------------------------------------------------------------------
// MAPA 2 — CIDADE PEQUENA
// ---------------------------------------------------------------------------
function addWindows(scene, w, h, d, x, z, seed) {
  // Grades de janelas nas 4 fachadas (algumas acesas)
  const floors = Math.floor((h - 1.5) / 3);
  const colsX = Math.max(1, Math.floor((w - 1) / 2.2));
  const colsZ = Math.max(1, Math.floor((d - 1) / 2.2));
  for (let f = 0; f < floors; f++) {
    const wy = 2.4 + f * 3;
    for (let c = 0; c < colsX; c++) {
      const wx = x - w / 2 + (w / colsX) * (c + 0.5);
      [[z - d / 2 - 0.03], [z + d / 2 + 0.03]].forEach(([wz], side) => {
        const lit = (f * 7 + c * 3 + side + seed) % 5 === 0;
        addDeco(scene, 1.2, 1.5, 0.06, wx, wy, wz, lit ? 0xffe9a3 : 0x1a2433, lit ? glow(0xffd77a, 0.9) : { surface: 'glass', metalness: 0.6, roughness: 0.15 });
      });
    }
    for (let c = 0; c < colsZ; c++) {
      const wz = z - d / 2 + (d / colsZ) * (c + 0.5);
      [[x - w / 2 - 0.03], [x + w / 2 + 0.03]].forEach(([wx], side) => {
        const lit = (f * 5 + c * 2 + side + seed) % 6 === 0;
        addDeco(scene, 0.06, 1.5, 1.2, wx, wy, wz, lit ? 0xffe9a3 : 0x1a2433, lit ? glow(0xffd77a, 0.9) : { surface: 'glass', metalness: 0.6, roughness: 0.15 });
      });
    }
  }
}

function addCar(scene, obstacles, x, z, color, alongX) {
  const [w, d] = alongX ? [4.2, 2.0] : [2.0, 4.2];
  addBox(scene, obstacles, w, 1.0, d, x, 0.75, z, color, { surface: 'metal', metalness: 0.5, roughness: 0.35 });
  const [cw, cd] = alongX ? [2.2, 1.8] : [1.8, 2.2];
  addBox(scene, obstacles, cw, 0.75, cd, x, 1.62, z, 0x1b2430, { surface: 'glass', metalness: 0.7, roughness: 0.15 });
  const wheels = alongX
    ? [[-1.3, -1.0], [1.3, -1.0], [-1.3, 1.0], [1.3, 1.0]]
    : [[-1.0, -1.3], [1.0, -1.3], [-1.0, 1.3], [1.0, 1.3]];
  wheels.forEach(([ox, oz]) => {
    addDecoCylinder(scene, 0.36, 0.36, 0.3, x + ox, 0.36, z + oz, 0x111111, alongX ? { rotX: Math.PI / 2 } : { rotZ: Math.PI / 2 });
  });
  // Faróis
  const front = alongX ? [x + w / 2 + 0.02, z] : [x, z + d / 2 + 0.02];
  addDeco(scene, alongX ? 0.05 : 1.4, 0.2, alongX ? 1.4 : 0.05, front[0], 0.9, front[1], 0xfff7d6, glow(0xfff7d6, 0.8));
}

function buildCidadeMap(scene) {
  const obstacles = [];
  const half = 39;

  addGround(scene, 84, 0x3a3d44, 'asphalt');
  addPerimeter(scene, obstacles, half, 18, 0x4a3f3a, 0x23252b, 'brick');

  // Faixas de trânsito e faixas de pedestre
  addDeco(scene, 76, 0.02, 0.35, 0, 0.02, 0, 0xeab308);
  addDeco(scene, 0.35, 0.02, 76, 0, 0.02, 0, 0xeab308);
  for (let i = -3; i <= 3; i++) {
    addDeco(scene, 0.6, 0.02, 3, i * 1.2, 0.025, 9, 0xf1f5f9);
    addDeco(scene, 0.6, 0.02, 3, i * 1.2, 0.025, -9, 0xf1f5f9);
    addDeco(scene, 3, 0.02, 0.6, 9, 0.025, i * 1.2, 0xf1f5f9);
    addDeco(scene, 3, 0.02, 0.6, -9, 0.025, i * 1.2, 0xf1f5f9);
  }

  const buildings = [
    [-25, -25, 12, 14, 12, 0x8a5a44, 'brick'],
    [25, -25, 12, 16, 12, 0x9aa3ad, 'plaster'],
    [-25, 25, 12, 12, 12, 0x7d8a99, 'plaster'],
    [25, 25, 12, 15, 12, 0x8f4f3c, 'brick'],
    [-28, 0, 8, 13, 14, 0x6f7f72, 'plaster'],
    [28, 0, 8, 13, 14, 0x7a5440, 'brick'],
    [0, -28, 14, 12, 8, 0xa38c6d, 'plaster'],
    [0, 28, 14, 14, 8, 0x6c5a73, 'plaster'],
    [-13, -12, 7, 8, 7, 0x936450, 'brick'],
    [13, 12, 7, 8, 7, 0x8796a5, 'plaster'],
    [-13, 13, 7, 7, 7, 0x8b7355, 'brick'],
    [13, -13, 7, 7, 7, 0x6b7c8a, 'plaster'],
  ];
  buildings.forEach(([x, z, w, h, d, color, surface], i) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, color, { surface });
    addDeco(scene, w + 0.6, 0.6, d + 0.6, x, h + 0.3, z, 0x2a2d33, { surface: 'concrete' });
    addDeco(scene, w + 0.3, 0.4, d + 0.3, x, 0.2, z, 0x55595f, { surface: 'concrete' });
    addWindows(scene, w, h, d, x, z, i);
    // Equipamentos no telhado
    addDeco(scene, 1.6, 1.0, 1.2, x - w / 4, h + 1.1, z + d / 5, 0x9ca3af, { surface: 'metal', shadow: true });
    if (h >= 13) {
      addDecoCylinder(scene, 1.0, 1.0, 2.0, x + w / 4, h + 1.6, z - d / 5, 0x8b6b4a, { surface: 'wood', shadow: true });
      addDecoCylinder(scene, 0.05, 0.05, 3.5, x + w / 3, h + 2.3, z + d / 3, 0x444444);
      addDeco(scene, 0.15, 0.15, 0.15, x + w / 3, h + 4.1, z + d / 3, 0xff3333, glow(0xff2222, 2));
    }
  });

  // Praça central com monumento iluminado
  addBox(scene, obstacles, 12, 1.2, 12, 0, 0.6, 0, 0x8a8f99, { surface: 'tiles' });
  addBox(scene, obstacles, 4, 5, 4, 0, 3.5, 0, 0x3b414d, { surface: 'panel' });
  addDeco(scene, 1.5, 3, 1.5, 0, 7.5, 0, 0x38bdf8, glow(0x38bdf8, 1.3));
  addDeco(scene, 12.2, 0.1, 12.2, 0, 1.22, 0, 0x5c6370, { surface: 'concrete' });

  addRamp(scene, obstacles, -13, -5, 3.5, 6, 8, 0, 0x5b6170);
  addRamp(scene, obstacles, 13, 5, 3.5, 6, 8, Math.PI, 0x5b6170);

  // Pontos de ônibus
  [[-6, 12], [6, -12], [-6, -12], [6, 12]].forEach(([x, z]) => {
    addBox(scene, obstacles, 4, 3.2, 0.3, x, 1.6, z, 0x9bd5f5, { surface: 'glass', opacity: 0.55, metalness: 0.4, roughness: 0.1 });
    addBox(scene, obstacles, 4.4, 0.3, 2.5, x, 3.3, z + 1.0, 0x222630, { surface: 'metal' });
    addDeco(scene, 3.6, 0.08, 0.4, x, 3.12, z + 1.0, 0xffffff, glow(0xdff3ff, 0.8));
  });

  // Barreiras de concreto
  [[-19, 0, 8, 2.2, 1.2], [19, 0, 8, 2.2, 1.2], [0, -19, 1.2, 2.2, 8], [0, 19, 1.2, 2.2, 8], [-7, 22, 5, 2.2, 1.5], [7, -22, 5, 2.2, 1.5]]
    .forEach(([x, z, w, h, d]) => {
      addBox(scene, obstacles, w, h, d, x, h / 2, z, 0x9aa1ad, { surface: 'concrete' });
      addHazardStripe(scene, w, d, x, h - 0.4, z);
    });

  [[-9, 9], [9, -9], [-9, -9], [9, 9], [-22, 14], [22, -14]].forEach(([x, z]) => addLamp(scene, obstacles, x, z, 6, 0x2f343c, 0xffe9b0));

  [[-18, 18, 2], [18, -18, 2], [-5, -23, 2], [5, 23, 2], [-23, 8, 1], [23, -8, 1]]
    .forEach(([x, z, n]) => addCrateStack(scene, obstacles, x, z, n, 0x96613d));

  // Carros estacionados
  addCar(scene, obstacles, -20, -7, 0xdc2626, true);
  addCar(scene, obstacles, 20, 7, 0x2563eb, true);
  addCar(scene, obstacles, -7, 32, 0xf59e0b, true);
  addCar(scene, obstacles, 7, -32, 0x10b981, true);
  addCar(scene, obstacles, 33, -4, 0xe5e7eb, false);

  // Lixeiras e hidrantes
  [[-11, 4], [11, -4], [4, 11], [-4, -11]].forEach(([x, z]) => {
    addCylinder(scene, obstacles, 0.4, 1.0, x, 0.5, z, 0x166534, { surface: 'metal' });
  });
  [[-16, -9], [16, 9]].forEach(([x, z]) => addCylinder(scene, obstacles, 0.22, 0.8, x, 0.4, z, 0xdc2626, { surface: 'metal' }));

  return {
    obstacles, bounds: 38.8,
    theme: { skyTop: 0x2a3f66, skyHorizon: 0xd99a6c, fog: 0x8f8a99, fogNear: 35, fogFar: 120, sun: 0xffd2a1, hemiGround: 0x2e2a2a },
  };
}

// ---------------------------------------------------------------------------
// MAPA 3 — DUNAS DO DESERTO
// ---------------------------------------------------------------------------
function addPalm(scene, x, z, height) {
  for (let i = 0; i < 4; i++) {
    addDecoCylinder(scene, 0.22 - i * 0.02, 0.26 - i * 0.02, height / 4, x + i * 0.12, height / 8 + (i * height) / 4, z, 0x8b6b44, { surface: 'wood', shadow: true });
  }
  const top = height + 0.1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addDeco(scene, 2.6, 0.08, 0.7, x + 0.36 + Math.cos(a) * 1.2, top - 0.35, z + Math.sin(a) * 1.2, 0x3f8f3a, { rotY: -a, rotZ: -0.35, shadow: true });
  }
  addSphere(scene, 0.35, x + 0.36, top, z, 0x6b4f2a, { shadow: true });
}

function addCactus(scene, obstacles, x, z, h) {
  addCylinder(scene, obstacles, 0.35, h, x, h / 2, z, 0x4d7c3a, { segments: 8 });
  addDecoCylinder(scene, 0.22, 0.22, 1.0, x + 0.6, h * 0.55, z, 0x4d7c3a, { segments: 8, shadow: true });
  addDecoCylinder(scene, 0.22, 0.22, 0.7, x - 0.55, h * 0.45, z, 0x4d7c3a, { segments: 8, shadow: true });
  addDeco(scene, 0.6, 0.2, 0.2, x + 0.35, h * 0.55 - 0.45, z, 0x4d7c3a);
  addDeco(scene, 0.5, 0.2, 0.2, x - 0.3, h * 0.45 - 0.3, z, 0x4d7c3a);
}

function buildDesertoMap(scene) {
  const obstacles = [];
  const half = 39;

  addGround(scene, 84, 0xd9b27a, 'sand');
  addPerimeter(scene, obstacles, half, 18, 0xb07a4a, 0x7c4f2a, 'rock');

  // Oásis com água e templo
  addDeco(scene, 14, 0.06, 14, 0, 0.53, 0, 0x2bb3c0, { metalness: 0.6, roughness: 0.08, emissive: 0x0c4a52, emissiveIntensity: 0.6 });
  addBox(scene, obstacles, 18, 0.5, 18, 0, 0.25, 0, 0xd8b583, { surface: 'tiles' });
  addBox(scene, obstacles, 6, 4, 6, 0, 2.25, 0, 0xc49563, { surface: 'stone' });
  addBox(scene, obstacles, 8, 0.8, 8, 0, 4.6, 0, 0xdcb886, { surface: 'stone' });
  [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]].forEach(([x, z]) => {
    addDecoCylinder(scene, 0.4, 0.45, 4.1, x, 2.55, z, 0xe0c497, { surface: 'stone', shadow: true, segments: 12 });
  });
  addPalm(scene, -7.5, -7.5, 6.5);
  addPalm(scene, 7.5, 7.5, 7.2);
  addPalm(scene, -7.5, 7.5, 5.8);

  // Platôs rochosos com camadas
  [
    [-24, -24, 11, 7, 11, 0xb07446], [24, -24, 10, 8, 10, 0xba7e4a],
    [-24, 24, 12, 6, 12, 0xb07446], [24, 24, 10, 9, 10, 0xba7e4a],
    [-28, 4, 7, 8, 8, 0x9c6a3e], [28, -4, 7, 8, 8, 0x9c6a3e],
    [0, 25, 9, 6, 8, 0xa87244], [0, -25, 9, 7, 8, 0xa87244],
  ].forEach(([x, z, w, h, d, color]) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, color, { surface: 'rock' });
    addBox(scene, obstacles, w + 0.8, 0.6, d + 0.8, x, h + 0.3, z, 0xc99460, { surface: 'rock' });
    addDeco(scene, w + 0.2, 0.35, d + 0.2, x, h * 0.35, z, 0x8e5a32, { surface: 'rock' });
    addDeco(scene, w + 0.1, 0.25, d + 0.1, x, h * 0.7, z, 0xc28550, { surface: 'rock' });
  });

  addRamp(scene, obstacles, -24, -16, 3.5, 7, 7, 0, 0xbb8a55, 'rock');
  addRamp(scene, obstacles, 24, 16, 3.5, 7, 9, Math.PI, 0xbb8a55, 'rock');
  addRamp(scene, obstacles, -16, 24, 3.5, 7, 6, Math.PI / 2, 0xbb8a55, 'rock');
  addRamp(scene, obstacles, 16, -24, 3.5, 7, 8, -Math.PI / 2, 0xbb8a55, 'rock');

  // Plataformas de madeira elevadas
  [[0, 10.5, -20, 8, 0.6, 8], [20, 10.5, 0, 8, 0.6, 8], [-20, 10.5, 0, 8, 0.6, 8]].forEach(([x, y, z, w, h, d]) => {
    addBox(scene, obstacles, w, h, d, x, y, z, 0x7a5030, { surface: 'wood' });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      addBox(scene, obstacles, 0.6, y, 0.6, x + sx * (w / 2 - 0.4), y / 2, z + sz * (d / 2 - 0.4), 0x5a391e, { surface: 'wood' });
    });
    addBox(scene, obstacles, w, 1.1, 0.3, x, y + 0.8, z + d / 2, 0x6b4426, { surface: 'wood' });
    addBox(scene, obstacles, w, 1.1, 0.3, x, y + 0.8, z - d / 2, 0x6b4426, { surface: 'wood' });
    // Toldo de pano
    addDeco(scene, w * 0.6, 0.06, d * 0.6, x, y + 3.2, z, 0xd94f30, { surface: 'cloth', shadow: true });
    addDecoCylinder(scene, 0.08, 0.08, 2.8, x, y + 1.7, z, 0x5a391e);
  });

  // Colunas antigas com capitel
  [[-10, 10], [10, -10], [-10, -10], [10, 10], [-16, 0], [16, 0]].forEach(([x, z]) => {
    addBox(scene, obstacles, 2.4, 9, 2.4, x, 4.5, z, 0xd2a46c, { surface: 'stone' });
    addDeco(scene, 3.2, 0.8, 3.2, x, 9.4, z, 0x9c6a3a, { surface: 'stone' });
    addDeco(scene, 3.0, 0.5, 3.0, x, 0.25, z, 0x9c6a3a, { surface: 'stone' });
  });

  // Ruínas
  [[-18, 8, 8, 2.8, 1.4], [18, -8, 8, 2.8, 1.4], [-8, 20, 1.4, 2.8, 8], [8, -20, 1.4, 2.8, 8], [-6, -6, 5, 2.4, 1.4], [6, 6, 5, 2.4, 1.4]]
    .forEach(([x, z, w, h, d]) => {
      addBox(scene, obstacles, w, h, d, x, h / 2, z, 0xc49563, { surface: 'stone' });
      addDeco(scene, w * 0.4, 0.7, d * 0.9, x + w * 0.2, h + 0.35, z, 0xc49563, { surface: 'stone' });
    });

  [[-15, -15, 2], [15, 15, 2], [-4, 22, 1], [4, -22, 1], [-20, -5, 2], [20, 5, 2]]
    .forEach(([x, z, n]) => addCrateStack(scene, obstacles, x, z, n, 0x8a5a2f));

  // Cactos, pedras e tenda
  [[-31, 18, 3], [31, -18, 3.4], [14, 32, 2.6], [-14, -32, 3]].forEach(([x, z, h]) => addCactus(scene, obstacles, x, z, h));
  [[-30, -10, 1.6], [30, 10, 1.4], [-10, 31, 1.2], [10, -31, 1.5]].forEach(([x, z, r]) => {
    addBox(scene, obstacles, r * 2, r * 1.2, r * 1.7, x, r * 0.6, z, 0x9a6b42, { surface: 'rock' });
  });
  addCone(scene, 3.2, 3.6, -32, 1.8, 31, 0xe8d3a6, { segments: 6, surface: 'cloth' });

  return {
    obstacles, bounds: 38.8,
    theme: { skyTop: 0x4a90d9, skyHorizon: 0xf6dcae, fog: 0xead2a4, fogNear: 40, fogFar: 135, sun: 0xffe7b8, hemiGround: 0x9a7444 },
  };
}

// ---------------------------------------------------------------------------
// MAPA 4 — CAMPO DE NEVE
// ---------------------------------------------------------------------------
function addPine(scene, obstacles, x, z, scale = 1) {
  addCylinder(scene, obstacles, 0.25, 2.6, x, 1.3, z, 0x5b3b2b, { surface: 'wood' });
  addCone(scene, 1.9 * scale, 2.6 * scale, x, 2.6 + 0.9 * scale, z, 0x2f6b3a, { segments: 8 });
  addCone(scene, 1.5 * scale, 2.2 * scale, x, 2.6 + 2.2 * scale, z, 0x357a42, { segments: 8 });
  addCone(scene, 1.0 * scale, 1.8 * scale, x, 2.6 + 3.3 * scale, z, 0x3d8a4a, { segments: 8 });
  addCone(scene, 0.55 * scale, 0.6 * scale, x, 2.6 + 4.1 * scale, z, 0xf8fbff, { segments: 8, surface: 'snow' });
}

function addCabin(scene, obstacles, x, z) {
  addBox(scene, obstacles, 4, 2.2, 4, x, 1.1, z, 0x7a4f30, { surface: 'wood' });
  addCone(scene, 3.4, 1.6, x, 3.0, z, 0x5c2f22, { segments: 4, rotY: Math.PI / 4, surface: 'wood' });
  addCone(scene, 3.45, 0.6, x, 3.55, z, 0xf6fbff, { segments: 4, rotY: Math.PI / 4, surface: 'snow' });
  const doorZ = z + (z < 0 ? 2.02 : -2.02);
  addDeco(scene, 0.9, 1.6, 0.05, x, 0.8, doorZ, 0x3b2416, { surface: 'wood' });
  addDeco(scene, 0.7, 0.6, 0.05, x + 1.2, 1.4, doorZ, 0xffd27a, glow(0xffc35a, 1.1));
  addDecoCylinder(scene, 0.25, 0.25, 1.4, x - 1.2, 3.4, z, 0x6b6b6b, { surface: 'stone' });
}

function addSnowman(scene, x, z) {
  addSphere(scene, 0.7, x, 0.6, z, 0xf8fbff, { surface: 'snow' });
  addSphere(scene, 0.5, x, 1.5, z, 0xf8fbff, { surface: 'snow' });
  addSphere(scene, 0.34, x, 2.2, z, 0xf8fbff, { surface: 'snow' });
  addCone(scene, 0.07, 0.4, x, 2.2, z + 0.45, 0xf97316, { rotX: Math.PI / 2, shadow: false });
  addDecoCylinder(scene, 0.28, 0.28, 0.35, x, 2.62, z, 0x111111);
}

function buildNeveMap(scene) {
  const obstacles = [];
  const half = 39;

  addGround(scene, 84, 0xeef5ff, 'snow');
  addPerimeter(scene, obstacles, half, 16, 0xcfdcea, 0x8aa0b8, 'stone', 0x7dd3fc);

  // Lago congelado
  addBox(scene, obstacles, 18, 0.5, 18, 0, 0.25, 0, 0xbfe6f7, { surface: 'ice', metalness: 0.3, roughness: 0.12 });
  addDeco(scene, 18.4, 0.3, 0.6, 0, 0.3, 9.2, 0xf8fbff, { surface: 'snow' });
  addDeco(scene, 18.4, 0.3, 0.6, 0, 0.3, -9.2, 0xf8fbff, { surface: 'snow' });
  addDeco(scene, 0.6, 0.3, 18.4, 9.2, 0.3, 0, 0xf8fbff, { surface: 'snow' });
  addDeco(scene, 0.6, 0.3, 18.4, -9.2, 0.3, 0, 0xf8fbff, { surface: 'snow' });

  [[-20, -10], [20, -10], [-20, 10], [20, 10]].forEach(([x, z]) => addCabin(scene, obstacles, x, z));

  // Rochas com neve
  [[-12, -6], [12, -6], [-12, 6], [12, 6], [0, -18], [0, 18]].forEach(([x, z]) => {
    addBox(scene, obstacles, 6, 2.0, 6, x, 1.0, z, 0x8f9aa6, { surface: 'rock' });
    addDeco(scene, 6.2, 0.35, 6.2, x, 2.1, z, 0xf8fbff, { surface: 'snow' });
  });

  [[-8, -20], [8, -20], [-16, -2], [16, 2], [-4, 14], [4, 14], [0, -8], [0, 8]].forEach(([x, z], i) => addPine(scene, obstacles, x, z, 0.85 + (i % 3) * 0.12));
  // Pinheiros de fundo (só visual, perto das paredes)
  [[-34, -30], [-30, 34], [34, 30], [30, -34], [-35, 8], [35, -8], [10, 35], [-10, -35]].forEach(([x, z]) => {
    addCone(scene, 2.4, 6, x, 3, z, 0x2a5e35, { segments: 8 });
    addCone(scene, 0.8, 1.2, x, 5.6, z, 0xf8fbff, { segments: 8, surface: 'snow' });
  });

  [[-6, -6, 3, 1.2, 2], [6, 6, 3, 1.2, 2], [-14, 10, 4, 1.2, 2], [14, -10, 4, 1.2, 2]].forEach(([x, z, w, h, d]) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, 0xf0f5f8, { surface: 'snow' });
  });

  [[-7, 18, 1], [7, -18, 1], [-18, -7, 1], [18, 7, 1]].forEach(([x, z, n]) => {
    addCrateStack(scene, obstacles, x, z, n, 0x8b6b4a);
    addDeco(scene, 2.0, 0.25, 2.0, x, 1.98, z, 0xf8fbff, { surface: 'snow' });
  });

  addSnowman(scene, -30, -22);
  addSnowman(scene, 30, 22);
  [[-24, 0], [24, 0], [0, -30], [0, 30]].forEach(([x, z]) => addLamp(scene, obstacles, x, z, 4.5, 0x30363f, 0xffd9a0));

  // Cristais de gelo brilhantes
  [[-33, 0], [33, 0], [0, 33], [0, -33]].forEach(([x, z]) => {
    addCone(scene, 0.5, 2.2, x, 1.1, z, 0x7dd3fc, { segments: 5, emissive: 0x38bdf8, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.1 });
  });

  return {
    obstacles, bounds: 38.8,
    theme: { skyTop: 0x6d8fb5, skyHorizon: 0xe8f0fa, fog: 0xdfe9f5, fogNear: 30, fogFar: 115, sun: 0xf3f7ff, hemiGround: 0xa9b8c9 },
  };
}

const MAP_BUILDERS = {
  arena: buildArenaMap,
  cidade: buildCidadeMap,
  deserto: buildDesertoMap,
  neve: buildNeveMap,
};
