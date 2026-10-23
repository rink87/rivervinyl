"""Download the few VSCO 2 Community Edition samples needed (CC0 1.0, https://github.com/sgossner/VSCO-2-CE),
measure their pitch, trim from the onset, build a crossfaded sustain loop, and encode compact mono MP3 (32 kHz)
-> samples.json (base64 MP3 + root Hz + loop points relative to the detected onset). Note: VSCO names are one
octave below scientific pitch (its 'C3' is middle C, 261.6 Hz); the pitch here is measured, not taken from names."""
import json, base64, subprocess, urllib.request, urllib.parse, pathlib, numpy as np
from scipy.io import wavfile
H = pathlib.Path(__file__).resolve().parent; RAW = H / 'samples_raw'; RAW.mkdir(exist_ok=True)
REPO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/'
SETS = {
  'cello': ('sustain', ['Strings/Cello Section/susvib/susvib_%s_v1_1.wav' % n for n in ['C3', 'E3', 'G3', 'B3']]),
  'horn':  ('sustain', ['Brass/F Horn/sus/MOHorn_sus_C3_v2_1.wav', 'Brass/F Horn/sus/MOHorn_sus_D4_v1_1.wav']),
  'pizz':  ('oneshot', ['Strings/Cello Section/pizzT/pizzT_%s_v2_RR1.wav' % n for n in ['B1', 'D2', 'F2', 'A2']]),
}
SR = 32000
def pitch(x, sr):
    s = x[int(sr * 0.5):int(sr * 0.5) + 8192] if len(x) > sr * 0.6 + 8192 else x[int(sr * 0.05):int(sr * 0.05) + 4096]
    s = s - s.mean(); ac = np.correlate(s, s, 'full')[len(s) - 1:]; lo, hi = int(sr / 1200), int(sr / 50); k = lo + int(np.argmax(ac[lo:hi]))
    a, b, c = ac[k - 1], ac[k], ac[k + 1]; k = k + 0.5 * (a - c) / (a - 2 * b + c); return sr / k
def onset(x): return int(np.argmax(np.abs(x) > 0.02 * np.abs(x).max()))
out, lic = {}, []
for name, (kind, files) in SETS.items():
    out[name] = []
    for f in files:
        p = RAW / pathlib.Path(f).name
        if not p.exists(): urllib.request.urlretrieve(REPO + urllib.parse.quote(f), p)
        sr0, x = wavfile.read(p); x = x.astype(np.float64); x = x.mean(1) if x.ndim > 1 else x
        hz = pitch(x, sr0)
        # resample to SR via ffmpeg-free linear interp (fine for 44.1k -> 32k on sustained material after LP)
        t = np.arange(int(len(x) * SR / sr0)) * sr0 / SR; y = np.interp(t, np.arange(len(x)), x)
        y = y[max(0, onset(y) - int(0.005 * SR)):]
        if kind == 'sustain':
            L = int(3.2 * SR); y = y[:L]; ls, le, F = int(1.0 * SR), int(3.0 * SR), int(0.3 * SR)
            w = np.linspace(0, 1, F); y[le - F:le] = y[le - F:le] * (1 - w) + y[ls - F:ls] * w   # loop end blends into what precedes loop start
            y = y[:le]
        else:
            L = int(1.4 * SR); y = y[:L]; y[-int(0.1 * SR):] *= np.linspace(1, 0, int(0.1 * SR)); ls = le = 0
        y = y / np.abs(y).max() * 0.89
        tmp = RAW / (p.stem + '_p.wav'); wavfile.write(tmp, SR, (y * 32767).astype(np.int16))
        mp3 = RAW / (p.stem + '.mp3'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(tmp), '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '80k', str(mp3)], check=True)
        out[name].append(dict(src=f, hz=round(hz, 2), kind=kind, ls=ls / SR, le=le / SR, mp3=base64.b64encode(mp3.read_bytes()).decode()))
        print(name, f, round(hz, 1), 'Hz', len(mp3.read_bytes()) // 1024, 'KB')
json.dump(dict(license='CC0 1.0 Universal (public domain dedication)', source='Versilian Studios VSCO 2 Community Edition, https://github.com/sgossner/VSCO-2-CE', sr=SR, sets=out), open(H / 'samples.json', 'w'))
print('total b64 KB', sum(len(s['mp3']) for v in out.values() for s in v) // 1024)
