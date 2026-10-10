import sys,json,re,collections
sys.stdout.reconfigure(encoding="utf-8")
J=lambda n: json.load(open(f'out/json/{n}.json',encoding='utf-8'))
ex=collections.defaultdict(list)
def scan(t,namecol=1):
    h=t[0]
    dcols=[i for i,k in enumerate(h) if k.startswith('효과 설명줄') and '개수' not in k]
    ecols=[i for i,k in enumerate(h) if re.match(r'효과ID_\d+$',k)]
    for r in t[2:]:
        if len(r)<len(h) or r[namecol] in('`','') or not r[0].isdigit(): continue
        descs=[r[i] for i in dcols if r[i] not in('`','') and '《' not in r[i]]
        # split on @
        dl=[x.strip() for d in descs for x in d.split('@')]
        effs=[(int(float(r[i])),r[i+1]) for i in ecols if r[i] not in('1','0','') and not r[i].startswith('-')]
        num=[d for d in dl if re.search(r'\d',d) and re.match(r'(Increase|Decrease|Amplify|Reduce)',d)]
        if len(num)==len(effs):
            for (e,v),d in zip(effs,num): ex[e].append((v,d,r[1]))
        else:
            for e,v in effs: ex[e].append((v,'?? '+' / '.join(dl)[:90],r[1]))
for n in ['Ability','Class','MagicCom']: scan(J('eng_Dictionary_'+n))
out={}
for e in sorted(ex):
    good=[x for x in ex[e] if not x[1].startswith('??')] or ex[e]
    c=collections.Counter(re.sub(r'[\d.]+','N',x[1]) for x in good)
    v,d,nm=good[0]
    out[e]={'n':len(ex[e]),'ex':f'{v} :: {d} [{nm}]','top':c.most_common(1)[0][0]}
json.dump(out,open('out/effects.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
lo,hi=int(sys.argv[1]),int(sys.argv[2])
for e,o in out.items():
    if lo<=e<=hi: print(e,'|',o['n'],'|',o['ex'][:120])
