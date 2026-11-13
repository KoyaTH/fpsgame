// =============================================================================
// CONTROLES DE TOQUE (CELULAR E TABLET)
// =============================================================================
// Carregado depois do game.js. Joystick dinâmico no lado esquerdo, arrastar no
// lado direito para mirar e botões de ação. O botão de tiro também mira ao
// arrastar, então dá para atirar e corrigir a mira com o mesmo dedo.
// Usa eventos de toque com preventDefault: sem zoom, rolagem nem cliques falsos.

const TOUCH_LOOK_SPEED = 0.0048; // rad por pixel com sensibilidade 1
const STICK_RADIUS = 56;         // px até a força máxima do joystick

const touchState = {
  stickId: null,
  stickX: 0,
  stickY: 0,
  look: new Map(),    // id do toque -> { x, y }
  buttons: new Map(), // id do toque -> nome do botão
};

function touchLookDelta(dx, dy) {
  const aimMult = isAiming() ? userSettings.sensAimX / Math.max(userSettings.sensX, 0.05) : 1;
  const k = TOUCH_LOOK_SPEED * userSettings.touchSens * aimMult;
  cameraYaw -= dx * k;
  cameraPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cameraPitch - dy * k * (userSettings.invertY ? -1 : 1)));
  mouseDelta.x += dx * 0.6;
  mouseDelta.y += dy * 0.6;
}

function setStickVisual(active, x, y, kx = 0, ky = 0) {
  const stick = $('touchStick');
  stick.classList.toggle('active', active);
  if (!active) return;
  stick.style.transform = `translate(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px)`;
  $('touchStickKnob').style.transform = `translate(${kx}px, ${ky}px)`;
}

function pressTouchButton(name) {
  if (!controls.isLocked || !myAlive) return;
  switch (name) {
    case 'fire':
      mouseHeld = true;
      attemptAction();
      break;
    case 'aim':
      aimHeld = !aimHeld;
      break;
    case 'jump':
      move.jumpHeld = true;
      jumpBufferedAt = performance.now();
      break;
    case 'crouch':
      move.crouchHeld = true;
      break;
    case 'reload':
      tryReload();
      break;
    case 'swap':
      cycleWeapon(1);
      break;
    default:
  }
}

function releaseTouchButton(name) {
  if (name === 'fire') {
    mouseHeld = false;
    if (myWeaponKey === 'grapple') releaseGrapple(false);
  } else if (name === 'jump') {
    move.jumpHeld = false;
  } else if (name === 'crouch') {
    move.crouchHeld = false;
  }
}

function refreshTouchButtons() {
  $('tAim').classList.toggle('on', !!aimHeld);
  const w = WEAPONS[myWeaponKey];
  $('tAim').classList.toggle('disabled', !w || !!w.isMelee || !!w.isUtility);
  $('tReload').classList.toggle('disabled', !w || w.maxAmmo === Infinity);
}

function onTouchStart(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const btn = t.target.closest && t.target.closest('[data-tbtn]');
    if (btn) {
      const name = btn.dataset.tbtn;
      touchState.buttons.set(t.identifier, name);
      btn.classList.add('pressed');
      pressTouchButton(name);
      // o dedo do tiro também mira ao arrastar
      if (name === 'fire') touchState.look.set(t.identifier, { x: t.clientX, y: t.clientY });
      refreshTouchButtons();
      continue;
    }
    if (t.target.id === 'touchMoveZone' && touchState.stickId === null) {
      touchState.stickId = t.identifier;
      touchState.stickX = t.clientX;
      touchState.stickY = t.clientY;
      setStickVisual(true, t.clientX, t.clientY);
      continue;
    }
    if (t.target.id === 'touchLookZone' || t.target.id === 'touchMoveZone') {
      touchState.look.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (!controls.isLocked) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touchState.stickId) {
      let dx = t.clientX - touchState.stickX;
      let dy = t.clientY - touchState.stickY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
      touchInput.x = dx / STICK_RADIUS;
      touchInput.y = -dy / STICK_RADIUS;
      setStickVisual(true, touchState.stickX, touchState.stickY, dx, dy);
      continue;
    }
    const last = touchState.look.get(t.identifier);
    if (last) {
      touchLookDelta(t.clientX - last.x, t.clientY - last.y);
      last.x = t.clientX;
      last.y = t.clientY;
    }
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touchState.stickId) {
      touchState.stickId = null;
      touchInput.x = 0;
      touchInput.y = 0;
      setStickVisual(false);
    }
    touchState.look.delete(t.identifier);
    const name = touchState.buttons.get(t.identifier);
    if (name) {
      touchState.buttons.delete(t.identifier);
      const btn = document.querySelector(`[data-tbtn="${name}"]`);
      if (btn && ![...touchState.buttons.values()].includes(name)) btn.classList.remove('pressed');
      releaseTouchButton(name);
    }
  }
  refreshTouchButtons();
}

// Ao sair do modo de jogo (morte, menus): solta tudo
function clearTouchState() {
  touchState.stickId = null;
  touchState.look.clear();
  for (const name of touchState.buttons.values()) releaseTouchButton(name);
  touchState.buttons.clear();
  document.querySelectorAll('.tBtn.pressed').forEach((b) => b.classList.remove('pressed'));
  setStickVisual(false);
}

function initTouchControls() {
  const layer = $('touchControls');
  layer.addEventListener('touchstart', onTouchStart, { passive: false });
  layer.addEventListener('touchmove', onTouchMove, { passive: false });
  layer.addEventListener('touchend', onTouchEnd, { passive: false });
  layer.addEventListener('touchcancel', onTouchEnd, { passive: false });

  // Hotbar: toque escolhe a arma
  $('hotbar').addEventListener('touchstart', (e) => {
    const slot = e.target.closest('.hotSlot');
    if (!slot || !controls.isLocked) return;
    e.preventDefault();
    trySwitchWeapon(slot.dataset.key);
    refreshTouchButtons();
  }, { passive: false });

  // Placar: toque abre/fecha
  $('touchScoreBtn').addEventListener('click', () => $('scoreboard').classList.toggle('show'));

  // Solta os controles quando o jogo sai do modo ativo
  new MutationObserver(() => {
    if (!document.body.classList.contains('controlsActive')) clearTouchState();
    refreshTouchButtons();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Voltar para a página depois de trocar de app
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTouchState(); });
}

initTouchControls();
