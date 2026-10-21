
(() => {
'use strict';
const $ = (s) => document.querySelector(s);

/* ───────── settings ───────── */
const KEY = 'canyon-song-v1';
const DEF = { musical: 0.6, bpm: 84, order: SECTIONS.map(s => s.id), on: SECTIONS.map(s => s.id), dur: 16, lo: 110, hi: 880, wave: 'sine', harm: 1, smooth: 1, verb: 0.25, layout: 'pan', timeMap: 'distance', quant: 'off', vol: 0.9,
              view: 'both', exag: 1.6, psize: 1, glow: 0.9, grain: 0.5, palette: 0, rotate: true, curtain: true, loop: true };
let S = Object.assign({}, DEF);
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
(function sanitize() { // never trust stored settings: a bad value must not silence the page
  if (!Array.isArray(S.order) || S.order.length !== SECTIONS.length || !SECTIONS.every(s => S.order.includes(s.id))) S.order = DEF.order.slice();
  if (!Array.isArray(S.on)) S.on = DEF.on.slice(); S.on = S.on.filter(id => S.order.includes(id));
  if (!Number.isFinite(S.musical)) S.musical = DEF.musical; S.musical = Math.min(Math.max(S.musical, 0), 1); S.bpm = 84; S.quant = 'off';
  for (const k of ['dur', 'lo', 'hi', 'harm', 'smooth', 'verb', 'vol', 'exag', 'psize', 'glow', 'grain']) if (!Number.isFinite(S[k])) S[k] = DEF[k];
  if (!['pan', 'swapped', 'mono'].includes(S.layout)) S.layout = DEF.layout;
  if (!['distance', 'halves'].includes(S.timeMap)) S.timeMap = DEF.timeMap;
  if (!['sine', 'triangle', 'saw'].includes(S.wave)) S.wave = DEF.wave;
  if (!['off', 'pentatonic', 'chromatic'].includes(S.quant)) S.quant = DEF.quant;
  if (S.hi < S.lo * 1.25) { S.lo = DEF.lo; S.hi = DEF.hi; }
})();
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 250); };

/* ───────── data ───────── */
function b64u16(s) { const b = atob(s), n = b.length >> 1, a = new Uint16Array(n); for (let i = 0; i < n; i++) a[i] = b.charCodeAt(2 * i) | (b.charCodeAt(2 * i + 1) << 8); return a; }
const CANYONS = SECTIONS.map(s => ({ D: s, G: b64u16(s.terrain) }));
CANYONS.forEach(x => { x.syn = SongSynth.create(CanyonSynth, { PD: x.D.d, PE: x.D.e, G: x.G, D: x.D }); });
const NU = SECTIONS[0].NU, NV = SECTIONS[0].NV;
let D, G, PD, PE, NP, K, PMIN, PMAX, EMIN, EMAX, SYN, curSec = -1;
const secById = (id) => CANYONS.findIndex(x => x.D.id === id);
function loadSection(si) {   // swap the profile + terrain the 3D view and readout use
  if (si === curSec) return; curSec = si; const x = CANYONS[si];
  D = x.D; G = x.G; PD = D.d; PE = D.e; NP = PD.length; SYN = x.syn; K = SYN.K; PMIN = Math.min(...PE); PMAX = Math.max(...PE); EMIN = D.emin; EMAX = D.emax;
  $('#lblS').firstChild.textContent = D.sName; $('#lblN').firstChild.textContent = D.nName;
  $('#cap-title i').textContent = D.name;
  $('#cap-info').textContent = D.sName + ' → ' + D.nName + ' · ' + (D.L / 1000).toFixed(1) + ' km · river ' + Math.round(PMIN) + ' m · key ' + SYN.rootName + ' minor pentatonic · USGS 3DEP';
  if (gl && P.pts) { buildGeom(); lastPalette = -1; }
}
const toXkm = (d) => (d - D.L / 2) / 1000;
const profAt = (idx, arr) => { idx = Math.min(Math.max(idx, 0), NP - 1); const i = Math.min(idx | 0, NP - 2), f = idx - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
const mixAt = (idx) => idx <= K ? 0.5 * idx / K : 0.5 + 0.5 * (idx - K) / (NP - 1 - K);   // 0 south rim .. .5 river .. 1 north rim

/* ───────── song: the enabled sections, in the chosen order, one verse each ───────── */
const synOpts = () => ({ dur: S.dur, lo: S.lo, hi: S.hi, wave: S.wave, harm: S.harm, smooth: S.smooth, quant: 'off', timeMap: S.timeMap, layout: S.layout, musical: S.musical, bpm: S.bpm });
const activeSecs = () => S.order.filter(id => S.on.includes(id)).map(secById).filter(i => i >= 0);
let VT = [];   // per verse: { si, t0, t1 (normalised song time), dur, T (tables) }
let TB = null;
function rebuildTables() {
  const o = synOpts(), a = activeSecs(); let acc = 0; const durs = a.map(si => CANYONS[si].syn.verseDur(o)), tot = durs.reduce((p, q) => p + q, 0) || 1;
  VT = a.map((si, k) => { const v = { si, t0: acc / tot, dur: durs[k], T: CANYONS[si].syn.tables(o) }; acc += durs[k]; v.t1 = acc / tot; return v; });
  VT.total = tot; if (VT.length) { TB = VT[0].T; if (curSec < 0 || !VT.some(v => v.si === curSec)) loadSection(VT[0].si); }
}
function verseAt(t) {   // -> [verse, local time 0..1]
  if (!VT.length) return [null, 0];
  let k = 0; while (k < VT.length - 1 && t >= VT[k].t1) k++;
  const v = VT[k]; return [v, Math.min(Math.max((t - v.t0) / ((v.t1 - v.t0) || 1), 0), 1)];
}

/* ───────── audio: the whole loop is rendered into an AudioBuffer, played by a looping BufferSource ───────── */
let ctx = null, bus, master, wetG, echoSend, fbG, analyser, anaBuf, buf = null, bufRate = 0, bufDirty = true, cur = null;
let playing = false, pos = 0, level = 0, rms = 0, scrubbing = false, watchT = 0, silentSince = 0, playSince = 0;
const sndEl = $('#snd'), sndTxt = sndEl.firstElementChild, sndBar = sndEl.querySelector('s');
function setSnd(kind, msg, prefix) { sndEl.dataset.k = kind; sndTxt.textContent = (prefix || 'sound') + ': ' + msg; }
function fail(err, what) { console.error(err); const m = (err && err.message) || String(err); playing = false; if (cur) { try { cur.s.onended = null; cur.s.stop(); } catch (e) {} cur = null; } syncPlayUI(); setSnd('error', (what || '') + m); }
function makeIR(c) {
  const len = Math.floor(c.sampleRate * 2.8), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let y = 0;
    for (let i = 0; i < len; i++) { const v = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); y += (v - y) * 0.3; d[i] = y; } }
  return ir;
}
function applyFx() {
  if (!ctx) return; const t = ctx.currentTime, vol = Number.isFinite(S.vol) ? S.vol : DEF.vol, verb = Number.isFinite(S.verb) ? S.verb : DEF.verb;
  master.gain.setTargetAtTime(vol, t, 0.03);
  wetG.gain.setTargetAtTime(verb * 1.1, t, 0.05);
  echoSend.gain.setTargetAtTime(verb * 0.55, t, 0.05);
  fbG.gain.setTargetAtTime(0.22 + 0.33 * verb, t, 0.05);
}
// Must run synchronously inside the click / keypress handler (Safari only unlocks audio inside the gesture).
function initAudio() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { setSnd('error', 'this browser has no Web Audio support'); return false; }
  try {
    ctx = new AC();
    ctx.onstatechange = onCtxState;
    bus = ctx.createGain(); master = ctx.createGain(); master.gain.value = Number.isFinite(S.vol) ? S.vol : DEF.vol;
    const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx); wetG = ctx.createGain(); wetG.gain.value = 0;
    const dly = ctx.createDelay(1); dly.delayTime.value = 0.29; echoSend = ctx.createGain(); echoSend.gain.value = 0; fbG = ctx.createGain(); fbG.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; const echoOut = ctx.createGain(); echoOut.gain.value = 0.8;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; anaBuf = new Float32Array(1024);
    bus.connect(master); bus.connect(conv); conv.connect(wetG); wetG.connect(master);
    bus.connect(echoSend); echoSend.connect(dly); dly.connect(lp); lp.connect(fbG); fbG.connect(dly); lp.connect(echoOut); echoOut.connect(master);
    master.connect(analyser); master.connect(ctx.destination);
    // classic iOS/Safari unlock: touch the output with a one-sample silent buffer inside the gesture
    const ub = ctx.createBuffer(1, 1, 22050), us = ctx.createBufferSource(); us.buffer = ub; us.connect(ctx.destination); us.start(0);
    applyFx(); return true;
  } catch (err) { ctx = null; fail(err, 'could not start audio: '); return false; }
}
function resumeCtx() {
  if (!ctx || ctx.state === 'running') return;
  try { const p = ctx.resume(); if (p && p.catch) p.catch((e) => setSnd('error', 'resume() rejected: ' + (e && e.message || e))); } catch (e) { fail(e, 'resume() failed: '); }
}
function onCtxState() {
  if (!ctx) return;
  if (ctx.state === 'running') { if (playing) setSnd('playing', 'playing · ' + (ctx.sampleRate / 1000) + ' kHz'); else if (sndEl.dataset.k !== 'error') setSnd('ready', 'ready'); }
  else if (playing) goBlocked('the browser paused audio (' + ctx.state + '). Press play again');
}
function goBlocked(msg) {
  playing = false; if (cur) { pos = curPos(); try { cur.s.onended = null; cur.s.stop(); } catch (e) {} cur = null; }
  syncPlayUI(); setSnd('blocked', 'blocked · ' + msg);
}
function ensureBuffer() {
  if (buf && !bufDirty && bufRate === ctx.sampleRate) return buf;
  const a = activeSecs(); if (!a.length) throw new Error('no sections are switched on. Tick at least one under Sections');
  const r = SongSynth.renderSong(a.map(si => ({ syn: CANYONS[si].syn })), synOpts(), ctx.sampleRate), b = ctx.createBuffer(2, r.L.length, ctx.sampleRate);
  let pk = 0; for (let i = 0; i < r.L.length; i += 7) { const v = Math.abs(r.L[i]) + Math.abs(r.R[i]); if (v > pk) pk = v; }
  if (!(pk > 0.02) || !Number.isFinite(pk)) throw new Error('synth produced a silent buffer (peak ' + pk + ')');
  b.getChannelData(0).set(r.L); b.getChannelData(1).set(r.R); buf = b; bufDirty = false; bufRate = ctx.sampleRate; return b;
}
function startSource(off) {
  const b = ensureBuffer(), s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = b; s.loop = !!S.loop; s.connect(g); g.connect(bus);
  const now = ctx.currentTime, o = Math.min(Math.max(off, 0), 0.9999) * b.duration, c = { s, g, t0: now, o, dur: b.duration, loop: s.loop };
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + 0.03);
  s.onended = () => { if (cur === c) { cur = null; if (playing) { playing = false; pos = 0; syncPlayUI(); setSnd('ready', 'ready'); } } };
  s.start(now, o); cur = c; return c;
}
function stopSource(c, fade) {
  if (!c) return;
  try { const now = ctx.currentTime; c.s.onended = null; c.g.gain.cancelScheduledValues(now); c.g.gain.setValueAtTime(c.g.gain.value, now); c.g.gain.linearRampToValueAtTime(0, now + fade); c.s.stop(now + fade + 0.02); } catch (e) {}
}
function curPos() {
  if (!cur) return pos;
  let x = (cur.o + (ctx.currentTime - cur.t0)) / cur.dur;
  return cur.loop ? x - Math.floor(x) : Math.min(x, 0.9999);
}
function restart() { if (!playing || !ctx) return; const t = curPos(), old = cur; stopSource(old, 0.03); startSource(t); }   // short crossfade onto the freshly rendered buffer
let rtimer = 0;
function invalidate() { bufDirty = true; clearTimeout(rtimer); rtimer = setTimeout(() => { try { restart(); } catch (e) { fail(e, 'error: '); } }, 120); }
function watchdog() {
  clearTimeout(watchT); silentSince = 0; playSince = performance.now();
  const check = (final) => {
    if (!playing || !ctx) return;
    if (ctx.state !== 'running') return goBlocked('the browser kept audio suspended (' + ctx.state + '). Click play again, and check this tab isn\'t muted');
    if (cur && ctx.currentTime <= cur.t0 + 0.05) {   // running, but the clock hasn't moved yet (slow device wake-up, e.g. Bluetooth)
      if (final) return goBlocked('the audio clock is not advancing (no output device?). Click play again');
      setSnd('playing', 'starting… waiting for the audio device'); watchT = setTimeout(() => check(true), 2600);
    }
  };
  watchT = setTimeout(() => check(false), 900);
}
function setPlaying(p) {
  try {
    if (p) {
      if (!initAudio()) return;
      resumeCtx();                          // called synchronously, inside the user's click / keypress
      if (pos >= 0.9999) pos = 0;
      if (cur) { cur.s.onended = null; try { cur.s.stop(); } catch (e) {} cur = null; }
      startSource(pos); playing = true; syncPlayUI();
      setSnd('playing', ctx.state === 'running' ? 'playing · ' + (ctx.sampleRate / 1000) + ' kHz' : 'starting…');
      watchdog();
    } else {
      if (!ctx || !playing) return;
      pos = curPos(); stopSource(cur, 0.04); cur = null; playing = false; clearTimeout(watchT); syncPlayUI(); setSnd('ready', 'ready');
    }
  } catch (err) { fail(err, 'error: '); }
}
let seekT = 0, seekPend = false;
function seekTo(t, final) {
  pos = Math.min(Math.max(t, 0), 0.9999);
  if (!playing || !ctx) return;
  const now = performance.now();
  if (final || now - seekT > 90) { seekT = now; seekPend = false; try { stopSource(cur, 0.03); startSource(pos); } catch (e) { fail(e, 'error: '); } } else seekPend = true;
}
function testTone() {
  try {
    if (!initAudio()) return; resumeCtx();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 440; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.04); g.gain.linearRampToValueAtTime(0, t + 0.7);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.75);
    setSnd(ctx.state === 'running' ? 'playing' : 'blocked', 'test tone sent (440 Hz, context: ' + ctx.state + '). If you heard nothing, check system volume, output device and the tab\'s mute');
    setTimeout(() => { if (ctx.state !== 'running') setSnd('blocked', 'blocked · browser kept audio suspended (' + ctx.state + ')'); }, 600);
  } catch (e) { fail(e, 'error: '); }
}
function flash(t) { const m = $('#msg'); m.firstElementChild.textContent = t; m.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => m.hidden = true, 4500); }
const PLAYP = 'M3 1.5v11l9-5.5z', PAUSEP = 'M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z';
function syncPlayUI() {
  $('#pico').setAttribute('d', playing ? PAUSEP : PLAYP);
  $('#play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if (playing) $('#hint').hidden = true;
}
addEventListener('error', (e) => { setSnd('error', e.message || 'unknown error', 'page error'); });
addEventListener('unhandledrejection', (e) => { setSnd('error', (e.reason && e.reason.message) || String(e.reason), 'page error'); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && playing && ctx.state !== 'running') resumeCtx(); });

/* ───────── controls ───────── */
const PALETTES = [
  { n: 'Ember',  p: [[.03,.02,.22],[.16,.08,.55],[.55,.14,.62],[.95,.42,.2],[1,.8,.4]],  s: [.31,.86,1], nn: [1,.37,.66] },
  { n: 'Aurora', p: [[.01,.06,.2],[.02,.3,.5],[.05,.7,.62],[.5,.92,.4],[.92,1,.78]],     s: [1,.8,.3],  nn: [.7,.4,1] },
  { n: 'Ice',    p: [[.02,.03,.12],[.1,.2,.5],[.3,.55,.85],[.7,.88,1],[1,1,1]],           s: [.4,1,.8],  nn: [1,.6,.35] },
];
const SECS = [
  { h: 'Song' },
  { k: 'musical', l: 'Musical  (0 = raw terrain)', min: 0, max: 1, step: .01, f: v => v.toFixed(2) },
  { h: 'Sound' },
  { k: 'dur', l: 'Verse length', min: 3, max: 30, step: .5, f: v => v.toFixed(1) + ' s' },
  { k: 'lo', l: 'Pitch low', min: 40, max: 440, step: 1, f: v => v + ' Hz' },
  { k: 'hi', l: 'Pitch high', min: 220, max: 3520, step: 1, f: v => v + ' Hz' },
  { k: 'wave', l: 'Waveform', seg: [['sine', 'Sine'], ['triangle', 'Triangle'], ['saw', 'Saw']] },
  { k: 'harm', l: 'Harmonics', min: 0, max: 2, step: .01, f: v => v.toFixed(2) + '×' },
  { k: 'smooth', l: 'Smoothing', min: 0, max: 8, step: .1, f: v => v.toFixed(1) + '×' },
  { k: 'verb', l: 'Reverb / echo', min: 0, max: 1, step: .01, f: v => Math.round(v * 100) + '%' },
  { k: 'timeMap', l: 'Time mapping', seg: [['distance', 'By distance'], ['halves', 'Halves equal']] },
  { k: 'layout', l: 'Stereo layout', seg: [['pan', 'Pan rim to rim'], ['swapped', 'Swapped'], ['mono', 'Mono']] },
  { k: 'vol', l: 'Volume', min: 0, max: 1, step: .01, f: v => Math.round(v * 100) + '%' },
  { h: 'Terrain & light' },
  { k: 'view', l: 'Render', seg: [['points', 'Points'], ['contours', 'Contours'], ['both', 'Both']] },
  { k: 'exag', l: 'Vertical exaggeration', min: .5, max: 4, step: .05, f: v => v.toFixed(2) + '×' },
  { k: 'psize', l: 'Point size', min: .3, max: 3, step: .05, f: v => v.toFixed(2) },
  { k: 'glow', l: 'Glow / bloom', min: 0, max: 2.5, step: .05, f: v => v.toFixed(2) },
  { k: 'grain', l: 'Grain', min: 0, max: 1.5, step: .05, f: v => v.toFixed(2) },
  { k: 'palette', l: 'Palette', seg: PALETTES.map((p, i) => [i, p.n]) },
  { k: 'curtain', l: 'Cross-section curtain', sw: 1 },
  { k: 'rotate', l: 'Auto-rotate', sw: 1 },
];
const refs = {};
const panel = $('#panel');
for (const c of SECS) {
  if (c.h) { const h = document.createElement('h2'); h.textContent = c.h; panel.appendChild(h); continue; }
  const row = document.createElement('div'); row.className = 'row';
  if (c.sw) {
    row.innerHTML = '<button class="sw" role="switch"><span></span><i></i></button>'; const b = row.firstChild; b.firstChild.textContent = c.l;
    b.onclick = () => { S[c.k] = !S[c.k]; changed(c.k); }; refs[c.k] = () => b.setAttribute('aria-checked', !!S[c.k]);
  } else if (c.seg) {
    row.innerHTML = '<div class="t"><span></span></div><div class="seg" role="radiogroup"></div>'; row.querySelector('.t span').textContent = c.l;
    const sg = row.querySelector('.seg'); const bs = c.seg.map(([v, l]) => { const b = document.createElement('button'); b.textContent = l; b.setAttribute('role', 'radio');
      b.onclick = () => { S[c.k] = v; changed(c.k); }; sg.appendChild(b); return [v, b]; });
    refs[c.k] = () => bs.forEach(([v, b]) => b.setAttribute('aria-checked', S[c.k] == v));
  } else {
    row.innerHTML = '<div class="t"><span></span><em></em></div><input type="range">'; row.querySelector('.t span').textContent = c.l;
    const inp = row.querySelector('input'), em = row.querySelector('em'); inp.min = c.min; inp.max = c.max; inp.step = c.step;
    inp.oninput = () => { S[c.k] = parseFloat(inp.value); changed(c.k); };
    refs[c.k] = () => { inp.value = S[c.k]; em.textContent = c.f(S[c.k]); };
  }
  panel.appendChild(row);
}
// sections: tick to include, arrows to reorder; each one is a verse
{ const h = document.createElement('h2'); h.textContent = 'Sections (verses, in play order)'; const box = document.createElement('div'); box.id = 'secs';
  const firstH = panel.querySelector('h2'); panel.insertBefore(box, firstH.nextSibling.nextSibling); panel.insertBefore(h, box);
  const mv = (id, d) => { const o = S.order, i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; changed('order'); };
  refs.secs = () => { box.innerHTML = '';
    S.order.forEach((id, i) => { const x = CANYONS[secById(id)], r = document.createElement('div'); r.className = 'secrow' + (S.on.includes(id) ? '' : ' off');
      r.innerHTML = '<button class="sw" role="switch"><span></span><i></i></button><button class="mv" title="Move up">↑</button><button class="mv" title="Move down">↓</button>';
      const [sw, u, dn] = r.querySelectorAll('button'); sw.firstChild.textContent = (i + 1) + '. ' + x.D.name + ' · ' + x.syn.rootName; sw.setAttribute('aria-checked', S.on.includes(id));
      sw.onclick = () => { S.on = S.on.includes(id) ? S.on.filter(q => q !== id) : S.on.concat([id]); changed('on'); };
      u.disabled = i === 0; dn.disabled = i === S.order.length - 1; u.onclick = () => mv(id, -1); dn.onclick = () => mv(id, 1); box.appendChild(r); }); };
}
panel.insertAdjacentHTML('beforeend', '<button id="reset">Reset settings</button><button id="tone">Play test tone</button><p class="note"><b>Musical</b>: at 0 each verse is the raw terrain (the original sound). Raising it snaps pitch toward a minor pentatonic scale whose key comes from that section\'s river elevation, adds plucked notes whose density follows the real slope and wall roughness (onsets pulled onto an 84 BPM grid), a roughness texture, a soft root drone/bass and gentler envelopes. The canyon shape always sets the melody. Verses play back to back in the order above.</p><p class="note">One dot, one pass per section: elevation → pitch (exponential), and the sound pans from your left ear at the South Rim, through the middle at the river, to your right ear at the North Rim. “By distance” keeps true spacing (the north side is ~2.6× longer, so it takes longer); “Halves equal” gives each side half the time. No sound? Check your volume and output device, and the tab isn\'t muted; on iPhone, turn the silent switch off. Data: USGS 3DEP via AWS terrain tiles (terrain) and USGS EPQS (300-point profile).</p>');
$('#tone').onclick = testTone;
function syncUI() { for (const k in refs) refs[k](); $('#loopb').setAttribute('aria-pressed', !!S.loop); $('#cap-mode').textContent = (S.view === 'both' ? 'points + contours' : S.view) + ' · ' + PALETTES[S.palette].n.toLowerCase(); }
function changed(k) {
  if (k === 'lo' && S.hi < S.lo * 1.25) S.hi = Math.min(3520, Math.round(S.lo * 1.25));
  if (k === 'hi' && S.lo > S.hi / 1.25) S.lo = Math.max(40, Math.round(S.hi / 1.25));
  if (['lo', 'hi', 'smooth', 'quant', 'timeMap', 'layout', 'musical', 'dur', 'order', 'on'].includes(k)) rebuildTables();
  if (['dur', 'lo', 'hi', 'wave', 'harm', 'smooth', 'quant', 'timeMap', 'layout', 'musical', 'order', 'on'].includes(k)) invalidate();
  if (k === 'order' || k === 'on') pos = 0;
  if (k === 'loop' && playing) { try { restart(); } catch (e) { fail(e, 'error: '); } }
  if (['verb', 'vol'].includes(k)) applyFx();
  syncUI(); save();
}
$('#reset').onclick = () => { S = Object.assign({}, DEF, { order: DEF.order.slice(), on: DEF.on.slice() }); rebuildTables(); invalidate(); if (playing) try { restart(); } catch (e) {} applyFx(); syncUI(); save(); };
$('#play').onclick = () => { setPlaying(!playing); };
$('#loopb').onclick = () => { S.loop = !S.loop; changed('loop'); };
const seek = $('#seek');
seek.addEventListener('pointerdown', () => { scrubbing = true; });
seek.addEventListener('input', () => { scrubbing = true; seekTo(seek.value / 1000, false); });
const endScrub = () => { if (scrubbing && seekPend) seekTo(pos, true); scrubbing = false; };
seek.addEventListener('change', endScrub); window.addEventListener('pointerup', endScrub);
$('#ptoggle').onclick = () => document.body.classList.toggle('nopanel');
if (matchMedia('(max-width:760px)').matches) document.body.classList.add('nopanel');
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); setPlaying(!playing); }
  else if (e.key === 'h' || e.key === 'H') { document.body.classList.toggle('nopanel'); }
  else if (e.key === 'r' || e.key === 'R') { resetCam(); }
  else if (e.key === 'c' || e.key === 'C') { document.body.classList.toggle('clean'); }
});

/* ───────── readout ───────── */
const fm = (v) => Math.round(v).toLocaleString('en-US') + ' m';
let readT = 0;
const panBar = (p) => { const n = 11, i = Math.round((p + 1) / 2 * (n - 1)); let o = ''; for (let k = 0; k < n; k++) o += k === i ? '●' : '·'; return 'L ' + o + ' R   ' + (Math.abs(p) < 0.05 ? 'centre' : (p < 0 ? 'L ' : 'R ') + Math.round(Math.abs(p) * 100) + '%'); };
function readout(t, force) {
  const now = performance.now(); if (!force && now - readT < 50) return; readT = now;
  const [v, tl] = verseAt(t); if (!v) { $('#time').textContent = 'no sections on'; return; } if (v.si !== curSec) loadSection(v.si); TB = v.T;
  const idx = SYN.tab(TB.idx, tl), hz = SYN.tab(TB.pitch, tl), pan = SYN.tab(TB.pan, tl);
  $('#rP').textContent = (profAt(idx, PD) / 1000).toFixed(2).padStart(5) + ' km of ' + (PD[NP - 1] / 1000).toFixed(1);
  $('#rE').textContent = fm(profAt(idx, PE)).padStart(7);
  const sm = Math.round(12 * Math.log2(hz / 110)); $('#rF').textContent = Math.round(hz).toString().padStart(4) + ' Hz  ' + SongSynth.NOTE[((sm % 12) + 12) % 12];
  $('#rL').textContent = panBar(pan);
  const l = S.layout === 'swapped' ? ['right', 'left'] : S.layout === 'mono' ? ['both', 'both'] : ['left', 'right'];
  $('#lblS i').textContent = 'South rim · ' + l[0]; $('#lblN i').textContent = 'North rim · ' + l[1];
  $('#time').textContent = 'verse ' + (VT.indexOf(v) + 1) + '/' + VT.length + ' · ' + (t * VT.total).toFixed(1) + ' / ' + VT.total.toFixed(1) + ' s';
  if (!scrubbing) seek.value = Math.round(t * 1000);
}

/* ───────── WebGL ───────── */
const canvas = $('#stage');
let gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
const cam = { yaw: -.55, pitch: .46, dist: 20, vy: 0, vp: 0, vd: 0 };
const CAM0 = { yaw: -.55, pitch: .46, dist: 20 };
let intro = 0;
function resetCam() { CAM0.dist = 20 * Math.max(1, 0.95 / (W / H)); Object.assign(cam, CAM0, { vy: 0, vp: 0 }); }
const YC = 1600;

const mat = {
  persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2), r = 1 / (n - fa); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + fa) * r, -1, 0, 0, 2 * n * fa * r, 0]); },
  look(e, c) {
    let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
    let x = [z[2], 0, -z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
  },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
};

const GLSL_COMMON = `#version 300 es
precision highp float;
uniform mat4 uMVP; uniform float uExag; uniform vec2 uE; uniform vec3 uPal[5];
vec3 pal(float t){ t=clamp(t,0.,1.)*4.; int i=int(min(floor(t),3.)); return mix(uPal[i],uPal[i+1],t-float(i)); }
float wy(float e){ return (e-1600.)*0.001*uExag; }
`;
const TERRAIN_VS = GLSL_COMMON + `
layout(location=0) in vec4 aP;
uniform vec2 uPX; uniform float uTime, uPxU, uPS, uLevel;
out float vE; out float vSl; out float vGlow; out float vFade; out float vTw;
void main(){
  vec3 w=vec3(aP.x,wy(aP.y),aP.z);
  gl_Position=uMVP*vec4(w,1.);
  vE=aP.y; vSl=aP.w;
  float d0=length(vec2(aP.x-uPX.x,aP.z));
  vGlow=exp(-d0*d0/1.4)*(0.4+uLevel*1.6)+exp(-aP.z*aP.z/0.07)*0.18;
  vFade=(1.-smoothstep(2.8,4.,abs(aP.z)))*(1.-smoothstep(8.,9.3,abs(aP.x)));
  vTw=0.82+0.18*sin(uTime*1.7+fract(sin(dot(aP.xz,vec2(12.9898,78.233)))*43758.5453)*6.2831);
  gl_PointSize=clamp(uPS*0.05*uPxU/gl_Position.w*(0.7+0.7*aP.w),1.2,16.);
}`;
const POINT_FS = `#version 300 es
precision highp float;
uniform vec2 uE; uniform vec3 uPal[5]; uniform float uInt;
vec3 pal(float t){ t=clamp(t,0.,1.)*4.; int i=int(min(floor(t),3.)); return mix(uPal[i],uPal[i+1],t-float(i)); }
in float vE; in float vSl; in float vGlow; in float vFade; in float vTw;
out vec4 o;
void main(){
  vec2 c=gl_PointCoord*2.-1.; float r2=dot(c,c); if(r2>1.) discard;
  float a=pow(1.-r2,2.);
  vec3 col=pal((vE-uE.x)/(uE.y-uE.x));
  float b=(0.14+0.95*vSl+vGlow*0.6)*vTw*vFade*uInt;
  o=vec4(col*b*a,1.);
}`;
const MESH_FS = `#version 300 es
precision highp float;
uniform vec2 uE; uniform vec3 uPal[5]; uniform float uLines;
vec3 pal(float t){ t=clamp(t,0.,1.)*4.; int i=int(min(floor(t),3.)); return mix(uPal[i],uPal[i+1],t-float(i)); }
in float vE; in float vSl; in float vGlow; in float vFade; in float vTw;
out vec4 o;
void main(){
  vec3 col=pal((vE-uE.x)/(uE.y-uE.x));
  float f=vE/40.; float fw=max(fwidth(f),1e-4);
  float g=abs(fract(f-.5)-.5)/fw; float minor=(1.-min(g,1.))*(1.-smoothstep(.35,.9,fw));
  float f2=f/5.; float fw2=max(fwidth(f2),1e-4);
  float g2=abs(fract(f2-.5)-.5)/fw2; float major=(1.-min(g2,1.))*(1.-smoothstep(.35,.9,fw2));
  float line=(minor*.42+major*.95)*uLines;
  float b=(line*(0.5+vGlow*0.8)+0.008+vGlow*0.012)*vFade;
  o=vec4(col*b,1.);
}`;
const SPR_VS = GLSL_COMMON + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in float aSz; layout(location=3) in vec2 aS;
uniform float uPos, uDpr;
out vec4 vC; out float vS; out float vV; out float vX; out float vH;
void main(){
  gl_Position=uMVP*vec4(aPos.x,wy(aPos.y),aPos.z,1.);
  float dl=uPos-aS.y; float tr=aS.y<0.?0.:(dl>=0.?exp(-dl*7.):exp(-dl*dl*2500.));   // bright at the dot, fading trail behind it
  float played=aS.y<0.?1.:0.12+1.05*tr;
  vC=vec4(aCol.rgb*aCol.a*played,1.); vS=aS.y; vV=aSz; vX=aPos.x; vH=aS.x;
  gl_PointSize=min(aSz*uDpr*(1.+1.2*tr),60.);
}`;
const SPR_FS = `#version 300 es
precision highp float;
in vec4 vC; in float vS; in float vV; in float vX; in float vH; out vec4 o;
void main(){ vec2 c=gl_PointCoord*2.-1.; float r2=dot(c,c); if(r2>1.) discard; o=vec4(vC.rgb*pow(1.-r2,1.6),1.); }`;
const CUR_FS = `#version 300 es
precision highp float;
uniform float uPos;
in vec4 vC; in float vS; in float vV; in float vX; in float vH; out vec4 o;
void main(){
  float stripe=smoothstep(.93,1.,abs(fract(vX*4.)-.5)*2.);
  float a=pow(1.-vV,2.)*(0.07+stripe*0.35);
  float dl=uPos-vS; float near=(dl>=0.?exp(-dl*9.):exp(-dl*dl*2500.))*0.9;
  o=vec4(vC.rgb*(a*(1.+near*3.)),1.);
}`;
const CUR_VS = SPR_VS.replace('gl_PointSize=min(aSz*uDpr*(1.+1.2*tr),60.);', 'gl_PointSize=1.;');
const FS_VS = `#version 300 es
out vec2 uv; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); uv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const DOWN_FS = `#version 300 es
precision highp float; uniform sampler2D uT; uniform vec2 uO; uniform float uFirst; in vec2 uv; out vec4 o;
vec3 s(vec2 p){ vec3 c=texture(uT,p).rgb; return uFirst>.5?min(c,vec3(6.)):c; }
void main(){ o=vec4((s(uv)*4.+s(uv+vec2(-uO.x,-uO.y))+s(uv+vec2(uO.x,-uO.y))+s(uv+vec2(-uO.x,uO.y))+s(uv+uO))/8.,1.); }`;
const UP_FS = `#version 300 es
precision highp float; uniform sampler2D uT; uniform vec2 uO; in vec2 uv; out vec4 o;
void main(){ vec3 c=texture(uT,uv).rgb*4.+(texture(uT,uv+vec2(uO.x,0.)).rgb+texture(uT,uv-vec2(uO.x,0.)).rgb+texture(uT,uv+vec2(0.,uO.y)).rgb+texture(uT,uv-vec2(0.,uO.y)).rgb)*2.
 +texture(uT,uv+uO).rgb+texture(uT,uv-uO).rgb+texture(uT,uv+vec2(uO.x,-uO.y)).rgb+texture(uT,uv+vec2(-uO.x,uO.y)).rgb; o=vec4(c/16.*0.9,1.); }`;
const COMP_FS = `#version 300 es
precision highp float; uniform sampler2D uH, uB; uniform float uGlow, uGrain, uTime, uAsp; uniform vec2 uRes; in vec2 uv; out vec4 o;
float h(vec2 p){ p=fract(p*vec2(443.897,441.423)); p+=dot(p,p.yx+19.19); return fract((p.x+p.y)*p.x); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
void main(){
  vec3 c=texture(uH,uv).rgb+texture(uB,uv).rgb*uGlow*0.6;
  c=aces(c*1.0);
  float d=length((uv-.5)*vec2(uAsp,1.)); c*=smoothstep(1.25,.25,d)*.9+.1;
  c=pow(c,vec3(1./2.2));
  float n=h(uv*uRes+fract(uTime*.37)*91.7)-.5;
  c+=n*uGrain*.07*(.25+dot(c,vec3(.33)));
  o=vec4(max(c,0.),1.);
}`;

let P = {}, hdr = true, W = 1, H = 1, dpr = 1, ST = null, bloom = [], vaoT, vaoS, vaoC, nIdx, bufDyn, dynData;
function prog(vs, fs, name) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ' link: ' + gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); const nm = a.name.replace('[0]', ''); u[nm] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
function mkTex(w, h, fmt) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  if (fmt) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function mkTarget(w, h, depth) {
  const tex = mkTex(w, h, hdr), fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rb = null; if (depth) { rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); }
  return { tex, fb, rb, w, h, ok: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE };
}
function freeTarget(t) { if (!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.rb) gl.deleteRenderbuffer(t.rb); }
function buildTargets() {
  freeTarget(ST); bloom.forEach(freeTarget); bloom = [];
  ST = mkTarget(W, H, true);
  if (!ST.ok && hdr) { hdr = false; freeTarget(ST); ST = mkTarget(W, H, true); }
  for (let i = 1; i <= 6; i++) bloom.push(mkTarget(Math.max(2, W >> i), Math.max(2, H >> i), false));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = innerWidth, ch = innerHeight;
  if (cw * ch * dpr * dpr > 4.2e6) dpr = Math.sqrt(4.2e6 / (cw * ch));
  const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr));
  canvas.width = w; canvas.height = h; W = w; H = h;
  if (gl) buildTargets();
}

// dense transect geometry
const NDENSE = 3000, SPRF = 10;
const denseS = [], denseN = [];
function initGL() {
  if (!gl) return false;
  const ext = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'); hdr = !!ext;
  P.pts = prog(TERRAIN_VS, POINT_FS, 'points'); P.mesh = prog(TERRAIN_VS, MESH_FS, 'mesh');
  P.spr = prog(SPR_VS, SPR_FS, 'sprites'); P.cur = prog(CUR_VS, CUR_FS, 'curtain');
  P.down = prog(FS_VS, DOWN_FS, 'down'); P.up = prog(FS_VS, UP_FS, 'up'); P.comp = prog(FS_VS, COMP_FS, 'composite');
  buildGeom(); vaoEmpty = gl.createVertexArray(); return true;
}
let GEO = [];
function buildGeom() {
  GEO.forEach(o => o.del ? gl.deleteVertexArray(o.v) : gl.deleteBuffer(o.b)); GEO = [];
  const du = (D.L + 2 * D.MARG) / (NU - 1), dv = 2 * D.HALFV / (NV - 1);
  const V = new Float32Array(NU * NV * 4), E = (i, j) => G[j * NU + i] / D.sc + D.off;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const o = (j * NU + i) * 4, ip = Math.min(i + 1, NU - 1), im = Math.max(i - 1, 0), jp = Math.min(j + 1, NV - 1), jm = Math.max(j - 1, 0);
    const gx = (E(ip, j) - E(im, j)) / ((ip - im) * du), gz = (E(i, jp) - E(i, jm)) / ((jp - jm) * dv);
    V[o] = (-D.MARG + i * du - D.L / 2) / 1000; V[o + 1] = E(i, j); V[o + 2] = -(-D.HALFV + j * dv) / 1000; V[o + 3] = Math.min(1, Math.hypot(gx, gz) / 1.5);
  }
  const IX = new Uint32Array((NU - 1) * (NV - 1) * 6); let q = 0;
  for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU - 1; i++) { const a = j * NU + i, b = a + 1, c = a + NU, d = c + 1; IX[q++] = a; IX[q++] = c; IX[q++] = b; IX[q++] = b; IX[q++] = c; IX[q++] = d; }
  nIdx = IX.length;
  vaoT = gl.createVertexArray(); gl.bindVertexArray(vaoT);
  const vb = gl.createBuffer(); GEO.push({ v: vaoT, del: 1 }, { b: vb }); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  const ib = gl.createBuffer(); GEO.push({ b: ib }); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IX, gl.STATIC_DRAW);
  // overlay vertex format: pos3 col4 size1 s2 = 10 floats
  const attrs = () => { gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 40, 28); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 40, 32); };
  // transect line (dense points, interpolated from the 300-point profile)
  const line = new Float32Array(NDENSE * 10);
  for (let n = 0; n < NDENSE; n++) {
    const idx = n / (NDENSE - 1) * (NP - 1), o = n * 10;   // aS = (colour mix S->N, position 0..1 along the whole transect)
    line.set([toXkm(profAt(idx, PD)), profAt(idx, PE) + 6, 0, 1, 1, 1, 1, 3.2, mixAt(idx), idx / (NP - 1)], o);
  }
  lineData = line;
  vaoS = gl.createVertexArray(); gl.bindVertexArray(vaoS); bufLine = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bufLine); gl.bufferData(gl.ARRAY_BUFFER, line, gl.DYNAMIC_DRAW); attrs();
  // curtain strip: profile top + floor
  const cur = new Float32Array(NP * 2 * 10), FLOOR = EMIN - 120;
  for (let i = 0; i < NP; i++) { const m = mixAt(i), s = i / (NP - 1), x = toXkm(PD[i]);
    cur.set([x, PE[i], 0, 1, 1, 1, 1, 0, m, s], i * 20); cur.set([x, FLOOR, 0, 1, 1, 1, 1, 1, m, s], i * 20 + 10); }
  curData = cur; vaoC = gl.createVertexArray(); gl.bindVertexArray(vaoC); bufCur = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bufCur); gl.bufferData(gl.ARRAY_BUFFER, cur, gl.DYNAMIC_DRAW); attrs();
  // playheads
  dynData = new Float32Array((PH_BEAM + 2) * 10);
  vaoP = gl.createVertexArray(); gl.bindVertexArray(vaoP); bufDyn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bufDyn); gl.bufferData(gl.ARRAY_BUFFER, dynData, gl.DYNAMIC_DRAW); attrs();
  GEO.push({ v: vaoS, del: 1 }, { b: bufLine }, { v: vaoC, del: 1 }, { b: bufCur }, { v: vaoP, del: 1 }, { b: bufDyn });
  gl.bindVertexArray(null);
}
let lineData, curData, bufLine, bufCur, vaoP, vaoEmpty; const PH_BEAM = 56;
function colorize() {
  const pl = PALETTES[S.palette], cs = pl.s, cn = pl.nn, mx = (m) => [cs[0] + (cn[0] - cs[0]) * m, cs[1] + (cn[1] - cs[1]) * m, cs[2] + (cn[2] - cs[2]) * m];   // south colour -> north colour along the route
  for (let n = 0; n < NDENSE; n++) { const c = mx(lineData[n * 10 + 8]); lineData.set([c[0], c[1], c[2], 0.85], n * 10 + 3); }
  for (let i = 0; i < NP; i++) for (let r = 0; r < 2; r++) { const c = mx(curData[i * 20 + r * 10 + 8]); curData.set([c[0], c[1], c[2], 1.6], i * 20 + r * 10 + 3); }
  gl.bindBuffer(gl.ARRAY_BUFFER, bufLine); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufCur); gl.bufferSubData(gl.ARRAY_BUFFER, 0, curData);
}
let lastPalette = -1;
function setPal(pr) { const flat = new Float32Array(15); PALETTES[S.palette].p.forEach((c, i) => flat.set(c, i * 3)); gl.uniform3fv(pr.u.uPal, flat); }
function fillPlayheads(idx, lvl) {   // ONE dot: a faint vertical beam, a halo and a white core
  const pl = PALETTES[S.palette], d = dynData, m = mixAt(idx); let o = 0;
  const c = [pl.s[0] + (pl.nn[0] - pl.s[0]) * m, pl.s[1] + (pl.nn[1] - pl.s[1]) * m, pl.s[2] + (pl.nn[2] - pl.s[2]) * m];
  const x = toXkm(profAt(idx, PD)), e = profAt(idx, PE), top = EMAX + 500, bot = EMIN - 120;
  for (let i = 0; i < PH_BEAM; i++) { const f = i / (PH_BEAM - 1), y = bot + (top - bot) * f; const a = 0.12 + 0.5 * Math.exp(-Math.pow((y - e) / 500, 2));
    d.set([x, y, 0, c[0], c[1], c[2], a * 0.8, 2.5, m, -1], o); o += 10; }
  d.set([x, e + 8, 0, c[0] * .7 + .3, c[1] * .7 + .3, c[2] * .7 + .3, 1.0 + lvl * 1.5, 24 + lvl * 36, m, -1], o); o += 10;
  d.set([x, e + 8, 0, 1, 1, 1, 1.0, 9 + lvl * 9, m, -1], o); o += 10;
  gl.bindBuffer(gl.ARRAY_BUFFER, bufDyn); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d);
}
function drawFS(prg, src, dst, extra) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H);
  gl.useProgram(prg.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(prg.u.uT, 0); if (extra) extra(); gl.drawArrays(gl.TRIANGLES, 0, 3);
}
const eye = [0, 0, 0], tgt = [0, -.2, 0];
let MVP;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000); frame.last = now;
  // playhead follows the audio clock (ctx.currentTime), so it stops when the browser suspends audio
  let t = pos;
  if (playing && cur && !scrubbing) { t = curPos(); pos = t; }
  if (playing && cur && sndEl.dataset.k === 'playing' && /starting/.test(sndTxt.textContent) && ctx.currentTime > cur.t0 + 0.05) setSnd('playing', 'playing · ' + (ctx.sampleRate / 1000) + ' kHz');
  if (analyser && playing) {
    analyser.getFloatTimeDomainData(anaBuf); let ss = 0; for (let i = 0; i < anaBuf.length; i++) ss += anaBuf[i] * anaBuf[i]; rms = Math.sqrt(ss / anaBuf.length);
    level += (Math.min(1, rms * 2.2) - level) * 0.25; sndBar.style.width = Math.min(100, rms * 260) + '%';
    if (ctx.state === 'running' && cur && ctx.currentTime - cur.t0 > 1.2) {   // running, but nothing reaching the output?
      if (rms < 1e-4) { if (!silentSince) silentSince = now; else if (now - silentSince > 1200 && sndEl.dataset.k === 'playing') setSnd('error', S.vol < 0.02 ? 'playing, but the volume slider is at 0%' : 'playing, but the output is silent (check the volume slider and the page isn\'t muted)'); }
      else { silentSince = 0; if (sndEl.dataset.k === 'error' && /silent|0%/.test(sndTxt.textContent)) setSnd('playing', 'playing · ' + (ctx.sampleRate / 1000) + ' kHz'); }
    }
  } else level *= 0.9;
  readout(t, false);
  if (!gl) return;
  // camera
  intro = Math.min(1, intro + dt / 2.4); const ei = 1 - Math.pow(1 - intro, 3);
  if (!drag.on) { cam.yaw += cam.vy * dt * 60; cam.pitch += cam.vp * dt * 60; cam.vy *= Math.pow(.93, dt * 60); cam.vp *= Math.pow(.93, dt * 60); if (S.rotate && Math.abs(cam.vy) < .002) cam.yaw += dt * .05; }
  cam.pitch = Math.min(Math.max(cam.pitch, .04), 1.52); cam.dist = Math.min(Math.max(cam.dist, 3), 60);
  const dist = cam.dist * (1 + (1 - ei) * 0.9), cp = Math.cos(cam.pitch);
  eye[0] = tgt[0] + dist * cp * Math.sin(cam.yaw); eye[1] = tgt[1] + dist * Math.sin(cam.pitch); eye[2] = tgt[2] + dist * cp * Math.cos(cam.yaw);
  const fov = 0.8, asp = W / H;
  const shift = (!document.body.classList.contains('nopanel') && innerWidth > 760) ? -0.2 * Math.min(1, 1100 / innerWidth) : 0;
  MVP = mat.mul(mat.persp(fov, asp, .1, 200), mat.look(eye, tgt)); MVP = mat.mul(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, shift,0,0,1]), MVP);
  const pxU = H / (2 * Math.tan(fov / 2));
  if (lastPalette !== S.palette) { lastPalette = S.palette; colorize(); }
  const [hv, htl] = verseAt(t); if (hv && hv.si !== curSec) loadSection(hv.si); if (hv) TB = hv.T;
  const hIdx = SYN.tab(TB.idx, hv ? htl : 0), hs = hIdx / (NP - 1), px = toXkm(profAt(hIdx, PD));
  const common = (pr) => { gl.uniformMatrix4fv(pr.u.uMVP, false, MVP); gl.uniform1f(pr.u.uExag, S.exag); gl.uniform2f(pr.u.uE, EMIN, EMAX); setPal(pr); };
  const terr = (pr) => { common(pr); gl.uniform2f(pr.u.uPX, px, px); gl.uniform1f(pr.u.uTime, now / 1000); gl.uniform1f(pr.u.uPxU, pxU); gl.uniform1f(pr.u.uLevel, level); };
  gl.bindFramebuffer(gl.FRAMEBUFFER, ST.fb); gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 1.5);
  gl.bindVertexArray(vaoT); gl.disable(gl.BLEND);
  // 1: depth-only occluder (hides far side so additive glow doesn't pile up)
  gl.useProgram(P.mesh.p); terr(P.mesh); gl.uniform1f(P.mesh.u.uLines, 0);
  gl.colorMask(false, false, false, false); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0); gl.colorMask(true, true, true, true);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  if (S.view !== 'points') { gl.uniform1f(P.mesh.u.uLines, 1); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0); }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  if (S.view !== 'contours') { gl.useProgram(P.pts.p); terr(P.pts); gl.uniform1f(P.pts.u.uPS, S.psize); gl.uniform1f(P.pts.u.uInt, S.view === 'points' ? .8 : .55); gl.drawArrays(gl.POINTS, 0, NU * NV); }
  // overlays: no depth test (x-ray hologram)
  gl.disable(gl.DEPTH_TEST);
  if (S.curtain) { gl.useProgram(P.cur.p); common(P.cur); gl.uniform1f(P.cur.u.uPos, hs); gl.uniform1f(P.cur.u.uDpr, dpr); gl.bindVertexArray(vaoC); gl.drawArrays(gl.TRIANGLE_STRIP, 0, NP * 2); }
  gl.useProgram(P.spr.p); common(P.spr); gl.uniform1f(P.spr.u.uPos, hs); gl.uniform1f(P.spr.u.uDpr, dpr);
  gl.bindVertexArray(vaoS); gl.drawArrays(gl.POINTS, 0, NDENSE);
  fillPlayheads(hIdx, level); gl.bindVertexArray(vaoP); gl.drawArrays(gl.POINTS, 0, PH_BEAM + 2);
  gl.bindVertexArray(vaoEmpty); gl.depthMask(true);
  // bloom
  gl.disable(gl.BLEND);
  drawFS(P.down, ST, bloom[0], () => { gl.uniform2f(P.down.u.uO, 1 / W, 1 / H); gl.uniform1f(P.down.u.uFirst, 1); });
  for (let i = 1; i < bloom.length; i++) drawFS(P.down, bloom[i - 1], bloom[i], () => { gl.uniform2f(P.down.u.uO, 1 / bloom[i - 1].w, 1 / bloom[i - 1].h); gl.uniform1f(P.down.u.uFirst, 0); });
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = bloom.length - 1; i > 0; i--) drawFS(P.up, bloom[i], bloom[i - 1], () => gl.uniform2f(P.up.u.uO, 1 / bloom[i].w, 1 / bloom[i].h));
  gl.disable(gl.BLEND);
  // composite
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(P.comp.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ST.tex); gl.uniform1i(P.comp.u.uH, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloom[0].tex); gl.uniform1i(P.comp.u.uB, 1);
  gl.uniform1f(P.comp.u.uGlow, S.glow); gl.uniform1f(P.comp.u.uGrain, S.grain); gl.uniform1f(P.comp.u.uTime, now / 1000); gl.uniform1f(P.comp.u.uAsp, asp); gl.uniform2f(P.comp.u.uRes, W, H);
  gl.drawArrays(gl.TRIANGLES, 0, 3); gl.activeTexture(gl.TEXTURE0);
  // labels
  placeLabel('#lblS', toXkm(PD[0]), PE[0], 'left'); placeLabel('#lblN', toXkm(PD[NP - 1]), PE[NP - 1], 'right'); placeLabel('#lblR', toXkm(PD[K]), PE[K], 'below');
}
const lblCache = {};
function placeLabel(sel, x, e, mode) {
  const el = lblCache[sel] || (lblCache[sel] = $(sel)), y = (e - YC) * .001 * S.exag, m = MVP;
  const cx = m[0] * x + m[4] * y + m[12], cy = m[1] * x + m[5] * y + m[13], cw = m[3] * x + m[7] * y + m[15];
  if (cw <= 0) { el.style.visibility = 'hidden'; return; }
  const sx = (cx / cw * .5 + .5) * innerWidth, sy = (1 - (cy / cw * .5 + .5)) * innerHeight;
  const ox = mode === 'left' ? -el.offsetWidth - 12 : mode === 'right' ? 12 : -el.offsetWidth / 2, oy = mode === 'below' ? 14 : -el.offsetHeight / 2 - 14;
  el.style.visibility = 'visible'; el.style.transform = `translate(${(sx + ox).toFixed(1)}px,${(sy + oy).toFixed(1)}px)`;
}

/* ───────── camera input ───────── */
const drag = { on: false }, ptrs = new Map(); let pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag.on = true; canvas.classList.add('dragging'); cam.vy = cam.vp = 0;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
canvas.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { cam.yaw -= dx * .0055; cam.pitch += dy * .0045; cam.vy = -dx * .0055 * .6; cam.vp = dy * .0045 * .6; }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) cam.dist *= pinch0 / d; pinch0 = d; cam.vy = cam.vp = 0; }
});
const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) { drag.on = false; canvas.classList.remove('dragging'); } pinch0 = 0; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * .0011); }, { passive: false });

/* ───────── boot ───────── */
rebuildTables(); syncUI(); readout(0, true);
try {
  if (!gl) throw new Error('nogl');
  initGL(); resize(); colorize(); resetCam();
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; flash('The graphics context was lost. Reload the page to see the 3D view.'); });
} catch (err) {
  console.error(err); gl = null;
  const m = $('#msg'); m.hidden = false; m.firstElementChild.textContent = err.message === 'nogl' ? 'WebGL 2 is not available in this browser, so the 3D canyon cannot be drawn. The sound and controls still work.' : 'The 3D view could not start (' + err.message + '). The sound and controls still work.';
}
addEventListener('resize', resize);
window.__canyon = { S: () => S, TB: () => TB, VT: () => VT, curSec: () => curSec, K: () => K, hdr: () => hdr, audio: () => ({ ctx, cur, playing, pos: curPos(), state: ctx && ctx.state, status: sndEl.dataset.k + ' | ' + sndTxt.textContent }) };
requestAnimationFrame(frame);
})();
