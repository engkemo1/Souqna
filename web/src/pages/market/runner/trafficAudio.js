// Soft, synthesized traffic ambience for browsers that don't have traffic SFX assets.
export function createTrafficAudio() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  const context = new AudioContext();
  const master = context.createGain();
  const pan = context.createStereoPanner ? context.createStereoPanner() : null;
  master.gain.value = 0;
  if (pan) { pan.connect(master); master.connect(context.destination); }
  else master.connect(context.destination);

  const engineBus = pan || master;
  const hornPan = context.createStereoPanner ? context.createStereoPanner() : null;
  if (hornPan) hornPan.connect(context.destination);
  const rumble = context.createOscillator();
  rumble.type = 'triangle'; rumble.frequency.value = 62;
  const rumbleGain = context.createGain(); rumbleGain.gain.value = .12;
  rumble.connect(rumbleGain); rumbleGain.connect(engineBus); rumble.start();

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * .35;
  const noise = context.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true;
  const lowPass = context.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = 260;
  const roadGain = context.createGain(); roadGain.gain.value = .17;
  noise.connect(lowPass); lowPass.connect(roadGain); roadGain.connect(engineBus); noise.start();

  let enabled = true, disposed = false, lastHonkAt = -Infinity;
  const smooth = (param, value, time = .18) => {
    const now = context.currentTime;
    param.cancelScheduledValues(now); param.setTargetAtTime(value, now, time);
  };

  function honk() {
    if (!enabled || disposed || context.state !== 'running') return false;
    const now = context.currentTime;
    if (now - lastHonkAt < 18) return false;
    lastHonkAt = now;
    const gain = context.createGain(); gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.035, now + .035);
    gain.gain.setValueAtTime(.035, now + .13);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .24);
    const toneA = context.createOscillator(), toneB = context.createOscillator();
    toneA.type = 'triangle'; toneA.frequency.value = 392;
    toneB.type = 'triangle'; toneB.frequency.value = 494;
    toneA.connect(gain); toneB.connect(gain); gain.connect(hornPan || context.destination);
    toneA.start(now); toneB.start(now); toneA.stop(now + .26); toneB.stop(now + .26);
    toneB.onended = () => { toneA.disconnect(); toneB.disconnect(); gain.disconnect(); };
    return true;
  }

  return {
    async resume() {
      if (!disposed && enabled && context.state !== 'running') await context.resume().catch(() => {});
    },
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) smooth(master.gain, 0, .08);
    },
    resetHonkCooldown() { lastHonkAt = -Infinity; },
    update(distance, x = 0) {
      if (!enabled || disposed || context.state !== 'running') return;
      const proximity = Number.isFinite(distance) ? Math.max(0, Math.min(1, (24 - distance) / 24)) : 0;
      smooth(master.gain, proximity * .11, .3);
      if (pan) smooth(pan.pan, Math.max(-1, Math.min(1, x / 7)), .35);
      if (hornPan) smooth(hornPan.pan, Math.max(-1, Math.min(1, x / 7)), .35);
      smooth(rumble.frequency, 52 + proximity * 28, .4);
      smooth(lowPass.frequency, 180 + proximity * 240, .4);
    },
    honk,
    dispose() {
      disposed = true;
      try { noise.stop(); rumble.stop(); } catch { /* already stopped */ }
      context.close().catch(() => {});
    },
  };
}
