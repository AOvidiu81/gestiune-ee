# v8.36 (cerut de Ovidiu, 09.11): scoate TOATE diacriticele din textul modelelor Word (ă→a, â→a, î→i, ș/ş→s, ț/ţ→t + majuscule),
# ca documentele generate să nu aibă probleme de afișare. Modifică fișierele pe loc (doar textul din <w:t>; formatarea rămâne).
# Folosire: python3 tools/fara_diacritice.py modele/contract_pj.docx modele/anexa_pv.docx
import re,sys,zipfile,unicodedata,os
def fd(t): return ''.join(c for c in unicodedata.normalize('NFD',t) if unicodedata.category(c)!='Mn').translate(str.maketrans({'„':'"','”':'"','“':'"','–':'-','—':'-'}))
for f in sys.argv[1:]:
    z=zipfile.ZipFile(f); tmp=f+'.tmp'; zo=zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED); n=0
    for it in z.infolist():
        d=z.read(it.filename)
        if re.match(r'word/(document|header\d*|footer\d*)\.xml$',it.filename):
            x=d.decode('utf-8')
            x2=re.sub(r'(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)',lambda m:m.group(1)+fd(m.group(2))+m.group(3),x)
            n+=sum(1 for a,b in zip(x,x2) if a!=b); d=x2.encode('utf-8')
        zo.writestr(it,d)
    zo.close(); z.close(); os.replace(tmp,f); print(f,'litere schimbate:',n)
