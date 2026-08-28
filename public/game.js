// =============================================================================
// ESTADO GLOBAL
// =============================================================================
let scene, camera, renderer, controls;
let obstacles = [];
let mapBounds = 27;
let socket;
let myId = null;
let joined = false;

const remotePlayers = {}; // id -> { group, head, body, targetPos, data }
const nameTagsDiv = document.createElement('div');
nameTagsDiv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;';
document.body.appendChild(nameTagsDiv);

let myLoadout = [];
let myWeaponKey = null;
let myAmmo = {};
let myHealth = 100;
let myAlive = false;
let reloading = false;
let viewModel;
let weaponModel;
let leftArmPivot;
let rightArmPivot;
let weaponKick = 0;
let voteTimerInterval = null;

let gameStatus = 'playing';
let currentMapId = 'arena';

const clock = new THREE.Clock();

// =============================================================================
// TELA DE LOADOUT
// =============================================================================
const weaponPickerEl = document.getElementById('weaponPicker');
const selectedWeapons = [];

WEAPON_CHOICES.forEach((key) => {
  const w = WEAPONS[key];
  const div = document.createElement('div');
  div.className = 'weaponOption';
  div.dataset.key = key;
  const ammoText = w.maxAmmo === Infinity ? '∞' : w.maxAmmo;
  div.innerHTML = `<div class="wName">${w.name}</div><div class="wStat">Munição: ${ammoText}</div>`;
  div.addEventListener('click', () => toggleWeaponSelect(key, div));
  weaponPickerEl.appendChild(div);
});

function toggleWeaponSelect(key, div) {
  const idx = selectedWeapons.indexOf(key);
  if (idx >= 0) {
    selectedWeapons.splice(idx, 1);
    div.classList.remove('selected');
  } else {
    if (selectedWeapons.length >= 2) return;
    selectedWeapons.push(key);
    div.classList.add('selected');
  }
  document.getElementById('joinBtn').disabled = selectedWeapons.length !== 2;
}

document.getElementById('joinBtn').addEventListener('click', () => {
  myLoadout = [...selectedWeapons];
  const name = document.getElementById('nameInput').value.trim() || 'Jogador';
  initThree();
  connectSocket(name);
  document.getElementById('loadoutScreen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
});

function setInviteUrl(url) {
  const inviteUrlEl = document.getElementById('inviteUrl');
  const copyButton = document.getElementById('copyInviteBtn');
  inviteUrlEl.textContent = url;
  copyButton.dataset.url = url;
}

document.getElementById('copyInviteBtn').addEventListener('click', async () => {
  const button = document.getElementById('copyInviteBtn');
  try {
    await navigator.clipboard.writeText(button.dataset.url || window.location.origin);
    button.textContent = 'Endereço copiado!';
  } catch (e) {
    button.textContent = 'Copie o endereço acima';
  }
});

fetch('/server-info')
  .then((response) => response.json())
  .then((info) => setInviteUrl(info.inviteUrl))
  .catch(() => setInviteUrl(window.location.origin));

// =============================================================================
// THREE.JS SETUP
// =============================================================================
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 25, 90);

  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 1000);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(20, 30, 10);
  scene.add(dirLight);

  controls = new THREE.PointerLockControls(camera, document.body);
  createViewModel();
  controls.addEventListener('unlock', () => { aimHeld = false; });
  document.body.addEventListener('click', () => {
    if (gameStatus === 'playing' && myAlive) controls.lock();
  });

  loadMap(currentMapId);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

function loadMap(mapId) {
  // limpa objetos antigos (exceto luzes) e reconstrói
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj === camera) continue;
    scene.remove(obj);
  }
  for (const id in remotePlayers) scene.remove(remotePlayers[id].group);

  const built = MAP_BUILDERS[mapId](scene);
  obstacles = built.obstacles;
  mapBounds = built.bounds;
  currentMapId = mapId;
  document.getElementById('mapName').textContent = (MAP_NAMES[mapId] || mapId);

  // recria meshes dos players remotos na nova cena
  for (const id in remotePlayers) {
    scene.add(remotePlayers[id].group);
  }
}

const MAP_NAMES = { arena: 'Arena Clássica', cidade: 'Cidade Pequena', deserto: 'Dunas do Deserto' };

// =============================================================================
// MODELO EM PRIMEIRA PESSOA (braços e arma low-poly)
// =============================================================================
function createViewModel() {
  viewModel = new THREE.Group();
  camera.add(viewModel);

  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x26364a, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd59b72, roughness: 0.9 });
  const upperArmGeo = new THREE.BoxGeometry(0.2, 0.33, 0.21);
  const forearmGeo = new THREE.BoxGeometry(0.17, 0.38, 0.18);
  const handGeo = new THREE.BoxGeometry(0.2, 0.16, 0.24);
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.31, -0.3, -0.5);
    const upper = new THREE.Mesh(upperArmGeo, sleeveMat);
    upper.position.set(0, -0.16, 0);
    const forearm = new THREE.Mesh(forearmGeo, sleeveMat);
    forearm.position.set(side * -0.09, -0.47, -0.14);
    forearm.rotation.z = side * 0.25;
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(side * -0.13, -0.67, -0.22);
    hand.rotation.z = side * 0.2;
    pivot.add(upper, forearm, hand);
    viewModel.add(pivot);
    return pivot;
  };
  leftArmPivot = makeArm(-1);
  rightArmPivot = makeArm(1);
  updateWeaponModel();
}

function updateWeaponModel() {
  if (!viewModel) return;
  if (weaponModel) viewModel.remove(weaponModel);
  weaponModel = new THREE.Group();
  const w = WEAPONS[myWeaponKey] || WEAPONS.smg;
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.65 });
  const accentMat = new THREE.MeshStandardMaterial({ color: w.color || 0xaaaaaa, roughness: 0.45 });
  const addPart = (geometry, material, x, y, z) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    weaponModel.add(part);
    return part;
  };

  if (myWeaponKey === 'knife') {
    addPart(new THREE.BoxGeometry(0.07, 0.08, 0.64), accentMat, 0.27, -0.47, -0.92);
    addPart(new THREE.BoxGeometry(0.13, 0.11, 0.25), darkMat, 0.27, -0.47, -0.57);
  } else if (myWeaponKey === 'sniper') {
    addPart(new THREE.BoxGeometry(0.23, 0.2, 0.74), darkMat, 0.27, -0.44, -0.86);
    addPart(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 8), accentMat, 0.27, -0.43, -1.45).rotation.x = Math.PI / 2;
    addPart(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 8), darkMat, 0.27, -0.29, -0.95).rotation.x = Math.PI / 2;
  } else if (myWeaponKey === 'grapple') {
    addPart(new THREE.BoxGeometry(0.28, 0.27, 0.38), darkMat, 0.27, -0.45, -0.76);
    addPart(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8), accentMat, 0.27, -0.43, -1.06).rotation.x = Math.PI / 2;
  } else {
    const isPistol = myWeaponKey === 'pistol';
    addPart(new THREE.BoxGeometry(isPistol ? 0.18 : 0.28, 0.2, isPistol ? 0.38 : 0.62), darkMat, 0.27, -0.44, -0.82);
    addPart(new THREE.BoxGeometry(0.13, 0.24, 0.2), accentMat, 0.27, -0.57, -0.68).rotation.x = -0.2;
    addPart(new THREE.CylinderGeometry(0.045, 0.045, isPistol ? 0.24 : 0.42, 8), accentMat, 0.27, -0.43, isPistol ? -1.08 : -1.28).rotation.x = Math.PI / 2;
  }
  viewModel.add(weaponModel);
}

// =============================================================================
// PLAYER MESH (estilo Minecraft: caixas)
// =============================================================================
function colorFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return new THREE.Color(`hsl(${Math.abs(hash) % 360}, 70%, 55%)`);
}

function buildPlayerMesh(color) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.15, 0.4),
    new THREE.MeshStandardMaterial({ color })
  );
  body.position.y = 0.95;
  body.userData.isHead = false;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, 0.08) })
  );
  head.position.y = 1.75;
  head.userData.isHead = true;
  group.add(head);

  // "braços" simples
  const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
  const armMat = new THREE.MeshStandardMaterial({ color });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.5, 0.9, 0);
  armL.userData.isHead = false;
  const armR = armL.clone();
  armR.position.set(0.5, 0.9, 0);
  armR.userData.isHead = false;
  group.add(armL, armR);

  return group;
}

function addRemotePlayer(p) {
  if (remotePlayers[p.id]) return;
  const group = buildPlayerMesh(colorFromId(p.id));
  group.position.set(p.x || 0, 0, p.z || 0);
  scene.add(group);
  remotePlayers[p.id] = { group, targetPos: new THREE.Vector3(p.x, 0, p.z), targetRotY: 0, data: p };
}

function removeRemotePlayer(id) {
  if (remotePlayers[id]) {
    scene.remove(remotePlayers[id].group);
    delete remotePlayers[id];
  }
}

// =============================================================================
// REDE
// =============================================================================
function connectSocket(name) {
  // WebSocket é preferido; se a rede não permitir, Socket.IO usa HTTP polling.
  socket = io({ transports: ['websocket', 'polling'], upgrade: true });

  const updateNetworkStatus = () => {
    const transport = socket.io.engine.transport.name;
    const status = document.getElementById('networkStatus');
    status.textContent = transport === 'websocket' ? 'WebSocket' : 'HTTP polling';
    status.className = transport;
  };

  socket.on('connect', () => {
    updateNetworkStatus();
    socket.io.engine.on('upgrade', updateNetworkStatus);
  });
  socket.on('disconnect', () => {
    const status = document.getElementById('networkStatus');
    status.textContent = 'Reconectando...';
    status.className = '';
  });

  socket.on('gameInfo', (info) => {
    gameStatus = info.status;
    if (info.currentMap) currentMapId = info.currentMap;
    if (info.status === 'playing') updateTimerHUD(info.timeLeft);
    if (info.inviteUrl) setInviteUrl(info.inviteUrl);
  });

  socket.on('init', (data) => {
    myId = data.id;
    if (data.game) {
      gameStatus = data.game.status;
      if (data.game.currentMap !== currentMapId) loadMap(data.game.currentMap);
    }
    for (const id in data.players) {
      if (id === myId) continue;
      addRemotePlayer(data.players[id]);
    }
    const me = data.players[myId];
    if (me) {
      myWeaponKey = me.weaponKey;
      myAmmo = me.ammo || {};
      myHealth = me.health;
      myAlive = !!me.alive;
      if (myAlive) {
        camera.position.set(me.x, me.y, me.z);
      }
      updateWeaponModel();
    }
    joined = true;
    updateWeaponHUD();
    updateHealthHUD();
  });

  socket.on('playerJoined', (p) => {
    if (p.id === myId) return;
    addRemotePlayer({ id: p.id, x: 0, z: 0 });
  });

  socket.on('playerLeft', (id) => removeRemotePlayer(id));

  socket.on('state', (snapshot) => {
    for (const id in snapshot) {
      if (id === myId) continue;
      if (!remotePlayers[id]) addRemotePlayer(snapshot[id]);
      const rp = remotePlayers[id];
      rp.targetPos.set(snapshot[id].x, 0, snapshot[id].z);
      rp.targetRotY = snapshot[id].rotY;
      rp.data = snapshot[id];
      rp.group.visible = snapshot[id].alive;
    }
    updateScoreboardMini(snapshot);
  });

  socket.on('ammoUpdate', ({ ammo }) => {
    myAmmo = ammo;
    reloading = false;
    updateWeaponHUD();
  });

  socket.on('playerDamaged', ({ id, health }) => {
    if (id === myId) {
      myHealth = health;
      updateHealthHUD();
    }
    if (id === lastShotTargetId) showHitmarker(false);
  });

  socket.on('playerDied', ({ id, killerId }) => {
    if (id === myId) {
      myAlive = false;
      controls.unlock();
    }
    if (id === lastShotTargetId && killerId === myId) showHitmarker(true);
  });

  socket.on('respawned', ({ x, y, z, ammo, weaponKey, health }) => {
    myAlive = true;
    myAmmo = ammo;
    myWeaponKey = weaponKey;
    myHealth = health !== undefined ? health : 100;
    camera.position.set(x, y, z);
    updateWeaponHUD();
    updateWeaponModel();
    updateHealthHUD();
  });

  socket.on('killFeed', ({ killerName, victimName, weapon, headshot }) => {
    addKillFeed(`${killerName} ${headshot ? '💀(headshot)' : ''} eliminou ${victimName} — ${weapon}`);
  });

  socket.on('grappleUsed', ({ id, x, y, z }) => {
    if (remotePlayers[id]) drawGrappleLine(remotePlayers[id].group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(x, y, z));
  });

  socket.on('matchTime', ({ timeLeft }) => updateTimerHUD(timeLeft));

  socket.on('matchStarted', ({ mapId, mapName, duration }) => {
    gameStatus = 'playing';
    loadMap(mapId);
    updateTimerHUD(duration);
    document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('voteScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  });

  socket.on('matchEnded', ({ scoreboard }) => {
    gameStatus = 'ended';
    controls.unlock();
    const body = document.getElementById('finalScoreBody');
    body.innerHTML = scoreboard
      .map((p) => `<tr><td>${p.name}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`)
      .join('');
    document.getElementById('endScreen').classList.remove('hidden');
  });

  socket.on('voteStart', ({ options, duration }) => {
    gameStatus = 'voting';
    document.getElementById('endScreen').classList.add('hidden');
    const optWrap = document.getElementById('voteOptions');
    optWrap.innerHTML = '';
    options.forEach((opt) => {
      const div = document.createElement('div');
      div.className = 'voteOption';
      div.innerHTML = `<span>${opt.name}</span><span>Votar</span>`;
      div.addEventListener('click', () => {
        socket.emit('vote', { mapId: opt.id });
        [...optWrap.children].forEach((c) => c.classList.remove('voted'));
        div.classList.add('voted');
      });
      optWrap.appendChild(div);
    });
    document.getElementById('voteScreen').classList.remove('hidden');
    if (voteTimerInterval) clearInterval(voteTimerInterval);
    let t = duration;
    const timerEl = document.getElementById('voteTimer');
    timerEl.textContent = `Votação encerra em ${t}s`;
    voteTimerInterval = setInterval(() => {
      t -= 1;
      timerEl.textContent = `Votação encerra em ${Math.max(t, 0)}s`;
      if (t <= 0) clearInterval(voteTimerInterval);
    }, 1000);
  });

  socket.on('voteTime', ({ timeLeft }) => {
    document.getElementById('voteTimer').textContent = `Votação encerra em ${Math.max(timeLeft, 0)}s`;
  });

  socket.emit('join', { name, loadout: myLoadout });
}

// =============================================================================
// HUD
// =============================================================================
function updateHealthHUD() {
  document.getElementById('healthFill').style.width = `${Math.max(myHealth, 0)}%`;
  document.getElementById('healthText').textContent = Math.max(myHealth, 0);
}

function updateWeaponHUD() {
  const w = WEAPONS[myWeaponKey];
  if (!w) return;
  document.getElementById('weaponName').textContent = w.name;
  const ammo = myAmmo[myWeaponKey];
  document.getElementById('ammoCount').textContent =
    reloading ? 'recarregando...' : (ammo === -1 || ammo === Infinity ? '∞' : ammo);
}

function updateTimerHUD(timeLeft) {
  const m = Math.max(Math.floor(timeLeft / 60), 0);
  const s = Math.max(timeLeft % 60, 0);
  document.getElementById('timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

function addKillFeed(text) {
  const el = document.createElement('div');
  el.textContent = text;
  document.getElementById('killfeed').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

let hitmarkerTimeout = null;
function showHitmarker(headshot) {
  const hm = document.getElementById('hitmarker');
  hm.classList.remove('show', 'headshot');
  void hm.offsetWidth; // reflow pra reiniciar animação
  hm.classList.add('show');
  if (headshot) hm.classList.add('headshot');
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => hm.classList.remove('show', 'headshot'), 250);
}

function updateScoreboardMini(snapshot) {
  const box = document.getElementById('scoreRowsMini');
  const rows = Object.values(snapshot)
    .sort((a, b) => (b.kills || 0) - (a.kills || 0))
    .map((p) => `<div class="scoreRow"><span>${p.name}${p.id === myId ? ' (você)' : ''}</span><span>${p.kills || 0}/${p.deaths || 0}</span></div>`)
    .join('');
  box.innerHTML = rows;
}

let tabHeld = false;
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); tabHeld = true; document.getElementById('scoreboardMini').classList.add('show'); }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') { tabHeld = false; document.getElementById('scoreboardMini').classList.remove('show'); }
});

function drawGrappleLine(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0x22cc88 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  setTimeout(() => scene.remove(line), 180);
}

// =============================================================================
// INPUT / MOVIMENTO (com bunny hop estilo Krunker)
// =============================================================================
const move = { forward: false, back: false, left: false, right: false, jumpHeld: false };
const velocity = new THREE.Vector3();
let onGround = true;
const PLAYER_HEIGHT = 1.6;

const GROUND_SPEED = 7.2;
const AIR_SPEED_CAP = 0.9;
const GROUND_ACCEL = 14;
const AIR_ACCEL = 70;
const FRICTION = 6.5;
const JUMP_FORCE = 7.2;
const GRAVITY = -20;

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': move.forward = true; break;
    case 'KeyS': move.back = true; break;
    case 'KeyA': move.left = true; break;
    case 'KeyD': move.right = true; break;
    case 'Space': move.jumpHeld = true; break;
    case 'KeyR': tryReload(); break;
    case 'Digit1': trySwitchWeapon(0); break;
    case 'Digit2': trySwitchWeapon(1); break;
    case 'Digit3': trySwitchWeapon('knife'); break;
    case 'KeyG': tryGrappleSwitch(); break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': move.forward = false; break;
    case 'KeyS': move.back = false; break;
    case 'KeyA': move.left = false; break;
    case 'KeyD': move.right = false; break;
    case 'Space': move.jumpHeld = false; break;
  }
});

function trySwitchWeapon(slot) {
  if (!myAlive) return;
  const key = slot === 'knife' ? 'knife' : myLoadout[slot];
  if (!key) return;
  myWeaponKey = key;
  socket.emit('switchWeapon', { key });
  updateWeaponHUD();
  updateWeaponModel();
}

function tryGrappleSwitch() {
  const idx = myLoadout.indexOf('grapple');
  if (idx >= 0) trySwitchWeapon(idx);
}

function tryReload() {
  if (!myAlive) return;
  const w = WEAPONS[myWeaponKey];
  if (!w || w.maxAmmo === Infinity) return;
  reloading = true;
  updateWeaponHUD();
  socket.emit('reload');
}

function accelerate(wishdir, wishspeed, accel, dt) {
  const currentSpeed = velocity.dot(wishdir);
  const addSpeed = wishspeed - currentSpeed;
  if (addSpeed <= 0) return;
  let accelSpeed = accel * dt * wishspeed;
  if (accelSpeed > addSpeed) accelSpeed = addSpeed;
  velocity.x += accelSpeed * wishdir.x;
  velocity.z += accelSpeed * wishdir.z;
}

function collidesWithObstacles(pos) {
  for (const box of obstacles) {
    const bbox = new THREE.Box3().setFromObject(box);
    bbox.expandByScalar(0.35);
    if (pos.x > bbox.min.x && pos.x < bbox.max.x && pos.z > bbox.min.z && pos.z < bbox.max.z) {
      // permite ficar em cima se estiver mais alto que o topo da caixa
      if (pos.y >= bbox.max.y - 0.2) continue;
      return true;
    }
  }
  return false;
}

function groundHeightAt(pos) {
  let h = 0;
  for (const box of obstacles) {
    const bbox = new THREE.Box3().setFromObject(box);
    if (pos.x > bbox.min.x && pos.x < bbox.max.x && pos.z > bbox.min.z && pos.z < bbox.max.z) {
      if (bbox.max.y > h && bbox.max.y <= pos.y + 0.3) h = bbox.max.y;
    }
  }
  return h;
}

function updateMovement(dt) {
  const forwardVec = new THREE.Vector3();
  camera.getWorldDirection(forwardVec);
  forwardVec.y = 0;
  forwardVec.normalize();
  // W/S seguem a mira; A desloca à esquerda e D à direita.
  const rightVec = new THREE.Vector3().crossVectors(forwardVec, new THREE.Vector3(0, 1, 0));

  const wish = new THREE.Vector3();
  if (move.forward) wish.add(forwardVec);
  if (move.back) wish.sub(forwardVec);
  if (move.right) wish.add(rightVec);
  if (move.left) wish.sub(rightVec);
  if (wish.lengthSq() > 0) wish.normalize();

  if (onGround) {
    // fricção
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0) {
      const drop = speed * FRICTION * dt;
      const newSpeed = Math.max(speed - drop, 0);
      const scale = newSpeed / speed;
      velocity.x *= scale;
      velocity.z *= scale;
    }
    accelerate(wish, GROUND_SPEED, GROUND_ACCEL, dt);

    // auto bunny hop: segurando espaço, pula assim que toca o chão
    if (move.jumpHeld) {
      velocity.y = JUMP_FORCE;
      onGround = false;
    }
  } else {
    // no ar: aceleração de estilo quake permite ganhar velocidade fazendo strafe
    accelerate(wish, AIR_SPEED_CAP, AIR_ACCEL, dt);
  }

  velocity.y += GRAVITY * dt;

  const nextPos = camera.position.clone();
  nextPos.x += velocity.x * dt;
  nextPos.z += velocity.z * dt;

  nextPos.x = THREE.MathUtils.clamp(nextPos.x, -mapBounds, mapBounds);
  nextPos.z = THREE.MathUtils.clamp(nextPos.z, -mapBounds, mapBounds);

  if (!collidesWithObstacles(new THREE.Vector3(nextPos.x, camera.position.y, camera.position.z))) {
    camera.position.x = nextPos.x;
  } else { velocity.x = 0; }
  if (!collidesWithObstacles(new THREE.Vector3(camera.position.x, camera.position.y, nextPos.z))) {
    camera.position.z = nextPos.z;
  } else { velocity.z = 0; }

  camera.position.y += velocity.y * dt;
  const floor = groundHeightAt(camera.position) + PLAYER_HEIGHT;
  if (camera.position.y <= floor) {
    camera.position.y = floor;
    velocity.y = 0;
    onGround = true;
  } else {
    onGround = false;
  }

  socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, rotY: camera.rotation.y });
}

// =============================================================================
// TIRO / GANCHO
// =============================================================================
const raycaster = new THREE.Raycaster();
let mouseHeld = false;
let aimHeld = false;
let lastLocalShot = 0;
let lastShotTargetId = null;

document.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    if (controls.isLocked && myAlive && !WEAPONS[myWeaponKey].isMelee && !WEAPONS[myWeaponKey].isUtility) aimHeld = true;
    return;
  }
  if (e.button !== 0 || !controls.isLocked || !myAlive) return;
  mouseHeld = true;
  attemptAction();
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseHeld = false;
  if (e.button === 2) aimHeld = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

function updateAim(dt) {
  if (!camera || !viewModel) return;
  const weapon = WEAPONS[myWeaponKey];
  const canAim = aimHeld && controls.isLocked && myAlive && weapon && !weapon.isMelee && !weapon.isUtility;
  const targetFov = canAim ? (myWeaponKey === 'sniper' ? 35 : 58) : 78;
  const targetX = canAim ? -0.25 : 0;
  const targetY = canAim ? 0.12 : 0;
  const targetZ = canAim ? 0.1 : 0;
  camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 16, dt);
  camera.updateProjectionMatrix();
  viewModel.position.x = THREE.MathUtils.damp(viewModel.position.x, targetX, 18, dt);
  viewModel.position.y = THREE.MathUtils.damp(viewModel.position.y, targetY, 18, dt);
  viewModel.position.z = THREE.MathUtils.damp(viewModel.position.z, targetZ, 18, dt);
  document.getElementById('crosshair').classList.toggle('aiming', canAim);
}

function updateViewModel(dt) {
  if (!viewModel || !weaponModel) return;
  const speed = Math.hypot(velocity.x, velocity.z);
  const walking = Math.min(speed / GROUND_SPEED, 1);
  const time = performance.now() * 0.008;
  const bobX = Math.sin(time) * 0.018 * walking;
  const bobY = Math.abs(Math.cos(time)) * 0.018 * walking;
  const aiming = aimHeld && WEAPONS[myWeaponKey] && !WEAPONS[myWeaponKey].isMelee && !WEAPONS[myWeaponKey].isUtility;
  if (leftArmPivot) {
    leftArmPivot.rotation.z = -0.34 - bobX * 5 + (aiming ? 0.12 : 0);
    leftArmPivot.rotation.x = -0.12 + bobY * 3;
  }
  if (rightArmPivot) {
    rightArmPivot.rotation.z = 0.3 + bobX * 5 - (aiming ? 0.08 : 0);
    rightArmPivot.rotation.x = -0.08 - bobY * 3;
  }
  weaponKick = THREE.MathUtils.damp(weaponKick, 0, 20, dt);
  weaponModel.position.y = bobY;
  weaponModel.position.x = bobX;
  weaponModel.position.z = weaponKick;
  weaponModel.rotation.z = -bobX * 1.4;
}

function attemptAction() {
  const w = WEAPONS[myWeaponKey];
  if (!w) return;
  const now = performance.now();
  if (now - lastLocalShot < w.fireRate) return;
  lastLocalShot = now;
  weaponKick = 0.07;

  if (w.isUtility) { doGrapple(); return; }
  doShoot(w);
}

function doShoot(w) {
  if (w.maxAmmo !== Infinity && myAmmo[myWeaponKey] <= 0) return;
  if (reloading) return;

  const dir = camera.getWorldDirection(new THREE.Vector3());
  raycaster.set(camera.position, dir);
  raycaster.far = w.isMelee ? 3 : 200;

  const targets = [];
  const meshToId = new Map();
  for (const id in remotePlayers) {
    remotePlayers[id].group.children.forEach((child) => {
      targets.push(child);
      meshToId.set(child, id);
    });
  }

  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length > 0) {
    const hit = hits[0];
    const targetId = meshToId.get(hit.object);
    const isHead = !!hit.object.userData.isHead;
    lastShotTargetId = targetId;
    socket.emit('shoot', { targetId, isHead });
  }

  // feedback visual otimista de munição (servidor corrige via ammoUpdate)
  if (myAmmo[myWeaponKey] !== undefined && myAmmo[myWeaponKey] !== -1) {
    myAmmo[myWeaponKey] = Math.max(myAmmo[myWeaponKey] - 1, 0);
    updateWeaponHUD();
  }
  playShotSound(w);
}

function doGrapple() {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  raycaster.set(camera.position, dir);
  raycaster.far = 45;
  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length === 0) return;
  const point = hits[0].point;
  socket.emit('grapple', { x: point.x, y: point.y, z: point.z });

  const pullDir = point.clone().sub(camera.position).normalize();
  const pullStrength = 16;
  velocity.x = pullDir.x * pullStrength;
  velocity.z = pullDir.z * pullStrength;
  velocity.y = Math.max(pullDir.y * pullStrength, 6);
  onGround = false;
}

// auto-fire pra arma automática (metralhadora)
function autoFireLoop() {
  if (mouseHeld && myAlive && controls.isLocked) {
    const w = WEAPONS[myWeaponKey];
    if (w && w.auto) attemptAction();
  }
  requestAnimationFrame(autoFireLoop);
}
autoFireLoop();

// =============================================================================
// SOM PROCEDURAL SIMPLES (Web Audio, sem arquivos externos)
// =============================================================================
let audioCtx = null;
function playShotSound(w) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = w.isMelee ? 'triangle' : 'square';
    osc.frequency.value = w.isMelee ? 220 : (myWeaponKey === 'sniper' ? 90 : 160);
    gain.gain.value = 0.05;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.stop(audioCtx.currentTime + 0.13);
  } catch (e) { /* ignora se autoplay bloqueado */ }
}

// =============================================================================
// LOOP PRINCIPAL
// =============================================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (controls.isLocked && joined && myAlive && gameStatus === 'playing') {
    updateMovement(dt);
  }
  updateAim(dt);
  updateViewModel(dt);
  if (viewModel) viewModel.visible = !!(controls && controls.isLocked && myAlive);

  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    rp.group.position.lerp(rp.targetPos, 0.3);
    rp.group.rotation.y = rp.targetRotY || 0;
  }

  updateNameTags();
  renderer.render(scene, camera);
}

function updateNameTags() {
  nameTagsDiv.innerHTML = '';
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    if (!rp.group.visible) continue;
    const headPos = rp.group.position.clone();
    headPos.y += 2.15;
    const screenPos = headPos.project(camera);
    if (screenPos.z > 1) continue;
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    const tag = document.createElement('div');
    tag.className = 'nameTag';
    tag.style.left = `${x}px`;
    tag.style.top = `${y}px`;
    tag.textContent = rp.data.name || 'Jogador';
    nameTagsDiv.appendChild(tag);
  }
}
