# v8.43 (cerut de Ovidiu, 09.11): CONTRACTUL PJ NOU — textul din doc-ul „Contract PJ — analiză juridică și varianta nouă”, tabul
# „Contract — de printat” (18 articole, deciziile lui: denunțare 14 zile, înlocuire 14 zile, penalități 0,1%/zi, instanța Harghita,
# transport 3,5 t / mare tonaj, acces max 5 m + SSM, notificări cu „E-mail”, art. 17 clauze acceptate expres).
# Partea de contract se scrie de aici; Anexa (bucla {#anexe}) + PV-ul vin neschimbate din tools/sablon_contract_pj.py (același original).
# Folosire: python3 tools/sablon_contract_pj_v2.py "modele-originale/2. 00 HD_ NUME CLIENT.docx" modele/contract_pj.docx
#           apoi: python3 tools/fara_diacritice.py modele/contract_pj.docx
import os,re,sys,subprocess,tempfile,zipfile
src,dst=sys.argv[1],sys.argv[2]
tmp=os.path.join(tempfile.mkdtemp(),'baza.docx')
subprocess.run([sys.executable,os.path.join(os.path.dirname(os.path.abspath(__file__)),'sablon_contract_pj.py'),src,tmp],check=True)
z=zipfile.ZipFile(tmp); x=z.read('word/document.xml').decode('utf-8')
def esc(t): return t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
def R(t,b=False,sz=18):
    return ('<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'+('<w:b/><w:bCs/>' if b else '')+
            f'<w:color w:val="000000"/><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/><w:lang w:val="ro-RO"/></w:rPr><w:t xml:space="preserve">{esc(t)}</w:t></w:r>')
def runs(t,sz=18,b0=False):   # **gros** în text
    out=[];b=b0
    for i,part in enumerate(t.split('**')):
        if part: out.append(R(part,b,sz))
        b=not b
    return ''.join(out)
def P(t,jc='both',after=50,before=0,ind=0,keep=False,sz=18,b=False,raw=None):
    ppr=f'<w:pPr><w:spacing w:before="{before}" w:after="{after}" w:line="240" w:lineRule="auto"/>'+(f'<w:ind w:left="{ind}"/>' if ind else '')+('<w:keepNext/>' if keep else '')+f'<w:jc w:val="{jc}"/></w:pPr>'
    return '<w:p>'+ppr+(raw if raw is not None else runs(t,sz,b))+'</w:p>'
H=lambda t: P(t,jc='left',before=110,after=40,keep=True,b=True)
L=lambda t: P(t,ind=284)
def TC(cont,w,shade=False,bold=False,jc='left'):
    sh='<w:shd w:val="clear" w:color="auto" w:fill="E7EEE9"/>' if shade else ''
    ps=cont if isinstance(cont,list) else [cont]
    body=''.join(P(c,jc=jc,after=20,b=bold) if not c.startswith('<w:p>') else c for c in ps)
    return f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{sh}<w:vAlign w:val="center"/></w:tcPr>{body}</w:tc>'
def TBL(rows,widths):
    b='<w:tblBorders>'+''.join(f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>' for s in ['top','left','bottom','right','insideH','insideV'])+'</w:tblBorders>'
    g='<w:tblGrid>'+''.join(f'<w:gridCol w:w="{w}"/>' for w in widths)+'</w:tblGrid>'
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/><w:jc w:val="center"/>{b}<w:tblLayout w:type="fixed"/>'
            '<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
            +g+''.join('<w:tr><w:trPr><w:cantSplit/></w:trPr>'+''.join(r)+'</w:tr>' for r in rows)+'</w:tbl>')
X=[]
X.append(P('CONTRACT DE ÎNCHIRIERE ȘI PRESTĂRI SERVICII',jc='center',after=20,sz=24,b=True))
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
X.append(P('2.3. Produsele rămân proprietatea Prestatorului pe toată durata contractului. Ele nu devin parte a terenului sau a construcției pe care sunt amplasate și nu pot fi vândute, gajate, subînchiriate, aduse ca aport la capital, sechestrate sau reținute pentru datoriile Beneficiarului.'))
X.append(H('Art. 3. Durata'))
X.append(P('3.1. Contractul se încheie pe o perioadă de **{durata}**, începând cu data de **{data_start}**.'))
X.append(P('3.2. Chiria minimă este de 30 de zile de la amplasare, chiar dacă produsele sunt returnate mai devreme.'))
X.append(P('3.3. Dacă la sfârșitul perioadei produsele nu au fost returnate, contractul se prelungește tacit, pe durată nedeterminată, în aceleași condiții, până la returnarea lor.'))
X.append(P('3.4. Ultima zi de închiriere este ziua în care produsele au ajuns în depozitul Prestatorului sau au fost preluate de reprezentantul lui, pe bază de proces-verbal. Fiecare zi calendaristică începută se plătește ca zi de închiriere.'))
X.append(H('Art. 4. Livrarea, accesul, servisarea și ridicarea'))
X.append(P('4.1. Prestatorul livrează produsele, cu accesoriile necesare, la locul de amplasare din anexă, conform rutelor proprii. Livrările sau ridicările cerute de Beneficiar în afara rutei se facturează separat (transport).'))
X.append(P('4.2. **Mijloacele de transport.** Toaletele, lavoarele, gardurile, cuburile IBC și celelalte produse de mici dimensiuni se transportă cu autovehicule de până la 3,5 t. Containerele, cabinele de pază, fosele septice și celelalte produse voluminoase se transportă cu autocamioane de mare tonaj. Modul de descărcare și încărcare (macara, platformă) se stabilește în anexă sau în comandă.'))
X.append(P('4.3. **Accesul.** Beneficiarul asigură, pe toată durata contractului, la livrare, la fiecare servisare și la ridicare:'))
for t in ['(a) un drum de acces practicabil în orice anotimp pentru autovehiculul de la art. 4.2, ca lățime, înălțime liberă, pantă și capacitate portantă, astfel încât acesta să poată intra, manevra și ieși fără riscul de a rămâne blocat;',
          '(b) un loc de staționare a autovehiculului în siguranță, fără a bloca drumul public sau calea de acces și fără a încălca regulile de circulație;',
          '(c) o distanță de cel mult 5 m între locul de staționare și produs, pe teren plan, liber de obstacole: garduri, șanțuri, gropi, săpături, materiale depozitate, utilaje sau alte bariere;',
          '(d) acces liber în fața ușilor și a gurilor de golire ale produselor;',
          '(e) teren plan, stabil și consolidat sau fundație pentru amplasare, fixarea produselor unde e cazul, precum și avizele și autorizațiile necesare amplasării.']: X.append(L(t))
X.append(P('4.4. **Securitatea muncii.** Personalul Prestatorului aplică normele de securitate și sănătate în muncă (Legea nr. 319/2006). Furtunul de vidanjare nu se trece prin sau peste garduri, șanțuri ori materiale, iar personalul nu trece peste obstacole și nu lucrează în zone nesigure. Când condițiile de la art. 4.3 nu sunt îndeplinite sau operațiunea ar pune în pericol personalul, autovehiculul ori terții, șoferul poate refuza livrarea, servisarea sau ridicarea. Situația se consemnează (fotografie, notă de constatare sau proces-verbal) și se comunică Beneficiarului.'))
X.append(P('4.5. În cazurile de la art. 4.4: (a) servisarea neefectuată se consideră efectuată și se facturează; (b) deplasarea suplimentară pentru livrare, servisare sau ridicare se facturează la tariful de transport; (c) costurile de deblocare sau tractare a autovehiculului rămas blocat pe calea de acces indicată de Beneficiar sunt suportate de Beneficiar. Imposibilitatea livrării sau a servisării din aceste cauze nu este neexecutare din partea Prestatorului.'))
X.append(P('4.6. La livrare și la ridicare se întocmește un proces-verbal de predare-primire, semnat de reprezentanții Părților. Dacă Beneficiarul nu trimite un reprezentant, procesul-verbal întocmit și semnat doar de Prestator face dovada livrării, a stării produselor și a eventualelor deteriorări.'))
X.append(P('4.7. Livrarea se consideră făcută la descărcarea produselor la locul indicat. Din acel moment Beneficiarul răspunde de paza și integritatea produselor, până la predarea lor către Prestator.'))
X.append(P('4.8. Când vremea nu permite, serviciile se fac imediat ce condițiile o permit, conform rutei.'))
X.append(H('Art. 5. Prețul, facturarea și plata'))
X.append(P('5.1. Chiria și serviciile se plătesc la prețurile din anexe. La preț se adaugă TVA.'))
X.append(P('5.2. Factura se emite la sfârșitul fiecărei luni și se transmite prin sistemul RO e-Factura. Pentru închirieri mai scurte de 90 de zile, plata se face integral înainte de livrare, pe bază de factură de avans sau proformă.'))
X.append(P('5.3. Plata se face în 15 zile calendaristice de la data la care factura e disponibilă în RO e-Factura. Beneficiarul poate contesta în scris o factură până la scadență; necontestată până atunci, factura se consideră acceptată.'))
X.append(P('5.4. Pentru întârziere, Beneficiarul datorează penalități de 0,1% pe zi din suma neachitată, de la scadență până la plată.'))
X.append(P('5.5. Dacă o factură nu e plătită în 15 zile de la scadență, Prestatorul poate suspenda serviciile, după o notificare scrisă, și poate rezilia contractul conform art. 12. Chiria continuă să curgă pe durata suspendării.'))
X.append(P('5.6. Serviciile care nu s-au putut face din motive care nu țin de Prestator (acces blocat, produs mutat, condiții meteo) nu scad chiria.'))
X.append(H('Art. 6. Obligațiile Prestatorului'))
X.append(P('6.1. Prestatorul: (a) livrează produsele în stare bună de folosință, cu accesoriile din anexă; (b) face serviciile de igienizare și întreținere la frecvența din anexă; (c) repară sau înlocuiește, pe cheltuiala lui, produsul defect din uzură normală, în cel mult 14 zile de la anunțul scris al Beneficiarului; (d) ridică produsele la încetarea contractului.'))
X.append(P('6.2. Prestatorul garantează Beneficiarul împotriva pretențiilor terților privind proprietatea produselor.'))
X.append(H('Art. 7. Folosirea și mutarea produselor'))
X.append(P('7.1. Beneficiarul folosește produsele cu grija unui bun proprietar, numai pentru destinația lor și potrivit condițiilor din anexă.'))
X.append(P('7.2. Beneficiarul nu modifică produsele și nu îndepărtează plăcuțele, seriile sau alte semne de identificare.'))
X.append(P('7.3. Produsele nu pot fi mutate din locul de amplasare din anexă decât cu acordul scris prealabil al Prestatorului. Mutarea poate schimba prețul transportului și al serviciilor, prin act adițional.'))
X.append(P('7.4. Beneficiarul permite reprezentanților Prestatorului accesul la produse pentru servicii, verificări și ridicare. Deteriorările constatate se consemnează într-o notă de constatare.'))
X.append(P('7.5. Beneficiarul anunță imediat Prestatorul despre orice furt, deteriorare, sechestru sau pretenție a unui terț privind produsele și îi pune la dispoziție documentele.'))
X.append(H('Art. 8. Răspunderea pentru produse și daunele'))
X.append(P('8.1. De la livrare până la returnare, Beneficiarul răspunde pentru orice pierdere, furt sau deteriorare a produselor, cu excepția uzurii normale, inclusiv cele produse de terți, de fenomene naturale sau de animale.'))
X.append(P('8.2. Deteriorările se repară de Prestator, pe cheltuiala Beneficiarului, pe baza procesului-verbal sau a notei de constatare.'))
X.append(P('8.3. În caz de daună totală sau furt, Beneficiarul plătește valoarea din Tabelul nr. 1, plus chiria până la data anunțării scrise a daunei sau a furtului.',keep=True))
X.append(P('**Tabel nr. 1** — Valoarea estimată a produselor în caz de daună totală sau furt',jc='center',before=60,after=40,keep=True))
X.append(TBL([[TC('DENUMIRE PRODUS',5400,True,True,'center'),TC('VALOARE ESTIMATĂ',4200,True,True,'center')],
              [TC('{#daune}{den}',5400),TC('{val}{/daune}',4200)]],[5400,4200]))
X.append(H('Art. 9. Returnarea și recuperarea produselor'))
X.append(P('9.1. La încetarea contractului, Beneficiarul predă produsele în 48 de ore, curățate de bunurile lui și în starea în care le-a primit, cu excepția uzurii normale.'))
X.append(P('9.2. Dacă produsele nu pot fi ridicate de la locul de amplasare (acces blocat, teren impracticabil), Beneficiarul le duce, pe cheltuiala și riscul lui, într-un loc de unde pot fi ridicate, stabilit în scris cu Prestatorul.'))
X.append(P('9.3. Beneficiarul își dă de acum acordul ca, după încetarea contractului, reprezentanții Prestatorului să intre la locul de amplasare pentru ridicarea produselor. Costurile ridicării făcute din cauza Beneficiarului (transport, manipulare, curățenie, reparații) sunt suportate de Beneficiar.'))
X.append(P('9.4. Cât timp produsele nu pot fi recuperate din cauza Beneficiarului, acesta plătește o despăgubire egală cu chiria, calculată pe zi, până la ridicarea lor.'))
X.append(P('9.5. Prestatorul poate înscrie contractul în Arhiva Electronică de Garanții Reale Mobiliare; costurile înscrierii și ale radierii sunt suportate de Beneficiar.'))
X.append(H('Art. 10. Terții și cesiunea contractului'))
X.append(P('10.1. Beneficiarul nu poate subînchiria, împrumuta, ceda sau da în folosință produsele altor persoane și nu poate cesiona contractul fără acordul scris al Prestatorului.'))
X.append(P('10.2. Beneficiarul își dă de acum acordul ca Prestatorul să cesioneze contractul sau creanțele din contract unui terț, prin simplă notificare.'))
X.append(H('Art. 11. Declarații'))
X.append(P('11.1. Fiecare Parte declară că este legal constituită, că semnatarul are dreptul să o angajeze și că încheierea contractului nu încalcă actul ei constitutiv sau alte contracte.'))
X.append(P('11.2. {garantie_a}'))
X.append(P('11.3. Persoana care semnează fără a avea dreptul să reprezinte Partea răspunde personal pentru obligațiile din contract.'))
X.append(H('Art. 12. Încetarea contractului'))
X.append(P('12.1. Contractul încetează: (a) la sfârșitul duratei, dacă produsele au fost returnate (altfel se aplică art. 3.3); (b) prin acordul scris al Părților; (c) prin denunțare unilaterală; (d) prin reziliere; (e) prin pieirea produselor.'))
X.append(P('12.2. **Denunțarea.** Oricare Parte poate denunța contractul printr-o notificare scrisă trimisă cu cel puțin 14 zile înainte. Termenul se scurtează dacă Beneficiarul aduce produsele la depozitul Prestatorului. Ultima factură se calculează pe zilele până la returnare, cu respectarea chiriei minime de la art. 3.2.'))
X.append(P('12.3. **Rezilierea de drept (pact comisoriu).** Contractul este reziliat de drept, fără punere în întârziere și fără intervenția instanței, printr-o simplă notificare a Prestatorului, dacă Beneficiarul: (a) nu plătește o factură în 15 zile de la scadență; (b) mută produsele fără acordul scris al Prestatorului sau nu spune unde le-a mutat; (c) subînchiriază, cedează sau înstrăinează produsele; (d) folosește produsele în alt scop sau le modifică; (e) intră în insolvență, dizolvare sau lichidare; (f) abandonează produsele sau își încetează activitatea în locul amplasării.'))
X.append(P('12.4. **Rezilierea pentru alte încălcări.** Pentru orice altă încălcare, Partea afectată notifică în scris cealaltă Parte și îi dă 10 zile pentru remediere. Dacă încălcarea nu e remediată, contractul poate fi reziliat printr-o declarație unilaterală de reziliere.'))
X.append(P('12.5. **Efectele încetării.** La orice încetare: (a) Beneficiarul returnează produsele conform art. 9; (b) chiria curge până la returnare; (c) sumele datorate se plătesc în cel mult 30 de zile. La rezilierea din culpa Beneficiarului, acesta plătește, cu titlu de daune-interese, și echivalentul unei chirii lunare.'))
X.append(H('Art. 13. Forța majoră'))
X.append(P('13.1. Nicio Parte nu răspunde pentru neexecutarea cauzată de forța majoră, adică un eveniment extern, imprevizibil, absolut invincibil și inevitabil.'))
X.append(P('13.2. Partea care invocă forța majoră o anunță celeilalte în 5 zile și ia măsuri pentru limitarea efectelor. Dacă evenimentul durează mai mult de 30 de zile, oricare Parte poate înceta contractul prin notificare, fără daune-interese.'))
X.append(P('13.3. Forța majoră nu scutește de plata chiriei pentru perioada în care produsele rămân la Beneficiar și nici de obligațiile scadente înainte de eveniment.'))
X.append(H('Art. 14. Impreviziunea'))
X.append(P('Părțile își asumă riscul schimbării împrejurărilor în care s-a încheiat contractul și renunță la dreptul de a cere instanței adaptarea sau încetarea lui pe acest temei (art. 1271 alin. (3) lit. c) Cod civil).'))
X.append(H('Art. 15. Confidențialitatea și datele personale'))
X.append(P('15.1. Informațiile primite în legătură cu contractul sunt confidențiale. Ele pot fi comunicate doar angajaților și colaboratorilor care au nevoie de ele pentru executarea contractului, autorităților, auditorilor și consultanților, în limitele legii.'))
X.append(P('15.2. Datele personale ale reprezentanților și persoanelor de contact se prelucrează numai pentru executarea contractului, facturare, evidența contabilă și recuperarea creanțelor, conform Regulamentului (UE) 2016/679. Ele se păstrează pe durata contractului și apoi cât cere legea pentru documentele contabile.'))
X.append(H('Art. 16. Notificările'))
X.append(P('16.1. Notificările se fac în scris, prin e-mail, scrisoare recomandată cu confirmare de primire, curier sau predare sub semnătură, la adresele de mai jos. Facturile se transmit prin RO e-Factura.',keep=True))
W3=[1900,3800,3900]
X.append(TBL([[TC('',W3[0],True),TC('PRESTATOR',W3[1],True,True,'center'),TC('BENEFICIAR',W3[2],True,True,'center')],
              [TC('Adresa',W3[0],bold=True),TC('Hunedoara, Peștișu Mare, Nr. 1',W3[1]),TC('{notif_adresa}',W3[2])],
              [TC('Telefon',W3[0],bold=True),TC('0735 214 751',W3[1]),TC('{notif_tel}',W3[2])],
              [TC('E-mail',W3[0],bold=True),TC('hunedoara@eurowc.ro',W3[1]),TC('{notif_email}',W3[2])],
              [TC('În atenția',W3[0],bold=True),TC('Anitoiu Ovidiu',W3[1],bold=True),TC('{notif_atentie}',W3[2],bold=True)]],W3))
X.append(P('16.2. Partea care își schimbă adresa anunță cealaltă Parte în scris. Până atunci, notificarea trimisă la vechea adresă este valabilă.',before=60))
X.append(H('Art. 17. Clauze acceptate expres'))
X.append(P('Beneficiarul declară că a citit și acceptă în mod expres, în sensul art. 1203 Cod civil, următoarele clauze: art. 3.3 (prelungirea tacită), art. 4.4 și 4.5 (refuzul operațiunilor nesigure și facturarea lor), art. 4.6 (procesul-verbal întocmit doar de Prestator), art. 5.3 (acceptarea facturii necontestate), art. 5.4 (penalitățile), art. 5.5 (suspendarea serviciilor), art. 8.1 (răspunderea Beneficiarului, inclusiv pentru caz fortuit), art. 9.3 (accesul pentru ridicare), art. 10.2 (cesiunea de către Prestator), art. 12.3 și 12.4 (rezilierea fără instanță), art. 14 (impreviziunea) și art. 18.1 (instanța competentă).',keep=True))
X.append(P('Beneficiar: **{reprezentant}**   —   semnătura: ______________________',before=80,after=80))
X.append(H('Art. 18. Litigii și dispoziții finale'))
X.append(P('18.1. Neînțelegerile se rezolvă mai întâi pe cale amiabilă. Dacă nu se rezolvă în 30 de zile, sunt de competența instanțelor de la sediul Prestatorului (județul Harghita). Se aplică legea română.'))
X.append(P('18.2. Costurile recuperării creanțelor și produselor (taxe, onorarii, executare) sunt suportate de Beneficiar, în limitele legii.'))
X.append(P('18.3. Contractul se modifică doar în scris, prin act adițional sau anexă. El înlocuiește orice înțelegere anterioară privind același obiect.'))
X.append(P('18.4. Dacă o clauză este nulă, celelalte rămân valabile, iar Părțile o înlocuiesc cu o clauză valabilă cât mai apropiată de intenția lor.'))
X.append(P('18.5. Drepturile și obligațiile din contract trec asupra succesorilor Părților.'))
X.append(P('18.6. Contractul s-a încheiat la data de **{contract_data}**, în 2 exemplare originale, câte unul pentru fiecare Parte.'))
X.append(P('18.7. {anexe_text}',jc='left',keep=True))
W2=[4800,4800]
X.append(P('',after=60))
X.append(TBL([[TC('PRESTATOR',W2[0],True,True,'center'),TC('BENEFICIAR',W2[1],True,True,'center')],
              [TC('SC EURO ECOLOGIC SRL',W2[0],bold=True),TC('{client}',W2[1],bold=True)],
              [TC(['Nume: Irina Gyorgy','Funcție: Administrator'],W2[0]),
               TC(['Nume: {reprezentant}','Funcție: {reprezentant_functie}','{#semnatari}','Nume: {nume}','Funcție: {functie}','{/semnatari}'],W2[1])],
              [TC(['Semnătura:','',''],W2[0]),TC(['Semnătura:','',''],W2[1])]],W2))
X.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
b=x.index('<w:body>')+len('<w:body>'); a=x.index('<w:p><w:r><w:t xml:space="preserve">{#anexe}')
x2=x[:b]+''.join(X)+x[a:]
for k in ['{contract_nr}','{#benef}','{declaratie}','{obiect}','{durata}','{data_start}','{garantie_a}','{#daune}','{notif_adresa}','{notif_email}','{anexe_text}','{#semnatari}','{#anexe}','{pv_tip}','{#produse}']:
    assert k in x2, k
zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
for it in z.infolist():
    zo.writestr(it, x2.encode('utf-8') if it.filename=='word/document.xml' else z.read(it.filename))
zo.close(); print('ok')
