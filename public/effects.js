// =============================================================================
// EFEITOS VISUAIS: CLARÃO, PARTÍCULAS, MARCAS DE TIRO, RASTROS E CORPOS
// =============================================================================
// Tudo usa pools fixos para não criar/destruir objetos durante o jogo.

const fx = {
  scene: null,
  particles: null,
  particleData: [],
  particleCursor: 0,
  decals: [],
  decalCursor: 0,
  tracers: [],
  flashes: [],
  corpses: [],
  glowTexture: null,
};

const PARTICLE_COUNT = 400;
const DECAL_COUNT = 80;
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _color = new THREE.Color();
const _zAxis = new THREE.Vector3(0, 0, 1);

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,230,160,0.9)');
  g.addColorStop(0.6, 'rgba(255,150,40,0.35)');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeDecalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.35, 'rgba(20,20,20,0.8)');
  g.addColorStop(0.7, 'rgba(40,40,40,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// Chamado uma vez por cena (e de novo ao trocar de mapa)
function initEffects(scene) {
  fx.scene = scene;
  if (!fx.glowTexture) fx.glowTexture = makeGlowTexture();

  // Partículas: um único InstancedMesh (1 draw call para todas)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  fx.particles = new THREE.InstancedMesh(geo, mat, PARTICLE_COUNT);
  fx.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fx.particles.frustumCulled = false;
  fx.particleData = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    fx.particleData.push({ life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0.05, gravity: -9 });
    _m4.makeScale(0, 0, 0);
    fx.particles.setMatrixAt(i, _m4);
    fx.particles.setColorAt(i, _color.set(0xffffff));
  }
  scene.add(fx.particles);

  // Marcas de tiro
  const decalTex = makeDecalTexture();
  const decalGeo = new THREE.PlaneGeometry(0.22, 0.22);
  fx.decals = [];
  for (let i = 0; i < DECAL_COUNT; i++) {
    const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    }));
    m.visible = false;
    m.userData.life = 0;
    scene.add(m);
    fx.decals.push(m);
  }
  fx.tracers.length = 0;
  fx.flashes.length = 0;
  fx.corpses.length = 0;
}

// -----------------------------------------------------------------------------
// PARTÍCULAS
// -----------------------------------------------------------------------------
function emitParticles(origin, normal, { count = 8, color = 0xffd27a, speed = 4, spread = 0.9, life = 0.4, size = 0.06, gravity = -12 }) {
  if (!fx.particles) return;
  for (let i = 0; i < count; i++) {
    const idx = fx.particleCursor;
    fx.particleCursor = (fx.particleCursor + 1) % PARTICLE_COUNT;
    const p = fx.particleData[idx];
    p.life = p.maxLife = life * (0.6 + Math.random() * 0.6);
    p.size = size * (0.6 + Math.random() * 0.8);
    p.gravity = gravity;
    p.pos.copy(origin);
    p.vel.set(
      normal.x + (Math.random() - 0.5) * spread * 2,
      normal.y + (Math.random() - 0.5) * spread * 2,
      normal.z + (Math.random() - 0.5) * spread * 2,
    ).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    fx.particles.setColorAt(idx, _color.set(color).multiplyScalar(0.8 + Math.random() * 0.4));
  }
  if (fx.particles.instanceColor) fx.particles.instanceColor.needsUpdate = true;
}

function updateParticles(dt) {
  if (!fx.particles) return;
  let changed = false;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = fx.particleData[i];
    if (p.life <= 0) continue;
    changed = true;
    p.life -= dt;
    if (p.life <= 0) {
      _m4.makeScale(0, 0, 0);
    } else {
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(1 - 1.5 * dt);
      p.pos.addScaledVector(p.vel, dt);
      const k = p.size * (p.life / p.maxLife);
      _s.set(k, k, k);
      _m4.compose(p.pos, _q.identity(), _s);
    }
    fx.particles.setMatrixAt(i, _m4);
  }
  if (changed) fx.particles.instanceMatrix.needsUpdate = true;
}

// -----------------------------------------------------------------------------
// IMPACTOS E MARCAS
// -----------------------------------------------------------------------------
function spawnImpact(point, normal, surfaceColor) {
  emitParticles(point, normal, { count: 7, color: 0xffd27a, speed: 6, life: 0.25, size: 0.045, gravity: -14 });
  emitParticles(point, normal, { count: 6, color: surfaceColor ?? 0x9a9a9a, speed: 2.5, life: 0.6, size: 0.09, gravity: -6, spread: 0.6 });

  const decal = fx.decals[fx.decalCursor];
  fx.decalCursor = (fx.decalCursor + 1) % DECAL_COUNT;
  decal.position.copy(point).addScaledVector(normal, 0.01);
  decal.quaternion.setFromUnitVectors(_zAxis, normal);
  decal.rotateZ(Math.random() * Math.PI);
  decal.scale.setScalar(0.7 + Math.random() * 0.6);
  decal.material.opacity = 1;
  decal.userData.life = 8;
  decal.visible = true;
}

function spawnBloodHit(point, headshot) {
  emitParticles(point, new THREE.Vector3(0, 0.4, 0), {
    count: headshot ? 16 : 9, color: headshot ? 0xff2a2a : 0xd61f1f, speed: headshot ? 5 : 3.5, life: 0.45, size: 0.08, gravity: -10,
  });
}

function updateDecals(dt) {
  for (const d of fx.decals) {
    if (!d.visible) continue;
    d.userData.life -= dt;
    if (d.userData.life <= 0) d.visible = false;
    else if (d.userData.life < 1.5) d.material.opacity = d.userData.life / 1.5;
  }
}

// -----------------------------------------------------------------------------
// RASTRO DA BALA (quad fino e brilhante, mais visível que THREE.Line)
// -----------------------------------------------------------------------------
const TRACER_GEO = new THREE.BoxGeometry(1, 1, 1);

function spawnBulletTracer(from, to, color = 0xffea55, width = 0.025) {
  if (!fx.scene) return;
  const dir = _p.copy(to).sub(from);
  const len = dir.length();
  if (len < 0.1) return;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(TRACER_GEO, mat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(_zAxis, dir.normalize());
  mesh.scale.set(width, width, len);
  fx.scene.add(mesh);
  fx.tracers.push({ mesh, life: 0.12, maxLife: 0.12 });
}

function updateTracers(dt) {
  for (let i = fx.tracers.length - 1; i >= 0; i--) {
    const t = fx.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      fx.scene.remove(t.mesh);
      t.mesh.material.dispose();
      fx.tracers.splice(i, 1);
    } else {
      t.mesh.material.opacity = 0.9 * (t.life / t.maxLife);
    }
  }
}

// -----------------------------------------------------------------------------
// CLARÃO DO DISPARO (sprite aditivo + luz rápida)
// -----------------------------------------------------------------------------
function createMuzzleFlash(parent, position, scale = 0.35) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: fx.glowTexture, color: 0xffe2a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  sprite.position.copy(position);
  sprite.scale.setScalar(scale);
  sprite.visible = false;
  parent.add(sprite);
  return sprite;
}

function triggerMuzzleFlash(sprite, duration = 0.05, baseScale = 0.35) {
  if (!sprite) return;
  sprite.visible = true;
  sprite.material.rotation = Math.random() * Math.PI;
  sprite.scale.setScalar(baseScale * (0.8 + Math.random() * 0.5));
  sprite.userData.flashLife = duration;
  if (!fx.flashes.includes(sprite)) fx.flashes.push(sprite);
}

function updateFlashes(dt) {
  for (let i = fx.flashes.length - 1; i >= 0; i--) {
    const s = fx.flashes[i];
    s.userData.flashLife -= dt;
    if (s.userData.flashLife <= 0) {
      s.visible = false;
      fx.flashes.splice(i, 1);
    }
  }
}

// -----------------------------------------------------------------------------
// CORPO CAINDO AO MORRER
// -----------------------------------------------------------------------------
// Clona o modelo (geometrias/materiais compartilhados), tomba e afunda no chão.
function spawnCorpse(group, attackerPos) {
  if (!fx.scene) return;
  const corpse = group.clone(true);
  corpse.visible = true;
  // cai para longe de quem atirou
  let fallDir = 1;
  if (attackerPos) {
    const toAttacker = Math.atan2(attackerPos.x - group.position.x, attackerPos.z - group.position.z);
    fallDir = Math.cos(toAttacker - group.rotation.y) > 0 ? 1 : -1;
  }
  corpse.userData = { t: 0, fallDir, baseY: group.position.y };
  fx.scene.add(corpse);
  fx.corpses.push(corpse);
  emitParticles(group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, 1, 0), {
    count: 18, color: 0xffffff, speed: 3, life: 0.6, size: 0.1, gravity: -2,
  });
}

function updateCorpses(dt) {
  for (let i = fx.corpses.length - 1; i >= 0; i--) {
    const c = fx.corpses[i];
    const d = c.userData;
    d.t += dt;
    const fall = Math.min(d.t / 0.45, 1);
    const eased = 1 - (1 - fall) * (1 - fall);
    c.rotation.x = d.fallDir * eased * (Math.PI / 2) * 0.95;
    c.position.y = d.baseY + 0.25 * eased - Math.max(0, d.t - 2) * 0.8;
    if (d.t > 3.2) {
      fx.scene.remove(c);
      fx.corpses.splice(i, 1);
    }
  }
}

function clearTransientEffects() {
  for (const t of fx.tracers) { fx.scene.remove(t.mesh); t.mesh.material.dispose(); }
  fx.tracers.length = 0;
  for (const c of fx.corpses) fx.scene.remove(c);
  fx.corpses.length = 0;
}

function updateEffects(dt) {
  updateParticles(dt);
  updateDecals(dt);
  updateTracers(dt);
  updateFlashes(dt);
  updateCorpses(dt);
}
