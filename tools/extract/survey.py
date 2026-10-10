import sys,os,collections,json
import UnityPy
src,out=sys.argv[1],sys.argv[2]
os.makedirs(out+'/text',exist_ok=True)
env=UnityPy.load(src)
cnt=collections.Counter(); names=collections.defaultdict(list)
for o in env.objects:
    t=o.type.name; cnt[t]+=1
    if t in('TextAsset','Texture2D','Sprite','AudioClip','Font','MonoScript','AnimationClip','GameObject'):
        try:
            d=o.read(); n=getattr(d,'m_Name',None) or getattr(d,'name','?')
        except Exception as e: n='ERR '+str(e)[:40]
        names[t].append(n)
        if t=='TextAsset':
            s=d.m_Script
            b=s.encode('utf-8','surrogateescape') if isinstance(s,str) else bytes(s)
            open(f'{out}/text/{n}.txt','wb').write(b)
print(cnt.most_common())
json.dump({k:sorted(v) for k,v in names.items()},open(out+'/names.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
for k,v in names.items(): print(k,len(v))
