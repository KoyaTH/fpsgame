// =============================================================================
// EFEITOS SONOROS PROCEDURAIS (WEB AUDIO API)
// =============================================================================
// Tudo é sintetizado: ruído filtrado para tiros, osciladores para feedback.

let audioCtx = null;
let masterGain = null;
let noiseBuffer = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(audioCtx.destination);
    // 1s de ruído branco reaproveitado por todos os sons
    noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playNoise({ duration, volume, filter = 'lowpass', freq = 2000, q = 0.7, attack = 0.002, pan = 0 }) {
  const ctx = getAudioContext();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  let node = src.connect(f).connect(gain);
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node = node.connect(p);
  }
  node.connect(masterGain);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.02);
}

function playTone({ type = 'sine', from, to = from, duration, volume, delay = 0 }) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(masterGain);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// Perfil de cada arma: estalo (ruído) + soco grave (tom)
const SHOT_PROFILES = {
  smg: { noise: 0.09, freq: 3200, thump: 140, body: 0.07 },
  rifle: { noise: 0.13, freq: 2600, thump: 110, body: 0.1 },
  sniper: { noise: 0.35, freq: 1800, thump: 70, body: 0.25 },
  pistol: { noise: 0.1, freq: 3600, thump: 170, body: 0.07 },
  revolver: { noise: 0.22, freq: 2200, thump: 90, body: 0.16 },
  shotgun: { noise: 0.3, freq: 1500, thump: 65, body: 0.22 },
};

function playShotSound(weaponKey, volume = 1, pan = 0) {
  try {
    if (weaponKey === 'knife') {
      playNoise({ duration: 0.14, volume: 0.12 * volume, filter: 'bandpass', freq: 4500, q: 2, pan });
      return;
    }
    const p = SHOT_PROFILES[weaponKey] || SHOT_PROFILES.smg;
    playNoise({ duration: p.noise, volume: 0.32 * volume, freq: p.freq, pan });
    playNoise({ duration: p.noise * 0.5, volume: 0.15 * volume, filter: 'highpass', freq: 5000, pan });
    playTone({ type: 'triangle', from: p.thump * 1.6, to: p.thump * 0.5, duration: p.body, volume: 0.35 * volume });
  } catch (e) { /* áudio indisponível */ }
}

function playHitmarkerSound(headshot) {
  try {
    playTone({ type: 'square', from: headshot ? 1500 : 950, to: headshot ? 1900 : 900, duration: 0.06, volume: 0.07 });
    if (headshot) playTone({ type: 'sine', from: 2400, duration: 0.12, volume: 0.06, delay: 0.03 });
  } catch (e) { }
}

function playKillSound() {
  try {
    playTone({ type: 'triangle', from: 660, duration: 0.12, volume: 0.14 });
    playTone({ type: 'triangle', from: 990, duration: 0.18, volume: 0.14, delay: 0.08 });
  } catch (e) { }
}

function playHurtSound() {
  try {
    playTone({ type: 'sawtooth', from: 160, to: 55, duration: 0.18, volume: 0.12 });
    playNoise({ duration: 0.12, volume: 0.12, freq: 600 });
  } catch (e) { }
}

function playGrappleSound() {
  try {
    playNoise({ duration: 0.25, volume: 0.15, filter: 'bandpass', freq: 1800, q: 1.5 });
    playTone({ type: 'sawtooth', from: 300, to: 900, duration: 0.15, volume: 0.06 });
  } catch (e) { }
}

function playReloadSound(duration) {
  try {
    playNoise({ duration: 0.05, volume: 0.15, filter: 'bandpass', freq: 2500, q: 3 });
    setTimeout(() => playNoise({ duration: 0.06, volume: 0.18, filter: 'bandpass', freq: 1800, q: 3 }), duration * 0.55);
    setTimeout(() => playNoise({ duration: 0.05, volume: 0.2, filter: 'bandpass', freq: 3000, q: 4 }), duration * 0.9);
  } catch (e) { }
}

// Faca acertando alguém: pancada grave e abafada
function playKnifeHitSound() {
  try {
    playNoise({ duration: 0.12, volume: 0.3, freq: 700, q: 0.9 });
    playTone({ type: 'sine', from: 180, to: 70, duration: 0.12, volume: 0.25 });
  } catch (e) { }
}

// Faca batendo na parede: tilintar metálico
function playKnifeWallSound() {
  try {
    playNoise({ duration: 0.06, volume: 0.18, filter: 'bandpass', freq: 3800, q: 8 });
    playTone({ type: 'triangle', from: 2600, to: 2200, duration: 0.14, volume: 0.05 });
  } catch (e) { }
}

function playEmptySound() {
  try { playNoise({ duration: 0.04, volume: 0.12, filter: 'bandpass', freq: 3500, q: 6 }); } catch (e) { }
}

function playSwitchSound() {
  try { playNoise({ duration: 0.06, volume: 0.1, filter: 'bandpass', freq: 2200, q: 2 }); } catch (e) { }
}

function playLandSound(strength) {
  try { playNoise({ duration: 0.1, volume: Math.min(0.25, 0.06 + strength * 0.02), freq: 400 }); } catch (e) { }
}

function playSlideSound() {
  try { playNoise({ duration: 0.45, volume: 0.1, filter: 'bandpass', freq: 900, q: 0.8, attack: 0.03 }); } catch (e) { }
}

function playJumpSound() {
  try { playNoise({ duration: 0.05, volume: 0.05, freq: 900 }); } catch (e) { }
}
