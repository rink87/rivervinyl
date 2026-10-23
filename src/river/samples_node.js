// decode the embedded MP3s with ffmpeg (node has no MP3 decoder) and register them with RiverStrata
const fs = require('fs'), cp = require('child_process'), os = require('os'), path = require('path');
module.exports = function load(RSa) {
  const SJ = JSON.parse(fs.readFileSync(__dirname + '/samples.json'));
  for (const [name, list] of Object.entries(SJ.sets)) RSa.addSamples(name, list.map((q, k) => {
    const f = path.join(os.tmpdir(), `smp_${name}_${k}.mp3`); fs.writeFileSync(f, Buffer.from(q.mp3, 'base64'));
    const raw = cp.execFileSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', String(SJ.sr), '-'], { maxBuffer: 1 << 26 });
    return { hz: q.hz, sr: SJ.sr, ls: q.ls, le: q.le, data: new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice() }; }));
  return SJ;
};
