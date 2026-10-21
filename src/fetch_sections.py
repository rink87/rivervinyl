"""Fetch USGS EPQS profiles (300 pts) and an AWS terrarium z13 DEM grid (400x200, rotated along the line) per section.
Output: sections.json. Grid convention matches the original page: u along the line (-MARG..L+MARG), v across (+-HALFV),
stored as uint16 (elev-off)*sc, base64 little-endian."""
import json, math, io, base64, sys, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image
SECTIONS = [
 dict(id='hermit', name='Hermits Rest → Point Sublime', s=('Hermits Rest',36.0622222,-112.2111111), n=('Point Sublime',36.1983726,-112.2506408),
      src='Hermits Rest: Wikipedia/GNIS; Point Sublime: OpenStreetMap viewpoint node'),
 dict(id='mather', name='Mather Point → Bright Angel Point', s=('Mather Point',36.0616497,-112.1079463), n=('Bright Angel Point',36.1935055,-112.0486611),
      src='original section (verified earlier)'),
 dict(id='desert', name='Desert View → Cape Royal', s=('Desert View Watchtower',36.0440087,-111.8262067), n=('Cape Royal',36.1172234,-111.9487914),
      src='both OpenStreetMap viewpoint nodes (Wikipedia agrees for Desert View to ~30 m)'),
]
NP, NU, NV, MARG, HALFV, OFF, SC, Z = 300, 400, 200, 1500.0, 4000.0, 600.0, 20.0, 13
R = 6371008.8
def enu(lat0, lon0):
    kx = math.cos(math.radians(lat0)) * R * math.pi / 180; ky = R * math.pi / 180
    return (lambda la, lo: ((lo - lon0) * kx, (la - lat0) * ky)), (lambda x, y: (lat0 + y / ky, lon0 + x / kx))
def epqs(la, lo):
    u = f'https://epqs.nationalmap.gov/v1/json?x={lo:.7f}&y={la:.7f}&units=Meters&wkid=4326'
    for t in range(6):
        try:
            v = float(json.load(urllib.request.urlopen(u, timeout=30))['value'])
            if v > -1000: return v
        except Exception: pass
    raise RuntimeError(u)
tiles = {}
def tile(x, y):
    if (x, y) not in tiles:
        b = urllib.request.urlopen(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png', timeout=30).read()
        a = np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(np.float64)
        tiles[(x, y)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return tiles[(x, y)]
def terr(la, lo):  # bilinear sample
    n = 2 ** Z; fx = (lo + 180) / 360 * n * 256
    fy = (1 - math.asinh(math.tan(math.radians(la))) / math.pi) / 2 * n * 256
    x0, y0 = int(fx), int(fy); ax, ay = fx - x0, fy - y0
    g = lambda X, Y: tile(X // 256, Y // 256)[Y % 256, X % 256]
    return (g(x0, y0) * (1 - ax) * (1 - ay) + g(x0 + 1, y0) * ax * (1 - ay) + g(x0, y0 + 1) * (1 - ax) * ay + g(x0 + 1, y0 + 1) * ax * ay)
def build(S, sign=1):
    _, la1, lo1 = S['s']; _, la2, lo2 = S['n']
    f, inv = enu(la1, lo1); X2, Y2 = f(la2, lo2); L = math.hypot(X2, Y2); ux, uy = X2 / L, Y2 / L; vx, vy = -uy * sign, ux * sign
    pts = [inv(ux * L * i / (NP - 1), uy * L * i / (NP - 1)) for i in range(NP)]
    with cf.ThreadPoolExecutor(24) as ex: e = list(ex.map(lambda p: epqs(*p), pts))
    G = np.zeros((NV, NU))
    for j in range(NV):
        v = -HALFV + j * 2 * HALFV / (NV - 1)
        for i in range(NU):
            u = -MARG + i * (L + 2 * MARG) / (NU - 1)
            G[j, i] = terr(*inv(ux * u + vx * v, uy * u + vy * v))
    q = np.clip(np.round((G - OFF) * SC), 0, 65535).astype('<u2')
    return dict(id=S['id'], name=S['name'], sName=S['s'][0], nName=S['n'][0], s=S['s'][1:], n=S['n'][1:], src=S['src'],
                NU=NU, NV=NV, L=L, MARG=MARG, HALFV=HALFV, off=OFF, sc=SC, emin=float(G.min()), emax=float(G.max()),
                terrain=base64.b64encode(q.tobytes()).decode(), d=[round(L * i / (NP - 1), 1) for i in range(NP)], e=[round(x, 2) for x in e]), G
if __name__ == '__main__':
    out = []
    for S in SECTIONS:
        r, G = build(S); out.append(r); print(S['id'], round(r['L']), min(r['e']), max(r['e']), r['emin'], r['emax'], flush=True)
    json.dump(out, open('sections.json', 'w'))
