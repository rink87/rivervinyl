// node render_styles.js [musical] [dur] : renders canyon_river_{edm,country,pop}.wav and verifies the terrain rule
const fs = require('fs'), RSy = require('./riversynth.js'), RSt = require('./riverstyles.js');
const m = parseFloat(process.argv[2] || '0.6'), dur = parseFloat(process.argv[3] || '75'), SR = 44100, OUT = __dirname + '/../../';
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), SYN = RSy.create(RD), STY = RSt.create(RD, SYN);
function wav(path, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); let pk = 0, sl = 0, sr = 0, slr = 0;
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); pk = Math.max(pk, Math.abs(l), Math.abs(r)); sl += l * l; sr += r * r; slr += l * r; b.writeInt16LE(Math.round(l * 32767), 44 + i * 4); b.writeInt16LE(Math.round(r * 32767), 46 + i * 4); }
  fs.writeFileSync(path, b); return { peak: +pk.toFixed(3), rmsL: +Math.sqrt(sl / n).toFixed(3), rmsR: +Math.sqrt(sr / n).toFixed(3), corrLR: +(slr / Math.sqrt(sl * sr)).toFixed(3) }; }
const base = { dur, musical: m, bpm: 84, lo: 110, hi: 880 };
// reference: the original synth's raw onsets (its own loop with quantizing off) and raw pitch
const T0 = SYN.tables(Object.assign({}, base, { musical: 0 }));
const ref = [T0.L, T0.R].map((S, ch) => STY.rawOnsets(S.dens, dur, ch ? 0.5 : 0.999).map(n => ({ t: n.t, hz: SYN.tab(S.pitch, n.t / dur) })));
const refAcc = SYN.accents.map(a => a.i / (RD.N - 1) * dur);
const rep = {};
for (const st of ['edm', 'country', 'pop']) {
  const o = Object.assign({}, base, { style: st }), t0 = Date.now(), r = STY.render(o, SR), P = r.plan, w = wav(OUT + 'canyon_river_' + st + '.wav', r.L, r.R);
  let maxRawDt = 0, maxRawCents = 0, cnt = [0, 0], maxShift = 0, revs = 0, pairs = 0, maxSnapSemi = 0;
  P.mel.forEach((ns, ch) => { cnt[ch] = ns.length; if (ns.length !== ref[ch].length) throw new Error('onset count differs');
    ns.forEach((x, k) => { maxRawDt = Math.max(maxRawDt, Math.abs(x.raw - ref[ch][k].t)); maxRawCents = Math.max(maxRawCents, Math.abs(1200 * Math.log2(x.rawHz / ref[ch][k].hz)));
      maxShift = Math.max(maxShift, Math.abs(x.t - x.raw)); maxSnapSemi = Math.max(maxSnapSemi, Math.abs(12 * Math.log2(x.hz / x.rawHz)));
      if (k) { const dr = x.rawHz - ns[k - 1].rawHz, ds = x.hz - ns[k - 1].hz; pairs++; if (dr * ds < 0) revs++; } }); });
  const accDt = Math.max(...P.acc.map((a, k) => Math.abs(a.t - refAcc[k])));
  rep[st] = { bpm: P.st.bpm, scale: P.st.scale, renderMs: Date.now() - t0, wav: w, notesLR: cnt, maxRawOnsetDiff_s: maxRawDt, maxRawPitchDiff_cents: +maxRawCents.toFixed(6),
    maxQuantShift_s: +maxShift.toFixed(3), halfGrid_s: +(60 / P.st.bpm / 4).toFixed(3), maxSnap_semitones: +maxSnapSemi.toFixed(2), contourReversals: revs + '/' + pairs,
    accents: P.acc.length, maxAccentDiff_s: accDt, chordsPerBar: P.chords.join(''), liftBars: P.lift.filter(Boolean).length + '/' + P.nb, drops: P.drops.map(d => +d.t.toFixed(2)) };
}
console.log(JSON.stringify(rep, null, 1));
