// Precisa bater com server.js
const WEAPONS = {
  smg:     { name: 'Metralhadora',   maxAmmo: 30, fireRate: 110,  reloadTime: 2000, auto: true,  color: 0xffaa00, tracerColor: 0xffcc33, barrelLength: 1.3 },
  sniper:  { name: 'Sniper',         maxAmmo: 3,  fireRate: 1100, reloadTime: 2600, auto: false, color: 0x00aaff, tracerColor: 0x55ccff, barrelLength: 1.8 },
  pistol:  { name: 'Pistolinha',     maxAmmo: 12, fireRate: 240,  reloadTime: 1500, auto: false, color: 0xdddddd, tracerColor: 0xffe066, barrelLength: 1.0 },
  grapple: { name: 'Grappling Hook', maxAmmo: Infinity, fireRate: 550, reloadTime: 0, auto: false, isUtility: true, color: 0x22cc88, tracerColor: 0x33ff99, barrelLength: 1.1 },
  knife:   { name: 'Faca',           maxAmmo: Infinity, fireRate: 450, reloadTime: 0, isMelee: true, color: 0xcccccc, tracerColor: 0xffffff, barrelLength: 0.7 },
};

const WEAPON_CHOICES = ['smg', 'sniper', 'pistol', 'grapple'];
