/* River needle STYLE presets (EDM / Country / Pop). Pure JS, no Web Audio; renders into Float32 arrays.
   HARD RULE: the terrain places every melody note and accent. A style may only change
     - timbre/instruments, the tempo grid that onsets are pulled to, the scale family (monotonic snapping, contour kept),
     - the backing (drums, bass, chords from the terrain key; chord changes follow canyon width, lifts follow wall height),
     - mix/effects.
   Raw melody onsets are computed exactly as in the original synth at its reference tempo (84 BPM, density = notes per
   reference beat from wall steepness + roughness), raw pitch is the same wall-height mapping, and rapid accents sit at
   their raw terrain positions (no quantizing at all). */
const RiverStyles = (() => {
  const TAU = 6.283185307179586, REF_BPM = 84;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const SCALES = { minorPent: [0, 3, 5, 7, 10], naturalMinor: [0, 2, 3, 5, 7, 8, 10], majorPent: [0, 2, 4, 7, 9], major: [0, 2, 4, 5, 7, 9, 11] };
  // chord = semitone offset of chord root from the key root + quality
  const STYLES = {
    edm:     { name: 'EDM', bpm: 124, scale: 'naturalMinor', prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], pal: [[.01,.03,.12],[.02,.18,.45],[.1,.5,.9],[.75,.3,1],[1,.85,1]], cl: [.2,1,.9], cr: [1,.3,.9] },
    country: { name: 'Country', bpm: 100, scale: 'majorPent', prog: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']], pal: [[.06,.03,.02],[.3,.12,.04],[.7,.35,.1],[.95,.7,.35],[1,.93,.75]], cl: [.6,.9,.5], cr: [1,.6,.3] },
    pop:     { name: 'Pop', bpm: 110, scale: 'major', prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], pal: [[.05,.02,.15],[.3,.1,.5],[.9,.3,.55],[1,.6,.45],[1,.92,.8]], cl: [.4,.8,1], cr: [1,.45,.6] },
  };
  const snapTo = (s, sc) => { const oc = Math.floor(s / 12), r = s - oc * 12; let b = 0, bd = 99; for (const p of sc.concat([12])) { const d = Math.abs(r - p); if (d < bd) { bd = d; b = p; } } return oc * 12 + b; };
  function create(RD, SYN) {
    const N = RD.N, tab = SYN.tab;
    function tables(o) {   // raw (terrain) tables + style-snapped pitch
      const st = STYLES[o.style], T = SYN.tables(Object.assign({}, o, { musical: 0 })), sn = sstep(0, 0.7, o.musical), sc = SCALES[st.scale];
      for (const S of [T.L, T.R]) { S.raw = S.pitch; S.pitch = new Float32Array(S.raw.length);
        for (let i = 0; i < S.raw.length; i++) { const s = 12 * Math.log2(S.raw[i] / T.rootHz); S.pitch[i] = T.rootHz * Math.pow(2, (s + sn * (snapTo(s, sc) - s)) / 12); } }
      return T;
    }
    // raw onsets: identical loop to the original synth at the reference tempo (qa = 0)
    function rawOnsets(dens, dur, ph0) { const beat = 60 / REF_BPM, st = 4000, out = []; let ph = ph0;
      for (let k = 0; k < st; k++) { const t = k / st * dur, d = tab(dens, k / (st - 1)); ph += d * (dur / st) / beat;
        if (ph >= 1) { ph -= Math.floor(ph); if (!out.length || t - out[out.length - 1].t > 0.03) out.push({ t, d }); } }
      return out; }
    function plan(o) {
      const st = STYLES[o.style], T = tables(o), dur = o.dur, beat = 60 / st.bpm, qa = sstep(0.1, 0.8, o.musical);
      const mel = [T.L, T.R].map((S, ch) => rawOnsets(S.dens, dur, ch ? 0.5 : 0.999).map(n => { const g = n.d > 1.6 ? beat / 4 : beat / 2, tq = Math.min(Math.round(n.t / g) * g, dur - 0.05);
        return { raw: n.t, t: lerp(n.t, tq, qa), rawHz: tab(S.raw, n.t / dur), hz: tab(S.pitch, n.t / dur) }; }));   // pitch read at the RAW (terrain) position
      const acc = SYN.accents.map(a => ({ t: a.i / (N - 1) * dur, d: a.d, i: a.i }));
      // bars + chords: chord follows canyon width (wide -> I, narrow -> later chords); a rapid > 2 m forces a change; lifts on tall/wide stretches
      const bar = 4 * beat, nb = Math.ceil(dur / bar), W = RD.width300, HL = RD.L.h2k, HR = RD.R.h2k, at = (a, t) => a[Math.min(N - 1, Math.round(clamp(t / dur, 0, 1) * (N - 1)))];
      const wb = [], hb = []; for (let b = 0; b < nb; b++) { let w = 0, h = 0; for (let k = 0; k < 8; k++) { const t = (b + k / 8) * bar; w += at(W, t); h += (at(HL, t) + at(HR, t)) / 2; } wb.push(w / 8); hb.push(h / 8); }
      const q = (arr, f) => arr.slice().sort((x, y) => x - y)[Math.floor(f * (arr.length - 1))];
      const w1 = q(wb, .25), w2 = q(wb, .5), w3 = q(wb, .75), lift = wb.map((w, b) => w + hb[b] * 2 >= q(wb.map((x, k) => x + hb[k] * 2), .75));
      const chords = wb.map((w, b) => { let k = w >= w3 ? 0 : w >= w2 ? 1 : w >= w1 ? 3 : 2; if (acc.some(a => a.d > 2 && a.t >= b * bar && a.t < (b + 1) * bar)) k = (k + 1) % 4; return k; });
      const drops = acc.filter(a => a.d >= 3);   // the big rapids (Hance, Sockdolager, Grapevine)
      return { st, T, mel, acc, beat, bar, nb, chords, lift, drops, qa };
    }
    // ---------- instruments ----------
    const ksPluck = (O, t0, f, len, amp, sr, bright, pan) => {   // Karplus-Strong
      const p = Math.max(2, Math.round(sr / f)), buf = new Float32Array(p); let s = 1234 + (t0 * 1000 | 0);
      for (let i = 0; i < p; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; buf[i] = ((s >>> 0) / 4294967296 * 2 - 1); }
      const i0 = Math.floor(t0 * sr), n = Math.min(Math.floor(len * sr), O[0].length - i0); let k = 0, prev = 0;
      for (let i = 0; i < n; i++) { const v = buf[k], nx = buf[(k + 1) % p]; buf[k] = (bright * v + (1 - bright) * 0.5 * (v + nx)) * 0.996; k = (k + 1) % p;
        const env = Math.min(1, (n - i) / (0.02 * sr)); prev += (v - prev) * 0.7; const y = prev * amp * env; O[0][i0 + i] += y * pan[0]; O[1][i0 + i] += y * pan[1]; } };
    const blep = (ph, inc) => { if (ph < inc) { const x = ph / inc; return x + x - x * x - 1; } if (ph > 1 - inc) { const x = (ph - 1) / inc; return x * x + x + x + 1; } return 0; };
    function render(o, sr) {
      const PL = plan(o), { st, mel, acc, beat, bar, nb, chords, lift, drops } = PL, m = clamp(o.musical, 0, 1), dur = o.dur, n = Math.floor(dur * sr);
      const out = [new Float32Array(n), new Float32Array(n)], back = [new Float32Array(n), new Float32Array(n)];
      const root = PL.T.rootHz, noteG = 0.35 + 0.45 * sstep(0, 0.5, m), backG = sstep(0, 0.6, m), lpAtt = lerp(0.003, 0.02, m);
      let seed = 4242; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296 * 2 - 1; };
      const chordHz = (b) => { const c = st.prog[chords[Math.min(nb - 1, b)]]; return [c[0], c[0] + (c[1] === 'm' ? 3 : 4), c[0] + 7].map(s => root * Math.pow(2, s / 12)); };
      // drop envelope for EDM: filter closes during the 2-bar riser, opens on the drop
      const dropAt = (t) => { for (const d of drops) { if (t >= d.t - 2 * bar && t < d.t) return { pre: (t - (d.t - 2 * bar)) / (2 * bar), d }; if (t >= d.t && t < d.t + 4 * bar) return { post: (t - d.t) / (4 * bar), d }; } return null; };
      // ---- melody: one voice per wall, onsets/pitch from the terrain plan ----
      mel.forEach((notes, ch) => { const O = out[ch], pan = ch ? [0, 1] : [1, 0];
        notes.forEach((nt, k) => { const next = k + 1 < notes.length ? notes[k + 1].t : dur, len = Math.min(2.2, next - nt.t + 0.25), f = nt.hz, i0 = Math.floor(nt.t * sr);
          if (o.style === 'country') { ksPluck(out, nt.t, f, Math.min(2.5, len + 0.8), noteG * 0.9, sr, ch ? 0.15 : 0.35, pan); return; }   // L guitar-ish, R banjo-ish (brighter)
          const nn = Math.min(Math.floor(len * sr), n - i0); let p1 = 0, p2 = 0, p3 = 0, lp = 0;
          for (let i = 0; i < nn; i++) { const a = i / sr; let y;
            if (o.style === 'edm') { const i1 = f / sr, i2 = f * 1.006 / sr, i3 = f * 0.994 / sr; p1 = (p1 + i1) % 1; p2 = (p2 + i2) % 1; p3 = (p3 + i3) % 1;
              const saw = ((2 * p1 - 1 - blep(p1, i1)) + (2 * p2 - 1 - blep(p2, i2)) + (2 * p3 - 1 - blep(p3, i3))) / 3, dz = dropAt(nt.t + a);
              const cut = (dz && dz.pre !== undefined ? lerp(0.25, 0.04, dz.pre) : dz ? lerp(0.6, 0.25, dz.post) : 0.25) * (0.4 + 0.6 * Math.exp(-a / 0.15));
              lp += (saw - lp) * cut; y = lp * Math.min(1, a / lpAtt) * Math.exp(-a / lerp(0.18, 0.35, m)) * 0.8;
            } else { p1 = (p1 + f / sr) % 1;   // pop: bright piano-ish (harmonics decay faster the higher they are)
              y = (Math.sin(TAU * p1) * Math.exp(-a / 0.9) + 0.5 * Math.sin(TAU * 2 * p1) * Math.exp(-a / 0.35) + 0.3 * Math.sin(TAU * 3 * p1) * Math.exp(-a / 0.18) + 0.15 * Math.sin(TAU * 5 * p1) * Math.exp(-a / 0.08)) / 1.6 * Math.min(1, a / 0.004); }
            const rel = Math.min(1, (nn - i) / (0.03 * sr)); O[i0 + i] += y * noteG * rel; } }); });
      // ---- wall texture (as original: roughness noise per wall) ----
      [PL.T.L, PL.T.R].forEach((S, ch) => { let lp = 0; seed = 1234 + ch * 777; for (let i = 0; i < n; i++) { lp += (rnd() - lp) * 0.12; out[ch][i] += lp * 0.06 * clamp(tab(S.rough, i / (n - 1)) / 35, 0, 1.6); } });
      // ---- backing (centre), scaled by Musical ----
      const B = back, add = (i, v) => { if (i >= 0 && i < n) { B[0][i] += v; B[1][i] += v; } };
      const kick = (t, a) => { const i0 = Math.floor(t * sr); let ph = 0; for (let i = 0; i < 0.35 * sr; i++) { const x = i / sr; ph += (45 + 110 * Math.exp(-x / 0.03)) / sr; add(i0 + i, Math.sin(TAU * ph) * Math.exp(-x / 0.16) * a); } };
      const noiseHit = (t, a, dec, hp) => { const i0 = Math.floor(t * sr); let y = 0, px = 0; for (let i = 0; i < dec * 6 * sr; i++) { const w = rnd(); const h = hp ? w - px : w; px = w; y += (h - y) * 0.6; add(i0 + i, y * Math.exp(-i / sr / dec) * a); } };
      const tone = (t, f, len, a, kind) => { const i0 = Math.floor(t * sr); let ph = 0, lp = 0; for (let i = 0; i < len * sr; i++) { const x = i / sr; ph = (ph + f / sr) % 1;
        let v = kind === 'saw' ? 2 * ph - 1 - blep(ph, f / sr) : Math.sin(TAU * ph) + 0.3 * Math.sin(TAU * 2 * ph); lp += (v - lp) * 0.15;
        add(i0 + i, lp * a * Math.min(1, x / 0.005) * Math.min(1, (len - x) / 0.03)); } };
      const nBeats = Math.floor(dur / beat);
      if (backG > 0) for (let b = 0; b < nBeats; b++) { const t = b * beat, bi = Math.floor(t / bar), bb = b % 4, L = lift[Math.min(nb - 1, bi)], ch = chordHz(bi), dz = dropAt(t), pre = dz && dz.pre !== undefined;
        if (o.style === 'edm') {
          if (!pre || dz.pre < 0.5) kick(t, 0.8 * backG);
          noiseHit(t + beat / 2, 0.16 * backG, 0.025, true);                       // offbeat hat
          tone(t + beat / 2, ch[0] / 2, beat * 0.45, 0.32 * backG, 'saw');            // offbeat bass
          if (pre) for (let s = 0; s < 4; s++) noiseHit(t + s * beat / 4, 0.05 * backG * (1 + 3 * dz.pre), 0.02, true);   // riser roll
        } else if (o.style === 'country') {
          for (let s = 0; s < 2; s++) noiseHit(t + s * beat / 2, (s === 0 && (bb === 1 || bb === 3) ? 0.2 : 0.07) * backG, 0.06, false);   // train beat (brushes)
          if (bb === 0) kick(t, 0.35 * backG);
          tone(t, (bb % 2 === 0 ? ch[0] : ch[2]) / 2, beat * 0.8, 0.35 * backG, 'sine');   // root-fifth bass
          if (bb === 1 || bb === 3) ch.forEach((f, k) => ksPluck(B, t + k * 0.012, f, 0.6, 0.12 * backG, sr, 0.2, [1, 1]));   // strum on 2 and 4
        } else {
          if (bb === 0 || bb === 2) kick(t, 0.6 * backG); if (bb === 1 || bb === 3) { noiseHit(t, 0.28 * backG, 0.07, true); kick(t, 0.12 * backG); }   // backbeat
          noiseHit(t, 0.07 * backG, 0.02, true); noiseHit(t + beat / 2, 0.07 * backG, 0.02, true);
          tone(t, ch[0] / 2, beat * 0.45, 0.3 * backG, 'sine'); tone(t + beat / 2, ch[0] / 2, beat * 0.4, 0.22 * backG, 'sine');
          ch.forEach(f => tone(t, f, beat * 0.5, (L ? 0.1 : 0.06) * backG, 'sine'));   // chord stabs, louder in a lift
        } }
      // pads (EDM sidechained supersaw, Pop lift pad)
      if (backG > 0 && o.style !== 'country') { const ph = new Float64Array(9);
        for (let i = 0; i < n; i++) { const t = i / sr, bi = Math.min(nb - 1, Math.floor(t / bar)), ch = chordHz(bi); let v = 0;
          for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) { const f = ch[k] * (1 + (d - 1) * 0.004), j = k * 3 + d; ph[j] = (ph[j] + f / sr) % 1; v += o.style === 'edm' ? 2 * ph[j] - 1 : Math.sin(TAU * ph[j]); }
          let g = o.style === 'edm' ? 0.03 * (1 - 0.75 * Math.exp(-((t % beat) / 0.11))) : (lift[bi] ? 0.035 : 0.012);
          const dz = o.style === 'edm' ? dropAt(t) : null; if (dz) g *= dz.pre !== undefined ? 1 - 0.6 * dz.pre : 1.5;
          add(i, v * g * backG); } }
      // ---- rapids: accents at their raw terrain times (identical in every style); EDM: big ones are drops ----
      for (const a of acc) { const A = clamp(a.d / 5, 0.25, 1.1);
        kick(a.t, 0.55 * A); noiseHit(a.t, 0.25 * A, lerp(0.15, 0.4, m), false);
        if (o.style === 'edm' && a.d >= 3) { kick(a.t, 1.0 * backG + 0.3); noiseHit(a.t, 0.4 * backG, 0.6, false);
          const i0 = Math.floor((a.t - 2 * bar) * sr); for (let i = Math.max(0, -i0); i < 2 * bar * sr; i++) { const x = i / (2 * bar * sr); add(i0 + i, rnd() * x * x * 0.18 * backG); } } }
      // ---- mix ----
      const nf = Math.floor(0.08 * sr), mg = { edm: 0.85, country: 0.9, pop: 0.65 }[o.style];
      for (let i = 0; i < n; i++) { const ev = Math.min(1, i / nf, (n - 1 - i) / nf) * mg;
        for (let c = 0; c < 2; c++) out[c][i] = Math.tanh((out[c][i] + back[c][i] * 0.8) * ev * 1.15) / 1.15; }
      return { L: out[0], R: out[1], tables: PL.T, plan: PL };
    }
    return { tables, plan, render, rawOnsets };
  }
  return { create, STYLES, REF_BPM };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RiverStyles;
