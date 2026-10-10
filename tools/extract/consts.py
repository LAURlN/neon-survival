# Recover "static field = constant" assignments from an ARM32 il2cpp method.
import sys,re,struct,json
from capstone import *
from capstone.arm import *
sys.stdout.reconfigure(encoding="utf-8")
so,dump,cls,meth=sys.argv[1:5]
maxlen=int(sys.argv[5]) if len(sys.argv)>5 else 0x4000
txt=open(dump,encoding='utf-8',errors='replace').read()
def cbody(c):
    m=re.search(r'\n(?:public|internal|private)[^\n]*class '+re.escape(c)+r' [^\n]*\n\{(.*?)\n\}\n',txt,re.S); return m.group(1)
# static field offsets of Z_Database
stat={}
for m in re.finditer(r'static (\S+) (\w+); // (0x[0-9A-F]+)',cbody('Z_Database')): stat[int(m.group(3),16)]=(m.group(2),m.group(1))
body=cbody(cls)
inst={}
cst={}
for m in re.finditer(r'static (\S+) (\w+); // (0x[0-9A-F]+)',body): cst[int(m.group(3),16)]=(m.group(2),m.group(1))
for m in re.finditer(r'(?:public|private|protected) (?!static)(\S+) (\w+); // (0x[0-9A-F]+)',body): inst[int(m.group(3),16)]=(m.group(2),m.group(1))
m=re.search(r'RVA: (0x[0-9A-F]+)[^\n]*\n[^\n]*\b'+re.escape(meth)+r'\(',body)
rva=int(m.group(1),16)
# next method rva for length
allr=sorted(int(x,16) for x in re.findall(r'RVA: (0x[0-9A-F]+)',txt) if int(x,16)>0)
import bisect
end=allr[bisect.bisect_right(allr,rva)]
n=min(end-rva,maxlen)
data=open(so,'rb').read()
# RVA==file offset per dump (Offset == RVA)
code=data[rva:rva+n]
md=Cs(CS_ARCH_ARM,CS_MODE_ARM); md.detail=True
reg={}  # reg name -> ('f',val)|('i',val)
out=[]
def lit(addr,sz=4): return data[addr:addr+sz]
for ins in md.disasm(code,rva):
    mn=ins.mnemonic; ops=ins.operands
    try:
        if mn.startswith('vldr') and ops[1].type==ARM_OP_MEM and ops[1].mem.base==ARM_REG_PC:
            a=(ins.address+8)&~3; a+=ops[1].mem.disp
            r=ins.reg_name(ops[0].reg)
            reg[r]=('f',struct.unpack('<d',lit(a,8))[0] if r.startswith('d') else struct.unpack('<f',lit(a))[0])
        elif mn.startswith('vmov') and len(ops)==2 and ops[1].type==ARM_OP_FP:
            reg[ins.reg_name(ops[0].reg)]=('f',ops[1].fp)
        elif mn.startswith('vmov') and len(ops)==2 and ops[1].type==ARM_OP_REG and ops[0].type==ARM_OP_REG:
            s=ins.reg_name(ops[1].reg); d=ins.reg_name(ops[0].reg)
            if s in reg:
                v=reg[s]
                if d.startswith('s') and v[0]=='i': v=('f',struct.unpack('<f',struct.pack('<I',v[1]&0xffffffff))[0])
                reg[d]=v
            else: reg.pop(d,None)
        elif mn in('mov','movw') and ops[1].type==ARM_OP_IMM:
            reg[ins.reg_name(ops[0].reg)]=('i',ops[1].imm&0xffffffff)
        elif mn=='movt' and ops[1].type==ARM_OP_IMM:
            r=ins.reg_name(ops[0].reg); lo=reg.get(r,('i',0))[1] if reg.get(r,('i',0))[0]=='i' else 0
            reg[r]=('i',(lo&0xffff)|(ops[1].imm<<16))
        elif mn=='mvn' and ops[1].type==ARM_OP_IMM:
            reg[ins.reg_name(ops[0].reg)]=('i',(~ops[1].imm)&0xffffffff)
        elif mn=='ldr' and ops[1].type==ARM_OP_MEM and ops[1].mem.base==ARM_REG_PC:
            a=ins.address+8+ops[1].mem.disp
            reg[ins.reg_name(ops[0].reg)]=('i',struct.unpack('<I',lit(a))[0])
        elif mn in('str','vstr','strb') and ops[1].type==ARM_OP_MEM:
            s=ins.reg_name(ops[0].reg); off=ops[1].mem.disp
            v=reg.get(s)
            out.append((ins.address,mn,off,v,ins.reg_name(ops[1].mem.base)))
        elif mn in('bl','blx'):
            for r in ('r0','r1','r2','r3','r12','lr','s0','s1','s2','s3','d0','d1'): reg.pop(r,None)
        elif ops and ops[0].type==ARM_OP_REG and not mn.startswith(('cmp','tst','b','push','vcmp','vpush')):
            reg.pop(ins.reg_name(ops[0].reg),None)
    except Exception as e: pass
print(f'{cls}.{meth} rva={rva:#x} len={n:#x} stores={len(out)}')
res=[]
for a,mn,off,v,base in out:
    if v is None: continue
    name,typ=(inst if base=='r4' else cst if base=='r5' else stat).get(off,(None,None))
    if name: name=base+'.'+name
    if v[0]=='i':
        iv=v[1]; val=iv if iv<0x80000000 else iv-(1<<32)
        if typ in('float','ObscuredFloat') and mn=='str': val=round(struct.unpack('<f',struct.pack('<I',iv))[0],4)
    else: val=round(v[1],4)
    res.append((name or f'+{off:#x}',val,base))
print('; '.join(f'{n}={v}' for n,v,b in res if not n.startswith('+')))
print('UNNAMED:', '; '.join(f'{b}{n}={v}' for n,v,b in res if n.startswith('+'))[:1500])
