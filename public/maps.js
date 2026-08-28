// Cada função constrói a geometria de um mapa na cena e retorna a lista de
// "obstacles" (meshes) usados para colisão simples de caixa (AABB).

function addBox(scene, obstacles, w, h, d, x, y, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  obstacles.push(mesh);
  return mesh;
}

function addGround(scene, size, color) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(size, size / 2, 0x222222, 0x00000033);
  scene.add(grid);
  return ground;
}

function addBoundaryWalls(scene, obstacles, half, height, color) {
  const mat = color;
  addBox(scene, obstacles, half * 2, height, 1, 0, height / 2, -half, mat);
  addBox(scene, obstacles, half * 2, height, 1, 0, height / 2, half, mat);
  addBox(scene, obstacles, 1, height, half * 2, -half, height / 2, 0, mat);
  addBox(scene, obstacles, 1, height, half * 2, half, height / 2, 0, mat);
}

function addCrateStack(scene, obstacles, x, z, count, color) {
  for (let i = 0; i < count; i++) {
    const offsetX = i % 2 === 0 ? 0 : 1.15;
    const offsetZ = i % 2 === 0 ? 0 : -0.35;
    addBox(scene, obstacles, 1.9, 1.9, 1.9, x + offsetX, 0.95 + i * 1.9, z + offsetZ, color);
  }
}

// ---------------------------------------------------------------------------
// MAPA 1 — ARENA CLÁSSICA (simétrica, 8 spawns, boa pra todas as armas)
// ---------------------------------------------------------------------------
function buildArenaMap(scene) {
  const obstacles = [];
  addGround(scene, 82, 0x3a5f3a);
  addBoundaryWalls(scene, obstacles, 39, 8, 0x555555);

  // pilares centrais (cobertura + bom pra gancho)
  const pillarColor = 0x8a6d3b;
  [[-14, -14], [14, -14], [-14, 14], [14, 14], [-26, -8], [26, 8]].forEach(([x, z]) => {
    addBox(scene, obstacles, 3, 6, 3, x, 3, z, pillarColor);
  });

  // torre central alta (destino clássico de gancho)
  addBox(scene, obstacles, 6, 12, 6, 0, 6, 0, 0x6a5acd);
  addBox(scene, obstacles, 14, 1, 4, 0, 8, 0, 0x7367b8);
  addBox(scene, obstacles, 4, 1, 14, 0, 8, 0, 0x7367b8);

  // muretas de cobertura
  [[0, 22, 12, 2, 1], [0, -22, 12, 2, 1], [22, 0, 1, 2, 12], [-22, 0, 1, 2, 12],
    [-28, -24, 7, 3, 2], [28, 24, 7, 3, 2], [-28, 24, 2, 3, 7], [28, -24, 2, 3, 7]].forEach(([x, z, w, h, d]) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, 0x777777);
  });
  // Bases laterais, passagens e caixas deixam as rotas externas menos vazias.
  [[-29, 12], [29, -12], [-12, 29], [12, -29]].forEach(([x, z]) => {
    addBox(scene, obstacles, 6, 4, 4, x, 2, z, 0x5d6570);
    addBox(scene, obstacles, 8, 0.8, 3, x, 4.4, z, 0x798290);
  });
  [[-20, 25, 2], [20, -25, 2], [-25, -20, 3], [25, 20, 3]].forEach(([x, z, count]) => addCrateStack(scene, obstacles, x, z, count, 0x9a6b3d));

  return { obstacles, bounds: 38 };
}

// ---------------------------------------------------------------------------
// MAPA 2 — CIDADE PEQUENA (prédios, ruas, corredores de tiro)
// ---------------------------------------------------------------------------
function buildCidadeMap(scene) {
  const obstacles = [];
  addGround(scene, 82, 0x444444);
  addBoundaryWalls(scene, obstacles, 39, 10, 0x333333);

  const buildingColor = 0x7a7a8a;
  const buildings = [
    [-24, -24, 8, 10, 8], [24, -24, 8, 12, 8], [-24, 24, 8, 8, 8], [24, 24, 8, 13, 8],
    [0, -27, 7, 9, 7], [0, 27, 7, 9, 7], [-30, 0, 6, 11, 7], [30, 0, 6, 10, 7],
    [-12, -10, 6, 7, 6], [12, 10, 6, 7, 6], [-12, 18, 5, 6, 5], [12, -18, 5, 6, 5],
  ];
  buildings.forEach(([x, z, w, h, d]) => addBox(scene, obstacles, w, h, d, x, h / 2, z, buildingColor));

  // rampas/plataformas baixas no centro pra dar altura tática
  addBox(scene, obstacles, 10, 1.2, 10, 0, 0.6, 0, 0x999999);
  [[-8, 0], [8, 0], [0, -8], [0, 8]].forEach(([x, z]) => addBox(scene, obstacles, 2, 3, 5, x, 1.5, z, 0x66666e));
  [[-18, 0, 12, 2, 1], [18, 0, 12, 2, 1], [0, -18, 1, 2, 12], [0, 18, 1, 2, 12]].forEach(([x, z, w, h, d]) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, 0x8b5a3c);
  });
  // Mercado central e pequenos blocos formam becos e pontos de cobertura.
  [[-5, 13], [5, -13], [-18, 12], [18, -12], [-18, -12], [18, 12]].forEach(([x, z], index) => {
    addCrateStack(scene, obstacles, x, z, index % 2 === 0 ? 2 : 1, 0x8f623d);
  });
  [[-6, 25], [6, 25], [-6, -25], [6, -25]].forEach(([x, z]) => {
    addBox(scene, obstacles, 1, 5, 1, x, 2.5, z, 0x404650);
    addBox(scene, obstacles, 4, 0.45, 1.3, x, 5, z, 0x656c77);
  });

  return { obstacles, bounds: 38 };
}

// ---------------------------------------------------------------------------
// MAPA 3 — DUNAS DO DESERTO (plataformas elevadas, ótimo pro gancho)
// ---------------------------------------------------------------------------
function buildDesertoMap(scene) {
  const obstacles = [];
  addGround(scene, 82, 0xc2a15c);
  addBoundaryWalls(scene, obstacles, 39, 8, 0x8a6d3b);

  const rockColor = 0xa07840;
  // dunas/rochas de tamanhos variados espalhadas
  const rocks = [
    [-24, -24, 7, 4, 7], [24, -24, 6, 6, 6], [-24, 24, 8, 5, 8], [24, 24, 7, 7, 7],
    [0, 0, 10, 2, 10], [10, 0, 4, 5, 4], [-10, 0, 4, 5, 4], [0, 18, 6, 4, 8], [0, -18, 8, 4, 6],
    [-30, 4, 5, 8, 5], [30, -4, 5, 8, 5],
  ];
  rocks.forEach(([x, z, w, h, d]) => addBox(scene, obstacles, w, h, d, x, h / 2, z, rockColor));

  // plataformas elevadas isoladas (só acessíveis com o gancho ou pulando das rochas)
  addBox(scene, obstacles, 7, 1, 7, 0, 10, -24, 0x555555);
  addBox(scene, obstacles, 7, 1, 7, 24, 10, 0, 0x555555);
  addBox(scene, obstacles, 7, 1, 7, -24, 10, 0, 0x555555);
  [[-16, 8], [16, -8], [-8, -28], [8, 28]].forEach(([x, z]) => addBox(scene, obstacles, 3, 5, 8, x, 2.5, z, 0x76532e));
  // Ruínas e caixas criam abrigo entre as rochas e as plataformas do gancho.
  [[-22, 8], [22, -8], [-7, 29], [7, -29]].forEach(([x, z]) => {
    addBox(scene, obstacles, 7, 3, 1.2, x, 1.5, z, 0x8c6840);
    addBox(scene, obstacles, 1.2, 5, 1.2, x - 2.5, 2.5, z, 0x735232);
  });
  [[-18, -8, 2], [18, 8, 2], [-5, 23, 1], [5, -23, 1]].forEach(([x, z, count]) => addCrateStack(scene, obstacles, x, z, count, 0x8d5b2d));

  return { obstacles, bounds: 38 };
}

const MAP_BUILDERS = {
  arena: buildArenaMap,
  cidade: buildCidadeMap,
  deserto: buildDesertoMap,
};
