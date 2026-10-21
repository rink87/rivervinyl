/* River synth: pure JS (no Web Audio). Follows the Colorado River downstream like a stereo record needle:
   the LEFT channel is read from the river-left wall, the RIGHT channel from the river-right wall (facing downstream).
   Per channel: wall height above the river (blend of +500 m and +2 km) -> exponential pitch on an ABSOLUTE scale
   (0 m -> lo, 1200 m -> hi, so a shallower canyon really sounds lower); wall steepness -> brightness/harmonics;
   wall roughness -> noise texture. River-elevation drops (rapids) -> accents (centre, both channels).
   'musical' 0..1 has the same meaning as song mode: pentatonic snap (root from river elevation, 1 semitone / 30 m),
   per-wall plucked notes whose density follows that wall's steepness + roughness, quantized toward 84 BPM,
   a soft root drone, gentler envelopes. */
const RiverSynth = (() => {
  const TAU = 6.283185307179586, PENT = [0, 3, 5, 7, 10, 12], TN = 4096;
  const NOTE = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'];
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function gauss(a, sg) { const n = a.length, r = Math.ceil(sg * 3), k = []; let s = 0; for (let i = -r; i <= r; i++) { k.push(Math.exp(-0.5 * (i / sg) ** 2)); s += k[k.length - 1]; }
    const o = new Float64Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let j = -r; j <= r; j++) { const x = i + j; v += a[x < 0 ? 0 : x >= n ? n - 1 : x] * k[j + r]; } o[i] = v / s; } return o; }
  const snapSemi = (s) => { const oc = Math.floor(s / 12), r = s - oc * 12; let b = 0, bd = 99; for (const p of PENT) { const d = Math.abs(r - p); if (d < bd) { bd = d; b = p; } } return oc * 12 + b; };
  const tab = (a, t) => { const x = clamp(t, 0, 1) * (a.length - 1), i = Math.min(x | 0, a.length - 2); return a[i] + (a[i + 1] - a[i]) * (x - i); };
  function resample(a, sg) { const g = gauss(a, sg), o = new Float32Array(TN); for (let i = 0; i < TN; i++) o[i] = tab(g, i / (TN - 1)); return o; }
  function create(RD) {
    const N = RD.N, meanRiv = RD.river.reduce((p, q) => p + q, 0) / N;
    const rootPc = ((Math.round(meanRiv / 30) % 12) + 12) % 12, rootHz = 110 * Math.pow(2, rootPc / 12);
    // rapids: local maxima of the 250 m drop above 1.0 m, at least ~400 m apart
    const acc = []; for (let i = 1; i < N - 1; i++) { const d = RD.drop[i]; if (d > 1.0 && d >= RD.drop[i - 1] && d > RD.drop[i + 1] && (!acc.length || i - acc[acc.length - 1].i > 8)) acc.push({ i, d }); }
    const sideT = (W) => { const H = W.h500.map((v, i) => 0.4 * v + 0.6 * W.h2k[i]);
      return { H: resample(H, 3), steep: resample(W.steep, 3), rough: resample(W.rough, 3), h500: resample(W.h500, 1), h2k: resample(W.h2k, 1) }; };
    const SL = sideT(RD.L), SR = sideT(RD.R), RIV = resample(RD.river, 1);
    function tables(o) {
      const m = o.musical, sn = sstep(0, 0.7, m), mk = (S) => { const p = new Float32Array(TN), dn = new Float32Array(TN), br = new Float32Array(TN);
        for (let i = 0; i < TN; i++) { const f = o.lo * Math.pow(o.hi / o.lo, clamp(S.H[i] / 1200, 0, 1)), s = 12 * Math.log2(f / rootHz);
          p[i] = rootHz * Math.pow(2, (s + sn * (snapSemi(s) - s)) / 12); br[i] = clamp((S.steep[i] - 15) / 30, 0, 1);
          dn[i] = clamp(0.25 + S.steep[i] / 30 + S.rough[i] / 40, 0.25, 3); }
        return Object.assign({ pitch: p, dens: dn, bright: br }, S); };
      return { L: mk(SL), R: mk(SR), river: RIV, rootPc, rootHz, rootName: NOTE[rootPc], accents: acc };
    }
    function onsets(dens, dur, o, ph0) { const beat = 60 / o.bpm, qa = sstep(0.1, 0.8, o.musical), st = 4000, out = []; let ph = ph0;
      for (let k = 0; k < st; k++) { const t = k / st * dur, d = tab(dens, k / (st - 1)); ph += d * (dur / st) / beat;
        if (ph >= 1) { ph -= Math.floor(ph); const g = d > 1.6 ? beat / 4 : beat / 2, tt = lerp(t, Math.min(Math.round(t / g) * g, dur - 0.05), qa);
          if (!out.length || tt - out[out.length - 1] > 0.03) out.push(tt); } }
      return out; }
    function osc(p, b) { const s = Math.sin(TAU * p); return (s + b * (0.5 * Math.sin(TAU * 2 * p) + 0.33 * Math.sin(TAU * 3 * p) + 0.2 * Math.sin(TAU * 4 * p) + 0.12 * Math.sin(TAU * 5 * p))) / (1 + 0.9 * b); }
    function render(o, sr) {
      const m = clamp(o.musical || 0, 0, 1), dur = o.dur, n = Math.floor(dur * sr), out = [new Float32Array(n), new Float32Array(n)], T = tables(o);
      const beat = 60 / o.bpm, qa = sstep(0.1, 0.8, m), bar = 4 * beat;
      const contG = 1 - 0.7 * sstep(0, 0.9, m), noteG = 0.8 * sstep(0, 0.5, m), texG = 0.07 + 0.12 * sstep(0, 0.6, m), droneG = 0.22 * Math.pow(m, 1.2);
      const att = lerp(0.004, 0.05, m), tau = lerp(0.10, 0.5, m), ga = 1 - Math.exp(-1 / (sr * lerp(0.003, 0.03, m))), nf = Math.floor(0.08 * sr);
      // rapids accents (shared by both channels), onsets pulled to the beat when musical
      const acT = T.accents.map(a => { const t = a.i / (RD.N - 1) * dur; return { t: lerp(t, Math.round(t / (beat / 2)) * (beat / 2), qa), a: clamp(a.d / 5, 0.25, 1.1) }; });
      let seed = 99;
      const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296 * 2 - 1; };
      [T.L, T.R].forEach((S, ch) => {
        const on = onsets(S.dens, dur, o, ch ? 0.5 : 0.999), O = out[ch]; let ph = 0, f = S.pitch[0], nph = 0, nf0 = f, ni = -1, nt0 = 0, lp = 0, lp2 = 0; seed = 1234 + ch * 777;
        for (let i = 0; i < n; i++) { const tt = i / sr, t = i / (n - 1);
          f += (tab(S.pitch, t) - f) * ga; ph += f / sr; ph -= Math.floor(ph); const br = tab(S.bright, t);
          let v = osc(ph, br) * contG * 0.55;
          while (ni + 1 < on.length && on[ni + 1] <= tt) { ni++; nt0 = on[ni]; nf0 = tab(S.pitch, nt0 / dur); }
          if (ni >= 0 && noteG > 0) { const a = tt - nt0, e = Math.min(1, a / att) * Math.exp(-a / tau); nph += nf0 / sr; nph -= Math.floor(nph); v += osc(nph, br * 0.8) * e * noteG * 0.5; }
          // wall texture: noise band whose loudness = this wall's roughness, brighter on steep walls
          const w = rnd(); lp += (w - lp) * (0.08 + 0.3 * br); lp2 += (lp - lp2) * 0.5;
          v += (lp - 0.5 * lp2) * texG * clamp(tab(S.rough, t) / 35, 0, 1.6) * (ni >= 0 && noteG > 0 ? 0.6 + 1.2 * Math.exp(-(tt - nt0) / 0.05) : 1);
          O[i] = v; }
      });
      // centre layer: rapids + drone
      let dph = [0, 0, 0], ai = 0; const rf = T.rootHz / 2;
      for (let i = 0; i < n; i++) { const tt = i / sr, t = i / (n - 1); let c = 0;
        while (ai < acT.length - 1 && acT[ai + 1].t <= tt) ai++;
        const A = acT[ai]; if (A && tt >= A.t) { const a = tt - A.t, fq = 45 + 70 * Math.exp(-a / 0.04);
          c += (Math.sin(TAU * fq * a) * Math.exp(-a / 0.35) * 0.55 + rnd() * Math.exp(-a / lerp(0.15, 0.4, m)) * 0.25) * A.a; }
        if (droneG > 0) { dph[0] += rf / sr; dph[1] += rf * 1.5 / sr; dph[2] += rf * 2 / sr; const bt = tt % bar, bp = Math.min(1, bt / 0.02) * Math.exp(-bt / 0.9);
          c += ((Math.sin(TAU * dph[0]) + 0.35 * Math.sin(TAU * dph[1]) + 0.2 * Math.sin(TAU * dph[2])) * 0.5 + Math.sin(TAU * dph[0]) * bp * 0.5) * droneG; }
        const ev = Math.min(1, i / nf, (n - 1 - i) / nf) * 0.9;
        for (let ch = 0; ch < 2; ch++) out[ch][i] = Math.tanh((out[ch][i] + c * 0.7071) * ev * 1.1) / 1.1; }
      return { L: out[0], R: out[1], tables: T };
    }
    return { tables, render, rootName: NOTE[rootPc], rootHz, accents: acc, tab };
  }
  return { create, NOTE, TN };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RiverSynth;
