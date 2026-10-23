/* RECORDED ARRANGEMENTS of the original synth styles (Canyon / EDM / Country / Pop).
   Same plan as the originals, played with recorded VSCO 2 CE samples (CC0) instead of oscillators:
   - EDM / Country / Pop: RiverStyles.plan(o) unchanged -> melody onsets are generated from terrain at the 84 BPM reference density and
     then nudged toward the STYLE's grid (124 / 100 / 110 BPM) by Musical (the same mechanism the originals use; raw times + pitches are
     terrain); bars, chord progression (chords follow canyon width), lifts, drops, backing patterns are the originals' at the style tempo.
   - Canyon: the original riversynth plan (84 BPM; continuous wall tone + notes + texture + drone + rapids).
   - Rapids: same times as each original. Hall reverb: the OpenAIR IR used by the orchestra.
   Layer gains (G) were fitted so each layer's energy per octave band and per 5 s window matches the original WAV (fit_arr.js).
   Incremental: job(o, sr).step(k) like RiverOrch.job (stateful voices, block convolution). */
const RiverArr = (() => {
  const TAU = 6.283185307179586;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const MK = { canyon: 1.3, edm: 2.0, country: 2.5, pop: 2.2 };   // make-up gain to the original's loudness (see compare_arr.py)
  const LAYERS = ['lead', 'cont', 'tex', 'bass', 'harm', 'pad', 'drums', 'acc', 'drone'];
  // fitted layer gains (see fit_arr.js / verify_arr.json); 1 = the original's coefficient applied to a 0.89-peak sample
  const G = {"canyon": {"lead": 2.173, "cont": 0.502, "tex": 0.483, "acc": 1.228, "drone": 0.355}, "edm": {"lead": 0.925, "tex": 1.014, "bass": 1.21, "pad": 1.171, "drums": 1.144, "acc": 0.666}, "country": {"lead": 0.332, "tex": 1.001, "bass": 1.258, "harm": 0.597, "drums": 1.15, "acc": 1.013}, "pop": {"lead": 0.733, "tex": 0.956, "bass": 1.359, "harm": 1.019, "pad": 0.934, "drums": 1.304, "acc": 1.037}};
  const nearest = (set, hz) => set.reduce((b, x) => Math.abs(Math.log(hz / x.hz)) < Math.abs(Math.log(hz / b.hz)) ? x : b);
  function create(RD, SYN, STY, RO) {
    const N = RD.N, tab = SYN.tab, S = RO.SAMPLES;
    const M = (...k) => [].concat(...k.map(x => S[x]));
    function canyonOnsets(dens, dur, o, ph0) { const beat = 60 / o.bpm, qa = sstep(0.1, 0.8, o.musical), st = 4000, out = []; let ph = ph0;   // = riversynth onsets()
      for (let k = 0; k < st; k++) { const t = k / st * dur, d = tab(dens, k / (st - 1)); ph += d * (dur / st) / beat;
        if (ph >= 1) { ph -= Math.floor(ph); const g = d > 1.6 ? beat / 4 : beat / 2, tt = lerp(t, Math.min(Math.round(t / g) * g, dur - 0.05), qa);
          if (!out.length || tt - out[out.length - 1].t > 0.03) out.push({ t: tt, raw: t }); } }
      return out; }
    function job(o, sr, opt) {
      opt = opt || {}; const sty = o.arr, dur = o.dur, n = Math.floor(dur * sr), m = clamp(o.musical, 0, 1);
      const need = ['kick', 'snare', 'snareTap', 'cabasa', 'crash', 'bassPizz', 'harp', 'piano', 'violinPizz', 'violaPizz', 'celloPizz', 'cello', 'viola', 'violin', 'celloTrem', 'violaTrem', 'violinTrem', 'bass', 'bassArcoHi', 'bdrum', 'cymSwell'];
      for (const k of need) if (!(S[k] && S[k].length)) throw new Error('samples not decoded yet: ' + k);
      const LY = {}; for (const k of LAYERS) LY[k] = [new Float32Array(n), new Float32Array(n)];
      const voices = [], ops = [], plan = { style: sty, notes: [[], []], acc: [] };
      const gL = Object.assign({}, ...LAYERS.map(k => ({ [k]: 1 })), G[sty], o.layerGain || {});
      const PANS = { L: [1, 0], R: [0, 1], C: [0.7071, 0.7071] };
      // ---- voices ----
      const shot = (layer, x, t, hz, g, maxLen, pan, lp, env) => { if (!x) return; const i0 = Math.max(0, Math.floor(t * sr)); if (i0 >= n) return; const d = x.data, rate = (hz ? hz / x.hz : 1) * x.sr / sr, nn = Math.min(Math.floor(maxLen * sr), n - i0), O = LY[layer], P = PANS[pan] || pan;
        let ps = x.on, i = 0, f1 = 0; voices.push({ i0, run: (c1) => { for (; i < nn && ps < d.length - 1 && i0 + i < c1; i++, ps += rate) { const ip = ps | 0; let y = d[ip] + (d[ip + 1] - d[ip]) * (ps - ip);
          if (lp) { const c = typeof lp === 'function' ? lp(i0 + i, i / sr) : lp; f1 += (y - f1) * c; y = f1; } const e = (env ? env(i / sr) : 1) * Math.min(1, (nn - i) / (0.02 * sr)) * g; O[0][i0 + i] += y * e * P[0]; O[1][i0 + i] += y * e * P[1]; } } }); };
      const pick = (set, hz) => { const near = nearest(set, hz), c = set.filter(x => Math.abs(Math.log2(x.hz / near.hz)) < 0.05); return c[(pick.rr = (pick.rr || 0) + 1) % c.length]; };
      const rr = {}; const hit = (layer, name, t, g, pan, len) => { const L = S[name]; rr[name] = (rr[name] || 0) + 1; shot(layer, L[rr[name] % L.length], t, 0, g, len || 3, pan || 'C'); };
      // sustained: notes [{t, hz}] crossfade legato (as RiverOrch), stereo pan, gainAt(i)
      const sus = (layer, set, notes, gainAt, pan, xf) => { const O = LY[layer], P = PANS[pan] || pan, vs = []; let ni = -1; xf = xf || 0.12;
        ops.push((c0, c1) => { for (let i = c0; i < c1; i++) { const tt = i / sr;
          while (ni + 1 < notes.length && notes[ni + 1].t <= tt) { ni++; const nt = notes[ni], x = nearest(set, nt.hz); vs.forEach(v => { v.tgt = 0; v.step = 1 / (xf * sr); }); vs.push({ x, pos: x.on, rate: nt.hz / x.hz * x.sr / sr, g: 0, tgt: 1, step: 1 / (xf * sr) }); }
          let y = 0; for (let j = vs.length - 1; j >= 0; j--) { const v = vs[j], d = v.x.data; v.g += v.g < v.tgt ? Math.min(v.step, v.tgt - v.g) : -Math.min(v.step, v.g - v.tgt);
            if (v.g <= 0 && v.tgt === 0) { vs.splice(j, 1); continue; } const ip = v.pos | 0; y += (d[ip] + (d[ip + 1] - d[ip]) * (v.pos - ip)) * v.g; v.pos += v.rate; if (v.pos >= v.x.le) v.pos -= v.x.le - v.x.ls; }
          const g = gainAt(i); O[0][i] += y * g * P[0]; O[1][i] += y * g * P[1]; } }); };
      // gliding sustained voice: rate follows hzAt(i) continuously; re-voices (crossfade) when > 2 semitones from its recording
      const glide = (layer, set, hzAt, gainAt, pan) => { const O = LY[layer], P = PANS[pan], vs = [];
        ops.push((c0, c1) => { for (let i = c0; i < c1; i++) { const f = hzAt(i), top = vs[vs.length - 1];
          if (!top || Math.abs(12 * Math.log2(f / top.x.hz)) > 2) { const x = nearest(set, f); vs.forEach(v => { v.tgt = 0; }); vs.push({ x, pos: x.on + 0.2 * x.sr, g: 0, tgt: 1 }); }
          let y = 0; for (let j = vs.length - 1; j >= 0; j--) { const v = vs[j], d = v.x.data; v.g += (v.tgt - v.g) * (1 / (0.08 * sr)); if (v.tgt === 0 && v.g < 1e-4) { vs.splice(j, 1); continue; }
            const ip = v.pos | 0; y += (d[ip] + (d[ip + 1] - d[ip]) * (v.pos - ip)) * v.g; v.pos += f / v.x.hz * v.x.sr / sr; if (v.pos >= v.x.le) v.pos -= v.x.le - v.x.ls; }
          const g = gainAt(i); O[0][i] += y * g * P[0]; O[1][i] += y * g * P[1]; } }); };
      const STR_SUS = M('cello', 'viola', 'violin'), STR_TREM = M('celloTrem', 'violaTrem', 'violinTrem'), PIZZ = M('celloPizz', 'violaPizz', 'violinPizz'), BASS = M('bass', 'bassArcoHi');
      let accT, T;
      if (sty === 'canyon') {
        const ob = Object.assign({}, o, { bpm: 84 }); T = SYN.tables(ob); const beat = 60 / 84, qa = sstep(0.1, 0.8, m), bar = 4 * beat;
        const contG = 1 - 0.7 * sstep(0, 0.9, m), noteG = 0.8 * sstep(0, 0.5, m), texG = 0.07 + 0.12 * sstep(0, 0.6, m), droneG = 0.22 * Math.pow(m, 1.2), att = lerp(0.004, 0.05, m), tau = lerp(0.10, 0.5, m);
        [T.L, T.R].forEach((W, ch) => { const pan = ch ? 'R' : 'L', on = canyonOnsets(W.dens, dur, ob, ch ? 0.5 : 0.999);
          let f = W.pitch[0]; const ga = 1 - Math.exp(-1 / (sr * lerp(0.003, 0.03, m)));
          const fA = new Float32Array(n); ops.push((c0, c1) => { for (let i = c0; i < c1; i++) { f += (tab(W.pitch, i / (n - 1)) - f) * ga; fA[i] = f; } });   // same glide as the original oscillator
          glide('cont', STR_SUS, i => fA[i], () => contG * 0.55, pan);
          on.forEach(x => { const hz = tab(W.pitch, x.t / dur); plan.notes[ch].push({ t: x.t, raw: x.raw, hz }); hit('tex', 'cabasa', x.t, texG * 1.2 * clamp(tab(W.rough, x.t / dur) / 35, 0, 1.6) * 2, pan, 0.06); /* original: texture noise bursts on each note */ shot('lead', pick(M('harp'), hz), x.t, hz, noteG * 0.5, 2.5, pan, 0, a => Math.min(1, a / att) * Math.exp(-a / tau)); });
          sus('tex', STR_TREM, on.map(x => ({ t: x.t, hz: tab(W.pitch, x.t / dur) })).filter((x, k, a) => k === 0 || true), i => texG * clamp(tab(W.rough, i / (n - 1)) / 35, 0, 1.6), pan); });
        const rf = T.rootHz / 2;
        if (droneG > 0) { sus('drone', BASS, [{ t: 0, hz: rf }], () => droneG * 0.5, 'C', 0.05); sus('drone', STR_SUS, [{ t: 0, hz: rf * 1.5 }], () => droneG * 0.5 * 0.35, 'C', 0.05); sus('drone', STR_SUS, [{ t: 0, hz: rf * 2 }], () => droneG * 0.5 * 0.2, 'C', 0.05);
          for (let t = 0; t < dur - 0.1; t += bar) shot('drone', pick(S.bassPizz, rf), t, rf, droneG * 0.5, 1.5, 'C'); }
        accT = T.accents.map(a => { const t = a.i / (N - 1) * dur; return { t: lerp(t, Math.round(t / (beat / 2)) * (beat / 2), qa), raw: t, a: clamp(a.d / 5, 0.25, 1.1), d: a.d }; });
        accT.forEach(A => { hit('acc', 'bdrum', A.t, 0.55 * A.a); hit('acc', 'crash', A.t, 0.25 * A.a * lerp(0.4, 1, m), 'C', lerp(0.6, 1.6, m)); });
        plan.acc = accT;
      } else {
        const PL = STY.plan(Object.assign({}, o, { style: sty })), { st, mel, acc, beat, bar, nb, chords, lift, drops } = PL; T = PL.T;
        const root = T.rootHz, noteG = 0.35 + 0.45 * sstep(0, 0.5, m), backG = sstep(0, 0.6, m);
        const chordHz = (b) => { const c = st.prog[chords[Math.min(nb - 1, b)]]; return [c[0], c[0] + (c[1] === 'm' ? 3 : 4), c[0] + 7].map(s => root * Math.pow(2, s / 12)); };
        const dropAt = (t) => { for (const d of drops) { if (t >= d.t - 2 * bar && t < d.t) return { pre: (t - (d.t - 2 * bar)) / (2 * bar), d }; if (t >= d.t && t < d.t + 4 * bar) return { post: (t - d.t) / (4 * bar), d }; } return null; };
        // melody: one voice per wall (original onsets, style-grid nudge, pitch read at the raw terrain position)
        mel.forEach((notes, ch) => { const pan = ch ? 'R' : 'L';
          notes.forEach((nt, k) => { plan.notes[ch].push(nt); const next = k + 1 < notes.length ? notes[k + 1].t : dur, len = Math.min(2.2, next - nt.t + 0.25);
            if (sty === 'country') shot('lead', pick(ch ? M('violinPizz', 'violaPizz', 'celloPizz') : S.harp, nt.hz), nt.t, nt.hz, noteG * 0.9, Math.min(2.5, len + 0.8), pan, ch ? 0 : 0.35);   // L guitar-ish (harp), R banjo-ish (bright pizz)
            else if (sty === 'edm') { const dk = lerp(0.18, 0.35, m), att = lerp(0.003, 0.02, m);   // filtered pluck: cutoff follows the drop envelope like the original saw pluck
              shot('lead', pick(PIZZ, nt.hz), nt.t, nt.hz, noteG * 0.8, len, pan, (i, a) => { const dz = dropAt(i / sr); return (dz && dz.pre !== undefined ? lerp(0.25, 0.04, dz.pre) : dz ? lerp(0.6, 0.25, dz.post) : 0.25) * (0.4 + 0.6 * Math.exp(-a / 0.15)) * 2.2; }, a => Math.min(1, a / att) * Math.exp(-a / dk)); }
            else shot('lead', pick(S.piano, nt.hz), nt.t, nt.hz, noteG, len, pan, 0); }); });
        // wall texture: roughness -> recorded string tremolo at the wall's own pitch (original: roughness noise)
        [T.L, T.R].forEach((W, ch) => sus('tex', STR_TREM, mel[ch].map(x => ({ t: x.t, hz: x.hz })), i => 0.06 * clamp(tab(W.rough, i / (n - 1)) / 35, 0, 1.6), ch ? 'R' : 'L'));
        // backing at the style tempo, scaled by Musical
        const nBeats = Math.floor(dur / beat);
        if (backG > 0) for (let b = 0; b < nBeats; b++) { const t = b * beat, bi = Math.floor(t / bar), bb = b % 4, L = lift[Math.min(nb - 1, bi)], ch = chordHz(bi), dz = dropAt(t), pre = dz && dz.pre !== undefined;
          if (sty === 'edm') {
            if (!pre || dz.pre < 0.5) hit('drums', 'kick', t, 0.8 * backG);
            hit('drums', 'cabasa', t + beat / 2, 0.16 * backG, 'C', 0.15);                                   // offbeat hat
            shot('bass', pick(S.bassPizz, ch[0] / 2), t + beat / 2, ch[0] / 2, 0.32 * backG, beat * 0.45, 'C');   // offbeat bass
            if (pre) for (let s = 0; s < 4; s++) hit('drums', 'snareTap', t + s * beat / 4, 0.05 * backG * (1 + 3 * dz.pre), 'C', 0.2);   // riser roll
          } else if (sty === 'country') {
            for (let s = 0; s < 2; s++) { const g = (s === 0 && (bb === 1 || bb === 3) ? 0.2 : 0.07) * backG; hit('drums', 'snareTap', t + s * beat / 2, g, 'C', 0.4); hit('drums', 'cabasa', t + s * beat / 2, g * 0.8, 'C', 0.25); }   // train beat (brushes: snare taps + cabasa hiss)
            if (bb === 0) hit('drums', 'kick', t, 0.35 * backG);
            const bh = (bb % 2 === 0 ? ch[0] : ch[2]) / 2; shot('bass', pick(S.bassPizz, bh), t, bh, 0.35 * backG, beat * 0.8, 'C');   // root-fifth bass
            if (bb === 1 || bb === 3) ch.forEach((f, k) => shot('harm', pick(S.harp, f), t + k * 0.012, f, 0.12 * backG, 0.6, 'C'));   // strum on 2 and 4
          } else {
            if (bb === 0 || bb === 2) hit('drums', 'kick', t, 0.6 * backG); if (bb === 1 || bb === 3) { hit('drums', 'snare', t, 0.28 * backG); hit('drums', 'kick', t, 0.12 * backG); }   // backbeat
            hit('drums', 'cabasa', t, 0.07 * backG, 'C', 0.12); hit('drums', 'cabasa', t + beat / 2, 0.07 * backG, 'C', 0.12);
            shot('bass', pick(S.bassPizz, ch[0] / 2), t, ch[0] / 2, 0.3 * backG, beat * 0.45, 'C'); shot('bass', pick(S.bassPizz, ch[0] / 2), t + beat / 2, ch[0] / 2, 0.22 * backG, beat * 0.4, 'C');
            ch.forEach(f => shot('harm', pick(S.piano, f), t, f, (L ? 0.1 : 0.06) * backG, beat * 0.5, 'C'));   // chord stabs, louder in a lift
          } }
        // pads: EDM sidechained string chord (supersaw stand-in), Pop lift pad
        if (backG > 0 && sty !== 'country') for (let k = 0; k < 3; k++) { const notes = []; for (let b = 0; b < nb; b++) notes.push({ t: b * bar, hz: chordHz(b)[k] });
          sus('pad', STR_SUS, notes, i => { const t = i / sr, bi = Math.min(nb - 1, Math.floor(t / bar)); let g = sty === 'edm' ? 0.03 * (1 - 0.75 * Math.exp(-((t % beat) / 0.11))) : (lift[bi] ? 0.035 : 0.012);
            const dz = sty === 'edm' ? dropAt(t) : null; if (dz) g *= dz.pre !== undefined ? 1 - 0.6 * dz.pre : 1.5; return g * backG * 3; }, 'C', 0.15); }
        // rapids at the raw terrain times (identical to the originals); EDM: big ones are drops with a riser
        for (const a of acc) { const A = clamp(a.d / 5, 0.25, 1.1); hit('acc', 'kick', a.t, 0.55 * A); hit('acc', 'crash', a.t, 0.25 * A * lerp(0.4, 1, m), 'C', lerp(0.6, 1.6, m));
          if (sty === 'edm' && a.d >= 3) { hit('acc', 'kick', a.t, 1.0 * backG + 0.3); hit('acc', 'crash', a.t, 0.4 * backG, 'C', 2.5); const Y = S.cymSwell[0]; shot('acc', Y, a.t - Y.peak, 0, 0.18 * backG * 2, 8, 'C'); } }
        plan.acc = acc.map(a => ({ t: a.t, d: a.d })); plan.bpm = st.bpm; plan.chords = chords;
      }
      ops.push((c0, c1) => { for (const v of voices) if (v.i0 < c1) v.run(c1); });
      // ---- mix, hall, master (original per-style master gain + tanh) ----
      const out = [new Float32Array(n), new Float32Array(n)], IR = RO.getIR(); let h = null, wetAcc = null;
      if (IR && !opt.layers) { h = IR.data.map(c => { const r = IR.sr / sr, len = Math.floor(c.length / r), y = new Float64Array(len); for (let i = 0; i < len; i++) { const p = i * r, ip = p | 0; y[i] = ip + 1 < c.length ? c[ip] + (c[ip + 1] - c[ip]) * (p - ip) : 0; } return y; });
        let e = 0; for (const c of h) for (let i = 0; i < c.length; i++) e += c[i] * c[i]; const nrm = 1 / Math.sqrt(e / 2); h.forEach(c => { for (let i = 0; i < c.length; i++) c[i] *= nrm; }); }
      const WET = 0.08, nf = Math.floor(0.08 * sr), mg = { canyon: 0.9, edm: 0.85, country: 0.9, pop: 0.65 }[sty], dr = sty === 'canyon' ? 1.1 : 1.15, BK = sty === 'canyon' ? 1 : 0.8;
      let done = 0;
      function step(k) { const c0 = done, c1 = Math.min(n, done + Math.max(1, k | 0)); if (c0 >= n) return done;
        for (const f of ops) f(c0, c1);
        for (let i = c0; i < c1; i++) for (let c = 0; c < 2; c++) { let v = 0; for (const L of LAYERS) v += LY[L][c][i] * gL[L] * (L === 'lead' || L === 'tex' || L === 'cont' ? 1 : BK); out[c][i] = v * MK[sty]; }
        if (h) { const C = c1 - c0, inL = new Float64Array(C), inR = new Float64Array(C); for (let i = 0; i < C; i++) { inL[i] = 0.8 * out[0][c0 + i] + 0.2 * out[1][c0 + i]; inR[i] = 0.8 * out[1][c0 + i] + 0.2 * out[0][c0 + i]; }
          if (!wetAcc) wetAcc = [new Float64Array(n), new Float64Array(n)]; const [wL, wR] = RO.convolve2(inL, inR, h[0], h[1], Math.min(C + h[0].length, n - c0));
          for (let i = 0; i < wL.length; i++) { wetAcc[0][c0 + i] += wL[i]; wetAcc[1][c0 + i] += wR[i]; } for (let i = c0; i < c1; i++) { out[0][i] += wetAcc[0][i] * WET; out[1][i] += wetAcc[1][i] * WET; } }
        if (!opt.layers) for (let i = c0; i < c1; i++) { const ev = Math.min(1, i / nf, (n - 1 - i) / nf) * mg; for (let c = 0; c < 2; c++) out[c][i] = Math.tanh(out[c][i] * ev * dr) / dr; }
        done = c1; return done; }
      const ER = 120, ne = Math.floor(dur * ER), env = [0, 1, 2, 3].map(() => new Float32Array(ne));
      return { n, sr, step, get done() { return done; }, L: out[0], R: out[1], layers: LY, tables: T, plan, bandEnv: env, ER };
    }
    function render(o, sr, opt) { const j = job(o, sr, opt); j.step(j.n); return j; }
    return { job, render };
  }
  return { create, G, LAYERS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RiverArr;
