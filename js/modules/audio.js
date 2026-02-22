// js/modules/audio.js
// Audio system (Web Audio API oscillators)
    import { gs } from './state.js';
    import { gameSettings } from './state.js';

    // --- AUDIO SYSTEM (Oscillators) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    function initMusic() {
      if (!gs.musicGain) {
        gs.musicGain = audioCtx.createGain();
        gs.musicGain.gain.value = 0.05;
        gs.musicGain.connect(audioCtx.destination);
      }
    }
    
    function updateBackgroundMusic() {
      // Background music removed per requirements
      // Stop all music
      initMusic();
      if (gs.musicGain) {
        gs.musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
      }
      gs.musicOscillators.forEach(m => {
        try {
          m.osc.stop();
          if (m.lfo) m.lfo.stop();
        } catch (e) {}
      });
      gs.musicOscillators = [];
    }
    
    function playSound(type) {
      // AUDIO IMPLEMENTATION NOTES:
      // - Gun sound active with realistic Desert Eagle sound (deep .50 caliber)
      // - Other sounds muted for now (code kept for future use)
      // - Soundtrack request noted: Neelix - "By Way to Leave"
      //   (To be implemented in future update with proper licensing)
      
      if (!gameSettings.soundEnabled) return; // Respect sound settings
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      
      if (type === 'shoot') {
        // DESERT EAGLE realistic gun sound - deep, powerful, sharp crack
        // Primary blast
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now); // Higher initial crack
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.04); // Deep bass drop
        gain.gain.setValueAtTime(0.3, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        
        // Add powerful bass thump (Desert Eagle is .50 caliber - heavy!)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(120, now);
        osc2.frequency.exponentialRampToValueAtTime(40, now + 0.08);
        gain2.gain.setValueAtTime(0.35, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc2.start(now);
        osc2.stop(now + 0.12);
        
        // Echo/reverb tail
        const osc3 = audioCtx.createOscillator();
        const gain3 = audioCtx.createGain();
        osc3.connect(gain3);
        gain3.connect(audioCtx.destination);
        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(300, now + 0.05);
        osc3.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gain3.gain.setValueAtTime(0.1, now + 0.05);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc3.start(now + 0.05);
        osc3.stop(now + 0.25);
      } else if (type === 'hit') {
        // NOTE: Other sounds muted for now per requirements
        // To re-enable, remove this return statement
        return; // Muted
      } else if (type === 'levelup') {
        // LEVEL-UP AUDIO FIX: Punchy, growing-power feel (not slow motion)
        // Quick ascending power-up sound with impact
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.2);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3); // Linear fade to zero
        osc.start(now);
        osc.stop(now + 0.3);
        
        // Add punch/impact layer
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(120, now);
        osc2.frequency.exponentialRampToValueAtTime(250, now + 0.15);
        gain2.gain.setValueAtTime(0.3, now);
        gain2.gain.linearRampToValueAtTime(0, now + 0.25); // Linear fade to zero
        osc2.start(now);
        osc2.stop(now + 0.25);
        
        // Power crescendo layer
        const osc3 = audioCtx.createOscillator();
        const gain3 = audioCtx.createGain();
        osc3.connect(gain3);
        gain3.connect(audioCtx.destination);
        osc3.type = 'sawtooth';
        osc3.frequency.setValueAtTime(450, now + 0.05);
        osc3.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
        gain3.gain.setValueAtTime(0.2, now + 0.05);
        gain3.gain.linearRampToValueAtTime(0, now + 0.3); // Linear fade to zero
        osc3.start(now + 0.05);
        osc3.stop(now + 0.3);
      } else if (type === 'upgrade') {
        // "Wooooaaa" sound after picking upgrade
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(400, now + 0.4);
        osc.frequency.linearRampToValueAtTime(300, now + 0.7);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
        
        // Add resonance
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1200, now);
        osc2.frequency.linearRampToValueAtTime(600, now + 0.7);
        gain2.gain.setValueAtTime(0.12, now);
        gain2.gain.linearRampToValueAtTime(0, now + 0.8);
        osc2.start(now);
        osc2.stop(now + 0.8);
      } else if (type === 'waterdrop') {
        // Waterdrop sound for menus/buttons - like Android click
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        
        // Add droplet splash
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(2000, now + 0.02);
        osc2.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain2.gain.setValueAtTime(0.08, now + 0.02);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc2.start(now + 0.02);
        osc2.stop(now + 0.1);
      } else if (type === 'multikill') {
        // Unreal Tournament style multikill announcement
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(400, now + 0.15);
        osc.frequency.linearRampToValueAtTime(350, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        
        // Add impact
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(150, now);
        osc2.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain2.gain.setValueAtTime(0.25, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc2.start(now);
        osc2.stop(now + 0.2);
      } else if (type === 'splash') {
        // Water splash sound
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        
        // Add bubbles layer
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1500, now);
        osc2.frequency.exponentialRampToValueAtTime(500, now + 0.15);
        gain2.gain.setValueAtTime(0.15, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc2.start(now);
        osc2.stop(now + 0.15);
      } else if (type === 'collect') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'coin') {
        // Gold Pickup Sound - Ascending jingle
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.05);
        osc.frequency.linearRampToValueAtTime(1000, now + 0.08);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.11);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'coinDrop') {
        // Gold Drop Sound - Metallic coin drop
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15); // Use 0.001 instead of 0.01 for exponential ramps
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'dash') {
        // Dash/Swoosh sound - Quick whoosh
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        
        // Add wind layer
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1200, now);
        osc2.frequency.exponentialRampToValueAtTime(300, now + 0.12);
        gain2.gain.setValueAtTime(0.1, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc2.start(now);
        osc2.stop(now + 0.12);
      } else if (type === 'sword') {
        // Sword slash - metallic swoosh
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        
        // Add metallic ring
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(2000, now);
        osc2.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
        gain2.gain.setValueAtTime(0.15, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc2.start(now);
        osc2.stop(now + 0.1);
      } else if (type === 'doublebarrel') {
        // Double barrel - deeper, more powerful gun sound
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        
        // Add bass boom
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(100, now);
        osc2.frequency.exponentialRampToValueAtTime(30, now + 0.08);
        gain2.gain.setValueAtTime(0.35, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc2.start(now);
        osc2.stop(now + 0.08);
      } else if (type === 'meteor') {
        // Meteor impact - explosive boom
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        
        // Add explosion layer
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(300, now);
        osc2.frequency.exponentialRampToValueAtTime(100, now + 0.25);
        gain2.gain.setValueAtTime(0.25, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.start(now);
        osc2.stop(now + 0.25);
      }
    }
    
    // Drone humming sound - continuous
    let droneOscillator = null;
    let droneGain = null;
    
    function startDroneHum() {
      if (!gameSettings.soundEnabled || droneOscillator) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      
      droneOscillator = audioCtx.createOscillator();
      droneGain = audioCtx.createGain();
      
      droneOscillator.connect(droneGain);
      droneGain.connect(audioCtx.destination);
      
      droneOscillator.type = 'sawtooth';
      droneOscillator.frequency.setValueAtTime(120, audioCtx.currentTime);
      
      // Add subtle vibrato
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.frequency.value = 4;
      lfoGain.gain.value = 5;
      lfo.connect(lfoGain);
      lfoGain.connect(droneOscillator.frequency);
      lfo.start();
      
      droneGain.gain.setValueAtTime(0, audioCtx.currentTime);
      droneGain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.5);
      
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


    export { playSound, updateBackgroundMusic, initMusic, startDroneHum, stopDroneHum };

    // Register playSound on gs to allow state.js to call it without a circular import
    gs._playSound = playSound;
