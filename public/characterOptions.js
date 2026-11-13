// =============================================================================
// OPÇÕES DE CUSTOMIZAÇÃO DO PERSONAGEM (compartilhado: cliente e servidor)
// =============================================================================
// O cliente carrega este arquivo como script comum; o servidor faz require()
// dele para validar o que cada jogador escolheu. Cores são índices das paletas.

const CHARACTER_OPTIONS = {
  suit: [0x2563eb, 0xdc2626, 0x16a34a, 0xf59e0b, 0x7c3aed, 0xdb2777, 0x0891b2, 0xea580c, 0x334155, 0xe5e7eb, 0x4d7c0f, 0x111827],
  accent: [0x1f2937, 0x78716c, 0x92400e, 0x3f6212, 0x1e3a8a, 0x7f1d1d, 0xd4d4d8, 0x0f766e, 0xca8a04, 0x581c87],
  skin: [0xf5d0b0, 0xe0ac85, 0xc68a5e, 0xa0673f, 0x7a4a2a, 0x4f2f1c],
  glow: [0x38bdf8, 0x4ade80, 0xf43f5e, 0xfacc15, 0xc084fc, 0xffffff],
  hat: ['cabelo', 'capacete', 'bone', 'gorro', 'bandana', 'moicano'],
  face: ['visor', 'oculos', 'mascara', 'limpo'],
  back: ['nenhum', 'mochila', 'jetpack', 'antena'],
};

const CHARACTER_LABELS = {
  suit: 'Roupa',
  accent: 'Colete e detalhes',
  skin: 'Pele',
  glow: 'Luzes e visor',
  hat: 'Cabeça',
  face: 'Rosto',
  back: 'Costas',
  values: {
    cabelo: 'Cabelo', capacete: 'Capacete', bone: 'Boné', gorro: 'Gorro', bandana: 'Bandana', moicano: 'Moicano',
    visor: 'Visor', oculos: 'Óculos', mascara: 'Máscara', limpo: 'Sem nada',
    nenhum: 'Nada', mochila: 'Mochila', jetpack: 'Jetpack', antena: 'Antena',
  },
};

const DEFAULT_CHARACTER = { suit: 0, accent: 0, skin: 1, glow: 0, hat: 'capacete', face: 'visor', back: 'nenhum' };

// Garante um personagem válido (índices dentro das paletas, nomes conhecidos)
function sanitizeCharacter(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of ['suit', 'accent', 'skin', 'glow']) {
    const v = Number(src[key]);
    out[key] = Number.isInteger(v) && v >= 0 && v < CHARACTER_OPTIONS[key].length ? v : DEFAULT_CHARACTER[key];
  }
  for (const key of ['hat', 'face', 'back']) {
    out[key] = CHARACTER_OPTIONS[key].includes(src[key]) ? src[key] : DEFAULT_CHARACTER[key];
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { CHARACTER_OPTIONS, DEFAULT_CHARACTER, sanitizeCharacter };
