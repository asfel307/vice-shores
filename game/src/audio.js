// All sound is synthesised with WebAudio — no audio files, no network. An engine hum
// (oscillator pitch follows speed), a two-tone police siren, gunshot and crash noise,
// pickup blips and a mission-complete jingle. Everything is guarded: in a headless
// screenshot run there may be no AudioContext, and the game must still play silently.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ensure() || muted) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Sound is garnish; a failed blip never stops the game.
    }
  }

  function noise(dur, vol, lowFreq = 400) {
    if (!ensure() || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch {
      // See tone().
    }
  }

  return {
    /** Resume the context after the first user gesture (browsers block audio before it). */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.35;
      if (muted) this.engine(0);
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine hum; speed 0..1 sets pitch and loudness. Call every frame. */
    engine(speed01) {
      if (!ensure()) return;
      try {
        if (muted || speed01 <= 0.02) {
          if (engineOsc) {
            engineOsc.stop();
            engineOsc = null;
            engineGain = null;
          }
          return;
        }
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = ctx.createGain();
          engineGain.gain.value = 0.04;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 900;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(0.03 + speed01 * 0.05, ctx.currentTime, 0.08);
      } catch {
        engineOsc = null;
      }
    },
    /** Two-tone siren while any police are active; off otherwise. */
    siren(on) {
      if (!ensure()) return;
      try {
        if (!on || muted) {
          if (sirenOsc) {
            sirenOsc.stop();
            sirenOsc = null;
            sirenGain = null;
          }
          if (sirenTimer) {
            clearInterval(sirenTimer);
            sirenTimer = null;
          }
          return;
        }
        if (sirenOsc) return;
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.035;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        let high = false;
        sirenTimer = setInterval(() => {
          if (!sirenOsc) return;
          high = !high;
          sirenOsc.frequency.setValueAtTime(high ? 880 : 660, ctx.currentTime);
        }, 420);
      } catch {
        sirenOsc = null;
      }
    },
    shot() {
      noise(0.12, 0.5, 2600);
      tone(180, 0.08, 'square', 0.18, 0, 60);
    },
    punch() {
      noise(0.09, 0.35, 700);
    },
    crash() {
      noise(0.25, 0.55, 500);
      tone(70, 0.2, 'sine', 0.4, 0, 40);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.3);
      tone(1318, 0.12, 'sine', 0.3, 0.08);
    },
    jingle() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((freq, i) => tone(freq, 0.16, 'triangle', 0.32, i * 0.11));
    },
    busted() {
      tone(392, 0.3, 'sawtooth', 0.25, 0, 196);
      tone(196, 0.5, 'sawtooth', 0.25, 0.28, 98);
    },
  };
}
