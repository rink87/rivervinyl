// node verify_chunks.js : v2 engine (riverorch.js) vs v1 (riverorch_v1.js): one-shot render must be sample-identical;
// chunked render (first 6 s, then 8 s blocks, as the page does) compared numerically, incl. 16-bit WAV words; timing per chunk.
const fs = require('fs'), RSy = require('./riversynth.js'), RSa = require('./riverstrata.js'), R2 = require('./riverorch.js'), R1 = require('./riverorch_v1.js'), SR = 44100;
require('./samples_orch_node.js')(R2); for (const [k, v] of Object.entries(R2.SAMPLES)) R1.SAMPLES[k] = v;
{ const SJ = JSON.parse(fs.readFileSync(__dirname + '/samples_orch.json')); }
// share IR: reload into v1 through the same loader path
require('./samples_orch_node.js')(R1);
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), SYN = RSy.create(RD), STR = RSa.create(RD, SYN), O1 = R1.create(RD, SYN, STR), O2 = R2.create(RD, SYN, STR);
const o = { dur: 75, musical: 0.6, bpm: 84, lo: 110, hi: 880, style: 'orch' }, rep = {};
let t = Date.now(); const a = O1.render(o, SR); rep.v1_ms = Date.now() - t;
t = Date.now(); const b = O2.render(o, SR); rep.v2_oneshot_ms = Date.now() - t;
const cmp = (x, y) => { let md = 0, nd = 0, w = 0; const q = v => Math.round(Math.max(-1, Math.min(1, v)) * 32767); for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); if (d) nd++; md = Math.max(md, d); if (q(x[i]) !== q(y[i])) w++; } return { maxAbsDiff: md, samplesDiffering: nd, wav16WordsDiffering: w, of: x.length }; };
rep.oneshot_vs_v1 = { L: cmp(a.L, b.L), R: cmp(a.R, b.R) };
const j = O2.job(o, SR), times = []; let first = true; while (j.done < j.n) { t = Date.now(); j.step(Math.round((first ? 6 : 8) * SR)); times.push(Date.now() - t); first = false; }
rep.chunk_ms = times; rep.chunked_vs_v1 = { L: cmp(a.L, j.L), R: cmp(a.R, j.R) };
// seams: largest sample-to-sample step at each block boundary vs. the same point in the v1 render
const seams = []; for (let s = 6 * SR; s < j.n; s += 8 * SR) seams.push({ at_s: s / SR, jump: Math.abs(j.L[s] - j.L[s - 1]).toExponential(2), v1jump: Math.abs(a.L[s] - a.L[s - 1]).toExponential(2) });
rep.seams = seams;
// dry path (no reverb) chunked must be bit-identical
const d1 = O1.render(o, SR, { dry: true }), jd = O2.job(o, SR, { dry: true }); while (jd.done < jd.n) jd.step(5 * SR); rep.dry_chunked_vs_v1 = { L: cmp(d1.L, jd.L), R: cmp(d1.R, jd.R) };
fs.writeFileSync(__dirname + '/verify_chunks.json', JSON.stringify(rep, null, 1)); console.log(JSON.stringify(rep, null, 1));
