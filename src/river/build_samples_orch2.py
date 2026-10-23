"""Extra recorded instruments for the per-band instrument picker + style presets (River Vinyl). All from Versilian Studios
VSCO 2 Community Edition (CC0 1.0, https://github.com/sgossner/VSCO-2-CE), including its 'VSCO 1 Percussion' folder.
Same processing as build_samples_orch.py: mono 32 kHz MP3 64 kbps, trimmed from onset; sustains crossfade-looped 1.0-3.0 s;
one-shots faded. Pitches are MEASURED and snapped to the file's note name at whichever octave matches (VSCO folders differ in
octave naming); piano uses its MIDI key map. -> samples_orch2.json (the original samples_orch.json is untouched)."""
import json, base64, subprocess, urllib.request, urllib.parse, pathlib, re, numpy as np
from scipy.io import wavfile
H = pathlib.Path(__file__).resolve().parent; RAW = H / 'samples_raw'; RAW.mkdir(exist_ok=True)
REPO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/'
S, B, W = 'Strings/', 'Brass/', 'Woodwinds/'
def L(fmt, notes): return [fmt % n for n in notes]
SETS = {
  # sustained (legato) instruments
  'trombone':  ('sustain', L(B + 'Tenor Trombone/sus/tenortbn_sus_%s_v2_1.wav', ['A#0', 'D#1', 'F1', 'A#1', 'D2', 'F2', 'C3', 'F3'])),
  'trumpet':   ('sustain', L(B + 'Trumpet/sus/Sum_SHTrumpet_sus_%s_v1_rr1.wav', ['C3', 'D#3', 'G3', 'A#3', 'D4', 'F4', 'A4', 'C5'])),
  'hornFull':  ('sustain', L(B + 'F Horn/sus/MOHorn_sus_%s_v1_1.wav', ['G1', 'A#1', 'D2', 'F2', 'A2', 'C3', 'D4', 'F4'])),
  'bassoon':   ('sustain', L(W + 'Bassoon/sus/PSBassoon_%s_v1_1.wav', ['A#0', 'C#1', 'F1', 'A1', 'C2', 'G2', 'C3', 'D#3'])),
  'clarinet':  ('sustain', L(W + 'Clarinet/susLong/DCClar_susLong_%s_v1_rr1_sum.wav', ['D2', 'F2', 'A#2', 'D3', 'F3', 'A#3', 'D4', 'F4', 'A#4', 'D5'])),
  'oboe':      ('sustain', L(W + 'Oboe/Sus/Oboe_Sus_%s_v1_Main.wav', ['A#2', 'D3', 'F3', 'A#3', 'D4', 'F4', 'A#4', 'D5', 'F5'])),
  'fluteVib':  ('sustain', L(W + 'Flute/susvib/LDFlute_susvib_%s_v1_1.wav', ['C3', 'E3', 'A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6'])),
  'soloViolin':('sustain', L(S + 'Solo Violin/Arco Vib/LLVln_ArcoVib_%s_p.wav', ['G3', 'C4', 'E4', 'A4', 'C5', 'E5', 'G5', 'C6', 'E6'])),
  'bassArcoHi':('sustain', L(S + 'Solo Contrabass/SusVib/BKCtbss_SusVib_%s_v3_rr1.wav', ['A1', 'C#2', 'E2', 'G#2'])),
  # plucked / struck one-shots (one sample per note, round-robin where there are two)
  'bassPizz':  ('oneshot', [S + 'Solo Contrabass/Pizz/BKCtbss_Pizz_%s_v1_rr%d.wav' % (n, r) for n in ['E0', 'G0', 'A#0', 'C1', 'D1', 'E1', 'F#1', 'A1', 'C#2', 'E2'] for r in (1, 2)]),
  'harp':      ('oneshot', L(S + 'Harp/KSHarp_%s.wav', ['E1_f', 'G1_mp', 'B1_mf', 'D2_mf', 'F2_mf', 'A2_mf', 'C3_mf', 'E3_mf', 'G3_mf', 'B3_mf', 'D4_mf', 'F4_mf', 'A4_mf', 'C5_mf', 'E5_mf', 'G5_mf', 'B5_mf', 'D6_mf'])),
  'violinPizz':('oneshot', [S + 'Violin Section/Pizz/VlnEns_Pizz_%s_v2_rr%d.wav' % (n, r) for n in ['G2', 'B2', 'D3', 'F#3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5'] for r in (1, 2)]),
  'violaPizz': ('oneshot', [S + 'Viola Section/pizz/ViolaEns_pizz_%s_v2_rr%d.wav' % (n, r) for n in ['B2', 'D3', 'F3', 'A3', 'C4', 'E4', 'G4'] for r in (1, 2)]),
  'piano':     ('piano',   ['Keys/Upright Piano/Player_dyn2_rr1_%03d.wav' % i for i in range(2, 42, 2)]),
  # accents + grooves
  'timpRoll':  ('perc', ['Percussion/Timpani/Rolls/Timpani1_Roll_v3_rr1_Sum.wav']),
  'giant':     ('perc', ['VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_ff_1.wav', 'VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_ff_2.wav']),
  'kick':      ('hit', ['VSCO 1 Percussion/drums/bass/bdrum_muted_ff_1.wav', 'VSCO 1 Percussion/drums/bass/bdrum_muted_fff_1.wav']),
  'snare':     ('hit', ['Percussion/Snare2-HitSN_v5_rr1_Sum.wav', 'Percussion/Snare2-HitSN_v5_rr2_Sum.wav']),
  'shaker':    ('hit', ["VSCO 1 Percussion/varWood/Camo's Shaker/shake%d.wav" % i for i in (1, 2, 3, 4)]),
  'crash':     ('perc', ['VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_ff_tight.wav']),
  'cabasa':    ('hit', ['VSCO 1 Percussion/varMetal/various/cabasa_%d.wav' % i for i in (1, 2, 3, 4)]),
  'snareTap':  ('hit', ['Percussion/Snare2-taps_v2_rr1_Sum.wav', 'Percussion/Snare2-taps_v2_rr2_Sum.wav']),
  'tamb':      ('hit', ['Percussion/Tamb1-Hit_v1_rr1_Sum.wav', 'Percussion/Tamb1-Hit_v1_rr2_Sum.wav']),
}
SR = 32000
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
def pitch(x, sr):
    s = x[int(sr * 0.5):int(sr * 0.5) + 8192] if len(x) > sr * 0.6 + 8192 else x[int(sr * 0.05):int(sr * 0.05) + 4096]
    s = s - s.mean(); ac = np.correlate(s, s, 'full')[len(s) - 1:]; lo, hi = int(sr / 2000), int(sr / 35); k = lo + int(np.argmax(ac[lo:hi]))
    a, b, c = ac[k - 1], ac[k], ac[k + 1]; k = k + 0.5 * (a - c) / (a - 2 * b + c); return sr / k
def onset(x): return int(np.argmax(np.abs(x) > 0.02 * np.abs(x).max()))
def rs(x, sr0): t = np.arange(int(len(x) * SR / sr0)) * sr0 / SR; return np.interp(t, np.arange(len(x)), x)
def enc(y, stem, br='64k'):
    tmp = RAW / (stem + '_o2.wav'); wavfile.write(tmp, SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
    mp3 = RAW / (stem + '_o2.mp3'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(tmp), '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', br, str(mp3)], check=True)
    return mp3.read_bytes()
def nominal(f, kind):
    if kind == 'piano': key = 21 + 2 * int(re.search(r'_(\d{3})\.wav', f).group(1)); return 440 * 2 ** ((key - 69) / 12)   # MappingChart: 000=21, 001=23 ...
    m = re.search(r'_([A-G]#?)(\d)(_|\.)', pathlib.Path(f).name); return 440 * 2 ** ((NAMES.index(m.group(1)) - 9 + 12 * (int(m.group(2)) - 4)) / 12)
out, report = {}, {}
OCT = {}
for name, (kind, files) in SETS.items():   # pass 1: which octave does this folder's naming use? (VSCO is mostly name+1)
    if kind not in ('sustain', 'oneshot'): continue
    votes = []
    for f in files:
        p = RAW / ('o2_' + re.sub(r'[^A-Za-z0-9_.#-]', '_', f.replace('/', '__')))
        if not p.exists(): urllib.request.urlretrieve(REPO + urllib.parse.quote(f), p)
        sr0, x = wavfile.read(p); x = x.astype(np.float64); x = x.mean(1) if x.ndim > 1 else x; meas, nom = pitch(x, sr0), nominal(f, kind)
        if meas > 0:
            k = min((-1, 0, 1, 2), key=lambda k: abs(np.log2(meas / (nom * 2 ** k))))
            if abs(12 * np.log2(meas / (nom * 2 ** k))) <= 0.6: votes.append(k)
    OCT[name] = max(set(votes), key=votes.count) if votes else 1; print('octave', name, OCT[name], 'votes', votes)
for name, (kind, files) in SETS.items():
    out[name] = []
    for f in files:
        p = RAW / ('o2_' + re.sub(r'[^A-Za-z0-9_.#-]', '_', f.replace('/', '__')))
        if not p.exists(): urllib.request.urlretrieve(REPO + urllib.parse.quote(f), p)
        sr0, x = wavfile.read(p); x = x.astype(np.float64); x = x.mean(1) if x.ndim > 1 else x
        hz = 0
        if kind in ('sustain', 'oneshot', 'piano'):
            meas, nom = pitch(x, sr0), nominal(f, kind)
            if kind == 'piano': hz = nom   # exact key map
            else: hz = nom * 2 ** OCT[name]   # folder-wide octave convention (majority vote of the measurements below)
        y = rs(x, sr0); y = y[max(0, onset(y) - int(0.005 * SR)):]; ls = le = 0
        if kind == 'sustain':
            y = y[:int(3.2 * SR)]
            if len(y) < int(3.2 * SR): y = np.concatenate([y, np.zeros(int(3.2 * SR) - len(y))])
            ls, le, F = int(1.0 * SR), int(3.0 * SR), int(0.3 * SR)
            w = np.linspace(0, 1, F); y[le - F:le] = y[le - F:le] * (1 - w) + y[ls - F:ls] * w; y = y[:le]
        else:
            Ln = int({'oneshot': 1.6, 'piano': 2.6, 'perc': 3.0, 'hit': 0.9}[kind] * SR); y = y[:Ln]; fo = int(min(0.15, len(y) / SR / 4) * SR); y[-fo:] *= np.linspace(1, 0, fo)
        pk = np.abs(y).max(); y = y / pk * 0.89
        b = enc(y, p.stem); seg = y[ls:le] if kind == 'sustain' else y[:int(0.4 * SR)]
        q = dict(src=f, hz=round(float(hz), 2), kind=kind, ls=ls / SR, le=le / SR, rms=round(float(np.sqrt(np.mean(seg ** 2))), 4), mp3=base64.b64encode(b).decode())
        out[name].append(q); print(name, pathlib.Path(f).name, round(hz, 1), 'Hz', round(len(y) / SR, 2), 's', len(b) // 1024, 'KB')
json.dump(dict(license='VSCO 2 CE samples: CC0 1.0', sr=SR, sets=out), open(H / 'samples_orch2.json', 'w'))
print('total b64 KB', sum(len(s['mp3']) for v in out.values() for s in v) // 1024)
