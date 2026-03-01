// --- AUDIO SYSTEM (Web Audio Noise Synthesis) ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameAudio for use by game.js

let audioCtx;
try {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
} catch(e) {
  console.warn('[Audio] AudioContext creation failed:', e);
}
let musicOscillators = [];
let musicGain = null;

// Returns true only when game.js has initialised and sound is enabled.
// window.gameSettings is set by game.js; until then this correctly returns false.
function isSoundEnabled() {
  return !!(window.gameSettings && window.gameSettings.soundEnabled);
}

function initMusic() {
  if (!audioCtx) return;
  if (!musicGain) {
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.05;
    musicGain.connect(audioCtx.destination);
  }
}

function updateBackgroundMusic() {
  // Background music removed per requirements
  initMusic();
  if (musicGain) {
    musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
  }
  musicOscillators.forEach(m => {
    try {
      m.osc.stop();
      if (m.lfo) m.lfo.stop();
    } catch (e) {}
  });
  musicOscillators = [];
}

// Helper: create a white noise buffer for realistic sound synthesis
function createNoiseBuffer(duration) {
  const sampleRate = audioCtx.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) { data[i] = (Math.random() * 2 - 1); }
  return buffer;
}

// Helper: create a noise source (one-shot)
function createNoise(duration) {
  const source = audioCtx.createBufferSource();
  source.buffer = createNoiseBuffer(Math.max(duration, 0.05));
  return source;
}

function playSound(type) {
  if (!audioCtx || !isSoundEnabled()) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;

  if (type === 'shoot') {
    // Realistic gunshot: noise crack (high-freq transient) + bass thump
    const noise = createNoise(0.15);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, now);
    bp.frequency.exponentialRampToValueAtTime(600, now + 0.04);
    bp.Q.value = 0.8;
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.15);
    // Physical bass thump
    const bassOsc = audioCtx.createOscillator();
    const bassGain = audioCtx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(160, now);
    bassOsc.frequency.exponentialRampToValueAtTime(35, now + 0.1);
    bassGain.gain.setValueAtTime(0.5, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    bassOsc.connect(bassGain); bassGain.connect(audioCtx.destination);
    bassOsc.start(now); bassOsc.stop(now + 0.12);

  } else if (type === 'hit') {
    // Punchy impact: noise burst + low thud, suitable for rapid repetition
    const noise = createNoise(0.07);
    const noiseGain = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 400;
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.07);
    const thud = audioCtx.createOscillator();
    const thudGain = audioCtx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(90, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.05);
    thudGain.gain.setValueAtTime(0.3, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    thud.connect(thudGain); thudGain.connect(audioCtx.destination);
    thud.start(now); thud.stop(now + 0.07);

  } else if (type === 'levelup') {
    // Power-up: ascending sawtooth burst with sparkle tail
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.3);
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(3520, now + 0.2);
    gain2.gain.setValueAtTime(0.12, now + 0.05);
    gain2.gain.linearRampToValueAtTime(0, now + 0.3);
    osc2.connect(gain2); gain2.connect(audioCtx.destination);
    osc2.start(now + 0.05); osc2.stop(now + 0.3);

  } else if (type === 'upgrade') {
    // Upgrade chime: warm descending tone
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.6);

  } else if (type === 'waterdrop') {
    // Clean modern UI tap
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.08);

  } else if (type === 'multikill') {
    // Multi-kill: deep punch + power ascend
    const noise = createNoise(0.2);
    const noiseGain = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 800;
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    noise.connect(lp); lp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.2);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.3);

  } else if (type === 'splash') {
    // Water splash: bandpass noise burst
    const noise = createNoise(0.25);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, now);
    bp.frequency.exponentialRampToValueAtTime(400, now + 0.2);
    bp.Q.value = 1.5;
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.25);

  } else if (type === 'collect') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.08);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.1);

  } else if (type === 'coin') {
    // Metallic coin clink: bell-like tone
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.15);

  } else if (type === 'coinDrop') {
    // Metallic drop impact: resonant noise
    const noise = createNoise(0.1);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 3;
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.1);

  } else if (type === 'dash') {
    // Dash whoosh: swept bandpass noise
    const noise = createNoise(0.18);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3000, now);
    bp.frequency.exponentialRampToValueAtTime(400, now + 0.15);
    bp.Q.value = 1.2;
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.18);

  } else if (type === 'sword') {
    // Sword slash: highpass noise sweep + metallic ring
    const noise = createNoise(0.12);
    const noiseGain = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2000, now);
    hp.frequency.exponentialRampToValueAtTime(500, now + 0.1);
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.12);
    const ring = audioCtx.createOscillator();
    const ringGain = audioCtx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(3000, now);
    ring.frequency.exponentialRampToValueAtTime(1500, now + 0.08);
    ringGain.gain.setValueAtTime(0.12, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    ring.connect(ringGain); ringGain.connect(audioCtx.destination);
    ring.start(now); ring.stop(now + 0.12);

  } else if (type === 'doublebarrel') {
    // Double barrel shotgun: heavy noise crack + deep bass boom
    const noise = createNoise(0.18);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2000, now);
    bp.frequency.exponentialRampToValueAtTime(400, now + 0.06);
    bp.Q.value = 0.7;
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.18);
    const bass = audioCtx.createOscillator();
    const bassGain = audioCtx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(80, now);
    bass.frequency.exponentialRampToValueAtTime(25, now + 0.12);
    bassGain.gain.setValueAtTime(0.7, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    bass.connect(bassGain); bassGain.connect(audioCtx.destination);
    bass.start(now); bass.stop(now + 0.14);

  } else if (type === 'meteor') {
    // Meteor impact: lowpass noise rumble + deep bass explosion
    const noise = createNoise(0.4);
    const noiseGain = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, now);
    lp.frequency.exponentialRampToValueAtTime(200, now + 0.35);
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.connect(lp); lp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.4);
    const boom = audioCtx.createOscillator();
    const boomGain = audioCtx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(55, now);
    boom.frequency.exponentialRampToValueAtTime(20, now + 0.35);
    boomGain.gain.setValueAtTime(0.7, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    boom.connect(boomGain); boomGain.connect(audioCtx.destination);
    boom.start(now); boom.stop(now + 0.4);

  } else if (type === 'lightning') {
    // Lightning: sharp highpass noise crack + electric buzz
    const noise = createNoise(0.15);
    const noiseGain = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3000;
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.15);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.1);

  } else if (type === 'freeze') {
    // Ice/freeze: ultra-highpass crystalline shatter + high sine
    const noise = createNoise(0.2);
    const noiseGain = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 5000;
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.2);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4000, now);
    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.15);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.18);

  } else if (type === 'volcano') {
    // Volcano: lowpass noise rumble + sub-bass
    const noise = createNoise(0.6);
    const noiseGain = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    noiseGain.gain.setValueAtTime(0.7, now);
    noiseGain.gain.linearRampToValueAtTime(0, now + 0.6);
    noise.connect(lp); lp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.6);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(40, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.6);

  } else if (type === 'drone_shot') {
    // Drone rapid-fire: short mechanical bandpass pop
    const noise = createNoise(0.04);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 2;
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.04);
  }
}
// Drone humming sound - continuous
let droneOscillator = null;
let droneGain = null;

function startDroneHum() {
  if (!audioCtx || !isSoundEnabled() || droneOscillator) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  droneOscillator = audioCtx.createOscillator();
  droneGain = audioCtx.createGain();

  droneOscillator.connect(droneGain);
  droneGain.connect(audioCtx.destination);

  droneOscillator.type = 'sawtooth';
  droneOscillator.frequency.setValueAtTime(90, audioCtx.currentTime);

  // LFO for realistic propeller motor vibrato
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 12; // Higher rate = faster motor
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain);
  lfoGain.connect(droneOscillator.frequency);
  lfo.start();

  droneGain.gain.setValueAtTime(0, audioCtx.currentTime);
  droneGain.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.5);

  droneOscillator.start();
}

function stopDroneHum() {
  if (!droneOscillator) return;
  
  droneGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
  
  setTimeout(() => {
    if (droneOscillator) {
      try {
        droneOscillator.stop();
      } catch (e) {}
      droneOscillator = null;
      droneGain = null;
    }
  }, 500);
}

window.GameAudio = {
  audioCtx,
  playSound,
  initMusic,
  updateBackgroundMusic,
  startDroneHum,
  stopDroneHum
};
