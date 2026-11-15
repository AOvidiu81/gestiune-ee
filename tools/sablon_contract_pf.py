# v8.84 (cerut de Ovidiu, 15.11): CONTRACTUL PENTRU PERSOANE FIZICE — pornește din modele/contract_pj.docx (antet, subsol, Anexa + PV,
# chenarele de semnături) și înlocuiește partea de contract cu textul pentru persoane fizice (consumatori): părțile cu CNP + CI,
# plata în avans, chiria minimă 30 de zile, dreptul de retragere (contract la distanță), litigii fără clauza de competență la sediul nostru,
# chenarele „Nume / Serie CI / Nr / Semnătura”, PV-ul cu beneficiarul persoană fizică și pagina finală ANEXA CI (poza buletinului, {ci_img}).
# Textul pornește de la modelul lui „2. PF - ctr... PREST SERVICII_2026.docx” (1510 HD) și de la contractul PJ nou (v8.43).
# Folosire: python3 tools/sablon_contract_pf.py modele/contract_pj.docx modele/contract_pf.docx && python3 tools/fara_diacritice.py modele/contract_pf.docx
import re,sys,zipfile
src,dst=sys.argv[1],sys.argv[2]
z=zipfile.ZipFile(src); x=z.read('word/document.xml').decode('utf-8')
def esc(t): return t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
def R(t,b=False,sz=18):
    return ('<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'+('<w:b/><w:bCs/>' if b else '')+
            f'<w:color w:val="000000"/><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/><w:lang w:val="ro-RO"/></w:rPr><w:t xml:space="preserve">{esc(t)}</w:t></w:r>')
def runs(t,sz=18,b0=False):
    out=[];b=b0
    for part in t.split('**'):
        if part: out.append(R(part,b,sz))
        b=not b
    return ''.join(out)
def P(t,jc='both',after=0,before=0,ind=0,keep=False,sz=18,b=False,raw=None):
    ppr=f'<w:pPr><w:pStyle w:val="Frspaiere"/><w:spacing w:before="{before}" w:after="{after}" w:line="240" w:lineRule="auto"/>'+(f'<w:ind w:left="{ind}"/>' if ind else '')+('<w:keepNext/>' if keep else '')+f'<w:jc w:val="{jc}"/></w:pPr>'
    return '<w:p>'+ppr+(raw if raw is not None else runs(t,sz,b))+'</w:p>'
H=lambda t: P(t,jc='left',keep=True,b=True)
L=lambda t: P(t,ind=284)
def TC(cont,w,shade=False,bold=False,jc='left'):
    sh='<w:shd w:val="clear" w:color="auto" w:fill="E7EEE9"/>' if shade else ''
    return f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{sh}<w:vAlign w:val="center"/></w:tcPr>{P(cont,jc=jc,b=bold)}</w:tc>'
def TBL(rows,widths):
    b='<w:tblBorders>'+''.join(f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>' for s in ['top','left','bottom','right','insideH','insideV'])+'</w:tblBorders>'
    g='<w:tblGrid>'+''.join(f'<w:gridCol w:w="{w}"/>' for w in widths)+'</w:tblGrid>'
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/><w:jc w:val="center"/>{b}<w:tblLayout w:type="fixed"/>'
            '<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
            +g+''.join('<w:tr><w:trPr><w:cantSplit/></w:trPr>'+''.join(r)+'</w:tr>' for r in rows)+'</w:tbl>')
X=[]
X.append(P('CONTRACT DE ÎNCHIRIERE ȘI PRESTĂRI SERVICII',jc='center',after=0,sz=24,b=True))
X.append(P('PERSOANĂ FIZICĂ',jc='center',after=20,b=True))
X.append(P('Nr. **{contract_nr}** din **{contract_data}**',jc='center',after=120))
X.append(H('Art. 1. Părțile contractante'))
X.append(P('1.1. **SC EURO-ECOLOGIC SRL**, cu sediul în Vlăhița, str. Mihai Eminescu nr. 9/A/18, jud. Harghita, înregistrată la Registrul Comerțului sub nr. J2007000205190, CUI RO 21311085, cont IBAN RO04 RNCB 0158 0723 7291 0001 deschis la BCR Ag. Vlăhița sau RO42 TREZ 3515 069X XX00 5333 deschis la Trezoreria Miercurea Ciuc, tel. 0735-214.751, e-mail hunedoara@eurowc.ro, reprezentată prin Gyorgy Irina, administrator, denumită în continuare **„PRESTATOR”**,'))
X.append(P('și',jc='left'))
X.append(P('',raw=R('1.2. ')+R('{#benef}{#b}')+R('{t}',True)+R('{/b}{^b}{t}{/b}{/benef}')))
X.append(P('denumite împreună „Părțile”, au încheiat prezentul contract.'))
X.append(P('1.3. {declaratie}'))
X.append(H('Art. 2. Obiectul contractului'))
X.append(P('2.1. Prestatorul închiriază Beneficiarului {obiect} („produsele”) și prestează serviciile de igienizare și întreținere aferente. Tipul, numărul, accesoriile, prețul, locul de amplasare și frecvența serviciilor sunt stabilite în anexe.'))
X.append(P('2.2. Anexele, actele adiționale și comenzile scrise transmise de Beneficiar pe e-mail și acceptate de Prestator fac parte integrantă din contract.'))
X.append(P('2.3. Produsele rămân proprietatea Prestatorului pe toată durata contractului. Ele nu devin parte a terenului sau a construcției pe care sunt amplasate și nu pot fi vândute, gajate, subînchiriate, sechestrate sau reținute pentru datoriile Beneficiarului.'))
X.append(H('Art. 3. Durata'))
X.append(P('3.1. Contractul se încheie pe o perioadă de **{durata}**, începând cu data de **{data_start}**.'))
X.append(P('3.2. **Chiria minimă este de 30 de zile de la amplasare**, chiar dacă produsele sunt returnate mai devreme.'))
X.append(P('3.3. Dacă la sfârșitul perioadei produsele nu au fost returnate, contractul se prelungește tacit, pe durată nedeterminată, în aceleași condiții, până la returnarea lor.'))
X.append(P('3.4. Ultima zi de închiriere este ziua în care produsele au ajuns în depozitul Prestatorului sau au fost preluate de reprezentantul lui, pe bază de proces-verbal. Fiecare zi calendaristică începută se plătește ca zi de închiriere.'))
X.append(H('Art. 4. Livrarea, accesul, servisarea și ridicarea'))
X.append(P('4.1. Prestatorul livrează produsele, cu accesoriile necesare (substanțe bioactivatoare, odorizante, hârtie igienică), la locul de amplasare din anexă, conform rutelor proprii. Livrările sau ridicările cerute de Beneficiar în afara rutei se facturează separat (transport).'))
X.append(P('4.2. Toaletele, lavoarele, gardurile și celelalte produse de mici dimensiuni se transportă cu autovehicule de până la 3,5 t; containerele și celelalte produse voluminoase, cu autocamioane de mare tonaj.'))
X.append(P('4.3. **Accesul.** Beneficiarul asigură, la livrare, la fiecare servisare și la ridicare: (a) un drum de acces practicabil pentru autovehiculul de la art. 4.2; (b) un loc de staționare în siguranță, fără a bloca drumul public; (c) o distanță de cel mult 5 m între autovehicul și produs, fără obstacole (garduri, șanțuri, gropi, materiale); (d) teren plan și stabil pentru amplasare, precum și acordurile necesare amplasării (de exemplu, ale vecinilor sau ale asociației de proprietari, unde e cazul).'))
X.append(P('4.4. Când condițiile de la art. 4.3 nu sunt îndeplinite sau operațiunea ar pune în pericol personalul, autovehiculul ori alte persoane, șoferul poate refuza livrarea, servisarea sau ridicarea. Situația se consemnează (fotografie sau notă) și se comunică Beneficiarului. În acest caz, servisarea se consideră efectuată, iar deplasarea suplimentară se plătește la tariful de transport.'))
X.append(P('4.5. La livrare și la ridicare se întocmește un proces-verbal de predare-primire. Dacă Beneficiarul sau un reprezentant al lui nu este prezent, procesul-verbal întocmit de Prestator, însoțit de fotografii, face dovada livrării și a stării produselor.'))
X.append(P('4.6. Din momentul livrării, Beneficiarul răspunde de paza și integritatea produselor, până la predarea lor către Prestator. Când vremea nu permite, serviciile se fac imediat ce condițiile o permit, conform rutei.'))
X.append(H('Art. 5. Prețul și plata'))
X.append(P('5.1. Chiria, serviciile și transportul se plătesc la prețurile din anexe. La preț se adaugă TVA.'))
X.append(P('5.2. **Plata se face în avans.** Prima factură se emite la amplasare și cuprinde perioada până la sfârșitul lunii. Apoi factura se emite la sfârșitul fiecărei luni, pentru luna următoare. **Pentru închirieri mai scurte de 90 de zile, plata se face integral, înainte de livrare.**'))
X.append(P('5.3. Factura se transmite pe e-mail, la adresa din art. 15, și se plătește în cel mult 5 zile calendaristice de la emitere. Beneficiarul poate contesta în scris o factură până la scadență.'))
X.append(P('5.4. Pentru întârziere, Beneficiarul datorează penalități de 0,1% pe zi din suma neachitată, de la scadență până la plată; totalul penalităților nu poate depăși suma datorată.'))
X.append(P('5.5. Dacă o factură nu e plătită în 7 zile de la scadență, Prestatorul poate suspenda serviciile, după o notificare scrisă, și poate rezilia contractul și ridica produsele conform art. 11. Chiria continuă să curgă până la ridicare.'))
X.append(P('5.6. Serviciile care nu s-au putut face din motive care nu țin de Prestator (acces blocat, produs mutat, condiții meteo) nu scad chiria.'))
X.append(H('Art. 6. Obligațiile Prestatorului'))
X.append(P('6.1. Prestatorul: (a) livrează produsele în stare bună de folosință, cu accesoriile din anexă; (b) face serviciile de igienizare și întreținere la frecvența din anexă; (c) repară sau înlocuiește, pe cheltuiala lui, produsul defect din uzură normală, în cel mult 14 zile de la anunțul Beneficiarului; (d) ridică produsele la încetarea contractului.'))
X.append(H('Art. 7. Folosirea și mutarea produselor'))
X.append(P('7.1. Beneficiarul folosește produsele cu grijă, numai pentru destinația lor, nu le modifică și nu îndepărtează plăcuțele sau seriile de identificare.'))
X.append(P('7.2. Produsele nu pot fi mutate din locul de amplasare din anexă fără acordul scris (inclusiv pe e-mail) al Prestatorului și nu pot fi subînchiriate, împrumutate sau date altor persoane.'))
X.append(P('7.3. Beneficiarul permite reprezentanților Prestatorului accesul la produse pentru servicii, verificări și ridicare și îl anunță imediat despre orice furt sau deteriorare.'))
X.append(H('Art. 8. Răspunderea pentru produse'))
X.append(P('8.1. De la livrare până la returnare, Beneficiarul răspunde pentru pierderea, furtul sau deteriorarea produselor, cu excepția uzurii normale și a cazurilor de forță majoră.'))
X.append(P('8.2. Deteriorările se repară de Prestator, pe cheltuiala Beneficiarului, pe baza procesului-verbal sau a notei de constatare, însoțite de fotografii.'))
X.append(P('8.3. În caz de daună totală sau furt, Beneficiarul plătește valoarea din Tabelul nr. 1, plus chiria până la data anunțării scrise a daunei sau a furtului.',keep=True))
X.append(P('**Tabel nr. 1** — Valoarea estimată a produselor în caz de daună totală sau furt',jc='center',keep=True))
X.append(TBL([[TC('DENUMIRE PRODUS',5400,True,True,'center'),TC('VALOARE ESTIMATĂ',4200,True,True,'center')],
              [TC('{#daune}{den}',5400),TC('{val}{/daune}',4200)]],[5400,4200]))
X.append(H('Art. 9. Returnarea produselor'))
X.append(P('9.1. La încetarea contractului, Beneficiarul predă produsele în 48 de ore, în starea în care le-a primit, cu excepția uzurii normale.'))
X.append(P('9.2. Beneficiarul își dă acordul ca, după încetarea contractului, reprezentanții Prestatorului să intre la locul de amplasare numai pentru ridicarea produselor. Costurile unei ridicări întârziate din cauza Beneficiarului (transport, manipulare) sunt suportate de Beneficiar, iar până la ridicare se datorează chiria pe zi.'))
X.append(H('Art. 10. Dreptul de retragere'))
X.append(P('10.1. Dacă contractul se încheie la distanță (pe e-mail, telefon sau prin formularul online), Beneficiarul se poate retrage din contract, fără să-și motiveze decizia, în 14 zile de la încheierea lui, printr-o notificare scrisă trimisă la adresele din art. 15 (O.U.G. nr. 34/2014).'))
X.append(P('10.2. Prin semnarea contractului sau prin plata primei facturi, Beneficiarul cere expres ca livrarea și serviciile să înceapă înainte de expirarea termenului de retragere. Dacă se retrage, Beneficiarul plătește chiria și serviciile pentru zilele de până la notificare, iar Prestatorul ridică produsele și îi restituie restul sumei plătite în cel mult 14 zile.'))
X.append(H('Art. 11. Încetarea contractului'))
X.append(P('11.1. Contractul încetează: (a) la sfârșitul duratei, dacă produsele au fost returnate (altfel se aplică art. 3.3); (b) prin acordul Părților; (c) prin denunțare; (d) prin reziliere.'))
X.append(P('11.2. **Denunțarea.** Beneficiarul poate înceta contractul oricând, printr-o notificare scrisă (inclusiv pe e-mail) trimisă cu cel puțin 7 zile înainte, cu respectarea chiriei minime de la art. 3.2. Prestatorul poate denunța contractul cu o notificare de 14 zile. Ultima factură se calculează pe zilele până la returnare; suma plătită în avans pentru zilele rămase se restituie sau se compensează.'))
X.append(P('11.3. **Rezilierea.** Dacă Beneficiarul nu plătește o factură în 7 zile de la scadență, mută sau dă altcuiva produsele fără acordul Prestatorului ori le folosește în alt scop, Prestatorul îi trimite o notificare scrisă cu un termen de 5 zile pentru remediere; dacă situația nu e remediată, contractul este reziliat la data indicată în notificare, iar Prestatorul ridică produsele.'))
X.append(P('11.4. La orice încetare, Beneficiarul returnează produsele conform art. 9 și plătește sumele datorate în cel mult 15 zile.'))
X.append(H('Art. 12. Forța majoră'))
X.append(P('Nicio Parte nu răspunde pentru neexecutarea cauzată de forța majoră (eveniment extern, imprevizibil, absolut invincibil și inevitabil). Partea care o invocă anunță cealaltă Parte în 5 zile. Dacă evenimentul durează mai mult de 30 de zile, oricare Parte poate înceta contractul prin notificare, fără daune-interese.'))
X.append(H('Art. 13. Datele personale'))
X.append(P('13.1. Prestatorul prelucrează datele personale ale Beneficiarului (nume, CNP, datele și copia actului de identitate, domiciliul, telefonul, e-mailul) numai pentru identificarea lui, încheierea și executarea contractului, facturare, evidența contabilă și recuperarea sumelor datorate, conform Regulamentului (UE) 2016/679 (GDPR).'))
X.append(P('13.2. Datele se păstrează pe durata contractului și apoi cât cere legea pentru documentele contabile; copia actului de identitate se păstrează doar ca anexă la contract. Beneficiarul are dreptul de acces, rectificare, ștergere, restricționare și opoziție, în limitele legii, și se poate adresa Autorității Naționale de Supraveghere a Prelucrării Datelor cu Caracter Personal.'))
X.append(H('Art. 14. Litigii și dispoziții finale'))
X.append(P('14.1. Neînțelegerile se rezolvă mai întâi pe cale amiabilă. Beneficiarul se poate adresa și Autorității Naționale pentru Protecția Consumatorilor (ANPC) sau unei entități de soluționare alternativă a litigiilor (SAL). Dacă neînțelegerile nu se rezolvă, sunt de competența instanțelor stabilite potrivit legii. Se aplică legea română.'))
X.append(P('14.2. Contractul se modifică doar în scris, prin act adițional sau anexă. Dacă o clauză este nulă, celelalte rămân valabile.'))
X.append(P('14.3. **Contractul se consideră valabil și în lipsa semnăturii olografe a Beneficiarului, dacă la contract este anexată copia actului său de identitate (Anexa CI). Contractul produce efecte de la data achitării primei facturi emise în baza lui** și rămâne în vigoare până la încetarea lui și plata integrală a sumelor datorate.'))
X.append(P('14.4. Beneficiarul declară că a primit contractul și anexele înainte de încheiere, că a citit și a înțeles toate clauzele, inclusiv cele privind prelungirea tacită (art. 3.3), chiria minimă (art. 3.2), plata în avans (art. 5.2), penalitățile (art. 5.4) și răspunderea pentru produse (art. 8), și că le acceptă.'))
X.append(H('Art. 15. Notificările'))
X.append(P('15.1. Notificările se fac în scris, prin e-mail, scrisoare recomandată cu confirmare de primire, curier sau predare sub semnătură, la adresele de mai jos.',keep=True))
W3=[1300,2550,6350]
X.append(TBL([[TC('',W3[0],True),TC('PRESTATOR',W3[1],True,True,'center'),TC('BENEFICIAR',W3[2],True,True,'center')],
              [TC('Adresa',W3[0],bold=True),TC('Hunedoara, Peștișu Mare, Nr. 1',W3[1]),TC('{notif_adresa}',W3[2])],
              [TC('Telefon',W3[0],bold=True),TC('0735 214 751',W3[1]),TC('{notif_tel}',W3[2])],
              [TC('E-mail',W3[0],bold=True),TC('hunedoara@eurowc.ro',W3[1]),TC('{notif_email}',W3[2])],
              [TC('În atenția',W3[0],bold=True),TC('Anitoiu Ovidiu',W3[1],bold=True),TC('{notif_atentie}',W3[2],bold=True)]],W3))
X.append(P('15.2. Partea care își schimbă adresa sau e-mailul anunță cealaltă Parte în scris. Până atunci, notificarea trimisă la vechea adresă este valabilă.'))
X.append(P('15.3. Contractul s-a încheiat la data de **{contract_data}**, în 2 exemplare, câte unul pentru fiecare Parte.'))
X.append(P('15.4. {anexe_text}',jc='left'))
X.append(P('15.5. **Anexa CI** face parte din contract (datele din contract sunt verificate și corelate cu actul de identitate al Beneficiarului).',jc='left',keep=True))
T=list(re.finditer(r'<w:tbl>.*?</w:tbl>',x,re.S))
assert '{#semnatari}' in T[2].group(0) and '{pv_tip}' not in x[:T[2].start()]
b=x.index('<w:body>')+len('<w:body>')
x=x[:b]+''.join(X)+x[T[2].start():]
# chenarele: în locul funcției — seria și nr. CI + „Semnătura”; fără alți semnatari
PAR=re.compile(r'<w:p[ >](?:(?!<w:p[ >]).)*?</w:p>',re.S)
def chenar(tb):
    if '{#semnatari}' not in tb: tb=tb.replace('w:tblpY="14032"','w:tblpY="13780"')   # un rând în plus (Semnătura) → chenarul urcă puțin, să nu treacă pe pagina următoare
    out=[];last=0
    for m in PAR.finditer(tb):
        p=m.group(0); out.append(tb[last:m.start()]); last=m.end()
        if any(k in p for k in ['Nume: {nume}','Functie: {functie}','{/semnatari}']): continue
        if '{#semnatari}' in p: p=p.replace('{#semnatari}','Semnatura:')
        elif 'Functie: {reprezentant_functie}' in p:
            p=p.replace('Functie: {reprezentant_functie}','Serie CI: {ci_serie}   Nr: {ci_numar}')
            if '{#semnatari}' not in tb: p=p+p.replace('Serie CI: {ci_serie}   Nr: {ci_numar}','Semnatura:')
        out.append(p)
    out.append(tb[last:]); return ''.join(out)
T=list(re.finditer(r'<w:tbl>.*?</w:tbl>',x,re.S)); res=[];last=0
for t in T:
    res.append(x[last:t.start()]); g=t.group(0)
    res.append(chenar(g) if '{reprezentant_functie}' in g else g); last=t.end()
res.append(x[last:]); x=''.join(res)
assert x.count('Serie CI: {ci_serie}')==3 and '{#semnatari}' not in x, x.count('Serie CI: {ci_serie}')
# PV: beneficiarul persoană fizică
i=x.index('{client_j}'); pa=x.rfind('<w:p ',0,i); pa2=x.rfind('<w:p>',0,i); pa=max(pa,pa2); pb=x.index('</w:p>',i)+6
p=x[pa:pb]; head=re.match(r'(<w:p[ >].*?</w:pPr>)',p,re.S).group(1)
rr=re.search(r'<w:rPr>.*?</w:rPr>',p[len(head):],re.S).group(0); rb=rr if '<w:b/>' in rr else rr.replace('<w:rPr>','<w:rPr><w:b/>',1); rn=rr.replace('<w:b/>','').replace('<w:bCs/>','')
seg=lambda t,bb: '<w:r>'+(rb if bb else rn)+'<w:t xml:space="preserve">'+esc(t)+'</w:t></w:r>'
S=[("{client_titlu} ",0),("{client}",1),(", {client_domiciliat} in ",0),("{client_sediu}",1),(", CNP ",0),("{client_cui}",1),(", CI seria ",0),("{ci_serie}",1),(" nr. ",0),("{ci_numar}",1),
   ("{#client_tel}, Tel: ",0),("{client_tel}",1),("{/client_tel}",0),("{#client_email}, E-mail: ",0),("{client_email}",1),("{/client_email}",0),(", denumit(a) aici si mai jos \"",0),("BENEFICIAR",1),("\".",0)]
x=x[:pa]+head+''.join(seg(t,bb) for t,bb in S)+'</w:p>'+x[pb:]
# ANEXA CI: pagina finală — titlul, locul pozei ({ci_img}, înlocuit în aplicație cu poza), chenarul de semnături
sp=x.rindex('<w:sectPr'); T=list(re.finditer(r'<w:tbl>.*?</w:tbl>',x,re.S)); CH=[t.group(0) for t in T if 'Serie CI: {ci_serie}' in t.group(0)][-1]
ANX=('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'+P('ANEXA CI',jc='center',sz=24,b=True,before=200)+P('la Contractul nr. **{contract_nr}** din **{contract_data}**',jc='center',after=200)
     +P('{ci_img}',jc='center',after=120)+P('Datele din contract sunt verificate și corelate cu actul de identitate al Beneficiarului.',jc='center')+CH+'<w:p/>')
x=x[:sp]+ANX+x[sp:]
for k in ['{contract_nr}','{#benef}','{declaratie}','{obiect}','{durata}','{data_start}','{#daune}','{notif_adresa}','{anexe_text}','{#anexe}','{pv_tip}','{#produse}','{ci_img}','{client_titlu}']:
    assert k in x, k
zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
for it in z.infolist():
    zo.writestr(it, x.encode('utf-8') if it.filename=='word/document.xml' else z.read(it.filename))
zo.close(); print('ok')
