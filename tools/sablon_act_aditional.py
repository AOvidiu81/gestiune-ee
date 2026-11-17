# v9.06: modelul ACTULUI ADIȚIONAL DE PRELUNGIRE (modele/act_aditional_pj.docx / _pf.docx), făcut din modelele de contract
# (același antet / subsol, aceleași fonturi): titlu, părțile (Art. 1 din contract), articolele {#arts_a}, tabelul anexelor
# active la data actului {#loc}, articolele {#arts_b} și chenarul de semnături. Rulare: python3 sablon_act_aditional.py <contract_pj.docx> <contract_pf.docx> <folder_iesire>
import sys, zipfile, copy, os
from lxml import etree
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"; w = lambda t: "{%s}%s" % (W, t)
RPR = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>%s<w:color w:val="000000"/><w:sz w:val="%d"/><w:szCs w:val="%d"/><w:lang w:val="ro-RO"/></w:rPr>'
def run(t, b=False, sz=18): return '<w:r>' + RPR % ('<w:b/><w:bCs/>' if b else '', sz, sz) + '<w:t xml:space="preserve">' + t.replace("&", "&amp;").replace("<", "&lt;") + '</w:t></w:r>'
def para(runs, jc="both", after=0, before=0, keep=False):
    x = '<w:p xmlns:w="%s"><w:pPr><w:pStyle w:val="Frspaiere"/><w:spacing w:before="%d" w:after="%d" w:line="240" w:lineRule="auto"/>%s<w:jc w:val="%s"/></w:pPr>%s</w:p>' % (W, before, after, '<w:keepNext/>' if keep else '', jc, "".join(runs))
    return etree.fromstring(x)
def cell(wd, runs, jc="left", shade=False):
    return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>%s<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Frspaiere"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="%s"/></w:pPr>%s</w:p></w:tc>'
            % (wd, '<w:shd w:val="clear" w:color="auto" w:fill="E7EEF7"/>' if shade else '', jc, "".join(runs)))
def tabel():
    L = [500, 1500, 3200, 2600, 1800]
    cap = ["Nr.", "Anexa", "Locatia / amplasamentul", "Produse active (buc)", "Pret / zi / buc"]
    hdr = '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' + "".join(cell(L[i], [run(c, True, 16)], "center", True) for i, c in enumerate(cap)) + '</w:tr>'
    val = ["{#loc}{nr}", "{anexa}", "{locatie}", "{produse}", "{pret}{/loc}"]
    rnd = '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + "".join(cell(L[i], [run(v, i == 3, 16)], "center" if i in (0, 1) else "left") for i, v in enumerate(val)) + '</w:tr>'
    b = "".join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="000000"/>' % s for s in ["top", "left", "bottom", "right", "insideH", "insideV"])
    x = ('<w:tbl xmlns:w="%s"><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>%s</w:tblBorders><w:tblLayout w:type="fixed"/>'
         '<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
         '<w:tblGrid>%s</w:tblGrid>%s%s</w:tbl>') % (W, b, "".join('<w:gridCol w:w="%d"/>' % v for v in L), hdr, rnd)
    return etree.fromstring(x)
def txt(el): return "".join(el.itertext())
def fa(src, dst, pf):
    z = zipfile.ZipFile(src); x = etree.fromstring(z.read("word/document.xml")); b = x.find(w("body")); E = list(b)
    i_art1 = next(i for i, e in enumerate(E) if txt(e).startswith("Art. 1. Partile"))
    i_imp = next(i for i, e in enumerate(E) if txt(e).startswith("denumite impreuna"))
    i_a0 = next(i for i, e in enumerate(E) if txt(e) == "{#arts_a}"); i_a1 = next(i for i, e in enumerate(E) if txt(e) == "{/arts_a}")
    i_sem = next(i for i, e in enumerate(E) if e.tag == w("tbl") and txt(e).startswith("PRESTATORBENEFICIARSC EURO"))
    sect = E[-1]
    arts = [copy.deepcopy(e) for e in E[i_a0:i_a1 + 1]]
    def ren(L, a, bb):
        L = [copy.deepcopy(e) for e in L]
        for e in L:
            for t in e.iter(w("t")):
                t.text = t.text.replace("{#arts_a}", "{#" + a + "}").replace("{/arts_a}", "{/" + a + "}")
        return L
    imp = copy.deepcopy(E[i_imp])
    for t in imp.iter(w("t")): t.text = ""
    imp.findall(".//" + w("t"))[0].text = 'denumite impreuna "Partile", au convenit incheierea prezentului act aditional la contract, dupa cum urmeaza:'
    nou = [para([run("ACT ADITIONAL NR. {aa_nr}", True, 24)], "center", 20),
           para([run("din data de "), run("{aa_data}", True), run(", la Contractul nr. "), run("{contract_nr}", True), run(" din "), run("{contract_data}", True)], "center", 120)]
    nou += [copy.deepcopy(e) for e in E[i_art1:i_imp]] + [imp]
    nou += ren(arts, "arts_a", 0)
    nou += [para([run("{tabel_titlu}", True)], "center", 40, 60, True), tabel(), para([run("{tabel_nota}", False, 16)], "both", 60, 40)]
    nou += ren(arts, "arts_b", 0)
    nou += [para([run("")], "both", 120), copy.deepcopy(E[i_sem]), sect]
    for e in list(b): b.remove(e)
    for e in nou: b.append(e)
    out = zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        out.writestr(it, etree.tostring(x, xml_declaration=True, encoding="UTF-8", standalone=True) if it.filename == "word/document.xml" else z.read(it.filename))
    out.close(); print("ok", dst)
fa(sys.argv[1], os.path.join(sys.argv[3], "act_aditional_pj.docx"), False)
fa(sys.argv[2], os.path.join(sys.argv[3], "act_aditional_pf.docx"), True)
