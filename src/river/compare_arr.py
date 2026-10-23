"""Compare each recorded preset render with its original synth WAV (and the previous preset render if given):
tempo (onset-envelope autocorrelation), onset rate, onset-pattern correlation with the original (50 ms bins), spectral centroid,
RMS and level per region (low <250 Hz, mid 250-2k, high >2k, dB re total), octave-band profile distance. -> verify_arr.json"""
import numpy as np, json, sys, pathlib
from scipy.io import wavfile
SR = 44100; ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
ORIG = {'canyon': 'canyon_river.wav', 'edm': 'canyon_river_edm.wav', 'country': 'canyon_river_country.wav', 'pop': 'canyon_river_pop.wav'}
def load(p): sr, x = wavfile.read(p); return x.astype(np.float64).mean(1) / 32768
def stft(x, N=2048, hop=512):
    w = np.hanning(N); fr = np.lib.stride_tricks.sliding_window_view(x, N)[::hop] * w; return np.abs(np.fft.rfft(fr, axis=1)), np.fft.rfftfreq(N, 1 / SR)
def metrics(x):
    S, f = stft(x); P = S ** 2; tot = P.sum()
    flux = np.maximum(0, np.diff(np.log1p(100 * S), axis=0)).sum(1); flux -= flux.mean(); fr = SR / 512
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]; lags = np.arange(len(ac)) / fr; ok = (lags > 60 / 190) & (lags < 60 / 55)
    bpm = 60 / lags[ok][np.argmax(ac[ok])]
    thr = flux.mean() + 1.5 * flux.std(); pk = [i for i in range(1, len(flux) - 1) if flux[i] > thr and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1]]
    cent = float((P.sum(0) * f).sum() / tot)
    reg = lambda a, b: 10 * np.log10(P[:, (f >= a) & (f < b)].sum() / tot + 1e-12)
    oct = np.array([P[:, (f >= e) & (f < 2 * e)].sum() for e in [44, 88, 177, 355, 710, 1420, 2840, 5680]]); oct = 10 * np.log10(oct / tot + 1e-12)
    env = np.zeros(int(len(x) / SR / 0.05) + 1); 
    for i in pk: env[int(i / fr / 0.05)] = 1
    return dict(rms_dB=round(float(20 * np.log10(np.sqrt((x ** 2).mean()))), 1), tempo_bpm=round(float(bpm), 1), onsets_per_s=round(len(pk) / (len(x) / SR), 2), centroid_Hz=round(cent),
                low_dB=round(float(reg(0, 250)), 1), mid_dB=round(float(reg(250, 2000)), 1), high_dB=round(float(reg(2000, 22050)), 1), _oct=oct, _env=env)
def cmp(a, b):
    e1, e2 = a['_env'], b['_env']; k = np.convolve(np.ones(3), e1, 'same'); m = min(len(e1), len(e2))
    hit = float((np.convolve(e2, np.ones(3), 'same')[:m] * e1[:m] > 0).sum() / max(1, e1[:m].sum()))   # share of original onsets matched within +-50 ms
    return dict(onsetMatch=round(hit, 2), octaveProfileRMSdiff_dB=round(float(np.sqrt(((a['_oct'] - b['_oct']) ** 2).mean())), 1))
rep = {}
for sty, of in ORIG.items():
    o = metrics(load(ROOT / of)); n = metrics(load(ROOT / f'canyon_river_orch_{sty}.wav')); r = {'original': o, 'new_preset': n, 'new_vs_original': cmp(o, n)}
    old = pathlib.Path(f'/tmp/arr/canyon_river_orch_{sty}.wav')
    if old.exists(): p = metrics(load(old)); r['previous_preset'] = p; r['previous_vs_original'] = cmp(o, p)
    for v in r.values(): v.pop('_oct', None); v.pop('_env', None)
    rep[sty] = r; print(sty, json.dumps(r))
json.dump(rep, open(pathlib.Path(__file__).resolve().parent / 'verify_arr.json', 'w'), indent=1)
