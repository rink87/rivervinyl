// decode the embedded Strata Orchestra MP3s + IR with ffmpeg (node has no MP3 decoder) and register them with RiverOrch
const fs = require('fs'), cp = require('child_process'), os = require('os'), path = require('path');
const dec = (b64, tag, ch, sr) => { const f = path.join(os.tmpdir(), `orch_${tag}.mp3`); fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  const raw = cp.execFileSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'f32le', '-ac', String(ch), '-ar', String(sr), '-'], { maxBuffer: 1 << 27 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice(); };
module.exports = function load(RO) {
  const SJ = JSON.parse(fs.readFileSync(__dirname + '/samples_orch.json'));
  for (const [name, list] of Object.entries(SJ.sets)) RO.addSamples(name, list.map((q, k) => ({ hz: q.hz, sr: SJ.sr, ls: q.ls, le: q.le, peakAt: q.peakAt, data: dec(q.mp3, name + k, 1, SJ.sr) })));
  const st = dec(SJ.ir.mp3, 'ir', 2, SJ.sr), L = new Float32Array(st.length / 2), R = new Float32Array(st.length / 2); for (let i = 0; i < L.length; i++) { L[i] = st[2 * i]; R[i] = st[2 * i + 1]; }
  RO.setIR([L, R], SJ.sr);
  if (fs.existsSync(__dirname + '/samples_orch2.json')) { const S2 = JSON.parse(fs.readFileSync(__dirname + '/samples_orch2.json'));   // extra instruments (picker / presets)
    for (const [name, list] of Object.entries(S2.sets)) RO.addSamples(name, list.map((q, k) => ({ hz: q.hz, sr: S2.sr, ls: q.ls, le: q.le, data: dec(q.mp3, 'x' + name + k, 1, S2.sr) }))); }
  return SJ;
};
