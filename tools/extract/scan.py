# Scan all game methods for constant stores into C_Battle_AllyUnit instance fields (UnitBase_*)
import sys,re,struct,json,bisect,collections
from capstone import *
from capstone.arm import *
sys.stdout.reconfigure(encoding="utf-8")
so,game,full,outp=sys.argv[1:5]
g=open(game,encoding='utf-8',errors='replace').read()
allr=sorted(set(int(x,16) for x in re.findall(r'RVA: (0x[0-9A-F]+)',open(full,encoding='utf-8',errors='replace').read()) if int(x,16)>0))
m=re.search(r'\npublic class C_Battle_AllyUnit [^\n]*\n\{(.*?)\n\}\n',g,re.S)
inst={}
for f in re.finditer(r'(?:public|private) (?!static)(\S+) (\w+); // (0x[0-9A-F]+)',m.group(1)):
    if f.group(2).startswith('UnitBase_'): inst[int(f.group(3),16)]=(f.group(2),f.group(1))
print(len(inst),'UnitBase fields', min(inst), max(inst))
# methods with class names
meths=[]
cls=None
for line in g.split('\n'):
    c=re.match(r'^(?:public|internal|private)[^\n]*?(?:class|struct) (\S+)',line)
    if c: cls=c.group(1)
    r=re.search(r'RVA: (0x[0-9A-F]+)',line)
    if r: last=int(r.group(1),16)
    mm=re.match(r'^\s+(?:public|private|internal|protected)[^(]* (\S+)\(.*\) \{ \}',line)
    if mm and last>0: meths.append((cls,mm.group(1),last)); last=0
data=open(so,'rb').read()
md=Cs(CS_ARCH_ARM,CS_MODE_ARM); md.detail=True
res=collections.defaultdict(list)
def f32(i): return struct.unpack('<f',struct.pack('<I',i&0xffffffff))[0]
for cls,name,rva in meths:
    end=allr[bisect.bisect_right(allr,rva)] if bisect.bisect_right(allr,rva)<len(allr) else rva+0x100
    n=min(end-rva,0x20000)
    reg={}
    for ins in md.disasm(data[rva:rva+n],rva):
        mn=ins.mnemonic; ops=ins.operands
        try:
            if mn.startswith('vldr') and ops[1].mem.base==ARM_REG_PC:
                a=((ins.address+8)&~3)+ops[1].mem.disp; r=ins.reg_name(ops[0].reg)
                reg[r]=('f',struct.unpack('<d',data[a:a+8])[0] if r[0]=='d' else struct.unpack('<f',data[a:a+4])[0])
            elif mn.startswith('vmov') and len(ops)==2 and ops[1].type==ARM_OP_FP:
                reg[ins.reg_name(ops[0].reg)]=('f',ops[1].fp)
            elif mn in('mov','movw') and ops[1].type==ARM_OP_IMM:
                reg[ins.reg_name(ops[0].reg)]=('i',ops[1].imm&0xffffffff)
            elif mn=='movt':
                r=ins.reg_name(ops[0].reg); lo=reg[r][1] if r in reg and reg[r][0]=='i' else 0
                reg[r]=('i',(lo&0xffff)|(ops[1].imm<<16))
            elif mn=='ldr' and ops[1].type==ARM_OP_MEM and ops[1].mem.base==ARM_REG_PC:
                a=ins.address+8+ops[1].mem.disp; reg[ins.reg_name(ops[0].reg)]=('i',struct.unpack('<I',data[a:a+4])[0])
            elif mn in('str','vstr') and ops[1].type==ARM_OP_MEM:
                off=ops[1].mem.disp; v=reg.get(ins.reg_name(ops[0].reg))
                if off in inst and v is not None and ops[1].mem.base not in(ARM_REG_SP,ARM_REG_PC):
                    fn,ft=inst[off]
                    val=v[1] if v[0]=='f' else (f32(v[1]) if ft=='float' else v[1])
                    res[f'{cls}.{name}'].append((fn,round(val,4)))
            elif mn in('bl','blx'):
                for r in('r0','r1','r2','r3','r12','lr','s0','s1','s2','s3','d0','d1'): reg.pop(r,None)
            elif ops and ops[0].type==ARM_OP_REG and not mn.startswith(('cmp','tst','b','push','vcmp','vpush','str','vstr')):
                reg.pop(ins.reg_name(ops[0].reg),None)
        except Exception: pass
json.dump(res,open(outp,'w'),indent=0)
for k,v in sorted(res.items(),key=lambda x:-len(x[1]))[:25]: print(len(v),k)
