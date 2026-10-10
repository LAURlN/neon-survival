import sys,csv,json,io,os,collections
sys.stdout.reconfigure(encoding="utf-8")
src,out=sys.argv[1],sys.argv[2]
os.makedirs(out,exist_ok=True)
def load(n):
    t=open(f'{src}/{n}.txt',encoding='utf-8-sig').read()
    return list(csv.reader(io.StringIO(t)))
for n in ['Dictionary_UnitStat','Dictionary_AllStat']+['eng_Dictionary_'+x for x in ['Name','Explain','Class','Ability','MagicCom','Synergy']]:
    rows=load(n)
    rows=[[c.strip() for c in r] for r in rows if any(c.strip() for c in r)]
    json.dump(rows,open(f'{out}/{n}.json','w',encoding='utf-8'),ensure_ascii=False)
    print(n,len(rows),'rows',len(rows[0]),'cols')
ab=json.load(open(f'{out}/eng_Dictionary_Ability.json',encoding='utf-8'))
h=ab[0]
by=collections.defaultdict(list)
for r in ab[2:]:
    if r[1] in('`',''): continue
    by[r[2]].append(f'{r[0]}:{r[1]}(req{r[3]},max{r[8]})')
for k,v in by.items(): print('\n##',k,len(v)); print(' | '.join(v))
