// =============================================================================
// OBSTÁCULOS DOS MAPAS NO SERVIDOR
// =============================================================================
// Executa public/maps.js (o mesmo arquivo do cliente) num sandbox com um THREE
// mínimo e extrai as caixas de colisão (AABB). Assim servidor e cliente usam
// exatamente a mesma geometria, sem arquivo gerado para manter sincronizado.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MAPS_FILE = path.join(__dirname, '..', 'public', 'maps.js');

function createThreeShim() {
  function Vector3(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }
  Vector3.prototype.set = function (x, y, z) {
    this.x = x; this.y = y; this.z = z;
    return this;
  };
  // Rotação de Rodrigues (eixo normalizado) — usada pelas rampas giradas
  Vector3.prototype.applyAxisAngle = function (axis, angle) {
    const len = Math.hypot(axis.x, axis.y, axis.z) || 1;
    const kx = axis.x / len; const ky = axis.y / len; const kz = axis.z / len;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const dot = kx * this.x + ky * this.y + kz * this.z;
    const cx = ky * this.z - kz * this.y;
    const cy = kz * this.x - kx * this.z;
    const cz = kx * this.y - ky * this.x;
    const nx = this.x * cos + cx * sin + kx * dot * (1 - cos);
    const ny = this.y * cos + cy * sin + ky * dot * (1 - cos);
    const nz = this.z * cos + cz * sin + kz * dot * (1 - cos);
    return this.set(nx, ny, nz);
  };

  function BoxGeometry(width, height, depth) {
    this.parameters = { width, height, depth };
  }
  function CylinderGeometry(radiusTop, radiusBottom, height) {
    this.parameters = { radiusTop, radiusBottom, height };
  }
  function Object3D() {
    this.position = new Vector3();
    this.rotation = new Vector3();
  }
  function Mesh(geometry) {
    Object3D.call(this);
    this.geometry = geometry;
  }
  const Noop = function () { Object3D.call(this); };

  return {
    Vector3,
    BoxGeometry,
    CylinderGeometry,
    PlaneGeometry: Noop,
    MeshStandardMaterial: Noop,
    MeshBasicMaterial: Noop,
    GridHelper: Noop,
    Mesh,
  };
}

// Converte um mesh do shim em AABB { minX, maxX, minY, maxY, minZ, maxZ }
function meshToAABB(mesh) {
  const p = mesh.geometry.parameters;
  let w; let h; let d;
  if (p.radiusTop !== undefined) {
    const r = Math.max(p.radiusTop, p.radiusBottom);
    w = r * 2; d = r * 2; h = p.height;
  } else {
    w = p.width; h = p.height; d = p.depth;
  }
  const { x, y, z } = mesh.position;
  return {
    minX: x - w / 2, maxX: x + w / 2,
    minY: y - h / 2, maxY: y + h / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
  };
}

function loadMapObstacles() {
  const code = fs.readFileSync(MAPS_FILE, 'utf8');
  const context = { THREE: createThreeShim(), Math };
  vm.createContext(context);
  vm.runInContext(`${code}\n;globalThis.__MAP_BUILDERS = MAP_BUILDERS;`, context, { filename: MAPS_FILE });

  const builders = context.__MAP_BUILDERS;
  const result = {};
  for (const id of Object.keys(builders)) {
    const built = builders[id]({ add() {} });
    result[id] = {
      boxes: built.obstacles.map(meshToAABB),
      bounds: built.bounds || 38.5,
    };
  }
  return result;
}

module.exports = { loadMapObstacles };
