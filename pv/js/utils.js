// utils.js — helpere text/data comune, portate din aplicatia Flutter
// (text_utils.dart, logica din process_verbal_pdf.dart).

// Trebuie tinut manual sincron cu CACHE_VERSION din sw.js la fiecare
// modificare — afisat pe ecranul de login/acasa ca soferul sa poata
// confirma dintr-o privire ce versiune ruleaza pe telefon.
export const APP_VERSION = 'v60';

// "Forteaza actualizarea" — echivalentul mobil al Ctrl+Shift+R de pe PC.
// Pe telefon nu exista alta optiune de hard-refresh, iar un WebAPK Android
// instalat nu pare sa re-verifice sw.js la fel de des ca un tab obisnuit
// de Chrome, asa ca soferul poate ramane blocat pe o versiune veche mult
// timp. Functia asta dezinstaleaza orice service worker inregistrat,
// sterge tot Cache Storage-ul folosit de el (cache-urile APP_SHELL vechi),
// apoi reincarca pagina cu un parametru unic in URL ca sa ocolim si
// cache-ul HTTP obisnuit al browserului — nu doar Cache Storage API. Dupa
// reload, app.js reinregistreaza automat un service worker nou, curat.
export async function forceUpdateApp() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch (e) {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (e) {}
  const url = new URL(location.href);
  url.searchParams.set('_fu', Date.now().toString());
  location.replace(url.toString());
}

const DIACRITICS_MAP = {
  'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ş': 's', 'ț': 't', 'ţ': 't',
  'Ă': 'A', 'Â': 'A', 'Î': 'I', 'Ș': 'S', 'Ş': 'S', 'Ț': 'T', 'Ţ': 'T',
};

export function withoutDiacritics(value) {
  if (!value) return '';
  return String(value).replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, (c) => DIACRITICS_MAP[c] || c);
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatDateRo(date = new Date()) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatDateTimeRo(date = new Date()) {
  return `${formatDateRo(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const WEEKDAYS_RO = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'];
const WEEKDAYS_RO_UPPER = ['LUNI', 'MARTI', 'MIERCURI', 'JOI', 'VINERI', 'SAMBATA', 'DUMINICA'];

export function weekdayLabelRo(date = new Date(), upper = false) {
  const idx = (date.getDay() + 6) % 7; // JS: 0=Duminica -> aliniem la Luni=0
  return (upper ? WEEKDAYS_RO_UPPER : WEEKDAYS_RO)[idx];
}

export function formatUserName(name) {
  return (name || '').trim();
}

/** Calculeaza vechimea (in ani si luni) de la o data de angajare
 * ("YYYY-MM-DD", cum vine din baza de date) pana azi. Intoarce null daca
 * data lipseste sau e invalida. */
export function vechimeLabel(dataAngajareStr) {
  if (!dataAngajareStr) return null;
  const start = new Date(dataAngajareStr);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years <= 0 && months <= 0) return 'sub 1 luna';
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'an' : 'ani'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'luna' : 'luni'}`);
  return parts.join(' si ');
}

/** "Ovidiu Anitoiu" -> "O. ANITOIU" (port din _shortDriverName). */
export function shortDriverName(value) {
  const parts = (value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '-';
  if (parts.length === 1) return parts[0].toUpperCase();
  const first = parts[0].charAt(0).toUpperCase();
  const tail = parts.slice(1).join(' ').toUpperCase();
  return `${first}. ${tail}`;
}

const COUNTY_CODES = {
  ALBA: 'AB', ARAD: 'AR', ARGES: 'AG', BACAU: 'BC', BIHOR: 'BH',
  'BISTRITA NASAUD': 'BN', BOTOSANI: 'BT', BRAILA: 'BR', BRASOV: 'BV',
  BUCURESTI: 'B', BUZAU: 'BZ', CALARASI: 'CL', 'CARAS SEVERIN': 'CS',
  CLUJ: 'CJ', CONSTANTA: 'CT', COVASNA: 'CV', DAMBOVITA: 'DB',
  DOLJ: 'DJ', GALATI: 'GL', GIURGIU: 'GR', GORJ: 'GJ', HARGHITA: 'HR',
  HUNEDOARA: 'HD', IALOMITA: 'IL', IASI: 'IS', ILFOV: 'IF',
  MARAMURES: 'MM', MEHEDINTI: 'MH', MURES: 'MS', NEAMT: 'NT', OLT: 'OT',
  PRAHOVA: 'PH', SALAJ: 'SJ', 'SATU MARE': 'SM', SIBIU: 'SB', SUCEAVA: 'SV',
  TELEORMAN: 'TR', TIMIS: 'TM', TULCEA: 'TL', VALCEA: 'VL', VASLUI: 'VS',
  VRANCEA: 'VN',
};

export function countyAbbreviation(countyName) {
  const normalized = withoutDiacritics(countyName || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (COUNTY_CODES[normalized]) return COUNTY_CODES[normalized];
  const compact = normalized.replace(/ /g, '');
  if (compact.length >= 2) return compact.substring(0, 2);
  return 'HD';
}

export function extractCountyFromAddress(address) {
  const cleaned = (address || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const match = /\bjud(?:et)?\.?\s*([A-Za-z\-\s]+)/i.exec(cleaned);
  if (!match) return '';
  return (match[1] || '').split(',')[0].trim();
}

/** Cauta, intr-un text liber (ex: campul "La Contract" completat din
 * comanda), un cod de judet cunoscut (HD, SB, CT, B, ...) — fie ca abreviere
 * scrisa ca atare ("... HD"), fie ca numele intreg al judetului ("Hunedoara").
 * Foloseste aceeasi lista COUNTY_CODES ca countyAbbreviation(), ca cele doua
 * sa ramana mereu in sincron. Intoarce '' daca nu gaseste nimic. */
export function matchCountyCodeInText(text) {
  const norm = withoutDiacritics(text || '').toUpperCase();
  if (!norm) return '';
  const codeSet = new Set(Object.values(COUNTY_CODES));
  const words = norm.match(/[A-Z]+/g) || [];
  for (const w of words) {
    if (codeSet.has(w)) return w;
  }
  const compact = norm.replace(/[^A-Z]/g, '');
  for (const [name, code] of Object.entries(COUNTY_CODES)) {
    if (compact.includes(name.replace(/[^A-Z]/g, ''))) return code;
  }
  return '';
}

export function extractLocationFromAddress(address) {
  const parts = (address || '').split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (withoutDiacritics(part).toUpperCase().startsWith('JUD')) continue;
    return part;
  }
  return (address || '').trim();
}

/** La fel ca extractLocationFromAddress() de mai sus (elimina segmentul de
 * judet, ex: "jud. Hunedoara"), dar pastreaza TOATE partile ramase din
 * adresa, nu doar prima -- folosit acolo unde avem nevoie de adresa completa
 * (localitate + strada), nu doar de localitate (ex: numele fisierului la
 * salvarea/descarcarea unui PV, unde judetul e deja aratat separat, ca
 * abreviere de 2 litere -- vezi countyAbbreviation() -- si nu mai trebuie
 * repetat si scris integral). */
export function addressWithoutCounty(address) {
  const parts = (address || '').split(',').map((p) => p.trim()).filter(Boolean);
  const rest = parts.filter((p) => !withoutDiacritics(p).toUpperCase().startsWith('JUD'));
  return rest.join(', ') || (address || '').trim();
}

export function fileToken(value) {
  return withoutDiacritics(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function displayOrNa(value, na = 'N/A') {
  const trimmed = (value || '').trim();
  return trimmed === '' ? na : trimmed;
}

export function debounce(fn, delay = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Micsoreaza font-size-ul unui element (deja "white-space: nowrap" din CSS)
 * pas cu pas, pana cand incape pe UN singur rand in latimea disponibila —
 * folosit pentru textul rosu "va rog sa retrimiteti..." din documentul PV,
 * a carui lungime variaza (tip proces + adresa de email pot fi mai lungi
 * sau mai scurte). Element-ul trebuie sa fie deja montat in DOM (are
 * clientWidth/scrollWidth valide) — safe de apelat de mai multe ori (ex.
 * daca fontul de baza s-a schimbat intre timp), reporneste mereu de la
 * dimensiunea CSS originala.
 */
/**
 * Asteapta ca toate imaginile (<img>) din interiorul lui "root" sa fie
 * incarcate (sau esuate) inainte de a continua — folosit inaintea oricarei
 * masuratori de layout (ex. shrinkProductsTableToFit), pentru ca un <img>
 * fara width/height explicit (ex. antetul ".doc-header-img") are inaltime 0
 * cat timp nu s-a incarcat, ceea ce ar duce la o estimare gresita a
 * spatiului disponibil pentru tabelul de produse — si, dupa ce imaginea se
 * incarca in cele din urma, la o pagina care depaseste totusi cele 297mm
 * (randuri taiate silentios), desi tabelul parea sa incapa la masuratoare.
 * Sigur de apelat oricand — daca imaginea e deja incarcata (des cazul, fiind
 * in cache-ul browserului dupa prima folosire a aplicatiei), se rezolva
 * aproape instant.
 */
export async function waitForImagesLoaded(root) {
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete) {
        // "complete" e true si pentru o imagine care a esuat la incarcare —
        // in ambele cazuri layoutul e deja stabil, nu mai asteptam nimic.
        return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      }
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    })
  );
}

export function shrinkTextToFitOneLine(el, { minFontSizePx = 9, stepPx = 0.5 } = {}) {
  if (!el) return;
  const computed = window.getComputedStyle(el);
  const originalFontSize = el.style.fontSize || computed.fontSize;
  let fontSizePx = parseFloat(computed.fontSize);
  if (!fontSizePx || !isFinite(fontSizePx)) return;
  el.style.fontSize = fontSizePx + 'px';
  let guard = 0;
  while (el.scrollWidth > el.clientWidth && fontSizePx > minFontSizePx && guard < 200) {
    fontSizePx -= stepPx;
    el.style.fontSize = fontSizePx + 'px';
    guard += 1;
  }
  if (guard === 0) el.style.fontSize = originalFontSize; // nu a fost nevoie sa micsoram, pastram CSS-ul original
}

/**
 * Micsoreaza tabelul de produse (".doc-table-frame" de pe pagina PV) pas cu
 * pas — font-size + padding pe randuri — pana cand TOATA pagina incape in
 * inaltimea fixa de tiparire (297mm, A4), daca beneficiarul are multe
 * categorii de produse. Fara asta, motorul de tiparire/export (care
 * forteaza fiecare ".doc-page" la o inaltime FIXA de 297mm) taia silentios
 * randurile care nu incap — soferul nu vede nicio eroare, produsele pur si
 * simplu lipsesc din PDF-ul salvat/trimis (desc doperit empiric).
 *
 * Foloseste o inaltime de proba de 297mm (aceeasi ca in css/print.css sub
 * @media print si ca in pdf-generate.js) — 1mm inseamna mereu acelasi numar
 * de pixeli in CSS, indiferent de contextul de randare (ecran real, host
 * ascuns offscreen etc.), asa ca verificarea functioneaza identic peste
 * tot. Restauram inaltimea originala a paginii dupa masuratoare, ca sa nu
 * lasam un stil inline care ar strica randarea normala (ne-tiparita).
 */
export function shrinkProductsTableToFit(root, { minFontSizePx = 7.6, minPaddingVMm = 0.3, minLineHeight = 1, stepPx = 0.1 } = {}) {
  if (!root) return;
  root.querySelectorAll('.doc-page').forEach((pageEl) => {
    const frame = pageEl.querySelector('.doc-table-frame');
    const table = frame ? frame.querySelector('table') : null;
    if (!frame || !table) return;

    const cells = table.querySelectorAll('th, td');
    // Repornim mereu de la dimensiunea CSS originala (tabelul poate fi
    // remasurat de mai multe ori — ex. preview redeschis dupa o corectie).
    table.style.fontSize = '';
    table.style.lineHeight = '';
    cells.forEach((cell) => { cell.style.padding = ''; });

    const originalHeight = pageEl.style.height;
    const originalOverflow = pageEl.style.overflow;
    pageEl.style.height = '297mm';
    pageEl.style.overflow = 'hidden';

    // IMPORTANT: NU verificam pageEl.scrollHeight > pageEl.clientHeight —
    // ".doc-page" e flex-column, iar ".doc-table-frame" (chenarul verde,
    // are deja "overflow:hidden" din CSS pentru colturile rotunjite) e un
    // flex item obisnuit, care se poate MICSORA sub inaltimea lui naturala
    // ca sa incapa restul continutului in cele 297mm — motorul de layout
    // "rezolva" astfel overflow-ul paginii silentios, taind randurile din
    // tabel INTERN, fara ca ".doc-page" insusi sa mai raporteze vreun
    // overflow (scrollHeight == clientHeight acolo, desi tabelul e taiat!).
    // De-asta verificam direct chenarul tabelului: daca CONTINUTUL lui
    // (randurile) e mai inalt decat SPATIUL pe care i l-a dat efectiv
    // layout-ul, inseamna ca randuri intregi sunt invizibile in acest
    // moment — de aici stim sigur cand trebuie sa micsoram.
    const basePaddingVMm = 1.4; // vezi ".doc-table th, .doc-table td" in print.css
    const baseFontSizePx = parseFloat(window.getComputedStyle(table).fontSize);
    const basePaddingH = '2mm';

    // Pasul 1: reducem intai spatiul gol (padding pe randuri + line-height),
    // pastrand fontul la marimea originala — asta afecteaza legibilitatea
    // cel mai putin. Testam la fiecare pas daca a inceput sa incapa.
    let paddingVMm = basePaddingVMm;
    let lineHeight = 1.32; // vezi ".doc-page" in print.css (mostenit de tabel)
    let guard = 0;
    while (frame.scrollHeight > frame.clientHeight && (paddingVMm > minPaddingVMm || lineHeight > minLineHeight) && guard < 100) {
      paddingVMm = Math.max(minPaddingVMm, paddingVMm - 0.05);
      lineHeight = Math.max(minLineHeight, lineHeight - 0.015);
      cells.forEach((cell) => { cell.style.padding = `${paddingVMm}mm ${basePaddingH}`; });
      table.style.lineHeight = String(lineHeight);
      guard += 1;
    }

    // Pasul 2: daca tot nu incape (multe randuri + liste lungi de conditii
    // pe aceeasi pagina), reducem si fontul, pastrand padding-ul si
    // line-height-ul deja la minim de mai sus.
    let fontSizePx = baseFontSizePx;
    guard = 0;
    while (frame.scrollHeight > frame.clientHeight && fontSizePx > minFontSizePx && guard < 100) {
      fontSizePx -= stepPx;
      table.style.fontSize = fontSizePx + 'px';
      guard += 1;
    }

    pageEl.style.height = originalHeight;
    pageEl.style.overflow = originalOverflow;
  });
}

/**
 * Realoca dinamic latimile coloanelor BUC/MODEL PRODUS/TIP PRODUS/SERII din
 * tabelul de produse, dupa continutul REAL al acestui P.V. — implicit
 * (css/print.css), coloana SERII are fix 23% din latime, suficient doar
 * pentru putine serii scurte; cu 5-6 serii pe un produs (soferul poate
 * adauga oricate), textul ajungea sa se desparta la mijlocul unui cod (ex:
 * "EE-333" pe un rand, "333" pe urmatorul) — greu de citit, desi nu se
 * pierdea nimic (celula creste in inaltime, randul se adapteaza).
 *
 * Model si Tip Produs vin dintr-un catalog cu denumiri scurte, cunoscute
 * dinainte (ex: "TOALETA", "CLASIC") — de obicei au nevoie de mult mai
 * putin spatiu decat cele 22%+45% alocate implicit. Le micsoram la latimea
 * lor naturala (continutul + antetul coloanei, plus o mica rezerva) si dam
 * tot ce ramane coloanei Serii, unde chiar e nevoie de spatiu. Daca vreun
 * Tip Produs e neobisnuit de lung, un plafon (maxFixedPercent) opreste
 * BUC/MODEL/TIP sa inghita prea mult din tabel, ca Serii sa pastreze mereu
 * un minim rezonabil (minSeriiPercent).
 *
 * Apelata INAINTE de shrinkProductsTableToFit() (in aceleasi 3 locuri:
 * preview in-app, tiparire nativa, export PDF), ca micsorarea fontului —
 * daca mai e nevoie, cu multe produse/serii — sa porneasca de la niste
 * latimi de coloana deja corecte, nu de la cele 4 procente fixe.
 */
// Masoara latimea naturala (nescrisa pe mai multe randuri) a textului unei
// celule, IZOLAT de tabel — daca am masura direct in interiorul tabelului
// (ex: cell.scrollWidth cu white-space:nowrap), rezultatul ar depinde de
// cum s-au asezat pana atunci CELELALTE coloane (motorul de layout "auto"
// al tabelului rezolva toate coloanele impreuna), deci am putea subestima
// nevoia reala. Clonam textul intr-un element separat, needependent de
// tabel (aceleasi fonturi, dar fara nicio constrangere de latime), il
// masuram, apoi il stergem.
let measureSpan = null;
function measureTextWidth(text, computedStyle) {
  if (!measureSpan) {
    measureSpan = document.createElement('span');
    measureSpan.style.position = 'absolute';
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.left = '-9999px';
    measureSpan.style.top = '0';
    measureSpan.style.whiteSpace = 'nowrap';
    document.body.appendChild(measureSpan);
  }
  measureSpan.style.fontFamily = computedStyle.fontFamily;
  measureSpan.style.fontSize = computedStyle.fontSize;
  measureSpan.style.fontWeight = computedStyle.fontWeight;
  measureSpan.style.letterSpacing = computedStyle.letterSpacing;
  measureSpan.textContent = text;
  return measureSpan.getBoundingClientRect().width;
}

export function balanceProductsTableColumns(root, { minSeriiPercent = 0.28, maxFixedPercent = 0.55 } = {}) {
  if (!root) return;
  root.querySelectorAll('.doc-products-table').forEach((table) => {
    const colClasses = ['col-buc', 'col-model', 'col-tip'];
    const groups = colClasses.map((cls) => Array.from(table.querySelectorAll(`.${cls}`)));
    const seriiCells = Array.from(table.querySelectorAll('.col-serii'));
    if (groups.some((g) => !g.length) || !seriiCells.length) return;

    // Reset — un preview redeschis dupa o corectie nu trebuie sa porneasca
    // de la latimile calculate la randarea anterioara.
    [...groups.flat(), ...seriiCells].forEach((cell) => { cell.style.width = ''; });

    const tableWidth = table.clientWidth;
    if (!tableWidth) return;

    // Padding orizontal existent al celulelor (stanga+dreapta) — vezi
    // ".doc-table th, .doc-table td" in print.css (2mm pe fiecare parte) —
    // plus o rezerva mica suplimentara (border-ul celulei + eventuale
    // rotunjiri sub-pixel intre masuratoarea offscreen si randarea reala in
    // tabel, care altfel pot face textul sa treaca pe randul urmator chiar
    // daca in teorie "abia" incapea).
    const cellPaddingH = 2 * 2 * (96 / 25.4); // 2mm * 2 laturi, convertit in px
    const safetyBuffer = 8;

    const naturalWidths = groups.map((cells) =>
      cellPaddingH +
      safetyBuffer +
      cells.reduce((max, cell) => {
        const w = measureTextWidth(cell.textContent, window.getComputedStyle(cell));
        return Math.max(max, w);
      }, 0)
    );

    let fixedTotal = naturalWidths.reduce((a, b) => a + b, 0);
    const maxFixedTotal = tableWidth * maxFixedPercent;
    const scale = fixedTotal > maxFixedTotal ? maxFixedTotal / fixedTotal : 1;
    fixedTotal = Math.min(fixedTotal, maxFixedTotal);

    groups.forEach((cells, i) => {
      const w = naturalWidths[i] * scale;
      cells.forEach((cell) => { cell.style.width = `${w}px`; });
    });

    const seriiWidth = Math.max(tableWidth * minSeriiPercent, tableWidth - fixedTotal);
    seriiCells.forEach((cell) => { cell.style.width = `${seriiWidth}px`; });
  });
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ------------------------------------------------------------------
// Zile lucratoare (Luni-Vineri) — folosite de modulul Cereri/Documente
// (Cerere de Concediu, Cerere de Demisie cu preaviz), la fel ca in
// aplicatia veche (APK).
// ------------------------------------------------------------------

/** Numara zilele lucratoare (Luni-Vineri) intre doua date, INCLUSIV ambele
 * capete — ex: Miercuri -> Marti saptamana urmatoare = 5 zile lucratoare. */
export function countBusinessDaysInclusive(startDate, endDate) {
  if (!(startDate instanceof Date) || isNaN(startDate) || !(endDate instanceof Date) || isNaN(endDate)) return 0;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay(); // 0=Duminica, 6=Sambata
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Adauga N zile lucratoare (Luni-Vineri) la o data, fara sa numere ziua de
 * start — folosita ca valoare implicita pentru "Data incetare" la Cererea de
 * Demisie cu preaviz (Caz 2); soferul poate oricand ajusta manual data
 * rezultata inainte de generarea documentului. */
export function addBusinessDays(startDate, n) {
  if (!(startDate instanceof Date) || isNaN(startDate)) return startDate;
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  let remaining = n;
  while (remaining > 0) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return cur;
}

/** "2026-09-02" (valoarea unui <input type="date">) -> Date local, la miezul
 * noptii — evita problemele de fus orar ale lui `new Date("2026-09-02")`
 * (interpretat ca UTC de motoarele JS, ceea ce poate "aluneca" o zi in urma
 * in fusele estice ale Romaniei in anumite conditii). Intoarce null daca
 * sirul lipseste sau e invalid. */
export function parseIsoDate(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(date) ? null : date;
}

/** Date -> "2026-09-02", pentru valoarea unui <input type="date">. */
export function toIsoDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function dataUrlToBlob(dataUrl) {
  const [meta, data] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(meta)[1];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
