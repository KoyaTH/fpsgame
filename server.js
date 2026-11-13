const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const { loadMapObstacles } = require('./lib/mapObstacles');

// ---------------------------------------------------------------------------
// SERVIDOR HTTP / SOCKET.IO
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Aceita WebSocket para baixa latência e HTTP polling como alternativa.
  transports: ['websocket', 'polling'],
  // Sem compressão: mensagens pequenas e frequentes chegam mais rápido sem ela
  perMessageDeflate: false,
  httpCompression: false,
});
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

function getLocalAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return 'localhost';
}

const LAN_URL = `http://${getLocalAddress()}:${PORT}`;
app.get('/server-info', (req, res) => res.json({ inviteUrl: LAN_URL }));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// CONFIGURAÇÃO DE ARMAS (precisa bater com public/constants.js)
// ---------------------------------------------------------------------------
// falloff: dano cai linearmente de 100% (start) até min% (end), em metros
const WEAPONS = {
  smg: { name: 'Metralhadora', maxAmmo: 30, dmgBody: 18, dmgHead: 36, fireRate: 110, reloadTime: 2000, pellets: 1 },
  rifle: { name: 'Fuzil de Assalto', maxAmmo: 26, dmgBody: 22, dmgHead: 44, fireRate: 135, reloadTime: 2200, pellets: 1 },
  sniper: { name: 'Sniper', maxAmmo: 3, dmgBody: 60, dmgHead: 100, fireRate: 1100, reloadTime: 2600, pellets: 1 },
  pistol: { name: 'Pistolinha', maxAmmo: 12, dmgBody: 22, dmgHead: 44, fireRate: 240, reloadTime: 1500, pellets: 1 },
  revolver: { name: 'Revólver', maxAmmo: 6, dmgBody: 45, dmgHead: 90, fireRate: 560, reloadTime: 2100, pellets: 1 },
  shotgun: {
    name: 'Escopeta', maxAmmo: 6, dmgBody: 11, dmgHead: 16, fireRate: 800, reloadTime: 2400, pellets: 8,
    falloff: { start: 8, end: 26, min: 0.35 },
  },
  grapple: { name: 'Gancho', maxAmmo: Infinity, dmgBody: 0, dmgHead: 0, fireRate: 350, reloadTime: 0, isUtility: true },
  knife: { name: 'Faca', maxAmmo: Infinity, dmgBody: 40, dmgHead: 80, fireRate: 450, reloadTime: 0, isMelee: true, pellets: 1 },
};
const LOADOUT_CHOICES = ['smg', 'rifle', 'sniper', 'shotgun', 'pistol', 'revolver', 'grapple'];

// Tolerância de cadência: pacotes chegam com jitter de rede, então dois tiros
// enviados a 110ms podem chegar com 80ms de intervalo. Sem isso o servidor
// descartava tiros válidos (jogador "não tomava dano").
const FIRE_RATE_TOLERANCE = 0.7;
const MELEE_MAX_RANGE = 4.5;

// ---------------------------------------------------------------------------
// MAPAS (spawns aqui; a geometria vem de public/maps.js)
// ---------------------------------------------------------------------------
const MAPS = {
  arena: {
    name: 'Arena Clássica',
    spawns: [
      { x: 20, z: 20 }, { x: -20, z: 20 }, { x: 20, z: -20 }, { x: -20, z: -20 },
      { x: 0, z: 25 }, { x: 0, z: -25 }, { x: 25, z: 5 }, { x: -25, z: -5 },
      { x: 10, z: 10 }, { x: -10, z: 10 }, { x: 10, z: -10 }, { x: -10, z: -10 },
    ],
  },
  cidade: {
    name: 'Cidade Pequena',
    spawns: [
      { x: 33, z: 12 }, { x: -33, z: -12 }, { x: 12, z: -33 }, { x: -12, z: 33 },
      { x: 5, z: 17 }, { x: -5, z: -17 }, { x: 17, z: 5 }, { x: -17, z: -5 },
    ],
  },
  deserto: {
    name: 'Dunas do Deserto',
    spawns: [
      { x: 24, z: 34 }, { x: -24, z: -34 }, { x: 34, z: 14 }, { x: -34, z: -14 },
      { x: 12, z: 30 }, { x: -12, z: -30 }, { x: 12, z: 0 }, { x: -12, z: 4 },
    ],
  },
  neve: {
    name: 'Campo de Neve',
    spawns: [
      { x: -26, z: -16 }, { x: 26, z: -16 }, { x: -26, z: 16 }, { x: 26, z: 16 },
      { x: 0, z: -26 }, { x: 0, z: 26 }, { x: -26, z: 0 }, { x: 26, z: 0 },
      { x: -5, z: 3 }, { x: 5, z: -3 },
    ],
  },
};
const MAP_IDS = Object.keys(MAPS);
const MAP_OBSTACLES = loadMapObstacles();

// ---------------------------------------------------------------------------
// COLISÃO E PONTOS DE SPAWN
// ---------------------------------------------------------------------------
const EYE_HEIGHT = 1.6;          // precisa bater com PLAYER_HEIGHT em public/game.js
const SPAWN_RADIUS = 0.9;        // raio do jogador + folga
const MAX_STEP_HEIGHT = 0.6;     // obstáculos mais baixos que isso servem de "chão"

function boxesUnder(mapId, x, z, radius) {
  return MAP_OBSTACLES[mapId].boxes.filter((b) => (
    x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ
  ));
}

// Retorna a altura do chão no ponto ou null se o ponto estiver bloqueado
function spawnGroundAt(mapId, x, z) {
  const bounds = MAP_OBSTACLES[mapId].bounds - 1;
  if (Math.abs(x) > bounds || Math.abs(z) > bounds) return null;

  const nearby = boxesUnder(mapId, x, z, SPAWN_RADIUS);
  let ground = 0;
  for (const b of nearby) {
    if (b.minY <= 0.05 && b.maxY <= MAX_STEP_HEIGHT) ground = Math.max(ground, b.maxY);
  }
  const feet = ground + 0.05;
  const head = ground + EYE_HEIGHT + 0.4;
  for (const b of nearby) {
    if (b.maxY <= ground + 0.01) continue; // é o próprio chão
    if (b.maxY > feet && b.minY < head) return null;
  }
  return ground;
}

// Procura em espiral o ponto livre mais próximo do spawn configurado
function resolveSpawn(mapId, s) {
  for (let r = 0; r <= 8; r += 0.5) {
    const steps = r === 0 ? 1 : 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      const ground = spawnGroundAt(mapId, x, z);
      if (ground !== null) {
        return { x: +x.toFixed(2), y: +(ground + EYE_HEIGHT).toFixed(2), z: +z.toFixed(2) };
      }
    }
  }
  return null;
}

// Pré-calcula os spawns válidos de cada mapa uma única vez
const VALID_SPAWNS = {};
for (const mapId of MAP_IDS) {
  VALID_SPAWNS[mapId] = MAPS[mapId].spawns.map((s) => resolveSpawn(mapId, s)).filter(Boolean);
  if (VALID_SPAWNS[mapId].length === 0) {
    console.warn(`[spawn] mapa ${mapId} sem spawn válido; usando o centro.`);
    VALID_SPAWNS[mapId].push({ x: 0, y: EYE_HEIGHT + 5, z: 0 });
  }
}

// ---------------------------------------------------------------------------
// ESTADO DA PARTIDA
// ---------------------------------------------------------------------------
const MATCH_DURATION = 5 * 60; // 5 minutos em segundos
const VOTE_DURATION = 5;
const END_SCREEN_DURATION = 6;
const RESPAWN_DELAY = 5000;
const REGEN_DELAY_MS = 15000; // 15 segundos sem tomar dano para regenerar vida
const REGEN_PER_SECOND = 10;
// Taxas de rede (Hz). Em hospedagem com CPU fraca (ex.: plano gratuito do
// Render) dá para baixar com as variáveis de ambiente STATE_HZ / MOVE_HZ.
const clampHz = (v, def) => Math.max(10, Math.min(60, Number(v) || def));
const STATE_HZ = clampHz(process.env.STATE_HZ, 60); // snapshots servidor -> clientes
const MOVE_HZ = clampHz(process.env.MOVE_HZ, 60);   // posição cliente -> servidor
const STATE_RATE_MS = 1000 / STATE_HZ; // o cliente se adapta ao intervalo real

const game = {
  status: 'waiting', // 'waiting' | 'playing' | 'ended' | 'voting'
  currentMap: MAP_IDS[0],
  timeLeft: MATCH_DURATION,
  voteOptions: [],
  votes: {}, // socketId -> mapId
};

const players = {}; // socketId -> player

// ---------------------------------------------------------------------------
// HELPERS DE JOGADOR
// ---------------------------------------------------------------------------
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round2 = (v) => Math.round(v * 100) / 100;

function isValidLoadout(loadout) {
  return Array.isArray(loadout)
    && loadout.length === 2
    && loadout[0] !== loadout[1]
    && loadout.every((w) => LOADOUT_CHOICES.includes(w));
}

function freshAmmo(loadout) {
  const ammo = { knife: -1 };
  for (const key of loadout) ammo[key] = WEAPONS[key].maxAmmo === Infinity ? -1 : WEAPONS[key].maxAmmo;
  return ammo;
}

// Dados públicos do jogador (nunca enviar o objeto interno: ele guarda timers)
function publicPlayer(p) {
  return {
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, rotY: p.rotY, pitch: p.pitch, crouch: p.crouch,
    health: p.health, alive: p.alive, weaponKey: p.weaponKey,
    kills: p.kills, deaths: p.deaths,
  };
}

function scoreboard() {
  return Object.values(players)
    .map((p) => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }))
    .sort((a, b) => b.kills - a.kills);
}

function broadcastScoreboard() {
  io.emit('scoreboard', scoreboard());
}

function clearRespawnTimer(p) {
  if (p.respawnTimer) clearTimeout(p.respawnTimer);
  p.respawnTimer = null;
}

function cancelReload(p) {
  if (p.reloadTimer) clearTimeout(p.reloadTimer);
  p.reloadTimer = null;
  p.reloadingUntil = 0;
}

// Escolhe o spawn mais distante dos inimigos (com um pouco de aleatoriedade)
function pickSpawn(mapId, player) {
  const spawns = VALID_SPAWNS[mapId];
  const others = Object.values(players).filter((pl) => pl.alive && pl !== player);
  if (others.length === 0) return spawns[Math.floor(Math.random() * spawns.length)];

  const ranked = spawns
    .map((s) => ({
      s,
      dist: Math.min(...others.map((pl) => Math.hypot(s.x - pl.x, s.z - pl.z))),
    }))
    .sort((a, b) => b.dist - a.dist);
  const top = ranked.slice(0, Math.min(3, ranked.length));
  return top[Math.floor(Math.random() * top.length)].s;
}

function spawnPlayer(p) {
  const s = pickSpawn(game.currentMap, p);
  clearRespawnTimer(p);
  cancelReload(p);
  p.x = s.x; p.y = s.y; p.z = s.z;
  p.rotY = Math.atan2(s.x, s.z); // olha para o centro do mapa
  p.pitch = 0;
  p.crouch = 0;
  p.grappling = false;
  p.health = 100;
  p.alive = true;
  p.weaponKey = p.loadout[0];
  p.ammo = freshAmmo(p.loadout);
  p.lastShotAt = {};
  p.lastDamageTime = Date.now();
  // A sequência invalida pacotes "move" antigos que ainda estejam a caminho
  // (eles faziam o jogador voltar para onde morreu = teleporte).
  p.spawnSeq = (p.spawnSeq || 0) + 1;
}

function emitRespawned(p) {
  io.to(p.id).emit('respawned', {
    x: p.x, y: p.y, z: p.z, rotY: p.rotY,
    ammo: p.ammo, weaponKey: p.weaponKey, health: p.health, seq: p.spawnSeq,
  });
}

function respawnNow(p) {
  if (!p || game.status !== 'playing') return;
  spawnPlayer(p);
  emitRespawned(p);
}

function releaseGrapple(p) {
  if (!p.grappling) return;
  p.grappling = false;
  io.emit('grappleReleased', { id: p.id });
}

function killPlayer(victim, killer, weaponKey, headshot, damage) {
  const weaponName = weaponKey ? WEAPONS[weaponKey].name : null;
  victim.alive = false;
  victim.health = 0;
  cancelReload(victim);
  releaseGrapple(victim);

  const isReset = !killer;
  if (!isReset) {
    victim.deaths += 1;
    if (killer !== victim) killer.kills += 1;
    io.emit('killFeed', {
      killerId: killer.id, killerName: killer.name, victimId: victim.id, victimName: victim.name,
      weapon: weaponName, weaponKey, headshot: !!headshot,
    });
    broadcastScoreboard();
  }

  io.emit('playerDied', {
    id: victim.id,
    killerId: killer ? killer.id : null,
    killerName: killer ? killer.name : 'Reset',
    killerHealth: killer ? killer.health : null,
    weapon: weaponName,
    weaponKey,
    damage,
    headshot: !!headshot,
    attackerPos: killer ? { x: killer.x, y: killer.y, z: killer.z } : null,
    respawnIn: RESPAWN_DELAY,
  });

  clearRespawnTimer(victim);
  victim.respawnTimer = setTimeout(() => {
    victim.respawnTimer = null;
    if (players[victim.id] && !victim.alive) respawnNow(victim);
  }, RESPAWN_DELAY);
}

// ---------------------------------------------------------------------------
// MÁQUINA DE ESTADOS DA PARTIDA
// ---------------------------------------------------------------------------
function startMatch(mapId) {
  game.status = 'playing';
  game.currentMap = mapId;
  game.timeLeft = MATCH_DURATION;
  for (const id in players) {
    players[id].kills = 0;
    players[id].deaths = 0;
    players[id].alive = false; // evita que spawns considerem posições do mapa anterior
  }
  io.emit('matchStarted', { mapId, mapName: MAPS[mapId].name, duration: MATCH_DURATION });
  for (const id in players) respawnNow(players[id]);
  broadcastScoreboard();
}

function endMatch() {
  game.status = 'ended';
  for (const id in players) {
    clearRespawnTimer(players[id]);
    cancelReload(players[id]);
    players[id].alive = false;
  }
  io.emit('matchEnded', { scoreboard: scoreboard() });
  setTimeout(startVoting, END_SCREEN_DURATION * 1000);
}

function voteCounts() {
  const counts = {};
  game.voteOptions.forEach((id) => { counts[id] = 0; });
  Object.values(game.votes).forEach((mapId) => { if (counts[mapId] !== undefined) counts[mapId] += 1; });
  return counts;
}

function voteStartPayload() {
  return {
    options: game.voteOptions.map((id) => ({ id, name: MAPS[id].name })),
    duration: game.timeLeft,
    counts: voteCounts(),
  };
}

function startVoting() {
  if (Object.keys(players).length === 0) {
    game.status = 'waiting';
    return;
  }
  game.status = 'voting';
  game.timeLeft = VOTE_DURATION;
  game.votes = {};
  game.voteOptions = [...MAP_IDS];
  io.emit('voteStart', voteStartPayload());
}

function tallyVotesAndStart() {
  const tally = voteCounts();
  const best = Math.max(...Object.values(tally));
  const winners = game.voteOptions.filter((id) => tally[id] === best);
  startMatch(winners[Math.floor(Math.random() * winners.length)]);
}

// Relógio principal (1x por segundo)
setInterval(() => {
  if (game.status === 'playing') {
    game.timeLeft = Math.max(game.timeLeft - 1, 0);
    io.emit('matchTime', { timeLeft: game.timeLeft });
    if (game.timeLeft <= 0) {
      endMatch();
      return;
    }

    // Regeneração de vida após REGEN_DELAY_MS sem tomar dano
    const now = Date.now();
    for (const id in players) {
      const p = players[id];
      if (p.alive && p.health < 100 && now - p.lastDamageTime >= REGEN_DELAY_MS) {
        p.health = Math.min(100, p.health + REGEN_PER_SECOND);
        io.emit('playerHealed', { id: p.id, health: p.health });
      }
    }
  } else if (game.status === 'voting') {
    game.timeLeft = Math.max(game.timeLeft - 1, 0);
    io.emit('voteTime', { timeLeft: game.timeLeft });
    if (game.timeLeft <= 0) tallyVotesAndStart();
  }
}, 1000);

// Snapshot compacto de posições (STATE_HZ):
// [id, x, y, z, rotY, alive(0/1), weaponKey, health, pitch, crouch(0..1), grappling(0/1)]
function sendSnapshot() {
  if (game.status !== 'playing') return;
  const list = [];
  for (const id in players) {
    const p = players[id];
    list.push([
      id, round2(p.x), round2(p.y), round2(p.z), round2(p.rotY), p.alive ? 1 : 0, p.weaponKey, p.health,
      round2(p.pitch || 0), round2(p.crouch || 0), p.grappling ? 1 : 0,
    ]);
  }
  if (list.length > 0) io.volatile.emit('state', { t: Date.now(), p: list });
}

// setInterval atrasa no Windows (timer de ~15ms); este laço mira o próximo
// horário exato e compensa o atraso, mantendo a média em 60Hz.
let nextSnapshotAt = performance.now();
function snapshotLoop() {
  sendSnapshot();
  const now = performance.now();
  nextSnapshotAt += STATE_RATE_MS;
  if (nextSnapshotAt < now - 100) nextSnapshotAt = now; // servidor ficou travado: recomeça
  setTimeout(snapshotLoop, Math.max(0, nextSnapshotAt - now));
}
snapshotLoop();

// ---------------------------------------------------------------------------
// SOCKET.IO
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  // Medição de ping: o cliente manda a hora dele e mede quando a resposta volta
  socket.on('latency', (sentAt, ack) => {
    if (typeof ack === 'function') ack(sentAt);
  });

  socket.emit('gameInfo', {
    status: game.status,
    currentMap: game.currentMap,
    mapName: MAPS[game.currentMap].name,
    timeLeft: game.timeLeft,
    inviteUrl: LAN_URL,
  });

  socket.on('join', (data) => {
    const { name, loadout } = data || {};
    if (players[socket.id] || !isValidLoadout(loadout)) return;

    const p = {
      id: socket.id,
      name: String(name || 'Jogador').slice(0, 16),
      loadout: [...loadout],
      kills: 0,
      deaths: 0,
      alive: false,
      health: 100,
      weaponKey: loadout[0],
      ammo: freshAmmo(loadout),
      x: 0, y: EYE_HEIGHT, z: 0, rotY: 0,
      lastShotAt: {},
      lastDamageTime: 0,
      reloadingUntil: 0,
      reloadTimer: null,
      respawnTimer: null,
      spawnSeq: 0,
    };
    players[socket.id] = p;
    if (game.status === 'playing') spawnPlayer(p);

    const others = {};
    for (const id in players) others[id] = publicPlayer(players[id]);
    socket.emit('init', {
      id: socket.id,
      players: others,
      seq: p.spawnSeq,
      ammo: p.ammo, // munição é privada: só vai para o próprio jogador
      net: { moveHz: MOVE_HZ },
      game: { status: game.status, currentMap: game.currentMap, mapName: MAPS[game.currentMap].name, timeLeft: game.timeLeft },
    });
    socket.broadcast.emit('playerJoined', publicPlayer(p));
    broadcastScoreboard();

    if (game.status === 'waiting') startVoting();
    else if (game.status === 'voting') socket.emit('voteStart', voteStartPayload());
  });

  socket.on('move', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive || !data) return;
    if (data.seq !== p.spawnSeq) return; // pacote de antes do último respawn
    const { x, y, z, rotY } = data;
    if (![x, y, z, rotY].every(isFiniteNum)) return;
    const bounds = MAP_OBSTACLES[game.currentMap].bounds;
    p.x = Math.max(-bounds, Math.min(bounds, x));
    p.y = Math.max(0, Math.min(60, y));
    p.z = Math.max(-bounds, Math.min(bounds, z));
    p.rotY = rotY;
    p.pitch = isFiniteNum(data.pitch) ? Math.max(-1.6, Math.min(1.6, data.pitch)) : 0;
    p.crouch = isFiniteNum(data.crouch) ? Math.max(0, Math.min(1, data.crouch)) : 0;
  });

  socket.on('switchWeapon', (data) => {
    const { key } = data || {};
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (key !== 'knife' && !p.loadout.includes(key)) return;
    if (p.weaponKey !== key) {
      cancelReload(p);
      releaseGrapple(p);
    }
    p.weaponKey = key;
  });

  socket.on('changeLoadout', (data) => {
    const { loadout } = data || {};
    const p = players[socket.id];
    if (!p || !isValidLoadout(loadout)) return;
    cancelReload(p);
    p.loadout = [...loadout];
    p.ammo = freshAmmo(p.loadout);
    if (p.weaponKey !== 'knife' && !p.loadout.includes(p.weaponKey)) p.weaponKey = p.loadout[0];
    socket.emit('loadoutChanged', { loadout: p.loadout, weaponKey: p.weaponKey, ammo: p.ammo });
  });

  socket.on('reload', () => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    const key = p.weaponKey;
    const w = WEAPONS[key];
    if (!w || w.maxAmmo === Infinity || p.reloadTimer) return;
    if (p.ammo[key] >= w.maxAmmo) {
      socket.emit('reloadDone', { ammo: p.ammo });
      return;
    }
    p.reloadingUntil = Date.now() + w.reloadTime;
    p.reloadTimer = setTimeout(() => {
      p.reloadTimer = null;
      p.reloadingUntil = 0;
      if (!players[socket.id] || !p.alive) return;
      p.ammo[key] = w.maxAmmo; // recarrega a arma que iniciou a recarga
      socket.emit('reloadDone', { ammo: p.ammo });
    }, w.reloadTime);
  });

  socket.on('grapple', (point) => {
    const p = players[socket.id];
    if (!p || !p.alive || game.status !== 'playing' || !point) return;
    if (![point.x, point.y, point.z].every(isFiniteNum)) return;
    const now = Date.now();
    if (now - (p.lastShotAt.grapple || 0) < WEAPONS.grapple.fireRate * FIRE_RATE_TOLERANCE) return;
    p.lastShotAt.grapple = now;
    p.grappling = true;
    socket.broadcast.emit('grappleUsed', { id: socket.id, x: point.x, y: point.y, z: point.z });
  });

  socket.on('grappleRelease', () => {
    const p = players[socket.id];
    if (p) releaseGrapple(p);
  });

  // Payload: { hits: [{ id, head }], ends: [{ x, y, z }] }
  // Uma entrada em hits por projétil que acertou alguém (escopeta: até 8).
  socket.on('shoot', (data) => {
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive || game.status !== 'playing' || !data) return;

    const key = shooter.weaponKey;
    const w = WEAPONS[key];
    if (!w || w.isUtility) return;

    const now = Date.now();
    if (now < shooter.reloadingUntil) return;
    if (now - (shooter.lastShotAt[key] || 0) < w.fireRate * FIRE_RATE_TOLERANCE) return;
    if (w.maxAmmo !== Infinity) {
      if (shooter.ammo[key] <= 0) {
        socket.emit('ammoUpdate', { ammo: shooter.ammo }); // ressincroniza o cliente
        return;
      }
      shooter.ammo[key] -= 1;
    }
    shooter.lastShotAt[key] = now;

    const ends = (Array.isArray(data.ends) ? data.ends : [])
      .slice(0, w.pellets)
      .filter((e) => e && [e.x, e.y, e.z].every(isFiniteNum))
      .map((e) => ({ x: round2(e.x), y: round2(e.y), z: round2(e.z) }));
    socket.broadcast.emit('playerShot', { id: socket.id, weaponKey: key, ends });

    // Soma o dano de todos os projéteis por alvo
    const damageByTarget = new Map();
    const hits = Array.isArray(data.hits) ? data.hits.slice(0, w.pellets) : [];
    for (const hit of hits) {
      const target = hit && players[hit.id];
      if (!target || !target.alive || target === shooter) continue;
      const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y, target.z - shooter.z);
      if (w.isMelee && dist > MELEE_MAX_RANGE) continue;
      let dmg = hit.head ? w.dmgHead : w.dmgBody;
      if (w.falloff) {
        const { start, end, min } = w.falloff;
        const t = Math.max(0, Math.min(1, (dist - start) / (end - start)));
        dmg *= 1 - t * (1 - min);
      }
      const entry = damageByTarget.get(target) || { dmg: 0, head: false };
      entry.dmg += dmg;
      entry.head = entry.head || !!hit.head;
      damageByTarget.set(target, entry);
    }

    for (const [target, { dmg: rawDmg, head }] of damageByTarget) {
      const dmg = Math.max(1, Math.round(rawDmg));
      target.health = Math.max(target.health - dmg, 0);
      target.lastDamageTime = now;
      if (target.health <= 0) {
        killPlayer(target, shooter, key, head, dmg);
      } else {
        io.emit('playerDamaged', {
          id: target.id,
          health: target.health,
          attackerId: socket.id,
          damage: dmg,
          headshot: head,
          attackerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
        });
      }
    }
  });

  // Tecla de reset (P): morre sem contar kill/morte e respawna após o delay
  socket.on('suicide', () => {
    const p = players[socket.id];
    if (!p || !p.alive || game.status !== 'playing') return;
    killPlayer(p, null, null, false, 0);
  });

  // Botão "Respawn" da tela de morte: só funciona se estiver morto
  socket.on('requestInstantRespawn', () => {
    const p = players[socket.id];
    if (!p || p.alive || game.status !== 'playing') return;
    respawnNow(p);
  });

  socket.on('vote', (data) => {
    const { mapId } = data || {};
    if (game.status !== 'voting') return;
    if (!game.voteOptions.includes(mapId)) return;
    game.votes[socket.id] = mapId;
    io.emit('voteUpdate', { counts: voteCounts() });
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;
    clearRespawnTimer(p);
    cancelReload(p);
    delete players[socket.id];
    delete game.votes[socket.id];
    io.emit('playerLeft', socket.id);
    broadcastScoreboard();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT} (snapshots ${STATE_HZ}Hz, movimento ${MOVE_HZ}Hz)`);
  console.log(`Para jogar na mesma rede: ${LAN_URL}`);
  for (const mapId of MAP_IDS) {
    console.log(`[spawn] ${mapId}: ${VALID_SPAWNS[mapId].length}/${MAPS[mapId].spawns.length} spawns válidos`);
  }
});
