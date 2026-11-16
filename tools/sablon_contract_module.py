# v9.01 (cerut de Ovidiu, 16.11): contractele pe MODULE — articolele 2..(notificari) si cele de dupa notificari nu mai sunt text fix in model,
# ci bucle docxtemplater ({#arts_a} / {#arts_b} / {#arts_c}) umplute din aplicatie (clauze generale + felul contractului + modulele produselor).
# Tabelul de daune ramane in model, conditionat ({#are_daune}); procesul-verbal de la final, conditionat ({#are_pv}).
# Pornire: modele/contract_pj.docx si modele/contract_pf.docx (v8.43 / v8.84). Ruleaza o singura data: python tools/sablon_contract_module.py
import re, sys, zipfile, shutil, os
sys.path.insert(0, os.path.dirname(__file__))

def split_els(x):
    a = x.index('<w:body>') + 8; b = x.rindex('</w:body>'); body = x[a:b]; els = []; i = 0
    top = re.compile(r'<(w:p|w:tbl|w:sdt|w:sectPr|w:bookmarkStart|w:bookmarkEnd)\b')
    while i < len(body):
        m = top.search(body, i)
        if not m: break
        tag = m.group(1); s = m.start(); j = None
        if body[s:body.index('>', s) + 1].endswith('/>'): j = body.index('>', s) + 1
        else:
            depth = 0; pat = re.compile(r'<(/?)%s(?=[\s>/])([^>]*)>' % tag)
            for mm in pat.finditer(body, s):
                if mm.group(1) == '/': depth -= 1
                elif not mm.group(2).endswith('/'): depth += 1
                if depth == 0: j = mm.end(); break
        els.append((tag, body[s:j])); i = j
    return x[:a], els, x[b:]

tx = lambda e: ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', e))
def cu_text(p, t):   # paragraful p, cu un singur run (rPr-ul primului run) si textul t
    ppr = (re.search(r'<w:pPr>.*?</w:pPr>', p, re.S) or [''])[0] if re.search(r'<w:pPr>.*?</w:pPr>', p, re.S) else ''
    rpr = re.search(r'<w:rPr>.*?</w:rPr>', p[len(ppr):] if ppr else p, re.S); rpr = rpr.group(0) if rpr else ''
    return '<w:p>' + ppr + '<w:r>' + rpr + '<w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>'
def bold_num(p, nr, t):   # numarul paragrafului ingrosat + textul
    ppr = re.search(r'<w:pPr>.*?</w:pPr>', p, re.S).group(0); rpr = re.search(r'<w:rPr>.*?</w:rPr>', p[len(ppr):], re.S).group(0)
    rb = rpr.replace('<w:color', '<w:b/><w:bCs/><w:color')
    return '<w:p>' + ppr + '<w:r>' + rb + '<w:t xml:space="preserve">' + nr + '</w:t></w:r><w:r>' + rpr + '<w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>'

def bucla(nume, ptitlu, ppar):
    titlu = cu_text(ptitlu, 'Art. {nr}. {titlu}').replace('<w:spacing w:before="0"', '<w:spacing w:before="100"')
    return [cu_text(ppar, '{#' + nume + '}'), titlu, cu_text(ppar, '{#pars}'), bold_num(ppar, '{nr} ', '{t}'), cu_text(ppar, '{/pars}'), cu_text(ppar, '{/' + nume + '}')]

def fa(cale):
    z = zipfile.ZipFile(cale); x = z.read('word/document.xml').decode('utf8'); h, els, t = split_els(x)
    T = [tx(e) for _, e in els]
    i0 = next(k for k, s in enumerate(T) if s.startswith('Art. 2.'))
    p_tit, p_par = els[i0][1], els[i0 + 1][1]
    i_tab = next(k for k, s in enumerate(T) if s.startswith('Tabel nr. 1'))
    i_notif = next(k for k, s in enumerate(T) if re.match(r'Art\. \d+\. Notificarile', s))
    n0 = re.match(r'Art\. (\d+)\.', T[i_notif]).group(1)
    tab_titlu, tab = els[i_tab][1], els[i_tab + 1][1]
    nou = bucla('arts_a', p_tit, p_par) + [cu_text(p_par, '{#are_daune}'), tab_titlu, tab, cu_text(p_par, '{/are_daune}')] + bucla('arts_b', p_tit, p_par)
    # notificarile: numarul articolului devine {n_notif}
    notif = [cu_text(els[i_notif][1], 'Art. {n_notif}. Notificarile')]
    k = i_notif + 1
    while els[k][0] == 'w:p': notif.append(cu_text(els[k][1], re.sub(r'^' + n0 + r'\.', '{n_notif}.', T[k]))); k += 1
    notif.append(els[k][1]); k += 1        # tabelul cu adresele
    # paragraful „Partea care isi schimba adresa…” ramane; restul pana la tabelul de semnaturi devine bucla arts_c
    p2 = els[k][1]; notif.append(cu_text(p2, re.sub(r'^' + n0 + r'\.2\.', '{n_notif}.2.', T[k]))); k += 1
    while els[k][0] == 'w:p': k += 1
    nou += notif + bucla('arts_c', p_tit, p_par)
    E = [e for _, e in els[:i0]] + nou + [e for _, e in els[k:]]
    # titlul contractului
    E[0] = cu_text(E[0], '{titlu_ctr}')
    # procesul-verbal de la final: doar unde exista produse livrate ({#are_pv})
    TT = [tx(e) for e in E]
    ip = next(j for j, s in enumerate(TT) if s == 'Proces Verbal'); ip0 = ip - 1      # paragraful cu saltul de pagina
    isg = next(j for j in range(ip, len(E)) if E[j].startswith('<w:tbl') and 'PRESTATOR' in TT[j])
    E = E[:ip0] + [cu_text(p_par, '{#are_pv}')] + E[ip0:isg + 1] + [cu_text(p_par, '{/are_pv}')] + E[isg + 1:]
    x2 = h + ''.join(E) + t
    tmp = cale + '.tmp'
    with zipfile.ZipFile(cale) as zi, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zo:
        for it in zi.infolist(): zo.writestr(it, x2 if it.filename == 'word/document.xml' else zi.read(it.filename))
    shutil.move(tmp, cale); print('ok', cale, 'notif era', n0)

if __name__ == '__main__':
    for c in sys.argv[1:] or ['modele/contract_pj.docx', 'modele/contract_pf.docx']: fa(c)
