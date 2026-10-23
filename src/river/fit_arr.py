"""Fit RiverArr layer gains so each recorded layer mix matches the original synth WAV: energy per octave band (63 Hz-8 kHz)
in 5 s windows, relative-error NNLS. Also used to report the comparison metrics (verify_arr.json)."""
import numpy as np, json, sys, pathlib
from scipy.io import wavfile
from scipy.optimize import lsq_linear
SR = 44100; H = pathlib.Path(__file__).resolve().parent; ROOT = H.parent.parent
LAYERS = ['lead', 'cont', 'tex', 'bass', 'harm', 'pad', 'drums', 'acc', 'drone']
ORIG = {'canyon': 'canyon_river.wav', 'edm': 'canyon_river_edm.wav', 'country': 'canyon_river_country.wav', 'pop': 'canyon_river_pop.wav'}
EDG = [44, 88, 177, 355, 710, 1420, 2840, 5680, 11360]
def feats(x):   # x mono float; returns (windows x bands) energy
    W = 5 * SR; F = []
    for w0 in range(0, len(x) - W + 1, W):
        seg = x[w0:w0 + W]; S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2; f = np.fft.rfftfreq(len(seg), 1 / SR)
        F.append([S[(f >= EDG[k]) & (f < EDG[k + 1])].sum() for k in range(len(EDG) - 1)])
    return np.array(F)
def load(p): sr, x = wavfile.read(p); x = x.astype(np.float64) / 32768; return x.mean(1)
def fit(sty, mg):
    tgt = feats(load(ROOT / ORIG[sty])).ravel(); cols, used = [], []
    for k in LAYERS:
        y = np.fromfile(f'/tmp/arr/{sty}_{k}.f32', dtype=np.float32).astype(np.float64); y = (y[0::2] + y[1::2]) / 2
        if np.abs(y).max() < 1e-9: continue
        cols.append(feats(y * mg).ravel()); used.append(k)
    A = np.array(cols).T; w = 1 / (tgt + 1e-3 * tgt.mean())   # relative error
    # bounded (gain 0.33-3) least squares with a weak prior toward the original's own coefficients (gain 1)
    Aw, tw = A * w[:, None], tgt * w; lam = 0.15 * np.sqrt(len(tw)); P = np.eye(len(used)) * lam
    sol = lsq_linear(np.vstack([Aw, P]), np.concatenate([tw, np.ones(len(used)) * lam]), bounds=(0.11, 9)).x
    g = {k: round(float(np.sqrt(max(s, 0))), 3) for k, s in zip(used, sol)}
    return g
if __name__ == '__main__':
    MG = {'canyon': 0.9 * 1.1, 'edm': 0.85 * 1.15, 'country': 0.9 * 1.15, 'pop': 0.65 * 1.15}
    out = {s: fit(s, MG[s]) for s in sys.argv[1:]}
    print(json.dumps(out)); json.dump(out, open('/tmp/arr/gains.json', 'w'))
