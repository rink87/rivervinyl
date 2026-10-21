"""River mode data: USGS NHD flowline of the Colorado River (Hance -> Serpentine), resampled to 1000 points,
perpendicular cross-sections (+-4 km, 20 m step) from AWS terrarium z13 tiles, derived wall metrics,
GNIS rapids/landmarks projected onto the river, and a masked terrain grid for the 3D view. -> river.json"""
import json, math, io, base64, collections, urllib.request
import numpy as np
from PIL import Image
H = __import__('pathlib').Path(__file__).resolve().parent
LAT0, LON0, R = 36.1, -112.0, 6371008.8
KX = math.cos(math.radians(LAT0)) * R * math.pi / 180; KY = R * math.pi / 180
toxy = lambda lo, la: ((lo - LON0) * KX, (la - LAT0) * KY)
toll = lambda x, y: (LON0 + x / KX, LAT0 + y / KY)
S0, S1, N, HALF, STEP, Z = 10800.0, 58800.0, 1000, 4000.0, 20.0, 13
# ---- centerline: chain NHD segments head -> mouth
segs = [f['geometry']['coordinates'] for f in json.load(open(H / 'nhd.json'))['features']]
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
width300 = Ls['dist300'] + Rs['dist300']
# rapids from the data: drop over the next 250 m of river
dn = int(250 / (ss[1] - ss[0])); drop = np.concatenate([riv[:-dn] - riv[dn:], np.zeros(dn)])
# landmarks (GNIS), projected onto the river
def proj(la, lo):
    x, y = toxy(lo, la); d = np.hypot(P[:, 0] - x, P[:, 1] - y); i = int(d.argmin()); return i, float(d[i])
marks = []
for f in json.load(open(H / 'gn.json'))['features']:
    nm, la, lo = f['attributes']['gaz_name'], f['geometry']['y'], f['geometry']['x']; i, d = proj(la, lo)
    if 0 < i < N - 1 and d < 150: marks.append(dict(name=nm.replace(' Rapids', ' Rapid'), i=i, lat=la, lon=lo, off=round(d), kind='rapid'))
i, d = proj(36.10605, -112.09469); marks.append(dict(name='Phantom Ranch', i=i, lat=36.10605, lon=-112.09469, off=round(d), kind='place', note='~0.75 km up Bright Angel Creek'))
marks.sort(key=lambda m: m['i'])
# terrain grid for 3D: bbox of the strip, 3 km mask
xmin, ymin = P.min(0) - 3500; xmax, ymax = P.max(0) + 3500
GU = 1000; GV = int(round(GU * (ymax - ymin) / (xmax - xmin)))
gx, gy = np.meshgrid(np.linspace(xmin, xmax, GU), np.linspace(ymin, ymax, GV))
GE = elev(gx, gy)
from scipy.spatial import cKDTree
dist, nidx = cKDTree(P).query(np.stack([gx.ravel(), gy.ravel()], 1)); dist = dist.reshape(GV, GU)
ridx = nidx[(dist <= 3200).ravel()].astype('<u2')   # nearest river point for each unmasked cell, row-major (3D wall side / glow)
q = np.clip(np.round((GE - 500) * 20), 0, 65534).astype('<u2'); q[dist > 3200] = 65535   # 65535 = masked
r1 = lambda a: [round(float(v), 1) for v in a]
out = dict(name='Colorado River · Hance Rapid → Serpentine Rapid', source='USGS NHD flowline (hydro.nationalmap.gov), GNIS names (carto.nationalmap.gov), AWS terrarium z13 terrain',
    N=N, ds=float(ss[1] - ss[0]), s0=S0, lat0=LAT0, lon0=LON0,
    x=r1(P[:, 0] - (xmin + xmax) / 2), y=r1(P[:, 1] - (ymin + ymax) / 2), river=r1(riv), river_raw=r1(riv_raw), drop=r1(drop), width300=r1(width300),
    L={k: r1(v) for k, v in Ls.items()}, R={k: r1(v) for k, v in Rs.items()}, marks=marks,
    grid=dict(GU=GU, GV=GV, w=float(xmax - xmin), h=float(ymax - ymin), off=500, sc=20, data=base64.b64encode(q.tobytes()).decode(), ridx=base64.b64encode(ridx.tobytes()).decode()),
    start=dict(zip(['lon', 'lat'], toll(*P[0]))), end=dict(zip(['lon', 'lat'], toll(*P[-1]))))
json.dump(out, open(H / 'river.json', 'w'))
print('len km', (S1 - S0) / 1000, 'grid', GU, GV, 'river', riv[0], riv[-1], 'start', out['start'], 'end', out['end'])
for side_, D in (('L', Ls), ('R', Rs)): print(side_, {k: (round(float(np.median(v))), round(float(v.max()))) for k, v in D.items()})
print('drops >4m/250m at', [(int(i), round(float(drop[i]), 1)) for i in np.where(drop > 4)[0]][:60])
print([(m['name'], m['i'], m['off']) for m in marks])
print('corr h2k L/R', np.corrcoef(Ls['h2k'], Rs['h2k'])[0, 1])
