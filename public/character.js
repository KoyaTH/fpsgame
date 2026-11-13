// =============================================================================
// PERSONAGEM: MODELO, CUSTOMIZAÇÃO, IK DOS BRAÇOS E ANIMAÇÕES
// =============================================================================
// Modelo em blocos dividido em segmentos rígidos (quadril, coxas, canelas,
// tronco, cabeça, braços e antebraços). Cada segmento é UM mesh com cores por
// vértice e todos usam o mesmo material do jogador: ~13 draw calls por
// personagem (antes eram ~40). A arma dos outros jogadores também vira um único
// mesh, com a geometria em cache por arma e compartilhada entre todos.
//
// Os braços usam IK de dois ossos: a mão direita vai até a empunhadura e a
// esquerda até o guarda-mão de cada arma, então o personagem segura a arma de
// verdade (sem braços abertos), em qualquer pose e animação.

const CHAR = {
  hipY: 0.88,       // altura do quadril em pé (pés no y = 0)
  thigh: 0.42,      // coxa
  shin: 0.42,       // canela até o tornozelo (a bota completa até o chão)
  hipX: 0.1,
  spineY: 0.12,     // base do tronco acima do quadril
  shoulderY: 0.45,  // ombros (no espaço do tronco)
  shoulderX: 0.27,
  headY: 0.53,      // pescoço
  upperArm: 0.31,
  foreArm: 0.31,    // até o centro da mão
};
const CHAR_HEAD_TOP = CHAR.hipY + CHAR.spineY + CHAR.headY + 0.35; // ~1.88m

const charEaseInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const charEaseOut = (u) => 1 - Math.pow(1 - u, 3);
const charLerp = (a, b, t) => a + (b - a) * t;
const charDamp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

// -----------------------------------------------------------------------------
// GEOMETRIA COM CORES POR VÉRTICE
// -----------------------------------------------------------------------------
const CHAR_UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const _gM4 = new THREE.Matrix4();
const _gN3 = new THREE.Matrix3();
const _gQ = new THREE.Quaternion();
const _gE = new THREE.Euler();
const _gS = new THREE.Vector3();
const _gP = new THREE.Vector3();
const _gV = new THREE.Vector3();
const _gC = new THREE.Color();

// Junta várias peças { geometry (não indexada), matrix, color } em uma geometria
function mergeColoredPieces(pieces) {
  let count = 0;
  for (const p of pieces) count += p.geometry.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const p of pieces) {
    const sp = p.geometry.attributes.position;
    const sn = p.geometry.attributes.normal;
    _gN3.getNormalMatrix(p.matrix);
    _gC.setHex(p.color);
    for (let i = 0; i < sp.count; i++, o++) {
      _gV.fromBufferAttribute(sp, i).applyMatrix4(p.matrix);
      pos[o * 3] = _gV.x; pos[o * 3 + 1] = _gV.y; pos[o * 3 + 2] = _gV.z;
      _gV.fromBufferAttribute(sn, i).applyMatrix3(_gN3).normalize();
      nor[o * 3] = _gV.x; nor[o * 3 + 1] = _gV.y; nor[o * 3 + 2] = _gV.z;
      col[o * 3] = _gC.r; col[o * 3 + 1] = _gC.g; col[o * 3 + 2] = _gC.b;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Caixas: [largura, altura, profundidade, x, y, z, cor, rotX, rotY, rotZ]
function coloredBoxes(boxes) {
  return mergeColoredPieces(boxes.map((b) => {
    _gE.set(b[7] || 0, b[8] || 0, b[9] || 0);
    _gQ.setFromEuler(_gE);
    _gS.set(b[0], b[1], b[2]);
    _gP.set(b[3], b[4], b[5]);
    return { geometry: CHAR_UNIT_BOX, matrix: new THREE.Matrix4().compose(_gP, _gQ, _gS), color: b[6] };
  }));
}

// Escurece/clareia uma cor hex (para calça, sombras de detalhe etc.)
function shadeHex(hex, k) {
  _gC.setHex(hex).multiplyScalar(k);
  _gC.r = Math.min(1, _gC.r); _gC.g = Math.min(1, _gC.g); _gC.b = Math.min(1, _gC.b);
  return _gC.getHex();
}

// -----------------------------------------------------------------------------
// ARMAS DOS OUTROS JOGADORES (um mesh por arma, geometria em cache)
// -----------------------------------------------------------------------------
const REMOTE_WEAPON_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 });
const remoteWeaponCache = {};
// Onde fica a mão direita em cada arma (espaço local da arma)
const WEAPON_GRIPS = {
  pistol: [0, -0.12, 0.02],
  revolver: [0, -0.12, 0.1],
  knife: [0, 0, 0.03],
  grapple: [0, -0.13, 0.03],
  default: [0, -0.13, 0.05],
};

function getRemoteWeapon(key) {
  if (remoteWeaponCache[key]) return remoteWeaponCache[key];
  const model = buildWeaponModel(key);
  const pieces = [];
  model.group.updateMatrixWorld(true);
  model.group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    pieces.push({ geometry: g, matrix: o.matrixWorld.clone(), color: o.material.color.getHex(), temp: g !== o.geometry });
  });
  const geometry = mergeColoredPieces(pieces);
  // Libera o modelo detalhado (só a geometria mesclada fica)
  pieces.forEach((p) => { if (p.temp) p.geometry.dispose(); });
  model.group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (o.material !== SIGHT_DOT_MAT && o.material !== RED_DOT_GLASS) o.material.dispose();
  });
  const grip = WEAPON_GRIPS[key] || WEAPON_GRIPS.default;
  remoteWeaponCache[key] = {
    geometry,
    muzzle: model.muzzle,
    support: model.support,
    grip: new THREE.Vector3(grip[0], grip[1], grip[2]),
  };
  return remoteWeaponCache[key];
}

// Como cada tipo de arma é segurada (espaço da mira: origem entre os ombros, frente = -Z)
const HOLD_POSES = {
  long: { pos: [0.11, -0.14, -0.2], scale: 0.85, twist: -0.32, supportZ: 0.78 },
  pistol: { pos: [0.03, -0.05, -0.47], scale: 1, twist: -0.1, supportZ: 1 },
  grapple: { pos: [0.15, -0.14, -0.36], scale: 0.9, twist: -0.18, supportZ: 1 },
  knife: { pos: [0.22, -0.3, -0.26], scale: 0.85, twist: -0.12, supportZ: 1 },
};

function weaponHoldClass(key) {
  if (key === 'knife') return 'knife';
  if (key === 'pistol' || key === 'revolver') return 'pistol';
  if (key === 'grapple') return 'grapple';
  return 'long';
}

// -----------------------------------------------------------------------------
// PEÇAS DO CORPO (variam com a customização)
// -----------------------------------------------------------------------------
function characterColors(c) {
  const suit = CHARACTER_OPTIONS.suit[c.suit];
  const accent = CHARACTER_OPTIONS.accent[c.accent];
  return {
    suit,
    pants: shadeHex(suit, 0.55),
    accent,
    accentDark: shadeHex(accent, 0.7),
    skin: CHARACTER_OPTIONS.skin[c.skin],
    glow: CHARACTER_OPTIONS.glow[c.glow],
    dark: 0x1b1e24,
    glove: 0x23272f,
    boot: 0x17191e,
    hair: 0x2b1d14,
    steel: 0x8b949e,
  };
}

function headBoxes(c, k) {
  const b = [[0.3, 0.32, 0.3, 0, 0.17, 0, k.skin]];
  // orelhas e pescoço
  b.push([0.05, 0.08, 0.06, -0.165, 0.17, 0.01, k.skin], [0.05, 0.08, 0.06, 0.165, 0.17, 0.01, k.skin]);
  b.push([0.14, 0.06, 0.14, 0, -0.01, 0.01, k.skin]);
  switch (c.hat) {
    case 'capacete':
      b.push([0.34, 0.14, 0.34, 0, 0.31, 0.005, k.accent], [0.36, 0.04, 0.36, 0, 0.245, 0.005, k.accentDark]);
      b.push([0.05, 0.1, 0.24, -0.175, 0.22, 0.02, k.accentDark], [0.05, 0.1, 0.24, 0.175, 0.22, 0.02, k.accentDark]);
      break;
    case 'bone':
      b.push([0.32, 0.1, 0.32, 0, 0.33, 0.005, k.accent], [0.26, 0.03, 0.15, 0, 0.29, -0.21, k.accentDark]);
      b.push([0.31, 0.04, 0.31, 0, 0.27, 0.01, k.hair]);
      break;
    case 'gorro':
      b.push([0.33, 0.15, 0.33, 0, 0.32, 0.005, k.suit], [0.34, 0.05, 0.34, 0, 0.25, 0.005, k.accent]);
      b.push([0.08, 0.08, 0.08, 0, 0.43, 0.005, k.accent]);
      break;
    case 'bandana':
      b.push([0.315, 0.07, 0.315, 0, 0.27, 0.005, k.accent], [0.31, 0.06, 0.31, 0, 0.33, 0.01, k.hair]);
      b.push([0.05, 0.12, 0.03, 0.04, 0.22, 0.17, k.accent, 0.3, 0, 0.3], [0.05, 0.12, 0.03, -0.03, 0.22, 0.17, k.accent, 0.3, 0, -0.3]);
      break;
    case 'moicano':
      b.push([0.07, 0.13, 0.32, 0, 0.38, 0.01, k.accent], [0.31, 0.02, 0.31, 0, 0.325, 0.01, k.hair]);
      break;
    default: // cabelo curto
      b.push([0.32, 0.07, 0.32, 0, 0.33, 0.01, k.hair], [0.32, 0.12, 0.05, 0, 0.27, 0.14, k.hair]);
  }
  switch (c.face) {
    case 'oculos':
      b.push([0.11, 0.06, 0.03, -0.07, 0.2, -0.155, k.dark], [0.11, 0.06, 0.03, 0.07, 0.2, -0.155, k.dark]);
      b.push([0.3, 0.02, 0.02, 0, 0.22, -0.155, k.dark]);
      break;
    case 'mascara':
      b.push([0.29, 0.13, 0.03, 0, 0.08, -0.155, k.dark], [0.04, 0.035, 0.01, -0.07, 0.2, -0.152, k.dark], [0.04, 0.035, 0.01, 0.07, 0.2, -0.152, k.dark]);
      break;
    case 'limpo':
      b.push([0.045, 0.045, 0.01, -0.07, 0.2, -0.152, k.dark], [0.045, 0.045, 0.01, 0.07, 0.2, -0.152, k.dark]);
      b.push([0.1, 0.02, 0.01, 0, 0.09, -0.152, shadeHex(k.skin, 0.6)]);
      break;
    default: // visor: a faixa acesa é um mesh à parte (brilha sem luz)
      b.push([0.31, 0.1, 0.03, 0, 0.2, -0.15, k.dark]);
  }
  return b;
}

function torsoBoxes(c, k) {
  const b = [
    [0.46, 0.5, 0.26, 0, 0.25, 0, k.suit],              // camisa
    [0.5, 0.34, 0.3, 0, 0.28, 0, k.accent],             // colete
    [0.1, 0.1, 0.05, -0.12, 0.2, -0.165, k.accentDark], // bolsos
    [0.1, 0.1, 0.05, 0.12, 0.2, -0.165, k.accentDark],
    [0.22, 0.05, 0.2, 0, 0.5, 0, k.accentDark],         // gola
    [0.17, 0.1, 0.22, -0.28, 0.46, 0, k.accent],        // ombreiras
    [0.17, 0.1, 0.22, 0.28, 0.46, 0, k.accent],
  ];
  switch (c.back) {
    case 'mochila':
      b.push([0.34, 0.36, 0.16, 0, 0.27, 0.22, k.accentDark], [0.28, 0.12, 0.06, 0, 0.16, 0.31, k.accent]);
      b.push([0.05, 0.4, 0.04, -0.13, 0.3, -0.155, k.dark], [0.05, 0.4, 0.04, 0.13, 0.3, -0.155, k.dark]);
      break;
    case 'jetpack':
      b.push([0.13, 0.4, 0.13, -0.09, 0.28, 0.22, k.steel], [0.13, 0.4, 0.13, 0.09, 0.28, 0.22, k.steel]);
      b.push([0.09, 0.06, 0.09, -0.09, 0.05, 0.22, k.glow], [0.09, 0.06, 0.09, 0.09, 0.05, 0.22, k.glow]);
      b.push([0.3, 0.06, 0.05, 0, 0.42, 0.17, k.dark]);
      break;
    case 'antena':
      b.push([0.18, 0.22, 0.1, 0.06, 0.3, 0.19, k.dark], [0.02, 0.5, 0.02, 0.12, 0.62, 0.2, k.steel]);
      b.push([0.05, 0.05, 0.05, 0.12, 0.88, 0.2, k.glow]);
      break;
    default:
  }
  return b;
}

// -----------------------------------------------------------------------------
// MONTAGEM DO MODELO
// -----------------------------------------------------------------------------
function createCharacterAnim() {
  return {
    t: Math.random() * 10, stride: 0, crouch: 0, pitch: 0, recoil: 0,
    swingT: 1, swingDir: 1, reloadT: 1, reloadDur: 2000, drawT: 1, flinch: 0,
    air: 0, slide: 0, fwd: 0, side: 0, lastY: 0,
  };
}

function buildCharacter(character) {
  const c = sanitizeCharacter(character);
  const k = characterColors(c);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08 });
  const glowMat = new THREE.MeshBasicMaterial({ color: k.glow });
  const group = new THREE.Group();
  const hitMeshes = [];

  const seg = (parent, boxes, isHead = false) => {
    const m = new THREE.Mesh(coloredBoxes(boxes), bodyMat);
    m.castShadow = true;
    m.userData.isHead = isHead;
    parent.add(m);
    hitMeshes.push(m);
    return m;
  };
  const joint = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // Quadril e pernas
  const pelvis = joint(group, 0, CHAR.hipY, 0);
  seg(pelvis, [
    [0.36, 0.2, 0.24, 0, 0.03, 0, k.pants],
    [0.38, 0.06, 0.26, 0, 0.11, 0, k.dark],
    [0.07, 0.05, 0.02, 0, 0.11, -0.135, k.accent],
    [0.1, 0.14, 0.08, 0.2, 0.0, 0.02, k.accentDark], // coldre
  ]);
  const makeLeg = (x) => {
    const thigh = joint(pelvis, x, 0, 0);
    seg(thigh, [
      [0.17, 0.44, 0.19, 0, -0.2, 0, k.pants],
      [0.13, 0.1, 0.05, 0, -0.39, -0.1, k.accent], // joelheira
    ]);
    const knee = joint(thigh, 0, -CHAR.thigh, 0);
    seg(knee, [
      [0.15, 0.36, 0.17, 0, -0.18, 0, k.pants],
      [0.17, 0.14, 0.29, 0, -0.39, -0.045, k.boot],
      [0.18, 0.03, 0.3, 0, -0.45, -0.045, k.dark],
    ]);
    return { thigh, knee };
  };
  const legL = makeLeg(-CHAR.hipX);
  const legR = makeLeg(CHAR.hipX);

  // Tronco, cabeça e braços (os braços são posicionados pelo IK a cada frame)
  const spine = joint(pelvis, 0, CHAR.spineY, 0);
  seg(spine, torsoBoxes(c, k));
  const head = joint(spine, 0, CHAR.headY, 0);
  seg(head, headBoxes(c, k), true);
  if (c.face === 'visor') {
    const visor = new THREE.Mesh(coloredBoxes([[0.27, 0.05, 0.02, 0, 0.2, -0.168, 0xffffff]]), glowMat);
    visor.userData.isHead = true;
    head.add(visor);
    hitMeshes.push(visor);
  }
  const upperBoxes = [[0.13, 0.31, 0.14, 0, -0.15, 0, k.suit], [0.135, 0.06, 0.145, 0, -0.27, 0, k.accentDark]];
  const foreBoxes = [
    [0.12, 0.25, 0.12, 0, -0.12, 0, k.suit],
    [0.125, 0.05, 0.125, 0, -0.22, 0, k.accent],
    [0.1, 0.11, 0.11, 0, -0.3, 0, k.glove],
  ];
  const upperR = seg(spine, upperBoxes);
  const foreR = seg(spine, foreBoxes);
  const upperL = seg(spine, upperBoxes);
  const foreL = seg(spine, foreBoxes);

  // Mira: gira com o pitch e carrega a arma (as mãos seguem por IK)
  const aim = joint(spine, 0, CHAR.shoulderY, 0);
  aim.rotation.order = 'YXZ';
  const hold = joint(aim, 0, 0, 0);

  const parts = {
    pelvis, legL, legR, spine, head, aim, hold, upperR, foreR, upperL, foreL,
    weaponGroup: null, weaponInfo: null, muzzle: null, flash: null, weaponKey: null, holdClass: 'long',
  };
  const anim = createCharacterAnim();

  const setWeapon = (key) => {
    if (parts.weaponKey === key) return;
    const first = parts.weaponKey === null;
    parts.weaponKey = key;
    if (parts.weaponGroup) {
      hold.remove(parts.weaponGroup);
      if (parts.flash) parts.flash.material.dispose();
    }
    const info = getRemoteWeapon(key);
    const pose = HOLD_POSES[weaponHoldClass(key)];
    const mesh = new THREE.Mesh(info.geometry, REMOTE_WEAPON_MAT);
    mesh.userData.shared = true; // geometria/material em cache: não liberar
    mesh.castShadow = true;
    mesh.scale.setScalar(pose.scale);
    mesh.position.copy(info.grip).multiplyScalar(-pose.scale); // empunhadura na origem da mão
    hold.add(mesh);
    parts.weaponGroup = mesh;
    parts.weaponInfo = info;
    parts.muzzle = info.muzzle;
    parts.holdClass = weaponHoldClass(key);
    parts.flash = typeof createMuzzleFlash === 'function' ? createMuzzleFlash(mesh, info.muzzle, 0.5) : null;
    if (!first) anim.drawT = 0; // animação de sacar
  };

  return { group, parts, anim, hitMeshes, materials: [bodyMat], setWeapon, character: c };
}

// -----------------------------------------------------------------------------
// IK DE DOIS OSSOS (ombro -> cotovelo -> mão), tudo no espaço do tronco
// -----------------------------------------------------------------------------
const CHAR_DOWN = new THREE.Vector3(0, -1, 0);
const _ikD = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _ikElbow = new THREE.Vector3();
const _ikHand = new THREE.Vector3();
const _ikDir = new THREE.Vector3();

function solveArmIK(upper, fore, shoulder, target, pole) {
  const L1 = CHAR.upperArm;
  const L2 = CHAR.foreArm;
  _ikD.subVectors(target, shoulder);
  let len = _ikD.length();
  const maxLen = (L1 + L2) * 0.995;
  if (len > maxLen) { _ikD.multiplyScalar(maxLen / len); len = maxLen; }
  if (len < 0.08) { _ikD.set(0, -0.08, 0); len = 0.08; }
  _ikDir.copy(_ikD).divideScalar(len);
  const cosA = THREE.MathUtils.clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // direção do cotovelo: componente do vetor de polo perpendicular ao braço
  _ikPole.copy(pole).addScaledVector(_ikDir, -pole.dot(_ikDir));
  if (_ikPole.lengthSq() < 1e-6) _ikPole.set(0, -1, 0);
  _ikPole.normalize();
  _ikElbow.copy(shoulder).addScaledVector(_ikDir, L1 * cosA).addScaledVector(_ikPole, L1 * sinA);
  _ikHand.copy(shoulder).add(_ikD);

  upper.position.copy(shoulder);
  upper.quaternion.setFromUnitVectors(CHAR_DOWN, _ikD.subVectors(_ikElbow, shoulder).normalize());
  fore.position.copy(_ikElbow);
  fore.quaternion.setFromUnitVectors(CHAR_DOWN, _ikD.subVectors(_ikHand, _ikElbow).normalize());
}

// -----------------------------------------------------------------------------
// ANIMAÇÃO
// -----------------------------------------------------------------------------
const _aShoulderR = new THREE.Vector3();
const _aShoulderL = new THREE.Vector3();
const _aTargetR = new THREE.Vector3();
const _aTargetL = new THREE.Vector3();
const _aTmp = new THREE.Vector3();
const POLE_R = new THREE.Vector3(0.75, -1, 0.35);
const POLE_L = new THREE.Vector3(-0.75, -1, 0.15);
const KNIFE_GUARD = new THREE.Vector3(-0.13, -0.26, -0.3); // punho esquerdo em guarda
const RELOAD_POUCH = new THREE.Vector3(-0.1, -0.5, -0.05); // cinto (espaço da mira)
const _reloadMag = new THREE.Vector3(0, -0.2, -0.1); // pente (espaço da arma)
const _aMag = new THREE.Vector3();

// Altura vertical da perna (quadril até a sola) para manter os pés no chão
function legReach(thighRot, kneeRot) {
  return CHAR.thigh * Math.cos(thighRot) + (CHAR.shin + 0.04) * Math.cos(thighRot + kneeRot);
}

// Ponto do espaço local da arma -> espaço do tronco
function weaponPointToSpine(parts, local, out) {
  return out.copy(local).applyMatrix4(parts.weaponGroup.matrix)
    .applyMatrix4(parts.hold.matrix).applyMatrix4(parts.aim.matrix);
}

// input: { speed, fwd, side, vy, pitch, crouch, grappling }
function animateCharacter(model, dt, input) {
  const p = model.parts;
  const a = model.anim;
  if (!p.weaponGroup) return;
  a.t += dt;
  a.pitch = input.pitch;
  a.crouch = input.crouch;

  // Estados de locomoção suavizados
  const airborne = input.grappling || Math.abs(input.vy) > 1.6;
  a.air = charDamp(a.air, airborne ? 1 : 0, 9, dt);
  const sliding = !airborne && a.crouch > 0.5 && input.speed > 9;
  a.slide = charDamp(a.slide, sliding ? 1 : 0, 10, dt);
  a.fwd = charDamp(a.fwd, input.fwd, 10, dt);
  a.side = charDamp(a.side, input.side, 10, dt);
  const speed = Math.hypot(a.fwd, a.side);
  const ground = (1 - a.air) * (1 - a.slide);
  const amt = Math.min(speed / 7, 1) * ground;
  if (speed > 0.25) a.stride += dt * (3 + speed * 1.45);
  const dirF = speed > 0.25 ? a.fwd / speed : 1;
  const dirS = speed > 0.25 ? a.side / speed : 0;
  const s = Math.sin(a.stride);
  const cs = Math.cos(a.stride);
  const swing = s * (0.45 + Math.min(speed / 10, 1) * 0.25) * amt;

  // --- Pernas: passada (frente/trás e de lado), agachar, pulo e slide ---
  const c = a.crouch * (1 - a.slide);
  let tL = swing * dirF + c * 1.15;
  let tR = -swing * dirF + c * 1.15;
  let kL = -(Math.max(0, cs) * 1.1 * amt + c * 2.05);
  let kR = -(Math.max(0, -cs) * 1.1 * amt + c * 2.05);
  tL = charLerp(tL, 0.95, a.air); kL = charLerp(kL, -1.5, a.air);
  tR = charLerp(tR, 0.15, a.air); kR = charLerp(kR, -0.7, a.air);
  tL = charLerp(tL, 0.4, a.slide); kL = charLerp(kL, -1.9, a.slide);
  tR = charLerp(tR, 1.4, a.slide); kR = charLerp(kR, -0.1, a.slide);
  p.legL.thigh.rotation.set(tL, 0, -swing * dirS * 0.55 - 0.03);
  p.legR.thigh.rotation.set(tR, 0, swing * dirS * 0.55 + 0.03);
  p.legL.knee.rotation.x = kL;
  p.legR.knee.rotation.x = kR;

  // Quadril desce o quanto as pernas dobraram (pés ficam no chão)
  const fullLeg = CHAR.thigh + CHAR.shin + 0.04;
  const reach = Math.max(legReach(tL, kL), legReach(tR, kR));
  const drop = (fullLeg - reach) * (1 - a.air * 0.7);
  p.pelvis.position.y = CHAR.hipY - drop;
  p.pelvis.rotation.y = -s * 0.1 * amt;

  // --- Tronco: inclina com a corrida, agacha, slide, respira ---
  const pose = HOLD_POSES[p.holdClass];
  a.flinch = charDamp(a.flinch, 0, 9, dt);
  const leanF = THREE.MathUtils.clamp(a.fwd / 10, -0.3, 1) * 0.22 * ground;
  p.spine.rotation.x = -leanF - c * 0.22 + a.pitch * 0.3 + a.slide * 0.3 - a.flinch * 0.25;
  p.spine.rotation.z = -a.side / 10 * 0.12 * ground + s * 0.03 * amt;
  p.spine.rotation.y = pose.twist + s * 0.08 * amt;
  p.spine.position.y = CHAR.spineY + Math.sin(a.t * 2.1) * 0.005;
  p.head.rotation.x = a.pitch * 0.55 - p.spine.rotation.x * 0.3;
  p.head.rotation.y = -p.spine.rotation.y * 0.8;

  // A mira compensa o tronco: a arma aponta para onde o jogador olha
  p.aim.rotation.y = -p.spine.rotation.y;
  p.aim.rotation.x = a.pitch - p.spine.rotation.x;
  p.aim.rotation.z = -p.spine.rotation.z * 0.6;

  // --- Arma na mão: pose base + balanço + recuo + sacar + recarga + faca ---
  const h = p.hold;
  h.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  h.rotation.set(0, 0, 0);
  h.position.y += Math.sin(a.stride * 2) * 0.012 * amt + Math.sin(a.t * 2.1) * 0.004;
  h.position.x += s * 0.012 * amt;
  h.rotation.z = Math.sin(a.t * 1.3) * 0.015 + s * 0.04 * amt;

  // Correndo rápido (sem atirar) a arma baixa um pouco
  a.recoil = charDamp(a.recoil, 0, 12, dt);
  const lowReady = Math.min(Math.max(speed - 7.5, 0) / 5, 1) * ground * (1 - Math.min(a.recoil * 8, 1));
  if (p.holdClass !== 'knife') {
    h.rotation.x -= lowReady * 0.35 + a.slide * 0.15;
    h.rotation.y += lowReady * 0.25;
  }

  // Recuo do disparo
  h.position.z += a.recoil * 0.13;
  h.rotation.x += a.recoil * 0.55;

  // Sacar arma (troca)
  if (a.drawT < 1) {
    a.drawT = Math.min(a.drawT + dt / 0.35, 1);
    const e = 1 - charEaseOut(a.drawT);
    h.position.y -= e * 0.35;
    h.rotation.x -= e * 1.1;
    h.rotation.z += e * 0.5;
  }

  // Recarga: inclina a arma; a mão esquerda vai ao pente, ao cinto e volta
  let reloadHand = 0; // 0 = guarda-mão, 1 = pente, 2 = cinto
  if (a.reloadT < 1) {
    a.reloadT = Math.min(a.reloadT + dt * 1000 / a.reloadDur, 1);
    const r = a.reloadT;
    const tilt = r < 0.15 ? charEaseInOut(r / 0.15) : r > 0.85 ? charEaseInOut((1 - r) / 0.15) : 1;
    h.rotation.z += tilt * 0.6;
    h.rotation.x += tilt * 0.08;
    h.position.y -= tilt * 0.04;
    if (r < 0.15) reloadHand = r / 0.15;
    else if (r < 0.32) reloadHand = 1 + charEaseInOut((r - 0.15) / 0.17);
    else if (r < 0.5) reloadHand = 2;
    else if (r < 0.68) reloadHand = 2 - charEaseInOut((r - 0.5) / 0.18);
    else if (r < 0.85) reloadHand = 1 - charEaseInOut((r - 0.68) / 0.17);
    if (r > 0.6 && r < 0.72) h.position.y += Math.sin((r - 0.6) / 0.12 * Math.PI) * 0.03; // encaixe do pente
  }

  // Faca: guarda com a lâmina para cima; golpe em arco alternando o lado
  if (p.holdClass === 'knife') {
    h.rotation.x = 0.35 + h.rotation.x * 0.3;
    if (a.swingT < 1) {
      a.swingT = Math.min(a.swingT + dt / 0.38, 1);
      const q = a.swingT;
      let side;
      if (q < 0.25) side = charEaseInOut(q / 0.25);
      else if (q < 0.55) side = 1 - 2 * charEaseOut((q - 0.25) / 0.3);
      else side = -1 + charEaseInOut((q - 0.55) / 0.45);
      const reachOut = Math.sin(Math.min(q / 0.55, 1) * Math.PI);
      h.position.x += side * 0.22 * a.swingDir - 0.08;
      h.position.y += 0.12 * reachOut;
      h.position.z -= 0.18 * reachOut;
      h.rotation.y = -side * 0.9 * a.swingDir;
      h.rotation.z = side * 0.7 * a.swingDir;
      p.spine.rotation.y += -side * 0.3 * a.swingDir;
      p.aim.rotation.y = -p.spine.rotation.y + side * 0.15 * a.swingDir;
    }
  }

  // --- IK dos braços ---
  p.aim.updateMatrix();
  h.updateMatrix();
  p.weaponGroup.updateMatrix();
  _aShoulderR.set(CHAR.shoulderX, CHAR.shoulderY + 0.01, 0.0);
  _aShoulderL.set(-CHAR.shoulderX, CHAR.shoulderY + 0.01, 0.0);
  weaponPointToSpine(p, p.weaponInfo.grip, _aTargetR);

  if (p.holdClass === 'knife') {
    _aTargetL.copy(KNIFE_GUARD);
    _aTargetL.y += Math.sin(a.t * 2.1) * 0.006 + Math.sin(a.stride * 2) * 0.02 * amt;
    _aTargetL.applyMatrix4(p.aim.matrix);
  } else {
    _aTmp.copy(p.weaponInfo.support);
    _aTmp.z *= pose.supportZ;
    weaponPointToSpine(p, _aTmp, _aTargetL);
    if (reloadHand > 0) {
      weaponPointToSpine(p, _reloadMag, _aMag);
      if (reloadHand <= 1) _aTargetL.lerp(_aMag, reloadHand);
      else _aTargetL.copy(_aMag).lerp(_aTmp.copy(RELOAD_POUCH).applyMatrix4(p.aim.matrix), reloadHand - 1);
    }
  }
  solveArmIK(p.upperR, p.foreR, _aShoulderR, _aTargetR, POLE_R);
  solveArmIK(p.upperL, p.foreL, _aShoulderL, _aTargetL, POLE_L);
}

// Disparos/eventos vindos da rede
function characterOnShot(model, melee) {
  if (melee) {
    model.anim.swingT = 0;
    model.anim.swingDir = -model.anim.swingDir;
  } else {
    model.anim.recoil = 0.22;
  }
}

function characterOnReload(model, duration) {
  if (model.parts.holdClass === 'knife' || model.parts.holdClass === 'grapple') return;
  model.anim.reloadT = 0;
  model.anim.reloadDur = Math.max(300, duration || 2000);
}

function characterOnHit(model) {
  model.anim.flinch = 1;
}

// -----------------------------------------------------------------------------
// PRÉVIA 3D DA CUSTOMIZAÇÃO (só roda com a tela aberta)
// -----------------------------------------------------------------------------
function createCharacterPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3b4252, 0.95));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sun.position.set(2, 4, -3);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.5);
  rim.position.set(-3, 2, 3);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

  const state = {
    model: null, character: null, weapon: 'rifle', pose: 'parado',
    yaw: 0.5, dragging: false, lastX: 0, running: false, raf: 0, last: 0, eventT: 0,
  };

  const rebuild = () => {
    if (state.model) {
      scene.remove(state.model.group);
      state.model.group.traverse((o) => {
        if (o.userData.shared) return;
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    state.model = buildCharacter(state.character);
    state.model.setWeapon(state.weapon);
    scene.add(state.model.group);
  };

  const resize = () => {
    const w = canvas.clientWidth || 280;
    const hgt = canvas.clientHeight || 360;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  };

  const frame = (now) => {
    if (!state.running) return;
    state.raf = requestAnimationFrame(frame);
    const dt = Math.min((now - state.last) / 1000 || 0.016, 0.05);
    state.last = now;
    const m = state.model;
    if (!m) return;
    if (!state.dragging && !state.lockYaw) state.yaw += dt * 0.35;
    m.group.rotation.y = state.yaw;

    const input = { speed: 0, fwd: 0, side: 0, vy: 0, pitch: Math.sin(now / 1400) * 0.12, crouch: 0, grappling: false };
    state.eventT += dt;
    if (state.pose === 'correndo') { input.speed = 8.4; input.fwd = 8.4; }
    if (state.pose === 'agachado') { input.crouch = 1; input.speed = 2.5; input.fwd = 2.5; }
    if (state.pose === 'atirando' && state.eventT > 0.16) { state.eventT = 0; characterOnShot(m, m.parts.holdClass === 'knife'); }
    if (state.pose === 'recarregando' && state.eventT > 2.6) { state.eventT = 0; characterOnReload(m, 2000); }
    animateCharacter(m, dt, input);

    camera.position.set(0, 1.3, -4.6);
    camera.lookAt(0, 0.98, 0);
    renderer.render(scene, camera);
  };

  canvas.addEventListener('pointerdown', (e) => { state.dragging = true; state.lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.yaw += (e.clientX - state.lastX) * 0.012;
    state.lastX = e.clientX;
  });
  const endDrag = () => { state.dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  return {
    setCharacter(character) { state.character = sanitizeCharacter(character); rebuild(); },
    setWeapon(key) { state.weapon = key; if (state.model) state.model.setWeapon(key); },
    setPose(pose) { state.pose = pose; state.eventT = 10; },
    // Ângulo fixo (null volta a girar sozinho)
    setYaw(yaw) { state.lockYaw = yaw !== null; if (yaw !== null) state.yaw = yaw; },
    start() {
      if (state.running) return;
      state.running = true;
      resize();
      state.last = performance.now();
      state.raf = requestAnimationFrame(frame);
    },
    stop() { state.running = false; cancelAnimationFrame(state.raf); },
    // Avança a animação manualmente (útil quando a aba está em segundo plano)
    step(dt = 1 / 60) {
      const now = performance.now();
      state.last = now - dt * 1000;
      const was = state.running;
      state.running = true;
      frame(now);
      cancelAnimationFrame(state.raf);
      state.running = was;
      if (was) state.raf = requestAnimationFrame(frame);
    },
  };
}
