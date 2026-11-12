// Ljud skapade i webbläsaren (inga ljudfiler): skott, explosion, glas, ras.
let ac = null, out = null, noiseBuf = null;
export function audioOn(){
  if (ac) { ac.resume(); return; }
  try { ac = new AudioContext(); out = ac.createDynamicsCompressor(); out.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate*2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1; } catch (e){ ac = null; }
}
function noise(dur, f0, f1, gain, q, type){
  if (!ac) return; const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = .8 + Math.random()*.4; f.type = type || 'lowpass'; f.Q.value = q || .7;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + .05);
}
function thump(f, dur, gain){ if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f*.3, t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur); }
export const sfx = {
  shot(){ noise(.16, 5200, 600, .55, .8); thump(130, .12, .5); },
  rocket(){ noise(.9, 1800, 300, .35, .5); },
  boom(k = 1, dist = 0){ const a = Math.max(.08, 1 - dist/220); noise(1.6*k, 900, 40, 1.4*a, .6); thump(60, .9, 1.1*a); },
  glass(){ noise(.35, 9000, 3000, .25, 2, 'highpass'); },
  rumble(){ noise(6, 260, 30, 1.2, .5); thump(38, 4, .9); },
  mg(dist = 0){ const a = Math.max(.05, 1 - dist/160); noise(.12, 3800 - Math.min(2800, dist*30), 400, .4*a, .8); thump(110, .09, .35*a); },
  click(){ noise(.04, 3000, 2000, .2, 3, 'bandpass'); },
};
