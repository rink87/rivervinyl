// node render_presets.js [preset] : renders canyon_river_orch_<preset>.wav for the arrangement presets (riverarr.js: recorded re-creations
// of the original Canyon / EDM / Country / Pop synth arrangements) and checks the terrain rule against the original synth plan.
const fs = require('fs'), RSy = require('./riversynth.js'), RSa = require('./riverstrata.js'), RSt = require('./riverstyles.js'), RO = require('./riverorch.js'), RA = require('./riverarr.js'), SR = 44100, OUT = __dirname + '/../../';
require('./samples_orch_node.js')(RO);
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), SYN = RSy.create(RD), STY = RSt.create(RD, SYN), A = RA.create(RD, SYN, STY, RO);
function wav(p, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); let pk = 0, sl = 0, sr = 0;
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); pk = Math.max(pk, Math.abs(l), Math.abs(r)); sl += l * l; sr += r * r; b.writeInt16LE(Math.round(l * 32767), 44 + i * 4); b.writeInt16LE(Math.round(r * 32767), 46 + i * 4); }
  fs.writeFileSync(p, b); return { peak: +pk.toFixed(3), rmsL: +Math.sqrt(sl / n).toFixed(4), rmsR: +Math.sqrt(sr / n).toFixed(4) }; }
const base = { dur: 75, musical: 0.6, bpm: 84, lo: 110, hi: 880, style: 'orch' }, rep = {}, only = process.argv[2];
for (const [id, P] of Object.entries(RO.PRESETS)) { if (!P.arr || (only && only !== id)) continue;
  const t0 = Date.now(), r = A.render(Object.assign({}, base, { arr: P.arr }), SR), pl = r.plan; let md = 0, ad = 0;
  if (P.arr === 'canyon') { const T = SYN.tables(base); ad = Math.max(...pl.acc.map((a, k) => Math.abs(a.raw - T.accents[k].i / (RD.N - 1) * 75))); for (let c = 0; c < 2; c++) pl.notes[c].forEach(x => { md = Math.max(md, Math.abs(x.hz - SYN.tab([T.L, T.R][c].pitch, x.t / 75))); }); }
  else { const ref = STY.plan(Object.assign({}, base, { style: P.arr })); for (let c = 0; c < 2; c++) pl.notes[c].forEach((x, k) => { const y = ref.mel[c][k]; md = Math.max(md, Math.abs(x.raw - y.raw), Math.abs(x.t - y.t), Math.abs(x.hz - y.hz)); }); ad = Math.max(...pl.acc.map((a, k) => Math.abs(a.t - ref.acc[k].t))); }
  rep[id] = { ms: Date.now() - t0, wav: wav(OUT + 'canyon_river_orch_' + id + '.wav', r.L, r.R), notes: pl.notes[0].length + pl.notes[1].length, maxDiffVsOriginalPlan: md, accents: pl.acc.length, maxAccentDiff_s: ad, bpm: pl.bpm || 84 };
  console.log(id, JSON.stringify(rep[id])); }
fs.writeFileSync(__dirname + '/verify_presets' + (only ? '_' + only : '') + '.json', JSON.stringify(rep, null, 1));
