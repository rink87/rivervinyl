// node dump_arr_layers.js <style> : writes each arrangement layer (dry, gain 1, mono sum) as float32 to /tmp/arr/<style>_<layer>.f32 for fit_arr.py
const fs = require('fs'), RSy = require('./riversynth.js'), RSa = require('./riverstrata.js'), RSt = require('./riverstyles.js'), RO = require('./riverorch.js'), RA = require('./riverarr.js'), SR = 44100;
require('./samples_orch_node.js')(RO);
const RD = JSON.parse(fs.readFileSync(__dirname + '/river.json')), SYN = RSy.create(RD), STY = RSt.create(RD, SYN), A = RA.create(RD, SYN, STY, RO);
for (const sty of process.argv.slice(2)) { const j = A.render({ dur: 75, musical: 0.6, bpm: 84, lo: 110, hi: 880, style: 'orch', arr: sty, layerGain: Object.fromEntries(RA.LAYERS.map(k => [k, 1])) }, SR, { layers: true });
  for (const k of RA.LAYERS) { const L = j.layers[k], s = new Float32Array(L[0].length * 2); for (let i = 0; i < L[0].length; i++) { s[2 * i] = L[0][i]; s[2 * i + 1] = L[1][i]; } fs.writeFileSync('/tmp/arr/' + sty + '_' + k + '.f32', Buffer.from(s.buffer)); }
  console.log(sty, 'ok'); }
