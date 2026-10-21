"""Build ../index-song.html from the tone single-dot page + songsynth.js + sections.json."""
import re, json, pathlib
H = pathlib.Path(__file__).resolve().parent
src = (H.parent / 'index-tone-single-dot.html').read_text()
scripts = re.findall(r'<script>(.*?)</script>', src, re.S)
main = scripts[2]
def rep(old, new, count=1):
    global main
    assert main.count(old) == count, (old[:80], main.count(old))
    main = main.replace(old, new)

rep("const D = DATA;\n", "")
rep("const KEY = 'canyon-sonifier-v2';", "const KEY = 'canyon-song-v1';")
rep("const DEF = { dur: 10,", "const DEF = { musical: 0.6, bpm: 84, order: SECTIONS.map(s => s.id), on: SECTIONS.map(s => s.id), dur: 16,")
rep("  for (const k of ['dur',", "  if (!Array.isArray(S.order) || S.order.length !== SECTIONS.length || !SECTIONS.every(s => S.order.includes(s.id))) S.order = DEF.order.slice();\n  if (!Array.isArray(S.on)) S.on = DEF.on.slice(); S.on = S.on.filter(id => S.order.includes(id));\n  if (!Number.isFinite(S.musical)) S.musical = DEF.musical; S.musical = Math.min(Math.max(S.musical, 0), 1); S.bpm = 84; S.quant = 'off';\n  for (const k of ['dur',")
# ---- data: many sections, one loaded into the 3D view at a time
old_data = main[main.index("const NU = D.NU, NV = D.NV;"):main.index("/* ───────── audio")]
main = main.replace(old_data, r"""const CANYONS = SECTIONS.map(s => ({ D: s, G: b64u16(s.terrain) }));
CANYONS.forEach(x => { x.syn = SongSynth.create(CanyonSynth, { PD: x.D.d, PE: x.D.e, G: x.G, D: x.D }); });
const NU = SECTIONS[0].NU, NV = SECTIONS[0].NV;
let D, G, PD, PE, NP, K, PMIN, PMAX, EMIN, EMAX, SYN, curSec = -1;
const secById = (id) => CANYONS.findIndex(x => x.D.id === id);
function loadSection(si) {   // swap the profile + terrain the 3D view and readout use
  if (si === curSec) return; curSec = si; const x = CANYONS[si];
  D = x.D; G = x.G; PD = D.d; PE = D.e; NP = PD.length; SYN = x.syn; K = SYN.K; PMIN = Math.min(...PE); PMAX = Math.max(...PE); EMIN = D.emin; EMAX = D.emax;
  $('#lblS').firstChild.textContent = D.sName; $('#lblN').firstChild.textContent = D.nName;
  $('#cap-title i').textContent = D.name;
  $('#cap-info').textContent = D.sName + ' → ' + D.nName + ' · ' + (D.L / 1000).toFixed(1) + ' km · river ' + Math.round(PMIN) + ' m · key ' + SYN.rootName + ' minor pentatonic · USGS 3DEP';
  if (gl && P.pts) { buildGeom(); lastPalette = -1; }
}
const toXkm = (d) => (d - D.L / 2) / 1000;
const profAt = (idx, arr) => { idx = Math.min(Math.max(idx, 0), NP - 1); const i = Math.min(idx | 0, NP - 2), f = idx - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
const mixAt = (idx) => idx <= K ? 0.5 * idx / K : 0.5 + 0.5 * (idx - K) / (NP - 1 - K);   // 0 south rim .. .5 river .. 1 north rim

/* ───────── song: the enabled sections, in the chosen order, one verse each ───────── */
const synOpts = () => ({ dur: S.dur, lo: S.lo, hi: S.hi, wave: S.wave, harm: S.harm, smooth: S.smooth, quant: 'off', timeMap: S.timeMap, layout: S.layout, musical: S.musical, bpm: S.bpm });
const activeSecs = () => S.order.filter(id => S.on.includes(id)).map(secById).filter(i => i >= 0);
let VT = [];   // per verse: { si, t0, t1 (normalised song time), dur, T (tables) }
let TB = null;
function rebuildTables() {
  const o = synOpts(), a = activeSecs(); let acc = 0; const durs = a.map(si => CANYONS[si].syn.verseDur(o)), tot = durs.reduce((p, q) => p + q, 0) || 1;
  VT = a.map((si, k) => { const v = { si, t0: acc / tot, dur: durs[k], T: CANYONS[si].syn.tables(o) }; acc += durs[k]; v.t1 = acc / tot; return v; });
  VT.total = tot; if (VT.length) { TB = VT[0].T; if (curSec < 0 || !VT.some(v => v.si === curSec)) loadSection(VT[0].si); }
}
function verseAt(t) {   // -> [verse, local time 0..1]
  if (!VT.length) return [null, 0];
  let k = 0; while (k < VT.length - 1 && t >= VT[k].t1) k++;
  const v = VT[k]; return [v, Math.min(Math.max((t - v.t0) / ((v.t1 - v.t0) || 1), 0), 1)];
}

""")
rep("""  const r = SYN.render(synOpts(), ctx.sampleRate), b = ctx.createBuffer(2, r.L.length, ctx.sampleRate);""",
    """  const a = activeSecs(); if (!a.length) throw new Error('no sections are switched on. Tick at least one under Sections');
  const r = SongSynth.renderSong(a.map(si => ({ syn: CANYONS[si].syn })), synOpts(), ctx.sampleRate), b = ctx.createBuffer(2, r.L.length, ctx.sampleRate);""")
# ---- controls
rep("  { h: 'Sound' },\n", "  { h: 'Song' },\n  { k: 'musical', l: 'Musical  (0 = raw terrain)', min: 0, max: 1, step: .01, f: v => v.toFixed(2) },\n  { h: 'Sound' },\n")
rep("  { k: 'dur', l: 'Duration',", "  { k: 'dur', l: 'Verse length',")
rep("  { k: 'quant', l: 'Scale quantize', seg: [['off', 'Off'], ['pentatonic', 'Pentatonic'], ['chromatic', 'Chromatic']] },\n", "")
rep("""panel.insertAdjacentHTML('beforeend', '<button id="reset">""", r"""// sections: tick to include, arrows to reorder; each one is a verse
{ const h = document.createElement('h2'); h.textContent = 'Sections (verses, in play order)'; const box = document.createElement('div'); box.id = 'secs';
  const firstH = panel.querySelector('h2'); panel.insertBefore(box, firstH.nextSibling.nextSibling); panel.insertBefore(h, box);
  const mv = (id, d) => { const o = S.order, i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; changed('order'); };
  refs.secs = () => { box.innerHTML = '';
    S.order.forEach((id, i) => { const x = CANYONS[secById(id)], r = document.createElement('div'); r.className = 'secrow' + (S.on.includes(id) ? '' : ' off');
      r.innerHTML = '<button class="sw" role="switch"><span></span><i></i></button><button class="mv" title="Move up">↑</button><button class="mv" title="Move down">↓</button>';
      const [sw, u, dn] = r.querySelectorAll('button'); sw.firstChild.textContent = (i + 1) + '. ' + x.D.name + ' · ' + x.syn.rootName; sw.setAttribute('aria-checked', S.on.includes(id));
      sw.onclick = () => { S.on = S.on.includes(id) ? S.on.filter(q => q !== id) : S.on.concat([id]); changed('on'); };
      u.disabled = i === 0; dn.disabled = i === S.order.length - 1; u.onclick = () => mv(id, -1); dn.onclick = () => mv(id, 1); box.appendChild(r); }); };
}
panel.insertAdjacentHTML('beforeend', '<button id="reset">""")
rep("""<p class="note">One dot, one pass:""", """<p class="note"><b>Musical</b>: at 0 each verse is the raw terrain (the original sound). Raising it snaps pitch toward a minor pentatonic scale whose key comes from that section\\'s river elevation, adds plucked notes whose density follows the real slope and wall roughness (onsets pulled onto an 84 BPM grid), a roughness texture, a soft root drone/bass and gentler envelopes. The canyon shape always sets the melody. Verses play back to back in the order above.</p><p class="note">One dot, one pass per section:""")
rep("""  if (['lo', 'hi', 'smooth', 'quant', 'timeMap', 'layout'].includes(k)) rebuildTables();
  if (['dur', 'lo', 'hi', 'wave', 'harm', 'smooth', 'quant', 'timeMap', 'layout'].includes(k)) invalidate();""",
    """  if (['lo', 'hi', 'smooth', 'quant', 'timeMap', 'layout', 'musical', 'dur', 'order', 'on'].includes(k)) rebuildTables();
  if (['dur', 'lo', 'hi', 'wave', 'harm', 'smooth', 'quant', 'timeMap', 'layout', 'musical', 'order', 'on'].includes(k)) invalidate();
  if (k === 'order' || k === 'on') pos = 0;""")
rep("$('#reset').onclick = () => { S = Object.assign({}, DEF);", "$('#reset').onclick = () => { S = Object.assign({}, DEF, { order: DEF.order.slice(), on: DEF.on.slice() });")
# ---- readout
rep("""  const idx = SYN.tab(TB.idx, t), hz = SYN.tab(TB.pitch, t), pan = SYN.tab(TB.pan, t);""",
    """  const [v, tl] = verseAt(t); if (!v) { $('#time').textContent = 'no sections on'; return; } if (v.si !== curSec) loadSection(v.si); TB = v.T;
  const idx = SYN.tab(TB.idx, tl), hz = SYN.tab(TB.pitch, tl), pan = SYN.tab(TB.pan, tl);""")
rep("""  $('#time').textContent = (t * S.dur).toFixed(1) + ' / ' + S.dur.toFixed(1) + ' s';""",
    """  $('#time').textContent = 'verse ' + (VT.indexOf(v) + 1) + '/' + VT.length + ' · ' + (t * VT.total).toFixed(1) + ' / ' + VT.total.toFixed(1) + ' s';""")
rep("""  $('#rF').textContent = Math.round(hz).toString().padStart(4) + ' Hz';""",
    """  const sm = Math.round(12 * Math.log2(hz / 110)); $('#rF').textContent = Math.round(hz).toString().padStart(4) + ' Hz  ' + SongSynth.NOTE[((sm % 12) + 12) % 12];""")
# ---- GL: geometry rebuilt per section
rep("""  // terrain
  const du =""", """  buildGeom(); vaoEmpty = gl.createVertexArray(); return true;
}
let GEO = [];
function buildGeom() {
  GEO.forEach(o => o.del ? gl.deleteVertexArray(o.v) : gl.deleteBuffer(o.b)); GEO = [];
  const du =""")
rep("""  vaoT = gl.createVertexArray(); gl.bindVertexArray(vaoT);
  const vb = gl.createBuffer();""", """  vaoT = gl.createVertexArray(); gl.bindVertexArray(vaoT);
  const vb = gl.createBuffer(); GEO.push({ v: vaoT, del: 1 }, { b: vb });""")
rep("""const ib = gl.createBuffer();""", """const ib = gl.createBuffer(); GEO.push({ b: ib });""")
rep("""  gl.bindVertexArray(null);
  vaoEmpty = gl.createVertexArray();
  return true;
}""", """  GEO.push({ v: vaoS, del: 1 }, { b: bufLine }, { v: vaoC, del: 1 }, { b: bufCur }, { v: vaoP, del: 1 }, { b: bufDyn });
  gl.bindVertexArray(null);
}""")
rep("""const YC = 1600, EMIN = D.emin, EMAX = D.emax;""", """const YC = 1600;""")
rep("""  const hIdx = SYN.tab(TB.idx, t), hs""", """  const [hv, htl] = verseAt(t); if (hv && hv.si !== curSec) loadSection(hv.si); if (hv) TB = hv.T;
  const hIdx = SYN.tab(TB.idx, hv ? htl : 0), hs""")
rep("""window.__canyon = { S: () => S, TB: () => TB, K, PMIN, PMAX,""", """window.__canyon = { S: () => S, TB: () => TB, VT: () => VT, curSec: () => curSec, K: () => K,""")

html = src
html = html.replace(scripts[2], main).replace(scripts[1], '\nconst SECTIONS=' + json.dumps(json.load(open(H / 'sections.json')), separators=(',', ':')) + ';\n')
html = html.replace(scripts[0], scripts[0] + '\n' + (H / 'songsynth.js').read_text())
html = html.replace('<div class="cap" id="cap-title">Canyon Sonifier<i>', '<div class="cap" id="cap-title">Canyon Song<i>')
html = html.replace('<div id="hint">press play to listen', '<div id="hint">press play to hear every section as a verse')
css = """
#secs{display:flex;flex-direction:column;gap:4px;margin:2px 0 10px}
.secrow{display:flex;gap:4px;align-items:center}.secrow .sw{flex:1;text-align:left}.secrow.off{opacity:.55}
.secrow .mv{width:26px;height:26px;padding:0;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:inherit;cursor:pointer}
.secrow .mv:disabled{opacity:.25;cursor:default}
"""
html = html.replace('</style>', css + '</style>', 1)
html = re.sub(r'<title>.*?</title>', '<title>Canyon Song · Grand Canyon sonifier</title>', html, count=1)
(H.parent / 'index-song.html').write_text(html)
(H / 'main_song.js').write_text(main)
print('ok', len(html))
