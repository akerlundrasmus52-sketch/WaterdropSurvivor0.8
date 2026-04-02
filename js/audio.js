// --- AUDIO SYSTEM (Web Audio Noise Synthesis — Water Drop ASMR Dopamine Design) ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameAudio for use by game.js
//
// Sound design philosophy: The player is a Water Drop — everything should sound
// squishy, wet, and crisp. ASMR-like, dopamine-triggering soundscape.

let audioCtx;
try {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
} catch(e) {
  console.warn('[Audio] AudioContext creation failed:', e);
}
let musicOscillators = [];
let musicGain = null;

    // Combo tracking for exp_pickup pitch-up effect
    const EXP_COMBO_WINDOW = 0.4;  // seconds — rapid collection combo window
    const MAX_EXP_COMBO = 12;      // max combo level to prevent over-pitching
    let _lastExpPickupTime = 0;
    let _expPickupCombo = 0;

// Returns true only when game.js has initialised and sound is enabled.
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

  // ── Player & Movement (Water Theme) ──

  if (type === 'dash') {
    // dash.mp3: High-pressure swoosh of water (pssshh-whip)
    const noise = createNoise(0.22);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4000, now);
    bp.frequency.exponentialRampToValueAtTime(300, now + 0.18);
    bp.Q.value = 1.0;
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.22);
    // Whip tail — sharp sine transient
    const whip = audioCtx.createOscillator();
    const whipG = audioCtx.createGain();
    whip.type = 'sine';
    whip.frequency.setValueAtTime(2200, now + 0.04);
    whip.frequency.exponentialRampToValueAtTime(600, now + 0.12);
    whipG.gain.setValueAtTime(0.15, now + 0.04);
    whipG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    whip.connect(whipG); whipG.connect(audioCtx.destination);
    whip.start(now + 0.04); whip.stop(now + 0.14);

  } else if (type === 'player_hit' || type === 'splash') {
    // player_hit.mp3: Wet heavy splash with slight glass-shatter undertone (losing droplets)
    const noise = createNoise(0.3);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, now);
    bp.frequency.exponentialRampToValueAtTime(300, now + 0.25);
    bp.Q.value = 1.2;
    noiseGain.gain.setValueAtTime(0.45, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.3);
    // Glass-shatter undertone — high crystalline burst
    const shatter = createNoise(0.08);
    const shatterG = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 6000;
    shatterG.gain.setValueAtTime(0.18, now);
    shatterG.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    shatter.connect(hp); hp.connect(shatterG); shatterG.connect(audioCtx.destination);
    shatter.start(now); shatter.stop(now + 0.08);

  } else if (type === 'death') {
    const fade = audioCtx.createGain();
    fade.gain.setValueAtTime(0.35, now);
    fade.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(600, now);
    lowpass.frequency.exponentialRampToValueAtTime(120, now + 0.4);
    const noise = createNoise(0.5);
    noise.connect(lowpass); lowpass.connect(fade); fade.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.55);
    const tone = audioCtx.createOscillator();
    const toneGain = audioCtx.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(180, now);
    tone.frequency.exponentialRampToValueAtTime(60, now + 0.5);
    toneGain.gain.setValueAtTime(0.18, now);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    tone.connect(toneGain); toneGain.connect(audioCtx.destination);
    tone.start(now); tone.stop(now + 0.5);

  } else if (type === 'heal') {
    // heal.mp3: Reverse-water-drop sound (bloop going up in pitch)
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.18);
    // Soft bubble tail
    const bub = audioCtx.createOscillator();
    const bubG = audioCtx.createGain();
    bub.type = 'sine';
    bub.frequency.setValueAtTime(1200, now + 0.1);
    bub.frequency.exponentialRampToValueAtTime(2400, now + 0.16);
    bubG.gain.setValueAtTime(0.08, now + 0.1);
    bubG.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    bub.connect(bubG); bubG.connect(audioCtx.destination);
    bub.start(now + 0.1); bub.stop(now + 0.2);

  // ── Combat (Crisp & Punchy) ──

  } else if (type === 'shoot' || type === 'gun_shoot') {
    // gun_shoot.mp3: Sharp high-velocity water spit (pt-pt-pt)
    const noise = createNoise(0.06);
    const noiseGain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200, now);
    bp.frequency.exponentialRampToValueAtTime(800, now + 0.03);
    bp.Q.value = 1.5;
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.06);
    // Wet pop transient
    const pop = audioCtx.createOscillator();
    const popG = audioCtx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(1800, now);
    pop.frequency.exponentialRampToValueAtTime(400, now + 0.025);
    popG.gain.setValueAtTime(0.35, now);
    popG.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    pop.connect(popG); popG.connect(audioCtx.destination);
    pop.start(now); pop.stop(now + 0.04);

  } else if (type === 'sword' || type === 'sword_slash') {
    // sword_slash.mp3: Thick liquid whip cracking through the air
    const noise = createNoise(0.15);
    const noiseGain = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1500, now);
    hp.frequency.exponentialRampToValueAtTime(400, now + 0.12);
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.15);
    // Liquid whip crack tone
    const crack = audioCtx.createOscillator();
    const crackG = audioCtx.createGain();
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(800, now);
    crack.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    crackG.gain.setValueAtTime(0.2, now);
    crackG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    crack.connect(crackG); crackG.connect(audioCtx.destination);
    crack.start(now); crack.stop(now + 0.1);
    // Wet swoosh undertone
    const wet = createNoise(0.1);
    const wetG = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    wetG.gain.setValueAtTime(0.15, now);
    wetG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    wet.connect(lp); lp.connect(wetG); wetG.connect(audioCtx.destination);
    wet.start(now); wet.stop(now + 0.1);

  } else if (type === 'hit' || type === 'enemy_hit') {
    // enemy_hit.mp3: Squishy satisfying thwack/pop (like popping a thick water balloon)
    const pop = audioCtx.createOscillator();
    const popG = audioCtx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(300, now);
    pop.frequency.exponentialRampToValueAtTime(80, now + 0.06);
    popG.gain.setValueAtTime(0.5, now);
    popG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    pop.connect(popG); popG.connect(audioCtx.destination);
    pop.start(now); pop.stop(now + 0.08);
    // Squishy wet burst
    const squelch = createNoise(0.06);
    const squelchG = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 2;
    squelchG.gain.setValueAtTime(0.35, now);
    squelchG.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    squelch.connect(bp); bp.connect(squelchG); squelchG.connect(audioCtx.destination);
    squelch.start(now); squelch.stop(now + 0.06);

  } else if (type === 'enemy_die') {
    // enemy_die.mp3: Deeper bass-heavy splash
    const noise = createNoise(0.3);
    const noiseGain = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(200, now + 0.25);
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    noise.connect(lp); lp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.3);
    // Deep bass thud
    const bass = audioCtx.createOscillator();
    const bassG = audioCtx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(80, now);
    bass.frequency.exponentialRampToValueAtTime(25, now + 0.2);
    bassG.gain.setValueAtTime(0.5, now);
    bassG.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    bass.connect(bassG); bassG.connect(audioCtx.destination);
    bass.start(now); bass.stop(now + 0.25);

  } else if (type === 'crit_hit') {
    // crit_hit.mp3: Sharp high-pitched "ding" (wine glass) overlaid on normal hit sound
    // — Crucial for dopamine —
    // Play normal enemy_hit first
    playSound('enemy_hit');
    // Overlay: wine-glass ding / ching
    const ding = audioCtx.createOscillator();
    const dingG = audioCtx.createGain();
    ding.type = 'sine';
    ding.frequency.setValueAtTime(3800, now);
    ding.frequency.exponentialRampToValueAtTime(2800, now + 0.3);
    dingG.gain.setValueAtTime(0.2, now);
    dingG.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    ding.connect(dingG); dingG.connect(audioCtx.destination);
    ding.start(now); ding.stop(now + 0.4);
    // Harmonic overtone for glass resonance
    const harm = audioCtx.createOscillator();
    const harmG = audioCtx.createGain();
    harm.type = 'sine';
    harm.frequency.setValueAtTime(7600, now);
    harm.frequency.exponentialRampToValueAtTime(5600, now + 0.2);
    harmG.gain.setValueAtTime(0.06, now);
    harmG.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    harm.connect(harmG); harmG.connect(audioCtx.destination);
    harm.start(now); harm.stop(now + 0.25);

  // ── Rewards & UI (The Dopamine Hit) ──

  } else if (type === 'collect' || type === 'exp_pickup') {
    // exp_pickup.mp3: Very fast tiny melodic water plink
    // Combo effect: pitch goes UP if collected in rapid succession
    if (now - _lastExpPickupTime < EXP_COMBO_WINDOW) {
      _expPickupCombo = Math.min(_expPickupCombo + 1, MAX_EXP_COMBO);
    } else {
      _expPickupCombo = 0;
    }
    _lastExpPickupTime = now;
    const basePitch = 1800 + (_expPickupCombo * 150); // pitch rises with combo
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(basePitch, now);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 1.4, now + 0.05);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.08);

  } else if (type === 'levelup' || type === 'level_up') {
    // level_up.mp3: Booming triumphant orchestral swell + cascading waterfall
    // Trigger time dilation via DopamineSystem if available
    if (window.DopamineSystem && window.DopamineSystem.TimeDilation &&
        typeof window.DopamineSystem.TimeDilation.trigger === 'function') {
      window.DopamineSystem.TimeDilation.trigger(0.3, 800);
    }
    // Orchestral swell — layered ascending tones
    const layers = [220, 330, 440, 660, 880];
    layers.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = i < 2 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.4);
      g.gain.setValueAtTime(0.08, now + i * 0.03);
      g.gain.linearRampToValueAtTime(0.15, now + 0.2);
      g.gain.linearRampToValueAtTime(0, now + 0.6);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(now + i * 0.03); osc.stop(now + 0.6);
    });
    // Cascading waterfall — bandpass noise burst
    const waterfall = createNoise(0.8);
    const wfG = audioCtx.createGain();
    const wfBp = audioCtx.createBiquadFilter();
    wfBp.type = 'bandpass';
    wfBp.frequency.setValueAtTime(2000, now + 0.1);
    wfBp.frequency.exponentialRampToValueAtTime(400, now + 0.7);
    wfBp.Q.value = 0.8;
    wfG.gain.setValueAtTime(0, now);
    wfG.gain.linearRampToValueAtTime(0.25, now + 0.15);
    wfG.gain.linearRampToValueAtTime(0, now + 0.8);
    waterfall.connect(wfBp); wfBp.connect(wfG); wfG.connect(audioCtx.destination);
    waterfall.start(now); waterfall.stop(now + 0.8);
    // Triumphant high sparkle
    const sparkle = audioCtx.createOscillator();
    const spG = audioCtx.createGain();
    sparkle.type = 'sine';
    sparkle.frequency.setValueAtTime(2200, now + 0.15);
    sparkle.frequency.exponentialRampToValueAtTime(4400, now + 0.35);
    spG.gain.setValueAtTime(0.12, now + 0.15);
    spG.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    sparkle.connect(spG); spG.connect(audioCtx.destination);
    sparkle.start(now + 0.15); sparkle.stop(now + 0.5);

  } else if (type === 'chest_open') {
    // chest_open.mp3: Heavy wooden creak + angelic glowing synth choir
    // Wooden creak — lowpass noise with resonance
    const creak = createNoise(0.3);
    const creakG = audioCtx.createGain();
    const creakF = audioCtx.createBiquadFilter();
    creakF.type = 'bandpass';
    creakF.frequency.setValueAtTime(200, now);
    creakF.frequency.exponentialRampToValueAtTime(600, now + 0.25);
    creakF.Q.value = 5;
    creakG.gain.setValueAtTime(0.3, now);
    creakG.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    creak.connect(creakF); creakF.connect(creakG); creakG.connect(audioCtx.destination);
    creak.start(now); creak.stop(now + 0.3);
    // Angelic synth choir — layered sine pads
    const choir = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 major chord
    choir.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now + 0.2);
      g.gain.linearRampToValueAtTime(0.08, now + 0.4);
      g.gain.linearRampToValueAtTime(0, now + 1.0);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(now + 0.2); osc.stop(now + 1.0);
    });

  } else if (type === 'ui_hover' || type === 'waterdrop') {
    // ui_hover.mp3: Soft muted water bubble popping
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.06);

  } else if (type === 'ui_click') {
    // ui_click.mp3: Sharp dry click (two smooth stones tapping)
    const noise = createNoise(0.03);
    const noiseGain = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3000;
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.03);
    // Stone resonance
    const stone = audioCtx.createOscillator();
    const stoneG = audioCtx.createGain();
    stone.type = 'sine';
    stone.frequency.setValueAtTime(4500, now);
    stone.frequency.exponentialRampToValueAtTime(2000, now + 0.02);
    stoneG.gain.setValueAtTime(0.15, now);
    stoneG.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    stone.connect(stoneG); stoneG.connect(audioCtx.destination);
    stone.start(now); stone.stop(now + 0.04);

  // ── Legacy / Weapon-Specific Sounds (kept for backward compatibility) ──

  } else if (type === 'upgrade') {
    // Upgrade chime: warm descending water tone
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.6);

  } else if (type === 'multikill') {
    // Multi-kill: deep water punch + power ascend
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

  } else if (type === 'coin') {
    // Metallic coin clink: bell-like water tone
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

  } else if (type === 'doublebarrel') {
    // Double barrel: heavy water cannon blast
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

  } else if (type === 'aida_whisper') {
    // AIDA dark-pact hover: distorted low whisper + sinister static
    const dur = 0.7;
    const noise = createNoise(dur);
    const noiseGain = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, now);
    lp.frequency.linearRampToValueAtTime(120, now + dur);
    lp.Q.value = 6;
    noiseGain.gain.setValueAtTime(0.0, now);
    noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.05);
    noiseGain.gain.linearRampToValueAtTime(0.0, now + dur);
    noise.connect(lp); lp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + dur);

    // Sinister low sine sweep underneath
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + dur);
    oscGain.gain.setValueAtTime(0.0, now);
    oscGain.gain.linearRampToValueAtTime(0.07, now + 0.1);
    oscGain.gain.linearRampToValueAtTime(0.0, now + dur);
    osc.connect(oscGain); oscGain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + dur);

  } else if (type === 'glitch_delete') {
    // Corrupted Source Code: instant digital BEEP — enemy erased from memory
    const beep = audioCtx.createOscillator();
    const beepGain = audioCtx.createGain();
    beep.type = 'square';
    beep.frequency.setValueAtTime(1800, now);
    beep.frequency.setValueAtTime(900, now + 0.04);
    beep.frequency.setValueAtTime(2400, now + 0.08);
    beepGain.gain.setValueAtTime(0.25, now);
    beepGain.gain.setValueAtTime(0.25, now + 0.10);
    beepGain.gain.linearRampToValueAtTime(0.0, now + 0.14);
    beep.connect(beepGain); beepGain.connect(audioCtx.destination);
    beep.start(now); beep.stop(now + 0.15);
    // Short static burst
    const staticNoise = createNoise(0.12);
    const sGain = audioCtx.createGain();
    const sHp = audioCtx.createBiquadFilter();
    sHp.type = 'highpass';
    sHp.frequency.value = 3000;
    sGain.gain.setValueAtTime(0.15, now);
    sGain.gain.linearRampToValueAtTime(0.0, now + 0.12);
    staticNoise.connect(sHp); sHp.connect(sGain); sGain.connect(audioCtx.destination);
    staticNoise.start(now); staticNoise.stop(now + 0.12);

  } else if (type === 'forbidden_protocol') {
    // FORBIDDEN PROTOCOL EXECUTED: deep resonant boom + rising alarm tone
    const dur = 1.2;
    // Low resonant boom
    const boom = audioCtx.createOscillator();
    const boomGain = audioCtx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(60, now);
    boom.frequency.exponentialRampToValueAtTime(25, now + dur);
    boomGain.gain.setValueAtTime(0.0, now);
    boomGain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    boomGain.gain.linearRampToValueAtTime(0.0, now + dur);
    boom.connect(boomGain); boomGain.connect(audioCtx.destination);
    boom.start(now); boom.stop(now + dur);
    // Rising alarm
    const alarm = audioCtx.createOscillator();
    const alarmGain = audioCtx.createGain();
    alarm.type = 'square';
    alarm.frequency.setValueAtTime(220, now + 0.1);
    alarm.frequency.exponentialRampToValueAtTime(880, now + 0.7);
    alarmGain.gain.setValueAtTime(0.0, now + 0.1);
    alarmGain.gain.linearRampToValueAtTime(0.2, now + 0.2);
    alarmGain.gain.linearRampToValueAtTime(0.0, now + 0.8);
    alarm.connect(alarmGain); alarmGain.connect(audioCtx.destination);
    alarm.start(now + 0.1); alarm.stop(now + 0.8);
    // High pitch digital screech
    const screech = audioCtx.createOscillator();
    const screechGain = audioCtx.createGain();
    screech.type = 'sawtooth';
    screech.frequency.setValueAtTime(1200, now + 0.3);
    screech.frequency.setValueAtTime(1800, now + 0.5);
    screech.frequency.setValueAtTime(600, now + 0.7);
    screechGain.gain.setValueAtTime(0.0, now + 0.3);
    screechGain.gain.linearRampToValueAtTime(0.12, now + 0.35);
    screechGain.gain.linearRampToValueAtTime(0.0, now + 1.0);
    screech.connect(screechGain); screechGain.connect(audioCtx.destination);
    screech.start(now + 0.3); screech.stop(now + 1.0);
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
  lfo.frequency.value = 12;
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

// Reset exp pickup combo (call on run start)
function resetExpCombo() {
  _lastExpPickupTime = 0;
  _expPickupCombo = 0;
}

window.GameAudio = {
  audioCtx,
  playSound,
  initMusic,
  updateBackgroundMusic,
  startDroneHum,
  stopDroneHum,
  resetExpCombo
};
