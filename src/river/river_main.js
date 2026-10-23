(() => {
'use strict';
const $ = (s) => document.querySelector(s), RD = RIVER, N = RD.N, SYN = RiverSynth.create(RD);
window.__T = window.__T || {};
const KEY = 'canyon-river-v2', DEF = { style: 'orch', preset: 'orchestra', musical: 0.6, speed: 1, base: 75, vol: 0.9, verb: 0.25, exag: 2.2, orbit: false, contours: true, loop: true, labels: true, glow: 1, grain: .5, psize: 1 };
let S = Object.assign({}, DEF); try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
for (const k of ['musical', 'speed', 'vol', 'verb', 'exag', 'glow', 'grain', 'psize']) if (!Number.isFinite(S[k])) S[k] = DEF[k];
S.musical = Math.min(Math.max(S.musical, 0), 1); S.speed = Math.min(Math.max(S.speed, 0.5), 2); S.base = 75;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const dur = () => S.base / S.speed;
const STY = RiverStyles.create(RD, SYN), STR = RiverStrata.create(RD, SYN), ORC = RiverOrch.create(RD, SYN, STR), STYLE_IDS = ['canyon', 'edm', 'country', 'pop', 'strata', 'orch'];
const isBand = () => S.style === 'strata' || S.style === 'orch';   // both use the 4 height bands
let BANDENV = null; const BLAB = { s: null, o: [] };   // band-meter labels (Strata synth names vs orchestra sections)
if (!STYLE_IDS.includes(S.style)) S.style = 'orch';
S.inst = Object.assign({}, RiverOrch.DEF_INST, S.inst && typeof S.inst === 'object' ? S.inst : {});
for (let k = 0; k < 4; k++) if (!RiverOrch.BAND_INST[k].includes(S.inst['b' + (k + 1)])) S.inst['b' + (k + 1)] = RiverOrch.DEF_INST['b' + (k + 1)];
if (!RiverOrch.ACC[S.inst.acc]) S.inst.acc = 'orch'; if (!RiverOrch.GROOVE[S.inst.groove]) S.inst.groove = 'none';
if (!RiverOrch.PRESETS[S.preset] && S.preset !== 'custom') S.preset = 'orchestra';
const INST_KEYS = ['b1', 'b2', 'b3', 'b4', 'acc', 'groove'], isDefInst = () => INST_KEYS.every(k => S.inst[k] === RiverOrch.DEF_INST[k]);
if (!['brass', 'strings', 'mallet', 'cello', 'horn'].includes(S.b3)) S.b3 = 'brass'; if (!['synth', 'pizz'].includes(S.b2)) S.b2 = 'synth';
/* recorded samples (VSCO 2 CE, CC0): MP3 embedded as base64, decoded once with an OfflineAudioContext (no user gesture needed; Safari OK) */
let SMP_READY = false, SMP_ERR = null;
(function decodeSamples() {
  try {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) throw new Error('no OfflineAudioContext');
    const oc = new OAC(1, SAMPLES_MP3.sr, SAMPLES_MP3.sr), jobs = [];
    const dec = (b64) => new Promise((res, rej) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      const p = oc.decodeAudioData(u.buffer, res, rej); if (p && p.catch) p.catch(rej); });
    for (const [name, list] of Object.entries(SAMPLES_MP3.sets)) jobs.push(Promise.all(list.map(q => dec(q.mp3).then(b => ({ hz: q.hz, ls: q.ls, le: q.le, sr: b.sampleRate, data: b.getChannelData(0) })))).then(l => RiverStrata.addSamples(name, l)));
    Promise.all(jobs).then(() => { SMP_READY = true; refs.forEach(f => f()); if (S.style === 'strata' && (S.b3 === 'cello' || S.b3 === 'horn' || S.b2 === 'pizz')) invalidate(); })
      .catch(e => { SMP_ERR = (e && e.message) || String(e); console.error('sample decode failed', e); refs.forEach(f => f()); });
  } catch (e) { SMP_ERR = e.message; }
})();
/* Strata Orchestra: VSCO 2 CE sections (CC0) + OpenAIR Jack Lyons Concert Hall IR (CC BY 4.0), decoded the same way (32 kHz OfflineAudioContext).
   The default sections decode first; the extra picker / preset instruments (SAMPLES_ORCH2) decode right after. */
let ORC_READY = false, ORC_ERR = null, ORC2_READY = false, ORC2_ERR = null;
const OACx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
const decB64 = (oc, b64) => new Promise((res, rej) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  const p = oc.decodeAudioData(u.buffer, res, rej); if (p && p.catch) p.catch(rej); });
(function decodeOrch() {
  try {
    if (!OACx) throw new Error('no OfflineAudioContext');
    const oc = new OACx(2, SAMPLES_ORCH.sr, SAMPLES_ORCH.sr), jobs = [];
    for (const [name, list] of Object.entries(SAMPLES_ORCH.sets)) jobs.push(Promise.all(list.map(q => decB64(oc, q.mp3).then(b => ({ hz: q.hz, ls: q.ls, le: q.le, peakAt: q.peakAt, sr: b.sampleRate, data: b.getChannelData(0) })))).then(l => RiverOrch.addSamples(name, l)));
    jobs.push(decB64(oc, SAMPLES_ORCH.ir.mp3).then(b => RiverOrch.setIR([b.getChannelData(0), b.getChannelData(b.numberOfChannels > 1 ? 1 : 0)], b.sampleRate)));
    Promise.all(jobs).then(() => { ORC_READY = true; window.__T.orcReady = performance.now(); refs.forEach(f => f()); onSamples(); decodeOrch2(); })
      .catch(e => { ORC_ERR = (e && e.message) || String(e); console.error('orchestra decode failed', e); refs.forEach(f => f()); if (S.style === 'orch') setSnd('blocked', 'orchestra samples could not be decoded'); });
  } catch (e) { ORC_ERR = e.message; }
})();
function decodeOrch2() {
  try {
    const oc = new OACx(1, SAMPLES_ORCH2.sr, SAMPLES_ORCH2.sr), jobs = [];
    for (const [name, list] of Object.entries(SAMPLES_ORCH2.sets)) jobs.push(Promise.all(list.map(q => decB64(oc, q.mp3).then(b => ({ hz: q.hz, ls: q.ls, le: q.le, sr: b.sampleRate, data: b.getChannelData(0) })))).then(l => { RiverOrch.addSamples(name, l); onSamples(); }));
    Promise.all(jobs).then(() => { ORC2_READY = true; refs.forEach(f => f()); onSamples(); })
      .catch(e => { ORC2_ERR = (e && e.message) || String(e); console.error('instrument decode failed', e); refs.forEach(f => f()); });
  } catch (e) { ORC2_ERR = e.message; }
}
const instOK = () => ORC_READY && RiverOrch.has(RiverOrch.setsFor(S.inst));
const opts = () => Object.assign({ dur: dur(), musical: S.musical, bpm: 84, lo: 110, hi: 880, style: S.style }, S.style === 'strata' ? { band3Voice: S.b3, band2Voice: S.b2 } : S.style === 'orch' && !isDefInst() ? { inst: Object.assign({}, S.inst) } : {});
const tablesFor = (o) => o.style === 'canyon' ? SYN.tables(o) : o.style === 'strata' || o.style === 'orch' ? SYN.tables(Object.assign({}, o, { musical: 0 })) : STY.tables(o);   // strata readout shows the raw wall pitch
let TB = tablesFor(opts());
/* ───── audio ─────
   Synth styles: pre-rendered AudioBuffer (as before). Orchestra: an incremental render job per instrument config, rendered in blocks
   (first 3 s, then 4 s) between UI frames; playback starts as soon as the first block exists and later blocks are scheduled back to back
   on the audio clock (sample-exact boundaries). When the job finishes it becomes one AudioBuffer, cached per config (LRU 5), so
   re-picking a config is instant. The context is created at load (suspended) so the first block can be ready before the click. */
let ctx = null, master, wet, buf = null, dirty = true, cur = null, playing = false, pos = 0, analyser, ana, level = 0, unlocked = false, waitOff = null;
const snd = $('#snd'), setSnd = (k, m) => { snd.dataset.k = k; snd.textContent = 'sound: ' + m; };
function initAudio() {
  if (ctx) return true; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { setSnd('error', 'no Web Audio in this browser'); return false; }
  ctx = new AC(); master = ctx.createGain(); master.gain.value = S.vol;
  const conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let y = 0; for (let i = 0; i < len; i++) { y += ((Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) - y) * 0.3; d[i] = y; } }
  conv.buffer = ir; wet = ctx.createGain(); wet.gain.value = S.verb; conv.connect(wet); wet.connect(master); master._conv = conv;
  analyser = ctx.createAnalyser(); analyser.fftSize = 1024; ana = new Float32Array(1024); master.connect(analyser); master.connect(ctx.destination);
  ctx.onstatechange = () => { if (playing && ctx.state !== 'running' && ctx.state !== 'suspended') setSnd('blocked', 'browser paused audio (' + ctx.state + '), press play again'); };
  return true;
}
function unlock() { if (unlocked) return; unlocked = true; try { const ub = ctx.createBuffer(1, 1, 22050), us = ctx.createBufferSource(); us.buffer = ub; us.connect(ctx.destination); us.start(0); } catch (e) {} }   // iOS/Safari: inside the click
function ensureBuf() {
  if (buf && !dirty && buf.sampleRate === ctx.sampleRate) return buf;
  setSnd('busy', 'rendering…'); const o = opts(), r = o.style === 'canyon' ? SYN.render(o, ctx.sampleRate) : o.style === 'strata' ? STR.render(o, ctx.sampleRate) : STY.render(o, ctx.sampleRate), b = ctx.createBuffer(2, r.L.length, ctx.sampleRate);
  b.getChannelData(0).set(r.L); b.getChannelData(1).set(r.R); BANDENV = r.bandEnv ? { e: r.bandEnv, n: r.bandEnv[0].length } : null; buf = b; dirty = false; computeEnv(b); return b;
}
/* orchestra render cache */
const CACHE = new Map(); let E = null, pumpT = 0; const FIRST = 3, NEXT = 4;
function entry() { const o = opts(), sr = ctx.sampleRate, key = JSON.stringify([o, sr]); let e = CACHE.get(key);
  if (e) { CACHE.delete(key); CACHE.set(key, e); return e; }
  e = { key, o, sr, n: Math.floor(o.dur * sr), job: null, done: 0, buf: null, env: null, bandEnv: null, envDone: 0 }; CACHE.set(key, e);
  for (const [k, x] of CACHE) { if (CACHE.size <= 5) break; if (x !== e && !(cur && cur.e === x)) CACHE.delete(k); } return e; }
function useEntry() { E = entry(); if (E.env) ENV = E.env; BANDENV = E.bandEnv ? { e: E.bandEnv, n: E.bandEnv[0].length } : null; ACC = accentTimes(); pump(); return E; }
function envRange(e, c1) { const hop = Math.floor(e.sr / ENVR), L = e.job.L, R = e.job.R, ev = e.env; for (let k = e.envDone; k < ev.n && (k + 1) * hop <= c1; k++, e.envDone = k + 1) { let a = 0, c = 0; for (let i = k * hop; i < (k + 1) * hop; i += 4) { a += L[i] * L[i]; c += R[i] * R[i]; } ev.eL[k] = Math.sqrt(a / (hop / 4)); ev.eR[k] = Math.sqrt(c / (hop / 4)); } }
function pump() {
  clearTimeout(pumpT); const e = E; if (!e || e.buf || S.style !== 'orch') return; if (!ctx || !instOK()) return;   // onSamples() calls back once decoded
  try {
    if (!e.job) { e.job = ORC.job(e.o, e.sr); e.bandEnv = e.job.bandEnv; BANDENV = { e: e.bandEnv, n: e.bandEnv[0].length }; const hop = Math.floor(e.sr / ENVR), ne = Math.floor(e.n / hop); e.env = { eL: new Float32Array(ne), eR: new Float32Array(ne), n: ne }; ENV = e.env; }
    const c0 = e.job.done, t = performance.now(); e.job.step(Math.round((c0 === 0 ? FIRST : NEXT) * e.sr)); e.done = e.job.done; envRange(e, e.done);
    if (c0 === 0) window.__T.firstBlockMs = performance.now() - t, window.__T.firstBlockAt = performance.now();
    onChunk(e);
    if (e.done >= e.n) { const b = ctx.createBuffer(2, e.n, e.sr); b.getChannelData(0).set(e.job.L); b.getChannelData(1).set(e.job.R); e.buf = b; e.job = null; window.__T.fullAt = performance.now(); onChunk(e); if (!playing) setSnd('ready', 'ready'); }
  } catch (err) { console.error(err); setSnd('error', err.message || String(err)); return; }
  if (!e.buf) { if (!playing) setSnd('busy', 'preparing… ' + Math.round(e.done / e.n * 100) + '%'); pumpT = setTimeout(pump, playing ? 0 : 50); }
}
function onSamples() { if (S.style !== 'orch') return; if (!ctx) initAudio(); if (!ctx) return; if (!E || E.key !== JSON.stringify([opts(), ctx.sampleRate])) useEntry(); else pump(); }
function onChunk(e) {
  if (e !== E) return;
  if (cur && cur.e === e) sched(cur);
  else if (playing && !cur && waitOff !== null && (e.buf || e.done >= Math.min(e.n, Math.floor(waitOff * e.n) + Math.round(0.5 * e.sr)))) { const w = waitOff; waitOff = null; start(w); }
}
function sched(c) { const e = c.e;
  if (e.job && e.done > c.next) { const len = e.done - c.next, b = ctx.createBuffer(2, len, e.sr); b.getChannelData(0).set(e.job.L.subarray(c.next, e.done)); b.getChannelData(1).set(e.job.R.subarray(c.next, e.done));
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(c.g); const when = c.t0 + (c.next - c.s0) / e.sr; s.start(Math.max(when, ctx.currentTime)); if (when < ctx.currentTime - 0.01) window.__T.late = (window.__T.late || 0) + 1;
    c.srcs.push(s); c.next = e.done; c.last = s; if (window.__T.firstSoundAt === undefined) window.__T.firstSoundAt = performance.now() + Math.max(0, when - ctx.currentTime) * 1000;
    s.onended = () => { if (cur === c && !c.handoff && s === c.last && c.next >= e.n) { cur = null; playing = false; pos = 0; syncPlay(); setSnd('ready', 'ready'); } }; }
  if (e.buf && S.loop && !c.handoff && c.next >= e.n) {   // gapless hand-off into the finished, looping buffer
    const s = ctx.createBufferSource(), tEnd = c.t0 + (e.n - c.s0) / e.sr; s.buffer = e.buf; s.loop = true; s.connect(c.g); s.start(Math.max(tEnd, ctx.currentTime)); c.handoff = s; c.srcs.push(s); c.t0 = tEnd; c.o = 0; c.loop = true; }
}
function start(off) {
  off = Math.min(Math.max(off, 0), 0.9999); const now = ctx.currentTime;
  if (S.style === 'orch') {
    if (!E || E.key !== JSON.stringify([opts(), ctx.sampleRate])) useEntry();
    const e = E, s0 = Math.floor(off * e.n);
    if (!e.buf && e.done < Math.min(e.n, s0 + Math.round(0.5 * e.sr))) { waitOff = off; cur = null; pos = off; setSnd('busy', !instOK() ? 'decoding instruments…' : 'rendering…'); pump(); return; }
    const g = ctx.createGain(); g.connect(master); g.gain.setValueAtTime(0, now);
    if (e.buf) { const s = ctx.createBufferSource(); s.buffer = e.buf; s.loop = !!S.loop; s.connect(g); g.gain.linearRampToValueAtTime(1, now + 0.03); const o = off * e.buf.duration;
      const c = { e, g, srcs: [s], t0: now, o, d: e.buf.duration, loop: s.loop, handoff: s }; s.onended = () => { if (cur === c) { cur = null; playing = false; pos = 0; syncPlay(); setSnd('ready', 'ready'); } };
      s.start(now, o); cur = c; if (window.__T.firstSoundAt === undefined) window.__T.firstSoundAt = performance.now(); }
    else { const t0 = Math.ceil((now + 0.04) * e.sr) / e.sr; g.gain.linearRampToValueAtTime(1, t0 + 0.03);
      cur = { e, g, srcs: [], s0, next: s0, t0, o: s0 / e.sr, d: e.n / e.sr, loop: false }; sched(cur); pump(); }
    setSnd('playing', 'playing · ' + ctx.sampleRate / 1000 + ' kHz'); return;
  }
  const b = ensureBuf(), s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = !!S.loop; s.connect(g); g.connect(master); g.connect(master._conv);
  const o = off * b.duration; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + 0.03);
  const c = { g, srcs: [s], t0: now, o, d: b.duration, loop: s.loop }; s.onended = () => { if (cur === c) { cur = null; playing = false; pos = 0; syncPlay(); setSnd('ready', 'ready'); } };
  s.start(now, o); cur = c; setSnd('playing', 'playing · ' + ctx.sampleRate / 1000 + ' kHz');
}
function stop(c) { if (!c) return; try { const n = ctx.currentTime; c.g.gain.cancelScheduledValues(n); c.g.gain.setValueAtTime(c.g.gain.value, n); c.g.gain.linearRampToValueAtTime(0, n + 0.04); for (const s of c.srcs) { s.onended = null; try { s.stop(n + 0.06); } catch (e) {} } } catch (e) {} }
function curPos() { if (!cur) return pos; const x = (cur.o + ctx.currentTime - cur.t0) / cur.d; return cur.loop ? x - Math.floor(x) : Math.min(Math.max(x, 0), 0.9999); }
function setPlaying(p) {
  try {
    if (p) { if (!initAudio()) return; unlock(); if (ctx.state !== 'running') ctx.resume(); window.__T.clickAt = performance.now(); window.__T.firstSoundAt = undefined; if (pos >= 0.9999) pos = 0; stop(cur); cur = null; waitOff = null; playing = true;
      if (S.style === 'orch' && (ORC_ERR || !ORC_READY)) { if (ORC_ERR) { playing = false; setSnd('blocked', 'orchestra samples could not be decoded'); } else { waitOff = pos; setSnd('busy', 'decoding orchestra samples…'); } }
      else start(pos); }
    else if (playing) { pos = curPos(); stop(cur); cur = null; waitOff = null; playing = false; setSnd('ready', 'paused'); }
  } catch (e) { console.error(e); playing = false; setSnd('error', e.message || String(e)); }
  syncPlay();
}
let rt = 0; function invalidate() { dirty = true; buf = null; TB = tablesFor(opts()); if (S.style === 'orch' && ctx) { const was = E; useEntry(); } else ACC = accentTimes();
  clearTimeout(rt); rt = setTimeout(() => { if (playing) { const t = cur ? curPos() : (waitOff !== null ? waitOff : pos); stop(cur); cur = null; waitOff = null; try { start(t); } catch (e) { setSnd('error', e.message); } } }, 150); }
function syncPlay() { $('#pico').setAttribute('d', playing ? 'M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z' : 'M3 1.5v11l9-5.5z'); if (playing) $('#hint').hidden = true; }
/* ───── controls ───── */
const CT = [
  { k: 'musical', l: 'Musical (0 = raw terrain)', min: 0, max: 1, step: .01, f: v => v.toFixed(2), a: 1 },
  { k: 'speed', l: 'Speed', min: .5, max: 2, step: .05, f: v => v.toFixed(2) + '× · ' + (S.base / v).toFixed(0) + ' s', a: 1 },
  { k: 'verb', l: 'Reverb', min: 0, max: 1, step: .01, f: v => Math.round(v * 100) + '%' },
  { k: 'vol', l: 'Volume', min: 0, max: 1, step: .01, f: v => Math.round(v * 100) + '%' },
  { k: 'exag', l: 'Vertical exaggeration', min: 1, max: 5, step: .1, f: v => v.toFixed(1) + '×' },
  { k: 'psize', l: 'Point size', min: .3, max: 3, step: .05, f: v => v.toFixed(2) },
  { k: 'glow', l: 'Glow / bloom', min: 0, max: 2.5, step: .05, f: v => v.toFixed(2) },
  { k: 'grain', l: 'Grain', min: 0, max: 1.5, step: .05, f: v => v.toFixed(2) },
];
const refs = [], panel = $('#panel');
// layout: front = preset + per-band instrument pickers + volume · Explorations (the original synth styles) · Advanced (everything else)
panel.insertAdjacentHTML('beforeend', '<div class="lead"><b id="leadname">Strata Orchestra</b><span class="note" id="leadsub"></span><button id="backorch" hidden>← Back to the orchestra</button></div><div id="front"><div id="orchui"></div></div><details id="explore"><summary>Explorations</summary><div class="dbody" id="exbody"><p class="note">The original synth versions. The notes and rapid accents stay where the canyon put them; only the sound changes.</p></div></details><details id="adv"><summary>Advanced</summary><div class="dbody" id="advbody"></div></details>');
const front = $('#front'), orchui = $('#orchui'), exbody = $('#exbody'), advbody = $('#advbody'), RO = RiverOrch;
const setPreset = (id) => { S.style = 'orch'; S.preset = id; S.inst = Object.assign({}, RO.PRESETS[id].inst); refs.forEach(f => f()); invalidate(); save(); };
$('#backorch').onclick = () => setPreset(S.preset !== 'custom' && RO.PRESETS[S.preset] ? S.preset : 'orchestra');
refs.push(() => { const nm = { canyon: 'Canyon (original synth)', edm: 'EDM (original synth)', country: 'Country (original synth)', pop: 'Pop (original synth)', strata: 'Strata (synth)' };
  const orch = S.style === 'orch'; $('#leadname').textContent = orch ? (S.preset === 'custom' ? 'Custom orchestra' : RO.PRESETS[S.preset].label) : nm[S.style];
  $('#leadsub').textContent = orch ? 'Recorded instruments, one per height band of the canyon wall' : 'Exploration: original synth style'; $('#backorch').hidden = orch; orchui.hidden = !orch; });
{ // preset row
  const r = document.createElement('div'); r.className = 'row'; r.innerHTML = '<div class="t"><span>Style</span><em></em></div><div class="seg" id="presets"></div>'; const sg = r.querySelector('.seg'), em = r.querySelector('em');
  const bs = Object.entries(RO.PRESETS).map(([id, P]) => { const b = document.createElement('button'); b.textContent = id === 'orchestra' ? 'Orchestra' : P.label; b.dataset.p = id; b.onclick = () => setPreset(id); sg.appendChild(b); return [id, b]; });
  refs.push(() => { bs.forEach(([id, b]) => b.setAttribute('aria-checked', S.style === 'orch' && S.preset === id)); em.textContent = S.preset === 'custom' ? 'custom' : S.inst.groove !== 'none' ? '84 BPM · ' + RO.GROOVE[S.inst.groove].toLowerCase() : '84 BPM'; });
  orchui.appendChild(r);
  // per-band instrument pickers (recorded VSCO 2 CE instruments only)
  const rows = [['b4', 'Band 4 · rim (1000 m+)', RO.BAND_INST[3].map(v => [v, RO.INST[v].label])], ['b3', 'Band 3 · Redwall / Supai (650–1000 m)', RO.BAND_INST[2].map(v => [v, RO.INST[v].label])],
    ['b2', 'Band 2 · Tonto / Muav (300–650 m)', RO.BAND_INST[1].map(v => [v, RO.INST[v].label])], ['b1', 'Band 1 · river / Inner Gorge (0–300 m)', RO.BAND_INST[0].map(v => [v, RO.INST[v].label])],
    ['acc', 'Rapids (accents)', Object.entries(RO.ACC)], ['groove', 'Beat', Object.entries(RO.GROOVE)]];
  const g = document.createElement('div'); g.className = 'row picks';
  for (const [k, l, list] of rows) { const w = document.createElement('label'); w.className = 'pick'; w.innerHTML = '<span></span><select></select>'; w.firstChild.textContent = l; const sel = w.querySelector('select'); sel.id = 'pick-' + k;
    for (const [v, t] of list) { const o = document.createElement('option'); o.value = v; o.textContent = t + (v === RO.DEF_INST[k] ? ' (default)' : ''); sel.appendChild(o); }
    sel.onchange = () => { S.inst[k] = sel.value; const m = Object.entries(RO.PRESETS).find(([, P]) => INST_KEYS.every(q => P.inst[q] === S.inst[q])); S.preset = m ? m[0] : 'custom'; refs.forEach(f => f()); invalidate(); save(); };
    refs.push(() => { sel.value = S.inst[k]; }); g.appendChild(w); }
  orchui.appendChild(g);
  const r4 = document.createElement('div'); r4.className = 'row'; r4.innerHTML = '<div class="note" id="orchnote"></div>';
  refs.push(() => { r4.querySelector('#orchnote').textContent = (ORC_ERR ? 'Orchestra samples could not be decoded (' + ORC_ERR + '). ' : !ORC_READY ? 'Decoding orchestra samples… ' : !ORC2_READY ? (ORC2_ERR ? 'Extra instruments could not be decoded (' + ORC2_ERR + '). ' : 'Decoding extra instruments… ') : '') +
    'All instruments are real recordings (VSCO 2 CE, CC0). Room: Jack Lyons Concert Hall IR, OpenAIR, CC BY 4.0. Changing instruments never moves a note or a rapid.'; }); orchui.appendChild(r4);
}
{ // Explorations: the original synth styles
  const r = document.createElement('div'); r.className = 'row'; r.innerHTML = '<div class="t"><span>Original synth styles</span><em></em></div><div class="seg"></div>'; const sg = r.querySelector('.seg'), em = r.querySelector('em');
  const info = { canyon: '84 BPM · minor pent', edm: '124 BPM · natural minor', country: '100 BPM · major pent', pop: '110 BPM · major', strata: '84 BPM · 4 height bands (approx.)' };
  const bs = [['canyon', 'Canyon (original)'], ['edm', 'EDM (original)'], ['country', 'Country (original)'], ['pop', 'Pop (original)'], ['strata', 'Strata (synth)']].map(([v, l]) => { const b = document.createElement('button'); b.textContent = l;
    b.onclick = () => { S.style = v; refs.forEach(f => f()); invalidate(); save(); }; sg.appendChild(b); return [v, b]; });
  refs.push(() => { bs.forEach(([v, b]) => b.setAttribute('aria-checked', S.style === v)); em.textContent = info[S.style] || ''; }); exbody.appendChild(r);
  const r3 = document.createElement('div'); r3.className = 'row'; r3.innerHTML = '<div class="t"><span>Band 3 voice (650–1000 m)</span></div><select id="b3v"><option value="brass">Brass pad (current)</option><option value="strings">Bowed strings</option><option value="mallet">Soft mallet</option><option value="cello">Cello section (recorded)</option><option value="horn">French horn (recorded)</option></select><div class="t" style="margin-top:8px"><span>Band 2 voice (300–650 m)</span></div><select id="b2v"><option value="synth">Synth pluck (current)</option><option value="pizz">Cello pizzicato (recorded)</option></select><div class="note" id="smpnote"></div>';
  const sel = r3.querySelector('#b3v'), sel2 = r3.querySelector('#b2v'); sel.onchange = () => { S.b3 = sel.value; invalidate(); save(); }; sel2.onchange = () => { S.b2 = sel2.value; invalidate(); save(); };
  refs.push(() => { r3.hidden = S.style !== 'strata'; sel.value = S.b3; sel2.value = S.b2; r3.querySelector('#smpnote').textContent = SMP_ERR ? 'Recorded samples could not be decoded (' + SMP_ERR + '); using synthetic strings instead.' : SMP_READY ? 'Recorded voices: VSCO 2 Community Edition, CC0.' : 'Decoding recorded samples…'; }); exbody.appendChild(r3); }

for (const c of CT) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = '<div class="t"><span></span><em></em></div><input type="range">';
  r.querySelector('span').textContent = c.l; const inp = r.querySelector('input'), em = r.querySelector('em'); inp.min = c.min; inp.max = c.max; inp.step = c.step;
  inp.oninput = () => { S[c.k] = parseFloat(inp.value); em.textContent = c.f(S[c.k]); if (c.a) invalidate(); if (ctx) { master.gain.value = S.vol; wet.gain.value = S.verb; } save(); };
  refs.push(() => { inp.value = S[c.k]; em.textContent = c.f(S[c.k]); }); (c.k === 'vol' ? front : advbody).appendChild(r); }
for (const [k, l] of [['orbit', 'Orbit camera (off = follow downstream)'], ['contours', 'Contour lines'], ['labels', 'Landmark labels'], ['loop', 'Loop']]) {
  const b = document.createElement('button'); b.className = 'sw'; b.innerHTML = '<span></span><i></i>'; b.firstChild.textContent = l;
  b.onclick = () => { S[k] = !S[k]; b.setAttribute('aria-checked', S[k]); if (k === 'loop') invalidate(); save(); }; refs.push(() => b.setAttribute('aria-checked', !!S[k])); advbody.appendChild(b); }
advbody.insertAdjacentHTML('beforeend', '<p class="note"><b>Stereo needle.</b> The dot rides the Colorado River downstream. Your <b>left ear</b> hears the river-left wall, your <b>right ear</b> the river-right wall (facing downstream). Each wall sets its own pitch (height above the river at 500 m and 2 km, 0 → 1,200 m maps to 110 → 880 Hz), brightness (steepness) and grainy texture (roughness). Drops in the river surface (rapids) thump in the middle. <b>Musical</b> snaps both walls to ' + SYN.rootName + ' minor pentatonic (key from the river elevation), adds plucked notes whose density follows each wall, pulls them onto 84 BPM, and adds a soft drone.</p><p class="note">The left wall glows cyan with the left channel, the right wall pink with the right; rapids send a shockwave. Drag to orbit (O toggles follow/orbit), H hides this panel, C hides captions.</p><p class="note">Data: USGS NHD river line, USGS GNIS names, USGS 3DEP terrain via AWS terrain tiles. ' + RD.marks.length + ' landmarks at their GNIS positions (Phantom Ranch sits ~0.75 km up Bright Angel Creek).</p>');
refs.forEach(f => f());
$('#play').onclick = () => setPlaying(!playing);
const seek = $('#seek'); let scrub = false;
seek.oninput = () => { scrub = true; pos = seek.value / 1000; if (playing) { stop(cur); start(pos); } }; seek.onchange = () => { scrub = false; };
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); } if (e.key === 'h') document.body.classList.toggle('nopanel'); if (e.key === 'o') { S.orbit = !S.orbit; refs.forEach(f => f()); } if (e.key === 'c') document.body.classList.toggle('clean'); });
$('#ptoggle').onclick = () => document.body.classList.toggle('nopanel');
/* ───── readout ───── */
const fm = (v) => Math.round(v).toLocaleString('en-US') + ' m';
function nearestMark(i) { let b = null; for (const m of RD.marks) if (m.i <= i + 2) b = m; return b; }
function readout(t) {
  const i = Math.min(N - 1, Math.round(t * (N - 1))), tl = TB.L, tr = TB.R, hz = (a) => Math.round(RiverSynth.create ? SYN.tab(a.pitch, t) : 0);
  $('#rP').textContent = (t * (N - 1) * RD.ds / 1000).toFixed(1) + ' km of ' + ((N - 1) * RD.ds / 1000).toFixed(0) + (nearestMark(i) ? ' · past ' + nearestMark(i).name : '');
  $('#rE').textContent = 'river ' + fm(RD.river[i]) + ' · width at +300 m ' + fm(RD.width300[i]);
  $('#rLw').textContent = 'L wall +' + fm(RD.L.h500[i]) + ' @500 m, +' + fm(RD.L.h2k[i]) + ' @2 km · ' + Math.round(RD.L.steep[i]) + '° · ' + hz(tl) + ' Hz';
  $('#rRw').textContent = 'R wall +' + fm(RD.R.h500[i]) + ' @500 m, +' + fm(RD.R.h2k[i]) + ' @2 km · ' + Math.round(RD.R.steep[i]) + '° · ' + hz(tr) + ' Hz';
  $('#time').textContent = (t * dur()).toFixed(1) + ' / ' + dur().toFixed(0) + ' s'; if (!scrub) seek.value = Math.round(t * 1000);
  $('#barL').style.width = Math.min(100, RD.L.h2k[i] / 12) + '%'; $('#barR').style.width = Math.min(100, RD.R.h2k[i] / 12) + '%';
}
/* ───── WebGL: HDR point cloud + contour mesh, bloom, film grain (pipeline ported from the rim-to-rim pages) ───── */
const canvas = $('#stage'); let gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
const GRD = RD.grid, b64 = (s) => { const b = atob(s), a = new Uint16Array(b.length >> 1); for (let i = 0; i < a.length; i++) a[i] = b.charCodeAt(2 * i) | (b.charCodeAt(2 * i + 1) << 8); return a; };
const EMIN = 650, EMAX = 2300, Y0 = 1200;
const RX = RD.x.map(v => v / 1000), RZ = RD.y.map(v => -v / 1000);
// river tangent (downstream) and per-point frame
const TX = [], TZ = []; for (let i = 0; i < N; i++) { const a = Math.max(0, i - 6), b = Math.min(N - 1, i + 6), dx = RX[b] - RX[a], dz = RZ[b] - RZ[a], l = Math.hypot(dx, dz) || 1; TX.push(dx / l); TZ.push(dz / l); }
// palette (Ember from the rim-to-rim pages); left wall tint / right wall tint
const PAL0 = [[.03,.02,.22],[.16,.08,.55],[.55,.14,.62],[.95,.42,.2],[1,.8,.4]], CL0 = [.31,.86,1], CR0 = [1,.37,.66];
const stp = () => S.style === 'canyon' || isBand() ? { pal: PAL0, cl: CL0, cr: CR0 } : RiverStyles.STYLES[S.style];
// visual accent times = the synth's accent onsets (same formula, read-only; audio untouched)
function accentTimes() { const o = opts(), beat = 60 / o.bpm, x = Math.min(Math.max((o.musical - 0.1) / 0.7, 0), 1), qa = o.style === 'canyon' ? x * x * (3 - 2 * x) : 0;   // styles keep rapids at their raw terrain times
  return SYN.accents.map(a => { const t = a.i / (N - 1) * o.dur, tq = Math.round(t / (beat / 2)) * (beat / 2); return { t: (t + (tq - t) * qa) / o.dur, i: a.i, a: Math.min(Math.max(a.d / 5, .25, ), 1.1) }; }); }
let ACC = accentTimes();
const GL_COMMON = `#version 300 es
precision highp float;
uniform mat4 uMVP; uniform float uExag; uniform vec3 uPal[5];
vec3 pal(float t){ t=clamp(t,0.,1.)*4.; int i=int(min(floor(t),3.)); return mix(uPal[i],uPal[i+1],t-float(i)); }
float wy(float e){ return (e-${Y0}.)*0.001*uExag; }
`;
const TER_VS = GL_COMMON + `
layout(location=0) in vec4 aP; layout(location=1) in vec4 aQ;   // aP: x, elev, z, slope · aQ: side(+1 L,-1 R), s (0..1 along river), dist km, rnd
uniform vec3 uDot; uniform float uS, uTime, uPxU, uPS, uLvL, uLvR, uShockAge, uShockS, uShockA, uExagX;
uniform vec3 uCL, uCR; uniform float uStrata; uniform vec4 uBand;
out vec3 vCol; out float vB;
void main(){
  vec3 w=vec3(aP.x,wy(aP.y),aP.z); gl_Position=uMVP*vec4(w,1.);
  float d0=length(aP.xz-uDot.xz);
  float near=exp(-d0*d0/1.2);                                  // light pool around the needle
  float side=aQ.x, wall=smoothstep(.12,.6,aQ.z)*(1.-smoothstep(2.4,3.2,aQ.z));
  float lv=side>0.?uLvL:uLvR;                                  // each wall reacts to its own channel
  float wallNear=exp(-pow((aQ.y-uS)*48.,2.)*0.08);            // strongest on the stretch being read
  float pulse=lv*wall*(0.1+1.5*wallNear);
  float ds=(aQ.y-uShockS)*48.;                                 // shockwave: ring expanding from the rapid
  float r=sqrt(ds*ds+aQ.z*aQ.z), ring=exp(-pow((r-uShockAge*3.2)/.22,2.))*exp(-uShockAge*2.2)*uShockA;
  float tw=0.82+0.18*sin(uTime*1.7+fract(aQ.w)*6.2831);
  vec3 base=pal((aP.y-${EMIN}.)/${EMAX - EMIN}.);
  vec3 tint=side>0.?uCL:uCR;
  vCol=base*(0.1+0.8*aP.w)*tw + tint*pulse*0.45 + base*near*0.5 + vec3(1.,.85,.7)*ring*1.6;
  if(uStrata>0.5){ float hA=floor(aQ.w)*10.;   // approximate strata bands by height above the river
    vec3 bc = hA<300. ? vec3(.35,.3,.75) : hA<650. ? vec3(.35,.75,.45) : hA<1000. ? vec3(1.,.35,.2) : vec3(1.,.9,.65);
    float bl = hA<300. ? uBand.x : hA<650. ? uBand.y : hA<1000. ? uBand.z : uBand.w;
    float edge = 1.-smoothstep(0.,14.,min(min(abs(hA-300.),abs(hA-650.)),abs(hA-1000.)));
    vCol = mix(vCol, bc*(0.12+0.8*aP.w)*tw*(0.7+1.6*bl), 0.55) + bc*edge*0.35; }
  vB=1.-smoothstep(2.6,3.2,aQ.z);
  gl_PointSize=clamp(uPS*0.045*uPxU/gl_Position.w*(0.7+0.7*aP.w)*(1.+pulse*.5+ring),1.1,16.);
}`;
const PT_FS = `#version 300 es
precision highp float; in vec3 vCol; in float vB; uniform float uInt; out vec4 o;
void main(){ vec2 c=gl_PointCoord*2.-1.; float r2=dot(c,c); if(r2>1.) discard; o=vec4(vCol*pow(1.-r2,2.)*vB*uInt,1.); }`;
// contour mesh: own shader with elevation varying
const MESH_VS = GL_COMMON + `
layout(location=0) in vec4 aP; layout(location=1) in vec4 aQ; uniform vec3 uDot; uniform float uLvL, uLvR;
out float vE; out float vG; out float vF; out float vSide;
void main(){ gl_Position=uMVP*vec4(aP.x,wy(aP.y),aP.z,1.); vE=aP.y; float d=length(aP.xz-uDot.xz); vG=exp(-d*d/1.4); vF=1.-smoothstep(2.4,3.2,aQ.z); vSide=aQ.x*(aQ.x>0.?uLvL:uLvR)*smoothstep(.12,.6,aQ.z); }`;
const CONT_FS = `#version 300 es
precision highp float; uniform vec3 uPal[5]; uniform float uLines;
vec3 pal(float t){ t=clamp(t,0.,1.)*4.; int i=int(min(floor(t),3.)); return mix(uPal[i],uPal[i+1],t-float(i)); }
in float vE; in float vG; in float vF; in float vSide; out vec4 o;
void main(){ vec3 col=pal((vE-${EMIN}.)/${EMAX - EMIN}.);
  float f=vE/40.; float fw=max(fwidth(f),1e-4); float g=abs(fract(f-.5)-.5)/fw; float minor=(1.-min(g,1.))*(1.-smoothstep(.35,.9,fw));
  float f2=f/5.; float fw2=max(fwidth(f2),1e-4); float g2=abs(fract(f2-.5)-.5)/fw2; float major=(1.-min(g2,1.))*(1.-smoothstep(.35,.9,fw2));
  float line=(minor*.42+major*.95)*uLines; o=vec4(col*(line*(0.45+vG*0.9+abs(vSide)*0.6)+0.006+vG*0.012)*vF,1.); }`;
const SPR_VS = GL_COMMON + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in float aSz; layout(location=3) in float aS;
uniform float uS, uDpr; out vec3 vC;
void main(){ gl_Position=uMVP*vec4(aPos.x,wy(aPos.y),aPos.z,1.);
  float dl=uS-aS; float tr=aS<0.?1.:(dl>=0.?exp(-dl*60.):exp(-dl*dl*40000.));   // bright at the needle, glowing trail behind it
  float k=aS<0.?1.:0.1+1.3*tr; vC=aCol.rgb*aCol.a*k; gl_PointSize=min(aSz*uDpr*(aS<0.?1.:1.+1.6*tr),70.); }`;
const SPR_FS = `#version 300 es
precision highp float; in vec3 vC; out vec4 o;
void main(){ vec2 c=gl_PointCoord*2.-1.; float r2=dot(c,c); if(r2>1.) discard; o=vec4(vC*pow(1.-r2,1.6),1.); }`;
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
precision highp float; uniform sampler2D uH, uB; uniform float uGlow, uGrain, uTime, uAsp, uFlash; uniform vec2 uRes; in vec2 uv; out vec4 o;
float h(vec2 p){ p=fract(p*vec2(443.897,441.423)); p+=dot(p,p.yx+19.19); return fract((p.x+p.y)*p.x); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
void main(){
  vec3 c=texture(uH,uv).rgb+texture(uB,uv).rgb*uGlow*(0.6+uFlash*0.9);
  c=aces(c*(1.+uFlash*0.25));
  float d=length((uv-.5)*vec2(uAsp,1.)); c*=smoothstep(1.25,.25,d)*.9+.1;
  c=pow(c,vec3(1./2.2));
  float n=h(uv*uRes+fract(uTime*.37)*91.7)-.5; c+=n*uGrain*.07*(.25+dot(c,vec3(.33)));
  o=vec4(max(c,0.),1.); }`;
let P = {}, hdr = true, W = 1, H = 1, dpr = 1, ST = null, bloom = [], vaoT, vaoR, vaoP, bufP, nT = 0, nIdx = 0, vaoEmpty, dynData;
const PH_BEAM = 40;
function prog(vs, fs, name) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ' link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
function mkTex(w, h, f) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  if (f) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; }
function mkTarget(w, h, depth) { const tex = mkTex(w, h, hdr), fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rb = null; if (depth) { rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); }
  return { tex, fb, rb, w, h, ok: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE }; }
function freeT(t) { if (!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.rb) gl.deleteRenderbuffer(t.rb); }
function buildTargets() { freeT(ST); bloom.forEach(freeT); bloom = []; ST = mkTarget(W, H, true); if (!ST.ok && hdr) { hdr = false; freeT(ST); ST = mkTarget(W, H, true); }
  for (let i = 1; i <= 6; i++) bloom.push(mkTarget(Math.max(2, W >> i), Math.max(2, H >> i), false)); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
function resize() { dpr = Math.min(devicePixelRatio || 1, 2); const cw = innerWidth, ch = innerHeight; if (cw * ch * dpr * dpr > 4.2e6) dpr = Math.sqrt(4.2e6 / (cw * ch));
  W = canvas.width = Math.max(2, Math.round(cw * dpr)); H = canvas.height = Math.max(2, Math.round(ch * dpr)); if (gl) buildTargets(); }
function initGL() {
  hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  P.pts = prog(TER_VS, PT_FS, 'points'); P.mesh = prog(MESH_VS, CONT_FS, 'contours'); P.spr = prog(SPR_VS, SPR_FS, 'sprites');
  P.down = prog(FS_VS, DOWN_FS, 'down'); P.up = prog(FS_VS, UP_FS, 'up'); P.comp = prog(FS_VS, COMP_FS, 'composite');
  const G = b64(GRD.data), RI = b64(GRD.ridx), gu = GRD.GU, gv = GRD.GV, cw = GRD.w / (gu - 1), chh = GRD.h / (gv - 1), E = (i, j) => G[j * gu + i] / GRD.sc + GRD.off;
  const map = new Int32Array(gu * gv).fill(-1); let cnt = 0; for (let k = 0; k < gu * gv; k++) if (G[k] !== 65535) map[k] = cnt++;
  const V = new Float32Array(cnt * 8); let n = 0, rr = 1;
  for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) { const k = j * gu + i; if (map[k] < 0) continue; const ri = RI[map[k]], o = map[k] * 8;
    const e = E(i, j), ip = Math.min(i + 1, gu - 1), im = Math.max(i - 1, 0), jp = Math.min(j + 1, gv - 1), jm = Math.max(j - 1, 0);
    const ok = (a, b) => G[b * gu + a] !== 65535 ? E(a, b) : e, sl = Math.min(1, Math.hypot((ok(ip, j) - ok(im, j)) / ((ip - im) * cw), (ok(i, jp) - ok(i, jm)) / ((jp - jm) * chh)) / 1.5);
    const x = (-GRD.w / 2 + i * cw) / 1000, z = -(-GRD.h / 2 + j * chh) / 1000, ddx = x - RX[ri], ddz = z - RZ[ri];
    const side = (TX[ri] * ddz - TZ[ri] * ddx) < 0 ? 1 : -1;   // left of the downstream tangent (world z = -north)
    rr = (rr * 16807) % 2147483647;
    V.set([x, e, z, sl, side, ri / (N - 1), Math.hypot(ddx, ddz), rr / 2147483647 * 0.999 + Math.round(Math.min(Math.max(e - RD.river[ri], 0), 2500) / 10)], o); }   // w: int part = height above river /10 m, frac = twinkle seed
  nT = cnt;
  const IX = []; for (let j = 0; j < gv - 1; j++) for (let i = 0; i < gu - 1; i++) { const a = map[j * gu + i], b = map[j * gu + i + 1], c = map[(j + 1) * gu + i], d = map[(j + 1) * gu + i + 1];
    if (a >= 0 && b >= 0 && c >= 0 && d >= 0) IX.push(a, c, b, b, c, d); }
  nIdx = IX.length;
  vaoT = gl.createVertexArray(); gl.bindVertexArray(vaoT); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(IX), gl.STATIC_DRAW);
  const attrs = () => { gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 36, 28); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32); };
  // glowing river line: dense points interpolated along the centreline
  const ND = 4000, L = new Float32Array(ND * 9);
  for (let k = 0; k < ND; k++) { const f = k / (ND - 1) * (N - 1), i = Math.min(N - 2, f | 0), u = f - i, m = f / (N - 1);
    L.set([RX[i] + (RX[i + 1] - RX[i]) * u, RD.river[i] + (RD.river[i + 1] - RD.river[i]) * u + 6, RZ[i] + (RZ[i + 1] - RZ[i]) * u, .35 + .3 * m, .8 - .1 * m, 1, .8, 3.0, m], k * 9); }
  vaoR = gl.createVertexArray(); gl.bindVertexArray(vaoR); const lb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lb); gl.bufferData(gl.ARRAY_BUFFER, L, gl.STATIC_DRAW); attrs(); vaoR.n = ND;
  dynData = new Float32Array((PH_BEAM + 2) * 9); vaoP = gl.createVertexArray(); gl.bindVertexArray(vaoP); bufP = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.bufferData(gl.ARRAY_BUFFER, dynData, gl.DYNAMIC_DRAW); attrs();
  gl.bindVertexArray(null); vaoEmpty = gl.createVertexArray();
}
/* ───── camera: cinematic follow (behind the needle, looking downstream) or free orbit ───── */
const mat = {
  persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2), r = 1 / (n - fa); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + fa) * r, -1, 0, 0, 2 * n * fa * r, 0]); },
  look(e, c) { let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(...z); z = z.map(v => v / l); let x = [z[2], 0, -z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]); },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
};
const cam = { yaw: 0, pitch: .42, dist: 6.5, vy: 0, vp: 0, tx: RX[0], ty: 0, tz: RZ[0], ex: null, ey: 0, ez: 0, sway: 0 };
let intro = 0, MVP = null;
const labels = RD.marks.map(m => { const d = document.createElement('div'); d.className = 'lbl' + (m.kind === 'place' ? ' place' : ''); d.innerHTML = '<b></b><i></i>';
  d.firstChild.textContent = m.name; d.lastChild.textContent = m.kind === 'place' ? m.note : 'km ' + (m.i * RD.ds / 1000).toFixed(1); $('#labels').appendChild(d); return { m, d }; });
function proj(x, y, z) { const m = MVP, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return cw <= 0.05 ? null : [(cx / cw * .5 + .5) * innerWidth, (1 - (cy / cw * .5 + .5)) * innerHeight, cw]; }
/* per-channel level straight from the rendered buffer (no change to the audio graph) */
let ENV = null; const ENVR = 120;
function computeEnv(b) { const L = b.getChannelData(0), R = b.getChannelData(1), hop = Math.floor(b.sampleRate / ENVR), n = Math.floor(L.length / hop), eL = new Float32Array(n), eR = new Float32Array(n);
  for (let k = 0; k < n; k++) { let a = 0, c = 0; for (let i = k * hop; i < (k + 1) * hop; i += 4) { a += L[i] * L[i]; c += R[i] * R[i]; } eL[k] = Math.sqrt(a / (hop / 4)); eR[k] = Math.sqrt(c / (hop / 4)); }
  ENV = { eL, eR, n }; ACC = accentTimes(); }
let lvL = 0, lvR = 0, lt = 0, flash = 0; const BL4 = [0, 0, 0, 0];
const drag = { on: false }, ptrs = new Map(); let pinch0 = 0;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(.05, (now - (lt || now)) / 1000); lt = now;
  let t = pos; if (playing && cur && !scrub) { t = curPos(); pos = t; }
  if (playing && ENV) { const k = Math.min(ENV.n - 1, Math.floor(t * ENV.n)); lvL += (Math.min(1, ENV.eL[k] * 3.2) - lvL) * .3; lvR += (Math.min(1, ENV.eR[k] * 3.2) - lvR) * .3; } else { lvL *= .92; lvR *= .92; }
  $('#barL').style.opacity = .4 + lvL; $('#barR').style.opacity = .4 + lvR;
  { const show = isBand(); $('#strata').hidden = !show;
    if (show && BLAB.s !== S.style + JSON.stringify(S.inst)) { BLAB.s = S.style + JSON.stringify(S.inst); document.querySelectorAll('#strata .sr span').forEach((el, j) => { const k = 3 - j; if (!BLAB.o[k]) BLAB.o[k] = el.textContent; el.textContent = S.style === 'orch' ? BLAB.o[k].replace(/·.*$/, '· ' + RiverOrch.INST[S.inst['b' + (k + 1)]].label.toLowerCase()) : BLAB.o[k]; }); }
    if (show) for (let k = 0; k < 4; k++) { const v = playing && BANDENV ? BANDENV.e[k][Math.min(BANDENV.n - 1, Math.floor(t * BANDENV.n))] * (0.5 + Math.max(lvL, lvR)) : 0; BL4[k] += (v - BL4[k]) * .25; $('#sb' + k).style.width = Math.min(100, BL4[k] * 100) + '%'; } }
  readout(t); if (!gl) return;
  const fi = t * (N - 1), i0 = Math.min(N - 2, fi | 0), f = fi - i0, dx = RX[i0] + (RX[i0 + 1] - RX[i0]) * f, dz = RZ[i0] + (RZ[i0 + 1] - RZ[i0]) * f, de = RD.river[i0] + (RD.river[i0 + 1] - RD.river[i0]) * f;
  // most recent rapid accent
  let sh = null; for (const a of ACC) if (a.t <= t + 1e-4) sh = a; const shAge = sh ? (t - sh.t) * dur() : 99; flash = sh && playing ? Math.max(0, 1 - shAge / .35) * sh.a * .7 : flash * .9;
  intro = Math.min(1, intro + dt / 2.6); const ei = 1 - Math.pow(1 - intro, 3);
  const wy = (e) => (e - Y0) * .001 * S.exag, k = 1 - Math.pow(.04, dt), dyw = wy(de);
  if (!S.orbit) {   // follow: sit behind & above the needle, look ~2 km downstream, slow sway
    const j = Math.min(N - 1, i0 + 40), ja = Math.max(0, i0 - 10), hx = RX[j] - RX[ja], hz = RZ[j] - RZ[ja], hl = Math.hypot(hx, hz) || 1; cam.sway += dt * .23;
    const back = 3.4 * (1 + (1 - ei) * 2), sw = Math.sin(cam.sway) * .35, ux = hx / hl, uz = hz / hl;
    const ex = dx - ux * back - uz * sw * back, ez = dz - uz * back + ux * sw * back, ey = dyw + 1.35 + (1 - ei) * 3;
    if (cam.ex === null) { cam.ex = ex; cam.ey = ey; cam.ez = ez; }
    cam.ex += (ex - cam.ex) * k; cam.ey += (ey - cam.ey) * k; cam.ez += (ez - cam.ez) * k;
    const tx = dx + ux * 2.2, tz = dz + uz * 2.2; cam.tx += (tx - cam.tx) * k * 1.5; cam.tz += (tz - cam.tz) * k * 1.5; cam.ty += (dyw + .15 - cam.ty) * k;
    cam.yaw = Math.atan2(cam.ex - cam.tx, cam.ez - cam.tz);
  } else {          // orbit around the needle with inertia + slow auto-rotate (rim-to-rim feel)
    if (!drag.on) { cam.yaw += cam.vy * dt * 60; cam.pitch += cam.vp * dt * 60; cam.vy *= Math.pow(.93, dt * 60); cam.vp *= Math.pow(.93, dt * 60); if (Math.abs(cam.vy) < .002) cam.yaw += dt * .05; }
    cam.pitch = Math.min(Math.max(cam.pitch, .06), 1.52); cam.dist = Math.min(Math.max(cam.dist, 1.5), 60);
    cam.tx += (dx - cam.tx) * k; cam.tz += (dz - cam.tz) * k; cam.ty += (dyw - cam.ty) * k; const ds = cam.dist * (1 + (1 - ei) * .9), cp = Math.cos(cam.pitch);
    cam.ex = cam.tx + ds * cp * Math.sin(cam.yaw); cam.ey = cam.ty + ds * Math.sin(cam.pitch); cam.ez = cam.tz + ds * cp * Math.cos(cam.yaw);
  }
  const fov = .82, asp = W / H, shift = (!document.body.classList.contains('nopanel') && innerWidth > 760) ? -0.18 * Math.min(1, 1100 / innerWidth) : 0;
  MVP = mat.mul(mat.persp(fov, asp, .03, 200), mat.look([cam.ex, cam.ey, cam.ez], [cam.tx, cam.ty, cam.tz])); MVP = mat.mul(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, shift,0,0,1]), MVP);
  const pxU = H / (2 * Math.tan(fov / 2)), palF = new Float32Array(15); stp().pal.forEach((c, i) => palF.set(c, i * 3));
  const common = (pr) => { gl.uniformMatrix4fv(pr.u.uMVP, false, MVP); gl.uniform1f(pr.u.uExag, S.exag); if (pr.u.uPal) gl.uniform3fv(pr.u.uPal, palF); };
  gl.bindFramebuffer(gl.FRAMEBUFFER, ST.fb); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 1.5); gl.disable(gl.BLEND); gl.bindVertexArray(vaoT);
  gl.useProgram(P.mesh.p); common(P.mesh); gl.uniform3f(P.mesh.u.uDot, dx, 0, dz); gl.uniform1f(P.mesh.u.uLvL, lvL); gl.uniform1f(P.mesh.u.uLvR, lvR); gl.uniform1f(P.mesh.u.uLines, 0);
  gl.colorMask(false, false, false, false); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0); gl.colorMask(true, true, true, true);   // depth-only occluder
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  if (S.contours) { gl.uniform1f(P.mesh.u.uLines, 1); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0); }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  const pp = P.pts, u = pp.u; gl.useProgram(pp.p); common(pp);
  gl.uniform3f(u.uDot, dx, 0, dz); gl.uniform1f(u.uS, t); gl.uniform1f(u.uTime, now / 1000); gl.uniform1f(u.uPxU, pxU); gl.uniform1f(u.uPS, S.psize); gl.uniform1f(u.uLvL, lvL); gl.uniform1f(u.uLvR, lvR);
  gl.uniform1f(u.uShockAge, shAge); gl.uniform1f(u.uShockS, sh ? sh.i / (N - 1) : -9); gl.uniform1f(u.uShockA, sh ? sh.a : 0); gl.uniform3fv(u.uCL, stp().cl); gl.uniform3fv(u.uCR, stp().cr); gl.uniform1f(u.uStrata, isBand() ? 1 : 0); gl.uniform4f(u.uBand, BL4[0], BL4[1], BL4[2], BL4[3]); gl.uniform1f(u.uInt, S.contours ? .6 : .85);
  gl.drawArrays(gl.POINTS, 0, nT);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(P.spr.p); common(P.spr); gl.uniform1f(P.spr.u.uS, t); gl.uniform1f(P.spr.u.uDpr, dpr); gl.bindVertexArray(vaoR); gl.drawArrays(gl.POINTS, 0, vaoR.n);
  // needle: faint vertical beam, halo, white core (pulses with both channels)
  const lv = Math.max(lvL, lvR), top = de + 1400, bot = de - 60; let o = 0;
  for (let i = 0; i < PH_BEAM; i++) { const fy = i / (PH_BEAM - 1), y = bot + (top - bot) * fy, a = .1 + .5 * Math.exp(-Math.pow((y - de) / 350, 2)); dynData.set([dx, y, dz, .55, .8, 1, a * .7, 2.4, -1], o); o += 9; }
  dynData.set([dx, de + 10, dz, .75, .9, 1, 1.1 + lv * 1.6 + flash, 26 + lv * 38 + flash * 30, -1], o); o += 9; dynData.set([dx, de + 10, dz, 1, 1, 1, 1.2, 9 + lv * 9, -1], o);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dynData); gl.bindVertexArray(vaoP); gl.drawArrays(gl.POINTS, 0, PH_BEAM + 2);
  gl.bindVertexArray(vaoEmpty); gl.depthMask(true); gl.disable(gl.BLEND);
  const drawFS = (prg, src, dst, ex) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H); gl.useProgram(prg.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(prg.u.uT, 0); if (ex) ex(); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  drawFS(P.down, ST, bloom[0], () => { gl.uniform2f(P.down.u.uO, 1 / W, 1 / H); gl.uniform1f(P.down.u.uFirst, 1); });
  for (let i = 1; i < bloom.length; i++) drawFS(P.down, bloom[i - 1], bloom[i], () => { gl.uniform2f(P.down.u.uO, 1 / bloom[i - 1].w, 1 / bloom[i - 1].h); gl.uniform1f(P.down.u.uFirst, 0); });
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = bloom.length - 1; i > 0; i--) drawFS(P.up, bloom[i], bloom[i - 1], () => gl.uniform2f(P.up.u.uO, 1 / bloom[i].w, 1 / bloom[i].h));
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(P.comp.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ST.tex); gl.uniform1i(P.comp.u.uH, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloom[0].tex); gl.uniform1i(P.comp.u.uB, 1);
  gl.uniform1f(P.comp.u.uGlow, S.glow); gl.uniform1f(P.comp.u.uGrain, S.grain); gl.uniform1f(P.comp.u.uTime, now / 1000); gl.uniform1f(P.comp.u.uAsp, asp); gl.uniform2f(P.comp.u.uRes, W, H); gl.uniform1f(P.comp.u.uFlash, flash);
  gl.drawArrays(gl.TRIANGLES, 0, 3); gl.activeTexture(gl.TEXTURE0);
  for (const L of labels) { const p = S.labels && proj(RX[L.m.i], wy(RD.river[L.m.i] + 40), RZ[L.m.i]);
    if (!p || p[2] > 14 || p[0] < -50 || p[0] > innerWidth + 50) { L.d.style.visibility = 'hidden'; continue; }
    L.d.style.visibility = 'visible'; L.d.style.opacity = Math.max(.2, Math.min(1, 9 / p[2])); L.d.style.transform = `translate(${p[0].toFixed(0)}px,${p[1].toFixed(0)}px)`; }
}
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag.on = true; cam.vy = cam.vp = 0;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
canvas.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId), ddx = e.clientX - p[0], ddy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { if (!S.orbit) { S.orbit = true; refs.forEach(f => f()); cam.dist = Math.hypot(cam.ex - cam.tx, cam.ez - cam.tz) + 1; cam.pitch = .45; }
    cam.yaw -= ddx * .0055; cam.pitch += ddy * .0045; cam.vy = -ddx * .0055 * .6; cam.vp = ddy * .0045 * .6; }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) cam.dist *= pinch0 / d; pinch0 = d; } });
const upP = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) drag.on = false; pinch0 = 0; };
canvas.addEventListener('pointerup', upP); canvas.addEventListener('pointercancel', upP);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!S.orbit) { S.orbit = true; refs.forEach(f => f()); cam.dist = 6; } cam.dist *= Math.exp(e.deltaY * .0011); }, { passive: false });
addEventListener('resize', resize);
try { if (!gl) throw new Error('WebGL 2 is not available, so the 3D view is off. Sound still works.'); initGL(); resize(); }
catch (e) { console.error(e); gl = null; $('#msg').hidden = false; $('#msg').textContent = 'The 3D view could not start (' + e.message + '). Sound still works.'; }
$('#cap-info').textContent = RD.name + ' · ' + ((N - 1) * RD.ds / 1000).toFixed(0) + ' km · river ' + Math.round(RD.river[0]) + ' → ' + Math.round(RD.river[N - 1]) + ' m · key ' + SYN.rootName + ' minor pentatonic';
window.__river = { T: () => window.__T, cache: () => [...CACHE.values()].map(e => ({ o: e.o, done: e.done, n: e.n, full: !!e.buf })), cur: () => E && { o: E.o, done: E.done, n: E.n, full: !!E.buf, rms: (() => { const L = E.buf ? E.buf.getChannelData(0) : E.job && E.job.L; if (!L) return null; let a = 0, m = Math.min(E.done, L.length); for (let i = 0; i < m; i += 7) a += L[i] * L[i]; return Math.sqrt(a / (m / 7)); })() }, orch: () => ({ ready: ORC_READY, err: ORC_ERR, render: (o, sr) => ORC.render(o, sr) }), setPlaying: (p) => setPlaying(p), S: () => S, audio: () => ({ state: ctx && ctx.state, playing, pos: curPos(), status: snd.textContent, dur: buf && buf.duration }), nT: () => nT, hdr: () => hdr, lv: () => [lvL, lvR], seekTo: (x) => { pos = x; if (playing) { stop(cur); start(pos); } } };
requestAnimationFrame(frame);
})();
