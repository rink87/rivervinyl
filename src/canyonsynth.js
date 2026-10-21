
/* Canyon synth: pure JS, no Web Audio dependency. Renders one full loop (rim to rim) into Float32 arrays.
   Used by the page (-> AudioBuffer) and by the node tests. Mirrors sonify_canyon_single.py. */
const CanyonSynth = (() => {
  const TN = 4096, TAU = 6.283185307179586, PENT = [0, 3, 5, 7, 10];
  function gauss(a, sigma, odd) {
    if (sigma < 0.05) return a;
    const n = a.length, r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1); let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-0.5 * (i / sigma) ** 2); s += k[i + r]; }
    const at = (x) => { // edge handling: 'nearest' (pitch) or odd extension (pan, keeps the end values exact)
      if (x >= 0 && x < n) return a[x];
      if (!odd) return a[x < 0 ? 0 : n - 1];
      return x < 0 ? 2 * a[0] - a[Math.min(-x, n - 1)] : 2 * a[n - 1] - a[Math.max(2 * (n - 1) - x, 0)];
    };
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = 0; for (let j = -r; j <= r; j++) v += at(i + j) * k[j + r]; o[i] = v / s; }
    return o;
  }
  function quantSemi(s, mode) {
    if (mode === 'chromatic') return Math.round(s);
    const oct = Math.floor(s / 12), r = s - oct * 12; let best = 0, bd = 99;
    for (const p of PENT.concat([12])) { const d = Math.abs(r - p); if (d < bd) { bd = d; best = p; } }
    return oct * 12 + best;
  }
  function create(PD, PE) {
    const NP = PD.length; let K = 0; for (let i = 1; i < NP; i++) if (PE[i] < PE[K]) K = i;
    let PMIN = Infinity, PMAX = -Infinity; for (const v of PE) { if (v < PMIN) PMIN = v; if (v > PMAX) PMAX = v; }
    const profAt = (idx, arr) => { idx = Math.min(Math.max(idx, 0), NP - 1); const i = Math.min(idx | 0, NP - 2), f = idx - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
    // normalised time (0..1, whole rim-to-rim pass) -> fractional profile index
    function idxTable(timeMap) {
      const t = new Float32Array(TN);
      if (timeMap === 'halves') { // equal time for each half, played one after the other
        for (let i = 0; i < TN; i++) { const x = i / (TN - 1); t[i] = x < 0.5 ? K * (x / 0.5) : K + (x - 0.5) / 0.5 * (NP - 1 - K); }
      } else { // true spacing: time is proportional to distance along the route
        const D = PD[NP - 1]; let j = 0;
        for (let i = 0; i < TN; i++) { const d = i / (TN - 1) * D; while (j < NP - 2 && PD[j + 1] < d) j++; const f = (d - PD[j]) / ((PD[j + 1] - PD[j]) || 1); t[i] = j + Math.min(Math.max(f, 0), 1); }
      }
      return t;
    }
    // pan position -1 (south rim) .. 0 (river) .. +1 (north rim), smooth S-curve, then lightly smoothed over time
    function panPos(idx) { const p = idx <= K ? -1 + idx / K : (idx - K) / (NP - 1 - K); return Math.sin(p * Math.PI / 2); }
    function tables(o) {
      const idx = idxTable(o.timeMap), c = new Float32Array(TN), q = new Float32Array(TN);
      for (let i = 0; i < TN; i++) { c[i] = profAt(idx[i], PE); q[i] = panPos(idx[i]); }
      const sm = gauss(c, (TN / 400) * o.smooth), pitch = new Float32Array(TN);
      for (let i = 0; i < TN; i++) {
        const norm = Math.min(Math.max((sm[i] - PMIN) / (PMAX - PMIN), 0), 1);
        let f = o.lo * Math.pow(o.hi / o.lo, norm);
        if (o.quant && o.quant !== 'off') f = 110 * Math.pow(2, quantSemi(12 * Math.log2(f / 110), o.quant) / 12);
        pitch[i] = f;
      }
      const pan = gauss(q, TN * 0.02, true), gl = new Float32Array(TN), gr = new Float32Array(TN);
      for (let i = 0; i < TN; i++) {
        let p = Math.min(Math.max(pan[i], -1), 1);
        if (o.layout === 'swapped') p = -p;
        if (o.layout === 'mono') p = 0;
        pan[i] = p; const th = (p + 1) * Math.PI / 4; gl[i] = Math.cos(th); gr[i] = Math.sin(th); // equal power
      }
      return { idx, pitch, pan, gl, gr };
    }
    const tab = (a, t) => { const x = Math.min(Math.max(t, 0), 1) * (a.length - 1), i = Math.min(x | 0, a.length - 2); return a[i] + (a[i + 1] - a[i]) * (x - i); };
    function osc(w, p, inc, h) {
      let b;
      if (w === 0) b = Math.sin(TAU * p);
      else if (w === 1) b = 1.2 * (1 - 4 * Math.abs(p - 0.5));
      else { b = 2 * p - 1; if (p < inc) { const x = p / inc; b -= (x + x - x * x - 1); } else if (p > 1 - inc) { const x = (p - 1) / inc; b -= (x * x + x + x + 1); } }
      return (b + 0.30 * h * Math.sin(TAU * 2 * p) + 0.12 * h * Math.sin(TAU * 3 * p)) / (1 + 0.42 * h);
    }
    function render(o, sr) {
      const w = o.wave === 'triangle' || o.wave === 1 ? 1 : o.wave === 'saw' || o.wave === 2 ? 2 : 0;
      const T = tables(o), n = Math.max(2, Math.floor(o.dur * sr)), L = new Float32Array(n), R = new Float32Array(n);
      const glide = o.quant && o.quant !== 'off', ga = glide ? 1 - Math.exp(-1 / (sr * 0.012)) : 1, nf = Math.floor(0.05 * sr), OUT = 0.9;
      let ph = 0, f = tab(T.pitch, 0);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        f += (tab(T.pitch, t) - f) * ga;
        const inc = f / sr; ph += inc; ph -= Math.floor(ph);
        const env = Math.min(1, i / nf, (n - 1 - i) / nf) * OUT, s = osc(w, ph, inc, o.harm) * env;
        L[i] = s * tab(T.gl, t); R[i] = s * tab(T.gr, t);
      }
      return { L, R, tables: T };
    }
    return { NP, K, PMIN, PMAX, TN, profAt, tables, render, tab };
  }
  return { create, TN };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CanyonSynth;

