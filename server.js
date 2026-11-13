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
const WEAPONS = {
  smg: { name: 'Metralhadora', maxAmmo: 30, dmgBody: 18, dmgHead: 36, fireRate: 110, reloadTime: 2000 },
  sniper: { name: 'Sniper', maxAmmo: 3, dmgBody: 60, dmgHead: 100, fireRate: 1100, reloadTime: 2600 },
  pistol: { name: 'Pistolinha', maxAmmo: 12, dmgBody: 22, dmgHead: 44, fireRate: 240, reloadTime: 1500 },
  grapple: { name: 'Grappling Hook', maxAmmo: Infinity, dmgBody: 0, dmgHead: 0, fireRate: 550, reloadTime: 0, isUtility: true },
  knife: { name: 'Faca', maxAmmo: Infinity, dmgBody: 40, dmgHead: 80, fireRate: 450, reloadTime: 0, isMelee: true },
};
const LOADOUT_CHOICES = ['smg', 'sniper', 'pistol', 'grapple'];

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
const STATE_RATE_MS = 50; // 20Hz

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
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, rotY: p.rotY,
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

function killPlayer(victim, killer, weaponName, headshot, damage) {
  victim.alive = false;
  victim.health = 0;
  cancelReload(victim);

  const isReset = !killer;
  if (!isReset) {
    victim.deaths += 1;
    if (killer !== victim) killer.kills += 1;
    io.emit('killFeed', { killerName: killer.name, victimName: victim.name, weapon: weaponName, headshot: !!headshot });
    broadcastScoreboard();
  }

  io.emit('playerDied', {
    id: victim.id,
    killerId: killer ? killer.id : null,
    killerName: killer ? killer.name : 'Reset',
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

function voteStartPayload() {
  return {
    options: game.voteOptions.map((id) => ({ id, name: MAPS[id].name })),
    duration: game.timeLeft,
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
  const tally = {};
  game.voteOptions.forEach((id) => { tally[id] = 0; });
  Object.values(game.votes).forEach((mapId) => {
    if (tally[mapId] !== undefined) tally[mapId] += 1;
  });
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

// Snapshot compacto de posições (20Hz):
// [id, x, y, z, rotY, alive(0/1), weaponKey, health]
setInterval(() => {
  if (game.status !== 'playing') return;
  const list = [];
  for (const id in players) {
    const p = players[id];
    list.push([id, round2(p.x), round2(p.y), round2(p.z), round2(p.rotY), p.alive ? 1 : 0, p.weaponKey, p.health]);
  }
  if (list.length > 0) io.volatile.emit('state', { t: Date.now(), p: list });
}, STATE_RATE_MS);

// ---------------------------------------------------------------------------
// SOCKET.IO
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
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
  });

  socket.on('switchWeapon', (data) => {
    const { key } = data || {};
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (key !== 'knife' && !p.loadout.includes(key)) return;
    if (p.weaponKey !== key) cancelReload(p);
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
    socket.broadcast.emit('grappleUsed', { id: socket.id, x: point.x, y: point.y, z: point.z });
  });

  socket.on('shoot', (data) => {
    const { targetId, isHead, hitPos } = data || {};
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive || game.status !== 'playing') return;

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

    const validHit = hitPos && [hitPos.x, hitPos.y, hitPos.z].every(isFiniteNum);
    socket.broadcast.emit('playerShot', {
      id: socket.id,
      weaponKey: key,
      hitPos: validHit ? { x: hitPos.x, y: hitPos.y, z: hitPos.z } : null,
    });

    const target = targetId ? players[targetId] : null;
    if (!target || !target.alive || target === shooter) return;
    if (w.isMelee && Math.hypot(target.x - shooter.x, target.z - shooter.z) > MELEE_MAX_RANGE) return;

    const dmg = isHead ? w.dmgHead : w.dmgBody;
    target.health = Math.max(target.health - dmg, 0);
    target.lastDamageTime = now;

    if (target.health <= 0) {
      killPlayer(target, shooter, w.name, isHead, dmg);
    } else {
      io.emit('playerDamaged', {
        id: target.id,
        health: target.health,
        attackerId: socket.id,
        damage: dmg,
        headshot: !!isHead,
        attackerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
      });
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
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Para jogar na mesma rede: ${LAN_URL}`);
  for (const mapId of MAP_IDS) {
    console.log(`[spawn] ${mapId}: ${VALID_SPAWNS[mapId].length}/${MAPS[mapId].spawns.length} spawns válidos`);
  }
});
