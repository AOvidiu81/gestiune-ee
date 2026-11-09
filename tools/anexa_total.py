# v8.50 (cerut de Ovidiu, 09.11): la anexele de SUPLIMENTARE / REDUCERE, rând explicativ la finalul tabelului anexei:
# „Incepind cu data de <data>, in locatia " <locatia> " vor fi: <N Produse [ Toaleta Clasic ]>”. Rândul există doar când
# aplicația trimite `tot` (bucla {-w:tr tot}… = tot rândul dispare la amplasare / în contract). Modifică fișierele pe loc.
# Folosire (după celelalte scripturi): python3 tools/anexa_total.py modele/anexa_pv.docx modele/contract_pj.docx
import re,sys,zipfile,os
R=lambda t,b=False:('<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'+('<w:b/><w:bCs/>' if b else '')+
    '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ro-RO"/></w:rPr><w:t xml:space="preserve">'+t+'</w:t></w:r>')
RAND=('<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="9371" w:type="dxa"/><w:gridSpan w:val="2"/>'
      '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders><w:vAlign w:val="center"/></w:tcPr>'
      '<w:p><w:pPr><w:pStyle w:val="Frspaiere"/><w:spacing w:before="60" w:after="60"/><w:ind w:firstLine="320"/></w:pPr>'
      +R('{-w:tr tot}Incepind cu data de ')+R('{tot_data}',True)+R(', in locatia " ')+R('{tot_loc}',True)+R(' " vor fi: ')+R('{tot_prod}{/tot}',True)+
      '</w:p></w:tc></w:tr>')
for f in sys.argv[1:]:
    z=zipfile.ZipFile(f); tmp=f+'.tmp'; zo=zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED); n=0
    for it in z.infolist():
        d=z.read(it.filename)
        if it.filename=='word/document.xml':
            x=d.decode('utf-8')
            def adauga(m):
                global n
                t=m.group(0)
                if '{#randuri}' not in t or '{tot_data}' in t: return t
                n+=1; i=t.rindex('</w:tr>')+len('</w:tr>'); return t[:i]+RAND+t[i:]
            x=re.sub(r'<w:tbl>.*?</w:tbl>',adauga,x,flags=re.S); d=x.encode('utf-8')
        zo.writestr(it,d)
    zo.close(); z.close(); os.replace(tmp,f); print(f,'tabele de anexă cu rândul explicativ:',n)
