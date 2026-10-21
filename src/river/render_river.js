// node render_river.js [musical] [out.wav] [dur]  -- offline render with the exact page synth
const fs = require('fs'), RS = require('./riversynth.js');
const m = parseFloat(process.argv[2] || '0.6'), out = process.argv[3] || __dirname + '/../../canyon_river.wav', dur = parseFloat(process.argv[4] || '75'), SR = 44100;
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), syn = RS.create(RD);
const o = { dur, musical: m, bpm: 84, lo: 110, hi: 880 }, r = syn.render(o, SR), n = r.L.length;
let pk = 0, sl = 0, sr2 = 0, slr = 0, sd = 0;
const buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, r.L[i])), q = Math.max(-1, Math.min(1, r.R[i])); pk = Math.max(pk, Math.abs(l), Math.abs(q));
  sl += l * l; sr2 += q * q; slr += l * q; sd += (l - q) ** 2; buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(q * 32767), 46 + i * 4); }
fs.writeFileSync(out, buf);
const T = r.tables, pc = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(12 * Math.log2(a[i] / b[i])); return d / a.length; };
console.log(JSON.stringify({ out, dur, root: syn.rootName, accents: syn.accents.length, peak: +pk.toFixed(3), rmsL: +Math.sqrt(sl / n).toFixed(3), rmsR: +Math.sqrt(sr2 / n).toFixed(3),
  corrLR: +(slr / Math.sqrt(sl * sr2)).toFixed(3), sideToMid_dB: +(10 * Math.log10(sd / (sl + sr2 + 2 * slr))).toFixed(1), meanPitchDiff_semitones: +pc(T.L.pitch, T.R.pitch).toFixed(2) }));
