# v8.62 (cerut de Ovidiu, 13.11): forma PV-ului din modelele Word (anexa_pv.docx, contract_pj.docx)
#  - logo nou în subsol (modele-originale/logo_ee.png, fundal transparent) în locul celui vechi
#  - rândul punctului de lucru: „P.L. Hunedoara | Sat Pestisul Mare, Nr 1, Jud. HD | hunedoara@eurowc.ro | 0735 214 762”
#  - titlul pe două rânduri: „Proces Verbal” (16, bold) + {pv_tip} (14, bold), fără subliniere
#  - „Anexa Nr: … din Data: …” bold; „la Contract : …” normal; „In data de {data_op} se {pv_verb} …” cu data și verbul bold
# Folosire: python3 tools/pv_format.py modele/anexa_pv.docx  (se poate rula de mai multe ori, nu strică)
import sys, re, zipfile, shutil, os, struct
SRC = sys.argv[1]; LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "modele-originale", "logo_ee.png")
z = zipfile.ZipFile(SRC); fis = {n: z.read(n) for n in z.namelist()}; z.close()
RF = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
def run(t, b=False, sz=None):
    r = RF + ("<w:b/><w:bCs/>" if b else "") + (f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>' if sz else "")
    return f'<w:r><w:rPr>{r}</w:rPr><w:t xml:space="preserve">{t}</w:t></w:r>'
def paragrafe(x): return [(m.start(), m.end()) for m in re.finditer(r"<w:p[ >](?:(?!<w:p[ >]).)*?</w:p>", x, re.S)]
def inlocuieste_p(x, text, f):
    for a, b in reversed(paragrafe(x)):
        p = x[a:b]
        if text in "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)): x = x[:a] + f(p) + x[b:]
    return x
ppr = lambda p: (re.search(r"<w:pPr>.*?</w:pPr>", p, re.S) or [""])[0]
popen = lambda p: re.match(r"<w:p[^>]*>", p).group(0)
# --- document ---
d = fis["word/document.xml"].decode("utf8")
def titlu(p):
    pp = re.sub(r"<w:u [^>]*/>", "", ppr(p)); pp = re.sub(r'<w:ind [^>]*/>', "", pp)
    return f'<w:p>{pp}{run("Proces Verbal", True, 32)}</w:p><w:p>{pp}{run("{pv_tip}", True, 28)}</w:p>'
d = inlocuieste_p(d, "PROCES VERBAL de : {pv_tip}", titlu)
d = inlocuieste_p(d, "Anexa Nr: {anexa_nr} din Data: {anexa_data}", lambda p: f'{popen(p)}{ppr(p)}{run("Anexa Nr: {anexa_nr} din Data: {anexa_data}", True)}</w:p>')
d = inlocuieste_p(d, "la Contract : {contract_nr} din {contract_data}", lambda p: f'{popen(p)}{ppr(p)}{run("la Contract : {contract_nr} din {contract_data}")}</w:p>')
d = inlocuieste_p(d, "In data de {data_op} se {pv_verb} urmatoarele produse :", lambda p: popen(p) + ppr(p) + run("In data de ") + run("{data_op}", True) + run(" se ") + run("{pv_verb}", True) + run(" urmatoarele produse :") + "</w:p>")
fis["word/document.xml"] = d.encode("utf8")
# --- subsol ---
for n in [k for k in fis if re.match(r"word/footer\d*\.xml$", k)]:
    f = fis[n].decode("utf8")
    f = inlocuieste_p(f, "Hunedoara", lambda p: popen(p) + ppr(p) + run("             ", True, 20).replace("<w:b/><w:bCs/>", "<w:b/><w:bCs/>") +
        run("P.L. Hunedoara", True, 20) + run(" | Sat Pestisul Mare, Nr 1, Jud. HD | hunedoara@eurowc.ro | ", False, 20) + run("0735 214 762", True, 20) + "</w:p>"
        if "eurowc.ro" in p and "Sediu" not in p else p)
    rel = fis.get(n.replace("word/", "word/_rels/") + ".rels", b"").decode("utf8")
    for rid, tgt in re.findall(r'Id="(rId\d+)"[^>]*Target="(media/[^"]+)"', rel):
        if f"r:embed=\"{rid}\"" not in f: continue
        png = open(LOGO, "rb").read(); w, h = struct.unpack(">II", png[16:24]); H = 500000; W = round(H * w / h)   # ~1,3 cm înălțime, cât cele 3 rânduri de text
        fis["word/" + tgt] = png
        f = re.sub(r'(<wp:extent cx=")\d+(" cy=")\d+(")', rf"\g<1>{W}\g<2>{H}\g<3>", f, count=1)
        f = re.sub(r'(<a:ext cx=")\d+(" cy=")\d+(")', rf"\g<1>{W}\g<2>{H}\g<3>", f, count=1)
        f = re.sub(r'(<wp:positionV relativeFrom="paragraph"><wp:posOffset>)-?\d+(</wp:posOffset>)', r"\g<1>90000\g<2>", f, count=1)
        f = re.sub(r'(<wp:positionH relativeFrom="column"><wp:posOffset>)-?\d+(</wp:posOffset>)', r"\g<1>-260000\g<2>", f, count=1)
    fis[n] = f.encode("utf8")
tmp = SRC + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as o:
    for n, b in fis.items(): o.writestr(n, b)
shutil.move(tmp, SRC); print("ok", SRC)
