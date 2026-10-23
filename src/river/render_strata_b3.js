// node render_strata_b3.js : band-3 voice alternatives (strings / mallet) vs the current brass pad
const fs = require('fs'), RSy = require('./riversynth.js'), RSa = require('./riverstrata.js'), SR = 44100, OUT = __dirname + '/../../';
require('./samples_node.js')(RSa);
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), SYN = RSy.create(RD), STR = RSa.create(RD, SYN);
function wav(path, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); let pk = 0, ss = 0;
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); pk = Math.max(pk, Math.abs(l), Math.abs(r)); ss += l * l + r * r; b.writeInt16LE(Math.round(l * 32767), 44 + i * 4); b.writeInt16LE(Math.round(r * 32767), 46 + i * 4); }
  if (path) fs.writeFileSync(path, b); return { peak: +pk.toFixed(3), rms: +Math.sqrt(ss / 2 / n).toFixed(4) }; }
const fft = (re, im) => { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let l = 2; l <= n; l <<= 1) { const a = -2 * Math.PI / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), xr = re[i + k + l / 2] * c - im[i + k + l / 2] * s, xi = re[i + k + l / 2] * s + im[i + k + l / 2] * c; re[i + k + l / 2] = re[i + k] - xr; im[i + k + l / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi; } } };
const F = 8192, spec = (x) => { const S = new Float64Array(F / 2); for (let s = 0; s + F <= x.length; s += F * 2) { const re = new Float64Array(F), im = new Float64Array(F); for (let i = 0; i < F; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / F)); fft(re, im); for (let i = 0; i < F / 2; i++) S[i] += re[i] * re[i] + im[i] * im[i]; } return S; };
const cos = (a, b) => { let x = 0, y = 0, z = 0; for (let i = 1; i < a.length; i++) { x += a[i] * b[i]; y += a[i] * a[i]; z += b[i] * b[i]; } return +(x / Math.sqrt(y * z)).toFixed(3); };
const hz = (i) => i * SR / F, n30 = 30 * SR, REG = STR.REG;
const mono = (r) => { const m = new Float32Array(n30); for (let i = 0; i < n30; i++) m[i] = r.L[i] + r.R[i]; return m; };
const base = { dur: 75, musical: 0.6, bpm: 84, lo: 110, hi: 880, style: 'strata' };
const S4 = spec(mono(STR.render(base, SR, { solo: 3 })));
let e4 = 0, e4hi = 0; for (let i = 1; i < S4.length; i++) e4 += S4[i];
const rep = {};
const ONLY = process.argv[2] ? process.argv[2].split(',') : ['brass', 'strings', 'mallet', 'cello', 'horn'];
for (const v of ONLY) {
  const o = Object.assign({}, base, { band3Voice: v }), solo = STR.render(o, SR, { solo: 2 }), m = mono(solo), S = spec(m);
  let tot = 0, c = 0, inR = 0, above = 0; for (let i = 1; i < S.length; i++) { tot += S[i]; c += S[i] * hz(i); if (hz(i) >= REG[2][0] * 0.97 && hz(i) <= REG[2][1] * 1.03) inR += S[i]; if (hz(i) >= REG[3][0] * 0.97) above += S[i]; }
  const w = wav(v === 'brass' || !['cello', 'horn'].concat(process.argv[3] === 'all' ? ['strings', 'mallet'] : []).includes(v) ? null : OUT + 'canyon_strata_band3_' + v + '.wav', solo.L.slice(0, n30), solo.R.slice(0, n30));
  const notes = solo.plan.notes.flat().filter(x => x.band === 2).length;
  rep[v] = { overlap_b3_b4: cos(S, S4), inRange_pct: +(100 * inR / tot).toFixed(1), energyInBand4Range_pct: +(100 * above / tot).toFixed(2), centroid_Hz: Math.round(c / tot), solo30s: w, band3Notes75s: notes };
  if (['cello', 'horn'].includes(v)) { const full = STR.render(o, SR); rep[v].full = wav(OUT + 'canyon_river_strata_' + v + '.wav', full.L, full.R); rep[v].accents = full.plan.acc.length; }
}
// grit: texture-only level of band 3 (old low-passed white noise vs new band-limited, cut) on unit roughness/presence
{ let seed = 5, lp = 0, h1 = 0, h2 = 0, l1 = 0, l2 = 0, a = 0, b = 0; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296 * 2 - 1; };
  const ch = 1 - Math.exp(-2 * Math.PI * 250 / SR), cl = 1 - Math.exp(-2 * Math.PI * 520 / SR);
  for (let i = 0; i < SR * 10; i++) { const w = rnd(); lp += (w - lp) * 0.12; a += (lp * 0.04) ** 2; h1 += (w - h1) * ch; const y1 = w - h1; h2 += (y1 - h2) * ch; const y2 = y1 - h2; l1 += (y2 - l1) * cl; l2 += (l1 - l2) * cl; b += (l2 * 0.04 * 0.35 * 3) ** 2; }
  rep.gritRms_newVsOld_pct = +(100 * Math.sqrt(b / a)).toFixed(0); }
{ const o = Object.assign({}, base, { band2Voice: 'pizz' }), r = STR.render(o, SR, { solo: 1 }), r0 = STR.render(base, SR, { solo: 1 });
  rep.band2_pizz = { solo30s: wav(OUT + 'canyon_strata_band2_pizz.wav', r.L.slice(0, n30), r.R.slice(0, n30)), synth_solo30s: wav(null, r0.L.slice(0, n30), r0.R.slice(0, n30)) };
  const full = STR.render(Object.assign({}, base, { band2Voice: 'pizz', band3Voice: 'cello' }), SR); rep.band2_pizz.full_with_cello = wav(OUT + 'canyon_river_strata_cello_pizz.wav', full.L, full.R); }
console.log(JSON.stringify(rep, null, 1)); fs.writeFileSync(__dirname + '/verify_strata_b3_samples.json', JSON.stringify(rep, null, 1));
