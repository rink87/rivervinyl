/* STRATA ORCHESTRA style: same 4 approximate height bands and the same terrain mapping as Strata (presence -> volume, the band's
   own contour -> pitch inside its own register, steepness/roughness -> density + playing technique, Musical = scale snap + grid nudge,
   rapid accents at the raw terrain times), but every sound is a real recording (VSCO 2 Community Edition, CC0) and the room is a
   real concert hall (OpenAIR Jack Lyons Concert Hall IR, CC BY 4.0) applied by convolution. No synth tones, no algorithmic reverb.
     band 1  0-300 m   schist        double bass (sustain), soft tuba doubling           41-82 Hz
     band 2  300-650 m Tonto/Muav    cello section: arco when gentle, pizzicato when steep/rough   110-220 Hz
     band 3  650-1000 m Redwall/Supai viola section + French horn (low level, tracking low-pass under its 2nd harmonic)   262-523 Hz
     band 4  1000 m+   rim           violin section, flute where the band is thin      659-1319 Hz
   Roughness -> crossfade from sustain (arco/vibrato) to tremolo samples of the same section.
   Seating: L wall in the left ear, R wall in the right ear; inside each ear the sections sit slightly apart like an orchestra. */
const RiverOrch = (() => {
  const TAU = 6.283185307179586, BPM = 84;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const SAMPLES = {}; let IR = null;
  // seat = position inside the wall's own ear (0 = hard to that side, 1 = centre); horn sits behind the violas
  const SEAT = { bass: 0.42, tuba: 0.5, cello: 0.34, celloPizz: 0.34, viola: 0.24, horn: 0.46, violin: 0.1, flute: 0.3 };
  const GAIN = { bass: 1.0, tuba: 0.2, cello: 0.85, celloPizz: 0.9, viola: 1.25, horn: 0.38, violin: 1.45, flute: 1.15 };
  function fft(re, im, inv) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let l = 2; l <= n; l <<= 1) { const a = (inv ? 2 : -2) * Math.PI / l, wr = Math.cos(a), wi = Math.sin(a), h = l >> 1;
      for (let i = 0; i < n; i += l) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
  // convolve two real signals a,b with two real IRs ha,hb using one complex FFT each way (a + i b) per IR pair
  function convolve2(a, b, ha, hb) { const n = a.length, m = ha.length; let N = 1; while (N < n + m) N <<= 1;
    const re = new Float64Array(N), im = new Float64Array(N); re.set(a); im.set(b); fft(re, im, false);
    const hr = new Float64Array(N), hi = new Float64Array(N); hr.set(ha); hi.set(hb); fft(hr, hi, false);
    // spectra of the real IRs: HA(k) = (H(k) + conj H(N-k)) / 2, HB(k) = (H(k) - conj H(N-k)) / 2i ; same for the inputs
    const oR = new Float64Array(N), oI = new Float64Array(N);
    for (let k = 0; k < N; k++) { const j = (N - k) & (N - 1);
      const Ar = (re[k] + re[j]) / 2, Ai = (im[k] - im[j]) / 2, Br = (im[k] + im[j]) / 2, Bi = -(re[k] - re[j]) / 2;
      const Har = (hr[k] + hr[j]) / 2, Hai = (hi[k] - hi[j]) / 2, Hbr = (hi[k] + hi[j]) / 2, Hbi = -(hr[k] - hr[j]) / 2;
      const Yar = Ar * Har - Ai * Hai, Yai = Ar * Hai + Ai * Har, Ybr = Br * Hbr - Bi * Hbi, Ybi = Br * Hbi + Bi * Hbr;
      oR[k] = Yar - Ybi; oI[k] = Yai + Ybr; }   // Ya + i Yb
    fft(oR, oI, true); const ya = new Float32Array(n), yb = new Float32Array(n); for (let i = 0; i < n; i++) { ya[i] = oR[i] / N; yb[i] = oI[i] / N; } return [ya, yb]; }
  function create(RD, SYN, STR) {
    const N = RD.N, tab = SYN.tab;
    function rawOnsets(dens, dur, ph0) { const beat = 60 / BPM, st = 4000, out = []; let ph = ph0;   // identical to Strata's onset generator
      for (let k = 0; k < st; k++) { const t = k / st * dur, d = tab(dens, k / (st - 1)); ph += d * (dur / st) / beat;
        if (ph >= 1) { ph -= Math.floor(ph); if (!out.length || t - out[out.length - 1] > 0.03) out.push(t); } } return out; }
    const nearest = (set, hz) => set.reduce((b, x) => Math.abs(Math.log(hz / x.hz)) < Math.abs(Math.log(hz / b.hz)) ? x : b);
    // legato sample voice: each terrain note starts a new voice at its exact pitch (nearest recorded note, <= ~3 semitones of stretch),
    // the previous voice crossfades out. gainAt(i) multiplies the output (presence, technique mix, availability).
    function legato(O, set, notes, sr, n, gainAt, lpHz) {
      const vs = []; let ni = -1, f1 = 0, f2 = 0, cL = 1;
      for (let i = 0; i < n; i++) { const tt = i / sr;
        while (ni + 1 < notes.length && notes[ni + 1].t <= tt) { ni++; const nt = notes[ni], x = nearest(set, nt.hz), leg = vs.some(v => v.tgt > 0);
          vs.forEach(v => { v.tgt = 0; v.step = 1 / (0.18 * sr); });
          vs.push({ x, pos: x.on + (leg ? 0.18 * x.sr : 0), rate: nt.hz / x.hz * x.sr / sr, g: 0, tgt: 1, step: 1 / ((leg ? 0.14 : 0.05) * sr) });
          if (lpHz) cL = 1 - Math.exp(-TAU * Math.min(lpHz * nt.hz, 0.45 * sr) / sr); }
        let y = 0;
        for (let j = vs.length - 1; j >= 0; j--) { const v = vs[j], d = v.x.data; v.g += v.g < v.tgt ? Math.min(v.step, v.tgt - v.g) : -Math.min(v.step, v.g - v.tgt);
          if (v.g <= 0 && v.tgt === 0) { vs.splice(j, 1); continue; }
          const ip = v.pos | 0, fr = v.pos - ip; y += (d[ip] + (d[ip + 1] - d[ip]) * fr) * v.g; v.pos += v.rate; if (v.pos >= v.x.le) v.pos -= v.x.le - v.x.ls; }
        if (lpHz) { f1 += (y - f1) * cL; f2 += (f1 - f2) * cL; y = f2; }
        O[i] += y * gainAt(i); } }
    function oneshot(O, x, i0, rate, g, maxLen, sr, lpF) { const d = x.data, nn = Math.min(Math.floor(maxLen * sr), O.length - i0), c = lpF ? 1 - Math.exp(-TAU * Math.min(lpF, 0.45 * sr) / sr) : 1; let ps = x.on, f1 = 0, f2 = 0;
      for (let i = 0; i < nn && ps < d.length - 1; i++, ps += rate) { const ip = ps | 0; let y = d[ip] + (d[ip + 1] - d[ip]) * (ps - ip); if (lpF) { f1 += (y - f1) * c; f2 += (f1 - f2) * c; y = f2; } O[i0 + i] += y * g * Math.min(1, (nn - i) / (0.03 * sr)); } }
    function smooth(a, sec, sr) { const c = 1 - Math.exp(-1 / (sec * sr)); let s = a[0]; for (let i = 0; i < a.length; i++) { s += (a[i] - s) * c; a[i] = s; } return a; }
    function render(o, sr, opt) {
      opt = opt || {}; if (!ready()) throw new Error('orchestra samples not decoded yet');
      const T = STR.tables(o), m = clamp(o.musical, 0, 1), dur = o.dur, n = Math.floor(dur * sr), qa = sstep(0.1, 0.8, m), beat = 60 / BPM;
      const out = [new Float32Array(n), new Float32Array(n)], ER = 120, ne = Math.floor(dur * ER), env = [0, 1, 2, 3].map(() => new Float32Array(ne));
      const plan = { notes: [[], []], tech: {} }, S = SAMPLES;
      const put = (src, ch, inst) => { const s = SEAT[inst], gx = Math.sin(s * Math.PI / 4);   // equal-power, at most half-way to centre
        const a = out[ch], b = out[1 - ch], gn = Math.cos(s * Math.PI / 4); for (let i = 0; i < n; i++) { const v = src[i]; if (v) { a[i] += v * gn; b[i] += v * gx; } } };
      const ctl = (B, key, f) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = f(tab(B[key], i / (n - 1)), i); return a; };
      [T.L, T.R].forEach((BS, ch) => BS.forEach((B, k) => {
        if (opt.solo !== undefined && opt.solo !== k) return;
        const raw = rawOnsets(B.dens, dur, ch ? 0.5 : 0.999), notes = raw.map(t => { const g = tab(B.dens, t / dur) > 1.6 ? beat / 4 : beat / 2; return { raw: t, t: lerp(t, Math.min(Math.round(t / g) * g, dur - 0.05), qa), hz: tab(B.pitch, t / dur), rawHz: tab(B.raw, t / dur), band: k }; });
        plan.notes[ch].push(...notes);
        const pres = smooth(ctl(B, 'pres', v => v), 0.08, sr), trem = smooth(ctl(B, 'rough', v => sstep(12, 38, v)), 0.4, sr);   // roughness -> tremolo share
        const eqp = (w) => [Math.cos(w * Math.PI / 2), Math.sin(w * Math.PI / 2)];
        const bus = (inst) => { const a = new Float32Array(n); a.inst = inst; return a; }, buses = [];
        if (k === 0) { const b = bus('bass'), t = bus('tuba');
          legato(b, S.bass, notes, sr, n, i => pres[i] * eqp(trem[i])[0] * GAIN.bass, 3.0);
          legato(b, S.bassTrem, notes, sr, n, i => pres[i] * eqp(trem[i])[1] * GAIN.bass * 0.9, 3.0);
          legato(t, S.tuba, notes, sr, n, i => pres[i] * GAIN.tuba, 3.0); buses.push(b, t); }
        else if (k === 1) {   // per-note technique: pizzicato when the band is steep or rough, arco when gentle (with hysteresis)
          let pz = false, rr = 0; const c = bus('cello'), p = bus('celloPizz'), arcoW = new Float32Array(n); let cnt = 0;
          notes.forEach(nt => { const u = tab(B.steep, nt.raw / dur) / 40 + tab(B.rough, nt.raw / dur) / 50; pz = pz ? u > 0.9 : u > 1.1; nt.pizz = pz; if (pz) cnt++; });
          let ni = -1, w = 1; for (let i = 0; i < n; i++) { while (ni + 1 < notes.length && notes[ni + 1].t <= i / sr) ni++; const tgt = ni >= 0 && notes[ni].pizz ? 0 : 1; w += (tgt - w) * (1 / (0.15 * sr)); arcoW[i] = w; }
          legato(c, S.cello, notes, sr, n, i => pres[i] * arcoW[i] * eqp(trem[i])[0] * GAIN.cello, 1.7);
          legato(c, S.celloTrem, notes, sr, n, i => pres[i] * arcoW[i] * eqp(trem[i])[1] * GAIN.cello * 0.9, 1.7);
          notes.forEach(nt => { if (!nt.pizz) return; const pr = tab(B.pres, nt.raw / dur); if (pr < 0.02) return;
            const near = nearest(S.celloPizz, nt.hz), cands = S.celloPizz.filter(x => Math.abs(Math.log2(x.hz / near.hz)) < 0.05), x = cands[rr++ % cands.length];   // round-robin
            oneshot(p, x, Math.floor(nt.t * sr), nt.hz / x.hz * x.sr / sr, pr * GAIN.celloPizz, 1.3, sr, 2.0 * nt.hz); });
          plan.tech['band2_' + 'LR'[ch]] = { pizz: cnt, arco: notes.length - cnt }; buses.push(c, p); }
        else if (k === 2) { const v = bus('viola'), h = bus('horn');
          legato(v, S.viola, notes, sr, n, i => pres[i] * eqp(trem[i])[0] * GAIN.viola, 2.4);
          legato(v, S.violaTrem, notes, sr, n, i => pres[i] * eqp(trem[i])[1] * GAIN.viola * 0.9, 2.4);
          // horn only where a recorded horn note is within 3 semitones (VSCO has A3, C4, D5 here); tracking LP at 1.5x f0 keeps its 2nd harmonic down
          const av = new Float32Array(n); let ni = -1, w = 0; for (let i = 0; i < n; i++) { while (ni + 1 < notes.length && notes[ni + 1].t <= i / sr) ni++;
            const tg = ni >= 0 && Math.abs(12 * Math.log2(notes[ni].hz / nearest(S.horn, notes[ni].hz).hz)) <= 3 ? 1 : 0; w += (tg - w) * (1 / (0.25 * sr)); av[i] = w; }
          legato(h, S.horn, notes, sr, n, i => pres[i] * av[i] * GAIN.horn, 1.5); buses.push(v, h); }
        else { const vl = bus('violin'), fl = bus('flute'), thin = smooth(ctl(B, 'pres', v => 1 - sstep(0.2, 0.45, v)), 0.6, sr);   // thin rim band -> flute
          legato(vl, S.violin, notes, sr, n, i => pres[i] * eqp(thin[i])[0] * eqp(trem[i])[0] * GAIN.violin, 0);
          legato(vl, S.violinTrem, notes, sr, n, i => pres[i] * eqp(thin[i])[0] * eqp(trem[i])[1] * GAIN.violin * 0.9, 0);
          legato(fl, S.flute, notes, sr, n, i => pres[i] * eqp(thin[i])[1] * GAIN.flute * 1.6, 0); buses.push(vl, fl); }
        for (const b of buses) put(b, ch, b.inst);
        for (let e = 0; e < ne; e++) env[k][e] += 0.5 * tab(B.pres, e / (ne - 1));
      }));
      // rapids at their exact raw terrain times: timpani for big drops, bass drum for the rest, cymbal swell peaking on the biggest
      const acc = opt.solo === undefined ? SYN.accents.map(a => ({ t: a.i / (N - 1) * dur, a: clamp(a.d / 5, 0.25, 1.1), d: a.d })) : [];
      if (acc.length) { const ds = acc.map(a => a.d).sort((p, q) => q - p), big = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.4))], top = ds[Math.min(ds.length - 1, 1)];
        let rt = 0, rb = 0; const pk = S.cymSwell[0].peak;
        acc.forEach(A => { const i0 = Math.round(A.t * sr), C = A.d >= big ? (A.kind = 'timpani', S.timp[rt++ % S.timp.length]) : (A.kind = 'bassdrum', S.bdrum[rb++ % S.bdrum.length]);
          const g = A.a * (A.kind === 'timpani' ? 0.9 : 0.75), d = C.data, rate = C.sr / sr; let ps = C.on;
          for (let i = 0; i + i0 < n && ps < d.length - 1; i++, ps += rate) { const ip = ps | 0, v = (d[ip] + (d[ip + 1] - d[ip]) * (ps - ip)) * g * 0.7071; out[0][i0 + i] += v; out[1][i0 + i] += v; }
          if (A.d >= top) { A.cymbal = true; const Y = S.cymSwell[0], yd = Y.data, st = i0 - Math.round(pk * sr), yr = Y.sr / sr; let q = 0;   // swell starts early so its peak lands on the accent
            for (let i = 0; q < yd.length - 1; i++, q += yr) { const j = st + i; if (j < 0 || j >= n) continue; const qi = q | 0, v = (yd[qi] + (yd[qi + 1] - yd[qi]) * (q - qi)) * 0.35 * A.a; out[0][j] += v * 0.8; out[1][j] += v; } } }); }
      plan.acc = acc;
      // concert-hall convolution (the only reverb in this style; the page's algorithmic reverb send is bypassed for it)
      const dry = [out[0], out[1]];
      if (IR && opt.dry !== true) { const h = IR.data.map(c => { const r = IR.sr / sr, len = Math.floor(c.length / r), y = new Float64Array(len); for (let i = 0; i < len; i++) { const p = i * r, ip = p | 0; y[i] = ip + 1 < c.length ? c[ip] + (c[ip + 1] - c[ip]) * (p - ip) : 0; } return y; });
        let e = 0; for (const c of h) for (let i = 0; i < c.length; i++) e += c[i] * c[i]; const nrm = 1 / Math.sqrt(e / 2); h.forEach(c => { for (let i = 0; i < c.length; i++) c[i] *= nrm; });
        const inL = new Float64Array(n), inR = new Float64Array(n); for (let i = 0; i < n; i++) { inL[i] = 0.8 * dry[0][i] + 0.2 * dry[1][i]; inR[i] = 0.8 * dry[1][i] + 0.2 * dry[0][i]; }
        const [wL, wR] = convolve2(inL, inR, h[0], h[1]), WET = 0.11 * (o.verbScale === undefined ? 1 : o.verbScale);
        for (let i = 0; i < n; i++) { dry[0][i] += wL[i] * WET; dry[1][i] += wR[i] * WET; } }
      const nf = Math.floor(0.08 * sr), MG = 1.3; for (let i = 0; i < n; i++) { const ev = Math.min(1, i / nf, (n - 1 - i) / nf) * MG; for (let c = 0; c < 2; c++) out[c][i] = Math.tanh(out[c][i] * ev * 1.05) / 1.05; }
      return { L: out[0], R: out[1], tables: T, plan, bandEnv: env, ER };
    }
    return { render, tables: STR.tables, REG: STR.REG };
  }
  const NEED = ['bass', 'bassTrem', 'tuba', 'cello', 'celloTrem', 'celloPizz', 'viola', 'violaTrem', 'horn', 'violin', 'violinTrem', 'flute', 'timp', 'bdrum', 'cymSwell'];
  const ready = () => NEED.every(k => SAMPLES[k] && SAMPLES[k].length) && !!IR;
  function addSamples(name, list) { SAMPLES[name] = list.map(q => { const d = q.data; let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    let c = 0; while (c < d.length && Math.abs(d[c]) <= 0.02 * pk) c++; const on = q.peakAt !== undefined ? 0 : Math.max(0, c - Math.round(0.005 * q.sr));
    let peak = 0; if (q.peakAt !== undefined) { let b = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[b])) b = i; peak = b / q.sr; }   // swell: real peak after decoding
    return { hz: q.hz, sr: q.sr, data: d, on, peak, ls: on + Math.round(q.ls * q.sr), le: Math.min(d.length - 2, on + Math.round(q.le * q.sr)) }; }); }
  function setIR(chans, sr) { let pk = 0; for (const c of chans) for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i]));   // drop codec delay before the direct sound
    let s = 0; while (s < chans[0].length && Math.abs(chans[0][s]) < 0.05 * pk && Math.abs(chans[1][s]) < 0.05 * pk) s++; s = Math.max(0, s - Math.round(0.002 * sr));
    IR = { sr, data: chans.map(c => c.slice(s)) }; }
  return { create, addSamples, setIR, ready, SAMPLES, SEAT, GAIN };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RiverOrch;
