const fs = require('fs');
const vm = require('vm');
const path = require('path');

const mapsPath = path.join(__dirname, '..', 'public', 'maps.js');
const outPath = path.join(__dirname, '..', 'public', 'map_obstacles.json');

const code = fs.readFileSync(mapsPath, 'utf8');

// Minimal THREE shim to capture geometry parameters and mesh positions
const context = {
  console,
  THREE: {
    BoxGeometry: function (w, h, d) { this.parameters = { width: w, height: h, depth: d }; },
    CylinderGeometry: function (rTop, rBot, height, segs) { this.parameters = { radiusTop: rTop, radiusBottom: rBot, height: height, segments: segs }; },
    PlaneGeometry: function (w, h) { this.parameters = { width: w, height: h }; },
    GridHelper: function () { return { isGridHelper: true, position: { x: 0, y: 0, z: 0 } }; },
    MeshStandardMaterial: function (opts) { this.options = opts || {}; },
    Mesh: function (geometry, material) {
      this.geometry = geometry || {};
      this.material = material || {};
      this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.castShadow = false; this.receiveShadow = false;
    },
    Vector3: function (x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; this.applyAxisAngle = function () { return this; }; },
    MeshBasicMaterial: function () {},
    Math: Math,
  },
  window: {},
  document: {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: () => {},
  navigator: {},
  performance: typeof performance !== 'undefined' ? performance : { now: () => Date.now() },
};

vm.createContext(context);
vm.runInContext(code, context, { filename: mapsPath });
console.log('context keys after run:', Object.keys(context).slice(0,80));
let builders = null;
try {
  builders = vm.runInContext('typeof MAP_BUILDERS !== "undefined" ? MAP_BUILDERS : null', context);
} catch (e) {
  builders = null;
}
if (!builders) {
  console.error('MAP_BUILDERS not found in maps.js');
  process.exit(1);
}

const obstaclesOut = {};

for (const id of Object.keys(builders)) {
  try {
    const scene = { add: () => {} };
    const result = builders[id](scene);
    const obs = result && result.obstacles ? result.obstacles : [];
    obstaclesOut[id] = [];
    for (const m of obs) {
      const g = m.geometry && m.geometry.parameters ? m.geometry.parameters : {};
      let w = g.width || g.radiusTop * 2 || g.radiusBottom * 2 || 1;
      let h = g.height || g.depth || g.radiusTop || 1;
      let d = g.depth || g.width || g.radiusTop * 2 || 1;
      // Normalize: BoxGeometry uses width,height,depth; Cylinder uses radiusTop,radiusBottom,height
      if (g.radiusTop !== undefined && g.height !== undefined) {
        w = g.radiusTop * 2; d = g.radiusTop * 2; h = g.height;
      }
      const ox = (m.position && m.position.x) || 0;
      const oy = (m.position && m.position.y) || 0;
      const oz = (m.position && m.position.z) || 0;
      obstaclesOut[id].push({ x: ox, z: oz, w: Number(w.toFixed(3)), d: Number(d.toFixed(3)), y: Number(oy.toFixed(3)), h: Number(h.toFixed(3)) });
    }
  } catch (e) {
    console.error('Error building map', id, e.stack || e.message);
  }
}

fs.writeFileSync(outPath, JSON.stringify(obstaclesOut, null, 2), 'utf8');
console.log('Wrote', outPath);
