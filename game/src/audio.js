// Sound, synthesized live with WebAudio — no audio files, no network. An engine
// hum whose pitch follows the car's speed, a two-tone police siren, a gunshot
// noise burst, pickup blips and a mission jingle. Created lazily on the first
// user gesture, so autoplay rules never block it; M mutes everything.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, when) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (when ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noiseBurst(duration, volume, lowpass) {
    if (!ctx || muted) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  /** Short crash thud for busted/wasted stings, reusing the noise burst. */
  function thud() {
    noiseBurst(0.3, 0.3, 300);
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (muted) this.stopEngine();
    },
    isMuted() {
      return muted;
    },
    /** Engine hum: call every frame with speed 0..1; 0 silences it. */
    engine(speed01) {
      if (!ctx || muted) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        engineOsc.connect(filter).connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      const target = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, ctx.currentTime, 0.08);
    },
    stopEngine() {
      if (engineOsc) {
        try { engineOsc.stop(); } catch { /* already stopped */ }
        engineOsc = null;
        engineGain = null;
      }
    },
    /** Two-tone siren while any police are after the player. */
    siren(on) {
      if (!ctx || muted || !on) {
        if (sirenOsc) {
          try { sirenOsc.stop(); } catch { /* already stopped */ }
          sirenOsc = null;
          sirenGain = null;
        }
        if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
        return;
      }
      if (sirenOsc) return;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.02;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.frequency.value = 660;
      sirenOsc.start();
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 660, ctx.currentTime, 0.05);
      }, 380);
    },
    shot() {
      noiseBurst(0.14, 0.35, 3200);
      blip(160, 0.08, 'square', 0.12);
    },
    punch() {
      noiseBurst(0.08, 0.25, 500);
    },
    crash() {
      noiseBurst(0.25, 0.4, 900);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.18);
      blip(1320, 0.12, 'sine', 0.15, 0.08);
    },
    steal() {
      blip(220, 0.1, 'triangle', 0.2);
      blip(330, 0.12, 'triangle', 0.2, 0.09);
    },
    jingle() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => blip(freq, 0.22, 'triangle', 0.2, i * 0.12));
    },
    wasted() {
      thud();
      const notes = [392, 330, 262, 196];
      notes.forEach((freq, i) => blip(freq, 0.35, 'sawtooth', 0.14, i * 0.22));
    },
  };
}
