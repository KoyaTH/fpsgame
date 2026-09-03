const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Aceita WebSocket para baixa latência e HTTP polling como alternativa.
  transports: ['websocket', 'polling'],
});
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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
// CONFIGURAÇÃO DE ARMAS (precisa bater com public/game.js)
// ---------------------------------------------------------------------------
const WEAPONS = {
  smg: { name: 'Metralhadora', maxAmmo: 30, dmgBody: 18, dmgHead: 36, fireRate: 110, reloadTime: 2000, auto: true },
  sniper: { name: 'Sniper', maxAmmo: 3, dmgBody: 60, dmgHead: 100, fireRate: 1100, reloadTime: 2600, auto: false },
  pistol: { name: 'Pistolinha', maxAmmo: 12, dmgBody: 22, dmgHead: 44, fireRate: 240, reloadTime: 1500, auto: false },
  grapple: { name: 'Grappling Hook', maxAmmo: Infinity, dmgBody: 0, dmgHead: 0, fireRate: 550, reloadTime: 0, auto: false, isUtility: true },
  knife: { name: 'Faca', maxAmmo: Infinity, dmgBody: 40, dmgHead: 80, fireRate: 450, reloadTime: 0, auto: false, isMelee: true },
};

// ---------------------------------------------------------------------------
// MAPAS (só precisamos dos spawns aqui; a geometria é renderizada no cliente)
// ---------------------------------------------------------------------------
const MAPS = {
  arena: {
    name: 'Arena Clássica',
    spawns: [
      { x: 22, z: 22 }, { x: -22, z: 22 }, { x: 22, z: -22 }, { x: -22, z: -22 },
      { x: 0, z: 22 }, { x: 0, z: -22 }, { x: 22, z: 0 }, { x: -22, z: 0 },
      { x: 12, z: 12 }, { x: -12, z: 12 }, { x: 12, z: -12 }, { x: -12, z: -12 },
    ],
  },
  cidade: {
    name: 'Cidade Pequena',
    spawns: [
      { x: 24, z: 24 }, { x: -24, z: 24 }, { x: 24, z: -24 }, { x: -24, z: -24 },
      { x: 0, z: 24 }, { x: 0, z: -24 }, { x: 24, z: 0 }, { x: -24, z: 0 },
    ],
  },
  deserto: {
    name: 'Dunas do Deserto',
    spawns: [
      { x: 24, z: 24 }, { x: -24, z: 24 }, { x: 24, z: -24 }, { x: -24, z: -24 },
      { x: 0, z: 24 }, { x: 0, z: -24 }, { x: 24, z: 0 }, { x: -24, z: 0 },
    ],
  },
};
const MAP_IDS = Object.keys(MAPS);

// ---------------------------------------------------------------------------
// ESTADO DA PARTIDA
// ---------------------------------------------------------------------------
const MATCH_DURATION = 5 * 60; // 5 minutos em segundos
const VOTE_DURATION = 5;
const END_SCREEN_DURATION = 6;
const RESPAWN_DELAY = 5000;
const REGEN_DELAY_MS = 15000; // 17 segundos sem tomar dano para regenerar vida
const REGEN_PER_SECOND = 10; // Recupera 10 de vida por segundo

const game = {
  status: 'waiting', // 'waiting' | 'playing' | 'ended' | 'voting'
  currentMap: MAP_IDS[0],
  timeLeft: MATCH_DURATION,
  voteOptions: [],
  votes: {}, // socketId -> mapId
};

const players = {}; // socketId -> player object

function randomSpawn(mapId, currentPlayer) {
  const spawns = MAPS[mapId].spawns;
  const alivePlayers = Object.values(players).filter(pl => pl.alive && pl !== currentPlayer);

  if (alivePlayers.length === 0) {
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    return { x: s.x, y: 1.6, z: s.z };
  }

  // Avalia cada ponto de spawn e escolhe o que está mais longe de qualquer outro jogador vivo
  let bestSpawn = spawns[0];
  let maxMinDist = -1;

  for (const s of spawns) {
    let minDist = Infinity;
    for (const pl of alivePlayers) {
      const dist = Math.hypot(s.x - pl.x, s.z - pl.z);
      if (dist < minDist) {
        minDist = dist;
      }
    }
    if (minDist > maxMinDist) {
      maxMinDist = minDist;
      bestSpawn = s;
    }
  }

  return { x: bestSpawn.x, y: 1.6, z: bestSpawn.z };
}

function executeRespawn(playerId) {
  // Se o timer ainda existir, limpa ele para não dar respawn duplicado
  if (players[playerId] && players[playerId].respawnTimer) {
    clearTimeout(players[playerId].respawnTimer);
    players[playerId].respawnTimer = null;
  }

  if (players[playerId] && game.status === 'playing') {
    spawnPlayer(players[playerId]);
    io.to(playerId).emit('respawned', {
      x: players[playerId].x, y: players[playerId].y, z: players[playerId].z,
      ammo: players[playerId].ammo, weaponKey: players[playerId].weaponKey,
      health: players[playerId].health,
    });
  }
}


function freshAmmo(loadout) {
  return {
    [loadout[0]]: WEAPONS[loadout[0]].maxAmmo === Infinity ? -1 : WEAPONS[loadout[0]].maxAmmo,
    [loadout[1]]: WEAPONS[loadout[1]].maxAmmo === Infinity ? -1 : WEAPONS[loadout[1]].maxAmmo,
    knife: -1,
  };
}

function spawnPlayer(p) {
  const spawn = randomSpawn(game.currentMap, p);
  p.x = spawn.x; p.y = spawn.y; p.z = spawn.z; p.rotY = 0;
  p.health = 100;
  p.alive = true;
  p.weaponKey = p.loadout[0];
  p.ammo = freshAmmo(p.loadout);
  p.lastShot = 0;
  p.lastDamageTime = Date.now();
  p.reloadingUntil = 0;
}

function scoreboard() {
  return Object.values(players)
    .map((p) => ({ name: p.name, kills: p.kills, deaths: p.deaths }))
    .sort((a, b) => b.kills - a.kills);
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
    spawnPlayer(players[id]);
  }
  io.emit('matchStarted', { mapId, mapName: MAPS[mapId].name, duration: MATCH_DURATION });
  for (const id in players) {
    const p = players[id];
    io.to(id).emit('respawned', { x: p.x, y: p.y, z: p.z, ammo: p.ammo, weaponKey: p.weaponKey, health: p.health });
  }
}

function endMatch() {
  game.status = 'ended';
  io.emit('matchEnded', { scoreboard: scoreboard() });
  setTimeout(startVoting, END_SCREEN_DURATION * 1000);
}

function startVoting() {
  game.status = 'voting';
  game.timeLeft = VOTE_DURATION;
  game.votes = {};
  // sempre oferece os 3 mapas
  game.voteOptions = [...MAP_IDS];
  io.emit('voteStart', {
    options: game.voteOptions.map((id) => ({ id, name: MAPS[id].name })),
    duration: VOTE_DURATION,
  });
}

function tallyVotesAndStart() {
  const tally = {};
  game.voteOptions.forEach((id) => (tally[id] = 0));
  Object.values(game.votes).forEach((mapId) => {
    if (tally[mapId] !== undefined) tally[mapId] += 1;
  });
  let winner = game.voteOptions[Math.floor(Math.random() * game.voteOptions.length)];
  let best = -1;
  for (const id in tally) {
    if (tally[id] > best) { best = tally[id]; winner = id; }
  }
  startMatch(winner);
}

// timer principal (1x por segundo)
setInterval(() => {
  if (game.status === 'playing') {
    game.timeLeft -= 1;
    io.emit('matchTime', { timeLeft: game.timeLeft });
    if (game.timeLeft <= 0) endMatch();

    // Regeneração de vida após 17 segundos sem tomar dano
    const now = Date.now();
    for (const id in players) {
      const p = players[id];
      if (p.joined && p.alive && p.health < 100 && (now - (p.lastDamageTime || 0) >= REGEN_DELAY_MS)) {
        p.health = Math.min(100, p.health + REGEN_PER_SECOND);
        io.emit('playerHealed', { id: p.id, health: p.health });
      }
    }
  } else if (game.status === 'voting') {
    game.timeLeft -= 1;
    io.emit('voteTime', { timeLeft: game.timeLeft });
    if (game.timeLeft <= 0) tallyVotesAndStart();
  }
}, 1000);

// broadcast de posições (20Hz)
setInterval(() => {
  if (game.status !== 'playing') return;
  const snapshot = {};
  for (const id in players) {
    const p = players[id];
    if (!p.joined) continue;
    snapshot[id] = { id, x: p.x, y: p.y, z: p.z, rotY: p.rotY, health: p.health, alive: p.alive, name: p.name, weaponKey: p.weaponKey, kills: p.kills, deaths: p.deaths };
  }
  io.emit('state', snapshot);
}, 50);

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
    maps: MAP_IDS.map((id) => ({ id, name: MAPS[id].name })),
  });

  socket.on('requestInstantRespawn', () => {
    // console.log(`Jogador ${socket.id} pediu respawn rápido.`);
    executeRespawn(socket.id);
  });

  socket.on('playerDied', (data) => {
    io.emit('playerDied', {
      id: data.id,
      killerId: data.killerId,
      killerName: data.killerName,
      damage: data.damage,
      headshot: data.headshot,
      attackerPos: data.attackerPos,
    });

    // Salva o timer no objeto do player para podermos cancelar se ele clicar no botão
    if (players[data.id]) {
      // Cancela um timer antigo se por acaso existia
      if (players[data.id].respawnTimer) clearTimeout(players[data.id].respawnTimer);

      players[data.id].respawnTimer = setTimeout(() => {
        executeRespawn(data.id);
      }, RESPAWN_DELAY);
    }
  });


  socket.on('join', ({ name, loadout }) => {
    if (!Array.isArray(loadout) || loadout.length !== 2) return;
    const valid = loadout.every((w) => ['smg', 'sniper', 'pistol', 'grapple'].includes(w));
    if (!valid || loadout[0] === loadout[1]) return;

    const p = {
      id: socket.id,
      name: (name || 'Jogador').slice(0, 16),
      loadout,
      kills: 0,
      deaths: 0,
      joined: true,
    };
    players[socket.id] = p;

    if (game.status === 'playing') {
      spawnPlayer(p);
    } else {
      p.alive = false;
      p.health = 100;
      p.weaponKey = loadout[0];
      p.ammo = freshAmmo(loadout);
      p.x = 0; p.y = 1.6; p.z = 0; p.rotY = 0;
    }

    socket.emit('init', {
      id: socket.id,
      players,
      weapons: WEAPONS,
      game,
    });
    socket.broadcast.emit('playerJoined', { id: socket.id, name: p.name });
    // A primeira partida também começa por uma votação de 15 segundos.
    if (game.status === 'waiting') startVoting();
  });

  socket.on('move', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    p.x = data.x; p.y = data.y; p.z = data.z; p.rotY = data.rotY;
  });

  socket.on('switchWeapon', ({ key }) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (key !== 'knife' && !p.loadout.includes(key)) return;
    p.weaponKey = key;
  });

  socket.on('changeLoadout', ({ loadout }) => {
    const p = players[socket.id];
    if (!p) return;
    if (!Array.isArray(loadout) || loadout.length !== 2) return;
    const valid = loadout.every((w) => ['smg', 'sniper', 'pistol', 'grapple'].includes(w));
    if (!valid || loadout[0] === loadout[1]) return;

    p.loadout = loadout;
    p.ammo = freshAmmo(loadout);
    if (p.weaponKey !== 'knife' && !loadout.includes(p.weaponKey)) {
      p.weaponKey = loadout[0];
    }

    socket.emit('loadoutChanged', {
      loadout: p.loadout,
      weaponKey: p.weaponKey,
      ammo: p.ammo,
    });
  });

  socket.on('reload', () => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    const w = WEAPONS[p.weaponKey];
    if (!w || w.maxAmmo === Infinity) return;
    if (Date.now() < p.reloadingUntil) return;
    p.reloadingUntil = Date.now() + w.reloadTime;
    setTimeout(() => {
      if (players[socket.id] && players[socket.id].alive) {
        players[socket.id].ammo[p.weaponKey] = w.maxAmmo;
        io.to(socket.id).emit('ammoUpdate', { ammo: players[socket.id].ammo });
      }
    }, w.reloadTime);
  });

  socket.on('grapple', ({ x, y, z }) => {
    const p = players[socket.id];
    if (!p || !p.alive || game.status !== 'playing') return;
    const now = Date.now();
    if (now - (p.lastShot || 0) < WEAPONS.grapple.fireRate) return;
    p.lastShot = now;
    socket.broadcast.emit('grappleUsed', { id: socket.id, x, y, z });
  });

  socket.on('shoot', ({ targetId, isHead, hitPos }) => {
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive || game.status !== 'playing') return;

    const w = WEAPONS[shooter.weaponKey];
    if (!w || w.isUtility) return;

    const now = Date.now();
    if (now < shooter.reloadingUntil) return;
    if (now - (shooter.lastShot || 0) < w.fireRate) return;
    if (w.maxAmmo !== Infinity) {
      if (shooter.ammo[shooter.weaponKey] <= 0) return;
      shooter.ammo[shooter.weaponKey] -= 1;
      io.to(socket.id).emit('ammoUpdate', { ammo: shooter.ammo });
    }
    shooter.lastShot = now;

    // Transmite o tiro e trajetória para todos os outros jogadores (bullet tracer / muzzle flash)
    socket.broadcast.emit('playerShot', {
      id: socket.id,
      weaponKey: shooter.weaponKey,
      origin: { x: shooter.x, y: shooter.y + 1.2, z: shooter.z },
      hitPos: hitPos || null,
      isHead: !!isHead,
    });

    const target = targetId ? players[targetId] : null;
    if (!target || !target.alive) return;

    const dmg = isHead ? w.dmgHead : w.dmgBody;
    target.health -= dmg;
    target.lastDamageTime = now;

    if (target.health <= 0) {
      shooter.kills += 1;
      target.deaths += 1;
      target.alive = false;
      io.emit('killFeed', {
        killerName: shooter.name,
        victimName: target.name,
        weapon: w.name,
        headshot: !!isHead,
      });
      io.emit('playerDied', {
        id: targetId,
        killerId: socket.id,
        killerName: shooter.name,
        damage: dmg,
        headshot: !!isHead,
        attackerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
      });

      // Salva o timer aqui também (para o jogador que levou o tiro)
      if (players[targetId]) {
        if (players[targetId].respawnTimer) clearTimeout(players[targetId].respawnTimer);

        players[targetId].respawnTimer = setTimeout(() => {
          executeRespawn(targetId);
        }, RESPAWN_DELAY);
      }
    } else {
      io.emit('playerDamaged', {
        id: targetId,
        health: target.health,
        attackerId: socket.id,
        damage: dmg,
        headshot: !!isHead,
        attackerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
      });
    }
  });

  socket.on('vote', ({ mapId }) => {
    if (game.status !== 'voting') return;
    if (!game.voteOptions.includes(mapId)) return;
    game.votes[socket.id] = mapId;
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Para jogar na mesma rede: ${LAN_URL}`);
});
