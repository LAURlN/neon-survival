import sys,re
src,out=sys.argv[1],sys.argv[2]
txt=open(src,encoding='utf-8',errors='replace').read()
# header lists images: // Image 0: mscorlib.dll - 0
imgs=re.findall(r'// Image (\d+): (\S+) - (\d+)',txt)
print(len(imgs),'images')
for i,n,s in imgs:
    if 'Assembly-CSharp' in n: print(i,n,s)
blocks=re.split(r'(?m)^(?=// Namespace: )',txt)
keep=[b for b in blocks if re.search(r'// Dll : Assembly-CSharp\.dll',b)] if '// Dll :' in txt else None
if keep is None:
    # fall back to TypeDefIndex range
    rng={n:int(s) for i,n,s in imgs}
    names=sorted(rng.items(),key=lambda x:x[1])
    lo=rng['Assembly-CSharp.dll']; hi=min([s for n,s in names if s>lo] or [10**9])
    keep=[]
    for b in blocks:
        m=re.search(r'TypeDefIndex: (\d+)',b)
        if m and lo<=int(m.group(1))<hi: keep.append(b)
open(out,'w',encoding='utf-8').write(''.join(keep))
print(len(keep),'types kept', sum(len(b) for b in keep),'chars')
