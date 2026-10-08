// whatsapp-import.js — import rapid al unei comenzi copiate din WhatsApp:
// extrage din textul liber (client, adresa, persoana de contact, contract,
// produs) si pre-completeaza formularul, tolerant la variatii de format
// (etichete cu/fara punct, cu/fara ":", ordine diferita).

import { el } from './utils.js';
import { openModal, textAreaField } from './components.js';

// WhatsApp foloseste *bold*, _italic_ si ~tăiat~ ca marcaje simple in jurul
// cuvintelor/frazelor — cand soferul copiaza un mesaj formatat (fie doar
// valoarea, fie linia intreaga, eticheta inclusiv: "*NUME CL*: *valoare*"),
// aceste caractere ajung altfel in campurile formularului (si pe documentul
// final). Datele procesate aici (nume, adrese, telefoane) nu contin
// niciodata legitim aceste caractere, asa ca le eliminam peste tot in linie,
// nu doar la capete — altfel o eticheta ingrosata integral tot ramane
// nerecunoscuta de regex-ul de etichete.
function stripWaFormatting(value) {
  return String(value || '')
    .replace(/[*_~]+/g, '')
    .trim();
}

function matchLabel(lines, labelPattern) {
  // \b dupa eticheta (s27): "Telega" sau "Depou" nu mai sunt luate drept TEL / DEP
  const re = new RegExp(`^\\s*(?:${labelPattern})\\b\\s*\\.?\\s*:?\\s*[:\\-]?\\s*(.+)$`, 'i');
  for (const line of lines) {
    const m = re.exec(line);
    if (m && m[1] && m[1].trim()) return stripWaFormatting(m[1]);
  }
  return '';
}

// ---------------------------------------------------------------------
// Adresa (Judet/Localitate/Strada) — spre deosebire de celelalte campuri
// (NUME CL, TEL, CTR etc.), care apar mereu pe o singura linie cu o
// eticheta fixa, adresa vine de obicei pe mai multe linii consecutive, iar
// eticheta fiecarei linii variaza destul de mult intre comenzi (JUD/LOC/STR,
// dar si COMUNA/SAT/ORAS/CARTIER, sau uneori fara nicio eticheta deloc —
// doar textul liber). Daca am cauta doar JUD/LOC/STR ca mai sus, orice
// varianta care nu respecta exact acel format se pierde complet.
//
// In loc sa incercam sa recunoastem fiecare eticheta posibila, luam TOT
// blocul de linii dintre "NUME CL" si urmatoarea eticheta cunoscuta
// (PERS. RES / TEL / CTR / SERVISARE / DEP) — indiferent cum e eticheta
// fiecarei linii din acel bloc — si le unim pe toate. Astfel, chiar si o
// linie complet nerecunoscuta ("SAT ...", "vis-a-vis de Primarie" etc.)
// ajunge in adresa, nu se mai pierde niciodata.
const ADDRESS_LINE_PATTERNS = [
  // Judet — pastram prefixul "Jud. XX", ca pe formular
  { re: /^\s*JUD(?:ET)?\b\s*\.?\s*:?\s*[:\-]?\s*(.+)$/i, format: (v) => `Jud. ${v.trim().toUpperCase()}` },
  // Localitate / oras / comuna / sat — toate sunt aceeasi pozitie in
  // adresa, doar denumiri diferite ale aceleiasi etichete
  { re: /^\s*(?:LOC(?:ALITATE)?|ORAS|COMUNA|SAT)\b\s*\.?\s*:?\s*[:\-]?\s*(.+)$/i, format: (v) => v.trim() },
  // Strada — pastram "Str." (s27; inainte se pierdea), cartier / zona raman cu eticheta lor
  { re: /^\s*STR(?:ADA)?\b\s*\.?\s*:?\s*[:\-]?\s*(.+)$/i, format: (v) => `Str. ${v.trim()}` },
  { re: /^\s*((?:CARTIER|ZONA)\b.*)$/i, format: (v) => v.trim().replace(/\s*:\s*/, ' ').replace(/\s+/g, ' ') },
];

function formatAddressLine(line) {
  for (const { re, format } of ADDRESS_LINE_PATTERNS) {
    const m = re.exec(line);
    if (m && m[1] && m[1].trim()) return format(m[1]);
  }
  // eticheta nerecunoscuta (sau fara eticheta) -> pastram linia intreaga
  // asa cum e, ca nimic din blocul de adresa sa nu se piarda
  return line.trim();
}

const CLIENT_LABEL_RE = /^\s*NUME\s*CL(?:IENT)?\s*\.?\s*:?/i;
// s27: si randurile noi din comanda GestiuneEE (ACC, SERII, DATA, TRANSPORT, OBS, ROG PV, Multumesc) inchid adresa
const OTHER_LABEL_RE = /^\s*(?:PERS\.?\s*RES(?:PONSABILA)?|RESPONSABIL|TEL(?:EFON)?|CTR|CONTRACT|SERVISARE|DEP(?:OZIT)?|ACC|SERII?|DATA|TRANSPORT|OBS|ROG|MULTUMESC)\b\s*\.?\s*:?/i;
// Prima linie a comenzii e de obicei tipul de PV + data ("AMPLASARE
// 15/09/2026") — daca nu exista deloc "NUME CL" in text, nu vrem sa
// inghitim din greseala aceasta linie in blocul de adresa.
const HEADER_LINE_RE = /^\s*(?:AMPLASARE|RIDICARE|SERVISARE|LIPSA\s*ACCES|VANZARE)\b/i;
// s27: primul rand e antet si cand e alt tip de comanda (REDUCERE, SUPLIMENTARE, EVENIMENT…):
// are o data ("lun/12/10/2026") si nu are ":".
const eAntet = (l) => HEADER_LINE_RE.test(l || '') || (/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(l || '') && !String(l).includes(':'));

function extractAddressBlock(lines) {
  let start = eAntet(lines[0]) ? 1 : 0;
  const clientIdx = lines.findIndex((l) => CLIENT_LABEL_RE.test(l));
  if (clientIdx >= start) start = clientIdx + 1;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (OTHER_LABEL_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start, end)
    .map(formatAddressLine)
    .filter(Boolean)
    .join(', ');
}

// ---------------------------------------------------------------------
// Formatul comenzii generate din GestiuneEE (butonul "Salvează și generează"):
//   COMANDĂ AMPLASARE — 30-09-2026
//   Client: ACOMIN-TEST
//   Contract: 00001 HD-TEST din 30-09-2026  ·  ANEXA NR 1
//   Produs: 1 buc TOALETA CLASIC
//   Accesorii: LAVOAR INTERIOR
//   Locație: HD, test 1 HUNEDOARA, STR TEST 1
//   Se livrează din depozitul: HUNEDOARA
//   Responsabil șantier: pers 1  ·  0711
//   Servisare: 1 / Sap, ziua LUNI
// Etichetele se compara fara diacritice, ca sa mearga si daca WhatsApp le strica.
const faraDiacritice = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function isGestiuneFormat(lines) {
  return (
    /^COMANDA\s/i.test(faraDiacritice(lines[0] || '')) ||
    lines.some((l) => /^\s*Client\s*:/i.test(faraDiacritice(l)))
  );
}

function valoareDupa(lines, eticheta) {
  const re = new RegExp(`^\\s*(?:${eticheta})\\s*:\\s*(.*)$`, 'i');
  for (const line of lines) {
    const m = re.exec(faraDiacritice(line));
    // luam valoarea din linia originala (cu diacritice), de la aceeasi pozitie
    if (m) return line.slice(line.length - m[1].length).trim();
  }
  return '';
}

function parseGestiuneOrder(lines) {
  const clientName = valoareDupa(lines, 'Client');
  const ctr = valoareDupa(lines, 'Contract');
  const servisare = valoareDupa(lines, 'Servisare');
  const dep = valoareDupa(lines, 'Se livreaza din depozitul|Depozit');

  // Locatia: "HD, Loc, Strada" -> "Jud. HD, Loc, Strada" (ca in formatul vechi)
  const loc = valoareDupa(lines, 'Locatie|Locatia');
  const parti = loc.split(',').map((x) => x.trim()).filter(Boolean);
  if (parti.length && /^[A-Za-z]{1,3}$/.test(parti[0])) parti[0] = `Jud. ${parti[0].toUpperCase()}`;
  const address = parti.join(', ');

  // Responsabil: "pers 1  ·  0711" (numele si telefonul pe aceeasi linie)
  const resp = valoareDupa(lines, 'Responsabil santier|Responsabil|Pers\\.?\\s*res(?:ponsabila)?');
  let persRes = resp;
  let tel = valoareDupa(lines, 'Tel(?:efon)?');
  const bucati = resp.split(/\s*[·•|]\s*/).filter(Boolean);
  if (bucati.length > 1) {
    const iTel = bucati.findIndex((x) => /^[+\d][\d\s.\-/]{2,}$/.test(x));
    if (iTel >= 0) {
      if (!tel) tel = bucati[iTel];
      bucati.splice(iTel, 1);
    }
    persRes = bucati.join(' ');
  }

  // Produs: "1 buc TOALETA CLASIC"
  let productQty = 0;
  let productText = '';
  const prod = valoareDupa(lines, 'Produs');
  const mp = /^(-?\d{1,4})\s*(?:buc\.?|bucati|bucăți)?\s+(.+)$/i.exec(prod);
  if (mp) {
    productQty = Math.abs(parseInt(mp[1], 10));
    productText = mp[2].trim();
  } else if (prod) {
    productText = prod;
  }

  const aux = listaAcc(valoareDupa(lines, 'Accesorii'));
  return { clientName, address, persRes, tel, ctr, servisare, dep, productQty, productText, aux };
}

// s29: comanda de SUPLIMENTARE / REDUCERE / EVENIMENT se face pe PV de AMPLASARE / RIDICARE;
// pe PV, la "Mentiuni", apare tipul comenzii + anexa (ex. "SUPLIMENTARE - ANEXA NR 1-S1").
export function mentiuneTip(antet, ctr) {
  const tip = (faraDiacritice(antet).toUpperCase().match(/^\s*(SUPLIMENTARE|REDUCERE|EVENIMENT-?[AR]?)\b/) || [])[1] || '';
  if (!tip) return '';
  const anexa = String(ctr || '').split(/\s*[·•]\s*/).slice(1).join(' ').trim();
  return tip + (anexa ? ' - ' + anexa : '');
}

// s28: "DOZATOR SAPUN, L.I." -> ["DOZATOR SAPUN", "L.I."] (potrivirea cu lista modelului se face in formular)
export function listaAcc(v) {
  return String(v || '').split(/[,;+]/).map((x) => stripWaFormatting(x)).filter(Boolean);
}

// "SERII  :  ARMAL E-1, E-2; MONDO E-3" (cum le scrie GestiuneEE) -> ["E-1","E-2","E-3"].
// Primul element din fiecare grup are modelul in fata; "fara serie" nu se ia; "EE-" se scoate
// (campul din PV il are deja), la fel ca la "Creeaza PV" din Comenzi.
function parseSerii(v) {
  const out = [];
  String(v || '').split(';').forEach((g) => {
    g.split(',').map((x) => x.trim()).filter(Boolean).forEach((s, i) => {
      if (/f[aă]r[aă]\s*serie/i.test(faraDiacritice(s))) return;
      if (i === 0) { const w = s.split(/\s+/); s = w[w.length - 1]; }
      s = s.replace(/^EE-?\s*/i, '').trim();
      if (s) out.push(s);
    });
  });
  return out;
}

/** Extrage campurile cunoscute dintr-un text liber de tip comanda WhatsApp.
 * Intoarce un obiect cu proprietati goale ("") pentru ce nu s-a gasit —
 * apelantul decide ce campuri suprascrie in formular. */
export function parseWhatsAppOrderText(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((l) => stripWaFormatting(l))
    .filter(Boolean);

  // Comanda scrisa de GestiuneEE ("COMANDĂ AMPLASARE — ...", "Client: ...") are alt
  // format decat cea veche din Excel ("NUME CL: ..."), asa ca o citim separat.
  if (isGestiuneFormat(lines)) return parseGestiuneOrder(lines);

  // antetul ("SERVISARE    lun/12/10/2026") nu e eticheta — altfel la o comanda de
  // SERVISARE campul Servisare primea data (s27)
  const corp = eAntet(lines[0]) ? lines.slice(1) : lines;
  const clientName = matchLabel(corp, 'NUME\\s*CL(?:IENT)?');
  const address = extractAddressBlock(lines);
  const persRes = matchLabel(corp, 'PERS\\.?\\s*RES(?:PONSABILA)?|RESPONSABIL');
  const tel = matchLabel(corp, 'TEL(?:EFON)?');
  const ctr = matchLabel(corp, 'CTR|CONTRACT');
  const servisare = matchLabel(corp, 'SERVISARE');
  const dep = matchLabel(corp, 'DEP(?:OZIT)?');
  // s30: "SERII : ALEGE SOFERUL 1 DIN 3 (ARMAL 1; MONDO 2; SATELIT 3)" — nu sunt serii de ridicat,
  // ci lista de la client din care alege soferul
  const serRaw = matchLabel(corp, 'SERII?');
  const alege = /ALEGE/i.test(faraDiacritice(serRaw));
  const series = alege ? [] : parseSerii(serRaw);
  let seriiPunct = alege ? parseSerii((/\((.*)\)/.exec(serRaw) || [])[1]).map((serie) => ({ serie, model: '' })) : [];
  // s31: blocul de jos din comanda GestiuneEE v5.01:
  //   MODEL SI SERIE PRODUS (ALEGE SOFERUL 1 DIN 3)
  //   ARMAL Seria: 1
  const iMs = lines.findIndex((l) => /^MODEL\s+(SI|ȘI)\s+SERIE/i.test(faraDiacritice(l)));
  if (iMs >= 0) {
    const bloc = [];
    for (const l of lines.slice(iMs + 1)) {
      const m = /^(.*?)\s*Seria\s*:\s*(.+)$/i.exec(l);
      if (!m) break;
      const serie = m[2].trim().replace(/^EE-?\s*/i, '');
      if (serie && !/f[aă]r[aă]\s*serie/i.test(faraDiacritice(serie))) bloc.push({ serie, model: m[1].trim() });
    }
    if (/ALEGE/i.test(faraDiacritice(lines[iMs]))) { seriiPunct = bloc; }
    else if (bloc.length) { series.splice(0, series.length, ...bloc.map((x) => x.serie)); seriiPunct = bloc; }
  }
  const aux = listaAcc(matchLabel(corp, 'ACC(?:ESORII)?'));
  const mentiune = mentiuneTip(eAntet(lines[0]) ? lines[0] : '', ctr);

  // Randul produsului: "1    TOALETA    CLASIC" — grupurile despartite de 2+ spatii
  // (bucati / produs / model). Se cauta intai deasupra lui NUME CL, ca un rand de
  // adresa ("14 OCTOMBRIE") sa nu fie luat drept produs.
  let productQty = 0;
  let productText = '';
  const iCl = corp.findIndex((l) => CLIENT_LABEL_RE.test(l));
  const zone = iCl > 0 ? [corp.slice(0, iCl), corp] : [corp];
  cauta: for (const z of zone) {
    for (const line of z) {
      const m = /^\s*(\d{1,4})\s+([A-Za-zĂÂÎȘȚăâîșțŞŢ].*)$/.exec(line);
      if (!m || m[2].includes(':')) continue;
      const grupe = m[2].split(/\s{2,}|\t+/).map((x) => stripWaFormatting(x)).filter(Boolean);
      productQty = parseInt(m[1], 10);
      productText = grupe.join(' ').replace(/\s+/g, ' ');
      break cauta;
    }
  }

  return { clientName, address, persRes, tel, ctr, servisare, dep, productQty, productText, series, seriiPunct, aux, mentiune };
}

/** Deschide un dialog cu o zona de text unde soferul lipeste mesajul de
 * WhatsApp; la confirmare intoarce campurile extrase (sau null la anulare). */
export async function openWhatsAppImportDialog() {
  const area = textAreaField({
    label: 'Lipeste aici textul comenzii din WhatsApp',
    rows: 10,
    placeholder: 'NUME CL: ...\nJUD. : ...\nLOC. : ...\nSTR ...\nPERS. RES. : ...\nTEL. : ...',
  });

  const pasteBtn = el(
    'button',
    {
      class: 'btn btn-text',
      style: 'padding-left:0',
      onclick: async () => {
        try {
          const clip = await navigator.clipboard.readText();
          if (clip && clip.trim()) {
            area.input.value = clip;
          }
        } catch (e) {
          // clipboard indisponibil / permisiune refuzata — soferul lipeste manual
        }
      },
    },
    ['📋 Lipeste din clipboard']
  );

  const hint = el('div', { class: 'hint-text', style: 'margin-top:2px' }, [
    'Completeaza dupa import ce lipseste — nu toate mesajele au acelasi format.',
  ]);

  const body = el('div', {}, [pasteBtn, area, hint]);

  const result = await openModal({
    title: '📋 Importa din WhatsApp',
    bodyNode: body,
    actions: [
      { label: 'Anuleaza', value: null },
      { label: 'Importa', value: 'import', primary: true },
    ],
  });

  if (result !== 'import') return null;
  const text = area.input.value;
  if (!text || !text.trim()) return null;
  return parseWhatsAppOrderText(text);
}
