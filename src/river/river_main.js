(() => {
'use strict';
const $ = (s) => document.querySelector(s), RD = RIVER, N = RD.N, SYN = RiverSynth.create(RD);
const KEY = 'canyon-river-v1', DEF = { musical: 0.6, speed: 1, base: 75, vol: 0.9, verb: 0.25, exag: 2, follow: true, loop: true, labels: true };
let S = Object.assign({}, DEF); try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
for (const k of ['musical', 'speed', 'vol', 'verb', 'exag']) if (!Number.isFinite(S[k])) S[k] = DEF[k];
S.musical = Math.min(Math.max(S.musical, 0), 1); S.speed = Math.min(Math.max(S.speed, 0.5), 2); S.base = 75;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const dur = () => S.base / S.speed;
const opts = () => ({ dur: dur(), musical: S.musical, bpm: 84, lo: 110, hi: 880 });
let TB = SYN.tables(opts());
/* ───── audio (pre-rendered AudioBuffer; Safari: context created/resumed inside the click) ───── */
let ctx = null, master, wet, buf = null, dirty = true, cur = null, playing = false, pos = 0, analyser, ana, level = 0;
const snd = $('#snd'), setSnd = (k, m) => { snd.dataset.k = k; snd.textContent = 'sound: ' + m; };
function initAudio() {
  if (ctx) return true; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { setSnd('error', 'no Web Audio in this browser'); return false; }
  ctx = new AC(); master = ctx.createGain(); master.gain.value = S.vol;
  const conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let y = 0; for (let i = 0; i < len; i++) { y += ((Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) - y) * 0.3; d[i] = y; } }
  conv.buffer = ir; wet = ctx.createGain(); wet.gain.value = S.verb; conv.connect(wet); wet.connect(master); master._conv = conv;
  analyser = ctx.createAnalyser(); analyser.fftSize = 1024; ana = new Float32Array(1024); master.connect(analyser); master.connect(ctx.destination);
  const ub = ctx.createBuffer(1, 1, 22050), us = ctx.createBufferSource(); us.buffer = ub; us.connect(ctx.destination); us.start(0);
  ctx.onstatechange = () => { if (playing && ctx.state !== 'running') setSnd('blocked', 'browser paused audio (' + ctx.state + '), press play again'); };
  return true;
}
function ensureBuf() {
  if (buf && !dirty && buf.sampleRate === ctx.sampleRate) return buf;
  setSnd('busy', 'rendering…'); const r = SYN.render(opts(), ctx.sampleRate), b = ctx.createBuffer(2, r.L.length, ctx.sampleRate);
  b.getChannelData(0).set(r.L); b.getChannelData(1).set(r.R); buf = b; dirty = false; return b;
}
function start(off) {
  const b = ensureBuf(), s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = !!S.loop; s.connect(g); g.connect(master); g.connect(master._conv);
  const now = ctx.currentTime, o = Math.min(Math.max(off, 0), 0.9999) * b.duration; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + 0.03);
  const c = { s, g, t0: now, o, d: b.duration, loop: s.loop }; s.onended = () => { if (cur === c) { cur = null; playing = false; pos = 0; syncPlay(); setSnd('ready', 'ready'); } };
  s.start(now, o); cur = c; setSnd('playing', 'playing · ' + ctx.sampleRate / 1000 + ' kHz');
}
function stop(c) { if (!c) return; try { c.s.onended = null; const n = ctx.currentTime; c.g.gain.setValueAtTime(c.g.gain.value, n); c.g.gain.linearRampToValueAtTime(0, n + 0.04); c.s.stop(n + 0.06); } catch (e) {} }
function curPos() { if (!cur) return pos; const x = (cur.o + ctx.currentTime - cur.t0) / cur.d; return cur.loop ? x - Math.floor(x) : Math.min(x, 0.9999); }
function setPlaying(p) {
  try {
    if (p) { if (!initAudio()) return; if (ctx.state !== 'running') ctx.resume(); if (pos >= 0.9999) pos = 0; stop(cur); cur = null; start(pos); playing = true; }
    else if (playing) { pos = curPos(); stop(cur); cur = null; playing = false; setSnd('ready', 'paused'); }
  } catch (e) { console.error(e); playing = false; setSnd('error', e.message || String(e)); }
  syncPlay();
}
let rt = 0; function invalidate() { dirty = true; buf = null; TB = SYN.tables(opts()); clearTimeout(rt); rt = setTimeout(() => { if (playing) { const t = curPos(); stop(cur); try { start(t); } catch (e) { setSnd('error', e.message); } } }, 150); }
function syncPlay() { $('#pico').setAttribute('d', playing ? 'M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z' : 'M3 1.5v11l9-5.5z'); if (playing) $('#hint').hidden = true; }
/* ───── controls ───── */
const CT = [
  { k: 'musical', l: 'Musical (0 = raw terrain)', min: 0, max: 1, step: .01, f: v => v.toFixed(2), a: 1 },
  { k: 'speed', l: 'Speed', min: .5, max: 2, step: .05, f: v => v.toFixed(2) + '× · ' + (S.base / v).toFixed(0) + ' s', a: 1 },
  { k: 'verb', l: 'Reverb', min: 0, max: 1, step: .01, f: v => Math.round(v * 100) + '%' },
  { k: 'vol', l: 'Volume', min: 0, max: 1, step: .01, f: v => Math.round(v * 100) + '%' },
  { k: 'exag', l: 'Vertical exaggeration', min: 1, max: 5, step: .1, f: v => v.toFixed(1) + '×' },
];
const refs = [], panel = $('#panel');
for (const c of CT) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = '<div class="t"><span></span><em></em></div><input type="range">';
  r.querySelector('span').textContent = c.l; const inp = r.querySelector('input'), em = r.querySelector('em'); inp.min = c.min; inp.max = c.max; inp.step = c.step;
  inp.oninput = () => { S[c.k] = parseFloat(inp.value); em.textContent = c.f(S[c.k]); if (c.a) invalidate(); if (ctx) { master.gain.value = S.vol; wet.gain.value = S.verb; } save(); };
  refs.push(() => { inp.value = S[c.k]; em.textContent = c.f(S[c.k]); }); panel.appendChild(r); }
for (const [k, l] of [['follow', 'Camera follows the dot'], ['labels', 'Landmark labels'], ['loop', 'Loop']]) {
  const b = document.createElement('button'); b.className = 'sw'; b.innerHTML = '<span></span><i></i>'; b.firstChild.textContent = l;
  b.onclick = () => { S[k] = !S[k]; b.setAttribute('aria-checked', S[k]); if (k === 'loop') invalidate(); save(); }; refs.push(() => b.setAttribute('aria-checked', !!S[k])); panel.appendChild(b); }
panel.insertAdjacentHTML('beforeend', '<p class="note"><b>Stereo needle.</b> The dot rides the Colorado River downstream. Your <b>left ear</b> hears the river-left wall, your <b>right ear</b> the river-right wall (facing downstream). Each wall sets its own pitch (height above the river at 500 m and 2 km, 0 → 1,200 m maps to 110 → 880 Hz), brightness (steepness) and grainy texture (roughness). Drops in the river surface (rapids) thump in the middle. <b>Musical</b> snaps both walls to ' + SYN.rootName + ' minor pentatonic (key from the river elevation), adds plucked notes whose density follows each wall, pulls them onto 84 BPM, and adds a soft drone.</p><p class="note">Data: USGS NHD river line, USGS GNIS names, USGS 3DEP terrain via AWS terrain tiles. ' + RD.marks.length + ' landmarks at their GNIS positions (Phantom Ranch sits ~0.75 km up Bright Angel Creek).</p>');
refs.forEach(f => f());
$('#play').onclick = () => setPlaying(!playing);
const seek = $('#seek'); let scrub = false;
seek.oninput = () => { scrub = true; pos = seek.value / 1000; if (playing) { stop(cur); start(pos); } }; seek.onchange = () => { scrub = false; };
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); } if (e.key === 'h') document.body.classList.toggle('nopanel'); });
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
/* ───── WebGL: terrain strip as glowing points, river line, dot ───── */
const canvas = $('#stage'); let gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
const GRD = RD.grid, b64 = (s) => { const b = atob(s), a = new Uint16Array(b.length >> 1); for (let i = 0; i < a.length; i++) a[i] = b.charCodeAt(2 * i) | (b.charCodeAt(2 * i + 1) << 8); return a; };
const EMIN = 600, EMAX = 2400, Y0 = 700, wy = (e) => (e - Y0) / 1000;
const VS = `#version 300 es
layout(location=0) in vec4 a; uniform mat4 M; uniform float X, P, Dpr; uniform vec3 D; out float vE; out float vG; out float vK;
void main(){ vec3 w=vec3(a.x,(a.y-${Y0}.)/1000.*X,a.z); gl_Position=M*vec4(w,1.); vE=a.y; vK=a.w;
  float d=length(a.xz-D.xz); vG=exp(-d*d/0.5);
  gl_PointSize = a.w>2.5 ? P*Dpr : clamp((a.w>1.5?3.:2.4)*Dpr*14./gl_Position.w, 1.5, 12.); }`;
const FS = `#version 300 es
precision highp float; in float vE; in float vG; in float vK; uniform float T; out vec4 o;
vec3 pal(float t){ t=clamp(t,0.,1.); return mix(mix(vec3(.05,.03,.25),vec3(.55,.15,.6),smoothstep(0.,.35,t)),mix(vec3(.95,.45,.2),vec3(1.,.85,.5),smoothstep(.6,1.,t)),smoothstep(.3,.7,t)); }
void main(){ vec2 c=gl_PointCoord*2.-1.; float r=dot(c,c); if(r>1.) discard; float f=pow(1.-r,2.);
  vec3 col; if(vK>2.5) col=vec3(1.)*1.4; else if(vK>1.5) col=vec3(.3,.85,1.)*(0.5+1.5*vG); else col=pal((vE-${EMIN}.)/${EMAX - EMIN}.)*(0.55+1.4*vG)*(0.45+1.1*vK)*1.6;
  o=vec4(col*f,1.); }`;
let prog, U = {}, nT = 0, vaoT, vaoR, vaoD, bufD;
const RX = RD.x.map(v => v / 1000), RZ = RD.y.map(v => -v / 1000);
function initGL() {
  const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
  prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  for (const n of ['M', 'X', 'P', 'Dpr', 'D', 'T']) U[n] = gl.getUniformLocation(prog, n);
  const G = b64(GRD.data), V = [], gu = GRD.GU, gv = GRD.GV, E = (i, j) => G[j * gu + i] / GRD.sc + GRD.off;
  for (let j = 1; j < gv - 1; j++) for (let i = 1; i < gu - 1; i++) { if (G[j * gu + i] === 65535) continue;
    const sl = Math.min(1, Math.hypot(E(i + 1, j) - E(i - 1, j), E(i, j + 1) - E(i, j - 1)) / (4 * GRD.w / (gu - 1)));
    V.push((-GRD.w / 2 + i * GRD.w / (gu - 1)) / 1000, E(i, j), -(-GRD.h / 2 + j * GRD.h / (gv - 1)) / 1000, sl); }
  nT = V.length / 4; const up = (arr) => { const v = gl.createVertexArray(); gl.bindVertexArray(v); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); return [v, b]; };
  [vaoT] = up(V); const R = []; for (let i = 0; i < N; i++) R.push(RX[i], RD.river[i] + 8, RZ[i], 2); [vaoR] = up(R); [vaoD, bufD] = up([0, 0, 0, 3]);
}
const cam = { yaw: 0.6, pitch: 0.55, dist: 9, tx: 0, tz: 0 };
const persp = (f, a, n, fa) => { const t = 1 / Math.tan(f / 2), r = 1 / (n - fa); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + fa) * r, -1, 0, 0, 2 * n * fa * r, 0]; };
function look(e, c) { let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(...z); z = z.map(v => v / l); let x = [z[2], 0, -z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]; }
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
let M = null, W = 1, H = 1, dpr = 1;
function resize() { dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.width = Math.round(innerWidth * dpr); H = canvas.height = Math.round(innerHeight * dpr); }
const labels = RD.marks.map(m => { const d = document.createElement('div'); d.className = 'lbl' + (m.kind === 'place' ? ' place' : ''); d.innerHTML = '<b></b><i></i>';
  d.firstChild.textContent = m.name; d.lastChild.textContent = m.kind === 'place' ? m.note : 'km ' + (m.i * RD.ds / 1000).toFixed(1); $('#labels').appendChild(d); return { m, d }; });
function proj(x, y, z) { const cx = M[0] * x + M[4] * y + M[8] * z + M[12], cy = M[1] * x + M[5] * y + M[9] * z + M[13], cw = M[3] * x + M[7] * y + M[11] * z + M[15];
  return cw <= 0.01 ? null : [(cx / cw * .5 + .5) * innerWidth, (1 - (cy / cw * .5 + .5)) * innerHeight, cw]; }
let lt = 0;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(.05, (now - (lt || now)) / 1000); lt = now;
  let t = pos; if (playing && cur && !scrub) { t = curPos(); pos = t; }
  if (analyser && playing) { analyser.getFloatTimeDomainData(ana); let s = 0; for (const v of ana) s += v * v; level += (Math.min(1, Math.sqrt(s / ana.length) * 2.5) - level) * .2; } else level *= .9;
  readout(t); if (!gl) return;
  const fi = t * (N - 1), i0 = Math.min(N - 2, fi | 0), f = fi - i0, dx = RX[i0] + (RX[i0 + 1] - RX[i0]) * f, dz = RZ[i0] + (RZ[i0 + 1] - RZ[i0]) * f, de = RD.river[i0] + (RD.river[i0 + 1] - RD.river[i0]) * f;
  const k = 1 - Math.pow(0.02, dt);
  if (S.follow) { cam.tx += (dx - cam.tx) * k; cam.tz += (dz - cam.tz) * k; const j = Math.min(N - 1, i0 + 15), hd = Math.atan2(RX[j] - RX[i0], RZ[j] - RZ[i0]) + Math.PI; let dy = hd - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); if (!drag) cam.yaw += dy * k * 0.5; }
  else { cam.tx += (0 - cam.tx) * k; cam.tz += (0 - cam.tz) * k; }
  const dist = S.follow ? cam.dist : Math.max(cam.dist, 26), ty = wy(de) * S.exag + 0.2, cp = Math.cos(cam.pitch), e = [cam.tx + dist * cp * Math.sin(cam.yaw), ty + dist * Math.sin(cam.pitch), cam.tz + dist * cp * Math.cos(cam.yaw)];
  M = mul(persp(0.85, W / H, 0.05, 200), look(e, [cam.tx, ty, cam.tz]));
  gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(prog);
  gl.uniformMatrix4fv(U.M, false, new Float32Array(M)); gl.uniform1f(U.X, S.exag); gl.uniform1f(U.Dpr, dpr); gl.uniform3f(U.D, dx, 0, dz); gl.uniform1f(U.T, now / 1000);
  gl.bindVertexArray(vaoT); gl.drawArrays(gl.POINTS, 0, nT); gl.bindVertexArray(vaoR); gl.drawArrays(gl.POINTS, 0, N);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufD); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([dx, de + 20, dz, 3])); gl.uniform1f(U.P, 14 + 22 * level); gl.bindVertexArray(vaoD); gl.drawArrays(gl.POINTS, 0, 1);
  for (const L of labels) { const p = S.labels && proj(RX[L.m.i], wy(RD.river[L.m.i] + 30) * S.exag, RZ[L.m.i]);
    if (!p || p[2] > 40) { L.d.style.visibility = 'hidden'; continue; } L.d.style.visibility = 'visible'; L.d.style.opacity = Math.max(0.25, Math.min(1, 14 / p[2])); L.d.style.transform = `translate(${p[0].toFixed(0)}px,${p[1].toFixed(0)}px)`; }
}
let drag = false, px = 0, py = 0;
canvas.addEventListener('pointerdown', (e) => { drag = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; cam.yaw -= (e.clientX - px) * .005; cam.pitch = Math.min(1.5, Math.max(.08, cam.pitch + (e.clientY - py) * .004)); px = e.clientX; py = e.clientY; });
addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.min(60, Math.max(2, cam.dist * Math.exp(e.deltaY * .001))); }, { passive: false });
addEventListener('resize', resize); resize();
try { if (!gl) throw new Error('WebGL 2 is not available, so the 3D view is off. Sound still works.'); initGL(); }
catch (e) { console.error(e); gl = null; $('#msg').hidden = false; $('#msg').textContent = e.message; }
$('#cap-info').textContent = RD.name + ' · ' + ((N - 1) * RD.ds / 1000).toFixed(0) + ' km · river ' + Math.round(RD.river[0]) + ' → ' + Math.round(RD.river[N - 1]) + ' m · key ' + SYN.rootName + ' minor pentatonic';
window.__river = { S: () => S, audio: () => ({ state: ctx && ctx.state, playing, pos: curPos(), status: snd.textContent, dur: buf && buf.duration }), nT: () => nT };
requestAnimationFrame(frame);
})();
