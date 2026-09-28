"""Rebuild pinned official snapshots; run manually, never during CI."""
import csv, io, json, hashlib, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def source(url, local):
    data=Path(local).read_bytes() if Path(local).exists() else urllib.request.urlopen(url).read()
    return data.decode('utf-8-sig'), {'url':url,'sha256':hashlib.sha256(data).hexdigest()}
base='https://www.ssa.gov/oact/Downloadables/CY/'
meta=[]; q=[]
for sex in ['M','F']:
    name=f'DeathProbsE_{sex}_Alt2_TR2026.csv'
    raw,m=source(base+name,'/tmp/'+name); meta.append(m)
    q.append({int(r[0]):list(map(float,r[1:])) for r in list(csv.reader(io.StringIO(raw)))[2:]})
name='SSPopJul_Alt2_TR2026.csv'
raw,m=source(base+name,'/tmp/'+name);meta.append(m)
pop={}
for r in csv.DictReader(io.StringIO(raw)):
    y,a=int(r['Year']),int(r['Age'])
    if 2026<=y<=2100: pop.setdefault(y,[0]*101)[a]=int(r['Total'])
result={'sources':meta,'startYear':2026,'endYear':2100,'population':[pop[y] for y in range(2026,2101)],'maleQ':[q[0][y] for y in range(2026,2101)],'femaleQ':[q[1][y] for y in range(2026,2101)]}
(ROOT/'src/data/ssaProjections.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
url='https://raw.githubusercontent.com/US-CBO/cbo-data/main/data/budget/long_term_budget/annual_fy_2026-02.csv'
raw,m=source(url,'/tmp/cbo-budget.csv'); rows={}
for r in csv.DictReader(io.StringIO(raw)):
    y=int(r['date'][2:]); rows.setdefault(y,{'year':y})[r['variable']]=float(r['value'])
(ROOT/'src/data/cboOfficial.json').write_text(json.dumps({'source':m,'vintage':'February 2026','rows':list(rows.values())},separators=(',',':'))+'\n')
