// node render_presets.js : one 75 s WAV per recorded-instrument style preset (canyon_river_orch_<preset>.wav) + checks that the
// note plan and the 24 rapid accents are identical to the default Strata Orchestra (instrument choice never moves terrain events).
const fs = require('fs'), RSy = require('./riversynth.js'), RSa = require('./riverstrata.js'), RO = require('./riverorch.js'), SR = 44100, OUT = __dirname + '/../../';
require('./samples_orch_node.js')(RO);
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), SYN = RSy.create(RD), STR = RSa.create(RD, SYN), ORC = RO.create(RD, SYN, STR);
function wav(p, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); let pk = 0, sl = 0, sr = 0;
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); pk = Math.max(pk, Math.abs(l), Math.abs(r)); sl += l * l; sr += r * r; b.writeInt16LE(Math.round(l * 32767), 44 + i * 4); b.writeInt16LE(Math.round(r * 32767), 46 + i * 4); }
  fs.writeFileSync(p, b); return { peak: +pk.toFixed(3), rmsL: +Math.sqrt(sl / n).toFixed(4), rmsR: +Math.sqrt(sr / n).toFixed(4) }; }
const base = { dur: 75, musical: 0.6, bpm: 84, lo: 110, hi: 880, style: 'orch' }, ref = ORC.render(base, 8000).plan, rep = {};
const only = process.argv[2];
for (const [id, P] of Object.entries(RO.PRESETS)) { if (id === 'orchestra' || (only && only !== id)) continue;
  const t0 = Date.now(), r = ORC.render(Object.assign({}, base, { inst: P.inst }), SR), pl = r.plan;
  let md = 0; for (let c = 0; c < 2; c++) pl.notes[c].forEach((x, k) => { md = Math.max(md, Math.abs(x.t - ref.notes[c][k].t), Math.abs(x.hz - ref.notes[c][k].hz)); });
  const accDiff = Math.max(...pl.acc.map((a, k) => Math.abs(a.t - ref.acc[k].t)));
  rep[id] = { inst: P.inst, ms: Date.now() - t0, wav: wav(OUT + 'canyon_river_orch_' + id + '.wav', r.L, r.R), notes: pl.notes[0].length + pl.notes[1].length, maxNoteDiff: md, accents: pl.acc.length, maxAccentDiff_s: accDiff, tech: pl.tech, groove: pl.groove };
  console.log(id, JSON.stringify(rep[id].wav), 'notes', md, 'acc', accDiff); }
fs.writeFileSync(__dirname + '/verify_presets' + (only ? '_' + only : '') + '.json', JSON.stringify(rep, null, 1));
