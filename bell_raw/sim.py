# Replay capture.log through the polling algorithm used in bell_test.ino (1 ms ticks).
import sys
ev=[]
for ln in open('capture.log'):
    p=ln.split()
    try: t,l=p[1].split(','); ev.append([int(t),int(l)])
    except: pass
T0=ev[0][0]
# Isolated single edge whose partner edge was missed by the logger -> logger glitch, drop it.
ev=[e for i,e in enumerate(ev) if not (0<i<len(ev)-1 and e[0]-ev[i-1][0]>50000
       and ev[i+1][0]-e[0]>50000 and ev[i+1][1]==e[1])]
def level_at(us, j=[0]):
    while j[0]+1<len(ev) and ev[j[0]+1][0]<=us: j[0]+=1
    return ev[j[0]][1] if ev[j[0]][0]<=us else 1

def run(PRESS_MS, RELEASE_MS, HOLD_MS, GAP_MS, verbose, MIN_MS=0):
    level_at.__defaults__[0][0]=0
    closed=False; lowRun=0; highRun=0; downAt=0; holdSaid=False
    burst=[]; lastRel=-10**9; out=[]
    end=(ev[-1][0]-T0)//1000+2000
    for ms in range(0,end):
        low = level_at(T0+ms*1000)==0
        lowRun = lowRun+1 if low else 0
        highRun = 0 if low else highRun+1
        if not closed and lowRun>=PRESS_MS:
            closed=True; downAt=ms-PRESS_MS+1; holdSaid=False
        elif closed and highRun>=RELEASE_MS:
            closed=False; rel=ms-RELEASE_MS+1; dur=rel-downAt
            if dur<MIN_MS: continue
            if dur>=HOLD_MS:
                out.append((downAt,'HOLD',dur)); burst=[]
            else:
                if burst and downAt-lastRel>GAP_MS: 
                    out.append((burst[0],'PRESS' if len(burst)==1 else f'REPEATx{len(burst)}',lastRel-burst[0])); burst=[]
                burst.append(downAt); lastRel=rel
        if not closed and burst and ms-lastRel>GAP_MS:
            out.append((burst[0],'PRESS' if len(burst)==1 else f'REPEATx{len(burst)}',lastRel-burst[0])); burst=[]
    if verbose:
        for t,k,d in out: print(f'  {t/1000:7.3f}s {k:10s} {d} ms')
    return [k for _,k,_ in out]

if __name__=='__main__':
    for P in (1,3,5,8):
      for R in (15,20,30,40,50,70):
        for G in (300,400,500,700):
          for M in (0,15,30):
            k=run(P,R,1000,G,False,M)
            if k.count('HOLD')<=2 and sum(x.startswith('REPEAT') for x in k)==1:
                print((P,R,G,M), k)
