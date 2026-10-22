/* STRATA style (prototype): each wall is split into 4 height bands above the river, approximate stand-ins for rock layers
   (NOT mapped geology): 0-300 m Inner Gorge schist, 300-650 m Tonto/Muav, 650-1000 m Redwall/Supai, 1000 m+ Coconino/Kaibab.
   Per wall (L ear = river-left, R ear = river-right) and per band:
     presence (m of the cross-section inside the band, within 4 km) -> that instrument's volume (absent = silent)
     entry distance (how far out the band starts: the band's own contour) -> pitch inside the band's OWN register (no overlaps)
     steepness + roughness inside the band -> note density and noise texture.
   Musical: same rules as the other styles (scale snap toward minor pentatonic in the terrain key, grid nudge at 84 BPM,
   raw onsets from the terrain at the 84 BPM reference). Rapid accents at their raw terrain times. */
const RiverStrata = (() => {
  const TAU = 6.283185307179586, BPM = 84, PENT = [0, 3, 5, 7, 10, 12];
  const REG = [[41.2, 82.4], [110, 220], [261.6, 523.3], [659.3, 1318.5]];   // E1-E2 · A2-A3 · C4-C5 · E5-E6 (gaps between bands)
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function gauss(a, sg) { const n = a.length, r = Math.ceil(sg * 3), k = []; let s = 0; for (let i = -r; i <= r; i++) { k.push(Math.exp(-0.5 * (i / sg) ** 2)); s += k[k.length - 1]; }
    const o = new Float64Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let j = -r; j <= r; j++) { const x = i + j; v += a[x < 0 ? 0 : x >= n ? n - 1 : x] * k[j + r]; } o[i] = v / s; } return o; }
  function create(RD, SYN) {
    const N = RD.N, tab = SYN.tab, TN = 4096, ST = RD.strata, root = 110 * Math.pow(2, (((Math.round(RD.river.reduce((p, q) => p + q, 0) / N / 30) % 12) + 12) % 12) / 12);
    const rs = (a, sg) => { const g = gauss(a, sg), o = new Float32Array(TN); for (let i = 0; i < TN; i++) o[i] = tab(g, i / (TN - 1)); return o; };
    const snap = (f, lo, hi, sn) => { const s = 12 * Math.log2(f / root), oc = Math.floor(s / 12), r = s - oc * 12; let b = 0, bd = 99; for (const p of PENT) { const d = Math.abs(r - p); if (d < bd) { bd = d; b = p; } }
      let q = root * Math.pow(2, (s + sn * (oc * 12 + b - s)) / 12); return clamp(q, lo, hi); };   // snapping kept inside the band register
    function tables(o) {
      const sn = sstep(0, 0.7, o.musical), sides = [ST.L, ST.R].map(BS => BS.map((b, k) => {
        const maxP = Math.max(...b.pres) || 1, pres = rs(b.pres.map(v => v / maxP), 3), ent = rs(b.entry, 4), stp = rs(b.steep, 3), rgh = rs(b.rough, 3);
        const [lo, hi] = REG[k], raw = new Float32Array(TN), pitch = new Float32Array(TN), dens = new Float32Array(TN);
        for (let i = 0; i < TN; i++) { const c = 1 - clamp(ent[i] / 3000, 0, 1);           // closer band = higher inside its register
          raw[i] = lo * Math.pow(hi / lo, c); pitch[i] = snap(raw[i], lo, hi, sn);
          dens[i] = pres[i] < 0.02 ? 0 : clamp(0.15 + stp[i] / 40 + rgh[i] / 50, 0.15, 2.5) * [0.5, 1, 0.6, 0.8][k]; }
        return { pres, raw, pitch, dens, steep: stp, rough: rgh, lo, hi }; }));
      return { L: sides[0], R: sides[1], names: ST.names, bands: ST.bands, rootHz: root };
    }
    function rawOnsets(dens, dur, ph0) { const beat = 60 / BPM, st = 4000, out = []; let ph = ph0;
      for (let k = 0; k < st; k++) { const t = k / st * dur, d = tab(dens, k / (st - 1)); ph += d * (dur / st) / beat;
        if (ph >= 1) { ph -= Math.floor(ph); if (!out.length || t - out[out.length - 1] > 0.03) out.push(t); } } return out; }
    function render(o, sr, opt) {
      opt = opt || {}; const T = tables(o), m = clamp(o.musical, 0, 1), dur = o.dur, n = Math.floor(dur * sr), qa = sstep(0.1, 0.8, m), beat = 60 / BPM;
      const out = [new Float32Array(n), new Float32Array(n)], ER = 120, ne = Math.floor(dur * ER), env = [0, 1, 2, 3].map(() => new Float32Array(ne));
      let seed = 777; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296 * 2 - 1; };
      const plan = { notes: [[], []] };
      [T.L, T.R].forEach((BS, ch) => BS.forEach((B, k) => {
        if (opt.solo !== undefined && opt.solo !== k) return;
        const O = out[ch], vol = [0.5, 0.6, 0.22, 0.28][k];
        const raw = rawOnsets(B.dens, dur, ch ? 0.5 : 0.999), notes = raw.map(t => { const g = tab(B.dens, t / dur) > 1.6 ? beat / 4 : beat / 2; return { raw: t, t: lerp(t, Math.min(Math.round(t / g) * g, dur - 0.05), qa), hz: tab(B.pitch, t / dur), rawHz: tab(B.raw, t / dur), band: k }; });
        plan.notes[ch].push(...notes);
        if (k === 0 || k === 2) {   // continuous voices: drone (schist) / brass-like pad (Redwall-Supai); notes re-articulate them softly
          let ph = 0, ph2 = 0, f = B.pitch[0], lp = 0, ni = -1, nt = -9; const ga = 1 - Math.exp(-1 / (sr * lerp(0.01, 0.06, m)));
          for (let i = 0; i < n; i++) { const t = i / (n - 1), tt = i / sr; f += (tab(B.pitch, t) - f) * ga; ph = (ph + f / sr) % 1; ph2 = (ph2 + f * 1.004 / sr) % 1;
            while (ni + 1 < notes.length && notes[ni + 1].t <= tt) { ni++; nt = notes[ni].t; }
            const p = tab(B.pres, t), art = 1 + 0.6 * Math.exp(-(tt - nt) / lerp(0.15, 0.5, m));
            let v; if (k === 0) v = Math.sin(TAU * ph) + 0.4 * Math.sin(TAU * 2 * ph) + 0.15 * (2 * ph2 - 1);
            else { const s = (2 * ph - 1) + (2 * ph2 - 1); lp += (s - lp) * (0.05 + 0.12 * clamp(tab(B.steep, t) / 50, 0, 1)); v = lp * 1.2; }
            O[i] += v * p * vol * art; } }
        else notes.forEach((nt, j) => {   // plucks (Tonto-Muav) and bells (rim)
          const p = tab(B.pres, nt.raw / dur); if (p < 0.02) return; const i0 = Math.floor(nt.t * sr), len = Math.min(k === 1 ? 1.2 : 2.5, dur - nt.t), nn = Math.floor(len * sr);
          if (k === 1) { let pc = 0; for (let i = 0; i < nn; i++) { const a = i / sr; pc = (pc + nt.hz / sr) % 1;   // soft pluck (harmonics die first)
            O[i0 + i] += (Math.sin(TAU * pc) + 0.5 * Math.sin(TAU * 2 * pc) * Math.exp(-a / 0.12) + 0.25 * Math.sin(TAU * 3 * pc) * Math.exp(-a / 0.06)) * Math.exp(-a / lerp(0.3, 0.5, m)) * Math.min(1, a / 0.003) * p * vol * 0.6 * Math.min(1, (nn - i) / (0.02 * sr)); } }
          else { let pc = 0, pm = 0; for (let i = 0; i < nn; i++) { const a = i / sr; pm = (pm + nt.hz * 3.5 / sr) % 1; pc = (pc + nt.hz / sr) % 1;
            O[i0 + i] += Math.sin(TAU * pc + 2.2 * Math.exp(-a / 0.3) * Math.sin(TAU * pm)) * Math.exp(-a / lerp(0.5, 1.2, m)) * Math.min(1, a / 0.002) * p * vol * Math.min(1, (nn - i) / (0.02 * sr)); } } });
        // band texture: roughness inside the band, only where the band is present
        let lp2 = 0; seed = 99 + 13 * k + 101 * ch; for (let i = 0; i < n; i++) { const t = i / (n - 1); lp2 += (rnd() - lp2) * [0.03, 0.04, 0.12, 0.45][k]; O[i] += lp2 * [0.05, 0.03, 0.04, 0.05][k] * tab(B.pres, t) * clamp(tab(B.rough, t) / 30, 0, 1.5); }
        // band level for the meter (presence x instrument gain), both walls summed
        for (let e = 0; e < ne; e++) env[k][e] += 0.5 * tab(B.pres, e / (ne - 1)) * (B.dens.length ? 1 : 0);
      }));
      // rapids: raw terrain times, same thump as the other styles
      const acc = opt.solo === undefined ? SYN.accents.map(a => ({ t: a.i / (N - 1) * dur, a: clamp(a.d / 5, 0.25, 1.1) })) : [];
      for (const A of acc) { const i0 = Math.floor(A.t * sr); let ph = 0; for (let i = 0; i < 0.5 * sr && i0 + i < n; i++) { const x = i / sr; ph += (45 + 70 * Math.exp(-x / 0.04)) / sr;
        const c = (Math.sin(TAU * ph) * Math.exp(-x / 0.35) * 0.55 + rnd() * Math.exp(-x / lerp(0.15, 0.4, m)) * 0.25) * A.a * 0.7071; out[0][i0 + i] += c; out[1][i0 + i] += c; } }
      const nf = Math.floor(0.08 * sr); for (let i = 0; i < n; i++) { const ev = Math.min(1, i / nf, (n - 1 - i) / nf) * 0.9; for (let c = 0; c < 2; c++) out[c][i] = Math.tanh(out[c][i] * ev * 1.1) / 1.1; }
      plan.acc = acc;
      return { L: out[0], R: out[1], tables: T, plan, bandEnv: env, ER };
    }
    return { tables, render, REG };
  }
  return { create, REG };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RiverStrata;
