// =============================================================================
// INTERFACE (DOM): CARTÕES DE ARMAS, HOTBAR, VOTAÇÃO, PLACAR, FEEDBACK
// =============================================================================
// Só manipula HTML. Estado de jogo fica em game.js, que chama estas funções.

const $ = (id) => document.getElementById(id);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const STAT_LABELS = { damage: 'Dano', rate: 'Cadência', range: 'Alcance', mobility: 'Mobilidade' };

// -----------------------------------------------------------------------------
// CARTÃO DE ARMA (prévia renderizada em 3D + atributos)
// -----------------------------------------------------------------------------
function createWeaponCard(key) {
  const w = WEAPONS[key];
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'weaponCard';
  card.dataset.key = key;
  const ammo = w.maxAmmo === Infinity ? '∞' : w.maxAmmo;
  const stats = Object.entries(w.stats || {})
    .map(([k, v]) => `<div class="statRow"><span>${STAT_LABELS[k]}</span><div class="statBar"><i style="width:${v * 10}%"></i></div></div>`)
    .join('');
  card.innerHTML = `
    <div class="wcBadge"></div>
    <div class="wcImage"><img alt="${escapeHtml(w.name)}" src="${renderWeaponPreview(key)}" /></div>
    <div class="wcInfo">
      <div class="wcName">${escapeHtml(w.name)}</div>
      <div class="wcMeta">${escapeHtml(w.category)} · ${ammo} balas${w.pellets > 1 ? ` · ${w.pellets} chumbos` : ''}</div>
      <div class="wcStats">${stats}</div>
    </div>`;
  card.style.setProperty('--accent', `#${w.color.toString(16).padStart(6, '0')}`);
  return card;
}

// Grade de escolha de 2 armas. onChange(selected) é chamado a cada clique.
function createLoadoutPicker(container, initial, onChange) {
  const selected = [...initial];
  container.innerHTML = '';
  const cards = {};

  const sync = () => {
    for (const key in cards) {
      const idx = selected.indexOf(key);
      cards[key].classList.toggle('selected', idx >= 0);
      cards[key].querySelector('.wcBadge').textContent = idx >= 0 ? `Slot ${idx + 1}` : '';
    }
    onChange([...selected]);
  };

  WEAPON_CHOICES.forEach((key) => {
    const card = createWeaponCard(key);
    card.addEventListener('click', () => {
      const idx = selected.indexOf(key);
      if (idx >= 0) selected.splice(idx, 1);
      else {
        if (selected.length >= 2) selected.shift(); // substitui a mais antiga
        selected.push(key);
      }
      sync();
    });
    cards[key] = card;
    container.appendChild(card);
  });

  sync();
  return {
    get: () => [...selected],
    set: (keys) => { selected.length = 0; selected.push(...keys); sync(); },
  };
}

// Mini cartão de slot (lobby)
function renderSlot(el, key, keyLabel) {
  if (!key) {
    el.innerHTML = `<span class="slotKey">${keyLabel}</span><div class="slotEmpty">Escolha uma arma</div>`;
    el.classList.remove('filled');
    return;
  }
  const w = WEAPONS[key];
  el.innerHTML = `<span class="slotKey">${keyLabel}</span><img src="${renderWeaponPreview(key)}" alt="" /><div class="slotName">${escapeHtml(w.name)}</div>`;
  el.classList.add('filled');
}

// -----------------------------------------------------------------------------
// HOTBAR (slots 1/2/3 com foto da arma e munição)
// -----------------------------------------------------------------------------
function renderHotbar(loadout, currentKey, ammo, keybinds) {
  const keys = [loadout[0], loadout[1], 'knife'];
  const labels = [keybinds.slot1, keybinds.slot2, keybinds.knife].map(formatKeyCode);
  $('hotbar').innerHTML = keys.map((key, i) => {
    if (!key) return '';
    const a = ammo[key];
    const ammoText = a === -1 || a === undefined ? '∞' : a;
    return `<div class="hotSlot${key === currentKey ? ' active' : ''}${a === 0 ? ' empty' : ''}" data-key="${key}">
      <span class="hotKey">${labels[i]}</span>
      <img src="${renderWeaponPreview(key)}" alt="" />
      <span class="hotAmmo">${ammoText}</span>
    </div>`;
  }).join('');
}

let weaponPopupTimeout = null;
function showWeaponPopup(key) {
  const el = $('weaponPopup');
  el.textContent = WEAPONS[key]?.name || '';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(weaponPopupTimeout);
  weaponPopupTimeout = setTimeout(() => el.classList.remove('show'), 900);
}

// -----------------------------------------------------------------------------
// VIDA, MUNIÇÃO, RECARGA, VELOCIDADE
// -----------------------------------------------------------------------------
function renderHealth(hp, alive) {
  const v = Math.max(0, Math.round(hp));
  $('healthFill').style.width = `${v}%`;
  $('healthTrail').style.width = `${v}%`; // a transição CSS mais lenta cria o "rastro"
  $('healthText').textContent = v;
  $('healthWrap').classList.toggle('low', v <= 35 && alive);
  $('lowHealthVignette').classList.toggle('critical', v <= 35 && alive);
}

function renderAmmo(key, ammo, reloading) {
  const w = WEAPONS[key];
  if (!w) return;
  $('weaponName').textContent = w.name;
  const a = ammo[key];
  const infinite = a === -1 || w.maxAmmo === Infinity;
  $('ammoCount').textContent = infinite ? '∞' : a;
  $('ammoMax').textContent = infinite ? '' : `/ ${w.maxAmmo}`;
  $('ammoPanel').classList.toggle('low', !infinite && a <= Math.ceil(w.maxAmmo * 0.25));
  $('reloadHint').classList.toggle('hidden', infinite || reloading || a > Math.ceil(w.maxAmmo * 0.25));
  $('reloadBar').classList.toggle('active', reloading);
}

function renderReloadProgress(progress) {
  $('reloadFill').style.width = `${Math.min(progress, 1) * 100}%`;
}

function renderSpeed(speed) {
  $('speedValue').textContent = Math.round(speed);
  $('speedometer').classList.toggle('fast', speed > 11);
  $('speedLines').style.opacity = Math.max(0, Math.min((speed - 10) / 10, 0.7));
}

// Aparência fixa da mira (estilo, cor, tamanho, espessura, contorno)
function applyCrosshairSettings(el, cfg) {
  el.dataset.style = cfg.style;
  el.style.setProperty('--color', cfg.color);
  el.style.setProperty('--len', `${Math.round(9 * cfg.size)}px`);
  el.style.setProperty('--thick', `${cfg.thickness}px`);
  el.classList.toggle('noOutline', !cfg.outline);
}

// Atualizada todo frame; só mexe no estilo quando algo muda
const crosshairState = {};
function setCrosshairVar(el, name, value) {
  if (crosshairState[name] === value) return;
  crosshairState[name] = value;
  el.style.setProperty(name, value);
}
function setCrosshairClass(el, name, on) {
  if (crosshairState[name] === on) return;
  crosshairState[name] = on;
  el.classList.toggle(name, on);
}

// spreadPx: raio da dispersão atual em pixels na tela
function renderCrosshair({ spreadPx, hidden, adsHidden, spreadCircle, cfg }) {
  const ch = $('crosshair');
  const open = cfg.dynamic ? spreadPx : 0;
  setCrosshairVar(ch, '--gap', `${Math.round(4 * cfg.size + open)}px`);
  // Escopeta: círculo do tamanho real do cone; estilo círculo: acompanha a abertura
  const circle = spreadCircle ? Math.max(spreadPx, 6) : 7 * cfg.size + open;
  setCrosshairVar(ch, '--circle', `${Math.round(circle)}px`);
  setCrosshairClass(ch, 'hidden', hidden);
  setCrosshairClass(ch, 'adsHidden', adsHidden);
  setCrosshairClass(ch, 'spreadCircle', spreadCircle);
}

// -----------------------------------------------------------------------------
// FEEDBACK DE ACERTO
// -----------------------------------------------------------------------------
let hitmarkerTimeout = null;
function showHitmarker(headshot, kill) {
  const hm = $('hitmarker');
  hm.className = '';
  void hm.offsetWidth;
  hm.classList.add('show');
  if (headshot) hm.classList.add('headshot');
  if (kill) hm.classList.add('kill');
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => { hm.className = ''; }, kill ? 420 : 220);
}

function showDamageNumber(screenX, screenY, damage, headshot, kill) {
  const el = document.createElement('div');
  el.className = `damageNumber${headshot ? ' headshot' : ''}${kill ? ' kill' : ''}`;
  el.textContent = kill ? `${damage} ✖` : damage;
  el.style.left = `${screenX + (Math.random() - 0.5) * 30}px`;
  el.style.top = `${screenY}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function showDamageFlash() {
  const flash = $('damageFlash');
  flash.classList.remove('show');
  void flash.offsetWidth;
  flash.classList.add('show');
}

function showDirectionalIndicator(angleDeg) {
  const indicator = document.createElement('div');
  indicator.className = 'directionalIndicator';
  indicator.style.transform = `rotate(${angleDeg}deg)`;
  $('damageIndicatorWrap').appendChild(indicator);
  setTimeout(() => indicator.remove(), 900);
}

let killBannerTimeout = null;
let killStreak = 0;
let killStreakTimeout = null;
function showKillBanner(victimName, headshot) {
  killStreak += 1;
  clearTimeout(killStreakTimeout);
  killStreakTimeout = setTimeout(() => { killStreak = 0; }, 4000);
  const streakText = ['', '', 'ABATE DUPLO', 'ABATE TRIPLO', 'MULTI ABATE'][Math.min(killStreak, 4)];
  const el = $('killBanner');
  el.innerHTML = `${streakText ? `<div class="kbStreak">${streakText}</div>` : ''}
    <div class="kbMain">${headshot ? '<span class="kbHead">HEADSHOT</span> ' : ''}ELIMINOU <b>${escapeHtml(victimName)}</b></div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(killBannerTimeout);
  killBannerTimeout = setTimeout(() => el.classList.remove('show'), 1800);
}

// -----------------------------------------------------------------------------
// KILLFEED E PLACAR
// -----------------------------------------------------------------------------
function addKillFeed({ killerId, killerName, victimId, victimName, weaponKey, headshot }, myId) {
  const el = document.createElement('div');
  el.className = 'kfEntry';
  if (killerId === myId) el.classList.add('mine');
  if (victimId === myId) el.classList.add('victim');
  const img = weaponKey ? `<img src="${renderWeaponPreview(weaponKey, 128, 64)}" alt="" />` : '';
  el.innerHTML = `<span class="kfKiller">${escapeHtml(killerName)}</span>${img}${headshot ? '<span class="kfHead">◎</span>' : ''}<span class="kfVictim">${escapeHtml(victimName)}</span>`;
  const feed = $('killfeed');
  feed.prepend(el);
  while (feed.children.length > 5) feed.lastChild.remove();
  setTimeout(() => el.classList.add('fade'), 5000);
  setTimeout(() => el.remove(), 5600);
}

function renderScoreboard(rows, myId) {
  $('scoreRows').innerHTML = rows.map((p, i) => {
    const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
    return `<tr class="${p.id === myId ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${kd}</td></tr>`;
  }).join('');
}

function renderEndScreen(rows) {
  const medals = ['🥇', '🥈', '🥉'];
  $('podium').innerHTML = rows.slice(0, 3).map((p, i) => `
    <div class="podiumSpot p${i + 1}">
      <div class="podiumMedal">${medals[i]}</div>
      <div class="podiumName">${escapeHtml(p.name)}</div>
      <div class="podiumKills">${p.kills} abates</div>
      <div class="podiumBlock"></div>
    </div>`).join('');
  $('finalScoreBody').innerHTML = rows
    .map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`)
    .join('');
}

// -----------------------------------------------------------------------------
// VOTAÇÃO COM PRÉVIA DOS MAPAS
// -----------------------------------------------------------------------------
function renderVoteOptions(options, counts, onVote) {
  const wrap = $('voteOptions');
  wrap.innerHTML = '';
  options.forEach((opt) => {
    const info = MAP_INFO[opt.id] || { name: opt.name, desc: '' };
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'voteCard';
    card.dataset.id = opt.id;
    card.innerHTML = `
      <div class="vcImage"><img src="${renderMapPreview(opt.id)}" alt="${escapeHtml(info.name)}" /></div>
      <div class="vcBody">
        <div class="vcName">${escapeHtml(info.name)}</div>
        <div class="vcDesc">${escapeHtml(info.desc)}</div>
      </div>
      <div class="vcVotes"><span class="vcCount">0</span> votos</div>
      <div class="vcBar"><i></i></div>`;
    card.addEventListener('click', () => {
      [...wrap.children].forEach((c) => c.classList.remove('voted'));
      card.classList.add('voted');
      onVote(opt.id);
    });
    wrap.appendChild(card);
  });
  updateVoteCounts(counts);
}

function updateVoteCounts(counts = {}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(0, ...Object.values(counts));
  document.querySelectorAll('.voteCard').forEach((card) => {
    const n = counts[card.dataset.id] || 0;
    card.querySelector('.vcCount').textContent = n;
    card.querySelector('.vcBar i').style.width = `${(n / total) * 100}%`;
    card.classList.toggle('leading', n > 0 && n === max);
  });
}

function setVoteTimer(seconds) {
  $('voteTimer').textContent = `Votação encerra em ${Math.max(seconds, 0)}s`;
}

// -----------------------------------------------------------------------------
// TELA DE MORTE (contagem calculada a partir de um horário-alvo fixo)
// -----------------------------------------------------------------------------
let deathCountdownInterval = null;
const RING_LENGTH = 2 * Math.PI * 44;

function showDeathScreen({ killerId, killerName, weaponKey, killerHealth }, respawnInMs, onRespawn) {
  const isReset = !killerId;
  document.querySelector('.deathTitle').textContent = isReset ? 'Reiniciando' : 'Você foi eliminado';
  document.querySelector('.deathKiller').classList.toggle('hidden', isReset);
  $('deathKillerName').textContent = killerName || '—';
  $('deathWeapon').textContent = weaponKey ? `com ${WEAPONS[weaponKey]?.name || ''}` : '';
  $('deathKillerHp').textContent = !isReset && killerHealth != null ? `Restou ${killerHealth} de vida para ele` : '';
  $('deathScreen').classList.remove('hidden');
  const ring = $('deathRing');
  ring.style.strokeDasharray = RING_LENGTH;

  const start = performance.now();
  const respawnAt = start + respawnInMs;
  const tick = () => {
    const now = performance.now();
    const remainingMs = Math.max(0, respawnAt - now);
    $('deathCountdown').textContent = Math.ceil(remainingMs / 1000);
    ring.style.strokeDashoffset = RING_LENGTH * (remainingMs / respawnInMs);
    if (remainingMs <= 0) stopDeathCountdown();
  };
  stopDeathCountdown();
  tick();
  deathCountdownInterval = setInterval(tick, 100);
  $('respawnBtn').onclick = onRespawn;
}

function stopDeathCountdown() {
  if (deathCountdownInterval) clearInterval(deathCountdownInterval);
  deathCountdownInterval = null;
}

function hideDeathScreen() {
  stopDeathCountdown();
  $('deathScreen').classList.add('hidden');
}

// -----------------------------------------------------------------------------
// CUSTOMIZAÇÃO DO PERSONAGEM
// -----------------------------------------------------------------------------
// Monta as seções de cores (paletas) e de acessórios; onChange(chave, valor)
function renderCharacterOptions(container, character, onChange) {
  container.innerHTML = '';
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const section = (key) => {
    const el = document.createElement('div');
    el.className = 'charSection';
    el.innerHTML = `<h4>${escapeHtml(CHARACTER_LABELS[key])}</h4>`;
    container.appendChild(el);
    return el;
  };
  for (const key of ['suit', 'accent', 'skin', 'glow']) {
    const row = document.createElement('div');
    row.className = 'charSwatches';
    CHARACTER_OPTIONS[key].forEach((color, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `charSwatch${character[key] === i ? ' active' : ''}`;
      btn.style.background = hex(color);
      btn.addEventListener('click', () => onChange(key, i));
      row.appendChild(btn);
    });
    section(key).appendChild(row);
  }
  for (const key of ['hat', 'face', 'back']) {
    const row = document.createElement('div');
    row.className = 'charChips';
    for (const value of CHARACTER_OPTIONS[key]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `charChip${character[key] === value ? ' active' : ''}`;
      btn.textContent = CHARACTER_LABELS.values[value] || value;
      btn.addEventListener('click', () => onChange(key, value));
      row.appendChild(btn);
    }
    section(key).appendChild(row);
  }
}
