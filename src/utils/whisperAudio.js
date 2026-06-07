let sharedContext = null;

function getAudioContext() {
  if (!sharedContext || sharedContext.state === 'closed') {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    sharedContext = new Ctx();
  }
  return sharedContext;
}

/** 三连击触发时的轻柔金色「叮」声 */
export async function playWhisperChime() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const t0 = ctx.currentTime;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, t0);
  osc.frequency.exponentialRampToValueAtTime(783.99, t0 + 0.22);

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);

  osc.start(t0);
  osc.stop(t0 + 0.6);
}
