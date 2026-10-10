import sys,os,json
sys.stdout.reconfigure(encoding="utf-8")
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
src,dll,out=sys.argv[1],sys.argv[2],sys.argv[3]
want=set(sys.argv[4:])
env=UnityPy.load(src)
gen=TypeTreeGenerator("2022.3.62f3"); gen.load_local_dll_folder(dll)
os.makedirs(out,exist_ok=True)
seen={}; err={}
scripts={}
for o in env.objects:
    if o.type.name=='MonoScript':
        scripts[(os.path.basename(o.assets_file.name).lower(),o.path_id)]=o.read().m_ClassName
for o in env.objects:
    if o.type.name!='MonoBehaviour': continue
    try:
        d=o.read(check_read=False); sp=d.m_Script
        fid,pid=sp.m_FileID,sp.m_PathID
        fn=os.path.basename(o.assets_file.name).lower() if fid==0 else os.path.basename(o.assets_file.externals[fid-1].path).lower()
        name=scripts.get((fn,pid))
    except Exception as e:
        err[str(e)[:60]]=err.get(str(e)[:60],0)+1; continue
    if name not in want: continue
    try: raw=o.read_typetree(gen.get_nodes_up('Assembly-CSharp',name))
    except Exception as e:
        err[name+': '+repr(e)[:200]]=1; continue
    seen[name]=seen.get(name,0)+1
    json.dump(raw,open(f'{out}/{name}_{seen[name]}.json','w',encoding='utf-8'),ensure_ascii=False,indent=0,default=str)
print(seen); print(list(err.items())[:5])
