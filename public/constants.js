// Precisa bater com server.js
const WEAPONS = {
  smg:     { name: 'Metralhadora',   maxAmmo: 30, fireRate: 110,  reloadTime: 2000, auto: true,  color: 0xffaa00 },
  sniper:  { name: 'Sniper',         maxAmmo: 3,  fireRate: 1100, reloadTime: 2600, auto: false, color: 0x00aaff },
  pistol:  { name: 'Pistolinha',     maxAmmo: 12, fireRate: 240,  reloadTime: 1500, auto: false, color: 0xdddddd },
  grapple: { name: 'Grappling Hook', maxAmmo: Infinity, fireRate: 550, reloadTime: 0, auto: false, isUtility: true, color: 0x22cc88 },
  knife:   { name: 'Faca',           maxAmmo: Infinity, fireRate: 450, reloadTime: 0, isMelee: true, color: 0xcccccc },
};

const WEAPON_CHOICES = ['smg', 'sniper', 'pistol', 'grapple'];
