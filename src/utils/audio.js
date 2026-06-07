let sharedContext = null;

function getAudioContext() {
  if (!sharedContext || sharedContext.state === 'closed') {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    sharedContext = new Ctx();
  }
  return sharedContext;
}

/**
 * 从低到高再到低的嗡声；峰值约在 0.8s。必须在用户手势内调用。
 */
export async function playLightSound() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  const t0 = ctx.currentTime;

  osc.frequency.setValueAtTime(200, t0);
  osc.frequency.exponentialRampToValueAtTime(800, t0 + 0.8);
  osc.frequency.exponentialRampToValueAtTime(200, t0 + 1.8);

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.15, t0 + 0.8);
  gain.gain.linearRampToValueAtTime(0, t0 + 1.8);

  osc.start(t0);
  osc.stop(t0 + 1.8);
}
