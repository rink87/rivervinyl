// node render_orch.js : Strata Orchestra full mix (75 s, Musical 0.6) + 30 s solo per band + checks
const fs = require('fs'), RSy = require('./riversynth.js'), RSa = require('./riverstrata.js'), RO = require('./riverorch.js'), SR = 44100, OUT = __dirname + '/../../';
require('./samples_orch_node.js')(RO);
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), SYN = RSy.create(RD), STR = RSa.create(RD, SYN), ORC = RO.create(RD, SYN, STR);
function wav(p, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); let pk = 0, sl = 0, sr = 0, slr = 0;
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); pk = Math.max(pk, Math.abs(l), Math.abs(r)); sl += l * l; sr += r * r; slr += l * r; b.writeInt16LE(Math.round(l * 32767), 44 + i * 4); b.writeInt16LE(Math.round(r * 32767), 46 + i * 4); }
  if (p) fs.writeFileSync(p, b); return { peak: +pk.toFixed(3), rmsL: +Math.sqrt(sl / n).toFixed(4), rmsR: +Math.sqrt(sr / n).toFixed(4), corrLR: +(slr / Math.sqrt(sl * sr || 1)).toFixed(3) }; }
const o = { dur: 75, musical: 0.6, bpm: 84, lo: 110, hi: 880, style: 'orch' }, t0 = Date.now();
const full = ORC.render(o, SR), rep = { renderSec: (Date.now() - t0) / 1000, full: wav(OUT + 'canyon_river_orchestra.wav', full.L, full.R) };
const refAcc = SYN.accents.map(a => a.i / (RD.N - 1) * 75); rep.accents = full.plan.acc.map(a => ({ t: +a.t.toFixed(3), kind: a.kind, cymbal: !!a.cymbal, drop: a.d }));
rep.maxAccentDiff_s = Math.max(...full.plan.acc.map((a, k) => Math.abs(a.t - refAcc[k])));
// note plan identical to Strata's (same onsets + pitches)
const sp = STR.render(o, 8000).plan; let md = 0, cnt = 0; for (let c = 0; c < 2; c++) { const A = sp.notes[c], B = full.plan.notes[c]; if (A.length !== B.length) md = Infinity; else A.forEach((x, k) => { cnt++; md = Math.max(md, Math.abs(x.t - B[k].t), Math.abs(x.hz - B[k].hz)); }); }
rep.notesVsStrata = { notes: cnt, maxDiff: md }; rep.tech = full.plan.tech;
// stretch check: semitones between each note and the recorded note it plays
const fft = (re, im) => { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let l = 2; l <= n; l <<= 1) { const a = -2 * Math.PI / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), xr = re[i + k + l / 2] * c - im[i + k + l / 2] * s, xi = re[i + k + l / 2] * s + im[i + k + l / 2] * c; re[i + k + l / 2] = re[i + k] - xr; im[i + k + l / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi; } } };
const spec = (x) => { const F = 8192, S = new Float64Array(F / 2); for (let s = 0; s + F <= x.length; s += F * 2) { const re = new Float64Array(F), im = new Float64Array(F); for (let i = 0; i < F; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / F)); fft(re, im); for (let i = 0; i < F / 2; i++) S[i] += re[i] * re[i] + im[i] * im[i]; } return S; };
const SETS = [['bass', 'bassTrem', 'tuba'], ['cello', 'celloTrem', 'celloPizz'], ['viola', 'violaTrem'], ['violin', 'violinTrem', 'flute']];
rep.maxStretch_semitones = SETS.map((ss, k) => { let mx = 0; for (const ns of full.plan.notes) for (const nt of ns.filter(x => x.band === k)) for (const s of ss) { const L = RO.SAMPLES[s]; const best = Math.min(...L.map(x => Math.abs(12 * Math.log2(nt.hz / x.hz)))); mx = Math.max(mx, best); } return +mx.toFixed(2); });
const REG = STR.REG, solos = [], specs = [];
for (let k = 0; k < 4; k++) { const r = ORC.render(o, SR, { solo: k }), n = 30 * SR, L = r.L.slice(0, n), R = r.R.slice(0, n), w = wav(OUT + 'canyon_orch_band' + (k + 1) + '.wav', L, R);
  const d = ORC.render(Object.assign({}, o, { dur: 30 }), SR, { solo: k, dry: true });   // dry spectra for separation (the hall tail is shared by design)
  const mono = d.L.map((v, i) => v + d.R[i]), S = spec(mono), hz = (i) => i * SR / 8192; let tot = 0, c = 0, inReg = 0; for (let i = 1; i < S.length; i++) { tot += S[i]; c += S[i] * hz(i); if (hz(i) >= REG[k][0] * 0.97 && hz(i) <= REG[k][1] * 1.03) inReg += S[i]; }
  specs.push(S); solos.push({ band: k + 1, register_Hz: REG[k], wav30s: w, centroid_Hz: Math.round(c / tot), energyInOwnRegister_pct: +(100 * inReg / tot).toFixed(1) }); }
const cos = (a, b) => { let x = 0, y = 0, z = 0; for (let i = 1; i < a.length; i++) { x += a[i] * b[i]; y += a[i] * a[i]; z += b[i] * b[i]; } return +(x / Math.sqrt(y * z)).toFixed(3); };
rep.solos = solos; rep.overlap = {}; for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) rep.overlap[`b${a + 1}-b${b + 1}`] = cos(specs[a], specs[b]);
const dryF = ORC.render(o, SR, { dry: true }); rep.wetToDry_dB = +(10 * Math.log10(full.L.reduce((s, v, i) => s + (v - dryF.L[i]) ** 2, 0) / dryF.L.reduce((s, v) => s + v * v, 0))).toFixed(1);
console.log(JSON.stringify(rep, null, 1)); fs.writeFileSync(__dirname + '/verify_orch.json', JSON.stringify(rep, null, 1));
