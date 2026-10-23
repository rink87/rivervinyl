// node render_ms.js : Strata Orchestra over the Mississippi data (true heights, same mapping as the canyon) -> mississippi_river_orchestra.wav
// + audibility report vs the canyon render (verify_ms.json)
const fs = require('fs'), D = __dirname + '/../river/', RSy = require(D + 'riversynth.js'), RSa = require(D + 'riverstrata.js'), RO = require(D + 'riverorch.js'), SR = 44100, OUT = __dirname + '/../../';
require(D + 'samples_orch_node.js')(RO);
function wav(p, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); } if (p) fs.writeFileSync(p, b); }
const stats = (r, RD, SYN) => { const n = r.L.length; let s = 0, pk = 0; for (let i = 0; i < n; i++) { const v = (r.L[i] + r.R[i]) / 2; s += v * v; pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
  const sec = []; for (let w = 0; w < 15; w++) { let a = 0; for (let i = w * 5 * SR; i < (w + 1) * 5 * SR; i++) a += r.L[i] * r.L[i] + r.R[i] * r.R[i]; sec.push(+(10 * Math.log10(a / (10 * SR) + 1e-12)).toFixed(1)); }
  const notes = r.plan.notes[0].concat(r.plan.notes[1]), byBand = [0, 1, 2, 3].map(k => notes.filter(x => x.band === k)), hz = notes.map(x => x.hz).sort((a, b) => a - b);
  const env = r.bandEnv.map(e => +(e.reduce((p, q) => p + q, 0) / e.length).toFixed(3));
  const T = SYN.tables({ dur: 75, musical: 0, bpm: 84, lo: 110, hi: 880 }), wp = [T.L, T.R].map(W => { const a = Array.from(W.pitch).sort((x, y) => x - y); return [a[0], a[a.length >> 1], a[a.length - 1]].map(v => +v.toFixed(1)); });
  return { rms_dBFS: +(10 * Math.log10(s / n)).toFixed(1), peak: +pk.toFixed(3), level_per_5s_dB: sec, notes: notes.length, notesPerBand: byBand.map(b => b.length), bandPresence: env, notePitchHz: [hz[0], hz[hz.length >> 1], hz[hz.length - 1]].map(v => +(v || 0).toFixed(1)), wallPitchHz_canyonSynth_min_med_max: wp, accents: SYN.accents.length }; };
const rep = {};
for (const [id, file] of [['mississippi', __dirname + '/river_ms.json'], ['canyon', D + 'river.json']]) {
  const RD = JSON.parse(fs.readFileSync(file)), SYN = RSy.create(RD), STR = RSa.create(RD, SYN), ORC = RO.create(RD, SYN, STR);
  const r = ORC.render({ dur: 75, musical: 0.6, bpm: 84, lo: 110, hi: 880, style: 'orch' }, SR); if (id === 'mississippi') wav(OUT + 'mississippi_river_orchestra.wav', r.L, r.R);
  rep[id] = stats(r, RD, SYN); rep[id].key = SYN.rootName; console.log(id, JSON.stringify(rep[id])); }
fs.writeFileSync(__dirname + '/verify_ms.json', JSON.stringify(rep, null, 1));
