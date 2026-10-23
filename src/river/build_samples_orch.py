"""Strata Orchestra sample set: VSCO 2 Community Edition (CC0 1.0, https://github.com/sgossner/VSCO-2-CE) + one OpenAIR concert-hall
impulse response (Jack Lyons Concert Hall, University of York, CC BY 4.0). Pitches are MEASURED (VSCO names sit one octave below
scientific pitch). Sustains/tremolos: trimmed from onset, crossfade-looped 1.0-3.0 s. One-shots: trimmed + faded. All mono 32 kHz MP3 64 kbps;
IR: B-format decoded to stereo (L = W + Y, R = W - Y), resampled to 32 kHz, 2.4 s with a fade, stereo MP3 96 kbps. -> samples_orch.json"""
import json, base64, subprocess, urllib.request, urllib.parse, pathlib, numpy as np
from scipy.io import wavfile
H = pathlib.Path(__file__).resolve().parent; RAW = H / 'samples_raw'; RAW.mkdir(exist_ok=True)
REPO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/'
S = 'Strings/'
SETS = {
  'bass':      ('sustain', [S + 'Solo Contrabass/SusVib/BKCtbss_SusVib_%s_v3_rr1.wav' % n for n in ['F#0', 'A#0', 'D1', 'F#1']]),
  'bassTrem':  ('sustain', [S + 'Solo Contrabass/Trem/BKCtbss_Trem_%s_v2_rr1.wav' % n for n in ['E0', 'G0', 'C1', 'E1']]),
  'tuba':      ('sustain', ['Brass/Tuba/sus/Tuba3_sus_F0_v1_rr1_Mid.wav', 'Brass/Tuba/sus/Tuba3_sus_A#0_v2_rr1_Mid.wav', 'Brass/Tuba/sus/Tuba3_sus_D#1_v2_rr1_Mid.wav']),
  'cello':     ('sustain', [S + 'Cello Section/susvib/susvib_%s_v1_1.wav' % n for n in ['G1', 'B1', 'D2', 'F2', 'A2']]),
  'celloTrem': ('sustain', [S + 'Cello Section/trem/trem_%s_v1_1.wav' % n for n in ['G1', 'B1', 'D2', 'F2', 'A2']]),
  'celloPizz': ('oneshot', [S + 'Cello Section/pizzT/pizzT_%s_v2_RR%d.wav' % (n, r) for n in ['G1', 'B1', 'D2', 'F2', 'A2'] for r in (1, 2)]),
  'viola':     ('sustain', [S + 'Viola Section/susvib/ViolaEns_susvib_%s_v1_1.wav' % n for n in ['B2', 'D3', 'F3', 'A3', 'C4']]),
  'violaTrem': ('sustain', [S + 'Viola Section/trem/Violas_trem_%s_v1_rr1.wav' % n for n in ['B2', 'D3', 'F3', 'A3', 'C4']]),
  'horn':      ('sustain', ['Brass/F Horn/sus/MOHorn_sus_A2_v1_1.wav', 'Brass/F Horn/sus/MOHorn_sus_C3_v2_1.wav', 'Brass/F Horn/sus/MOHorn_sus_D4_v1_1.wav']),
  'violin':    ('sustain', [S + 'Violin Section/susVib/VlnEns_susVib_%s_v1.wav' % n for n in ['E4', 'G4', 'B4', 'D5']]),
  'violinTrem':('sustain', [S + 'Violin Section/Trem/VlnEns_Trem_%s_v1.wav' % n for n in ['E4', 'G4', 'B4', 'D5']]),
  'flute':     ('sustain', ['Woodwinds/Flute/susNV/LDFlute_susNV_%s_v1_1.wav' % n for n in ['E4', 'A4', 'C5', 'E5']]),
  'timp':      ('perc', ['Percussion/Timpani/Timpani1_Hit_v3_rr1_Sum.wav', 'Percussion/Timpani/Timpani1_Hit_v3_rr2_Sum.wav']),
  'bdrum':     ('perc', ['Percussion/BDrumNewhit_v5_rr1_Sum.wav', 'Percussion/BDrumNewhit_v5_rr2_Sum.wav']),
  'cymSwell':  ('swell', ['Percussion/susCymb1-cresc-Short_v1.wav']),
}
SR = 32000
def pitch(x, sr):
    s = x[int(sr * 0.5):int(sr * 0.5) + 8192] if len(x) > sr * 0.6 + 8192 else x[int(sr * 0.05):int(sr * 0.05) + 4096]
    s = s - s.mean(); ac = np.correlate(s, s, 'full')[len(s) - 1:]; lo, hi = int(sr / 2000), int(sr / 35); k = lo + int(np.argmax(ac[lo:hi]))
    a, b, c = ac[k - 1], ac[k], ac[k + 1]; k = k + 0.5 * (a - c) / (a - 2 * b + c); return sr / k
def onset(x): return int(np.argmax(np.abs(x) > 0.02 * np.abs(x).max()))
def rs(x, sr0): t = np.arange(int(len(x) * SR / sr0)) * sr0 / SR; return np.interp(t, np.arange(len(x)), x)
def enc(y, stem, ch=1, br='64k'):
    tmp = RAW / (stem + '_o.wav'); wavfile.write(tmp, SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
    mp3 = RAW / (stem + '_o.mp3'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(tmp), '-ac', str(ch), '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', br, str(mp3)], check=True)
    return mp3.read_bytes()
out = {}
for name, (kind, files) in SETS.items():
    out[name] = []
    for f in files:
        p = RAW / pathlib.Path(f).name
        if not p.exists(): urllib.request.urlretrieve(REPO + urllib.parse.quote(f), p)
        sr0, x = wavfile.read(p); x = x.astype(np.float64); x = x.mean(1) if x.ndim > 1 else x
        hz = pitch(x, sr0) if kind in ('sustain', 'oneshot') else 0
        if hz:   # sanity-check against the note name (VSCO name octave + 1 = scientific); tremolo/octave errors fall back to the nominal pitch
            import re; m = re.search(r'_([A-G]#?)(\d)_', pathlib.Path(f).name); nom = 440 * 2 ** (('C C# D D# E F F# G G# A A# B'.split().index(m.group(1)) - 9 + 12 * (int(m.group(2)) + 1 - 4)) / 12)
            if hz <= 0 or abs(12 * np.log2(hz / nom)) > 0.6: print('  pitch fallback', f, round(hz, 1), '->', round(nom, 2)); hz = nom
        y = rs(x, sr0); y = y[max(0, onset(y) - int(0.005 * SR)):]; ls = le = 0
        if kind == 'sustain':
            y = y[:int(3.2 * SR)]; ls, le, F = int(1.0 * SR), int(3.0 * SR), int(0.3 * SR)
            w = np.linspace(0, 1, F); y[le - F:le] = y[le - F:le] * (1 - w) + y[ls - F:ls] * w; y = y[:le]
        else:
            L = int({'oneshot': 1.4, 'perc': 3.0, 'swell': 8.0}[kind] * SR); y = y[:L]; fo = int(0.15 * SR); y[-fo:] *= np.linspace(1, 0, fo)
        if kind == 'swell': y = rs(x, sr0)[:len(y)]; y[-fo:] *= np.linspace(1, 0, fo)   # keep the quiet start of the crescendo
        pk = np.abs(y).max(); y = y / pk * 0.89
        b = enc(y, p.stem)
        q = dict(src=f, hz=round(hz, 2), kind=kind, ls=ls / SR, le=le / SR, mp3=base64.b64encode(b).decode())
        if kind == 'swell': q['peakAt'] = round(float(np.argmax(np.abs(y))) / SR, 3)
        out[name].append(q); print(name, pathlib.Path(f).name, round(hz, 1), 'Hz', round(len(y) / SR, 2), 's', len(b) // 1024, 'KB')
# impulse response
irp = H.parent.parent / '../orch/ir/lp2.wav'; irp = pathlib.Path('/workspace/orch/ir/lp2.wav')
sr0, x = wavfile.read(irp); x = x.astype(np.float64); W, X, Y = x[:, 0], x[:, 1], x[:, 2]
L, R = rs(W + Y, sr0), rs(W - Y, sr0); st = max(0, onset(L + R) - int(0.002 * SR)); n = int(2.4 * SR); L, R = L[st:st + n], R[st:st + n]
fo = np.linspace(1, 0, int(0.6 * SR)); L[-len(fo):] *= fo; R[-len(fo):] *= fo; pk = max(np.abs(L).max(), np.abs(R).max()); st2 = np.stack([L, R], 1) / pk * 0.89
tmp = RAW / 'ir_o.wav'; wavfile.write(tmp, SR, (st2 * 32767).astype(np.int16)); mp3 = RAW / 'ir_o.mp3'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(tmp), '-ac', '2', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '96k', str(mp3)], check=True)
ir = dict(src='OpenAIR: Jack Lyons Concert Hall, University of York, rir_jack_lyons_lp2_96k.wav (seat D22, 10 m), B-format -> stereo L=W+Y R=W-Y',
          license='CC BY 4.0', mp3=base64.b64encode(mp3.read_bytes()).decode())
json.dump(dict(license='VSCO 2 CE samples: CC0 1.0; impulse response: OpenAIR CC BY 4.0', sr=SR, sets=out, ir=ir), open(H / 'samples_orch.json', 'w'))
print('IR KB', len(mp3.read_bytes()) // 1024, 'total b64 KB', (sum(len(s['mp3']) for v in out.values() for s in v) + len(ir['mp3'])) // 1024)
