// =============================================================================
// TEXTURAS PROCEDURAIS E CÉU
// =============================================================================
// Gera texturas em canvas (sem arquivos de imagem) quase brancas, que são
// multiplicadas pela cor de cada material. Cada superfície é gerada uma vez e
// compartilhada por todos os meshes; as UVs das caixas são escaladas pelo
// tamanho da face para a textura não esticar.

const TEX_SIZE = 256;
const surfaceTextureCache = {};

// Metros cobertos por uma repetição da textura
const SURFACE_SCALE = {
  concrete: 4, panel: 3, metal: 2, brick: 2.5, plaster: 4, wood: 2, crate: 1.9,
  rock: 4, stone: 3, sand: 6, snow: 6, ice: 5, asphalt: 6, tiles: 3, hazard: 1.2,
  sandbag: 1.5, cloth: 2, glass: 2,
};

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  return [canvas, canvas.getContext('2d')];
}

// Ruído por pixel: variação de brilho em torno de base (0..255)
function noiseFill(ctx, base, amount, rand) {
  const img = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] * (base / 255) + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * (base / 255) + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * (base / 255) + n));
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, rand, count, minR, maxR, color) {
  for (let i = 0; i < count; i++) {
    const x = rand() * TEX_SIZE;
    const y = rand() * TEX_SIZE;
    const r = minR + rand() * (maxR - minR);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // desenha com wrap para a textura repetir sem costura
    for (const ox of [-TEX_SIZE, 0, TEX_SIZE]) {
      for (const oy of [-TEX_SIZE, 0, TEX_SIZE]) ctx.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
    }
  }
}

const SURFACE_PAINTERS = {
  concrete(ctx, rand) {
    ctx.fillStyle = '#e6e6e6'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    blotches(ctx, rand, 30, 10, 40, 'rgba(0,0,0,0.05)');
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, TEX_SIZE - 2, TEX_SIZE - 2);
    noiseFill(ctx, 255, 26, rand);
  },
  panel(ctx, rand) {
    ctx.fillStyle = '#dcdfe4'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(6, 6, 116, 244); ctx.fillRect(134, 6, 116, 116);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 124, 252); ctx.strokeRect(130, 2, 124, 124); ctx.strokeRect(130, 130, 124, 124);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    [[12, 12], [116, 12], [12, 244], [116, 244], [140, 12], [244, 12], [140, 140], [244, 244]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
    noiseFill(ctx, 255, 14, rand);
  },
  metal(ctx, rand) {
    ctx.fillStyle = '#d4d8de'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let y = 0; y < TEX_SIZE; y++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.08})`;
      ctx.fillRect(0, y, TEX_SIZE, 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, TEX_SIZE - 2, TEX_SIZE - 2);
    noiseFill(ctx, 255, 10, rand);
  },
  brick(ctx, rand) {
    ctx.fillStyle = '#b9b2ab'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    const bh = 32; const bw = 64;
    for (let row = 0; row < TEX_SIZE / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < TEX_SIZE / bw + 1; col++) {
        const v = 215 + Math.floor(rand() * 40);
        ctx.fillStyle = `rgb(${v},${v - 6},${v - 10})`;
        ctx.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
      }
    }
    noiseFill(ctx, 255, 30, rand);
  },
  plaster(ctx, rand) {
    ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    blotches(ctx, rand, 50, 8, 30, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, TEX_SIZE - 3, TEX_SIZE, 3);
    noiseFill(ctx, 255, 18, rand);
  },
  wood(ctx, rand) {
    ctx.fillStyle = '#e2d4c2'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    const plank = 42.6;
    for (let i = 0; i < 6; i++) {
      const v = 200 + Math.floor(rand() * 50);
      ctx.fillStyle = `rgb(${v},${v - 10},${v - 25})`;
      ctx.fillRect(0, i * plank + 2, TEX_SIZE, plank - 4);
      for (let g = 0; g < 10; g++) {
        ctx.fillStyle = `rgba(80,50,20,${0.05 + rand() * 0.08})`;
        ctx.fillRect(0, i * plank + 4 + rand() * (plank - 8), TEX_SIZE, 1 + rand() * 2);
      }
    }
    noiseFill(ctx, 255, 16, rand);
  },
  crate(ctx, rand) {
    SURFACE_PAINTERS.wood(ctx, rand);
    ctx.strokeStyle = 'rgba(60,35,15,0.75)'; ctx.lineWidth = 22;
    ctx.strokeRect(11, 11, TEX_SIZE - 22, TEX_SIZE - 22);
    ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(20, 20); ctx.lineTo(TEX_SIZE - 20, TEX_SIZE - 20); ctx.stroke();
    ctx.fillStyle = 'rgba(30,30,30,0.6)';
    [[16, 16], [240, 16], [16, 240], [240, 240]].forEach(([x, y]) => ctx.fillRect(x - 5, y - 5, 10, 10));
  },
  rock(ctx, rand) {
    ctx.fillStyle = '#d9d2c8'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    blotches(ctx, rand, 60, 10, 50, 'rgba(0,0,0,0.08)');
    blotches(ctx, rand, 30, 5, 20, 'rgba(255,255,255,0.12)');
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.06})`;
      ctx.fillRect(0, rand() * TEX_SIZE, TEX_SIZE, 2 + rand() * 6);
    }
    noiseFill(ctx, 255, 30, rand);
  },
  stone(ctx, rand) {
    ctx.fillStyle = '#bdb6aa'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    const bh = 64;
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 48 : 0;
      for (let col = -1; col < 3; col++) {
        const v = 210 + Math.floor(rand() * 40);
        ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        ctx.fillRect(col * 96 + off + 3, row * bh + 3, 90, bh - 6);
      }
    }
    blotches(ctx, rand, 25, 6, 22, 'rgba(0,0,0,0.06)');
    noiseFill(ctx, 255, 22, rand);
  },
  sand(ctx, rand) {
    ctx.fillStyle = '#efe7da'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(120,90,50,${0.04 + rand() * 0.05})`; ctx.lineWidth = 3;
      ctx.beginPath();
      const y = rand() * TEX_SIZE;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y - 12, 170, y + 12, TEX_SIZE, y);
      ctx.stroke();
    }
    noiseFill(ctx, 255, 28, rand);
  },
  snow(ctx, rand) {
    ctx.fillStyle = '#f7f9fc'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    blotches(ctx, rand, 30, 15, 50, 'rgba(120,150,190,0.06)');
    noiseFill(ctx, 255, 10, rand);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 90; i++) ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, 1.5, 1.5);
  },
  ice(ctx, rand) {
    ctx.fillStyle = '#eef8ff'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) {
      let x = rand() * TEX_SIZE; let y = rand() * TEX_SIZE;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += (rand() - 0.5) * 70; y += (rand() - 0.5) * 70; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    blotches(ctx, rand, 20, 20, 60, 'rgba(100,170,220,0.08)');
  },
  asphalt(ctx, rand) {
    ctx.fillStyle = '#d2d2d2'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let i = 0; i < 1800; i++) {
      const v = rand() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},${rand() * 0.25})`;
      ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, 2, 2);
    }
    blotches(ctx, rand, 12, 20, 60, 'rgba(0,0,0,0.06)');
    noiseFill(ctx, 255, 20, rand);
  },
  tiles(ctx, rand) {
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const v = 215 + Math.floor(rand() * 35);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
      }
    }
    noiseFill(ctx, 255, 16, rand);
  },
  hazard(ctx) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.fillStyle = '#1a1a1a';
    for (let i = -TEX_SIZE; i < TEX_SIZE * 2; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i + 32, 0); ctx.lineTo(i + 32 + TEX_SIZE, TEX_SIZE); ctx.lineTo(i + TEX_SIZE, TEX_SIZE);
      ctx.fill();
    }
  },
  sandbag(ctx, rand) {
    ctx.fillStyle = '#a99c86'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 42 : 0;
      for (let col = -1; col < 4; col++) {
        const x = col * 85 + off + 42; const y = row * 64 + 32;
        const g = ctx.createRadialGradient(x, y - 8, 4, x, y, 44);
        g.addColorStop(0, '#f4ecdc'); g.addColorStop(1, '#c4b69c');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, 40, 28, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    noiseFill(ctx, 255, 22, rand);
  },
  cloth(ctx, rand) {
    ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let x = 0; x < TEX_SIZE; x += 32) {
      const g = ctx.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 32, TEX_SIZE);
    }
    noiseFill(ctx, 255, 14, rand);
  },
  glass(ctx) {
    const g = ctx.createLinearGradient(0, 0, TEX_SIZE, TEX_SIZE);
    g.addColorStop(0, '#c8d4e0'); g.addColorStop(0.45, '#ffffff'); g.addColorStop(0.55, '#c8d4e0'); g.addColorStop(1, '#a8b6c4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, TEX_SIZE - 6, TEX_SIZE - 6);
  },
};

let maxAnisotropy = 1;
function setTextureAnisotropy(renderer) {
  maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

function getSurfaceTexture(surface) {
  if (surfaceTextureCache[surface]) return surfaceTextureCache[surface];
  const painter = SURFACE_PAINTERS[surface];
  if (!painter) return null;
  const [canvas, ctx] = makeCanvas();
  let seed = 0;
  for (const ch of surface) seed = seed * 31 + ch.charCodeAt(0);
  painter(ctx, seededRandom(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  surfaceTextureCache[surface] = tex;
  return tex;
}

// Escala as UVs de uma BoxGeometry pelo tamanho real de cada face
function scaleBoxUVs(geometry, metersPerRepeat) {
  const { width, height, depth } = geometry.parameters;
  const uv = geometry.attributes.uv;
  // Ordem das faces: +x, -x, +y, -y, +z, -z (4 vértices cada)
  const faceDims = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = faceDims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (fu / metersPerRepeat), uv.getY(i) * (fv / metersPerRepeat));
    }
  }
  uv.needsUpdate = true;
}

// Aplica as texturas a todos os meshes marcados com userData.surface
function applySurfaceTextures(root, groundSize = 84) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.userData.surface) return;
    const tex = getSurfaceTexture(obj.userData.surface);
    if (!tex) return;
    const scale = SURFACE_SCALE[obj.userData.surface] || 3;

    if (obj.userData.isGround) {
      const groundTex = tex.clone();
      groundTex.needsUpdate = true;
      groundTex.repeat.set(groundSize / scale, groundSize / scale);
      obj.material.map = groundTex;
    } else {
      if (obj.geometry.type === 'BoxGeometry') scaleBoxUVs(obj.geometry, scale);
      obj.material.map = tex;
    }
    obj.material.needsUpdate = true;
  });
}

// Domo do céu com gradiente vertical (não sofre névoa)
function createSky(theme) {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(theme.skyTop) },
      horizonColor: { value: new THREE.Color(theme.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vPos;
      void main() {
        float h = clamp(vPos.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.userData.isSky = true;
  sky.renderOrder = -1;
  return sky;
}
