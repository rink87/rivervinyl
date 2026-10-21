/* Canyon SONG synth: pure JS, no Web Audio. One verse per canyon section, played back to back.
   'musical' (0..1) is the only extra control. At 0 the verse is exactly the original tone-mode sound
   (one continuous oscillator, raw elevation -> exponential pitch, equal-power pan). As it rises:
     - pitch snaps toward a minor pentatonic scale whose ROOT comes from the section's river elevation
     - a plucked note layer fades in; WHEN notes happen comes from the terrain (density = slope + wall roughness),
       and the onsets are pulled toward a steady 84 BPM grid
     - a wall-roughness noise texture fades in (amplitude = real roughness at the playhead)
     - a soft low drone + bar-downbeat bass on the section's root fades in; envelopes get gentler.
   Pitch contour, rhythm density and texture always come from the real data. */
const SongSynth = (() => {
  const TAU = 6.283185307179586, PENT = [0, 3, 5, 7, 10, 12];
  const NOTE = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'];
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  function gauss(a, sigma) { const n = a.length, r = Math.ceil(sigma * 3), k = []; let s = 0;
    for (let i = -r; i <= r; i++) { k.push(Math.exp(-0.5 * (i / sigma) ** 2)); s += k[k.length - 1]; }
    const o = new Float64Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let j = -r; j <= r; j++) { const x = i + j; v += a[x < 0 ? 0 : x >= n ? n - 1 : x] * k[j + r]; } o[i] = v / s; } return o; }
  const snapSemi = (s) => { const oct = Math.floor(s / 12), r = s - oct * 12; let b = 0, bd = 99; for (const p of PENT) { const d = Math.abs(r - p); if (d < bd) { bd = d; b = p; } } return oct * 12 + b; };
  // section: { PD, PE, G (Uint16Array NU*NV), D (meta) }
  function create(CS, sec) {
    const { PD, PE, G, D } = sec, NP = PD.length, base = CS.create(PD, PE), K = base.K, PMIN = base.PMIN;
    // root note from the river elevation: one semitone per 30 m of river height (a canyon cut deeper sits in a lower key)
    const rootPc = ((Math.round(PMIN / 30) % 12) + 12) % 12, rootHz = 110 * Math.pow(2, rootPc / 12);
    // wall roughness along the line, from the real DEM grid (as in groove mode): residual after a 150 m low-pass (fine wall texture, not the big cliffs),
    // RMS over ~200 m, averaged over 3 parallel lines (centre, +-~100 m)
    const NU = D.NU, NV = D.NV, du = (D.L + 2 * D.MARG) / (NU - 1), dv = 2 * D.HALFV / (NV - 1);
    const E = (i, j) => G[clamp(j, 0, NV - 1) * NU + clamp(i, 0, NU - 1)] / D.sc + D.off, jc = (NV - 1) / 2, dj = Math.max(1, Math.round(100 / dv));
    const rough = new Float64Array(NU);
    for (const jo of [0, -dj, dj]) {
      const row = new Float64Array(NU); for (let i = 0; i < NU; i++) row[i] = (E(i, Math.floor(jc + jo)) + E(i, Math.ceil(jc + jo))) / 2;
      const lp = gauss(row, 150 / du), r2 = new Float64Array(NU); for (let i = 0; i < NU; i++) r2[i] = (row[i] - lp[i]) ** 2;
      const g = gauss(r2, 200 / du); for (let i = 0; i < NU; i++) rough[i] += Math.sqrt(g[i]) / 3;
    }
    const roughAt = (idx) => { const d = base.profAt(idx, PD), x = clamp((d + D.MARG) / du, 0, NU - 1), i = Math.min(x | 0, NU - 2); return rough[i] + (rough[i + 1] - rough[i]) * (x - i); };
    const slope = new Float64Array(NP); for (let i = 0; i < NP; i++) { const a = Math.max(i - 1, 0), b = Math.min(i + 1, NP - 1); slope[i] = Math.abs(PE[b] - PE[a]) / ((PD[b] - PD[a]) || 1); }
    const slopeS = gauss(slope, 1.5), slopeAt = (idx) => base.profAt(idx, slopeS);
    function verseDur(o) { const bar = 4 * 60 / o.bpm; return o.musical > 0 ? Math.max(1, Math.round(o.dur / bar)) * bar : o.dur; }
    function tables(o) {
      const T = base.tables(Object.assign({}, o, { quant: 'off' })), TN = T.pitch.length, m = o.musical, sn = sstep(0, 0.7, m);
      const pitch = new Float32Array(TN), dens = new Float32Array(TN), rgh = new Float32Array(TN);
      for (let i = 0; i < TN; i++) {
        const s = 12 * Math.log2(T.pitch[i] / rootHz); pitch[i] = rootHz * Math.pow(2, (s + sn * (snapSemi(s) - s)) / 12);
        const id = T.idx[i]; rgh[i] = roughAt(id);
        dens[i] = clamp(0.25 + 1.2 * slopeAt(id) + rgh[i] / 30, 0.25, 3);   // notes per beat: steep, rough walls play busier
      }
      return Object.assign(T, { raw: T.pitch, pitch, dens, rough: rgh, rootPc, rootHz, rootName: NOTE[rootPc] });
    }
    function notes(o, T, dur) {   // onsets in seconds
      const beat = 60 / o.bpm, qa = sstep(0.1, 0.8, o.musical), steps = 2000, out = []; let ph = 0.999;
      for (let k = 0; k < steps; k++) {
        const t = k / steps * dur; ph += CS_tab(T.dens, k / (steps - 1)) * (dur / steps) / beat;
        if (ph >= 1) { ph -= Math.floor(ph); const g = CS_tab(T.dens, k / (steps - 1)) > 1.6 ? beat / 4 : beat / 2, tq = Math.round(t / g) * g;
          const tt = lerp(t, Math.min(tq, dur - 0.05), qa); if (!out.length || tt - out[out.length - 1] > 0.03) out.push(tt); }
      }
      return out;
    }
    let CS_tab = base.tab;
    function osc(w, p, h) { let b = w === 1 ? 1.2 * (1 - 4 * Math.abs(p - 0.5)) : w === 2 ? 2 * p - 1 : Math.sin(TAU * p);
      return (b + 0.30 * h * Math.sin(TAU * 2 * p) + 0.12 * h * Math.sin(TAU * 3 * p)) / (1 + 0.42 * h); }
    function render(o, sr, seed) {
      const m = clamp(o.musical || 0, 0, 1), dur = verseDur(o), n = Math.max(2, Math.floor(dur * sr)), L = new Float32Array(n), R = new Float32Array(n);
      if (m <= 0) { const r = base.render(Object.assign({}, o, { quant: 'off', dur }), sr); return { L: r.L, R: r.R, tables: tables(o), dur, notes: [] }; }   // exactly the original sound
      const T = tables(o), w = o.wave === 'triangle' ? 1 : o.wave === 'saw' ? 2 : 0, on = notes(o, T, dur), beat = 60 / o.bpm, bar = 4 * beat;
      const contG = 1 - 0.75 * sstep(0, 0.9, m), noteG = 0.75 * sstep(0, 0.5, m), texG = 0.22 * sstep(0, 0.6, m), droneG = 0.3 * Math.pow(m, 1.2);
      const att = lerp(0.004, 0.05, m), tau = lerp(0.10, 0.55, m), ga = 1 - Math.exp(-1 / (sr * lerp(0.002, 0.03, m))), nf = Math.floor(0.05 * sr);
      let ph = 0, f = T.pitch[0], nph = 0, nf0 = T.pitch[0], ni = -1, nt0 = 0, ns = (seed | 0) || 12345, lpN = 0, dph = [0, 0, 0], bph = 0;
      const rnd = () => { ns = (Math.imul(ns, 1664525) + 1013904223) | 0; return (ns >>> 0) / 4294967296 * 2 - 1; };
      for (let i = 0; i < n; i++) {
        const tt = i / sr, t = i / (n - 1);
        // continuous voice (the original line, snapped with a glide)
        f += (CS_tab(T.pitch, t) - f) * ga; ph += f / sr; ph -= Math.floor(ph);
        let v = osc(w, ph, o.harm) * contG;
        // plucked notes: pitch held from the onset, gentle when musical is high
        while (ni + 1 < on.length && on[ni + 1] <= tt) { ni++; nt0 = on[ni]; nf0 = CS_tab(T.pitch, nt0 / dur); }
        if (ni >= 0) { const a = tt - nt0, env = Math.min(1, a / att) * Math.exp(-a / tau); nph += nf0 / sr; nph -= Math.floor(nph); v += osc(w, nph, o.harm * 0.6) * env * noteG; }
        // wall texture: low-passed noise, loudness = real roughness, a little brighter right after each onset
        lpN += (rnd() - lpN) * 0.18; const rg = clamp(CS_tab(T.rough, t) / 40, 0, 1.5), pk = ni >= 0 ? Math.exp(-(tt - nt0) / 0.06) : 0;
        v += lpN * texG * rg * (0.5 + 1.5 * pk);
        const ev = Math.min(1, i / nf, (n - 1 - i) / nf) * 0.9;
        let l = v * CS_tab(T.gl, t) * ev, r = v * CS_tab(T.gr, t) * ev;
        // drone (centre): root an octave down, its fifth and octave, slow swell; bass pluck on each downbeat
        const rf = T.rootHz / 2; dph[0] += rf / sr; dph[1] += rf * 1.5 / sr; dph[2] += rf * 2 / sr;
        const sw = 0.6 + 0.4 * Math.sin(Math.PI * t), bt = tt % bar, bp = Math.min(1, bt / 0.02) * Math.exp(-bt / 0.9);
        bph += rf / sr; const dr = (Math.sin(TAU * dph[0]) + 0.35 * Math.sin(TAU * dph[1]) + 0.2 * Math.sin(TAU * dph[2])) * sw * 0.5 + Math.sin(TAU * bph) * bp * 0.6;
        const dv2 = dr * droneG * ev; l += dv2 * 0.7071; r += dv2 * 0.7071;
        L[i] = Math.tanh(l * 1.1) / 1.1; R[i] = Math.tanh(r * 1.1) / 1.1;
      }
      return { L, R, tables: T, dur, notes: on };
    }
    return { base, K, PMIN, rootPc, rootHz, rootName: NOTE[rootPc], rough, tables, render, verseDur, tab: base.tab };
  }
  // verses = [{ syn, id }...]; returns one stereo buffer with all verses back to back + where each starts
  function renderSong(verses, o, sr) {
    const parts = verses.map((v, k) => v.syn.render(o, sr, 777 + k)), n = parts.reduce((a, p) => a + p.L.length, 0), L = new Float32Array(n), R = new Float32Array(n), starts = [];
    let off = 0; for (const p of parts) { starts.push(off / sr); L.set(p.L, off); R.set(p.R, off); off += p.L.length; }
    return { L, R, parts, starts, total: n / sr };
  }
  return { create, renderSong, NOTE };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SongSynth;
