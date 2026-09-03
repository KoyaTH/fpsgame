// =============================================================================
// ESTADO GLOBAL
// =============================================================================
let scene, camera, renderer;
let obstacles = [];
let mapBounds = 38.5;
let socket;
let myId = null;
let joined = false;

const remotePlayers = {}; // id -> { group, headGroup, weaponSlot, materials, targetPos, targetRotY, data, animTime, flashTimeout }
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
    if (el.requestPointerLock) el.requestPointerLock();
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

  const modal = document.getElementById('changeLoadoutModal');
  const openModal = () => {
    if (!joined) return;
    if (controls) controls.unlock();
    inGameSelectedWeapons = [...myLoadout];
    syncInGameLoadoutOptions();
    modal.classList.remove('hidden');
  };
  const closeModal = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('openLoadoutHudBtn')?.addEventListener('click', openModal);
  document.getElementById('closeLoadoutXBtn')?.addEventListener('click', closeModal);
  document.getElementById('cancelLoadoutBtn')?.addEventListener('click', closeModal);

  document.getElementById('confirmLoadoutBtn')?.addEventListener('click', () => {
    if (inGameSelectedWeapons.length !== 2) return;
    socket.emit('changeLoadout', { loadout: inGameSelectedWeapons });
    closeModal();
    if (gameStatus === 'playing' && myAlive) controls.lock();
  });
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
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  createViewModel();

  document.body.addEventListener('click', (e) => {
    // Se algum modal ou menu estiver aberto, não trava o cursor
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal && !settingsModal.classList.contains('hidden')) return;
    const changeLoadoutModal = document.getElementById('changeLoadoutModal');
    if (changeLoadoutModal && !changeLoadoutModal.classList.contains('hidden')) return;
    const loadoutScreen = document.getElementById('loadoutScreen');
    if (loadoutScreen && !loadoutScreen.classList.contains('hidden')) return;
    const endScreen = document.getElementById('endScreen');
    if (endScreen && !endScreen.classList.contains('hidden')) return;
    const voteScreen = document.getElementById('voteScreen');
    if (voteScreen && !voteScreen.classList.contains('hidden')) return;

    if (gameStatus === 'playing' && myAlive && !controls.isLocked) {
      controls.lock();
    }
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
  // Limpa objetos antigos (exceto luzes e câmera) e reconstrói
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj === camera) continue;
    scene.remove(obj);
  }
  for (const id in remotePlayers) scene.remove(remotePlayers[id].group);

  detachGrapple(false);

  const built = MAP_BUILDERS[mapId](scene);
  obstacles = built.obstacles;
  mapBounds = built.bounds || 38.5;
  currentMapId = mapId;
  document.getElementById('mapName').textContent = (MAP_NAMES[mapId] || mapId);

  // Pré-calcula Bounding Box 3D exata para cada obstáculo do mapa
  for (const box of obstacles) {
    box.updateMatrixWorld(true);
    box.userData.bbox = new THREE.Box3().setFromObject(box);
  }

  // Recria meshes dos players remotos na nova cena
  for (const id in remotePlayers) {
    scene.add(remotePlayers[id].group);
  }
}

const MAP_NAMES = { arena: 'Arena Clássica', cidade: 'Cidade Pequena', deserto: 'Dunas do Deserto' };

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
  if (weaponModel) viewModel.remove(weaponModel);
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
    while (weaponSlot.children.length > 0) weaponSlot.remove(weaponSlot.children[0]);
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

  updateHeldWeapon('smg');

  return {
    group,
    headGroup,
    leftArmGroup,
    rightArmGroup,
    leftLegGroup,
    rightLegGroup,
    weaponSlot,
    materials,
    updateHeldWeapon,
  };
}

function addRemotePlayer(p) {
  if (remotePlayers[p.id]) return;
  const pm = buildPlayerMesh(colorFromId(p.id));
  const spawnY = (p.y || 1.6) - PLAYER_HEIGHT;
  pm.group.position.set(p.x || 0, spawnY, p.z || 0);
  scene.add(pm.group);
  remotePlayers[p.id] = {
    ...pm,
    targetPos: new THREE.Vector3(p.x || 0, spawnY, p.z || 0),
    targetRotY: p.rotY || 0,
    data: p,
    animTime: 0,
    flashTimeout: null,
  };
}

function removeRemotePlayer(id) {
  if (remotePlayers[id]) {
    scene.remove(remotePlayers[id].group);
    delete remotePlayers[id];
  }
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
function connectSocket(name) {
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
      loadMap(data.game.currentMap);
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
        cameraYaw = me.rotY || 0;
        cameraPitch = 0;
        applyCameraRotation();
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
      const feetY = (snapshot[id].y || 1.6) - PLAYER_HEIGHT;
      rp.targetPos.set(snapshot[id].x, feetY, snapshot[id].z);
      rp.targetRotY = snapshot[id].rotY;
      if (rp.data.weaponKey !== snapshot[id].weaponKey) {
        rp.updateHeldWeapon(snapshot[id].weaponKey);
      }
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

  socket.on('loadoutChanged', ({ loadout, weaponKey, ammo }) => {
    myLoadout = loadout;
    myWeaponKey = weaponKey;
    myAmmo = ammo;
    reloading = false;
    detachGrapple(false);
    updateWeaponHUD();
    updateWeaponModel();
  });

  socket.on('playerShot', ({ id, weaponKey, origin, hitPos }) => {
    const rp = remotePlayers[id];
    if (rp && rp.group.visible) {
      const from = getRemotePlayerMuzzlePos(rp);
      const to = hitPos ? new THREE.Vector3(hitPos.x, hitPos.y, hitPos.z) : from.clone().add(new THREE.Vector3(0, 0, -100).applyAxisAngle(new THREE.Vector3(0, 1, 0), rp.group.rotation.y));
      const w = WEAPONS[weaponKey] || WEAPONS.smg;
      spawnBulletTracer(from, to, w.tracerColor || 0xffea55);
      playShotSound(w, 0.04);
    }
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

  socket.on('playerDied', ({ id, killerId, killerName, damage, headshot, attackerPos }) => {
    if (id === myId) {
      myAlive = false;
      myHealth = 0;
      updateHealthHUD();
      controls.unlock();
      setRegenActive(false);
      detachGrapple(false);
      showDirectionalDamageIndicator(attackerPos);

      // Show death screen with 5s countdown
      const deathScreen = document.getElementById('deathScreen');
      const killerNameEl = document.getElementById('deathKillerName');
      const respawnBtn = document.getElementById('respawnBtn');
      if (deathScreen && killerNameEl && respawnBtn) {
        killerNameEl.textContent = killerName || '—';
        deathScreen.classList.remove('hidden');
        let count = 5;
        const el = document.getElementById('deathCountdown');
        if (el) el.textContent = count;
        deathCountdownInterval = setInterval(() => {
          count -= 1;
          if (el) el.textContent = count;
          if (count <= 0) {
            clearInterval(deathCountdownInterval);
            deathCountdownInterval = null;
          }
        }, 1000);

        respawnBtn.onclick = () => {
          count = 0;
          if (el) el.textContent = count;

          clearInterval(deathCountdownInterval);
          deathCountdownInterval = null;

          // Esconde a tela de morte imediatamente
          deathScreen.classList.add('hidden');

          // AVISA O SERVIDOR: "Quero reviver"
          socket.emit('requestInstantRespawn');
        };

      }
    }
    if (remotePlayers[id]) {
      flashPlayerRed(remotePlayers[id]);
    }
    if (killerId === myId) {
      showHitmarker(!!headshot);
      showDamageNumber(id, damage, !!headshot, true);
      playHitmarkerSound(true);
    }
    // console.log(" Player died: ", id, " Killer: ", killerId, " Damage: ", damage, " Headshot: ", headshot, " attackerPos: ", attackerPos);
  });

  socket.on('respawned', ({ x, y, z, ammo, weaponKey, health, rotY }) => {
    myAlive = true;
    myAmmo = ammo;
    myWeaponKey = weaponKey;
    myHealth = health !== undefined ? health : 100;
    camera.position.set(x, y, z);
    cameraYaw = rotY !== undefined ? rotY : cameraYaw;
    cameraPitch = 0;
    applyCameraRotation();
    setRegenActive(false);
    detachGrapple(false);
    updateWeaponHUD();
    updateWeaponModel();
    updateHealthHUD();

    // Hide death screen and clear interval
    const deathScreen = document.getElementById('deathScreen');
    if (deathScreen) deathScreen.classList.add('hidden');
    if (deathCountdownInterval) {
      clearInterval(deathCountdownInterval);
      deathCountdownInterval = null;
    }
    if (gameStatus === 'playing') controls.lock();
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

function updateScoreboardMini(snapshot) {
  const box = document.getElementById('scoreRowsMini');
  const rows = Object.values(snapshot)
    .sort((a, b) => (b.kills || 0) - (a.kills || 0))
    .map((p) => `<div class="scoreRow"><span>${p.name}${p.id === myId ? ' (você)' : ''}</span><span>${p.kills || 0}/${p.deaths || 0}</span></div>`)
    .join('');
  box.innerHTML = rows;
}

let tabHeld = false;

// =============================================================================
// ROTA DA BALA (BULLET TRACERS) & EFEITOS DE IMPACTO
// =============================================================================
function spawnBulletTracer(from, to, color = 0xffea55) {
  const points = [from.clone(), to.clone()];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  // Faísca de impacto no destino
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), sparkMat);
  spark.position.copy(to);
  scene.add(spark);

  bulletTracers.push({ mesh: line, spark, life: 0.16, maxLife: 0.16 });
}

function updateBulletTracers(dt) {
  for (let i = bulletTracers.length - 1; i >= 0; i--) {
    const t = bulletTracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      scene.remove(t.mesh);
      scene.remove(t.spark);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      t.spark.geometry.dispose();
      t.spark.material.dispose();
      bulletTracers.splice(i, 1);
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
    if (e.code === 'Escape') {
      toggleInGameWeaponSelect(false);
      if (myAlive) controls.lock();
    }
    return;
  }

  const kb = userSettings.keybinds;
  const isLoadoutKey = kb.loadout && e.code === kb.loadout;
  const isGrappleKey = kb.grapple && e.code === kb.grapple;
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
  else if (e.code === kb.reset) tryReset(myId);
  else if (e.code === kb.loadout) {
    e.preventDefault();
    document.getElementById('changeLoadoutModal').classList.remove('hidden');
    controls.unlock();
    // toggleInGameWeaponSelect(true);
  }
  else if (e.code === kb.score) {
    e.preventDefault();
    tabHeld = true;
    document.getElementById('scoreboardMini').classList.add('show');
  }
});

function tryReset(id) {
  // console.log("ta chegando aqui?, id: ", id)
  socket.emit('playerDied', {
    id: id,
    killerId: id,
    killerName: 'Reset',
    damage: 101,
    headshot: false,
    attackerPos: { x: 0, y: 0, z: 0 },
  });
}

document.addEventListener('keyup', (e) => {
  if (rebindingAction) return;
  const kb = userSettings.keybinds;
  if (e.code === kb.forward) move.forward = false;
  else if (e.code === kb.back) move.back = false;
  else if (e.code === kb.left) move.left = false;
  else if (e.code === kb.right) move.right = false;
  else if (e.code === kb.jump) move.jumpHeld = false;
  else if (e.code === kb.score) {
    tabHeld = false;
    document.getElementById('scoreboardMini').classList.remove('show');
  }
});

function trySwitchWeapon(slot) {
  if (!myAlive) return;
  const key = slot === 'knife' ? 'knife' : myLoadout[slot];
  if (!key) return;
  detachGrapple(false);
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
function collidesWithObstacles(pos) {
  const pRadius = 0.28;
  const playerFeet = pos.y - PLAYER_HEIGHT + 0.05;
  const playerHead = pos.y + 0.15;

  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const bbox = box.userData.bbox || new THREE.Box3().setFromObject(box);

    // Verifica sobreposição horizontal (X/Z)
    if (
      pos.x + pRadius > bbox.min.x &&
      pos.x - pRadius < bbox.max.x &&
      pos.z + pRadius > bbox.min.z &&
      pos.z - pRadius < bbox.max.z
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
    const box = obstacles[i];
    const bbox = box.userData.bbox || new THREE.Box3().setFromObject(box);
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

function updateMovement(dt) {
  const forwardVec = new THREE.Vector3();
  camera.getWorldDirection(forwardVec);
  forwardVec.y = 0;
  forwardVec.normalize();
  const rightVec = new THREE.Vector3().crossVectors(forwardVec, new THREE.Vector3(0, 1, 0));

  const wish = new THREE.Vector3();
  if (move.forward) wish.add(forwardVec);
  if (move.back) wish.sub(forwardVec);
  if (move.right) wish.add(rightVec);
  if (move.left) wish.sub(rightVec);
  if (wish.lengthSq() > 0) wish.normalize();

  // Tratamento da puxada contínua do Gancho
  if (activeGrapple.active) {
    const toAnchor = activeGrapple.point.clone().sub(camera.position);
    const distToAnchor = toAnchor.length();

    // 1. Ao apertar o botão de pulo (Space), solta o gancho com impulso
    if (move.jumpHeld) {
      detachGrapple(true);
    }
    // 2. Ao encostar na parede/ponto de fixação, solta o gancho
    else if (distToAnchor < 1.8) {
      detachGrapple(false);
    } else {
      const pullDir = toAnchor.clone().normalize();
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

  const nextPos = camera.position.clone();
  nextPos.x += velocity.x * dt;
  nextPos.z += velocity.z * dt;

  // Limites perimetrais do mapa
  nextPos.x = THREE.MathUtils.clamp(nextPos.x, -mapBounds, mapBounds);
  nextPos.z = THREE.MathUtils.clamp(nextPos.z, -mapBounds, mapBounds);

  let collidedWall = false;
  if (!collidesWithObstacles(new THREE.Vector3(nextPos.x, camera.position.y, camera.position.z))) {
    camera.position.x = nextPos.x;
  } else {
    velocity.x = 0;
    collidedWall = true;
  }
  if (!collidesWithObstacles(new THREE.Vector3(camera.position.x, camera.position.y, nextPos.z))) {
    camera.position.z = nextPos.z;
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
    const headTest = new THREE.Vector3(camera.position.x, targetY, camera.position.z);
    if (collidesWithObstacles(headTest)) {
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

  socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, rotY: cameraYaw });
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

function updateAim(dt) {
  if (!camera || !viewModel) return;
  const weapon = WEAPONS[myWeaponKey];
  const canAim = aimHeld && controls.isLocked && myAlive && weapon && !weapon.isMelee && !weapon.isUtility;
  const isSniper = myWeaponKey === 'sniper';

  // Mira telescópica / Scope especial para Sniper
  const sniperScopeEl = document.getElementById('sniperScope');
  const crosshairEl = document.getElementById('crosshair');

  if (canAim && isSniper) {
    sniperScopeEl.classList.remove('hidden');
    crosshairEl.classList.add('hidden');
    viewModel.visible = false;
  } else {
    sniperScopeEl.classList.add('hidden');
    crosshairEl.classList.remove('hidden');
    if (viewModel && controls && controls.isLocked && myAlive) viewModel.visible = true;
  }

  const targetFov = canAim ? (isSniper ? 22 : 54) : 78;
  const targetX = canAim ? (isSniper ? 0 : -0.26) : 0;
  const targetY = canAim ? (isSniper ? 0 : 0.12) : 0;
  const targetZ = canAim ? 0.1 : 0;

  camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 18, dt);
  camera.updateProjectionMatrix();

  viewModel.position.x = THREE.MathUtils.damp(viewModel.position.x, targetX, 20, dt);
  viewModel.position.y = THREE.MathUtils.damp(viewModel.position.y, targetY, 20, dt);
  viewModel.position.z = THREE.MathUtils.damp(viewModel.position.z, targetZ, 20, dt);

  crosshairEl.classList.toggle('aiming', canAim && !isSniper);
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

  // Alvos de jogadores
  const playerTargets = [];
  const meshToId = new Map();
  for (const id in remotePlayers) {
    if (!remotePlayers[id].group.visible) continue;
    remotePlayers[id].group.traverse((child) => {
      if (child.isMesh) {
        playerTargets.push(child);
        meshToId.set(child, id);
      }
    });
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
  playShotSound(w);
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

// Auto-fire para armas automáticas (SMG)
function autoFireLoop() {
  if (mouseHeld && myAlive && controls.isLocked) {
    const w = WEAPONS[myWeaponKey];
    if (w && w.auto) attemptAction();
  }
  requestAnimationFrame(autoFireLoop);
}
autoFireLoop();

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

function playShotSound(w, volume = 0.08) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = w.isMelee ? 'triangle' : (myWeaponKey === 'sniper' ? 'sawtooth' : 'square');
    osc.frequency.value = w.isMelee ? 220 : (myWeaponKey === 'sniper' ? 85 : 150);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (myWeaponKey === 'sniper' ? 0.22 : 0.1));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (myWeaponKey === 'sniper' ? 0.23 : 0.11));
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
  }
  updateAim(dt);
  updateViewModel(dt);
  updateBulletTracers(dt);

  // Efeito de trauma/tremor de câmera ao levar dano
  if (cameraShake > 0) {
    camera.rotation.z = (Math.random() - 0.5) * cameraShake;
    cameraShake = THREE.MathUtils.damp(cameraShake, 0, 14, dt);
  } else {
    camera.rotation.z = 0;
  }

  // Atualização e interpolação dos jogadores remotos com animação de passos
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    const prevPos = rp.group.position.clone();
    rp.group.position.lerp(rp.targetPos, 0.35);
    rp.group.rotation.y = rp.targetRotY || 0;

    const moveDist = prevPos.distanceTo(rp.group.position);
    if (moveDist > 0.005) {
      rp.animTime += dt * 10;
      const legAngle = Math.sin(rp.animTime) * 0.55;
      if (rp.leftLegGroup) rp.leftLegGroup.rotation.x = legAngle;
      if (rp.rightLegGroup) rp.rightLegGroup.rotation.x = -legAngle;
      if (rp.leftArmGroup) rp.leftArmGroup.rotation.x = -legAngle * 0.6;
    } else {
      if (rp.leftLegGroup) rp.leftLegGroup.rotation.x = THREE.MathUtils.damp(rp.leftLegGroup.rotation.x, 0, 10, dt);
      if (rp.rightLegGroup) rp.rightLegGroup.rotation.x = THREE.MathUtils.damp(rp.rightLegGroup.rotation.x, 0, 10, dt);
      if (rp.leftArmGroup) rp.leftArmGroup.rotation.x = THREE.MathUtils.damp(rp.leftArmGroup.rotation.x, 0, 10, dt);
    }
  }

  updateNameTags();
  renderer.render(scene, camera);
}

function updateNameTags() {
  nameTagsDiv.innerHTML = '';
  const viewDirection = camera.getWorldDirection(new THREE.Vector3());
  const raycaster = new THREE.Raycaster();

  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    if (!rp.group.visible) continue;

    const headPos = rp.group.position.clone();
    headPos.y += 2.25;
    const toPlayer = headPos.clone().sub(camera.position);
    const distToPlayer = toPlayer.length();
    const dirToPlayer = toPlayer.clone().normalize();

    if (distToPlayer > 100 || viewDirection.dot(dirToPlayer) <= 0) continue;

    raycaster.set(camera.position, dirToPlayer);
    raycaster.far = distToPlayer;
    const obstacleHits = raycaster.intersectObjects(obstacles, true);
    const isBlockedByStructure = obstacleHits.some((hit) => hit.distance > 0.35 && hit.distance < distToPlayer - 0.25);
    if (isBlockedByStructure) continue;

    const screenPos = headPos.project(camera);
    if (screenPos.z < -1 || screenPos.z > 1 || Math.abs(screenPos.x) > 1 || Math.abs(screenPos.y) > 1) continue;

    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    const tag = document.createElement('div');
    tag.className = 'nameTag';
    tag.style.left = `${x}px`;
    tag.style.top = `${y}px`;

    const name = document.createElement('div');
    name.textContent = rp.data.name || 'Jogador';

    const healthBar = document.createElement('div');
    healthBar.className = 'enemyHealth';
    const healthFill = document.createElement('div');
    healthFill.className = 'enemyHealthFill';
    healthFill.style.width = `${Math.max(0, Math.min(rp.data.health ?? 100, 100))}%`;
    healthBar.appendChild(healthFill);

    tag.append(name, healthBar);
    nameTagsDiv.appendChild(tag);
  }
}
