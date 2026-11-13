// =============================================================================
// ESTADO GLOBAL
// =============================================================================
let scene, camera, renderer, hemiLight, sunLight, muzzleLight;
let obstacles = [];
let mapBounds = 38.5;
let socket;
let myId = null;
let joined = false;
let myName = 'Jogador';

const remotePlayers = {}; // id -> { group, parts, hitMeshes, materials, buffer, data, anim, tag, ... }
const nameTagsDiv = document.createElement('div');
nameTagsDiv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;';
document.body.appendChild(nameTagsDiv);

let myLoadout = [];
let myWeaponKey = null;
let lastWeaponKey = null;
let myAmmo = {};
let myHealth = 100;
let myAlive = false;
let mySpawnSeq = 0;        // invalida pacotes de movimento de antes do respawn
let reloading = false;
let reloadStartTime = 0;
let reloadDuration = 0;

let cameraPitch = 0;       // rotação vertical (X), positivo = para cima
let cameraYaw = 0;         // rotação horizontal (Y)
const MAX_PITCH = Math.PI / 2 - 0.03;

let gameStatus = 'waiting';
let currentMapId = 'arena';
let lastScoreboard = [];
let deathFocus = null;     // posição de quem te matou (câmera vira para ele)

const clock = new THREE.Clock();
const UP = new THREE.Vector3(0, 1, 0);

// Altura dos olhos em pé: precisa bater com EYE_HEIGHT em server.js
const PLAYER_HEIGHT = 1.6;
const CROUCH_HEIGHT = 1.05;

// =============================================================================
// CONFIGURAÇÕES (SENSIBILIDADE, VÍDEO E TECLAS)
// =============================================================================
const DEFAULT_SETTINGS = {
  sensX: 1.0,
  sensY: 1.0,
  sensAimX: 0.75,
  sensAimY: 0.75,
  invertY: false,
  fov: 90,
  shadows: true,
  crosshair: {
    style: 'cruzPonto', // cruz | cruzPonto | ponto | circulo | t
    color: '#ffffff',
    size: 1,
    thickness: 2,
    dynamic: true,      // abre com a dispersão
    outline: true,
  },
  keybinds: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    crouch: 'ShiftLeft',
    reload: 'KeyR',
    slot1: 'Digit1',
    slot2: 'Digit2',
    knife: 'Digit3',
    lastWeapon: 'KeyQ',
    grapple: 'KeyG',
    loadout: 'KeyB',
    reset: 'KeyP',
    score: 'Tab',
  },
};

let userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let rebindingAction = null;

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem('fps_game_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      userSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        keybinds: { ...DEFAULT_SETTINGS.keybinds, ...(parsed.keybinds || {}) },
        crosshair: { ...DEFAULT_SETTINGS.crosshair, ...(parsed.crosshair || {}) },
      };
    }
  } catch (e) { /* armazenamento indisponível */ }
}

function saveSettings() {
  try {
    localStorage.setItem('fps_game_settings', JSON.stringify(userSettings));
  } catch (e) { /* armazenamento indisponível */ }
}

function formatKeyCode(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names = {
    Space: 'Espaço', Tab: 'Tab', ShiftLeft: 'Shift', ShiftRight: 'Shift Dir', ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl Dir', AltLeft: 'Alt', AltRight: 'Alt Dir', CapsLock: 'Caps', Enter: 'Enter',
    Backspace: 'Backspace', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return names[code] || code;
}

function initSettingsUI() {
  loadSavedSettings();
  syncSettingsToUI();

  const tabMouseBtn = $('tabMouseBtn');
  const tabKeysBtn = $('tabKeysBtn');
  const showTab = (mouse) => {
    tabMouseBtn.classList.toggle('active', mouse);
    tabKeysBtn.classList.toggle('active', !mouse);
    $('tabMouseContent').classList.toggle('hidden', !mouse);
    $('tabKeysContent').classList.toggle('hidden', mouse);
  };
  tabMouseBtn.addEventListener('click', () => showTab(true));
  tabKeysBtn.addEventListener('click', () => showTab(false));

  const setupRangePair = (rangeId, numId, settingKey, onChange) => {
    const range = $(rangeId);
    const num = $(numId);
    const apply = (v) => {
      userSettings[settingKey] = v;
      if (onChange) onChange(v);
    };
    range.addEventListener('input', () => { num.value = range.value; apply(parseFloat(range.value)); });
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (Number.isNaN(v)) return;
      range.value = v;
      apply(v);
    });
  };

  setupRangePair('sensXRange', 'sensXNum', 'sensX');
  setupRangePair('sensYRange', 'sensYNum', 'sensY');
  setupRangePair('sensAimXRange', 'sensAimXNum', 'sensAimX');
  setupRangePair('sensAimYRange', 'sensAimYNum', 'sensAimY');
  setupRangePair('fovRange', 'fovNum', 'fov');

  $('invertYCheck').addEventListener('change', (e) => { userSettings.invertY = e.target.checked; });
  // Editor da mira (crosshair): cada mudança aplica na hora, com prévia
  const ch = () => userSettings.crosshair;
  const chPair = (rangeId, numId, key, parse) => {
    const range = $(rangeId);
    const num = $(numId);
    const apply = (raw) => {
      const v = parse(raw);
      if (Number.isNaN(v)) return;
      ch()[key] = v;
      range.value = v;
      num.value = v;
      refreshCrosshairLook();
    };
    range.addEventListener('input', () => apply(range.value));
    num.addEventListener('input', () => apply(num.value));
  };
  chPair('chSizeRange', 'chSizeNum', 'size', parseFloat);
  chPair('chThickRange', 'chThickNum', 'thickness', (v) => parseInt(v, 10));
  $('chStyleSelect').addEventListener('change', (e) => { ch().style = e.target.value; refreshCrosshairLook(); });
  $('chColorInput').addEventListener('input', (e) => { ch().color = e.target.value; refreshCrosshairLook(); });
  document.querySelectorAll('.chSwatch').forEach((btn) => {
    btn.addEventListener('click', () => { ch().color = btn.dataset.color; refreshCrosshairLook(); });
  });
  $('chDynamicCheck').addEventListener('change', (e) => { ch().dynamic = e.target.checked; });
  $('chOutlineCheck').addEventListener('change', (e) => { ch().outline = e.target.checked; refreshCrosshairLook(); });

  $('shadowsCheck').addEventListener('change', (e) => {
    userSettings.shadows = e.target.checked;
    applyShadowSetting();
  });

  document.querySelectorAll('.keybindBtn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.keybindBtn').forEach((b) => b.classList.remove('listening'));
      rebindingAction = btn.dataset.action;
      btn.classList.add('listening');
      btn.textContent = 'Pressione...';
    });
  });

  const openModal = () => {
    controls.unlock();
    syncSettingsToUI();
    $('settingsModal').classList.remove('hidden');
  };
  $('openSettingsLobbyBtn').addEventListener('click', openModal);
  $('openSettingsHudBtn').addEventListener('click', openModal);
  $('closeSettingsXBtn').addEventListener('click', closeSettingsModal);
  $('saveSettingsBtn').addEventListener('click', closeSettingsModal);
  $('resetSettingsBtn').addEventListener('click', () => {
    userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveSettings();
    syncSettingsToUI();
    applyShadowSetting();
  });
}

function closeSettingsModal() {
  if (rebindingAction) rebindingAction = null;
  saveSettings();
  syncSettingsToUI();
  $('settingsModal').classList.add('hidden');
  if (joined) refreshHotbar();
}

function syncSettingsToUI() {
  const setPair = (rangeId, numId, val) => {
    $(rangeId).value = val;
    $(numId).value = val;
  };
  setPair('sensXRange', 'sensXNum', userSettings.sensX);
  setPair('sensYRange', 'sensYNum', userSettings.sensY);
  setPair('sensAimXRange', 'sensAimXNum', userSettings.sensAimX);
  setPair('sensAimYRange', 'sensAimYNum', userSettings.sensAimY);
  setPair('fovRange', 'fovNum', userSettings.fov);
  $('invertYCheck').checked = !!userSettings.invertY;
  $('shadowsCheck').checked = !!userSettings.shadows;
  const c = userSettings.crosshair;
  $('chStyleSelect').value = c.style;
  $('chSizeRange').value = c.size; $('chSizeNum').value = c.size;
  $('chThickRange').value = c.thickness; $('chThickNum').value = c.thickness;
  $('chDynamicCheck').checked = !!c.dynamic;
  $('chOutlineCheck').checked = !!c.outline;
  refreshCrosshairLook();
  document.querySelectorAll('.keybindBtn').forEach((btn) => {
    btn.classList.remove('listening');
    btn.textContent = formatKeyCode(userSettings.keybinds[btn.dataset.action]);
  });
}

// Aplica a aparência da mira no HUD e na prévia das configurações
function refreshCrosshairLook() {
  const c = userSettings.crosshair;
  applyCrosshairSettings($('crosshair'), c);
  const preview = $('crosshairPreviewInner');
  applyCrosshairSettings(preview, c);
  preview.style.setProperty('--gap', `${Math.round(4 * c.size + 2)}px`);
  preview.style.setProperty('--circle', `${Math.round(7 * c.size + 2)}px`);
  $('chColorInput').value = c.color;
  document.querySelectorAll('.chSwatch').forEach((b) => b.classList.toggle('active', b.dataset.color === c.color));
}

function applyShadowSetting() {
  if (!renderer) return;
  renderer.shadowMap.enabled = !!userSettings.shadows;
  sunLight.castShadow = !!userSettings.shadows;
  // Materiais precisam recompilar quando as sombras ligam/desligam
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}

initSettingsUI();

// =============================================================================
// POINTER LOCK & CÂMERA
// =============================================================================
const controls = {
  isLocked: false,
  lock() {
    const el = renderer ? renderer.domElement : document.body;
    if (!el.requestPointerLock) return;
    // Navegadores recusam o lock sem gesto do usuário (ex.: no respawn automático);
    // nesse caso basta clicar na tela, então ignoramos a rejeição.
    const result = el.requestPointerLock();
    if (result && result.catch) result.catch(() => {});
  },
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  },
};

document.addEventListener('pointerlockchange', () => {
  controls.isLocked = !!document.pointerLockElement;
  if (!controls.isLocked) {
    aimHeld = false;
    mouseHeld = false;
    releaseGrapple(false);
  }
});

const mouseDelta = { x: 0, y: 0 }; // acumulado por frame, usado no balanço da arma

document.addEventListener('mousemove', (e) => {
  if (!controls.isLocked) return;
  const aiming = isAiming();
  const multX = (aiming ? userSettings.sensAimX : userSettings.sensX) * 0.0022;
  const multY = (aiming ? userSettings.sensAimY : userSettings.sensY) * 0.0022 * (userSettings.invertY ? -1 : 1);
  cameraYaw -= e.movementX * multX;
  cameraPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cameraPitch - e.movementY * multY));
  mouseDelta.x += e.movementX;
  mouseDelta.y += e.movementY;
});

// =============================================================================
// LOBBY E TROCA DE ARMAS (com prévias)
// =============================================================================
const lobbyPicker = createLoadoutPicker($('weaponPicker'), [], (selected) => {
  renderSlot($('lobbySlot0'), selected[0], '1');
  renderSlot($('lobbySlot1'), selected[1], '2');
  $('joinBtn').disabled = selected.length !== 2;
});
renderSlot($('lobbySlotKnife'), 'knife', '3');

let inGameSelected = [];
const inGamePicker = createLoadoutPicker($('inGameWeaponPicker'), [], (selected) => {
  inGameSelected = selected;
  $('confirmLoadoutBtn').disabled = selected.length !== 2;
});

$('openLoadoutHudBtn').addEventListener('click', openInGameLoadoutModal);
$('deathLoadoutBtn').addEventListener('click', openInGameLoadoutModal);
$('closeLoadoutXBtn').addEventListener('click', closeInGameLoadoutModal);
$('cancelLoadoutBtn').addEventListener('click', closeInGameLoadoutModal);
$('confirmLoadoutBtn').addEventListener('click', () => {
  if (inGameSelected.length !== 2) return;
  socket.emit('changeLoadout', { loadout: inGameSelected });
  closeInGameLoadoutModal();
});

function openInGameLoadoutModal() {
  if (!joined) return;
  controls.unlock();
  inGamePicker.set(myLoadout);
  $('changeLoadoutModal').classList.remove('hidden');
}

function closeInGameLoadoutModal() {
  $('changeLoadoutModal').classList.add('hidden');
  if (gameStatus === 'playing' && myAlive) controls.lock();
}

// Algum overlay que precisa do cursor livre está aberto?
function isAnyModalOpen() {
  return ['settingsModal', 'changeLoadoutModal', 'loadoutScreen', 'endScreen', 'voteScreen', 'deathScreen']
    .some((id) => !$(id).classList.contains('hidden'));
}

$('joinBtn').addEventListener('click', () => {
  myLoadout = lobbyPicker.get();
  myName = $('nameInput').value.trim() || 'Jogador';
  initThree();
  connectSocket();
  $('loadoutScreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
});

$('nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !$('joinBtn').disabled) $('joinBtn').click();
});

function setInviteUrl(url) {
  $('inviteUrl').textContent = url;
  $('copyInviteBtn').dataset.url = url;
}

$('copyInviteBtn').addEventListener('click', async () => {
  const button = $('copyInviteBtn');
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

  camera = new THREE.PerspectiveCamera(userSettings.fov, window.innerWidth / window.innerHeight, 0.05, 1000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !!userSettings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  setTextureAnisotropy(renderer);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x444b59, 0.85);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfffaed, 1.25);
  sunLight.position.set(30, 50, 20);
  sunLight.castShadow = !!userSettings.shadows;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  const shadowCam = sunLight.shadow.camera;
  shadowCam.left = -50; shadowCam.right = 50;
  shadowCam.top = 50; shadowCam.bottom = -50;
  shadowCam.near = 1; shadowCam.far = 150;
  shadowCam.updateProjectionMatrix();
  scene.add(sunLight);

  // Luz do clarão do disparo (sempre na cena, só a intensidade muda)
  muzzleLight = new THREE.PointLight(0xffc870, 0, 9, 2);
  scene.add(muzzleLight);

  createViewModel();

  document.body.addEventListener('click', () => {
    if (isAnyModalOpen()) return;
    if (gameStatus === 'playing' && myAlive && !controls.isLocked) controls.lock();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  loadMap(currentMapId);
  animate();
}

// Libera geometrias/materiais da GPU (texturas de superfície são compartilhadas)
function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (child.userData.isGround && m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

function loadMap(mapId) {
  if (!MAP_BUILDERS[mapId]) return;
  releaseGrapple(false);
  clearTransientEffects();

  // Remove o mapa antigo (mantém luzes, câmera e jogadores remotos)
  const keep = new Set(Object.values(remotePlayers).map((rp) => rp.group));
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj === camera || keep.has(obj)) continue;
    scene.remove(obj);
    disposeObject(obj);
  }

  const built = MAP_BUILDERS[mapId](scene);
  applySurfaceTextures(scene);
  obstacles = built.obstacles;
  mapBounds = built.bounds || 38.5;
  currentMapId = mapId;
  $('mapName').textContent = MAP_INFO[mapId]?.name || mapId;

  const theme = built.theme;
  scene.add(createSky(theme));
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
  hemiLight.color.setHex(theme.skyHorizon);
  hemiLight.groundColor.setHex(theme.hemiGround);
  sunLight.color.setHex(theme.sun);

  // Bounding boxes pré-calculadas; obstáculos são estáticos
  for (const box of obstacles) {
    box.updateMatrixWorld(true);
    box.userData.bbox = new THREE.Box3().setFromObject(box);
  }
  // Só as peças do mapa (filhos diretos da cena); jogadores e arma continuam animando
  for (const o of scene.children) {
    if (o.isMesh && !keep.has(o)) {
      o.updateMatrixWorld(true);
      o.matrixAutoUpdate = false;
    }
  }

  initEffects(scene);
}

// =============================================================================
// VIEWMODEL (ARMA EM PRIMEIRA PESSOA) E ANIMAÇÕES
// =============================================================================
const vm = {
  root: null,        // preso na câmera
  holder: null,      // arma + braços (recebe as animações)
  weapon: null,      // { group, muzzle, support }
  flash: null,
  sway: new THREE.Vector2(),
  bobTime: 0,
  kick: 0,           // recuo visual (empurra para trás)
  kickRot: 0,
  ads: 0,            // 0 = quadril, 1 = mirando
  adsPos: null,      // posição do holder que alinha a mira da arma atual
  drawT: 1,          // 0..1 animação de sacar a arma
  landDip: 0,
  tilt: 0,
};

const VM_HIP = new THREE.Vector3(0.17, -0.17, -0.42);
const VM_ADS = new THREE.Vector3(0, -0.064, -0.34); // reserva para armas sem mira
const ADS_EYE_GAP = 0.09;  // folga mínima entre o olho e a traseira da arma ao mirar
const ADS_MIN_DIST = 0.32; // empunhadura nunca mais perto que isso (alça não tampa a visão)
const VM_SCALE = 0.62;

function createViewModel() {
  vm.root = new THREE.Group();
  camera.add(vm.root);
  vm.holder = new THREE.Group();
  vm.holder.scale.setScalar(VM_SCALE);
  vm.root.add(vm.holder);
  updateWeaponModel();
}

function makeViewArm(hand, side) {
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x27303f, roughness: 0.85 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
  const arm = new THREE.Group();
  arm.position.copy(hand);
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.12), gloveMat);
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55), sleeveMat);
  sleeve.position.set(side * 0.06, -0.14, 0.3);
  sleeve.rotation.set(0.42, side * -0.22, 0);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.06), new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.6 }));
  cuff.position.set(side * 0.02, -0.04, 0.09);
  cuff.rotation.copy(sleeve.rotation);
  arm.add(glove, sleeve, cuff);
  return arm;
}

function updateWeaponModel() {
  if (!vm.holder) return;
  while (vm.holder.children.length) {
    const c = vm.holder.children[0];
    vm.holder.remove(c);
    disposeObject(c);
  }
  const key = myWeaponKey || 'smg';
  vm.weapon = buildWeaponModel(key);
  // Posição de mira: a linha de visada da arma fica exatamente no centro da tela
  vm.adsPos = vm.weapon.sight
    ? new THREE.Vector3(0, -vm.weapon.sight.y * VM_SCALE, -Math.max(vm.weapon.rearZ * VM_SCALE + ADS_EYE_GAP, ADS_MIN_DIST))
    : VM_ADS;
  vm.holder.add(vm.weapon.group);
  vm.holder.add(makeViewArm(new THREE.Vector3(0, -0.06, 0.02), 1));
  if (key !== 'knife') vm.holder.add(makeViewArm(vm.weapon.support, -1));
  knife.t = 1;
  knife.hitStop = 0;
  knife.fidget = 1;
  knife.idle = 0;
  // Sem sombra e sempre por cima do mundo (não atravessa paredes)
  vm.holder.traverse((o) => {
    if (o.isMesh) {
      o.renderOrder = 10;
      o.material.depthTest = true;
    }
  });
  vm.flash = createMuzzleFlash(vm.weapon.group, vm.weapon.muzzle, key === 'shotgun' ? 0.55 : 0.38);
  vm.drawT = 0;
}

function isAiming() {
  const w = WEAPONS[myWeaponKey];
  return aimHeld && controls.isLocked && myAlive && w && !w.isMelee && !w.isUtility && !reloading;
}

function getMuzzleWorldPos(target) {
  if (!vm.weapon) return target.copy(camera.position);
  vm.weapon.group.updateWorldMatrix(true, false);
  return target.copy(vm.weapon.muzzle).applyMatrix4(vm.weapon.group.matrixWorld);
}

const aimUi = { scoped: false };

function updateViewModel(dt) {
  if (!vm.weapon) return;
  const w = WEAPONS[myWeaponKey] || WEAPONS.smg;
  const aiming = isAiming();
  vm.ads = THREE.MathUtils.damp(vm.ads, aiming ? 1 : 0, 16, dt);

  // Mira telescópica da sniper
  const scoped = !!w.scope && vm.ads > 0.85;
  if (scoped !== aimUi.scoped) {
    aimUi.scoped = scoped;
    $('sniperScope').classList.toggle('hidden', !scoped);
  }
  vm.root.visible = !scoped && myAlive;

  // FOV: base do jogador, zoom ao mirar, leve aumento em alta velocidade
  const speed = Math.hypot(velocity.x, velocity.z);
  const baseFov = userSettings.fov + Math.min(Math.max(speed - GROUND_SPEED, 0) * 0.6, 8);
  const targetFov = THREE.MathUtils.lerp(baseFov, w.adsFov || baseFov, vm.ads);
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 14, dt);
    camera.updateProjectionMatrix();
  }

  // Balanço (sway) atrasado em relação ao mouse
  const swayAmount = 1 - vm.ads * 0.85;
  vm.sway.x = THREE.MathUtils.damp(vm.sway.x, -mouseDelta.x * 0.0009 * swayAmount, 10, dt);
  vm.sway.y = THREE.MathUtils.damp(vm.sway.y, mouseDelta.y * 0.0009 * swayAmount, 10, dt);
  mouseDelta.x = 0;
  mouseDelta.y = 0;

  // Passos (bob) só no chão
  const walk = onground && !slide.active ? Math.min(speed / GROUND_SPEED, 1.3) : 0;
  vm.bobTime += dt * (6 + speed * 0.9) * (walk > 0.05 ? 1 : 0);
  const bobAmt = walk * (1 - vm.ads * 0.85);
  const bobX = Math.sin(vm.bobTime) * 0.014 * bobAmt;
  const bobY = -Math.abs(Math.cos(vm.bobTime)) * 0.016 * bobAmt;
  // Respiração parada
  const idle = Math.sin(performance.now() * 0.0018) * 0.004 * (1 - vm.ads);

  vm.kick = THREE.MathUtils.damp(vm.kick, 0, 18, dt);
  vm.kickRot = THREE.MathUtils.damp(vm.kickRot, 0, 14, dt);
  vm.landDip = THREE.MathUtils.damp(vm.landDip, 0, 9, dt);
  vm.drawT = Math.min(vm.drawT + dt / 0.32, 1);

  // Animação de recarga: gira a arma para o lado e abaixa
  let reloadRotZ = 0; let reloadRotX = 0; let reloadY = 0;
  if (reloading && reloadDuration > 0) {
    const p = Math.min((performance.now() - reloadStartTime) / reloadDuration, 1);
    renderReloadProgress(p);
    const s = Math.sin(p * Math.PI);
    reloadRotZ = s * 0.7;
    reloadRotX = s * 0.35;
    reloadY = -s * 0.12 + Math.sin(p * Math.PI * 4) * 0.01 * s;
  }

  // Sacar arma: sobe de baixo girando
  const draw = 1 - Math.pow(1 - vm.drawT, 3);
  const drawY = (1 - draw) * -0.35;
  const drawRot = (1 - draw) * 0.9;

  // Faca tem animação própria (pose, combo, rastro)
  if (myWeaponKey === 'knife') {
    applyKnifePose(dt, { bobX, bobY, idle, draw, speed });
    return;
  }
  hideKnifeTrail();

  const base = VM_HIP.clone().lerp(vm.adsPos || VM_ADS, vm.ads);
  // Mirando, qualquer giro desalinha a mira: amortece balanço e inclinação
  const steady = 1 - vm.ads * 0.9;
  vm.holder.position.set(
    base.x + bobX + vm.sway.x,
    base.y + bobY + vm.sway.y + idle + drawY + reloadY - vm.landDip + (crouchAmount * 0.02),
    base.z + vm.kick,
  );
  vm.holder.rotation.set(
    vm.kickRot * (1 - vm.ads * 0.6) + reloadRotX + drawRot + vm.sway.y * 1.5 * steady,
    vm.sway.x * 2 * steady,
    (-bobX * 2 + vm.tilt * 0.6) * steady + reloadRotZ,
  );

  // Gancho preso: aponta levemente para o ponto
  if (grapple.active) vm.holder.rotation.x += 0.15;
}

// =============================================================================
// FACA: POSE, COMBO DE GOLPES, RASTRO DA LÂMINA E ACERTO
// =============================================================================
// Atacando sem parar faz um ciclo de 3 golpes: corte da direita para a
// esquerda, revés (volta) e estocada. Cada golpe tem preparação, corte rápido
// e recuperação. O dano conta no meio do corte (não no clique), para bater
// com o que aparece na tela, e um acerto "trava" a faca por um instante.
const KNIFE_REST = { px: 0.19, py: -0.2, pz: -0.36, rx: 0.3, ry: 0.2, rz: -0.45 };
const KNIFE_SWING_TIME = 0.4;    // duração de um golpe (s)
const KNIFE_HIT_DELAY = 85;      // ms entre o clique e o momento do corte
const KNIFE_COMBO_WINDOW = 900;  // ms para o próximo clique emendar no combo
const KNIFE_FIDGET_AFTER = 6;    // s parado com a faca até girá-la na mão

// Poses-chave relativas ao descanso: [tempo, px, py, pz, rx, ry, rz]
// (ry > 0 vira a ponta para a esquerda; rz inclina o fio)
const KNIFE_SWINGS = [
  // Corte da direita para a esquerda
  [[0, 0, 0, 0, 0, 0, 0], [0.22, 0.12, 0.17, 0.06, 0.45, -0.6, -0.6], [0.48, -0.34, -0.03, -0.15, -0.3, 1.1, 0.75], [1, 0, 0, 0, 0, 0, 0]],
  // Revés: da esquerda para a direita
  [[0, 0, 0, 0, 0, 0, 0], [0.22, -0.22, 0.15, 0.04, 0.38, 0.8, 0.85], [0.48, 0.18, -0.06, -0.13, -0.25, -0.8, -0.55], [1, 0, 0, 0, 0, 0, 0]],
  // Estocada para frente
  [[0, 0, 0, 0, 0, 0, 0], [0.24, 0.03, -0.02, 0.13, -0.1, 0.05, 0.25], [0.44, -0.08, 0.05, -0.32, -0.38, 0.25, 0.1], [1, 0, 0, 0, 0, 0, 0]],
];
// Fase de corte de cada golpe (o rastro só aparece aqui)
const KNIFE_SLASH_PHASE = [0.2, 0.55];

const knife = {
  t: 1,            // 0..1 progresso do golpe atual
  swing: 0,        // índice em KNIFE_SWINGS
  lastAttack: 0,
  hitStop: 0,      // s em que a animação fica parada após acertar
  bounce: 0,       // tranco quando bate na parede
  idle: 0,
  fidget: 1,       // 0..1 giro da faca na mão (parado por um tempo)
};

const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);

// Interpola as poses-chave do golpe atual; corte rápido, preparação/volta suaves
function evalKnifeSwing(t, out) {
  const keys = KNIFE_SWINGS[knife.swing];
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = Math.min(Math.max((t - a[0]) / (b[0] - a[0]), 0), 1);
  const e = i === 1 ? easeOutCubic(u) : easeInOut(u);
  for (let k = 1; k <= 6; k++) out[k - 1] = a[k] + (b[k] - a[k]) * e;
  return out;
}

function startKnifeSwing() {
  const now = performance.now();
  knife.swing = now - knife.lastAttack < KNIFE_COMBO_WINDOW ? (knife.swing + 1) % KNIFE_SWINGS.length : 0;
  knife.lastAttack = now;
  knife.t = 0;
  knife.idle = 0;
  knife.fidget = 1;
  // O som e o dano saem no momento do corte
  setTimeout(() => {
    if (!myAlive || myWeaponKey !== 'knife') return;
    playShotSound('knife', 1, 0);
    doShoot(WEAPONS.knife);
  }, KNIFE_HIT_DELAY);
}

// Retorno do golpe (chamado por doShoot)
function onKnifeResult(hitPlayer, hitWall) {
  if (hitPlayer) {
    knife.hitStop = 0.08;
    viewPunch.pitch -= 0.03;
    cameraShake = Math.max(cameraShake, 0.05);
    playKnifeHitSound();
  } else if (hitWall) {
    knife.hitStop = 0.05;
    knife.bounce = 1;
    cameraShake = Math.max(cameraShake, 0.025);
    playKnifeWallSound();
  }
}

const _knifeSwing = [0, 0, 0, 0, 0, 0];

function applyKnifePose(dt, { bobX, bobY, idle, draw, speed }) {
  // Hit-stop: segura o golpe por alguns milissegundos após o impacto
  if (knife.hitStop > 0) knife.hitStop -= dt;
  else knife.t = Math.min(knife.t + dt / KNIFE_SWING_TIME, 1);
  knife.bounce = THREE.MathUtils.damp(knife.bounce, 0, 12, dt);

  // Parado por um tempo: gira a faca na mão
  const still = knife.t >= 1 && speed < 0.5 && vm.drawT >= 1;
  knife.idle = still ? knife.idle + dt : 0;
  if (knife.idle > KNIFE_FIDGET_AFTER && knife.fidget >= 1) {
    knife.fidget = 0;
    knife.idle = 0;
  }
  if (knife.fidget < 1) knife.fidget = Math.min(knife.fidget + dt / 1.1, 1);
  const f = knife.fidget < 1 ? easeInOut(knife.fidget) : 0;
  const fidgetLift = Math.sin(f * Math.PI) * 0.06;
  const fidgetSpin = f * Math.PI * 2;

  const s = knife.t < 1 ? evalKnifeSwing(knife.t, _knifeSwing) : _knifeSwing.fill(0);

  // Correndo: faca mais baixa e inclinada, balançando mais
  const run = onground ? Math.min(Math.max((speed - 5) / 5, 0), 1) : 0;
  // Sacar: sobe girando uma volta inteira
  const drawSpin = (1 - draw) * Math.PI * 2;

  vm.holder.position.set(
    KNIFE_REST.px + s[0] + bobX * 1.6 + vm.sway.x,
    KNIFE_REST.py + s[1] + bobY * 1.6 + vm.sway.y + idle + (1 - draw) * -0.3 - vm.landDip - run * 0.03 + fidgetLift + crouchAmount * 0.02,
    KNIFE_REST.pz + s[2] + knife.bounce * 0.05,
  );
  vm.holder.rotation.set(
    KNIFE_REST.rx + s[3] + vm.sway.y * 1.5 + run * 0.18 - knife.bounce * 0.2,
    KNIFE_REST.ry + s[4] + vm.sway.x * 2,
    KNIFE_REST.rz + s[5] - bobX * 3 + vm.tilt * 0.6,
  );
  // A lâmina gira entre os dedos (sacar e floreio), a mão fica parada
  vm.weapon.group.rotation.x = -(drawSpin + fidgetSpin);
  updateKnifeTrail(knife.t > KNIFE_SLASH_PHASE[0] && knife.t < KNIFE_SLASH_PHASE[1] && knife.hitStop <= 0);
}

// Rastro da lâmina: faixa de luz entre a ponta e a base nos últimos frames
const KNIFE_TRAIL_POINTS = 8;
const KNIFE_TIP = new THREE.Vector3(0, 0, -0.46);
const KNIFE_BASE = new THREE.Vector3(0, 0, -0.3); // só a metade de fora da lâmina
const knifeTrail = { mesh: null, history: [], strength: 0, wasActive: false };
const _trailTip = new THREE.Vector3();
const _trailBase = new THREE.Vector3();

function createKnifeTrail() {
  const n = KNIFE_TRAIL_POINTS;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  const index = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2; const b = a + 1; const c = a + 2; const d = a + 3;
    index.push(a, b, c, b, d, c);
  }
  geo.setIndex(index);
  knifeTrail.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  knifeTrail.mesh.frustumCulled = false;
  knifeTrail.mesh.renderOrder = 11;
  vm.root.add(knifeTrail.mesh);
}

function updateKnifeTrail(active) {
  if (!knifeTrail.mesh) createKnifeTrail();
  // Ponta e base da lâmina no espaço da câmera (sem depender da matriz do mundo)
  vm.holder.updateMatrix();
  vm.weapon.group.updateMatrix();
  _trailTip.copy(KNIFE_TIP).applyMatrix4(vm.weapon.group.matrix).applyMatrix4(vm.holder.matrix);
  _trailBase.copy(KNIFE_BASE).applyMatrix4(vm.weapon.group.matrix).applyMatrix4(vm.holder.matrix);

  const h = knifeTrail.history;
  // Começo do corte: não liga com posições de antes (evita um borrão gigante)
  if (active && !knifeTrail.wasActive) h.length = 0;
  knifeTrail.wasActive = active;
  h.unshift([_trailTip.x, _trailTip.y, _trailTip.z, _trailBase.x, _trailBase.y, _trailBase.z]);
  if (h.length > KNIFE_TRAIL_POINTS) h.length = KNIFE_TRAIL_POINTS;
  knifeTrail.strength = active ? 1 : Math.max(knifeTrail.strength - 0.25, 0);
  knifeTrail.mesh.visible = knifeTrail.strength > 0 && h.length > 1;
  if (!knifeTrail.mesh.visible) return;

  const pos = knifeTrail.mesh.geometry.attributes.position.array;
  const col = knifeTrail.mesh.geometry.attributes.color.array;
  for (let i = 0; i < KNIFE_TRAIL_POINTS; i++) {
    const p = h[Math.min(i, h.length - 1)];
    pos.set(p, i * 6);
    // some em direção à cauda; a ponta brilha mais que a base
    const fade = Math.pow(1 - i / (KNIFE_TRAIL_POINTS - 1), 1.5) * knifeTrail.strength * 0.4;
    col.set([0.8 * fade, 0.9 * fade, fade, 0.1 * fade, 0.12 * fade, 0.15 * fade], i * 6);
  }
  knifeTrail.mesh.geometry.attributes.position.needsUpdate = true;
  knifeTrail.mesh.geometry.attributes.color.needsUpdate = true;
}

function hideKnifeTrail() {
  knifeTrail.history.length = 0;
  knifeTrail.strength = 0;
  if (knifeTrail.mesh) knifeTrail.mesh.visible = false;
}

// Inclinação lateral da câmera (strafe e slide) + recuo de câmera
const viewPunch = { pitch: 0, roll: 0 };
let cameraShake = 0;

function applyCameraRotation(dt) {
  const strafe = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  const targetTilt = (slide.active ? 0.09 : 0) + (myAlive ? -strafe * 0.018 : 0);
  vm.tilt = THREE.MathUtils.damp(vm.tilt, targetTilt, 8, dt);
  viewPunch.pitch = THREE.MathUtils.damp(viewPunch.pitch, 0, 12, dt);
  let shakeRoll = 0;
  if (cameraShake > 0.001) {
    shakeRoll = (Math.random() - 0.5) * cameraShake;
    cameraShake = THREE.MathUtils.damp(cameraShake, 0, 12, dt);
  }
  camera.rotation.set(cameraPitch + viewPunch.pitch, cameraYaw, vm.tilt + shakeRoll, 'YXZ');
}

// =============================================================================
// MODELO DOS OUTROS JOGADORES (com animação de passos, mira, agachar e pulo)
// =============================================================================
function colorFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return new THREE.Color(`hsl(${Math.abs(hash) % 360}, 70%, 50%)`);
}

function buildPlayerMesh(color) {
  const group = new THREE.Group();
  const materials = [];
  const mat = (props) => {
    const m = new THREE.MeshStandardMaterial(props);
    m.userData.origColor = m.color.clone();
    materials.push(m);
    return m;
  };
  const suit = mat({ color, roughness: 0.7, metalness: 0.15 });
  const armor = mat({ color: 0x1f242d, roughness: 0.55, metalness: 0.35 });
  const skin = mat({ color: 0xd49a70, roughness: 0.9 });
  const visor = mat({ color: 0x38bdf8, emissive: 0x0f4c6e, roughness: 0.2, metalness: 0.8 });
  const boot = mat({ color: 0x111317, roughness: 0.8 });
  const hitMeshes = [];

  const box = (parent, w, h, d, material, x, y, z, isHead = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.userData.isHead = isHead;
    parent.add(m);
    hitMeshes.push(m);
    return m;
  };

  // Pernas com quadril e joelho articulados
  const makeLeg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.92, 0);
    box(hip, 0.25, 0.46, 0.27, suit, 0, -0.23, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.46, 0);
    box(knee, 0.23, 0.4, 0.25, suit, 0, -0.2, 0);
    box(knee, 0.26, 0.12, 0.36, boot, 0, -0.4, -0.05);
    hip.add(knee);
    group.add(hip);
    return { hip, knee };
  };
  const legL = makeLeg(-0.16);
  const legR = makeLeg(0.16);

  // Tronco (desce ao agachar e inclina com a mira)
  const upper = new THREE.Group();
  upper.position.set(0, 0.92, 0);
  group.add(upper);
  box(upper, 0.66, 0.72, 0.38, suit, 0, 0.38, 0);
  box(upper, 0.72, 0.56, 0.44, armor, 0, 0.42, 0);
  box(upper, 0.18, 0.2, 0.08, armor, -0.18, 0.3, -0.25);
  box(upper, 0.18, 0.2, 0.08, armor, 0.18, 0.3, -0.25);

  const head = new THREE.Group();
  head.position.set(0, 0.82, 0);
  upper.add(head);
  box(head, 0.44, 0.44, 0.44, skin, 0, 0.22, 0, true);
  box(head, 0.5, 0.22, 0.5, armor, 0, 0.4, 0, true);
  box(head, 0.4, 0.13, 0.05, visor, 0, 0.26, -0.23, true);

  // Braços apontando para frente segurando a arma
  const makeArm = (x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.66, 0);
    box(shoulder, 0.2, 0.62, 0.2, suit, 0, -0.28, 0);
    upper.add(shoulder);
    return shoulder;
  };
  const armR = makeArm(0.42);
  const armL = makeArm(-0.42);

  const weaponSlot = new THREE.Group();
  weaponSlot.position.set(0, -0.6, 0.02);
  weaponSlot.rotation.x = -Math.PI / 2;
  armR.add(weaponSlot);

  const parts = { legL, legR, upper, head, armR, armL, weaponSlot, flash: null, weaponKey: null };

  const setWeapon = (key) => {
    if (parts.weaponKey === key) return;
    parts.weaponKey = key;
    while (weaponSlot.children.length) {
      const c = weaponSlot.children[0];
      weaponSlot.remove(c);
      disposeObject(c);
    }
    const model = buildWeaponModel(key);
    model.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    weaponSlot.add(model.group);
    parts.flash = createMuzzleFlash(model.group, model.muzzle, 0.5);
    parts.muzzle = model.muzzle;
    parts.weaponGroup = model.group;
  };

  return { group, parts, hitMeshes, materials, setWeapon };
}

// Pose do modelo remoto a cada frame
function animateRemote(rp, dt, speed, vy) {
  const { parts } = rp;
  const a = rp.anim;
  const crouch = a.crouch;
  const airborne = Math.abs(vy) > 1.2;

  a.stride += dt * Math.min(speed, 14) * 1.25;
  const walk = Math.min(speed / 6, 1) * (airborne ? 0.2 : 1);
  const swing = Math.sin(a.stride) * 0.75 * walk;

  const tuck = airborne ? 0.6 : 0;
  parts.legL.hip.rotation.x = THREE.MathUtils.damp(parts.legL.hip.rotation.x, swing - crouch * 1.1 - tuck, 14, dt);
  parts.legR.hip.rotation.x = THREE.MathUtils.damp(parts.legR.hip.rotation.x, -swing - crouch * 1.1 - tuck * 0.5, 14, dt);
  parts.legL.knee.rotation.x = THREE.MathUtils.damp(parts.legL.knee.rotation.x, Math.max(0, -Math.sin(a.stride)) * 0.9 * walk + crouch * 1.9 + tuck, 14, dt);
  parts.legR.knee.rotation.x = THREE.MathUtils.damp(parts.legR.knee.rotation.x, Math.max(0, Math.sin(a.stride)) * 0.9 * walk + crouch * 1.9 + tuck * 0.8, 14, dt);

  parts.upper.position.y = 0.92 - crouch * 0.42 + Math.abs(Math.cos(a.stride)) * 0.04 * walk;
  parts.upper.rotation.x = a.pitch * 0.25 - crouch * 0.15;
  parts.head.rotation.x = a.pitch * 0.7;

  const knife = parts.weaponKey === 'knife';
  const aimX = Math.PI / 2 + a.pitch * 0.85 - (knife ? 0.9 : 0);
  parts.armR.rotation.set(aimX, 0, 0);
  parts.armL.rotation.set(aimX - (knife ? 0.3 : 0.05), 0, knife ? 0.2 : -0.55);
  parts.upper.rotation.y = 0;

  // Golpe de faca: ergue o braço de um lado e corta em arco para o outro,
  // girando o tronco junto (alterna o lado a cada golpe)
  if (knife && a.swingT < 1) {
    a.swingT = Math.min(a.swingT + dt / 0.38, 1);
    const p = a.swingT;
    let side;
    if (p < 0.25) side = easeInOut(p / 0.25);                         // preparação
    else if (p < 0.55) side = 1 - 2 * easeOutCubic((p - 0.25) / 0.3); // corte
    else side = -1 + easeInOut((p - 0.55) / 0.45);                    // volta
    const lift = Math.sin(Math.min(p / 0.55, 1) * Math.PI) * 0.9;
    parts.armR.rotation.set(aimX + 0.9 * (p < 0.55 ? 1 : 1 - easeInOut((p - 0.55) / 0.45)) - lift * 0.3, 0, side * 1.1 * a.swingDir);
    parts.upper.rotation.y = -side * 0.35 * a.swingDir;
  }
  // Recuo ao atirar
  a.recoil = THREE.MathUtils.damp(a.recoil, 0, 14, dt);
  parts.armR.rotation.x += a.recoil;
  parts.armL.rotation.x += a.recoil * 0.6;
}

function addRemotePlayer(p) {
  if (remotePlayers[p.id]) return remotePlayers[p.id];
  const pm = buildPlayerMesh(colorFromId(p.id));
  const feetY = (p.y || PLAYER_HEIGHT) - PLAYER_HEIGHT;
  pm.group.position.set(p.x || 0, feetY, p.z || 0);
  pm.group.rotation.y = p.rotY || 0;
  pm.group.visible = !!p.alive;
  pm.setWeapon(p.weaponKey || 'smg');
  scene.add(pm.group);

  // Nome + barra de vida (elemento reaproveitado a cada frame)
  const tag = document.createElement('div');
  tag.className = 'nameTag';
  tag.style.display = 'none';
  const tagName = document.createElement('div');
  tagName.className = 'ntName';
  tagName.textContent = p.name || 'Jogador';
  const healthBar = document.createElement('div');
  healthBar.className = 'enemyHealth';
  const healthFill = document.createElement('div');
  healthFill.className = 'enemyHealthFill';
  healthBar.appendChild(healthFill);
  tag.append(tagName, healthBar);
  nameTagsDiv.appendChild(tag);

  const rp = {
    ...pm,
    id: p.id,
    buffer: [], // snapshots { t, x, y, z, rotY, pitch, crouch } para interpolação
    data: { id: p.id, name: p.name || 'Jogador', health: p.health ?? 100, alive: !!p.alive, weaponKey: p.weaponKey || 'smg' },
    anim: { stride: 0, crouch: 0, pitch: 0, recoil: 0, lastY: feetY, swingT: 1, swingDir: 1 },
    flashTimeout: null,
    tag, tagName, healthFill,
    losVisible: true,
    losCheckAt: 0,
    grappleAnchor: null,
    rope: null,
  };
  remotePlayers[p.id] = rp;
  return rp;
}

function removeRemoteRope(rp) {
  rp.grappleAnchor = null;
  if (rp.rope) {
    scene.remove(rp.rope);
    rp.rope.geometry.dispose();
    rp.rope.material.dispose();
    rp.rope = null;
  }
}

function removeRemotePlayer(id) {
  const rp = remotePlayers[id];
  if (!rp) return;
  clearTimeout(rp.flashTimeout);
  removeRemoteRope(rp);
  scene.remove(rp.group);
  disposeObject(rp.group);
  rp.tag.remove();
  delete remotePlayers[id];
}

function clearRemotePlayers() {
  for (const id in remotePlayers) removeRemotePlayer(id);
}

function flashPlayerRed(rp) {
  rp.materials.forEach((m) => { m.emissive.setHex(0xff1122); m.emissiveIntensity = 0.9; });
  clearTimeout(rp.flashTimeout);
  rp.flashTimeout = setTimeout(() => {
    rp.materials.forEach((m) => { m.emissive.setHex(0x000000); });
    // o visor tem brilho próprio
    rp.materials[3].emissive.setHex(0x0f4c6e);
  }, 110);
}

function getRemoteMuzzlePos(rp, target) {
  if (!rp.parts.weaponGroup) return target.copy(rp.group.position).add(new THREE.Vector3(0, 1.4, 0));
  rp.parts.weaponGroup.updateWorldMatrix(true, false);
  return target.copy(rp.parts.muzzle).applyMatrix4(rp.parts.weaponGroup.matrixWorld);
}

// Posição na tela (px) de um ponto do mundo, ou null se fora da visão
const _screen = new THREE.Vector3();
function worldToScreen(pos) {
  _screen.copy(pos).project(camera);
  if (_screen.z < -1 || _screen.z > 1 || Math.abs(_screen.x) > 1.1 || Math.abs(_screen.y) > 1.1) return null;
  return { x: (_screen.x * 0.5 + 0.5) * window.innerWidth, y: (-_screen.y * 0.5 + 0.5) * window.innerHeight };
}

// =============================================================================
// REDE (SOCKET.IO)
// =============================================================================
const MOVE_SEND_INTERVAL = 1000 / 30; // envia posição a 30Hz
const INTERP_DELAY = 100;             // ms de atraso para interpolar entre snapshots
const TELEPORT_DISTANCE = 8;          // acima disso não interpola (respawn)
let serverTimeOffset = null;          // serverTime - performance.now(), suavizado

function connectSocket() {
  socket = io({ transports: ['websocket', 'polling'], upgrade: true });

  const updateNetworkStatus = () => {
    const transport = socket.io.engine.transport.name;
    const status = $('networkStatus');
    status.textContent = transport === 'websocket' ? 'Online' : 'HTTP polling';
    status.className = transport;
  };

  socket.on('connect', () => {
    updateNetworkStatus();
    socket.io.engine.on('upgrade', updateNetworkStatus);
    // Entra (ou entra de novo após uma queda de conexão)
    socket.emit('join', { name: myName, loadout: myLoadout });
  });
  socket.on('disconnect', () => {
    $('networkStatus').textContent = 'Reconectando...';
    $('networkStatus').className = '';
    myAlive = false;
    controls.unlock();
  });

  socket.on('gameInfo', (info) => {
    gameStatus = info.status;
    if (info.status === 'playing') updateTimerHUD(info.timeLeft);
    if (info.inviteUrl) setInviteUrl(info.inviteUrl);
  });

  socket.on('init', (data) => {
    myId = data.id;
    mySpawnSeq = data.seq || 0;
    serverTimeOffset = null;
    clearRemotePlayers();
    gameStatus = data.game.status;
    loadMap(data.game.currentMap);
    if (gameStatus === 'playing') updateTimerHUD(data.game.timeLeft);

    for (const id in data.players) {
      if (id !== myId) addRemotePlayer(data.players[id]);
    }
    const me = data.players[myId];
    if (me) {
      myWeaponKey = me.weaponKey;
      myAmmo = data.ammo || myAmmo;
      myHealth = me.health;
      myAlive = !!me.alive;
      if (myAlive) placeLocalPlayer(me.x, me.y, me.z, me.rotY);
      updateWeaponModel();
    }
    joined = true;
    refreshWeaponHud();
    renderHealth(myHealth, myAlive);
  });

  socket.on('playerJoined', (p) => {
    if (p.id !== myId) addRemotePlayer(p);
  });

  socket.on('playerLeft', (id) => removeRemotePlayer(id));

  socket.on('scoreboard', (rows) => {
    lastScoreboard = rows;
    for (const row of rows) {
      const rp = remotePlayers[row.id];
      if (rp && rp.data.name !== row.name) {
        rp.data.name = row.name;
        rp.tagName.textContent = row.name;
      }
    }
    renderScoreboard(rows, myId);
  });

  // Snapshot: { t, p: [[id, x, y, z, rotY, alive, weaponKey, health, pitch, crouch, grappling], ...] }
  socket.on('state', ({ t, p: list }) => {
    const sample = t - performance.now();
    if (serverTimeOffset === null || sample > serverTimeOffset) serverTimeOffset = sample;
    else serverTimeOffset += (sample - serverTimeOffset) * 0.02;

    for (const [id, x, y, z, rotY, alive, weaponKey, health, pitch, crouch, grappling] of list) {
      if (id === myId) continue;
      const rp = remotePlayers[id] || addRemotePlayer({ id, x, y, z, rotY, alive, weaponKey, health });
      const feetY = y - PLAYER_HEIGHT;
      const last = rp.buffer[rp.buffer.length - 1];
      const wasAlive = rp.data.alive;

      // Respawn ou salto grande: limpa o histórico e posiciona direto
      if (!last || (alive && !wasAlive) || Math.hypot(x - last.x, z - last.z, feetY - last.y) > TELEPORT_DISTANCE) {
        rp.buffer.length = 0;
        rp.group.position.set(x, feetY, z);
        rp.group.rotation.y = rotY;
        rp.anim.lastY = feetY;
      }
      if (!last || t > last.t) rp.buffer.push({ t, x, y: feetY, z, rotY, pitch: pitch || 0, crouch: crouch || 0 });
      if (rp.buffer.length > 20) rp.buffer.shift();

      rp.setWeapon(weaponKey);
      rp.data.weaponKey = weaponKey;
      rp.data.health = health;
      rp.data.alive = !!alive;
      rp.group.visible = !!alive;
      if (!grappling && rp.grappleAnchor) removeRemoteRope(rp);
    }
  });

  // Ressincronização de munição (ex.: servidor recusou um tiro)
  socket.on('ammoUpdate', ({ ammo }) => {
    myAmmo = ammo;
    refreshWeaponHud();
  });

  socket.on('reloadDone', ({ ammo }) => {
    myAmmo = ammo;
    reloading = false;
    refreshWeaponHud();
  });

  socket.on('loadoutChanged', ({ loadout, weaponKey, ammo }) => {
    myLoadout = loadout;
    myWeaponKey = weaponKey;
    myAmmo = ammo;
    reloading = false;
    releaseGrapple(false);
    updateWeaponModel();
    refreshWeaponHud();
    showWeaponPopup(weaponKey);
  });

  socket.on('playerShot', ({ id, weaponKey, ends }) => {
    const rp = remotePlayers[id];
    if (!rp || !rp.group.visible) return;
    const w = WEAPONS[weaponKey] || WEAPONS.smg;
    const from = getRemoteMuzzlePos(rp, new THREE.Vector3());
    if (!w.isMelee) triggerMuzzleFlash(rp.parts.flash, 0.06, 0.6);
    if (w.isMelee) {
      rp.anim.swingT = 0;
      rp.anim.swingDir = -rp.anim.swingDir;
    } else {
      rp.anim.recoil = 0.25;
    }
    const pellets = ends && ends.length ? ends : [];
    for (const e of pellets) {
      const to = new THREE.Vector3(e.x, e.y, e.z);
      if (!w.isMelee) spawnBulletTracer(from, to, w.tracerColor, w.pellets > 1 ? 0.012 : 0.02);
      const back = from.clone().sub(to).normalize();
      if (!w.isMelee) emitParticles(to, back, { count: 4, color: 0xffd27a, speed: 4, life: 0.2, size: 0.04 });
    }
    // Volume e lado do som pela distância/direção
    const dist = camera.position.distanceTo(rp.group.position);
    const rel = rp.group.position.clone().sub(camera.position).applyAxisAngle(UP, -cameraYaw);
    const pan = Math.max(-1, Math.min(1, rel.x / Math.max(dist, 1)));
    playShotSound(weaponKey, Math.max(0.12, 1 - dist / 70) * 0.8, pan * 0.8);
  });

  socket.on('playerDamaged', ({ id, health, attackerId, damage, headshot, attackerPos }) => {
    if (id === myId) {
      myHealth = health;
      renderHealth(myHealth, myAlive);
      showDamageFlash();
      showDamageDirection(attackerPos);
      playHurtSound();
      cameraShake = 0.06 + Math.min(damage, 60) * 0.002;
      viewPunch.pitch -= 0.02;
      $('healIndicator').classList.add('hidden');
    }
    const rp = remotePlayers[id];
    if (rp) {
      rp.data.health = health;
      flashPlayerRed(rp);
      const chest = rp.group.position.clone().add(new THREE.Vector3(0, headshot ? 1.9 : 1.3, 0));
      spawnBloodHit(chest, headshot);
    }
    if (attackerId === myId && rp) {
      showHitmarker(!!headshot, false);
      const pos = worldToScreen(rp.group.position.clone().add(new THREE.Vector3(0, 2.3, 0)));
      if (pos) showDamageNumber(pos.x, pos.y, damage, !!headshot, false);
      playHitmarkerSound(!!headshot);
    }
  });

  socket.on('playerHealed', ({ id, health }) => {
    if (id === myId) {
      myHealth = health;
      renderHealth(myHealth, myAlive);
      $('healIndicator').classList.toggle('hidden', myHealth >= 100);
      $('regenEffect').classList.toggle('active', myHealth < 100);
    }
    if (remotePlayers[id]) remotePlayers[id].data.health = health;
  });

  socket.on('playerDied', (data) => {
    const { id, killerId, damage, headshot, attackerPos, respawnIn } = data;
    if (id === myId) {
      myAlive = false;
      myHealth = 0;
      reloading = false;
      mouseHeld = false;
      velocity.set(0, 0, 0);
      slide.active = false;
      renderHealth(0, false);
      controls.unlock();
      releaseGrapple(false);
      $('healIndicator').classList.add('hidden');
      $('regenEffect').classList.remove('active');
      showDamageDirection(attackerPos);
      deathFocus = attackerPos && killerId !== myId ? new THREE.Vector3(attackerPos.x, attackerPos.y, attackerPos.z) : null;
      showDeathScreen(data, respawnIn || 5000, () => socket.emit('requestInstantRespawn'));
    }
    const rp = remotePlayers[id];
    if (rp) {
      if (rp.group.visible) spawnCorpse(rp.group, attackerPos);
      rp.data.alive = false;
      rp.group.visible = false;
      removeRemoteRope(rp);
    }
    if (killerId === myId && id !== myId) {
      showHitmarker(!!headshot, true);
      if (rp) {
        const pos = worldToScreen(rp.group.position.clone().add(new THREE.Vector3(0, 2.3, 0)));
        if (pos) showDamageNumber(pos.x, pos.y, damage, !!headshot, true);
      }
      showKillBanner(rp ? rp.data.name : 'Jogador', !!headshot);
      playKillSound();
    }
  });

  socket.on('respawned', ({ x, y, z, rotY, ammo, weaponKey, health, seq }) => {
    mySpawnSeq = seq;
    myAlive = true;
    myAmmo = ammo;
    myWeaponKey = weaponKey;
    lastWeaponKey = null;
    myHealth = health ?? 100;
    reloading = false;
    deathFocus = null;
    placeLocalPlayer(x, y, z, rotY);
    releaseGrapple(false);
    updateWeaponModel();
    refreshWeaponHud();
    renderHealth(myHealth, true);
    hideDeathScreen();
    if (gameStatus === 'playing' && !isAnyModalOpen()) controls.lock();
  });

  socket.on('killFeed', (entry) => addKillFeed(entry, myId));

  socket.on('grappleUsed', ({ id, x, y, z }) => {
    const rp = remotePlayers[id];
    if (!rp) return;
    rp.grappleAnchor = new THREE.Vector3(x, y, z);
    if (!rp.rope) {
      rp.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: 0x38ef7d }));
      rp.rope.frustumCulled = false;
      scene.add(rp.rope);
    }
  });

  socket.on('grappleReleased', ({ id }) => {
    if (remotePlayers[id]) removeRemoteRope(remotePlayers[id]);
  });

  socket.on('matchTime', ({ timeLeft }) => updateTimerHUD(timeLeft));

  socket.on('matchStarted', ({ mapId }) => {
    gameStatus = 'playing';
    loadMap(mapId);
    $('endScreen').classList.add('hidden');
    $('voteScreen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('sbMap').textContent = MAP_INFO[mapId]?.name || '';
  });

  socket.on('matchEnded', ({ scoreboard }) => {
    gameStatus = 'ended';
    myAlive = false;
    mouseHeld = false;
    controls.unlock();
    hideDeathScreen();
    releaseGrapple(false);
    renderEndScreen(scoreboard);
    $('endScreen').classList.remove('hidden');
  });

  socket.on('voteStart', ({ options, duration, counts }) => {
    gameStatus = 'voting';
    hideDeathScreen();
    $('endScreen').classList.add('hidden');
    renderVoteOptions(options, counts, (mapId) => socket.emit('vote', { mapId }));
    $('voteScreen').classList.remove('hidden');
    setVoteTimer(duration);
  });

  socket.on('voteUpdate', ({ counts }) => updateVoteCounts(counts));
  socket.on('voteTime', ({ timeLeft }) => setVoteTimer(timeLeft));
}

// Posiciona o jogador local e zera a física (evita herdar velocidade da morte)
function placeLocalPlayer(x, y, z, rotY) {
  camera.position.set(x, y, z);
  velocity.set(0, 0, 0);
  onground = false;
  eyeHeight = PLAYER_HEIGHT;
  crouchAmount = 0;
  slide.active = false;
  cameraYaw = rotY ?? cameraYaw;
  cameraPitch = 0;
  recoilDebt = 0;
  lastMoveSent = 0;
}

// Envia a posição no máximo a 30Hz, com a sequência de spawn atual.
// y vai sempre como "olho em pé" (pés + 1.6); o agachamento vai em crouch.
let lastMoveSent = 0;
function sendMove() {
  const now = performance.now();
  if (now - lastMoveSent < MOVE_SEND_INTERVAL) return;
  lastMoveSent = now;
  const p = camera.position;
  const feet = p.y - eyeHeight;
  socket.volatile.emit('move', {
    x: Math.round(p.x * 100) / 100,
    y: Math.round((feet + PLAYER_HEIGHT) * 100) / 100,
    z: Math.round(p.z * 100) / 100,
    rotY: Math.round(cameraYaw * 1000) / 1000,
    pitch: Math.round(cameraPitch * 100) / 100,
    crouch: Math.round(crouchAmount * 100) / 100,
    seq: mySpawnSeq,
  });
}

// =============================================================================
// HUD
// =============================================================================
function refreshHotbar() {
  renderHotbar(myLoadout, myWeaponKey, myAmmo, userSettings.keybinds);
}

function refreshWeaponHud() {
  renderAmmo(myWeaponKey, myAmmo, reloading);
  refreshHotbar();
}

function updateTimerHUD(timeLeft) {
  const m = Math.max(Math.floor(timeLeft / 60), 0);
  const s = Math.max(timeLeft % 60, 0);
  $('timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  $('timerWrap').classList.toggle('ending', timeLeft <= 30);
}

function showDamageDirection(attackerPos) {
  if (!attackerPos) return;
  const toAttacker = Math.atan2(attackerPos.x - camera.position.x, attackerPos.z - camera.position.z);
  const forward = Math.atan2(-Math.sin(cameraYaw), -Math.cos(cameraYaw));
  showDirectionalIndicator(((forward - toAttacker) * 180 / Math.PI + 360) % 360);
}

// =============================================================================
// INPUT
// =============================================================================
const move = { forward: false, back: false, left: false, right: false, jumpHeld: false, crouchHeld: false };
let mouseHeld = false;
let aimHeld = false;

document.addEventListener('keydown', (e) => {
  // Rebinding no modal de configurações
  if (rebindingAction) {
    e.preventDefault();
    if (e.code !== 'Escape') {
      userSettings.keybinds[rebindingAction] = e.code;
      saveSettings();
    }
    rebindingAction = null;
    syncSettingsToUI();
    return;
  }

  if (!$('settingsModal').classList.contains('hidden')) {
    if (e.code === 'Escape') closeSettingsModal();
    return;
  }
  if (!$('changeLoadoutModal').classList.contains('hidden')) {
    if (e.code === 'Escape') closeInGameLoadoutModal();
    return;
  }

  // Fora da partida (ex.: digitando o nome no lobby) as teclas do jogo não valem
  if (!joined || e.target instanceof HTMLInputElement) return;

  const kb = userSettings.keybinds;
  if (e.code === kb.score) {
    e.preventDefault();
    $('scoreboard').classList.add('show');
    return;
  }
  if (e.repeat) return;
  if (e.code === kb.forward) move.forward = true;
  else if (e.code === kb.back) move.back = true;
  else if (e.code === kb.left) move.left = true;
  else if (e.code === kb.right) move.right = true;
  else if (e.code === kb.jump) { move.jumpHeld = true; jumpBufferedAt = performance.now(); e.preventDefault(); }
  else if (e.code === kb.crouch) move.crouchHeld = true;
  else if (e.code === kb.reload) tryReload();
  else if (e.code === kb.slot1) trySwitchWeapon(myLoadout[0]);
  else if (e.code === kb.slot2) trySwitchWeapon(myLoadout[1]);
  else if (e.code === kb.knife) trySwitchWeapon('knife');
  else if (e.code === kb.lastWeapon) trySwitchWeapon(lastWeaponKey);
  else if (e.code === kb.grapple) { if (myLoadout.includes('grapple')) trySwitchWeapon('grapple'); }
  else if (e.code === kb.reset) tryReset();
  else if (e.code === kb.loadout) { e.preventDefault(); openInGameLoadoutModal(); }
});

document.addEventListener('keyup', (e) => {
  if (rebindingAction) return;
  const kb = userSettings.keybinds;
  if (e.code === kb.forward) move.forward = false;
  else if (e.code === kb.back) move.back = false;
  else if (e.code === kb.left) move.left = false;
  else if (e.code === kb.right) move.right = false;
  else if (e.code === kb.jump) move.jumpHeld = false;
  else if (e.code === kb.crouch) move.crouchHeld = false;
  else if (e.code === kb.score) $('scoreboard').classList.remove('show');
});

// Solta todas as teclas ao perder o foco (evita andar sozinho ao voltar para a aba)
window.addEventListener('blur', () => {
  Object.keys(move).forEach((k) => { move[k] = false; });
  mouseHeld = false;
  aimHeld = false;
  releaseGrapple(false);
});

document.addEventListener('mousedown', (e) => {
  if (!controls.isLocked || !myAlive) return;
  if (e.button === 2) { aimHeld = true; return; }
  if (e.button !== 0) return;
  mouseHeld = true;
  attemptAction();
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    mouseHeld = false;
    if (myWeaponKey === 'grapple') releaseGrapple(false);
  }
  if (e.button === 2) aimHeld = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Roda do mouse percorre os slots 1 → 2 → faca
document.addEventListener('wheel', (e) => {
  if (!controls.isLocked || !myAlive) return;
  const order = [myLoadout[0], myLoadout[1], 'knife'];
  const idx = Math.max(0, order.indexOf(myWeaponKey));
  const next = order[(idx + (e.deltaY > 0 ? 1 : 2)) % 3];
  trySwitchWeapon(next);
}, { passive: true });

// Tecla de reset: o servidor decide a morte
function tryReset() {
  if (myAlive && gameStatus === 'playing') socket.emit('suicide');
}

function trySwitchWeapon(key) {
  if (!myAlive || !key || key === myWeaponKey) return;
  if (key !== 'knife' && !myLoadout.includes(key)) return;
  releaseGrapple(false);
  reloading = false; // trocar de arma cancela a recarga (igual no servidor)
  lastWeaponKey = myWeaponKey;
  myWeaponKey = key;
  socket.emit('switchWeapon', { key });
  updateWeaponModel();
  refreshWeaponHud();
  showWeaponPopup(key);
  playSwitchSound();
}

function tryReload() {
  if (!myAlive || reloading) return;
  const w = WEAPONS[myWeaponKey];
  if (!w || w.maxAmmo === Infinity || myAmmo[myWeaponKey] >= w.maxAmmo) return;
  reloading = true;
  reloadStartTime = performance.now();
  reloadDuration = w.reloadTime;
  aimHeld = false;
  renderReloadProgress(0);
  refreshWeaponHud();
  playReloadSound(w.reloadTime);
  socket.emit('reload');
}

// =============================================================================
// MOVIMENTAÇÃO (ESTILO KRUNKER: BHOP, AIR STRAFE, SLIDE E AGACHAR)
// =============================================================================
const velocity = new THREE.Vector3();
let onground = true;
let eyeHeight = PLAYER_HEIGHT;
let crouchAmount = 0;          // 0 em pé, 1 agachado (também vai para a rede)
let lastGroundedAt = 0;        // coyote time
let jumpBufferedAt = -1e9;     // pulo apertado um pouco antes de tocar o chão

const GROUND_SPEED = 8.4;
const CROUCH_SPEED = 4.2;
const GROUND_ACCEL = 12;
const FRICTION = 6.2;
const AIR_ACCEL = 90;          // aceleração alta + teto baixo = ganho por strafe
const AIR_SPEED_CAP = 1.1;
const JUMP_FORCE = 7.6;
const GRAVITY = -22;
const MAX_HORIZONTAL_SPEED = 28;
const COYOTE_TIME = 110;
const JUMP_BUFFER = 130;

// Slide: agachar correndo dá um impulso e quase sem atrito por um tempo
const slide = { active: false, ready: true, time: 0 };
const SLIDE_MIN_SPEED = 6.5;
const SLIDE_BOOST = 3.6;
const SLIDE_DURATION = 0.75;
const SLIDE_FRICTION = 0.9;

const _forwardVec = new THREE.Vector3();
const _rightVec = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function accelerate(wishdir, wishspeed, accel, dt) {
  const currentSpeed = velocity.x * wishdir.x + velocity.z * wishdir.z;
  const addSpeed = wishspeed - currentSpeed;
  if (addSpeed <= 0) return;
  const accelSpeed = Math.min(accel * dt * wishspeed, addSpeed);
  velocity.x += accelSpeed * wishdir.x;
  velocity.z += accelSpeed * wishdir.z;
}

function applyFriction(amount, dt) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 0.01) { velocity.x = 0; velocity.z = 0; return; }
  const drop = Math.max(speed, 1.5) * amount * dt;
  const scale = Math.max(speed - drop, 0) / speed;
  velocity.x *= scale;
  velocity.z *= scale;
}

// Colisão AABB com suporte a passar por baixo de plataformas e subir degraus
function collidesWithObstacles(x, y, z, eye = eyeHeight) {
  const pRadius = 0.3;
  const feet = y - eye + 0.05;
  const head = y + 0.15;
  for (let i = 0; i < obstacles.length; i++) {
    const b = obstacles[i].userData.bbox;
    if (x + pRadius > b.min.x && x - pRadius < b.max.x && z + pRadius > b.min.z && z - pRadius < b.max.z) {
      if (feet >= b.max.y - 0.25) continue; // em cima
      if (head <= b.min.y + 0.05) continue; // por baixo
      return true;
    }
  }
  return false;
}

function groundHeightAt(x, y, z) {
  let h = 0;
  const pRadius = 0.24;
  const feet = y - eyeHeight;
  for (let i = 0; i < obstacles.length; i++) {
    const b = obstacles[i].userData.bbox;
    if (x + pRadius > b.min.x && x - pRadius < b.max.x && z + pRadius > b.min.z && z - pRadius < b.max.z) {
      if (b.max.y <= feet + 0.45 && b.max.y > h) h = b.max.y; // até 0.45m vira degrau
    }
  }
  return h;
}

function updateCrouch(dt) {
  const pos = camera.position;
  let wantCrouch = move.crouchHeld || slide.active;
  // Não levanta se tiver teto em cima
  if (!wantCrouch && crouchAmount > 0.01 && collidesWithObstacles(pos.x, pos.y - eyeHeight + PLAYER_HEIGHT, pos.z, PLAYER_HEIGHT)) {
    wantCrouch = true;
  }
  const prevEye = eyeHeight;
  crouchAmount = THREE.MathUtils.damp(crouchAmount, wantCrouch ? 1 : 0, 14, dt);
  eyeHeight = THREE.MathUtils.lerp(PLAYER_HEIGHT, CROUCH_HEIGHT, crouchAmount);
  // No chão, os pés ficam fixos e a câmera desce/sobe; no ar, encolhe as pernas
  if (onground) pos.y += eyeHeight - prevEye;
}

function updateMovement(dt) {
  const now = performance.now();
  const pos = camera.position;
  const w = WEAPONS[myWeaponKey] || WEAPONS.smg;

  const forwardVec = _forwardVec.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  const rightVec = _rightVec.crossVectors(forwardVec, UP);
  const wish = _wish.set(0, 0, 0);
  if (move.forward) wish.add(forwardVec);
  if (move.back) wish.sub(forwardVec);
  if (move.right) wish.add(rightVec);
  if (move.left) wish.sub(rightVec);
  if (wish.lengthSq() > 0) wish.normalize();

  updateCrouch(dt);

  const horizSpeed = Math.hypot(velocity.x, velocity.z);
  const canJump = onground || now - lastGroundedAt < COYOTE_TIME;
  const wantsJump = move.jumpHeld || now - jumpBufferedAt < JUMP_BUFFER;

  // Slide: precisa soltar e apertar agachar de novo para outro (sem slide infinito).
  // Apertar agachar no ar e pousar rápido também emenda um slide.
  if (!move.crouchHeld) slide.ready = true;
  if (onground && move.crouchHeld && slide.ready && !slide.active && horizSpeed > SLIDE_MIN_SPEED) {
    slide.active = true;
    slide.ready = false;
    slide.time = SLIDE_DURATION;
    const dir = _tmp.set(velocity.x, 0, velocity.z).normalize();
    velocity.x += dir.x * SLIDE_BOOST;
    velocity.z += dir.z * SLIDE_BOOST;
    playSlideSound();
  }
  if (slide.active) {
    slide.time -= dt;
    if (slide.time <= 0 || !move.crouchHeld || horizSpeed < 3) slide.active = false;
  }

  if (grapple.active) {
    updateGrapplePhysics(wish, dt);
  } else if (onground) {
    if (wantsJump && canJump) {
      // Bunny hop: pula no mesmo frame do pouso, sem aplicar atrito
      velocity.y = JUMP_FORCE;
      onground = false;
      jumpBufferedAt = -1e9;
      lastGroundedAt = 0;
      if (slide.active) slide.active = false;
      playJumpSound();
    } else {
      applyFriction(slide.active ? SLIDE_FRICTION : FRICTION, dt);
      let maxSpeed = (crouchAmount > 0.5 ? CROUCH_SPEED : GROUND_SPEED) * (w.moveSpeed || 1);
      if (isAiming()) maxSpeed *= 0.7;
      if (!slide.active) accelerate(wish, maxSpeed, GROUND_ACCEL, dt);
      else accelerate(wish, 1.5, 6, dt); // pequeno controle durante o slide
    }
  } else {
    if (wantsJump && canJump) {
      velocity.y = JUMP_FORCE;
      jumpBufferedAt = -1e9;
      lastGroundedAt = 0;
    }
    accelerate(wish, AIR_SPEED_CAP, AIR_ACCEL, dt);
  }

  velocity.y += GRAVITY * dt;

  // Limite de velocidade horizontal (evita valores absurdos)
  const hs = Math.hypot(velocity.x, velocity.z);
  if (hs > MAX_HORIZONTAL_SPEED) {
    velocity.x *= MAX_HORIZONTAL_SPEED / hs;
    velocity.z *= MAX_HORIZONTAL_SPEED / hs;
  }

  // Movimento horizontal eixo a eixo (desliza nas paredes)
  const nextX = THREE.MathUtils.clamp(pos.x + velocity.x * dt, -mapBounds, mapBounds);
  const nextZ = THREE.MathUtils.clamp(pos.z + velocity.z * dt, -mapBounds, mapBounds);
  let hitWall = false;
  if (!collidesWithObstacles(nextX, pos.y, pos.z)) pos.x = nextX;
  else { velocity.x = 0; hitWall = true; }
  if (!collidesWithObstacles(pos.x, pos.y, nextZ)) pos.z = nextZ;
  else { velocity.z = 0; hitWall = true; }

  // Vertical, com teto
  const targetY = pos.y + velocity.y * dt;
  if (velocity.y > 0 && collidesWithObstacles(pos.x, targetY, pos.z)) {
    velocity.y = 0;
  } else {
    pos.y = targetY;
  }

  if (grapple.active) applyRopeConstraint(hitWall);

  const wasOnGround = onground;
  const fallSpeed = -velocity.y;
  const floor = groundHeightAt(pos.x, pos.y, pos.z) + eyeHeight;
  if (pos.y <= floor) {
    pos.y = floor;
    if (!wasOnGround && fallSpeed > 6) {
      vm.landDip = Math.min(fallSpeed * 0.006, 0.08);
      viewPunch.pitch -= Math.min(fallSpeed * 0.003, 0.04);
      playLandSound(fallSpeed);
    }
    velocity.y = 0;
    onground = true;
    lastGroundedAt = now;
  } else {
    onground = false;
  }

  if (pos.y < -20) pos.y = 20; // segurança: caiu para fora do mapa
  sendMove();
}

// =============================================================================
// GANCHO COM FÍSICA DE CORDA (PÊNDULO)
// =============================================================================
// Segure o clique para ficar preso: a corda tem comprimento máximo (vira um
// pêndulo com a gravidade), recolhe aos poucos e WASD empurra o balanço.
// Soltar o clique mantém o impulso; pular solta com um empurrão para cima.
const grapple = {
  active: false,
  anchor: new THREE.Vector3(),
  length: 0,
  rope: null,
};
const GRAPPLE_RANGE = 60;
const GRAPPLE_REEL_SPEED = 3.5;
const GRAPPLE_MIN_LENGTH = 3;
const GRAPPLE_SWING_ACCEL = 9;
const ROPE_SEGMENTS = 16;

function fireGrapple() {
  const dir = camera.getWorldDirection(_tmp);
  raycaster.set(camera.position, dir);
  raycaster.far = GRAPPLE_RANGE;
  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length === 0) {
    playEmptySound();
    return;
  }
  releaseGrapple(false);
  grapple.active = true;
  grapple.anchor.copy(hits[0].point);
  grapple.length = camera.position.distanceTo(grapple.anchor);

  if (!grapple.rope) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ROPE_SEGMENTS + 1) * 3), 3));
    grapple.rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x38ef7d }));
    grapple.rope.frustumCulled = false;
  }
  scene.add(grapple.rope);

  // Puxão inicial em direção ao ponto
  const pull = _tmp.copy(grapple.anchor).sub(camera.position).normalize();
  velocity.addScaledVector(pull, 6);
  if (onground) velocity.y = Math.max(velocity.y, 4);
  onground = false;

  emitParticles(grapple.anchor, pull.clone().negate(), { count: 10, color: 0x9ae6b4, speed: 4, life: 0.35, size: 0.06 });
  playGrappleSound();
  socket.emit('grapple', { x: grapple.anchor.x, y: grapple.anchor.y, z: grapple.anchor.z });
}

function releaseGrapple(jumpBoost) {
  if (!grapple.active) return;
  grapple.active = false;
  if (grapple.rope && grapple.rope.parent) grapple.rope.parent.remove(grapple.rope);
  if (jumpBoost) velocity.y = Math.max(velocity.y + 3, JUMP_FORCE * 0.85);
  if (socket) socket.emit('grappleRelease');
}

function updateGrapplePhysics(wish, dt) {
  if (move.jumpHeld && performance.now() - jumpBufferedAt < 200) {
    jumpBufferedAt = -1e9;
    releaseGrapple(true);
    return;
  }
  // Recolhe a corda enquanto segura
  grapple.length = Math.max(GRAPPLE_MIN_LENGTH, grapple.length - GRAPPLE_REEL_SPEED * dt);
  // Controle do balanço: empurra perpendicular à corda
  const ropeDir = _tmp.copy(grapple.anchor).sub(camera.position).normalize();
  const push = wish.clone().addScaledVector(ropeDir, -wish.dot(ropeDir));
  velocity.addScaledVector(push, GRAPPLE_SWING_ACCEL * dt);
  // Pouco arrasto do ar para o pêndulo não crescer infinitamente
  velocity.multiplyScalar(1 - 0.05 * dt);
  onground = false;
}

// Corda inextensível: se passou do comprimento, volta para a esfera e perde a
// velocidade que apontava para fora (é isso que transforma queda em balanço)
function applyRopeConstraint(hitWall) {
  const pos = camera.position;
  const toAnchor = _tmp.copy(grapple.anchor).sub(pos);
  const dist = toAnchor.length();
  if (dist < 1.2) { releaseGrapple(false); return; }
  if (dist <= grapple.length) return;
  const dir = toAnchor.divideScalar(dist);
  const radial = velocity.dot(dir); // >0 = indo em direção ao ponto
  if (radial < 0) velocity.addScaledVector(dir, -radial);
  const excess = dist - grapple.length;
  const tx = pos.x + dir.x * excess;
  const ty = pos.y + dir.y * excess;
  const tz = pos.z + dir.z * excess;
  if (!collidesWithObstacles(tx, ty, tz)) pos.set(tx, ty, tz);
  else if (hitWall) grapple.length = dist; // preso na parede: corda acompanha
}

// Corda visual: reta quando esticada, com barriga quando frouxa
const _ropeStart = new THREE.Vector3();
function updateGrappleRope() {
  if (!grapple.active || !grapple.rope) return;
  getMuzzleWorldPos(_ropeStart);
  const arr = grapple.rope.geometry.attributes.position.array;
  const dist = _ropeStart.distanceTo(grapple.anchor);
  const slack = Math.max(0, grapple.length - dist) * 0.6;
  for (let i = 0; i <= ROPE_SEGMENTS; i++) {
    const t = i / ROPE_SEGMENTS;
    const sag = Math.sin(t * Math.PI) * slack;
    arr[i * 3] = _ropeStart.x + (grapple.anchor.x - _ropeStart.x) * t;
    arr[i * 3 + 1] = _ropeStart.y + (grapple.anchor.y - _ropeStart.y) * t - sag;
    arr[i * 3 + 2] = _ropeStart.z + (grapple.anchor.z - _ropeStart.z) * t;
  }
  grapple.rope.geometry.attributes.position.needsUpdate = true;
}

// =============================================================================
// TIRO: DISPERSÃO, RECUO, CHUMBOS, IMPACTOS
// =============================================================================
const raycaster = new THREE.Raycaster();
let lastLocalShot = 0;
let recoilDebt = 0;      // quanto o recuo subiu a mira (volta aos poucos)
let lastRecoilAt = 0;
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

// Dispersão atual em radianos (movimento e pulo atrapalham a mira do quadril)
function currentSpread() {
  const w = WEAPONS[myWeaponKey];
  if (!w || w.isMelee || w.isUtility) return 0;
  const ads = vm.ads;
  let spread = THREE.MathUtils.lerp(w.spread, w.adsSpread, ads);
  const speed = Math.hypot(velocity.x, velocity.z);
  const moving = Math.min(speed / GROUND_SPEED, 1.5) * 0.02;
  const air = onground ? 0 : 0.03;
  spread += (moving + air) * (1 - ads * 0.7);
  if (crouchAmount > 0.5 && onground) spread *= 0.75;
  return spread;
}

function attemptAction() {
  const w = WEAPONS[myWeaponKey];
  if (!w || !myAlive || vm.drawT < 0.6) return;
  const now = performance.now();
  if (now - lastLocalShot < w.fireRate) return;

  if (w.isUtility) {
    lastLocalShot = now;
    fireGrapple();
    return;
  }
  if (w.isMelee) {
    lastLocalShot = now;
    startKnifeSwing();
    return;
  }
  if (reloading) return;
  if (w.maxAmmo !== Infinity && myAmmo[myWeaponKey] <= 0) {
    lastLocalShot = now;
    playEmptySound();
    tryReload();
    return;
  }
  lastLocalShot = now;
  doShoot(w);
}

function doShoot(w) {
  const key = myWeaponKey;
  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  _right.crossVectors(_dir, UP).normalize();
  _up.crossVectors(_right, _dir).normalize();

  // Hitboxes dos jogadores visíveis
  const playerTargets = [];
  const meshToId = new Map();
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    if (!rp.group.visible) continue;
    for (const mesh of rp.hitMeshes) {
      playerTargets.push(mesh);
      meshToId.set(mesh, id);
    }
  }

  const spread = currentSpread();
  const pellets = w.pellets || 1;
  const hits = [];
  const ends = [];
  let meleeHitWall = false;
  getMuzzleWorldPos(_muzzle);

  for (let i = 0; i < pellets; i++) {
    // Direção aleatória dentro de um cone (distribuição uniforme no disco)
    const r = spread * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    const dir = _tmp.copy(_dir)
      .addScaledVector(_right, Math.cos(a) * r)
      .addScaledVector(_up, Math.sin(a) * r)
      .normalize();
    raycaster.set(camera.position, dir);
    raycaster.far = w.isMelee ? 3.2 : 250;

    const playerHit = raycaster.intersectObjects(playerTargets, false)[0];
    const wallHit = raycaster.intersectObjects(obstacles, false)[0];

    let end;
    if (playerHit && (!wallHit || playerHit.distance < wallHit.distance)) {
      end = playerHit.point;
      hits.push({ id: meshToId.get(playerHit.object), head: !!playerHit.object.userData.isHead });
      // Faca: espirra sangue na hora, sem esperar o servidor
      if (w.isMelee) spawnBloodHit(end, !!playerHit.object.userData.isHead);
    } else if (wallHit) {
      end = wallHit.point;
      meleeHitWall = w.isMelee;
      if (wallHit.face) {
        _normal.copy(wallHit.face.normal).transformDirection(wallHit.object.matrixWorld);
        spawnImpact(end, _normal, wallHit.object.material.color.getHex());
      }
    } else {
      end = camera.position.clone().addScaledVector(dir, w.isMelee ? 3.2 : 150);
    }
    ends.push({ x: end.x, y: end.y, z: end.z });
    if (!w.isMelee) spawnBulletTracer(_muzzle, end, w.tracerColor, pellets > 1 ? 0.012 : 0.022);
  }

  socket.emit('shoot', { hits, ends });

  if (myAmmo[key] !== undefined && myAmmo[key] !== -1) {
    myAmmo[key] = Math.max(myAmmo[key] - 1, 0);
    refreshWeaponHud();
  }

  // Feedback: clarão, luz, recuo, som
  if (w.isMelee) {
    onKnifeResult(hits.length > 0, meleeHitWall);
  } else {
    triggerMuzzleFlash(vm.flash, 0.05, pellets > 1 ? 0.6 : 0.38);
    muzzleLight.position.copy(_muzzle);
    muzzleLight.intensity = pellets > 1 ? 3 : 2;
    vm.kick += w.kick || 0.05;
    vm.kickRot += (w.kick || 0.05) * 1.2;
    const recoil = (w.recoil || 0.01) * (1 - vm.ads * 0.45) * (0.8 + Math.random() * 0.4);
    cameraPitch = Math.min(MAX_PITCH, cameraPitch + recoil);
    cameraYaw += (Math.random() - 0.5) * recoil * 0.5;
    recoilDebt += recoil;
    lastRecoilAt = performance.now();
    viewPunch.pitch += recoil * 0.6;
  }
  if (!w.isMelee) playShotSound(key, 1, 0); // o som da faca sai em startKnifeSwing

  // Recarrega sozinho quando o pente acaba
  if (w.maxAmmo !== Infinity && myAmmo[key] === 0) setTimeout(tryReload, 250);
}

// A mira volta parcialmente depois de parar de atirar
function updateRecoil(dt) {
  if (recoilDebt <= 0) return;
  if (performance.now() - lastRecoilAt < 90) return;
  const back = Math.min(recoilDebt, recoilDebt * 9 * dt + 0.01 * dt);
  recoilDebt -= back;
  cameraPitch = Math.max(-MAX_PITCH, cameraPitch - back * 0.8);
}

// Auto-fire para armas automáticas — chamado pelo loop principal
function updateAutoFire() {
  if (!mouseHeld || !myAlive || !controls.isLocked) return;
  const w = WEAPONS[myWeaponKey];
  if (w && w.auto) attemptAction();
}

// =============================================================================
// LOOP PRINCIPAL E ANIMAÇÕES
// =============================================================================
let hudTick = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (joined && myAlive && gameStatus === 'playing' && controls.isLocked) {
    updateMovement(dt);
    updateAutoFire();
  } else if (joined && myAlive && gameStatus === 'playing') {
    // Sem foco: a física continua (cai e para no chão), mas sem comandos
    const saved = { ...move };
    Object.keys(move).forEach((k) => { move[k] = false; });
    updateMovement(dt);
    Object.assign(move, saved);
  }

  // Câmera de morte: vira devagar para quem te eliminou
  if (!myAlive && deathFocus) {
    const target = Math.atan2(-(deathFocus.x - camera.position.x), -(deathFocus.z - camera.position.z));
    cameraYaw = angleLerp(cameraYaw, target, Math.min(dt * 3, 1));
    cameraPitch = THREE.MathUtils.damp(cameraPitch, -0.1, 3, dt);
  }

  updateRecoil(dt);
  applyCameraRotation(dt);
  updateViewModel(dt);
  updateGrappleRope();
  muzzleLight.intensity = THREE.MathUtils.damp(muzzleLight.intensity, 0, 30, dt);
  updateEffects(dt);
  updateRemotePlayers(dt);
  updateNameTags();

  // HUD em ritmo menor
  const heldWeapon = WEAPONS[myWeaponKey];
  renderCrosshair({
    spreadPx: currentSpread() * window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))),
    hidden: aimUi.scoped || !myAlive,
    // Mirando com alça/red dot a mira da arma substitui a da tela
    adsHidden: vm.ads > 0.55 && !!(vm.weapon && vm.weapon.sight),
    spreadCircle: !!heldWeapon && heldWeapon.pellets > 1,
    cfg: userSettings.crosshair,
  });
  if (++hudTick % 6 === 0) renderSpeed(myAlive ? Math.hypot(velocity.x, velocity.z) : 0);

  renderer.render(scene, camera);
}

// Menor diferença entre dois ângulos (evita girar 360° ao cruzar ±PI)
function angleLerp(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// Interpolação por snapshots: renderiza os outros jogadores ~100ms no passado,
// sempre entre duas posições reais recebidas do servidor.
function updateRemotePlayers(dt) {
  const renderTime = serverTimeOffset === null ? 0 : performance.now() + serverTimeOffset - INTERP_DELAY;

  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    const buf = rp.buffer;
    if (buf.length === 0 || !rp.group.visible) continue;

    while (buf.length >= 2 && buf[1].t <= renderTime) buf.shift();

    const prevX = rp.group.position.x;
    const prevZ = rp.group.position.z;
    const a = buf[0];
    const b = buf[1];
    let pitch = a.pitch;
    let crouch = a.crouch;
    if (b && renderTime > a.t) {
      const t = Math.min((renderTime - a.t) / (b.t - a.t), 1);
      rp.group.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      rp.group.rotation.y = angleLerp(a.rotY, b.rotY, t);
      pitch = a.pitch + (b.pitch - a.pitch) * t;
      crouch = a.crouch + (b.crouch - a.crouch) * t;
    } else {
      rp.group.position.set(a.x, a.y, a.z);
      rp.group.rotation.y = a.rotY;
    }

    const safeDt = Math.max(dt, 0.001);
    const speed = Math.hypot(rp.group.position.x - prevX, rp.group.position.z - prevZ) / safeDt;
    const vy = (rp.group.position.y - rp.anim.lastY) / safeDt;
    rp.anim.lastY = rp.group.position.y;
    rp.anim.pitch = pitch;
    rp.anim.crouch = crouch;
    animateRemote(rp, dt, speed, vy);

    // Corda do gancho dos outros jogadores
    if (rp.rope && rp.grappleAnchor) {
      const from = getRemoteMuzzlePos(rp, _ropeStart);
      const arr = rp.rope.geometry.attributes.position.array;
      arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
      arr[3] = rp.grappleAnchor.x; arr[4] = rp.grappleAnchor.y; arr[5] = rp.grappleAnchor.z;
      rp.rope.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// =============================================================================
// NOMES E VIDA SOBRE OS JOGADORES
// =============================================================================
const LOS_CHECK_INTERVAL = 100; // ms entre testes de linha de visão por jogador
const nameTagRaycaster = new THREE.Raycaster();
const _viewDir = new THREE.Vector3();
const _headPos = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();

function updateNameTags() {
  const now = performance.now();
  camera.getWorldDirection(_viewDir);

  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    let show = rp.group.visible;

    if (show) {
      _headPos.copy(rp.group.position);
      _headPos.y += 2.35 - rp.anim.crouch * 0.42;
      _toPlayer.copy(_headPos).sub(camera.position);
      const dist = _toPlayer.length();
      _toPlayer.divideScalar(dist || 1);
      show = dist <= 100 && _viewDir.dot(_toPlayer) > 0;

      // Esconde o nome atrás de paredes (raycast caro: só a cada 100ms)
      if (show && now >= rp.losCheckAt) {
        rp.losCheckAt = now + LOS_CHECK_INTERVAL;
        nameTagRaycaster.set(camera.position, _toPlayer);
        nameTagRaycaster.far = dist;
        const hits = nameTagRaycaster.intersectObjects(obstacles, false);
        rp.losVisible = !hits.some((hit) => hit.distance > 0.35 && hit.distance < dist - 0.25);
      }
      show = show && rp.losVisible;
    }

    if (show) {
      _headPos.project(camera);
      show = _headPos.z >= -1 && _headPos.z <= 1 && Math.abs(_headPos.x) <= 1 && Math.abs(_headPos.y) <= 1;
    }

    if (!show) {
      if (rp.tag.style.display !== 'none') rp.tag.style.display = 'none';
      continue;
    }
    rp.tag.style.display = '';
    rp.tag.style.left = `${(_headPos.x * 0.5 + 0.5) * window.innerWidth}px`;
    rp.tag.style.top = `${(-_headPos.y * 0.5 + 0.5) * window.innerHeight}px`;
    const hp = Math.max(0, Math.min(rp.data.health ?? 100, 100));
    rp.healthFill.style.width = `${hp}%`;
    rp.healthFill.classList.toggle('low', hp <= 35);
  }
}
