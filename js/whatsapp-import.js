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
  const re = new RegExp(`^\\s*(?:${labelPattern})\\s*\\.?\\s*:?\\s*[:\\-]?\\s*(.+)$`, 'i');
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
  { re: /^\s*JUD(?:ET)?\s*\.?\s*:?\s*[:\-]?\s*(.+)$/i, format: (v) => `Jud. ${v.trim().toUpperCase()}` },
  // Localitate / oras / comuna / sat — toate sunt aceeasi pozitie in
  // adresa, doar denumiri diferite ale aceleiasi etichete
  { re: /^\s*(?:LOC(?:ALITATE)?|ORAS|COMUNA|SAT)\s*\.?\s*:?\s*[:\-]?\s*(.+)$/i, format: (v) => v.trim() },
  // Strada / cartier / zona
  { re: /^\s*(?:STR(?:ADA)?|CARTIER|ZONA)\s*\.?\s*:?\s*[:\-]?\s*(.+)$/i, format: (v) => v.trim() },
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
const OTHER_LABEL_RE = /^\s*(?:PERS\.?\s*RES(?:PONSABILA)?|RESPONSABIL|TEL(?:EFON)?|CTR|CONTRACT|SERVISARE|DEP(?:OZIT)?)\s*\.?\s*:?/i;
// Prima linie a comenzii e de obicei tipul de PV + data ("AMPLASARE
// 15/09/2026") — daca nu exista deloc "NUME CL" in text, nu vrem sa
// inghitim din greseala aceasta linie in blocul de adresa.
const HEADER_LINE_RE = /^\s*(?:AMPLASARE|RIDICARE|SERVISARE|LIPSA\s*ACCES|VANZARE)\b/i;

function extractAddressBlock(lines) {
  let start = HEADER_LINE_RE.test(lines[0] || '') ? 1 : 0;
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

/** Extrage campurile cunoscute dintr-un text liber de tip comanda WhatsApp.
 * Intoarce un obiect cu proprietati goale ("") pentru ce nu s-a gasit —
 * apelantul decide ce campuri suprascrie in formular. */
export function parseWhatsAppOrderText(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((l) => stripWaFormatting(l))
    .filter(Boolean);

  const clientName = matchLabel(lines, 'NUME\\s*CL(?:IENT)?');
  const address = extractAddressBlock(lines);
  const persRes = matchLabel(lines, 'PERS\\.?\\s*RES(?:PONSABILA)?|RESPONSABIL');
  const tel = matchLabel(lines, 'TEL(?:EFON)?');
  const ctr = matchLabel(lines, 'CTR|CONTRACT');
  const servisare = matchLabel(lines, 'SERVISARE');
  const dep = matchLabel(lines, 'DEP(?:OZIT)?');

  let productQty = 0;
  let productText = '';
  for (const line of lines) {
    const m = /^(\d{1,3})\s+([A-Za-zĂÂÎȘȚăâîșțŞŢ][A-Za-zĂÂÎȘȚăâîșțŞŢ0-9 \-]{2,60})$/.exec(line);
    if (m) {
      productQty = parseInt(m[1], 10);
      productText = stripWaFormatting(m[2]);
      break;
    }
  }

  return { clientName, address, persRes, tel, ctr, servisare, dep, productQty, productText };
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
