#!/usr/bin/env python3
# GestiuneEE v7.58 — generează strazi/<JUD>.json din OpenStreetMap (Geofabrik romania-latest.osm.pbf).
# Folosire:  python3 strazi_osm.py romania-latest.osm.pbf localitati.json strazi/ [AAAA-LL-ZZ = data hărții]
# Nevoie de:  pip install osmium shapely     (~3–4 minute pentru toată țara)
# Fiecare fișier: {"v": "OSM <data>", "u": {"<index UAT din localitati.json>": [[stradă, index sat|-1, lon, lat], ...]}}
import osmium, json, sys, os, re, time, unicodedata, math, datetime
from shapely import wkt
from shapely.strtree import STRtree
from shapely.geometry import Point
PBF, LOC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
COD = {'Alba':'AB','Arad':'AR','Argeș':'AG','Bacău':'BC','Bihor':'BH','Bistrița-Năsăud':'BN','Botoșani':'BT','Brașov':'BV','Brăila':'BR','București':'B','Buzău':'BZ','Caraș-Severin':'CS','Călărași':'CL','Cluj':'CJ','Constanța':'CT','Covasna':'CV','Dâmbovița':'DB','Dolj':'DJ','Galați':'GL','Giurgiu':'GR','Gorj':'GJ','Harghita':'HR','Hunedoara':'HD','Ialomița':'IL','Iași':'IS','Ilfov':'IF','Maramureș':'MM','Mehedinți':'MH','Mureș':'MS','Neamț':'NT','Olt':'OT','Prahova':'PH','Satu Mare':'SM','Sălaj':'SJ','Sibiu':'SB','Suceava':'SV','Teleorman':'TR','Timiș':'TM','Tulcea':'TL','Vaslui':'VS','Vâlcea':'VL','Vrancea':'VN'}
HW = {'motorway','trunk','primary','secondary','tertiary','unclassified','residential','living_street','service','track','pedestrian','road'}
PL = {'city','town','village','hamlet','suburb','quarter','neighbourhood','isolated_dwelling','locality'}
def N(s):
    s = unicodedata.normalize('NFD', str(s)); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]', ' ', s.upper())).strip()
def MARE(s):  # ca în aplicație: fără diacritice, majuscule, păstrează punctuația
    s = unicodedata.normalize('NFD', str(s)); return ''.join(c for c in s if unicodedata.category(c) != 'Mn').upper().strip()
PRE = [('STRADELA','STRADELA'),('STRADA','STR'),('BULEVARDUL','BLV'),('BULEVARD','BLV'),('CALEA','CALEA'),('ALEEA','ALEEA'),('SOSEAUA','SOS'),
       ('PIATA','PIATA'),('INTRAREA','INTRAREA'),('SPLAIUL','SPLAIUL'),('DRUMUL','DRUMUL'),('FUNDATURA','FUNDATURA'),('PASAJUL','PASAJUL'),
       ('PRELUNGIREA','PRELUNGIREA'),('UL','STR'),('STR.','STR'),('STR','STR')]
def scrie(nume):
    m = re.sub(r'\s+', ' ', MARE(nume)).strip()
    for p, a in PRE:
        if m == p or m.startswith(p + ' '): return (a + m[len(p):]).strip()
    return m
t0 = time.time()
# 1) extragere (o singură trecere prin fișier)
ways, places, adm = [], [], []
wf = osmium.geom.WKTFactory()
fp = (osmium.FileProcessor(PBF).with_locations('flex_mem')
      .with_areas(osmium.filter.TagFilter(('admin_level','4'), ('admin_level','8'))))
for o in fp:
    if o.is_node():
        if o.tags.get('place') in PL and o.tags.get('name'):
            places.append((o.tags['name'], o.location.lon, o.location.lat))
    elif o.is_way():
        n = o.tags.get('name')
        if n and o.tags.get('highway') in HW:
            try: nd = o.nodes[len(o.nodes)//2]; ways.append((n, nd.lon, nd.lat, o.tags.get('highway')))
            except Exception: pass
    elif o.is_area():
        t = o.tags
        if t.get('boundary') == 'administrative' and t.get('admin_level') in ('4','8'):
            try: adm.append((t.get('admin_level'), t.get('name',''), wkt.loads(wf.create_multipolygon(o))))
            except Exception: pass
print('extras:', len(ways), 'străzi,', len(places), 'localități,', len(adm), 'granițe,', round(time.time()-t0), 's', flush=True)
# 2) potrivire cu SIRUTA (localitati.json din aplicație)
L = json.load(open(LOC, encoding='utf8'))
FARA = lambda s: re.sub(r'^(MUNICIPIUL|ORASUL|ORAS|COMUNA)\s+', '', N(s))
uidx = {}
for i, u in enumerate(L['u']): uidx.setdefault((u[2], FARA(u[0])), i)
satidx = {}
for i, l in enumerate(L['l']):
    if len(l) < 3 or l[2] != 'X': satidx.setdefault((l[1], FARA(l[0])), i)
J = [(COD[n], g) for lv, n, g in adm if lv == '4' and n in COD]
tj = STRtree([g for _, g in J])
def judet(p):
    for i in tj.query(p):
        if J[i][1].contains(p): return J[i][0]
U = []
for lv, n, g in adm:
    if lv != '8' or not n: continue
    j = judet(g.representative_point()); i = uidx.get((j, FARA(n))) if j else None
    if i is not None: U.append((i, g))
tu = STRtree([g for _, g in U])
BUC = uidx.get(('B', 'BUCURESTI'))
def uat(p):
    for k in tu.query(p):
        if U[k][1].contains(p): return U[k][0]
    if BUC is not None and judet(p) == 'B': return BUC
    return None
# localitățile OSM recunoscute în SIRUTA (pentru „satul” fiecărei străzi)
PU = {}
for nume, x, y in places:
    p = Point(x, y); u = uat(p)
    if u is None: continue
    s = satidx.get((u, FARA(nume)))
    if s is not None: PU.setdefault(u, []).append((s, x, y))
R = {}
BUN = ('STR ','ALEEA ','INTRAREA ','FUNDATURA ','CALEA ','BLV ','SOS ','DRUMUL ','ULITA ','STRADELA ','PIATA ','SPLAIUL ','PRELUNGIREA ')
for nume, x, y, hw in ways:
    sc = scrie(nume)
    if len(sc) < 3: continue
    if hw in ('service', 'track') and not sc.startswith(BUN): continue   # drumuri de acces / parcări / forestiere fără nume de stradă
    p = Point(x, y); u = uat(p)
    if u is None: continue
    d = R.setdefault(u, {})
    if sc in d: continue
    s, best = -1, 1e9
    for si, px, py in PU.get(u, []):
        dd = (px - x) ** 2 + ((py - y) * 1.4) ** 2
        if dd < best: best, s = dd, si
    if best > 0.00025: s = -1   # mai departe de ~1,7 km de orice sat cunoscut → doar la nivel de comună
    d[sc] = [sc, s, round(x, 5), round(y, 5)]
# 3) scriere pe județ
os.makedirs(OUT, exist_ok=True)
v = 'OSM ' + (sys.argv[4] if len(sys.argv) > 4 else datetime.date.fromtimestamp(os.path.getmtime(PBF)).isoformat())
pj = {}
for u, d in R.items():
    j = L['u'][u][2]; pj.setdefault(j, {})[str(u)] = sorted(d.values(), key=lambda r: r[0])
tot = 0
for j, uu in pj.items():
    with open(os.path.join(OUT, j + '.json'), 'w', encoding='utf8') as f:
        json.dump({'v': v, 'u': uu}, f, ensure_ascii=False, separators=(',', ':'))
    tot += sum(len(x) for x in uu.values())
print('scris:', len(pj), 'județe,', tot, 'străzi,', sum(len(x) for x in pj.values()), 'UAT,', round(time.time()-t0), 's', flush=True)
