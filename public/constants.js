// =============================================================================
// ARMAS (CLIENTE)
// =============================================================================
// Valores de jogo (munição, cadência, recarga, projéteis) precisam bater com
// WEAPONS em server.js. O resto é apresentação/sensação: dispersão, recuo,
// zoom, velocidade de movimento e cores.
//
// stats.* (0..10) alimentam as barras de atributos da tela de loadout.
const WEAPONS = {
  smg: {
    name: 'Metralhadora', short: 'SMG', category: 'Automática',
    maxAmmo: 30, fireRate: 110, reloadTime: 2000, auto: true, pellets: 1,
    dmgBody: 18, dmgHead: 36,
    spread: 0.022, adsSpread: 0.008, recoil: 0.012, kick: 0.05, adsFov: 58, moveSpeed: 1.0,
    color: 0xffaa00, tracerColor: 0xffcc33,
    stats: { damage: 3, rate: 9, range: 5, mobility: 8 },
  },
  rifle: {
    name: 'Fuzil de Assalto', short: 'AR', category: 'Automática',
    maxAmmo: 26, fireRate: 135, reloadTime: 2200, auto: true, pellets: 1,
    dmgBody: 22, dmgHead: 44,
    spread: 0.028, adsSpread: 0.004, recoil: 0.016, kick: 0.06, adsFov: 52, moveSpeed: 0.94,
    color: 0xef4444, tracerColor: 0xff8855,
    stats: { damage: 5, rate: 8, range: 7, mobility: 6 },
  },
  sniper: {
    name: 'Sniper', short: 'SNP', category: 'Precisão',
    maxAmmo: 3, fireRate: 1100, reloadTime: 2600, auto: false, pellets: 1,
    dmgBody: 60, dmgHead: 100,
    spread: 0.09, adsSpread: 0, recoil: 0.07, kick: 0.16, adsFov: 22, scope: true, moveSpeed: 0.88,
    color: 0x00aaff, tracerColor: 0x55ccff,
    stats: { damage: 10, rate: 1, range: 10, mobility: 4 },
  },
  pistol: {
    name: 'Pistolinha', short: 'PST', category: 'Secundária',
    maxAmmo: 12, fireRate: 240, reloadTime: 1500, auto: false, pellets: 1,
    dmgBody: 22, dmgHead: 44,
    spread: 0.014, adsSpread: 0.004, recoil: 0.02, kick: 0.06, adsFov: 62, moveSpeed: 1.06,
    color: 0xdddddd, tracerColor: 0xffe066,
    stats: { damage: 4, rate: 6, range: 5, mobility: 9 },
  },
  revolver: {
    name: 'Revólver', short: 'REV', category: 'Secundária',
    maxAmmo: 6, fireRate: 560, reloadTime: 2100, auto: false, pellets: 1,
    dmgBody: 45, dmgHead: 90,
    spread: 0.018, adsSpread: 0.002, recoil: 0.05, kick: 0.12, adsFov: 58, moveSpeed: 1.04,
    color: 0xc084fc, tracerColor: 0xe9b8ff,
    stats: { damage: 8, rate: 3, range: 7, mobility: 8 },
  },
  shotgun: {
    name: 'Escopeta', short: 'ESC', category: 'Curta distância',
    maxAmmo: 6, fireRate: 800, reloadTime: 2400, auto: false, pellets: 8,
    dmgBody: 11, dmgHead: 16,
    spread: 0.075, adsSpread: 0.06, recoil: 0.06, kick: 0.14, adsFov: 66, moveSpeed: 0.97,
    color: 0xf59e0b, tracerColor: 0xffd27a,
    stats: { damage: 9, rate: 2, range: 2, mobility: 7 },
  },
  grapple: {
    name: 'Gancho', short: 'GCH', category: 'Utilitário',
    maxAmmo: Infinity, fireRate: 350, reloadTime: 0, auto: false, isUtility: true, moveSpeed: 1.05,
    color: 0x22cc88, tracerColor: 0x33ff99,
    stats: { damage: 0, rate: 0, range: 8, mobility: 10 },
  },
  knife: {
    name: 'Faca', short: 'FCA', category: 'Corpo a corpo',
    maxAmmo: Infinity, fireRate: 450, reloadTime: 0, auto: false, isMelee: true, pellets: 1,
    dmgBody: 40, dmgHead: 80, spread: 0, adsSpread: 0, recoil: 0, kick: 0, moveSpeed: 1.12,
    color: 0xcccccc, tracerColor: 0xffffff,
    stats: { damage: 6, rate: 5, range: 1, mobility: 10 },
  },
};

// Armas que podem ir no loadout (a faca é sempre o slot 3)
const WEAPON_CHOICES = ['smg', 'rifle', 'sniper', 'shotgun', 'pistol', 'revolver', 'grapple'];

const MAP_INFO = {
  arena: { name: 'Arena Clássica', desc: 'Torre central, pilares e postos de sniper.' },
  cidade: { name: 'Cidade Pequena', desc: 'Ruas, prédios, becos e carros.' },
  deserto: { name: 'Dunas do Deserto', desc: 'Platôs, ruínas e um oásis central.' },
  neve: { name: 'Campo de Neve', desc: 'Lago congelado, cabanas e pinheiros.' },
};
