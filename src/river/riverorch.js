/* STRATA ORCHESTRA style: same 4 approximate height bands and the same terrain mapping as Strata (presence -> volume, the band's
   own contour -> pitch inside its own register, steepness/roughness -> density + playing technique, Musical = scale snap + grid nudge,
   rapid accents at the raw terrain times), but every sound is a real recording (VSCO 2 Community Edition, CC0) and the room is a
   real concert hall (OpenAIR Jack Lyons Concert Hall IR, CC BY 4.0) applied by convolution. No synth tones, no algorithmic reverb.
   Default sections (o.inst omitted or default ids; output is sample-identical to the v1 engine, see riverorch_v1.js):
     band 1  0-300 m   schist        double bass (sustain), soft tuba doubling           41-82 Hz
     band 2  300-650 m Tonto/Muav    cello section: arco when gentle, pizzicato when steep/rough   110-220 Hz
     band 3  650-1000 m Redwall/Supai viola section + French horn (low level, tracking low-pass under its 2nd harmonic)   262-523 Hz
     band 4  1000 m+   rim           violin section, flute where the band is thin      659-1319 Hz
   Roughness -> crossfade from sustain (arco/vibrato) to tremolo samples of the same section.
   v2: (1) any band can be re-voiced with another recorded instrument (INST catalogue), accents have alternative kits, and an optional
   recorded drum groove (84 BPM, the note plan's own grid) can be added for the style presets. The note plan and the accent times never
   change with the instrument choice. (2) Rendering is incremental: job(o, sr).step(k) renders the next k samples, so a page can start
   playback after the first few seconds. Every stage keeps its running state, so the dry mix is sample-identical to a one-shot render;
   the hall reverb is then done by block (overlap-add) convolution, which differs from the one-shot FFT only by float rounding (~1e-7). */
const RiverOrch = (() => {
  const TAU = 6.283185307179586, BPM = 84;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const SAMPLES = {}; let IR = null;
  // seat = position inside the wall's own ear (0 = hard to that side, 1 = centre); horn sits behind the violas
  const SEAT = { bass: 0.42, tuba: 0.5, cello: 0.34, celloPizz: 0.34, viola: 0.24, horn: 0.46, violin: 0.1, flute: 0.3 };
  const GAIN = { bass: 1.0, tuba: 0.2, cello: 0.85, celloPizz: 0.9, viola: 1.25, horn: 0.38, violin: 1.45, flute: 1.15 };
  const BAND_SEAT = [0.45, 0.34, 0.24, 0.12];
  /* recorded instrument catalogue for the per-band picker. type: legato (sustain loops, new note = crossfade) or pluck (one-shot per note).
     set: sample sets (merged); trem: tremolo set for roughness; lp: tracking low-pass at lp x f0 (0 = off); len: one-shot length (s). */
  const INST = {
    bassTuba:     { label: 'Double bass + tuba', comp: 0 },
    celloArcoPizz:{ label: 'Cellos arco / pizz', comp: 1 },
    violaHorn:    { label: 'Violas + horn', comp: 2 },
    violinFlute:  { label: 'Violins / flute', comp: 3 },
    bass:      { label: 'Double bass (arco)', type: 'legato', set: ['bass', 'bassArcoHi'], trem: 'bassTrem', lp: 3.0 },
    bassPizz:  { label: 'Upright bass (pizzicato)', type: 'pluck', set: ['bassPizz'], len: 1.5, lp: 5 },
    tuba:      { label: 'Tuba', type: 'legato', set: ['tuba'], lp: 3.0 },
    trombone:  { label: 'Trombone', type: 'legato', set: ['trombone'], lp: 3.0 },
    bassoon:   { label: 'Bassoon', type: 'legato', set: ['bassoon'], lp: 4.0 },
    cello:     { label: 'Cello section (arco)', type: 'legato', set: ['cello'], trem: 'celloTrem', lp: 1.7 },
    celloPizz: { label: 'Cello section (pizzicato)', type: 'pluck', set: ['celloPizz'], len: 1.3, lp: 2.0 },
    horn:      { label: 'French horn', type: 'legato', set: ['hornFull'], lp: 2.0 },
    viola:     { label: 'Viola section', type: 'legato', set: ['viola'], trem: 'violaTrem', lp: 2.4 },
    violaPizz: { label: 'Viola section (pizzicato)', type: 'pluck', set: ['violaPizz'], len: 1.3, lp: 3.0 },
    trumpet:   { label: 'Trumpet', type: 'legato', set: ['trumpet'], lp: 2.5 },
    clarinet:  { label: 'Clarinet', type: 'legato', set: ['clarinet'], lp: 0 },
    oboe:      { label: 'Oboe', type: 'legato', set: ['oboe'], lp: 0 },
    flute:     { label: 'Flute', type: 'legato', set: ['fluteVib'], lp: 0 },
    violin:    { label: 'Violin section', type: 'legato', set: ['violin'], trem: 'violinTrem', lp: 0 },
    soloViolin:{ label: 'Solo violin (fiddle)', type: 'legato', set: ['soloViolin'], lp: 0 },
    violinPizz:{ label: 'Violin section (pizzicato)', type: 'pluck', set: ['violinPizz'], len: 1.2, lp: 3.0 },
    harp:      { label: 'Harp', type: 'pluck', set: ['harp'], len: 1.6, lp: 0 },
    piano:     { label: 'Upright piano', type: 'pluck', set: ['piano'], len: 2.5, lp: 0 },
  };
  // what each band can use (instrument must have recordings within ~3 semitones across the band's register)
  const BAND_INST = [
    ['bassTuba', 'bass', 'bassPizz', 'tuba', 'trombone', 'bassoon', 'harp', 'piano'],
    ['celloArcoPizz', 'cello', 'celloPizz', 'bass', 'bassPizz', 'horn', 'trombone', 'bassoon', 'harp', 'piano'],
    ['violaHorn', 'viola', 'violaPizz', 'trumpet', 'clarinet', 'oboe', 'flute', 'soloViolin', 'violinPizz', 'harp', 'piano'],
    ['violinFlute', 'violin', 'soloViolin', 'violinPizz', 'flute', 'oboe', 'clarinet', 'trumpet', 'harp', 'piano']];
  const ACC = { orch: 'Timpani + bass drum + cymbal swells', timp: 'Timpani (rolls on the biggest drops)', bdrum: 'Concert bass drum + cymbal swells', giant: 'Large hand drum + cymbal swells', kit: 'Kick + snare + cymbal swells' };
  const GROOVE = { none: 'None', edm: 'Four on the floor (EDM)', country: 'Train beat (country)', pop: 'Backbeat (pop)' };
  const DEF_INST = { b1: 'bassTuba', b2: 'celloArcoPizz', b3: 'violaHorn', b4: 'violinFlute', acc: 'orch', groove: 'none' };
  const PRESETS = {
    orchestra: { label: 'Strata Orchestra', inst: DEF_INST },
    canyon:  { label: 'Canyon', inst: { b1: 'bass', b2: 'harp', b3: 'clarinet', b4: 'oboe', acc: 'giant', groove: 'none' } },
    edm:     { label: 'EDM', inst: { b1: 'bassPizz', b2: 'celloPizz', b3: 'violinPizz', b4: 'violin', acc: 'kit', groove: 'edm' } },
    country: { label: 'Country', inst: { b1: 'bassPizz', b2: 'harp', b3: 'soloViolin', b4: 'oboe', acc: 'kit', groove: 'country' } },
    pop:     { label: 'Pop', inst: { b1: 'bassPizz', b2: 'piano', b3: 'viola', b4: 'piano', acc: 'kit', groove: 'pop' } },
  };
  function fft(re, im, inv) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let l = 2; l <= n; l <<= 1) { const a = (inv ? 2 : -2) * Math.PI / l, wr = Math.cos(a), wi = Math.sin(a), h = l >> 1;
      for (let i = 0; i < n; i += l) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
  // convolve two real signals a,b with two real IRs ha,hb using one complex FFT each way (a + i b) per IR pair; returns outLen samples
  const HCACHE = new Map();
  function convolve2(a, b, ha, hb, outLen) { const n = a.length, m = ha.length; let N = 1; while (N < n + m) N <<= 1; outLen = outLen || n;
    const re = new Float64Array(N), im = new Float64Array(N); re.set(a); im.set(b); fft(re, im, false);
    let H = HCACHE.get(ha); if (!H || H.N !== N) { const hr = new Float64Array(N), hi = new Float64Array(N); hr.set(ha); hi.set(hb); fft(hr, hi, false); H = { N, hr, hi }; HCACHE.set(ha, H); }
    const hr = H.hr, hi = H.hi;
    // spectra of the real IRs: HA(k) = (H(k) + conj H(N-k)) / 2, HB(k) = (H(k) - conj H(N-k)) / 2i ; same for the inputs
    const oR = new Float64Array(N), oI = new Float64Array(N);
    for (let k = 0; k < N; k++) { const j = (N - k) & (N - 1);
      const Ar = (re[k] + re[j]) / 2, Ai = (im[k] - im[j]) / 2, Br = (im[k] + im[j]) / 2, Bi = -(re[k] - re[j]) / 2;
      const Har = (hr[k] + hr[j]) / 2, Hai = (hi[k] - hi[j]) / 2, Hbr = (hi[k] + hi[j]) / 2, Hbi = -(hr[k] - hr[j]) / 2;
      const Yar = Ar * Har - Ai * Hai, Yai = Ar * Hai + Ai * Har, Ybr = Br * Hbr - Bi * Hbi, Ybi = Br * Hbi + Bi * Hbr;
      oR[k] = Yar - Ybi; oI[k] = Yai + Ybr; }   // Ya + i Yb
    fft(oR, oI, true); const L = Math.min(outLen, N), ya = new Float32Array(L), yb = new Float32Array(L); for (let i = 0; i < L; i++) { ya[i] = oR[i] / N; yb[i] = oI[i] / N; } return [ya, yb]; }
  const setRms = (list) => { let s = 0, c = 0; for (const x of list) { const a = x.sustain ? x.ls : x.on, b = x.sustain ? x.le : Math.min(x.data.length, x.on + Math.round(0.4 * x.sr)); for (let i = a; i < b; i++) { s += x.data[i] * x.data[i]; c++; } } return Math.sqrt(s / Math.max(1, c)); };
  function create(RD, SYN, STR) {
    const N = RD.N, tab = SYN.tab;
    function rawOnsets(dens, dur, ph0) { const beat = 60 / BPM, st = 4000, out = []; let ph = ph0;   // identical to Strata's onset generator
      for (let k = 0; k < st; k++) { const t = k / st * dur, d = tab(dens, k / (st - 1)); ph += d * (dur / st) / beat;
        if (ph >= 1) { ph -= Math.floor(ph); if (!out.length || t - out[out.length - 1] > 0.03) out.push(t); } } return out; }
    const nearest = (set, hz) => set.reduce((b, x) => Math.abs(Math.log(hz / x.hz)) < Math.abs(Math.log(hz / b.hz)) ? x : b);
    /* ---- incremental building blocks: each returns run(c0, c1) and keeps its own running state ---- */
    // legato sample voice: each terrain note starts a new voice at its exact pitch (nearest recorded note), the previous voice
    // crossfades out. gainAt(i) multiplies the output (presence, technique mix, availability).
    function legato(O, set, notes, sr, gainAt, lpHz) {
      const vs = []; let ni = -1, f1 = 0, f2 = 0, cL = 1;
      return (c0, c1) => { for (let i = c0; i < c1; i++) { const tt = i / sr;
        while (ni + 1 < notes.length && notes[ni + 1].t <= tt) { ni++; const nt = notes[ni], x = nearest(set, nt.hz), leg = vs.some(v => v.tgt > 0);
          vs.forEach(v => { v.tgt = 0; v.step = 1 / (0.18 * sr); });
          vs.push({ x, pos: x.on + (leg ? 0.18 * x.sr : 0), rate: nt.hz / x.hz * x.sr / sr, g: 0, tgt: 1, step: 1 / ((leg ? 0.14 : 0.05) * sr) });
          if (lpHz) cL = 1 - Math.exp(-TAU * Math.min(lpHz * nt.hz, 0.45 * sr) / sr); }
        let y = 0;
        for (let j = vs.length - 1; j >= 0; j--) { const v = vs[j], d = v.x.data; v.g += v.g < v.tgt ? Math.min(v.step, v.tgt - v.g) : -Math.min(v.step, v.g - v.tgt);
          if (v.g <= 0 && v.tgt === 0) { vs.splice(j, 1); continue; }
          const ip = v.pos | 0, fr = v.pos - ip; y += (d[ip] + (d[ip + 1] - d[ip]) * fr) * v.g; v.pos += v.rate; if (v.pos >= v.x.le) v.pos -= v.x.le - v.x.ls; }
        if (lpHz) { f1 += (y - f1) * cL; f2 += (f1 - f2) * cL; y = f2; }
        O[i] += y * gainAt(i); } }; }
    // one-shot: (x, i0, rate, g, maxLen, lpF) ; run(c1) continues it up to c1
    function oneshot(O, x, i0, rate, g, maxLen, sr, lpF) { const d = x.data, nn = Math.min(Math.floor(maxLen * sr), O.length - i0), c = lpF ? 1 - Math.exp(-TAU * Math.min(lpF, 0.45 * sr) / sr) : 1; let ps = x.on, f1 = 0, f2 = 0, i = 0;
      return (c1) => { for (; i < nn && ps < d.length - 1 && i0 + i < c1; i++, ps += rate) { const ip = ps | 0; let y = d[ip] + (d[ip + 1] - d[ip]) * (ps - ip); if (lpF) { f1 += (y - f1) * c; f2 += (f1 - f2) * c; y = f2; } O[i0 + i] += y * g * Math.min(1, (nn - i) / (0.03 * sr)); } }; }
    // control curve f(tab(B[key])) smoothed by a one-pole (sec), written into a full-length Float32Array
    function ctlS(B, key, f, sec, n, sr) { const a = new Float32Array(n), c = 1 - Math.exp(-1 / (sec * sr)); let s = 0;
      const run = (c0, c1) => { for (let i = c0; i < c1; i++) { a[i] = f(tab(B[key], i / (n - 1)), i); if (i === 0) s = a[0]; s += (a[i] - s) * c; a[i] = s; } }; return [a, run]; }
    // one-shot runner list for a note list (kept in note order so per-sample summation order equals the one-shot render)
    function shots(list) { return (c0, c1) => { for (const s of list) if (s.i0 < c1 && !s.done) { s.run(c1); } }; }
    function job(o, sr, opt) {
      opt = opt || {}; if (!ready()) throw new Error('orchestra samples not decoded yet');
      const inst = Object.assign({}, DEF_INST, o.inst || {});
      for (let k = 0; k < 4; k++) { const id = inst['b' + (k + 1)]; if (!INST[id] || (INST[id].comp !== undefined && INST[id].comp !== k) || !BAND_INST[k].includes(id)) inst['b' + (k + 1)] = DEF_INST['b' + (k + 1)]; }
      if (!ACC[inst.acc]) inst.acc = 'orch'; if (!GROOVE[inst.groove]) inst.groove = 'none';
      const need = new Set(); for (let k = 0; k < 4; k++) { const I = INST[inst['b' + (k + 1)]]; if (I.set) { I.set.forEach(s => need.add(s)); if (I.trem) need.add(I.trem); } }
      ({ timp: ['timpRoll'], giant: ['giant'], kit: ['kick', 'snare'] }[inst.acc] || []).forEach(s => need.add(s)); if (inst.groove !== 'none') ['kick', 'snare', 'shaker', 'tamb'].forEach(s => need.add(s));
      for (const s of need) if (!(SAMPLES[s] && SAMPLES[s].length)) throw new Error('samples not decoded yet: ' + s);
      const T = STR.tables(o), m = clamp(o.musical, 0, 1), dur = o.dur, n = Math.floor(dur * sr), qa = sstep(0.1, 0.8, m), beat = 60 / BPM;
      const out = [new Float32Array(n), new Float32Array(n)], ER = 120, ne = Math.floor(dur * ER), env = [0, 1, 2, 3].map(() => new Float32Array(ne));
      const plan = { notes: [[], []], tech: {}, inst }, S = SAMPLES, ops = [];
      const putOp = (src, ch, s) => { const gx = Math.sin(s * Math.PI / 4), gn = Math.cos(s * Math.PI / 4), a = out[ch], b = out[1 - ch];   // equal-power, at most half-way to centre
        return (c0, c1) => { for (let i = c0; i < c1; i++) { const v = src[i]; if (v) { a[i] += v * gn; b[i] += v * gx; } } }; };
      const eqp = (w) => [Math.cos(w * Math.PI / 2), Math.sin(w * Math.PI / 2)];
      const bandRef = [setRms(S.bass) * GAIN.bass, setRms(S.cello) * GAIN.cello, setRms(S.viola) * GAIN.viola, setRms(S.violin) * GAIN.violin];
      [T.L, T.R].forEach((BS, ch) => BS.forEach((B, k) => {
        if (opt.solo !== undefined && opt.solo !== k) return;
        const raw = rawOnsets(B.dens, dur, ch ? 0.5 : 0.999), notes = raw.map(t => { const g = tab(B.dens, t / dur) > 1.6 ? beat / 4 : beat / 2; return { raw: t, t: lerp(t, Math.min(Math.round(t / g) * g, dur - 0.05), qa), hz: tab(B.pitch, t / dur), rawHz: tab(B.raw, t / dur), band: k }; });
        plan.notes[ch].push(...notes);
        const [pres, rP] = ctlS(B, 'pres', v => v, 0.08, n, sr), [trem, rT] = ctlS(B, 'rough', v => sstep(12, 38, v), 0.4, n, sr);   // roughness -> tremolo share
        ops.push(rP, rT);
        const bus = (seat) => { const a = new Float32Array(n); a.seat = seat; return a; }, buses = [], id = inst['b' + (k + 1)], I = INST[id];
        if (id === 'bassTuba') { const b = bus(SEAT.bass), t = bus(SEAT.tuba);
          ops.push(legato(b, S.bass, notes, sr, i => pres[i] * eqp(trem[i])[0] * GAIN.bass, 3.0));
          ops.push(legato(b, S.bassTrem, notes, sr, i => pres[i] * eqp(trem[i])[1] * GAIN.bass * 0.9, 3.0));
          ops.push(legato(t, S.tuba, notes, sr, i => pres[i] * GAIN.tuba, 3.0)); buses.push(b, t); }
        else if (id === 'celloArcoPizz') {   // per-note technique: pizzicato when the band is steep or rough, arco when gentle (with hysteresis)
          let pz = false, rr = 0; const c = bus(SEAT.cello), p = bus(SEAT.celloPizz), arcoW = new Float32Array(n); let cnt = 0;
          notes.forEach(nt => { const u = tab(B.steep, nt.raw / dur) / 40 + tab(B.rough, nt.raw / dur) / 50; pz = pz ? u > 0.9 : u > 1.1; nt.pizz = pz; if (pz) cnt++; });
          let ni = -1, w = 1; ops.push((c0, c1) => { for (let i = c0; i < c1; i++) { while (ni + 1 < notes.length && notes[ni + 1].t <= i / sr) ni++; const tgt = ni >= 0 && notes[ni].pizz ? 0 : 1; w += (tgt - w) * (1 / (0.15 * sr)); arcoW[i] = w; } });
          ops.push(legato(c, S.cello, notes, sr, i => pres[i] * arcoW[i] * eqp(trem[i])[0] * GAIN.cello, 1.7));
          ops.push(legato(c, S.celloTrem, notes, sr, i => pres[i] * arcoW[i] * eqp(trem[i])[1] * GAIN.cello * 0.9, 1.7));
          const L = []; notes.forEach(nt => { if (!nt.pizz) return; const pr = tab(B.pres, nt.raw / dur); if (pr < 0.02) return;
            const near = nearest(S.celloPizz, nt.hz), cands = S.celloPizz.filter(x => Math.abs(Math.log2(x.hz / near.hz)) < 0.05), x = cands[rr++ % cands.length];   // round-robin
            const i0 = Math.floor(nt.t * sr); L.push({ i0, run: oneshot(p, x, i0, nt.hz / x.hz * x.sr / sr, pr * GAIN.celloPizz, 1.3, sr, 2.0 * nt.hz) }); });
          ops.push(shots(L));
          plan.tech['band2_' + 'LR'[ch]] = { pizz: cnt, arco: notes.length - cnt }; buses.push(c, p); }
        else if (id === 'violaHorn') { const v = bus(SEAT.viola), h = bus(SEAT.horn);
          ops.push(legato(v, S.viola, notes, sr, i => pres[i] * eqp(trem[i])[0] * GAIN.viola, 2.4));
          ops.push(legato(v, S.violaTrem, notes, sr, i => pres[i] * eqp(trem[i])[1] * GAIN.viola * 0.9, 2.4));
          // horn only where a recorded horn note is within 3 semitones (VSCO has A3, C4, D5 here); tracking LP at 1.5x f0 keeps its 2nd harmonic down
          const av = new Float32Array(n); let ni = -1, w = 0; ops.push((c0, c1) => { for (let i = c0; i < c1; i++) { while (ni + 1 < notes.length && notes[ni + 1].t <= i / sr) ni++;
            const tg = ni >= 0 && Math.abs(12 * Math.log2(notes[ni].hz / nearest(S.horn, notes[ni].hz).hz)) <= 3 ? 1 : 0; w += (tg - w) * (1 / (0.25 * sr)); av[i] = w; } });
          ops.push(legato(h, S.horn, notes, sr, i => pres[i] * av[i] * GAIN.horn, 1.5)); buses.push(v, h); }
        else if (id === 'violinFlute') { const vl = bus(SEAT.violin), fl = bus(SEAT.flute), [thin, rTh] = ctlS(B, 'pres', v => 1 - sstep(0.2, 0.45, v), 0.6, n, sr);   // thin rim band -> flute
          ops.push(rTh);
          ops.push(legato(vl, S.violin, notes, sr, i => pres[i] * eqp(thin[i])[0] * eqp(trem[i])[0] * GAIN.violin, 0));
          ops.push(legato(vl, S.violinTrem, notes, sr, i => pres[i] * eqp(thin[i])[0] * eqp(trem[i])[1] * GAIN.violin * 0.9, 0));
          ops.push(legato(fl, S.flute, notes, sr, i => pres[i] * eqp(thin[i])[1] * GAIN.flute * 1.6, 0)); buses.push(vl, fl); }
        else {   // any other recorded instrument, loudness-matched to the band's default section
          const set = [].concat(...I.set.map(s => S[s])), b = bus(BAND_SEAT[k]), G = clamp(bandRef[k] / setRms(set) * (I.type === 'pluck' ? 1.25 : 1), 0.25, 4);
          if (I.type === 'legato') {
            if (I.trem) { ops.push(legato(b, set, notes, sr, i => pres[i] * eqp(trem[i])[0] * G, I.lp)); ops.push(legato(b, S[I.trem], notes, sr, i => pres[i] * eqp(trem[i])[1] * G * 0.9, I.lp)); }
            else ops.push(legato(b, set, notes, sr, i => pres[i] * G, I.lp));
          } else { let rr = 0; const L = [];
            notes.forEach(nt => { const pr = tab(B.pres, nt.raw / dur); if (pr < 0.02) return; const near = nearest(set, nt.hz), cands = set.filter(x => Math.abs(Math.log2(x.hz / near.hz)) < 0.05), x = cands[rr++ % cands.length];
              const i0 = Math.floor(nt.t * sr); L.push({ i0, run: oneshot(b, x, i0, nt.hz / x.hz * x.sr / sr, pr * G, I.len, sr, I.lp ? I.lp * nt.hz : 0) }); });
            ops.push(shots(L)); }
          plan.tech['band' + (k + 1) + '_' + 'LR'[ch]] = { inst: id, gain: +G.toFixed(3), maxStretchSemis: +Math.max(0, ...notes.map(nt => Math.abs(12 * Math.log2(nt.hz / nearest(set, nt.hz).hz)))).toFixed(2) };
          buses.push(b); }
        for (const b of buses) ops.push(putOp(b, ch, b.seat));
        for (let e = 0; e < ne; e++) env[k][e] += 0.5 * tab(B.pres, e / (ne - 1));
      }));
      // rapids at their exact raw terrain times. default: timpani for big drops, bass drum for the rest, cymbal swell peaking on the biggest
      const acc = opt.solo === undefined ? SYN.accents.map(a => ({ t: a.i / (N - 1) * dur, a: clamp(a.d / 5, 0.25, 1.1), d: a.d })) : [];
      const accOps = [];
      if (acc.length) { const ds = acc.map(a => a.d).sort((p, q) => q - p), big = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.4))], top = ds[Math.min(ds.length - 1, 1)];
        let rt = 0, rb = 0, rs = 0; const pk = S.cymSwell[0].peak, AK = inst.acc;
        const hitOp = (C, i0, g) => { const d = C.data, rate = C.sr / sr; let ps = C.on, i = 0;
          return (c0, c1) => { for (; i + i0 < n && ps < d.length - 1 && i + i0 < c1; i++, ps += rate) { if (i + i0 < 0) continue; const ip = ps | 0, v = (d[ip] + (d[ip + 1] - d[ip]) * (ps - ip)) * g * 0.7071; out[0][i0 + i] += v; out[1][i0 + i] += v; } }; };
        acc.forEach(A => { const i0 = Math.round(A.t * sr); let C, g;
          if (AK === 'orch' || AK === 'bdrum' || AK === 'timp') { const tp = AK === 'timp' || (AK === 'orch' && A.d >= big); C = tp ? (A.kind = 'timpani', S.timp[rt++ % S.timp.length]) : (A.kind = 'bassdrum', S.bdrum[rb++ % S.bdrum.length]); g = A.a * (tp ? 0.9 : 0.75); }
          else if (AK === 'giant') { A.kind = 'largedrum'; C = S.giant[rt++ % S.giant.length]; g = A.a * 1.1; }
          else { A.kind = 'kick'; C = S.kick[rt++ % S.kick.length]; g = A.a * 0.95; }
          accOps.push(hitOp(C, i0, g));
          if (AK === 'kit' && A.d >= big) { A.kind = 'kick+snare'; accOps.push(hitOp(S.snare[rs++ % S.snare.length], i0, A.a * 0.8)); }
          if (A.d >= top) { if (AK === 'timp') { A.roll = true; accOps.push(hitOp(S.timpRoll[0], i0, A.a * 0.55)); }
            else { A.cymbal = true; const Y = S.cymSwell[0], yd = Y.data, st = i0 - Math.round(pk * sr), yr = Y.sr / sr; let q = 0, i = 0;   // swell starts early so its peak lands on the accent
              accOps.push((c0, c1) => { for (; q < yd.length - 1 && st + i < c1; i++, q += yr) { const j = st + i; if (j < 0 || j >= n) continue; const qi = q | 0, v = (yd[qi] + (yd[qi + 1] - yd[qi]) * (q - qi)) * 0.35 * A.a; out[0][j] += v * 0.8; out[1][j] += v; } }); } } }); }
      plan.acc = acc; ops.push(...accOps);
      // optional recorded groove on the note plan's own 84 BPM grid (style presets); never moves a terrain note or accent
      if (inst.groove !== 'none' && opt.solo === undefined) { const PAT = {   // 16 steps per bar: [kick, snare, shaker/tamb]
          edm:     ['x...x...x...x...', '....x.......x...', 'xxxxxxxxxxxxxxxx', 'shaker'],
          country: ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', 'shaker'],
          pop:     ['x.....x.x.......', '....x.......x...', '..x...x...x...x.', 'tamb'] }[inst.groove];
        const s16 = beat / 4, steps = Math.floor((dur - 0.3) / s16), hits = []; let rk = 0, rn = 0, rh = 0;
        for (let s = 0; s < steps; s++) { const t = s * s16, i0 = Math.round(t * sr), q = s % 16, fade = Math.min(1, t / 2, (dur - t) / 2);
          if (PAT[0][q] === 'x') hits.push([S.kick[rk++ % S.kick.length], i0, 0.55 * fade, 0.5]);
          if (PAT[1][q] === 'x') hits.push([S.snare[rn++ % S.snare.length], i0, 0.4 * fade, 0.5]);
          if (PAT[2][q] === 'x') { const H = S[PAT[3]]; hits.push([H[rh++ % H.length], i0, (q % 4 === 0 ? 0.28 : 0.2) * fade, q % 2 ? 0.3 : 0.7]); } }
        const gOps = hits.map(([C, i0, g, pan]) => { const d = C.data, rate = C.sr / sr, nn = Math.min(Math.floor(0.9 * sr), n - i0), gl = g * Math.cos(pan * Math.PI / 2) * 1.414, gr = g * Math.sin(pan * Math.PI / 2) * 1.414; let ps = C.on, i = 0;
          return { i0, run: (c1) => { for (; i < nn && ps < d.length - 1 && i0 + i < c1; i++, ps += rate) { const ip = ps | 0, v = (d[ip] + (d[ip + 1] - d[ip]) * (ps - ip)) * Math.min(1, (nn - i) / (0.02 * sr)); out[0][i0 + i] += v * gl; out[1][i0 + i] += v * gr; } } }; });
        ops.push(shots(gOps)); plan.groove = { style: inst.groove, hits: hits.length }; }
      // concert-hall convolution (the only reverb in this style; the page's algorithmic reverb send is bypassed for it)
      const dry = [out[0], out[1]]; let h = null, WET = 0, wetAcc = null;
      if (IR && opt.dry !== true) { h = IR.data.map(c => { const r = IR.sr / sr, len = Math.floor(c.length / r), y = new Float64Array(len); for (let i = 0; i < len; i++) { const p = i * r, ip = p | 0; y[i] = ip + 1 < c.length ? c[ip] + (c[ip + 1] - c[ip]) * (p - ip) : 0; } return y; });
        let e = 0; for (const c of h) for (let i = 0; i < c.length; i++) e += c[i] * c[i]; const nrm = 1 / Math.sqrt(e / 2); h.forEach(c => { for (let i = 0; i < c.length; i++) c[i] *= nrm; });
        WET = 0.11 * (o.verbScale === undefined ? 1 : o.verbScale); }
      const nf = Math.floor(0.08 * sr), MG = 1.3;
      let done = 0;
      function step(k) {   // render the next k samples (k >= n - done renders the rest in one go = identical to the one-shot v1 render)
        const c0 = done, c1 = Math.min(n, done + Math.max(1, k | 0)); if (c0 >= n) return done;
        for (const f of ops) f(c0, c1);
        if (h) { const C = c1 - c0, inL = new Float64Array(C), inR = new Float64Array(C);
          for (let i = 0; i < C; i++) { inL[i] = 0.8 * dry[0][c0 + i] + 0.2 * dry[1][c0 + i]; inR[i] = 0.8 * dry[1][c0 + i] + 0.2 * dry[0][c0 + i]; }
          if (c0 === 0 && c1 === n) { const [wL, wR] = convolve2(inL, inR, h[0], h[1]); for (let i = 0; i < n; i++) { dry[0][i] += wL[i] * WET; dry[1][i] += wR[i] * WET; } }
          else { if (!wetAcc) wetAcc = [new Float64Array(n), new Float64Array(n)];   // overlap-add: this block's tail lands in later blocks
            const [wL, wR] = convolve2(inL, inR, h[0], h[1], Math.min(C + h[0].length, n - c0)); for (let i = 0; i < wL.length; i++) { wetAcc[0][c0 + i] += wL[i]; wetAcc[1][c0 + i] += wR[i]; }
            for (let i = c0; i < c1; i++) { dry[0][i] += wetAcc[0][i] * WET; dry[1][i] += wetAcc[1][i] * WET; } } }
        for (let i = c0; i < c1; i++) { const ev = Math.min(1, i / nf, (n - 1 - i) / nf) * MG; for (let c = 0; c < 2; c++) out[c][i] = Math.tanh(out[c][i] * ev * 1.05) / 1.05; }
        done = c1; return done; }
      return { n, sr, step, get done() { return done; }, L: out[0], R: out[1], tables: T, plan, bandEnv: env, ER };
    }
    function render(o, sr, opt) { const j = job(o, sr, opt); j.step(j.n); return { L: j.L, R: j.R, tables: j.tables, plan: j.plan, bandEnv: j.bandEnv, ER: j.ER }; }
    return { render, job, tables: STR.tables, REG: STR.REG };
  }
  const NEED = ['bass', 'bassTrem', 'tuba', 'cello', 'celloTrem', 'celloPizz', 'viola', 'violaTrem', 'horn', 'violin', 'violinTrem', 'flute', 'timp', 'bdrum', 'cymSwell'];
  const ready = () => NEED.every(k => SAMPLES[k] && SAMPLES[k].length) && !!IR;
  const has = (names) => names.every(k => SAMPLES[k] && SAMPLES[k].length);
  function addSamples(name, list) { SAMPLES[name] = list.map(q => { const d = q.data; let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    let c = 0; while (c < d.length && Math.abs(d[c]) <= 0.02 * pk) c++; const on = q.peakAt !== undefined ? 0 : Math.max(0, c - Math.round(0.005 * q.sr));
    let peak = 0; if (q.peakAt !== undefined) { let b = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[b])) b = i; peak = b / q.sr; }   // swell: real peak after decoding
    return { hz: q.hz, sr: q.sr, data: d, on, peak, sustain: q.le > 0, ls: on + Math.round(q.ls * q.sr), le: Math.min(d.length - 2, on + Math.round(q.le * q.sr)) }; }); }
  function setIR(chans, sr) { let pk = 0; for (const c of chans) for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i]));   // drop codec delay before the direct sound
    let s = 0; while (s < chans[0].length && Math.abs(chans[0][s]) < 0.05 * pk && Math.abs(chans[1][s]) < 0.05 * pk) s++; s = Math.max(0, s - Math.round(0.002 * sr));
    IR = { sr, data: chans.map(c => c.slice(s)) }; }
  // which sample sets an instrument config needs (so a page can decode extra instruments on demand)
  function setsFor(inst) { inst = Object.assign({}, DEF_INST, inst || {}); const s = new Set();
    for (let k = 0; k < 4; k++) { const I = INST[inst['b' + (k + 1)]]; if (I && I.set) { I.set.forEach(x => s.add(x)); if (I.trem) s.add(I.trem); } }
    ({ timp: ['timpRoll'], giant: ['giant'], kit: ['kick', 'snare'] }[inst.acc] || []).forEach(x => s.add(x)); if (inst.groove && inst.groove !== 'none') ['kick', 'snare', 'shaker', 'tamb'].forEach(x => s.add(x));
    // bandRef loudness matching always reads the default sections
    return [...s]; }
  return { create, addSamples, setIR, ready, has, setsFor, SAMPLES, SEAT, GAIN, INST, BAND_INST, ACC, GROOVE, PRESETS, DEF_INST };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RiverOrch;
