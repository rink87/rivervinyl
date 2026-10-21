// node render_song.js [musical] [out.wav]  -- offline render with the exact page synth
const fs = require('fs'), CS = require('./canyonsynth.js'), SS = require('./songsynth.js');
const m = parseFloat(process.argv[2] || '0.6'), out = process.argv[3] || '../canyon_song.wav', SR = 44100;
const secs = JSON.parse(fs.readFileSync(__dirname + '/sections.json'));
const verses = secs.map(s => { const b = Buffer.from(s.terrain, 'base64'), G = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  return { id: s.id, syn: SS.create(CS, { PD: s.d, PE: s.e, G, D: s }) }; });
const o = { dur: 16, lo: 110, hi: 880, wave: 'sine', harm: 1, smooth: 1, timeMap: 'distance', layout: 'pan', musical: m, bpm: 84 };
const r = SS.renderSong(verses, o, SR);
verses.forEach((v, k) => { const p = r.parts[k]; console.log(v.id, 'root', v.syn.rootName, v.syn.rootHz.toFixed(1), 'Hz', 'dur', p.dur.toFixed(2), 's', 'notes', p.notes.length, 'rough max', Math.max(...v.syn.rough).toFixed(1), 'm'); });
const n = r.L.length, buf = Buffer.alloc(44 + n * 4); let pk = 0, ss = 0;
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, r.L[i])), q = Math.max(-1, Math.min(1, r.R[i])); pk = Math.max(pk, Math.abs(l), Math.abs(q)); ss += l * l + q * q;
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(q * 32767), 46 + i * 4); }
fs.writeFileSync(out, buf); console.log('wrote', out, r.total.toFixed(2), 's, peak', pk.toFixed(3), 'rms', Math.sqrt(ss / (2 * n)).toFixed(3));
