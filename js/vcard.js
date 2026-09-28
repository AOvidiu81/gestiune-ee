// vcard.js — genereaza un fisier .vcf (vCard) din datele beneficiarului
// completate pe formularul de PV, ca soferul sa poata salva rapid contactul
// clientului direct in agenda telefonului, fara sa retasteze numarul.
//
// Acelasi tipar ca la distribuirea PDF-ului (vezi shareOrDownloadPdf() din
// pdf-generate.js): incercam intai navigator.share() cu fisierul .vcf —
// pe Android, foaia de distribuire recunoaste .vcf si ofera direct
// "Contacts"/"Persoane de contact" ca destinatie, ceea ce deschide contactul
// gata completat pentru salvare. Daca share() nu e disponibil (desktop,
// browsere mai vechi) sau esueaza, cadem pe o descarcare normala — telefonul
// stie oricum sa deschida un fisier .vcf descarcat cu aplicatia de contacte.

/** Scapa caracterele speciale conform specificatiei vCard (RFC 6350):
 * backslash, virgula, punct-si-virgula si newline trebuie precedate de \. */
function escapeVCardValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Construieste textul unui vCard 3.0 minimal — nume, firma (optional),
 * telefon (optional). Foloseste CRLF intre linii, asa cum cere standardul. */
export function buildVCardText({ name, org, phone }) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCardValue(name || org || phone || 'Contact')}`];
  if (org) lines.push(`ORG:${escapeVCardValue(org)}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${escapeVCardValue(phone)}`);
  lines.push('END:VCARD', '');
  return lines.join('\r\n');
}

function safeFileToken(value) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N} -]+/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/** Salveaza contactul beneficiarului: incearca distribuirea nativa (care pe
 * telefon deschide direct ecranul "Adauga contact"), altfel descarca
 * fisierul .vcf. Nu arunca eroare mai departe -- un contact nesalvat nu
 * trebuie sa blocheze soferul, la fel ca restul functiilor best-effort din
 * aplicatie. Intoarce un status util doar pentru diagnostic (nu e obligatoriu
 * folosit de apelant). */
export async function saveContact({ name, org, phone }) {
  const text = buildVCardText({ name, org, phone });
  const fileName = `${safeFileToken(name || org) || 'contact'}.vcf`;
  const blob = new Blob([text], { type: 'text/vcard' });

  let file = null;
  try {
    file = new File([blob], fileName, { type: 'text/vcard' });
  } catch (e) {
    // File API indisponibil (foarte rar) -- ramanem pe descarcare simpla mai jos
  }
  const canShareFiles = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return { status: 'shared' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { status: 'cancelled' };
      // orice alta eroare de share -> incercam descarcarea de mai jos
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: 'downloaded' };
  } catch (e) {
    return { status: 'failed', error: e };
  }
}
