# v8.06 — model Anexa + PV pe tipuri de comandă (amplasare / ridicare / reducere ...), tabel și condiții în buclă
import re,sys,zipfile
src,dst=sys.argv[1],sys.argv[2]
z=zipfile.ZipFile(src); x=z.read('word/document.xml').decode('utf-8')
RUN=re.compile(r'<w:r[ >].*?</w:r>',re.S)
TXT=re.compile(r'<w:t(?: [^>]*)?>[^<]*</w:t>')
def esc(t): return t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
def setruns(p, m, nobold=()):
    out=[];last=0
    for k,r in enumerate(RUN.finditer(p)):
        out.append(p[last:r.start()]); rr=r.group(0)
        if TXT.search(rr):
            t=m.get(k,'')
            rr=TXT.sub(lambda _:'<w:t xml:space="preserve">'+esc(t)+'</w:t>',rr,count=1)
            rr=TXT.sub('',rr) if len(TXT.findall(rr))>1 else rr
        if k in nobold: rr=rr.replace('<w:b/>','').replace('<w:bCs/>','')
        out.append(rr); last=r.end()
    out.append(p[last:]); return ''.join(out)

RN='<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman"/><w:lang w:val="ro-RO" w:eastAsia="ro-RO"/></w:rPr>'
RB='<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman"/><w:b/><w:lang w:val="ro-RO" w:eastAsia="ro-RO"/></w:rPr>'
def segs(p, keep, S):
    """păstrează pPr + primele `keep` run-uri, apoi run-urile din S [(text, bold)]"""
    head=re.match(r'(<w:p[ >].*?</w:pPr>)',p,re.S).group(1)
    rest=p[len(head):]
    runs=list(RUN.finditer(rest)); kept=''.join(r.group(0) for r in runs[:keep])
    body=''.join('<w:r>'+(RB if b else RN)+'<w:t xml:space="preserve">'+esc(t)+'</w:t></w:r>' for t,b in S)
    return head+kept+body+'</w:p>'
PREST=[("SC EURO-ECOLOGIC SRL",1),(" cu sediul în Vlăhiţa, str. Mihai Eminescu nr. 9/A/18, înregistrată la Registrul Comerţului sub Nr. J2007000205190 , Cod fiscal RO 21311085, cont bancar RO04 RNCB 0158 0723 7291 0001 deschis la BCR Ag. Vlăhiţa, sau RO42 TREZ 3515 069X XX00 5333, Trezoreria Miercurea Ciuc, Tel: 0735-214.751 , E-mail: hunedoara@eurowc.ro, reprezentată prin Gyorgy Irina, având calitatea de administrator , denumită aici şi mai jos “ ",0),("PRESTATOR",1),(" “ .",0)]
BENEF=[("{client}",1),(", cu sediul in ",0),("{client_sediu}",1),(", înregistrata la Registrul Comerţului sub ",0),("{client_j}",1),(" , {client_id_et} ",0),("{client_cui}",1),
 ("{#client_email} , E-mail: ",0),("{client_email}",1),("{/client_email}",0),("{#client_tel} , Tel: ",0),("{client_tel}",1),("{/client_tel}",0),
 ("{#client_iban} , cont bancar IBAN ",0),("{client_iban}",1),("{/client_iban}",0),("{#client_banca} deschis la Banca ",0),("{client_banca}",1),("{/client_banca}",0),
 (" , reprezentată prin ",0),("{reprezentant}",1),(" , in calitate de {reprezentant_functie_mic} , denumită aici şi mai jos \"",0),("BENEFICIAR",1),("\" .",0)]

def first(p,t): # textul în primul run cu text
    for k,r in enumerate(RUN.finditer(p)):
        if TXT.search(r.group(0)): return setruns(p,{k:t})
    raise Exception('fara run')
M={
1:lambda p:setruns(p,{0:"ANEXA NR {anexa_nr} ",5:"din data",7:" {anexa_data}"}),
2:lambda p:setruns(p,{0:" la Contractul nr. {contract_nr} din {contract_data}"}),
3:"INFO",
4:lambda p:first(p,"{titlu_tabel}"),
8:lambda p:first(p,"{#randuri}{et}"), 9:lambda p:first(p,"{val}{/randuri}"),
32:lambda p:first(p,"{titlu_cond}"), 33:lambda p:first(p,"{#conditii}"), 34:lambda p:first(p,"{.}"), 35:lambda p:first(p,"{/conditii}"), 36:None,37:None,
62:lambda p:first(p,"{client}"),65:lambda p:first(p,"NUME: {reprezentant}"),66:lambda p:first(p,"FUNCTIA: {reprezentant_functie}"),
76:lambda p:first(p,"PROCES VERBAL de : {pv_tip}"),78:None,
81:lambda p:segs(p,3,PREST),83:lambda p:segs(p,0,BENEF),
84:None,
86:lambda p:first(p,"Nume :  {persoana_contact}"),
88:lambda p:first(p,"Telefon :  {telefon}"),
91:lambda p:setruns(p,{0:"Anexa Nr: {anexa_nr} din Data: {anexa_data}"}),
92:lambda p:setruns(p,{1:"la Contract : {contract_nr} din {contract_data}"}),
95:lambda p:setruns(p,{0:"In data de {data_op} se {pv_verb} urmatoarele produse :"}),
101:lambda p:first(p,"{#produse}{den}"),102:lambda p:first(p,"{bucati}  Buc"),103:lambda p:first(p,"{model}"),104:lambda p:first(p,"{serie}{/produse}"),
106:lambda p:setruns(p,{0:"{pv_dep_a} ",2:"{pv_dep_b}",6:" depozit :"}),107:lambda p:first(p,"{depozit}"),
108:lambda p:setruns(p,{0:"Locatia ",2:"{pv_loc_b}"}),109:lambda p:first(p,"{amplasament}"),
114:lambda p:first(p,"{titlu_cond}"),115:lambda p:first(p,"{#conditii}"),116:lambda p:first(p,"{.}"),117:lambda p:first(p,"{/conditii}"),118:None,119:None,
129:lambda p:first(p,"{client}"),132:lambda p:first(p,"NUME: {reprezentant}"),133:lambda p:first(p,"FUNCTIA: {reprezentant_functie}"),
}
pat=re.compile(r'<w:p[ >].*?</w:p>',re.S)
res=[];last=0
for i,m in enumerate(pat.finditer(x)):
    res.append(x[last:m.start()]); p=m.group(0)
    if i in M:
        f=M[i]
        if f is None: p=''
        elif f=="INFO":  # paragraf gol → run nou cursiv
            p=p.replace('</w:pPr></w:p>','</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ro-RO"/></w:rPr><w:t xml:space="preserve">{info}</w:t></w:r></w:p>')
            assert '{info}' in p
        else: p=f(p)
    res.append(p); last=m.end()
res.append(x[last:]); x2=''.join(res)
# tabelul anexei: rămâne doar primul rând (în buclă) + rândul cu condițiile
t=re.search(r'<w:tbl>.*?</w:tbl>',x2,re.S); tb=t.group(0)
rows=list(re.finditer(r'<w:tr[ >].*?</w:tr>',tb,re.S)); assert len(rows)==13
tb2=tb[:rows[1].start()]+tb[rows[11].end():]
x2=x2[:t.start()]+tb2+x2[t.end():]
x2=re.sub(r'<w:dataBinding[^>]*/>','',x2)
# v8.39 (cerut de Ovidiu, 09.11): „Nume:” / „Functie:” la semnături, ca în contract
x2=re.sub(r'(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)',lambda m:m.group(1)+m.group(2).replace('NUME:','Nume:').replace('FUNCTIA:','Functie:')+m.group(3),x2)
CURAT={'docProps/app.xml':['Manager','Company'],'docProps/core.xml':['cp:keywords','cp:category','cp:contentStatus','dc:title','dc:subject'],
 'customXml/item1.xml':['PublishDate','Abstract','CompanyAddress','CompanyPhone','CompanyEmail','CompanyFax']}
def curata(n,txt):
    for t in CURAT.get(n,[]): txt=re.sub(r'(<'+t+r'(?: [^>]*)?>)[^<]*(</'+t+'>)',r'\1\2',txt)
    return txt
zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
for it in z.infolist():
    d=z.read(it.filename)
    if it.filename=='word/document.xml': d=x2.encode()
    elif it.filename in CURAT: d=curata(it.filename,d.decode()).encode()
    zo.writestr(it,d)
zo.close(); print('ok')
