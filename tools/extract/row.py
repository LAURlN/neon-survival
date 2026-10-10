import sys,json
sys.stdout.reconfigure(encoding="utf-8")
t=json.load(open(sys.argv[1],encoding='utf-8')); h=t[0]
for i in sys.argv[2:]:
    r=next(x for x in t if x[0]==i)
    print('---',i)
    for k,v in zip(h,r):
        if v not in('`','','0','1','<color=#FFFFFF>') or k in('ID',): print(f'  {k} = {v}')
