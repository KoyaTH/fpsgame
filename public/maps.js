// =============================================================================
// MAPAS E GEOMETRIA DO MUNDO
// =============================================================================
// Constrói cenários detalhados e retorna a lista de obstáculos para colisão física (AABB)
// e os limites máximos de segurança do mapa.

function addBox(scene, obstacles, w, h, d, x, y, z, color, roughness = 0.7, metalness = 0.1) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (obstacles) obstacles.push(mesh);
  return mesh;
}

function addDecoBox(scene, w, h, d, x, y, z, color, roughness = 0.7, metalness = 0.1) {
  // Elemento puramente estético (sem colisão)
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function addCylinder(scene, obstacles, rTop, rBot, height, segments, x, y, z, color, roughness = 0.7) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, height, segments), mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  if (obstacles) obstacles.push(mesh);
  return mesh;
}

function addGround(scene, size, color, gridColor = 0x222222) {
  const groundMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(size, size / 2, gridColor, 0x00000022);
  grid.position.y = 0.01;
  scene.add(grid);
  return ground;
}

// Paredes perimetrais altas e visíveis com detalhes de acabamento
function addVisiblePerimeterWalls(scene, obstacles, half, height, baseColor, trimColor) {
  const thick = 2.0;
  const h2 = height / 2;

  // 4 Paredes principais altas (evita sair voando com pulos altos e elimina barreiras invisíveis)
  addBox(scene, obstacles, half * 2 + thick * 2, height, thick, 0, h2, -half - thick / 2, baseColor, 0.8);
  addBox(scene, obstacles, half * 2 + thick * 2, height, thick, 0, h2, half + thick / 2, baseColor, 0.8);
  addBox(scene, obstacles, thick, height, half * 2 + thick * 2, -half - thick / 2, h2, 0, baseColor, 0.8);
  addBox(scene, obstacles, thick, height, half * 2 + thick * 2, half + thick / 2, h2, 0, baseColor, 0.8);

  // Moldura/friso superior decorativo
  const trimThick = thick + 0.4;
  addDecoBox(scene, half * 2 + thick * 2, 1.2, trimThick, 0, height + 0.6, -half - thick / 2, trimColor, 0.6);
  addDecoBox(scene, half * 2 + thick * 2, 1.2, trimThick, 0, height + 0.6, half + thick / 2, trimColor, 0.6);
  addDecoBox(scene, trimThick, 1.2, half * 2 + thick * 2, -half - thick / 2, height + 0.6, 0, trimColor, 0.6);
  addDecoBox(scene, trimThick, 1.2, half * 2 + thick * 2, half + thick / 2, height + 0.6, 0, trimColor, 0.6);

  // Pilares nos 4 cantos
  const cornerSize = thick + 1.2;
  addBox(scene, obstacles, cornerSize, height + 2, cornerSize, -half - thick / 2, (height + 2) / 2, -half - thick / 2, trimColor);
  addBox(scene, obstacles, cornerSize, height + 2, cornerSize, half + thick / 2, (height + 2) / 2, -half - thick / 2, trimColor);
  addBox(scene, obstacles, cornerSize, height + 2, cornerSize, -half - thick / 2, (height + 2) / 2, half + thick / 2, trimColor);
  addBox(scene, obstacles, cornerSize, height + 2, cornerSize, half + thick / 2, (height + 2) / 2, half + thick / 2, trimColor);
}

function addCrateStack(scene, obstacles, x, z, count, color) {
  for (let i = 0; i < count; i++) {
    const offsetX = i % 2 === 0 ? 0 : 0.4;
    const offsetZ = i % 2 === 0 ? 0 : -0.3;
    addBox(scene, obstacles, 1.9, 1.9, 1.9, x + offsetX, 0.95 + i * 1.9, z + offsetZ, color, 0.85);
    // Borda metálica da caixa (detalhe visual)
    addDecoBox(scene, 2.0, 0.15, 2.0, x + offsetX, 0.95 + i * 1.9, z + offsetZ, 0x222222, 0.5, 0.6);
  }
}

function addRamp(scene, obstacles, x, z, width, length, height, rotY = 0, color = 0x666677) {
  // Cria rampas com blocos escalonados suaves para subir correndo
  const steps = 6;
  const stepLen = length / steps;
  const stepHeight = height / steps;
  for (let i = 0; i < steps; i++) {
    const sy = (i + 1) * stepHeight;
    const sz = -length / 2 + (i + 0.5) * stepLen;
    const p = new THREE.Vector3(0, sy / 2, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    addBox(scene, obstacles, width, sy, stepLen + 0.05, x + p.x, p.y, z + p.z, color, 0.8);
  }
}

// ---------------------------------------------------------------------------
// MAPA 1 — ARENA CLÁSSICA (Coliseu Tático com Torre Central, Passarelas e Rotações)
// ---------------------------------------------------------------------------
function buildArenaMap(scene) {
  const obstacles = [];
  const mapHalf = 39;
  const wallHeight = 16;

  // Chão temático com pátio de pedra
  addGround(scene, 84, 0x2e4235, 0x1f2e24);
  addVisiblePerimeterWalls(scene, obstacles, mapHalf, wallHeight, 0x484c52, 0x2c2f35);

  // Centro: Torre de 3 níveis com passarelas
  // Nível 1 - Base
  addBox(scene, obstacles, 10, 2.0, 10, 0, 1.0, 0, 0x3d414a);
  addRamp(scene, obstacles, 0, 6.5, 3.5, 4.0, 2.0, 0, 0x4a4f59);
  addRamp(scene, obstacles, 0, -6.5, 3.5, 4.0, 2.0, Math.PI, 0x4a4f59);

  // Nível 2 - Plataforma elevada
  addBox(scene, obstacles, 6, 6.0, 6, 0, 4.0, 0, 0x2f3440);
  addBox(scene, obstacles, 14, 0.8, 4, 0, 7.4, 0, 0x5a6375);
  addBox(scene, obstacles, 4, 0.8, 14, 0, 7.4, 0, 0x5a6375);

  // Nível 3 - Topo com cobertura (Sniper Nest)
  addBox(scene, obstacles, 4, 3.5, 4, 0, 9.5, 0, 0x242833);
  addBox(scene, obstacles, 6, 0.6, 6, 0, 11.5, 0, 0x6e788c);
  // Proteções no topo
  addBox(scene, obstacles, 6, 1.2, 0.4, 0, 12.2, 2.8, 0x3e4554);
  addBox(scene, obstacles, 6, 1.2, 0.4, 0, 12.2, -2.8, 0x3e4554);

  // 4 Grandes Pilares com anéis de energia decorativos
  const pillarPos = [[-15, -15], [15, -15], [-15, 15], [15, 15]];
  pillarPos.forEach(([x, z]) => {
    addBox(scene, obstacles, 3.6, 10, 3.6, x, 5.0, z, 0x555c6b);
    addDecoBox(scene, 4.2, 0.8, 4.2, x, 8.5, z, 0x4ade80, 0.3, 0.8);
    addBox(scene, obstacles, 5, 0.6, 5, x, 10.3, z, 0x3b404d);
  });

  // Pontes conectando os pilares às passarelas centrais
  addBox(scene, obstacles, 12, 0.6, 2.2, -7.5, 7.4, -15, 0x485060);
  addBox(scene, obstacles, 12, 0.6, 2.2, 7.5, 7.4, 15, 0x485060);

  // 4 Postos Fortificados nos Cantos (Sniper towers)
  const cornerForts = [[-28, -28], [28, -28], [-28, 28], [28, 28]];
  cornerForts.forEach(([x, z]) => {
    addBox(scene, obstacles, 8, 5, 8, x, 2.5, z, 0x3e434f);
    addBox(scene, obstacles, 9, 0.6, 9, x, 5.3, z, 0x5a6273);
    // Parapetes
    addBox(scene, obstacles, 9, 1.3, 0.5, x, 6.1, z + 4.2, 0x2c3038);
    addBox(scene, obstacles, 9, 1.3, 0.5, x, 6.1, z - 4.2, 0x2c3038);
    addBox(scene, obstacles, 0.5, 1.3, 9, x + 4.2, 6.1, z, 0x2c3038);
    addBox(scene, obstacles, 0.5, 1.3, 9, x - 4.2, 6.1, z, 0x2c3038);
  });

  // Rampas de acesso aos postos de canto
  addRamp(scene, obstacles, -28, -20, 3, 7, 5, 0, 0x485060);
  addRamp(scene, obstacles, 28, 20, 3, 7, 5, Math.PI, 0x485060);
  addRamp(scene, obstacles, -20, 28, 3, 7, 5, Math.PI / 2, 0x485060);
  addRamp(scene, obstacles, 20, -28, 3, 7, 5, -Math.PI / 2, 0x485060);

  // Muretas táticas e barreiras de contenção
  const barriers = [
    [0, 22, 14, 2.4, 1.2], [0, -22, 14, 2.4, 1.2],
    [22, 0, 1.2, 2.4, 14], [-22, 0, 1.2, 2.4, 14],
    [-24, 0, 6, 2.2, 1.5], [24, 0, 6, 2.2, 1.5],
    [0, 28, 1.5, 2.2, 6], [0, -28, 1.5, 2.2, 6],
  ];
  barriers.forEach(([x, z, w, h, d]) => addBox(scene, obstacles, w, h, d, x, h / 2, z, 0x61697a));

  // Pilhas de caixas de suprimento
  const crateSpots = [
    [-18, 24, 2], [18, -24, 2], [-24, -18, 3], [24, 18, 3],
    [-7, 18, 1], [7, -18, 1], [-18, -7, 2], [18, 7, 2]
  ];
  crateSpots.forEach(([x, z, count]) => addCrateStack(scene, obstacles, x, z, count, 0xb87333));

  return { obstacles, bounds: 38.8 };
}

// ---------------------------------------------------------------------------
// MAPA 2 — CIDADE PEQUENA (Ruas de Asfalto, Prédios com Terraço e Becos)
// ---------------------------------------------------------------------------
function buildCidadeMap(scene) {
  const obstacles = [];
  const mapHalf = 39;
  const wallHeight = 18;

  // Asfalto
  addGround(scene, 84, 0x22252a, 0x111315);
  addVisiblePerimeterWalls(scene, obstacles, mapHalf, wallHeight, 0x2b2e36, 0x1c1e24);

  // Faixas amarelas e brancas de trânsito (visuais)
  addDecoBox(scene, 76, 0.02, 0.4, 0, 0.02, 0, 0xeab308);
  addDecoBox(scene, 0.4, 0.02, 76, 0, 0.02, 0, 0xeab308);

  // Grandes Prédios Urbanos com Janelas Decorativas
  const buildings = [
    [-25, -25, 12, 14, 12, 0x3d4352],
    [25, -25, 12, 16, 12, 0x484f60],
    [-25, 25, 12, 12, 12, 0x383e4c],
    [25, 25, 12, 15, 12, 0x424959],
    [-28, 0, 8, 13, 14, 0x4e5568],
    [28, 0, 8, 13, 14, 0x4e5568],
    [0, -28, 14, 12, 8, 0x3a404f],
    [0, 28, 14, 14, 8, 0x3a404f],
    [-13, -12, 7, 8, 7, 0x586073],
    [13, 12, 7, 8, 7, 0x586073],
    [-13, 13, 7, 7, 7, 0x52596b],
    [13, -13, 7, 7, 7, 0x52596b],
  ];

  buildings.forEach(([x, z, w, h, d, color]) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, color);
    // Beiral do topo
    addDecoBox(scene, w + 0.6, 0.8, d + 0.6, x, h + 0.4, z, 0x1f2229);

    // Janelas iluminadas e escuras
    const floors = Math.floor(h / 3);
    for (let f = 1; f < floors; f++) {
      const wy = f * 3;
      const winColor = (f + Math.abs(x + z)) % 3 === 0 ? 0xffea88 : 0x111620;
      addDecoBox(scene, w - 2, 1.2, d + 0.1, x, wy, z, winColor);
    }
  });

  // Praça Central com Monumento e Cobertura
  addBox(scene, obstacles, 12, 1.2, 12, 0, 0.6, 0, 0x697080);
  addBox(scene, obstacles, 4, 5, 4, 0, 3.5, 0, 0x2e333d);
  addDecoBox(scene, 1.5, 3, 1.5, 0, 7.5, 0, 0x38bdf8);

  // Rampas de acesso a telhados médios
  addRamp(scene, obstacles, -13, -5, 3.5, 6, 8, 0, 0x485060);
  addRamp(scene, obstacles, 13, 5, 3.5, 6, 8, Math.PI, 0x485060);

  // Paradas de ônibus / Abrigos de rua
  const busStops = [[-6, 12], [6, -12], [-6, -12], [6, 12]];
  busStops.forEach(([x, z]) => {
    addBox(scene, obstacles, 4, 3.2, 0.3, x, 1.6, z, 0x38bdf8);
    addBox(scene, obstacles, 4.4, 0.3, 2.5, x, 3.3, z + 1.0, 0x222630);
  });

  // Caçambas e Barreiras de concreto nas ruas
  const barriers = [
    [-19, 0, 8, 2.2, 1.2], [19, 0, 8, 2.2, 1.2],
    [0, -19, 1.2, 2.2, 8], [0, 19, 1.2, 2.2, 8],
    [-7, 22, 5, 2.2, 1.5], [7, -22, 5, 2.2, 1.5],
  ];
  barriers.forEach(([x, z, w, h, d]) => addBox(scene, obstacles, w, h, d, x, h / 2, z, 0x7c8596));

  // Postes de iluminação pública
  const lightPoles = [[-9, 9], [9, -9], [-9, -9], [9, 9], [-22, 14], [22, -14]];
  lightPoles.forEach(([x, z]) => {
    addCylinder(scene, obstacles, 0.15, 0.15, 6, 8, x, 3.0, z, 0x333740);
    addDecoBox(scene, 1.2, 0.3, 0.5, x + 0.4, 6.0, z, 0xffffff, 0.2);
  });

  // Caixas e pallets nos becos
  [[-18, 18, 2], [18, -18, 2], [-5, -23, 2], [5, 23, 2], [-23, 8, 1], [23, -8, 1]].forEach(
    ([x, z, count]) => addCrateStack(scene, obstacles, x, z, count, 0x96613d)
  );

  return { obstacles, bounds: 38.8 };
}

// ---------------------------------------------------------------------------
// MAPA 3 — DUNAS DO DESERTO (Cânion, Ruínas Ancestrais e Oásis Central)
// ---------------------------------------------------------------------------
function buildDesertoMap(scene) {
  const obstacles = [];
  const mapHalf = 39;
  const wallHeight = 18;

  // Terreno arenoso com visual de dunas e cânion
  addGround(scene, 84, 0xcfa567, 0x9e7b45);
  addVisiblePerimeterWalls(scene, obstacles, mapHalf, wallHeight, 0x9c663b, 0x784a25);

  // Oásis Central com água e calçadão de pedra
  addDecoBox(scene, 14, 0.05, 14, 0, 0.03, 0, 0x22a6b3, 0.1, 0.9);
  addBox(scene, obstacles, 18, 0.5, 18, 0, 0.25, 0, 0xd4ac74);
  // Templo central em ruínas no oásis
  addBox(scene, obstacles, 6, 4, 6, 0, 2.25, 0, 0xb8884c);
  addBox(scene, obstacles, 8, 0.8, 8, 0, 4.6, 0, 0xd4ac74);

  // Grandes Platôs e Mesas Rochosas nos 4 quadrantes
  const rockMesas = [
    [-24, -24, 11, 7, 11, 0x9c6838],
    [24, -24, 10, 8, 10, 0xa6703d],
    [-24, 24, 12, 6, 12, 0x9c6838],
    [24, 24, 10, 9, 10, 0xa6703d],
    [-28, 4, 7, 8, 8, 0x8a592f],
    [28, -4, 7, 8, 8, 0x8a592f],
    [0, 25, 9, 6, 8, 0x996537],
    [0, -25, 9, 7, 8, 0x996537],
  ];

  rockMesas.forEach(([x, z, w, h, d, color]) => {
    addBox(scene, obstacles, w, h, d, x, h / 2, z, color);
    addBox(scene, obstacles, w + 0.8, 0.6, d + 0.8, x, h + 0.3, z, 0xb5824e);
  });

  // Rampas de pedra natural conectando as dunas aos platôs
  addRamp(scene, obstacles, -24, -16, 3.5, 7, 7, 0, 0xaa7b49);
  addRamp(scene, obstacles, 24, 16, 3.5, 7, 9, Math.PI, 0xaa7b49);
  addRamp(scene, obstacles, -16, 24, 3.5, 7, 6, Math.PI / 2, 0xaa7b49);
  addRamp(scene, obstacles, 16, -24, 3.5, 7, 8, -Math.PI / 2, 0xaa7b49);

  // Plataformas de Madeira Elevadas com Pontes (para Sniper & Grapple)
  const platforms = [
    [0, 10.5, -20, 8, 0.6, 8],
    [20, 10.5, 0, 8, 0.6, 8],
    [-20, 10.5, 0, 8, 0.6, 8],
  ];
  platforms.forEach(([x, y, z, w, h, d]) => {
    addBox(scene, obstacles, w, h, d, x, y, z, 0x6e4726);
    addBox(scene, obstacles, 0.6, y, 0.6, x - w / 2 + 0.4, y / 2, z - d / 2 + 0.4, 0x4d3018);
    addBox(scene, obstacles, 0.6, y, 0.6, x + w / 2 - 0.4, y / 2, z - d / 2 + 0.4, 0x4d3018);
    addBox(scene, obstacles, 0.6, y, 0.6, x - w / 2 + 0.4, y / 2, z + d / 2 - 0.4, 0x4d3018);
    addBox(scene, obstacles, 0.6, y, 0.6, x + w / 2 - 0.4, y / 2, z + d / 2 - 0.4, 0x4d3018);
    addBox(scene, obstacles, w, 1.1, 0.3, x, y + 0.8, z + d / 2, 0x5a391e);
    addBox(scene, obstacles, w, 1.1, 0.3, x, y + 0.8, z - d / 2, 0x5a391e);
  });

  // Pilares e Monumentos
  const pillars = [[-10, 10], [10, -10], [-10, -10], [10, 10], [-16, 0], [16, 0]];
  pillars.forEach(([x, z]) => {
    addBox(scene, obstacles, 2.4, 9, 2.4, x, 4.5, z, 0xc29357);
    addDecoBox(scene, 3.2, 0.8, 3.2, x, 9.4, z, 0x8a5929);
  });

  // Muros de ruínas antigas como cobertura tática
  const ruins = [
    [-18, 8, 8, 2.8, 1.4], [18, -8, 8, 2.8, 1.4],
    [-8, 20, 1.4, 2.8, 8], [8, -20, 1.4, 2.8, 8],
    [-6, -6, 5, 2.4, 1.4], [6, 6, 5, 2.4, 1.4]
  ];
  ruins.forEach(([x, z, w, h, d]) => addBox(scene, obstacles, w, h, d, x, h / 2, z, 0xb8884c));

  // Caixas de expedição
  [[-15, -15, 2], [15, 15, 2], [-4, 22, 1], [4, -22, 1], [-20, -5, 2], [20, 5, 2]].forEach(
    ([x, z, count]) => addCrateStack(scene, obstacles, x, z, count, 0x7a4e27)
  );

  return { obstacles, bounds: 38.8 };
}

const MAP_BUILDERS = {
  arena: buildArenaMap,
  cidade: buildCidadeMap,
  deserto: buildDesertoMap,
};
