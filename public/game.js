// =============================================================================
// ESTADO GLOBAL
// =============================================================================
let scene, camera, renderer;
let obstacles = [];
let mapBounds = 38.5;
let socket;
let myId = null;
let joined = false;

const remotePlayers = {}; // id -> { group, hitMeshes, materials, buffer, data, animTime, flashTimeout, tag }
const bulletTracers = []; // { mesh, spark, life, maxLife }
const nameTagsDiv = document.createElement('div');
nameTagsDiv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;';
document.body.appendChild(nameTagsDiv);
const damageNumbersDiv = document.createElement('div');
damageNumbersDiv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;';
document.body.appendChild(damageNumbersDiv);

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
let cameraShake = 0;
let deathCountdownInterval = null;
let reloadStartTime = 0;
let mySpawnSeq = 0;        // invalida pacotes de movimento de antes do respawn
let myName = 'Jogador';

let cameraPitch = 0; // rotação vertical (X)
let cameraYaw = 0;   // rotação horizontal (Y)
let cameraShakeAngle = 0; // roll suave (Z)
const MAX_PITCH = Math.PI / 2 - 0.03; // ~88.3 graus -> IMPEDE 100% DE VIRAR DE CABEÇA PRA BAIXO

let gameStatus = 'playing';
let currentMapId = 'arena';

const clock = new THREE.Clock();

// =============================================================================
// CONFIGURAÇÕES (SENSIBILIDADE X/Y, MIRA E KEYBINDS)
// =============================================================================
const DEFAULT_SETTINGS = {
  sensX: 1.0,
  sensY: 1.0,
  sensAimX: 0.75,
  sensAimY: 0.75,
  invertY: false,
  keybinds: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    reload: 'KeyR',
    slot1: 'Digit1',
    slot2: 'Digit2',
    knife: 'Digit3',
    grapple: 'KeyG',
    loadout: 'KeyB',
    reset: 'KeyP',
    score: 'Tab'
  }
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
        keybinds: { ...DEFAULT_SETTINGS.keybinds, ...(parsed.keybinds || {}) }
      };
    }
  } catch (e) { }
}

function saveSettings() {
  try {
    localStorage.setItem('fps_game_settings', JSON.stringify(userSettings));
  } catch (e) { }
}

function formatKeyCode(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  switch (code) {
    case 'Space': return 'Espaço';
    case 'Tab': return 'Tab';
    case 'ShiftLeft': return 'Shift Esq';
    case 'ShiftRight': return 'Shift Dir';
    case 'ControlLeft': return 'Ctrl Esq';
    case 'ControlRight': return 'Ctrl Dir';
    case 'AltLeft': return 'Alt Esq';
    case 'AltRight': return 'Alt Dir';
    case 'CapsLock': return 'Caps';
    case 'Enter': return 'Enter';
    case 'Backspace': return 'Backspace';
    case 'ArrowUp': return '↑ Cima';
    case 'ArrowDown': return '↓ Baixo';
    case 'ArrowLeft': return '← Esq';
    case 'ArrowRight': return '→ Dir';
    default: return code;
  }
}

function initSettingsUI() {
  loadSavedSettings();
  syncSettingsToUI();

  // Abas
  const tabMouseBtn = document.getElementById('tabMouseBtn');
  const tabKeysBtn = document.getElementById('tabKeysBtn');
  const tabMouseContent = document.getElementById('tabMouseContent');
  const tabKeysContent = document.getElementById('tabKeysContent');

  if (tabMouseBtn && tabKeysBtn) {
    tabMouseBtn.addEventListener('click', () => {
      tabMouseBtn.classList.add('active');
      tabKeysBtn.classList.remove('active');
      tabMouseContent.classList.remove('hidden');
      tabKeysContent.classList.add('hidden');
    });

    tabKeysBtn.addEventListener('click', () => {
      tabKeysBtn.classList.add('active');
      tabMouseBtn.classList.remove('active');
      tabKeysContent.classList.remove('hidden');
      tabMouseContent.classList.add('hidden');
    });
  }

  // Sliders e inputs de sensibilidade
  const setupRangePair = (rangeId, numId, settingKey) => {
    const range = document.getElementById(rangeId);
    const num = document.getElementById(numId);
    if (!range || !num) return;
    range.addEventListener('input', () => {
      num.value = range.value;
      userSettings[settingKey] = parseFloat(range.value);
    });
    num.addEventListener('input', () => {
      let v = parseFloat(num.value);
      if (isNaN(v)) v = 1.0;
      range.value = v;
      userSettings[settingKey] = v;
    });
  };

  setupRangePair('sensXRange', 'sensXNum', 'sensX');
  setupRangePair('sensYRange', 'sensYNum', 'sensY');
  setupRangePair('sensAimXRange', 'sensAimXNum', 'sensAimX');
  setupRangePair('sensAimYRange', 'sensAimYNum', 'sensAimY');

  const invertYCheck = document.getElementById('invertYCheck');
  if (invertYCheck) {
    invertYCheck.addEventListener('change', () => {
      userSettings.invertY = invertYCheck.checked;
    });
  }

  // Botões de rebind de teclas
  document.querySelectorAll('.keybindBtn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.keybindBtn').forEach(b => b.classList.remove('listening'));
      rebindingAction = btn.dataset.action;
      btn.classList.add('listening');
      btn.textContent = 'Pressione...';
    });
  });

  // Modais
  const settingsModal = document.getElementById('settingsModal');
  const openModal = () => {
    if (controls) controls.unlock();
    syncSettingsToUI();
    settingsModal.classList.remove('hidden');
  };
  const closeModal = () => {
    if (rebindingAction) {
      rebindingAction = null;
      syncSettingsToUI();
    }
    saveSettings();
    settingsModal.classList.add('hidden');
  };

  document.getElementById('openSettingsLobbyBtn')?.addEventListener('click', openModal);
  document.getElementById('openSettingsHudBtn')?.addEventListener('click', openModal);
  document.getElementById('closeSettingsXBtn')?.addEventListener('click', closeModal);
  document.getElementById('saveSettingsBtn')?.addEventListener('click', closeModal);

  document.getElementById('resetSettingsBtn')?.addEventListener('click', () => {
    userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveSettings();
    syncSettingsToUI();
  });
}

function syncSettingsToUI() {
  const setPair = (rangeId, numId, val) => {
    const range = document.getElementById(rangeId);
    const num = document.getElementById(numId);
    if (range) range.value = val;
    if (num) num.value = val;
  };
  setPair('sensXRange', 'sensXNum', userSettings.sensX);
  setPair('sensYRange', 'sensYNum', userSettings.sensY);
  setPair('sensAimXRange', 'sensAimXNum', userSettings.sensAimX);
  setPair('sensAimYRange', 'sensAimYNum', userSettings.sensAimY);

  const invertYCheck = document.getElementById('invertYCheck');
  if (invertYCheck) invertYCheck.checked = !!userSettings.invertY;

  document.querySelectorAll('.keybindBtn').forEach((btn) => {
    btn.classList.remove('listening');
    const act = btn.dataset.action;
    btn.textContent = formatKeyCode(userSettings.keybinds[act]);
  });
}

// Inicializa configurações assim que o script é carregado
initSettingsUI();

// =============================================================================
// POINTER LOCK & CÂMERA CONTROLLER
// =============================================================================
function applyCameraRotation() {
  if (!camera) return;
  camera.rotation.set(cameraPitch, cameraYaw, cameraShakeAngle, 'YXZ');
}

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
    if (document.exitPointerLock) document.exitPointerLock();
  },
  _listeners: { lock: [], unlock: [] },
  addEventListener(type, fn) {
    if (this._listeners[type]) this._listeners[type].push(fn);
  },
  _emit(type) {
    if (this._listeners[type]) this._listeners[type].forEach(fn => fn());
  }
};

document.addEventListener('pointerlockchange', () => {
  const isLocked = !!(document.pointerLockElement && (document.pointerLockElement === (renderer ? renderer.domElement : document.body) || document.pointerLockElement === document.body));
  controls.isLocked = isLocked;
  if (isLocked) {
    controls._emit('lock');
  } else {
    aimHeld = false;
    controls._emit('unlock');
  }
});

document.addEventListener('mousemove', (e) => {
  if (!controls || !controls.isLocked) return;
  const weapon = WEAPONS[myWeaponKey];
  const isAiming = aimHeld && controls.isLocked && myAlive && weapon && !weapon.isMelee && !weapon.isUtility;

  const multX = (isAiming ? userSettings.sensAimX : userSettings.sensX) * 0.0022;
  const multY = (isAiming ? userSettings.sensAimY : userSettings.sensY) * 0.0022 * (userSettings.invertY ? -1 : 1);

  const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
  const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

  cameraYaw -= movementX * multX;
  cameraPitch -= movementY * multY;

  // Limite vertical estrito: impede que a câmera inverta ou vire de cabeça para baixo
  cameraPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cameraPitch));

  applyCameraRotation();
});

// =============================================================================
// TELA DE LOADOUT & TROCA DE ARMAS EM JOGO
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

// Troca de armas em jogo sem precisar recarregar a página
let inGameSelectedWeapons = [];

function initInGameLoadoutUI() {
  const pickerEl = document.getElementById('inGameWeaponPicker');
  if (!pickerEl) return;
  pickerEl.innerHTML = '';

  WEAPON_CHOICES.forEach((key) => {
    const w = WEAPONS[key];
    const div = document.createElement('div');
    div.className = 'weaponOption inGameWeaponOption';
    div.dataset.key = key;
    const ammoText = w.maxAmmo === Infinity ? '∞' : w.maxAmmo;
    div.innerHTML = `<div class="wName">${w.name}</div><div class="wStat">Munição: ${ammoText}</div>`;
    div.addEventListener('click', () => toggleInGameWeaponSelect(key, div));
    pickerEl.appendChild(div);
  });

  document.getElementById('openLoadoutHudBtn')?.addEventListener('click', openInGameLoadoutModal);
  document.getElementById('closeLoadoutXBtn')?.addEventListener('click', closeInGameLoadoutModal);
  document.getElementById('cancelLoadoutBtn')?.addEventListener('click', closeInGameLoadoutModal);

  document.getElementById('confirmLoadoutBtn')?.addEventListener('click', () => {
    if (inGameSelectedWeapons.length !== 2) return;
    socket.emit('changeLoadout', { loadout: inGameSelectedWeapons });
    closeInGameLoadoutModal();
  });
}

function openInGameLoadoutModal() {
  if (!joined) return;
  controls.unlock();
  inGameSelectedWeapons = [...myLoadout];
  syncInGameLoadoutOptions();
  document.getElementById('changeLoadoutModal').classList.remove('hidden');
}

function closeInGameLoadoutModal() {
  document.getElementById('changeLoadoutModal').classList.add('hidden');
  if (gameStatus === 'playing' && myAlive) controls.lock();
}

// Algum overlay que precisa do cursor livre está aberto?
function isAnyModalOpen() {
  return ['settingsModal', 'changeLoadoutModal', 'loadoutScreen', 'endScreen', 'voteScreen', 'deathScreen']
    .some((id) => !document.getElementById(id).classList.contains('hidden'));
}

function syncInGameLoadoutOptions() {
  const pickerEl = document.getElementById('inGameWeaponPicker');
  if (!pickerEl) return;
  pickerEl.querySelectorAll('.weaponOption').forEach((div) => {
    const key = div.dataset.key;
    div.classList.toggle('selected', inGameSelectedWeapons.includes(key));
  });
  const confirmBtn = document.getElementById('confirmLoadoutBtn');
  if (confirmBtn) confirmBtn.disabled = inGameSelectedWeapons.length !== 2;
}

function toggleInGameWeaponSelect(key, div) {
  const idx = inGameSelectedWeapons.indexOf(key);
  if (idx >= 0) {
    inGameSelectedWeapons.splice(idx, 1);
  } else {
    if (inGameSelectedWeapons.length >= 2) return;
    inGameSelectedWeapons.push(key);
  }
  syncInGameLoadoutOptions();
}

initInGameLoadoutUI();

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
  scene.background = new THREE.Color(0x82b4dc);
  scene.fog = new THREE.Fog(0x82b4dc, 35, 110);

  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.rotation.order = 'YXZ';
  applyCameraRotation();
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444b59, 0.95);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfffaed, 0.95);
  dirLight.position.set(30, 45, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  // A câmera de sombra padrão cobre só 10x10 unidades; ajusta para o mapa inteiro
  const shadowCam = dirLight.shadow.camera;
  shadowCam.left = -50; shadowCam.right = 50;
  shadowCam.top = 50; shadowCam.bottom = -50;
  shadowCam.near = 1; shadowCam.far = 140;
  shadowCam.updateProjectionMatrix();
  scene.add(dirLight);

  createViewModel();

  document.body.addEventListener('click', () => {
    // Se algum modal ou menu estiver aberto, não trava o cursor
    if (isAnyModalOpen()) return;
    if (gameStatus === 'playing' && myAlive && !controls.isLocked) controls.lock();
  });

  loadMap(currentMapId);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

// Libera geometrias/materiais da GPU (evita vazamento de memória ao trocar de mapa)
function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

function loadMap(mapId) {
  if (!MAP_BUILDERS[mapId]) return;
  detachGrapple(false);
  clearBulletTracers();

  // Remove a geometria do mapa antigo (mantém luzes, câmera e jogadores remotos)
  const remoteGroups = new Set(Object.values(remotePlayers).map((rp) => rp.group));
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj === camera || remoteGroups.has(obj)) continue;
    scene.remove(obj);
    disposeObject(obj);
  }

  const built = MAP_BUILDERS[mapId](scene);
  obstacles = built.obstacles;
  mapBounds = built.bounds || 38.5;
  currentMapId = mapId;
  document.getElementById('mapName').textContent = MAP_NAMES[mapId] || mapId;

  // Pré-calcula a Bounding Box 3D de cada obstáculo e congela a matriz (são estáticos)
  for (const box of obstacles) {
    box.updateMatrixWorld(true);
    box.matrixAutoUpdate = false;
    box.userData.bbox = new THREE.Box3().setFromObject(box);
  }
}

const MAP_NAMES = { arena: 'Arena Clássica', cidade: 'Cidade Pequena', deserto: 'Dunas do Deserto', neve: 'Campo de Neve' };

// =============================================================================
// MODELOS EM PRIMEIRA PESSOA (VIEWMODEL DE ARMAS DETALHADAS)
// =============================================================================
function createViewModel() {
  viewModel = new THREE.Group();
  camera.add(viewModel);

  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7, metalness: 0.1 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd49a70, roughness: 0.9 });
  const watchMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  const upperArmGeo = new THREE.BoxGeometry(0.18, 0.36, 0.2);
  const forearmGeo = new THREE.BoxGeometry(0.16, 0.38, 0.17);
  const handGeo = new THREE.BoxGeometry(0.18, 0.16, 0.22);
  const thumbGeo = new THREE.BoxGeometry(0.08, 0.12, 0.1);

  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.32, -0.3, -0.48);

    const upper = new THREE.Mesh(upperArmGeo, sleeveMat);
    upper.position.set(0, -0.16, 0);

    const forearm = new THREE.Mesh(forearmGeo, sleeveMat);
    forearm.position.set(side * -0.09, -0.47, -0.14);
    forearm.rotation.z = side * 0.22;

    const hand = new THREE.Mesh(handGeo, gloveMat);
    hand.position.set(side * -0.13, -0.68, -0.22);
    hand.rotation.z = side * 0.18;

    const thumb = new THREE.Mesh(thumbGeo, skinMat);
    thumb.position.set(side * -0.08, -0.66, -0.26);

    // Relógio tático no braço esquerdo
    if (side === -1) {
      const watch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.19), watchMat);
      watch.position.set(-0.11, -0.58, -0.18);
      const watchScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), screenMat);
      watchScreen.position.set(-0.11, -0.58, -0.08);
      pivot.add(watch, watchScreen);
    }

    pivot.add(upper, forearm, hand, thumb);
    viewModel.add(pivot);
    return pivot;
  };

  leftArmPivot = makeArm(-1);
  rightArmPivot = makeArm(1);
  updateWeaponModel();
}

function updateWeaponModel() {
  if (!viewModel) return;
  if (weaponModel) {
    viewModel.remove(weaponModel);
    disposeObject(weaponModel);
  }
  weaponModel = new THREE.Group();

  const w = WEAPONS[myWeaponKey] || WEAPONS.smg;
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.4, metalness: 0.8 });
  const gunBody = new THREE.MeshStandardMaterial({ color: 0x272b36, roughness: 0.6, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: w.color || 0x4ade80, roughness: 0.4, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd4, roughness: 0.25, metalness: 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x22cc88 });

  const addPart = (geo, mat, x, y, z, rotX = 0, rotY = 0, rotZ = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rotX) mesh.rotation.x = rotX;
    if (rotY) mesh.rotation.y = rotY;
    if (rotZ) mesh.rotation.z = rotZ;
    weaponModel.add(mesh);
    return mesh;
  };

  const gx = 0.26;
  const gy = -0.42;

  if (myWeaponKey === 'knife') {
    addPart(new THREE.BoxGeometry(0.08, 0.11, 0.32), darkMetal, gx, gy - 0.04, -0.62);
    addPart(new THREE.BoxGeometry(0.12, 0.14, 0.05), steelMat, gx, gy - 0.03, -0.78);
    addPart(new THREE.BoxGeometry(0.04, 0.12, 0.45), steelMat, gx, gy - 0.01, -1.02);
    addPart(new THREE.BoxGeometry(0.02, 0.08, 0.38), accentMat, gx, gy - 0.01, -1.0);
  } else if (myWeaponKey === 'sniper') {
    addPart(new THREE.BoxGeometry(0.18, 0.18, 0.8), gunBody, gx, gy, -0.85);
    addPart(new THREE.BoxGeometry(0.12, 0.24, 0.26), darkMetal, gx, gy - 0.12, -0.65, -0.3);
    addPart(new THREE.BoxGeometry(0.14, 0.28, 0.36), darkMetal, gx, gy - 0.02, -0.42);
    addPart(new THREE.BoxGeometry(0.1, 0.16, 0.14), darkMetal, gx, gy - 0.15, -0.88, 0.15);
    addPart(new THREE.CylinderGeometry(0.038, 0.045, 0.95, 12), steelMat, gx, gy + 0.02, -1.5, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.07, 0.07, 0.12), darkMetal, gx, gy + 0.02, -1.98);
    addPart(new THREE.BoxGeometry(0.06, 0.08, 0.06), darkMetal, gx, gy + 0.13, -0.75);
    addPart(new THREE.BoxGeometry(0.06, 0.08, 0.06), darkMetal, gx, gy + 0.13, -0.95);
    addPart(new THREE.CylinderGeometry(0.06, 0.06, 0.48, 16), darkMetal, gx, gy + 0.18, -0.86, Math.PI / 2);
    addPart(new THREE.CylinderGeometry(0.075, 0.06, 0.12, 16), darkMetal, gx, gy + 0.18, -1.14, Math.PI / 2);
    addPart(new THREE.CircleGeometry(0.068, 16), glassMat, gx, gy + 0.18, -1.2, 0, Math.PI);
  } else if (myWeaponKey === 'grapple') {
    addPart(new THREE.BoxGeometry(0.24, 0.24, 0.48), gunBody, gx, gy, -0.78);
    addPart(new THREE.BoxGeometry(0.12, 0.22, 0.16), darkMetal, gx, gy - 0.14, -0.66, -0.2);
    addPart(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12), glowMat, gx, gy + 0.02, -0.76, Math.PI / 2);
    addPart(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 12), darkMetal, gx, gy + 0.02, -1.02, Math.PI / 2);
    [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((ang) => {
      const px = gx + Math.cos(ang) * 0.11;
      const py = gy + 0.02 + Math.sin(ang) * 0.11;
      addPart(new THREE.BoxGeometry(0.04, 0.04, 0.18), steelMat, px, py, -1.18, 0, 0, ang);
    });
  } else if (myWeaponKey === 'pistol') {
    addPart(new THREE.BoxGeometry(0.14, 0.14, 0.42), darkMetal, gx, gy, -0.78);
    addPart(new THREE.BoxGeometry(0.11, 0.24, 0.16), gunBody, gx, gy - 0.13, -0.68, -0.22);
    addPart(new THREE.BoxGeometry(0.03, 0.08, 0.08), darkMetal, gx, gy - 0.09, -0.76);
    addPart(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 10), steelMat, gx, gy, -1.02, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.03, 0.04, 0.03), accentMat, gx, gy + 0.08, -0.96);
  } else {
    addPart(new THREE.BoxGeometry(0.2, 0.18, 0.62), gunBody, gx, gy, -0.8);
    addPart(new THREE.BoxGeometry(0.12, 0.22, 0.16), darkMetal, gx, gy - 0.14, -0.66, -0.25);
    addPart(new THREE.BoxGeometry(0.09, 0.32, 0.14), darkMetal, gx, gy - 0.2, -0.84, 0.22);
    addPart(new THREE.BoxGeometry(0.11, 0.05, 0.48), accentMat, gx, gy + 0.1, -0.8);
    addPart(new THREE.CylinderGeometry(0.042, 0.042, 0.42, 10), steelMat, gx, gy, -1.22, Math.PI / 2);
    addPart(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 10), darkMetal, gx, gy, -1.44, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.04, 0.07, 0.04), accentMat, gx, gy + 0.12, -1.32);
  }

  viewModel.add(weaponModel);
}

function getViewModelMuzzlePos() {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const isSniper = myWeaponKey === 'sniper';
  const isPistol = myWeaponKey === 'pistol';
  const isKnife = myWeaponKey === 'knife';
  const fDist = isSniper ? 2.0 : (isKnife ? 0.8 : (isPistol ? 1.0 : 1.4));
  return camera.position.clone()
    .add(forward.clone().multiplyScalar(fDist))
    .add(right.clone().multiplyScalar(0.24))
    .add(up.clone().multiplyScalar(-0.2));
}

// =============================================================================
// MODELO DOS OUTROS JOGADORES (SOLDADO TÁTICO LOW-POLY COM ARMAS DETALHADAS)
// =============================================================================
function colorFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return new THREE.Color(`hsl(${Math.abs(hash) % 360}, 72%, 52%)`);
}

function buildPlayerMesh(color) {
  const group = new THREE.Group();
  const materials = [];

  const createMat = (props) => {
    const m = new THREE.MeshStandardMaterial(props);
    m.userData.origColor = m.color.clone();
    materials.push(m);
    return m;
  };

  const suitMat = createMat({ color, roughness: 0.7, metalness: 0.2 });
  const armorMat = createMat({ color: 0x1f242d, roughness: 0.6, metalness: 0.3 });
  const skinMat = createMat({ color: 0xd49a70, roughness: 0.9 });
  const visorMat = createMat({ color: 0x38bdf8, emissive: 0x0f4c6e, roughness: 0.2, metalness: 0.8 });
  const bootMat = createMat({ color: 0x111317, roughness: 0.8 });
  const steelMat = createMat({ color: 0x94a3b8, roughness: 0.3, metalness: 0.8 });

  // 1. CABEÇA / CAPACETE (userData.isHead = true)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.82, 0);

  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), skinMat);
  headMesh.userData.isHead = true;
  headGroup.add(headMesh);

  const helmetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.26, 0.54), armorMat);
  helmetMesh.position.set(0, 0.16, 0);
  helmetMesh.userData.isHead = true;
  headGroup.add(helmetMesh);

  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), visorMat);
  visorMesh.position.set(0, 0.04, -0.25);
  visorMesh.userData.isHead = true;
  headGroup.add(visorMesh);

  const earCom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.14), armorMat);
  earCom.position.set(0.27, 0.04, 0);
  earCom.userData.isHead = true;
  headGroup.add(earCom);

  group.add(headGroup);

  // 2. TRONCO E COLETE TÁTICO
  const bodyGroup = new THREE.Group();
  bodyGroup.position.set(0, 1.1, 0);

  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.4), suitMat);
  torsoMesh.userData.isHead = false;
  bodyGroup.add(torsoMesh);

  const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.65, 0.46), armorMat);
  vestMesh.position.set(0, 0.04, 0);
  vestMesh.userData.isHead = false;
  bodyGroup.add(vestMesh);

  [-0.22, 0.22].forEach((px) => {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.1), armorMat);
    pouch.position.set(px, -0.1, -0.25);
    pouch.userData.isHead = false;
    bodyGroup.add(pouch);
  });

  group.add(bodyGroup);

  // 3. BRAÇOS E ARMAS
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.46, 1.32, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.22), suitMat);
  armL.position.set(0, -0.28, 0);
  armL.userData.isHead = false;
  leftArmGroup.add(armL);
  group.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.46, 1.32, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.22), suitMat);
  armR.position.set(0, -0.28, 0);
  armR.userData.isHead = false;
  rightArmGroup.add(armR);

  const weaponSlot = new THREE.Group();
  weaponSlot.position.set(0, -0.55, -0.2);
  rightArmGroup.add(weaponSlot);
  group.add(rightArmGroup);

  // 4. PERNAS E BOTAS
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.22, 0.65, 0);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.28), suitMat);
  legL.position.set(0, -0.18, 0);
  legL.userData.isHead = false;
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.38), bootMat);
  bootL.position.set(0, -0.56, -0.04);
  bootL.userData.isHead = false;
  leftLegGroup.add(legL, bootL);
  group.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.22, 0.65, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.28), suitMat);
  legR.position.set(0, -0.18, 0);
  legR.userData.isHead = false;
  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.38), bootMat);
  bootR.position.set(0, -0.56, -0.04);
  bootR.userData.isHead = false;
  rightLegGroup.add(legR, bootR);
  group.add(rightLegGroup);

  const updateHeldWeapon = (key) => {
    while (weaponSlot.children.length > 0) {
      const old = weaponSlot.children[0];
      weaponSlot.remove(old);
      // steelMat é compartilhado com o corpo do jogador; descarta só o que é da arma
      old.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material && c.material !== steelMat) c.material.dispose();
      });
    }
    const w = WEAPONS[key] || WEAPONS.smg;
    const wMeshGroup = new THREE.Group();
    const wMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.5 });
    const accMat = new THREE.MeshStandardMaterial({ color: w.color || 0x4ade80 });

    if (key === 'knife') {
      const knifeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.42), steelMat);
      knifeMesh.position.set(0, 0, -0.16);
      wMeshGroup.add(knifeMesh);
    } else if (key === 'sniper') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.85), wMat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8), steelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.04, -0.75);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), accMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.14, -0.2);
      wMeshGroup.add(body, barrel, scope);
    } else if (key === 'grapple') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.4), wMat);
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.15), accMat);
      claw.position.set(0, 0, -0.26);
      wMeshGroup.add(body, claw);
    } else {
      const isPistol = key === 'pistol';
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, isPistol ? 0.32 : 0.55), wMat);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), accMat);
      mag.position.set(0, -0.12, -0.05);
      wMeshGroup.add(body, mag);
    }
    weaponSlot.add(wMeshGroup);
  };

  // Lista fixa de meshes atingíveis (o corpo, sem a arma) para o raycast de tiro
  const hitMeshes = [];
  [headGroup, bodyGroup, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup].forEach((g) => {
    g.children.forEach((c) => { if (c.isMesh) hitMeshes.push(c); });
  });

  updateHeldWeapon('smg');

  return {
    group,
    hitMeshes,
    leftArmGroup,
    leftLegGroup,
    rightLegGroup,
    materials,
    updateHeldWeapon,
  };
}

function addRemotePlayer(p) {
  if (remotePlayers[p.id]) return remotePlayers[p.id];
  const pm = buildPlayerMesh(colorFromId(p.id));
  const feetY = (p.y || PLAYER_HEIGHT) - PLAYER_HEIGHT;
  pm.group.position.set(p.x || 0, feetY, p.z || 0);
  pm.group.rotation.y = p.rotY || 0;
  pm.group.visible = !!p.alive;
  if (p.weaponKey) pm.updateHeldWeapon(p.weaponKey);
  scene.add(pm.group);

  // Nome + barra de vida (elemento reaproveitado a cada frame)
  const tag = document.createElement('div');
  tag.className = 'nameTag';
  tag.style.display = 'none';
  const tagName = document.createElement('div');
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
    buffer: [], // snapshots { t, x, y, z, rotY } para interpolação
    data: { id: p.id, name: p.name || 'Jogador', health: p.health ?? 100, alive: !!p.alive, weaponKey: p.weaponKey || 'smg' },
    animTime: 0,
    flashTimeout: null,
    tag, tagName, healthFill,
    losVisible: true,
    losCheckAt: 0,
  };
  remotePlayers[p.id] = rp;
  return rp;
}

function removeRemotePlayer(id) {
  const rp = remotePlayers[id];
  if (!rp) return;
  clearTimeout(rp.flashTimeout);
  scene.remove(rp.group);
  disposeObject(rp.group);
  rp.tag.remove();
  delete remotePlayers[id];
}

function clearRemotePlayers() {
  for (const id in remotePlayers) removeRemotePlayer(id);
}

function flashPlayerRed(rp) {
  if (!rp || !rp.materials) return;
  rp.materials.forEach((m) => { m.color.setHex(0xff1122); });
  clearTimeout(rp.flashTimeout);
  rp.flashTimeout = setTimeout(() => {
    rp.materials.forEach((m) => {
      if (m.userData.origColor) m.color.copy(m.userData.origColor);
    });
  }, 160);
}

function getRemotePlayerMuzzlePos(rp) {
  if (!rp || !rp.group) return new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rp.group.rotation.y);
  return rp.group.position.clone().add(new THREE.Vector3(0, 1.15, 0)).add(forward.multiplyScalar(0.9));
}

// =============================================================================
// REDE (SOCKET.IO)
// =============================================================================
const MOVE_SEND_INTERVAL = 1000 / 30; // envia posição a 30Hz (antes: todo frame)
const INTERP_DELAY = 100;             // ms de atraso para interpolar entre snapshots
const TELEPORT_DISTANCE = 6;          // acima disso não interpola (respawn)
let serverTimeOffset = null;          // serverTime - performance.now(), suavizado

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function connectSocket(name) {
  myName = name;
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
    // Entra (ou entra de novo após uma queda de conexão)
    socket.emit('join', { name: myName, loadout: myLoadout });
  });
  socket.on('disconnect', () => {
    const status = document.getElementById('networkStatus');
    status.textContent = 'Reconectando...';
    status.className = '';
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
    if (data.game.mapName) document.getElementById('mapName').textContent = data.game.mapName;
    if (gameStatus === 'playing') updateTimerHUD(data.game.timeLeft);

    for (const id in data.players) {
      if (id !== myId) addRemotePlayer(data.players[id]);
    }
    const me = data.players[myId];
    if (me) {
      myWeaponKey = me.weaponKey;
      myAmmo = me.ammo || {};
      myHealth = me.health;
      myAlive = !!me.alive;
      if (myAlive) placeLocalPlayer(me.x, me.y, me.z, me.rotY);
      updateWeaponModel();
    }
    joined = true;
    updateWeaponHUD();
    updateHealthHUD();
  });

  socket.on('playerJoined', (p) => {
    if (p.id !== myId) addRemotePlayer(p);
  });

  socket.on('playerLeft', (id) => removeRemotePlayer(id));

  socket.on('scoreboard', (rows) => {
    for (const row of rows) {
      const rp = remotePlayers[row.id];
      if (rp && rp.data.name !== row.name) {
        rp.data.name = row.name;
        rp.tagName.textContent = row.name;
      }
    }
    updateScoreboardMini(rows);
  });

  // Snapshot compacto: { t, p: [[id, x, y, z, rotY, alive, weaponKey, health], ...] }
  socket.on('state', ({ t, p: list }) => {
    const sample = t - performance.now();
    if (serverTimeOffset === null || sample > serverTimeOffset) serverTimeOffset = sample;
    else serverTimeOffset += (sample - serverTimeOffset) * 0.02;

    for (const [id, x, y, z, rotY, alive, weaponKey, health] of list) {
      if (id === myId) continue;
      const rp = remotePlayers[id] || addRemotePlayer({ id, x, y, z, rotY, alive, weaponKey, health });
      const feetY = y - PLAYER_HEIGHT;
      const last = rp.buffer[rp.buffer.length - 1];
      const wasAlive = rp.data.alive;

      // Respawn ou salto grande: limpa o histórico e posiciona direto (sem "deslizar")
      if (!last || (alive && !wasAlive) || Math.hypot(x - last.x, z - last.z, feetY - last.y) > TELEPORT_DISTANCE) {
        rp.buffer.length = 0;
        rp.group.position.set(x, feetY, z);
        rp.group.rotation.y = rotY;
      }
      if (!last || t > last.t) rp.buffer.push({ t, x, y: feetY, z, rotY });
      if (rp.buffer.length > 20) rp.buffer.shift();

      if (rp.data.weaponKey !== weaponKey) rp.updateHeldWeapon(weaponKey);
      rp.data.weaponKey = weaponKey;
      rp.data.health = health;
      rp.data.alive = !!alive;
      rp.group.visible = !!alive;
    }
  });

  // Ressincronização de munição (ex.: servidor recusou um tiro)
  socket.on('ammoUpdate', ({ ammo }) => {
    myAmmo = ammo;
    updateWeaponHUD();
  });

  socket.on('reloadDone', ({ ammo }) => {
    myAmmo = ammo;
    reloading = false;
    updateWeaponHUD();
  });

  socket.on('loadoutChanged', ({ loadout, weaponKey, ammo }) => {
    myLoadout = loadout;
    myWeaponKey = weaponKey;
    myAmmo = ammo;
    reloading = false;
    detachGrapple(false);
    updateWeaponHUD();
    updateWeaponModel();
  });

  socket.on('playerShot', ({ id, weaponKey, hitPos }) => {
    const rp = remotePlayers[id];
    if (!rp || !rp.group.visible) return;
    const from = getRemotePlayerMuzzlePos(rp);
    const to = hitPos
      ? new THREE.Vector3(hitPos.x, hitPos.y, hitPos.z)
      : from.clone().add(new THREE.Vector3(0, 0, -100).applyAxisAngle(UP, rp.group.rotation.y));
    const w = WEAPONS[weaponKey] || WEAPONS.smg;
    spawnBulletTracer(from, to, w.tracerColor || 0xffea55);
    playShotSound(w, weaponKey, 0.04);
  });

  socket.on('playerDamaged', ({ id, health, attackerId, damage, headshot, attackerPos }) => {
    if (id === myId) {
      myHealth = health;
      updateHealthHUD();
      showDamageFlash();
      showDirectionalDamageIndicator(attackerPos);
      playHurtSound();
      cameraShake = 0.12;
      setRegenActive(false);
    }
    if (remotePlayers[id]) {
      remotePlayers[id].data.health = health;
      flashPlayerRed(remotePlayers[id]);
    }
    if (attackerId === myId) {
      showHitmarker(!!headshot);
      showDamageNumber(id, damage, !!headshot);
      playHitmarkerSound(!!headshot);
    }
  });

  socket.on('playerHealed', ({ id, health }) => {
    if (id === myId) {
      myHealth = health;
      updateHealthHUD();
      setRegenActive(myHealth < 100);
    }
    if (remotePlayers[id]) remotePlayers[id].data.health = health;
  });

  socket.on('playerDied', ({ id, killerId, killerName, damage, headshot, attackerPos, respawnIn }) => {
    if (id === myId) {
      myAlive = false;
      myHealth = 0;
      reloading = false;
      mouseHeld = false;
      velocity.set(0, 0, 0);
      updateHealthHUD();
      controls.unlock();
      setRegenActive(false);
      detachGrapple(false);
      showDirectionalDamageIndicator(attackerPos);
      showDeathScreen(killerName, respawnIn || 5000);
    }
    if (remotePlayers[id]) {
      remotePlayers[id].data.alive = false;
      remotePlayers[id].group.visible = false;
    }
    if (killerId === myId && id !== myId) {
      showHitmarker(!!headshot);
      showDamageNumber(id, damage, !!headshot, true);
      playHitmarkerSound(true);
    }
  });

  socket.on('respawned', ({ x, y, z, rotY, ammo, weaponKey, health, seq }) => {
    mySpawnSeq = seq;
    myAlive = true;
    myAmmo = ammo;
    myWeaponKey = weaponKey;
    myHealth = health ?? 100;
    reloading = false;
    placeLocalPlayer(x, y, z, rotY);
    setRegenActive(false);
    detachGrapple(false);
    updateWeaponHUD();
    updateWeaponModel();
    updateHealthHUD();
    hideDeathScreen();
    if (gameStatus === 'playing' && !isAnyModalOpen()) controls.lock();
  });

  socket.on('killFeed', ({ killerName, victimName, weapon, headshot }) => {
    addKillFeed(`${killerName} ${headshot ? '💀(headshot)' : ''} eliminou ${victimName} — ${weapon}`);
  });

  socket.on('grappleUsed', ({ id, x, y, z }) => {
    if (remotePlayers[id]) drawGrappleLine(getRemotePlayerMuzzlePos(remotePlayers[id]), new THREE.Vector3(x, y, z));
  });

  socket.on('matchTime', ({ timeLeft }) => updateTimerHUD(timeLeft));

  socket.on('matchStarted', ({ mapId, mapName, duration }) => {
    gameStatus = 'playing';
    loadMap(mapId);
    if (mapName) document.getElementById('mapName').textContent = mapName;
    updateTimerHUD(duration);
    clearInterval(voteTimerInterval);
    document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('voteScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  });

  socket.on('matchEnded', ({ scoreboard }) => {
    gameStatus = 'ended';
    myAlive = false;
    mouseHeld = false;
    controls.unlock();
    hideDeathScreen();
    detachGrapple(false);
    document.getElementById('finalScoreBody').innerHTML = scoreboard
      .map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`)
      .join('');
    document.getElementById('endScreen').classList.remove('hidden');
  });

  socket.on('voteStart', ({ options, duration }) => {
    gameStatus = 'voting';
    hideDeathScreen();
    document.getElementById('endScreen').classList.add('hidden');
    const optWrap = document.getElementById('voteOptions');
    optWrap.innerHTML = '';
    options.forEach((opt) => {
      const div = document.createElement('div');
      div.className = 'voteOption';
      const label = document.createElement('span');
      label.textContent = opt.name;
      const action = document.createElement('span');
      action.textContent = 'Votar';
      div.append(label, action);
      div.addEventListener('click', () => {
        socket.emit('vote', { mapId: opt.id });
        [...optWrap.children].forEach((c) => c.classList.remove('voted'));
        div.classList.add('voted');
      });
      optWrap.appendChild(div);
    });
    document.getElementById('voteScreen').classList.remove('hidden');
    setVoteTimer(duration);
  });

  socket.on('voteTime', ({ timeLeft }) => setVoteTimer(timeLeft));
}

function setVoteTimer(seconds) {
  document.getElementById('voteTimer').textContent = `Votação encerra em ${Math.max(seconds, 0)}s`;
}

// Posiciona o jogador local e zera a física (evita herdar velocidade da morte)
function placeLocalPlayer(x, y, z, rotY) {
  camera.position.set(x, y, z);
  velocity.set(0, 0, 0);
  onground = false;
  cameraYaw = rotY ?? cameraYaw;
  cameraPitch = 0;
  applyCameraRotation();
  lastMoveSent = 0;
}

// =============================================================================
// TELA DE MORTE (CONTAGEM DE RESPAWN)
// =============================================================================
// A contagem é calculada a partir de um horário-alvo fixo, então nunca acumula
// intervalos duplicados nem fica negativa.
function showDeathScreen(killerName, respawnInMs) {
  const deathScreen = document.getElementById('deathScreen');
  const countdownEl = document.getElementById('deathCountdown');
  document.getElementById('deathKillerName').textContent = killerName || '—';
  deathScreen.classList.remove('hidden');

  const respawnAt = performance.now() + respawnInMs;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((respawnAt - performance.now()) / 1000));
    countdownEl.textContent = remaining;
    if (remaining <= 0) stopDeathCountdown();
  };
  stopDeathCountdown();
  tick();
  deathCountdownInterval = setInterval(tick, 250);

  document.getElementById('respawnBtn').onclick = () => {
    socket.emit('requestInstantRespawn');
  };
}

function stopDeathCountdown() {
  if (deathCountdownInterval) clearInterval(deathCountdownInterval);
  deathCountdownInterval = null;
}

function hideDeathScreen() {
  stopDeathCountdown();
  document.getElementById('deathScreen').classList.add('hidden');
}

// =============================================================================
// HUD & FEEDBACK VISUAL
// =============================================================================
function updateHealthHUD() {
  const hp = Math.max(myHealth, 0);
  document.getElementById('healthFill').style.width = `${hp}%`;
  document.getElementById('healthText').textContent = hp;

  // Vinheta de pouca vida (sangue na tela)
  const lowVignette = document.getElementById('lowHealthVignette');
  if (hp <= 35 && myAlive) {
    lowVignette.classList.add('critical');
  } else {
    lowVignette.classList.remove('critical');
  }

  if (hp >= 100) setRegenActive(false);
}

function setRegenActive(active) {
  const healIndicator = document.getElementById('healIndicator');
  const regenEffect = document.getElementById('regenEffect');
  if (active) {
    healIndicator.classList.remove('hidden');
    regenEffect.classList.add('active');
  } else {
    healIndicator.classList.add('hidden');
    regenEffect.classList.remove('active');
  }
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
  void hm.offsetWidth;
  hm.classList.add('show');
  if (headshot) hm.classList.add('headshot');
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => hm.classList.remove('show', 'headshot'), 200);
}

function showDamageFlash() {
  const flash = document.getElementById('damageFlash');
  flash.classList.remove('show');
  void flash.offsetWidth;
  flash.classList.add('show');
}

function showDirectionalDamageIndicator(attackerPos) {
  if (!attackerPos) return;
  const wrap = document.getElementById('damageIndicatorWrap');
  if (!wrap) return;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const toAttacker = new THREE.Vector3(attackerPos.x - camera.position.x, 0, attackerPos.z - camera.position.z).normalize();
  const angle = Math.atan2(toAttacker.x, toAttacker.z) - Math.atan2(forward.x, forward.z);
  const angleDeg = (angle * 180 / Math.PI + 180) % 360;

  const indicator = document.createElement('div');
  indicator.className = 'directionalIndicator';
  indicator.style.transform = `rotate(${angleDeg}deg)`;
  wrap.appendChild(indicator);
  setTimeout(() => indicator.remove(), 800);
}

function showDamageNumber(id, damage, headshot, eliminated = false) {
  const rp = remotePlayers[id];
  if (!rp || !damage) return;
  const pos = rp.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)).project(camera);
  if (pos.z < -1 || pos.z > 1 || Math.abs(pos.x) > 1 || Math.abs(pos.y) > 1) return;
  const el = document.createElement('div');
  el.className = `damageNumber${headshot ? ' headshot' : ''}${eliminated ? ' eliminated' : ''}`;
  el.textContent = eliminated ? `+${damage} 💥 ELIMINADO` : (headshot ? `🎯 -${damage}` : `-${damage}`);
  el.style.left = `${(pos.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-pos.y * 0.5 + 0.5) * window.innerHeight}px`;
  damageNumbersDiv.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

// Atualizado só quando o placar muda (antes: 20x por segundo)
function updateScoreboardMini(rows) {
  document.getElementById('scoreRowsMini').innerHTML = rows
    .map((p) => `<div class="scoreRow"><span>${escapeHtml(p.name)}${p.id === myId ? ' (você)' : ''}</span><span>${p.kills || 0}/${p.deaths || 0}</span></div>`)
    .join('');
}

// =============================================================================
// ROTA DA BALA (BULLET TRACERS) & EFEITOS DE IMPACTO
// =============================================================================
const SPARK_GEOMETRY = new THREE.SphereGeometry(0.12, 6, 6);

function spawnBulletTracer(from, to, color = 0xffea55) {
  const points = [from.clone(), to.clone()];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  // Faísca de impacto no destino (geometria compartilhada entre todas as faíscas)
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spark = new THREE.Mesh(SPARK_GEOMETRY, sparkMat);
  spark.position.copy(to);
  scene.add(spark);

  bulletTracers.push({ mesh: line, spark, life: 0.16, maxLife: 0.16 });
}

function removeBulletTracer(i) {
  const t = bulletTracers[i];
  scene.remove(t.mesh);
  scene.remove(t.spark);
  t.mesh.geometry.dispose();
  t.mesh.material.dispose();
  t.spark.material.dispose();
  bulletTracers.splice(i, 1);
}

function clearBulletTracers() {
  for (let i = bulletTracers.length - 1; i >= 0; i--) removeBulletTracer(i);
}

function updateBulletTracers(dt) {
  for (let i = bulletTracers.length - 1; i >= 0; i--) {
    const t = bulletTracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      removeBulletTracer(i);
    } else {
      const progress = t.life / t.maxLife;
      t.mesh.material.opacity = progress;
      t.spark.scale.setScalar(progress * 1.5);
    }
  }
}

function drawGrappleLine(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0x22cc88, linewidth: 3 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geo.dispose();
    mat.dispose();
  }, 180);
}

// =============================================================================
// INPUT / MOVIMENTAÇÃO (COM BUNNY HOPPING E COLISÕES FÍSICAS REAIS)
// =============================================================================
const move = { forward: false, back: false, left: false, right: false, jumpHeld: false };
const velocity = new THREE.Vector3();
let onground = true;
const PLAYER_HEIGHT = 1.6;

const GROUND_SPEED = 7.2;
const AIR_SPEED_CAP = 0.9;
const GROUND_ACCEL = 14;
const AIR_ACCEL = 70;
const FRICTION = 6.5;
const JUMP_FORCE = 7.4;
const GRAVITY = -20;

document.addEventListener('keydown', (e) => {
  // Rebinding no modal de configurações
  if (rebindingAction) {
    e.preventDefault();
    if (e.code === 'Escape') {
      rebindingAction = null;
      syncSettingsToUI();
      return;
    }
    userSettings.keybinds[rebindingAction] = e.code;
    saveSettings();
    rebindingAction = null;
    syncSettingsToUI();
    return;
  }

  // Se o modal de config estiver aberto, fecha com Esc
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal && !settingsModal.classList.contains('hidden')) {
    if (e.code === 'Escape') {
      settingsModal.classList.add('hidden');
      saveSettings();
    }
    return;
  }

  // Se o modal de trocar armas estiver aberto, fecha com Esc
  const loadoutModal = document.getElementById('changeLoadoutModal');
  if (loadoutModal && !loadoutModal.classList.contains('hidden')) {
    if (e.code === 'Escape') closeInGameLoadoutModal();
    return;
  }

  // Fora da partida (ex.: digitando o nome no lobby) as teclas do jogo não valem
  if (!joined || e.target instanceof HTMLInputElement) return;

  const kb = userSettings.keybinds;
  if (e.code === kb.forward) move.forward = true;
  else if (e.code === kb.back) move.back = true;
  else if (e.code === kb.left) move.left = true;
  else if (e.code === kb.right) move.right = true;
  else if (e.code === kb.jump) move.jumpHeld = true;
  else if (e.code === kb.reload) tryReload();
  else if (e.code === kb.slot1) trySwitchWeapon(0);
  else if (e.code === kb.slot2) trySwitchWeapon(1);
  else if (e.code === kb.knife) trySwitchWeapon('knife');
  else if (e.code === kb.grapple) tryGrappleSwitch();
  else if (e.code === kb.reset) tryReset();
  else if (e.code === kb.loadout) {
    e.preventDefault();
    openInGameLoadoutModal();
  }
  else if (e.code === kb.score) {
    e.preventDefault();
    document.getElementById('scoreboardMini').classList.add('show');
  }
});

// Tecla de reset: o servidor decide a morte (antes o cliente "morria" só localmente)
function tryReset() {
  if (myAlive && gameStatus === 'playing') socket.emit('suicide');
}

document.addEventListener('keyup', (e) => {
  if (rebindingAction) return;
  const kb = userSettings.keybinds;
  if (e.code === kb.forward) move.forward = false;
  else if (e.code === kb.back) move.back = false;
  else if (e.code === kb.left) move.left = false;
  else if (e.code === kb.right) move.right = false;
  else if (e.code === kb.jump) move.jumpHeld = false;
  else if (e.code === kb.score) document.getElementById('scoreboardMini').classList.remove('show');
});

// Solta todas as teclas ao perder o foco (evita andar sozinho ao voltar para a aba)
window.addEventListener('blur', () => {
  move.forward = move.back = move.left = move.right = move.jumpHeld = false;
  mouseHeld = false;
  aimHeld = false;
});

function trySwitchWeapon(slot) {
  if (!myAlive) return;
  const key = slot === 'knife' ? 'knife' : myLoadout[slot];
  if (!key || key === myWeaponKey) return;
  detachGrapple(false);
  reloading = false; // trocar de arma cancela a recarga (igual no servidor)
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
  reloadStartTime = performance.now();
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

// =============================================================================
// ESTADO DO GANCHO (GRAPPLING HOOK) CONTÍNUO
// =============================================================================
const activeGrapple = {
  active: false,
  point: new THREE.Vector3(),
  lineMesh: null,
};

function detachGrapple(withJumpBoost = false) {
  if (!activeGrapple.active) return;
  activeGrapple.active = false;
  if (activeGrapple.lineMesh) {
    scene.remove(activeGrapple.lineMesh);
    activeGrapple.lineMesh.geometry.dispose();
    activeGrapple.lineMesh.material.dispose();
    activeGrapple.lineMesh = null;
  }
  if (withJumpBoost) {
    // Dá um impulso adicional no pulo ao se desvencilhar da corda
    velocity.y = Math.max(velocity.y + 4.2, JUMP_FORCE);
  }
}

function updateGrappleRope() {
  if (!activeGrapple.active || !activeGrapple.lineMesh) return;
  const startPos = getViewModelMuzzlePos();
  const positions = activeGrapple.lineMesh.geometry.attributes.position.array;
  positions[0] = startPos.x;
  positions[1] = startPos.y;
  positions[2] = startPos.z;
  positions[3] = activeGrapple.point.x;
  positions[4] = activeGrapple.point.y;
  positions[5] = activeGrapple.point.z;
  activeGrapple.lineMesh.geometry.attributes.position.needsUpdate = true;
}

// =============================================================================
// COLISÃO 3D REAL (SUPORTA PASSAR POR BAIXO DE PONTES/PLATAFORMAS ELEVADAS)
// =============================================================================
function collidesWithObstacles(x, y, z) {
  const pRadius = 0.28;
  const playerFeet = y - PLAYER_HEIGHT + 0.05;
  const playerHead = y + 0.15;

  for (let i = 0; i < obstacles.length; i++) {
    const bbox = obstacles[i].userData.bbox;

    // Verifica sobreposição horizontal (X/Z)
    if (
      x + pRadius > bbox.min.x &&
      x - pRadius < bbox.max.x &&
      z + pRadius > bbox.min.z &&
      z - pRadius < bbox.max.z
    ) {
      // 1. Se os pés do jogador estão acima do topo da plataforma (andando por cima)
      if (playerFeet >= bbox.max.y - 0.25) continue;
      // 2. Se a cabeça do jogador está abaixo da base da plataforma (passando por baixo do vão livre)
      if (playerHead <= bbox.min.y + 0.05) continue;

      // Colisão física real com o obstáculo
      return true;
    }
  }
  return false;
}

function groundHeightAt(pos) {
  let h = 0;
  const pRadius = 0.22;
  const playerFeet = pos.y - PLAYER_HEIGHT;

  for (let i = 0; i < obstacles.length; i++) {
    const bbox = obstacles[i].userData.bbox;
    if (
      pos.x + pRadius > bbox.min.x &&
      pos.x - pRadius < bbox.max.x &&
      pos.z + pRadius > bbox.min.z &&
      pos.z - pRadius < bbox.max.z
    ) {
      // Apenas obstáculos que estão abaixo dos pés do jogador (ou até 0.45m acima, como degraus)
      if (bbox.max.y <= playerFeet + 0.45) {
        if (bbox.max.y > h) h = bbox.max.y;
      }
    }
  }
  return h;
}

// Vetores reaproveitados a cada frame (evita criar lixo para o GC)
const UP = new THREE.Vector3(0, 1, 0);
const _forwardVec = new THREE.Vector3();
const _rightVec = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _toAnchor = new THREE.Vector3();
let lastMoveSent = 0;

function updateMovement(dt) {
  const forwardVec = _forwardVec.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  const rightVec = _rightVec.crossVectors(forwardVec, UP);

  const wish = _wish.set(0, 0, 0);
  if (move.forward) wish.add(forwardVec);
  if (move.back) wish.sub(forwardVec);
  if (move.right) wish.add(rightVec);
  if (move.left) wish.sub(rightVec);
  if (wish.lengthSq() > 0) wish.normalize();

  // Tratamento da puxada contínua do Gancho
  if (activeGrapple.active) {
    const toAnchor = _toAnchor.copy(activeGrapple.point).sub(camera.position);
    const distToAnchor = toAnchor.length();

    // 1. Ao apertar o botão de pulo (Space), solta o gancho com impulso
    if (move.jumpHeld) {
      detachGrapple(true);
    }
    // 2. Ao encostar na parede/ponto de fixação, solta o gancho
    else if (distToAnchor < 1.8) {
      detachGrapple(false);
    } else {
      const pullDir = toAnchor.normalize();
      const PULL_SPEED = 24.0;
      velocity.x = THREE.MathUtils.damp(velocity.x, pullDir.x * PULL_SPEED, 8, dt);
      velocity.y = THREE.MathUtils.damp(velocity.y, pullDir.y * PULL_SPEED, 8, dt);
      velocity.z = THREE.MathUtils.damp(velocity.z, pullDir.z * PULL_SPEED, 8, dt);
      onground = false;
      updateGrappleRope();
    }
  }

  if (onground) {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0) {
      const drop = speed * FRICTION * dt;
      const newSpeed = Math.max(speed - drop, 0);
      const scale = newSpeed / speed;
      velocity.x *= scale;
      velocity.z *= scale;
    }
    accelerate(wish, GROUND_SPEED, GROUND_ACCEL, dt);

    if (move.jumpHeld) {
      velocity.y = JUMP_FORCE;
      onground = false;
    }
  } else if (!activeGrapple.active) {
    accelerate(wish, AIR_SPEED_CAP, AIR_ACCEL, dt);
  }

  if (!activeGrapple.active) {
    velocity.y += GRAVITY * dt;
  }

  const pos = camera.position;
  // Limites perimetrais do mapa
  const nextX = THREE.MathUtils.clamp(pos.x + velocity.x * dt, -mapBounds, mapBounds);
  const nextZ = THREE.MathUtils.clamp(pos.z + velocity.z * dt, -mapBounds, mapBounds);

  let collidedWall = false;
  if (!collidesWithObstacles(nextX, pos.y, pos.z)) {
    pos.x = nextX;
  } else {
    velocity.x = 0;
    collidedWall = true;
  }
  if (!collidesWithObstacles(pos.x, pos.y, nextZ)) {
    pos.z = nextZ;
  } else {
    velocity.z = 0;
    collidedWall = true;
  }

  // Se estiver com o gancho ativo e colidir com uma parede perto do ponto de ancoragem, solta
  if (activeGrapple.active && collidedWall) {
    const d = camera.position.distanceTo(activeGrapple.point);
    if (d < 3.0) {
      detachGrapple(false);
    }
  }

  // Movimentação vertical (com verificação de teto ao pular debaixo de plataformas)
  const targetY = camera.position.y + velocity.y * dt;
  if (velocity.y > 0) {
    if (collidesWithObstacles(camera.position.x, targetY, camera.position.z)) {
      velocity.y = 0; // Bate no teto
      if (activeGrapple.active) detachGrapple(false);
    } else {
      camera.position.y = targetY;
    }
  } else {
    camera.position.y = targetY;
  }

  const floor = groundHeightAt(camera.position) + PLAYER_HEIGHT;
  if (camera.position.y <= floor) {
    camera.position.y = floor;
    velocity.y = 0;
    onground = true;
    if (activeGrapple.active && activeGrapple.point.y <= camera.position.y + 0.5) {
      detachGrapple(false);
    }
  } else {
    onground = false;
  }

  sendMove();
}

// Envia a posição no máximo a 30Hz, com a sequência de spawn atual
function sendMove() {
  const now = performance.now();
  if (now - lastMoveSent < MOVE_SEND_INTERVAL) return;
  lastMoveSent = now;
  const p = camera.position;
  socket.volatile.emit('move', {
    x: Math.round(p.x * 100) / 100,
    y: Math.round(p.y * 100) / 100,
    z: Math.round(p.z * 100) / 100,
    rotY: Math.round(cameraYaw * 1000) / 1000,
    seq: mySpawnSeq,
  });
}

// =============================================================================
// TIRO / MIRA / SNIPER SCOPE
// =============================================================================
const raycaster = new THREE.Raycaster();
let mouseHeld = false;
let aimHeld = false;
let lastLocalShot = 0;

document.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    if (controls.isLocked && myAlive && !WEAPONS[myWeaponKey]?.isMelee && !WEAPONS[myWeaponKey]?.isUtility) {
      aimHeld = true;
    }
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

const aimUi = {
  scope: document.getElementById('sniperScope'),
  crosshair: document.getElementById('crosshair'),
  scoped: false,
  aiming: false,
};

function updateAim(dt) {
  if (!camera || !viewModel) return;
  const weapon = WEAPONS[myWeaponKey];
  const canAim = aimHeld && controls.isLocked && myAlive && weapon && !weapon.isMelee && !weapon.isUtility;
  const isSniper = myWeaponKey === 'sniper';

  // Mira telescópica / Scope especial para Sniper
  const scoped = canAim && isSniper;
  if (scoped !== aimUi.scoped) {
    aimUi.scoped = scoped;
    aimUi.scope.classList.toggle('hidden', !scoped);
    aimUi.crosshair.classList.toggle('hidden', scoped);
  }
  if (scoped) viewModel.visible = false;
  else if (controls.isLocked && myAlive) viewModel.visible = true;

  const targetFov = canAim ? (isSniper ? 22 : 54) : 78;
  const targetX = canAim ? (isSniper ? 0 : -0.26) : 0;
  const targetY = canAim ? (isSniper ? 0 : 0.12) : 0;
  const targetZ = canAim ? 0.1 : 0;

  // Só recalcula a matriz de projeção enquanto o FOV está mudando
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 18, dt);
    camera.updateProjectionMatrix();
  }

  viewModel.position.x = THREE.MathUtils.damp(viewModel.position.x, targetX, 20, dt);
  viewModel.position.y = THREE.MathUtils.damp(viewModel.position.y, targetY, 20, dt);
  viewModel.position.z = THREE.MathUtils.damp(viewModel.position.z, targetZ, 20, dt);

  const adsAiming = canAim && !isSniper;
  if (adsAiming !== aimUi.aiming) {
    aimUi.aiming = adsAiming;
    aimUi.crosshair.classList.toggle('aiming', adsAiming);
  }
}

function updateViewModel(dt) {
  if (!viewModel || !weaponModel) return;
  const speed = Math.hypot(velocity.x, velocity.z);
  const walking = Math.min(speed / GROUND_SPEED, 1);
  const time = performance.now() * 0.008;
  const bobX = Math.sin(time) * 0.018 * walking;
  const bobY = Math.abs(Math.cos(time)) * 0.018 * walking;
  const aiming = aimHeld && WEAPONS[myWeaponKey] && !WEAPONS[myWeaponKey].isMelee && !WEAPONS[myWeaponKey].isUtility;

  weaponKick = THREE.MathUtils.damp(weaponKick, 0, 22, dt);

  if (reloading) {
    const w = WEAPONS[myWeaponKey];
    if (!w) return;
    const reloadProgress = Math.min((performance.now() - reloadStartTime) / w.reloadTime, 1);
    const reloadOffset = Math.sin(reloadProgress * Math.PI) * -0.4; // Move weapon down and up

    weaponModel.position.y = bobY + reloadOffset;
    weaponModel.position.x = bobX;
    weaponModel.position.z = weaponKick;
    weaponModel.rotation.z = -bobX * 1.4;

    if (leftArmPivot) {
      leftArmPivot.rotation.z = -0.34 - bobX * 5 + reloadOffset * 2;
      leftArmPivot.rotation.x = -0.12 + bobY * 3 + reloadOffset * 1.5;
    }
    if (rightArmPivot) {
      rightArmPivot.rotation.z = 0.3 + bobX * 5 - reloadOffset * 2;
      rightArmPivot.rotation.x = -0.08 - bobY * 3 + reloadOffset * 1.5;
    }

  } else {
    weaponModel.position.y = bobY;
    weaponModel.position.x = bobX;
    weaponModel.position.z = weaponKick;
    weaponModel.rotation.z = -bobX * 1.4;
  }
}

function attemptAction() {
  const w = WEAPONS[myWeaponKey];
  if (!w) return;
  const now = performance.now();
  if (now - lastLocalShot < w.fireRate) return;
  lastLocalShot = now;
  weaponKick = myWeaponKey === 'sniper' ? 0.16 : 0.07;

  if (w.isUtility) { doGrapple(); return; }
  doShoot(w);
}

function doShoot(w) {
  if (w.maxAmmo !== Infinity && myAmmo[myWeaponKey] <= 0) return;
  if (reloading) return;

  const dir = camera.getWorldDirection(new THREE.Vector3());
  raycaster.set(camera.position, dir);
  raycaster.far = w.isMelee ? 3.2 : 250;

  // Alvos de jogadores (lista de hitboxes montada uma vez por jogador)
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

  // Raycast contra jogadores e obstáculos para calcular trajeto da bala
  const playerHits = raycaster.intersectObjects(playerTargets, false);
  const obstacleHits = raycaster.intersectObjects(obstacles, false);

  let targetId = null;
  let isHead = false;
  let hitPos = null;

  const closestPlayerDist = playerHits.length > 0 ? playerHits[0].distance : Infinity;
  const closestObstacleDist = obstacleHits.length > 0 ? obstacleHits[0].distance : Infinity;

  if (closestPlayerDist < closestObstacleDist && playerHits.length > 0) {
    const hit = playerHits[0];
    targetId = meshToId.get(hit.object);
    isHead = !!hit.object.userData.isHead;
    hitPos = hit.point;
  } else if (obstacleHits.length > 0) {
    hitPos = obstacleHits[0].point;
  } else {
    hitPos = camera.position.clone().add(dir.clone().multiplyScalar(150));
  }

  // Spawn do rastro da bala na tela do próprio jogador
  const muzzlePos = getViewModelMuzzlePos();
  spawnBulletTracer(muzzlePos, hitPos, w.tracerColor || 0xffea55);

  // Envia disparo ao servidor
  socket.emit('shoot', {
    targetId,
    isHead,
    hitPos: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
  });

  if (myAmmo[myWeaponKey] !== undefined && myAmmo[myWeaponKey] !== -1) {
    myAmmo[myWeaponKey] = Math.max(myAmmo[myWeaponKey] - 1, 0);
    updateWeaponHUD();
  }
  playShotSound(w, myWeaponKey);
}

function doGrapple() {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  raycaster.set(camera.position, dir);
  raycaster.far = 55;
  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length === 0) return;
  const point = hits[0].point;

  // Cancela gancho anterior se houver
  detachGrapple(false);

  activeGrapple.active = true;
  activeGrapple.point.copy(point);

  // Cria a corda visível dinâmica contínua conectada da arma ao ponto da parede
  const startPos = getViewModelMuzzlePos();
  const positions = new Float32Array([
    startPos.x, startPos.y, startPos.z,
    point.x, point.y, point.z,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x38ef7d, linewidth: 3, transparent: true, opacity: 0.95 });
  activeGrapple.lineMesh = new THREE.Line(geo, mat);
  scene.add(activeGrapple.lineMesh);

  playGrappleSound();
  socket.emit('grapple', { x: point.x, y: point.y, z: point.z });

  // Impulso inicial forte em direção ao ponto de fixação
  const pullDir = point.clone().sub(camera.position).normalize();
  velocity.x += pullDir.x * 12;
  velocity.z += pullDir.z * 12;
  velocity.y = Math.max(velocity.y + 4, pullDir.y * 12);
  onground = false;
}

// Auto-fire para armas automáticas (SMG) — chamado pelo loop principal
function updateAutoFire() {
  if (!mouseHeld || !myAlive || !controls.isLocked) return;
  const w = WEAPONS[myWeaponKey];
  if (w && w.auto) attemptAction();
}

// =============================================================================
// EFEITOS SONOROS PROCEDURAIS (WEB AUDIO API)
// =============================================================================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playGrappleSound() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
  } catch (e) { }
}

// weaponKey é a arma de quem atirou (antes usava sempre a arma local)
function playShotSound(w, weaponKey, volume = 0.08) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const isSniper = weaponKey === 'sniper';
    osc.type = w.isMelee ? 'triangle' : (isSniper ? 'sawtooth' : 'square');
    osc.frequency.value = w.isMelee ? 220 : (isSniper ? 85 : 150);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isSniper ? 0.22 : 0.1));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (isSniper ? 0.23 : 0.11));
  } catch (e) { }
}

function playHitmarkerSound(isHeadshot) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHeadshot ? 1200 : 700, ctx.currentTime);
    if (isHeadshot) osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (e) { }
}

function playHurtSound() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.19);
  } catch (e) { }
}

// =============================================================================
// LOOP PRINCIPAL E ANIMAÇÕES
// =============================================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (controls.isLocked && joined && myAlive && gameStatus === 'playing') {
    updateMovement(dt);
    updateAutoFire();
  }
  updateAim(dt);
  updateViewModel(dt);
  updateBulletTracers(dt);

  // Efeito de trauma/tremor de câmera ao levar dano
  if (cameraShake > 0.001) {
    camera.rotation.z = (Math.random() - 0.5) * cameraShake;
    cameraShake = THREE.MathUtils.damp(cameraShake, 0, 14, dt);
  } else {
    cameraShake = 0;
    camera.rotation.z = 0;
  }

  updateRemotePlayers(dt);
  updateNameTags();
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
// sempre entre duas posições reais recebidas do servidor. Resultado: movimento
// suave e independente do FPS (antes: lerp fixo de 35% por frame).
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
    if (b && renderTime > a.t) {
      const t = Math.min((renderTime - a.t) / (b.t - a.t), 1);
      rp.group.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      rp.group.rotation.y = angleLerp(a.rotY, b.rotY, t);
    } else {
      rp.group.position.set(a.x, a.y, a.z);
      rp.group.rotation.y = a.rotY;
    }

    // Animação de passos baseada na velocidade horizontal
    const speed = Math.hypot(rp.group.position.x - prevX, rp.group.position.z - prevZ) / Math.max(dt, 0.001);
    if (speed > 0.5) {
      rp.animTime += dt * Math.min(speed, 10) * 1.4;
      const legAngle = Math.sin(rp.animTime) * 0.55;
      rp.leftLegGroup.rotation.x = legAngle;
      rp.rightLegGroup.rotation.x = -legAngle;
      rp.leftArmGroup.rotation.x = -legAngle * 0.6;
    } else {
      rp.leftLegGroup.rotation.x = THREE.MathUtils.damp(rp.leftLegGroup.rotation.x, 0, 10, dt);
      rp.rightLegGroup.rotation.x = THREE.MathUtils.damp(rp.rightLegGroup.rotation.x, 0, 10, dt);
      rp.leftArmGroup.rotation.x = THREE.MathUtils.damp(rp.leftArmGroup.rotation.x, 0, 10, dt);
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
      _headPos.y += 2.25;
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
    rp.healthFill.style.width = `${Math.max(0, Math.min(rp.data.health ?? 100, 100))}%`;
  }
}
