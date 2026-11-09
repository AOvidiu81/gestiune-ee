# v8.48 (cerut de Ovidiu, 09.11): chenarele de semnături (tabele plutitoare fixate jos pe pagină) nu mai sar pe pagina următoare.
# Rândurile goale puse ca distanțier înainte / după chenar împingeau paragraful-ancoră pe pagina următoare când anexa / PV-ul
# aveau mai multe produse sau condiții → chenarul apărea singur pe o pagină nouă. Scoatem distanțierele (rămâne câte unul)
# și punem „rândul nu se rupe” pe rândurile chenarului. Modifică fișierele pe loc.
# Folosire: python3 tools/chenar_jos.py modele/anexa_pv.docx modele/contract_pj.docx   (după sablon_* și fara_diacritice)
import re,sys,zipfile,os
BLK=re.compile(r'<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>|<w:p/>',re.S)
def gol(p): return p.startswith('<w:p') and '<w:t' not in p and '<w:br' not in p and '<w:drawing' not in p and '<w:sectPr' not in p and '<w:pict' not in p
def chenar(t): return t.startswith('<w:tbl>') and re.search(r'<w:tblpPr[^>]*w:vertAnchor="page"',t) and 'PRESTATOR' in t
def repara(x):
    b=x.index('<w:body>')+len('<w:body>'); e=x.rindex('<w:sectPr')
    corp=x[b:e]; toks=[]; last=0
    for m in BLK.finditer(corp):
        if m.start()>last: toks.append(corp[last:m.start()])
        toks.append(m.group(0)); last=m.end()
    toks.append(corp[last:])
    ids=[i for i,t in enumerate(toks) if chenar(t)]; scos=0
    for i in ids:
        toks[i]=re.sub(r'<w:tr( [^>]*)?>(?!<w:trPr>)',lambda m:'<w:tr'+(m.group(1) or '')+'><w:trPr><w:cantSplit/></w:trPr>',toks[i])
        for pas in (-1,1):   # înainte și după chenar: păstrez un singur paragraf gol
            j=i+pas; goale=[]
            while 0<=j<len(toks) and (gol(toks[j]) or not toks[j].strip() or not toks[j].startswith('<')):
                if gol(toks[j]): goale.append(j)
                j+=pas
            for k in goale[1:]: toks[k]=''; scos+=1
    return x[:b]+''.join(toks)+x[e:], len(ids), scos
for f in sys.argv[1:]:
    z=zipfile.ZipFile(f); tmp=f+'.tmp'; zo=zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        d=z.read(it.filename)
        if it.filename=='word/document.xml':
            x,n,s=repara(d.decode('utf-8')); d=x.encode('utf-8'); print(f,'chenare:',n,'rânduri goale scoase:',s)
        zo.writestr(it,d)
    zo.close(); z.close(); os.replace(tmp,f)
