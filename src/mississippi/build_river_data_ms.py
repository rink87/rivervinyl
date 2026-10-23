"""River mode data, SECOND RIVER: Upper Mississippi in the Driftless bluff country (Trempealeau / Great River Bluffs -> La Crosse),
same pipeline as src/river/build_river_data.py: USGS NHD flowline (hydro.nationalmap.gov, layer 6, gnis_name='Mississippi River',
ftype 558 artificial path), resampled to 1000 points, perpendicular cross-sections (+-6 km here: the bluffs stand 1-4 km back
from the main channel), AWS terrarium z13 terrain, same wall metrics and the SAME height bands / pitch mapping (true heights,
no renormalisation). Accents: no rapids here -> Locks & Dams 6 and 7 (drop = measured pool step from the terrain model) and
tributary mouths (GNIS 'Streams (Mouth)') as light named-feature accents. -> river_ms.json"""
import json, math, io, base64, collections, urllib.request
import numpy as np
from PIL import Image
H = __import__('pathlib').Path(__file__).resolve().parent
LAT0, LON0, R = 43.8, -91.3, 6371008.8
KX = math.cos(math.radians(LAT0)) * R * math.pi / 180; KY = R * math.pi / 180
toxy = lambda lo, la: ((lo - LON0) * KX, (la - LAT0) * KY)
toll = lambda x, y: (LON0 + x / KX, LAT0 + y / KY)
S0, S1, N, HALF, STEP, Z = 22000.0, 70000.0, 1000, 6000.0, 20.0, 13
# ---- centerline: chain NHD segments head -> mouth
segs = [[p[:2] for p in f['geometry']['coordinates']] for f in json.load(open(H / 'nhd.json'))['features'] if f['geometry']['type'] == 'LineString']
key = lambda p: (round(p[0], 5), round(p[1], 5))
st = collections.defaultdict(list); [st[key(s[0])].append(i) for i, s in enumerate(segs)]
ends = {key(s[-1]) for s in segs}; ch = [next(i for i, s in enumerate(segs) if key(s[0]) not in ends)]
while True:
    nx = [n for n in st.get(key(segs[ch[-1]][-1]), []) if n not in ch]
    if not nx: break
    ch.append(max(nx, key=lambda n: len(segs[n])))
pts = []
for i in ch: pts += segs[i] if not pts else segs[i][1:]
xy = np.array([toxy(*p) for p in pts]); c = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(xy, axis=0).T))])
def at(s): return np.array([np.interp(s, c, xy[:, 0]), np.interp(s, c, xy[:, 1])])
ss = np.linspace(S0, S1, N); P = np.stack([at(s) for s in ss])
# smooth tangent over ~400 m
fine = np.arange(S0 - 1500, S1 + 1500, 10.0); F = np.stack([at(s) for s in fine])
k = np.exp(-0.5 * (np.arange(-60, 61) / 20.0) ** 2); k /= k.sum()
Fs = np.stack([np.convolve(np.pad(F[:, j], 60, mode='edge'), k, 'valid') for j in range(2)], 1)
T = np.gradient(Fs, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
Tn = np.stack([np.interp(ss, fine, T[:, 0]), np.interp(ss, fine, T[:, 1])], 1); Tn /= np.linalg.norm(Tn, axis=1)[:, None]
Lft = np.stack([-Tn[:, 1], Tn[:, 0]], 1)   # river-left when facing downstream
# ---- terrain sampling
tiles = {}
def tile(x, y):
    if (x, y) not in tiles:
        b = urllib.request.urlopen(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png', timeout=30).read()
        a = np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(np.float64)
        tiles[(x, y)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return tiles[(x, y)]
def elev(X, Y):
    lo, la = toll(X, Y); n = 2 ** Z; fx = (lo + 180) / 360 * n * 256
    fy = (1 - np.arcsinh(np.tan(np.radians(la))) / np.pi) / 2 * n * 256
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int); ax, ay = fx - x0, fy - y0
    def g(X_, Y_):
        out = np.empty(X_.shape)
        for (tx, ty) in set(zip((X_ // 256).ravel().tolist(), (Y_ // 256).ravel().tolist())):
            m = (X_ // 256 == tx) & (Y_ // 256 == ty); out[m] = tile(tx, ty)[Y_[m] % 256, X_[m] % 256]
        return out
    return g(x0, y0) * (1 - ax) * (1 - ay) + g(x0 + 1, y0) * ax * (1 - ay) + g(x0, y0 + 1) * (1 - ax) * ay + g(x0 + 1, y0 + 1) * ax * ay
off = np.arange(-HALF, HALF + 1, STEP); NO = len(off); mid = NO // 2
CX = P[:, 0:1] + Lft[:, 0:1] * off[None]; CY = P[:, 1:2] + Lft[:, 1:2] * off[None]
XS = elev(CX, CY)                         # N x NO, +off = river-left
# river surface: lowest point within +-150 m, then forced non-increasing downstream (water runs downhill)
w = int(150 / STEP); riv_raw = XS[:, mid - w:mid + w + 1].min(1)
riv = np.minimum.accumulate(np.convolve(np.pad(riv_raw, 4, mode='edge'), np.ones(9) / 9, 'valid'))
def side(sign):
    prof = XS[:, mid::1] if sign > 0 else XS[:, mid::-1]       # outward from river, 0..4 km
    d = np.arange(prof.shape[1]) * STEP; rel = prof - riv[:, None]
    h500 = rel[:, int(500 / STEP)]; h2k = rel[:, int(2000 / STEP)]; hmax = rel.max(1)
    steep = np.degrees(np.arctan(np.maximum(rel[:, int(500 / STEP)], 0) / 500.0))
    above = rel > 300; wd = np.where(above.any(1), above.argmax(1) * STEP, 4000.0)   # distance to the +300 m contour
    kk = np.exp(-0.5 * (np.arange(-15, 16) / 7.5) ** 2); kk /= kk.sum()   # sigma 150 m
    seg = prof[:, :int(2000 / STEP) + 1]; sm = np.stack([np.convolve(np.pad(r, 15, mode='edge'), kk, 'valid') for r in seg])
    rough = np.sqrt(((seg - sm)[:, 2:] ** 2).mean(1))
    return dict(h500=h500, h2k=h2k, hmax=hmax, steep=steep, dist300=wd, rough=rough)
Ls, Rs = side(+1), side(-1)
# STRATA prototype: height bands above the river (approximate stand-ins for rock layers, NOT mapped geology)
BANDS = [(0, 300), (300, 650), (650, 1000), (1000, 9999)]
def bands(sign):
    prof = XS[:, mid::1] if sign > 0 else XS[:, mid::-1]; rel = prof - riv[:, None]; out = []
    for lo, hi in BANDS:
        inb = (rel >= lo) & (rel < hi); pres = inb.sum(1) * STEP                       # horizontal extent of the wall inside the band (m, within 4 km)
        gr = np.abs(np.gradient(rel, STEP, axis=1)); stp = np.where(inb.any(1), (gr * inb).sum(1) / np.maximum(inb.sum(1), 1), 0)
        steep = np.degrees(np.arctan(stp))
        res = rel - np.stack([np.convolve(np.pad(r, 7, mode='edge'), np.ones(15) / 15, 'valid') for r in rel])
        rough = np.sqrt(np.where(inb, res ** 2, 0).sum(1) / np.maximum(inb.sum(1), 1))
        entry = np.where(inb.any(1), inb.argmax(1) * STEP, 4000.0)                      # how far out from the river the band starts (its contour)
        out.append(dict(pres=pres, steep=steep, rough=rough, entry=entry))
    return out
BL, BR = bands(+1), bands(-1)
width300 = Ls['dist300'] + Rs['dist300']
# accents: Locks & Dams (USACE positions; drop = pool step measured on the terrain-model water surface over +-1.5 km)
def proj(la, lo):
    x, y = toxy(lo, la); d = np.hypot(P[:, 0] - x, P[:, 1] - y); i = int(d.argmin()); return i, float(d[i])
drop = np.zeros(N); marks = []
for nm, la, lo in [('Lock & Dam 6 (Trempealeau)', 44.0003, -91.4403), ('Lock & Dam 7 (Dresbach)', 43.8664, -91.3097)]:
    i, d = proj(la, lo)
    if 0 < i < N - 1 and d < 600:
        k = int(1500 / (ss[1] - ss[0])); up = np.median(riv_raw[max(0, i - k):max(1, i - 3)]); dn_ = np.median(riv_raw[min(N - 1, i + 3):min(N, i + k)])
        drop[i] = max(1.05, round(float(up - dn_), 2)); marks.append(dict(name=nm, i=i, lat=la, lon=lo, off=round(d), kind='rapid', drop=round(float(up - dn_), 2)))
# tributary mouths (GNIS Streams (Mouth), layer 6) on the main channel -> light accents (marked as features, d just above the accent threshold)
for f in json.load(open(H / 'gn_6.json'))['features']:
    nm, (lo, la) = f['attributes']['gaz_name'], f['geometry']['points'][0][:2]
    if nm not in ('Black River', 'La Crosse River', 'Root River', 'Trempealeau River'): continue
    i, d = proj(la, lo)
    if 0 < i < N - 1 and d < 1500 and not any(abs(m['i'] - i) < 10 for m in marks): drop[i] = max(drop[i], 1.2); marks.append(dict(name=nm + ' mouth', i=i, lat=la, lon=lo, off=round(d), kind='rapid'))
# bluffs + towns (GNIS Landforms / Populated Places) within 5 km, as labels
for L, kind, lim in [(5, 'place', 5000), (3, 'place', 2500)]:
    for f in json.load(open(H / f'gn_{L}.json'))['features']:
        nm, (lo, la) = f['attributes']['gaz_name'], f['geometry']['points'][0][:2]
        if L == 5 and not any(w in nm for w in ('Bluff', 'Mountain', 'Knob')): continue
        i, d = proj(la, lo)
        if 0 < i < N - 1 and d < lim and not any(m['name'] == nm for m in marks): marks.append(dict(name=nm, i=i, lat=la, lon=lo, off=round(d), kind=kind))
marks.sort(key=lambda m: m['i'])
# terrain grid for 3D: bbox of the strip, 3 km mask
xmin, ymin = P.min(0) - 5000; xmax, ymax = P.max(0) + 5000
GU = 1000; GV = int(round(GU * (ymax - ymin) / (xmax - xmin)))
gx, gy = np.meshgrid(np.linspace(xmin, xmax, GU), np.linspace(ymin, ymax, GV))
GE = elev(gx, gy)
from scipy.spatial import cKDTree
dist, nidx = cKDTree(P).query(np.stack([gx.ravel(), gy.ravel()], 1)); dist = dist.reshape(GV, GU)
ridx = nidx[(dist <= 4700).ravel()].astype('<u2')   # nearest river point for each unmasked cell, row-major (3D wall side / glow)
q = np.clip(np.round((GE - 150) * 20), 0, 65534).astype('<u2'); q[dist > 4700] = 65535   # 65535 = masked
r1 = lambda a: [round(float(v), 1) for v in a]
out = dict(name='Mississippi River · Trempealeau → La Crosse (Driftless bluffs)', short='Mississippi River', accName='Locks & dams', source='USGS NHD flowline (hydro.nationalmap.gov), GNIS names (carto.nationalmap.gov), AWS terrarium z13 terrain, USACE lock & dam positions',
    N=N, ds=float(ss[1] - ss[0]), s0=S0, lat0=LAT0, lon0=LON0,
    x=r1(P[:, 0] - (xmin + xmax) / 2), y=r1(P[:, 1] - (ymin + ymax) / 2), river=r1(riv), river_raw=r1(riv_raw), drop=r1(drop), width300=r1(width300),
    L={k: r1(v) for k, v in Ls.items()}, R={k: r1(v) for k, v in Rs.items()}, strata=dict(bands=[[lo, hi] for lo, hi in BANDS], names=['floodplain to bluff toe (0-300 m)', '300-650 m (none here)', '650-1000 m (none here)', '1000 m+ (none here)'], approx=True, L=[{k: r1(v) for k, v in d.items()} for d in BL], R=[{k: r1(v) for k, v in d.items()} for d in BR]), marks=marks,
    grid=dict(GU=GU, GV=GV, w=float(xmax - xmin), h=float(ymax - ymin), off=150, sc=20, data=base64.b64encode(q.tobytes()).decode(), ridx=base64.b64encode(ridx.tobytes()).decode()),
    start=dict(zip(['lon', 'lat'], toll(*P[0]))), end=dict(zip(['lon', 'lat'], toll(*P[-1]))))
json.dump(out, open(H / 'river_ms.json', 'w'))
print('len km', (S1 - S0) / 1000, 'grid', GU, GV, 'river', riv[0], riv[-1], 'start', out['start'], 'end', out['end'])
for side_, D in (('L', Ls), ('R', Rs)): print(side_, {k: (round(float(np.median(v))), round(float(v.max()))) for k, v in D.items()})
print('drops >4m/250m at', [(int(i), round(float(drop[i]), 1)) for i in np.where(drop > 4)[0]][:60])
print([(m['name'], m['i'], m['off']) for m in marks])
print('corr h2k L/R', np.corrcoef(Ls['h2k'], Rs['h2k'])[0, 1])
