// pdf-print.js — genereaza documentul "PDF" (Proces Verbal + Aviz de
// insotire + anexe foto) ca pagini HTML/CSS formatate pentru tipar A4, apoi
// declanseaza fereastra de printare a browserului ("Salveaza ca PDF").
// Continutul text/legal este pastrat identic cu versiunea Flutter
// (process_verbal_pdf.dart); layout-ul vizual este recreat de la zero,
// mai "premium" (tipografie, culori, spatiere).

import {
  formatDateRo,
  shortDriverName,
  weekdayLabelRo,
  displayOrNa,
  withoutDiacritics,
  fileToken,
  shrinkTextToFitOneLine,
  shrinkProductsTableToFit,
  balanceProductsTableColumns,
  waitForImagesLoaded,
} from './utils.js';
import { CONDITIONS_BY_TYPE, COMPANY_INFO, confirmationBanner } from './catalog-defaults.js';
import { displayPvNumber, displayAvizNumber } from './pv-numbering.js';
import { pushScreen } from './router.js';
import { el } from './utils.js';
import { showToast, confirmDialog } from './components.js';
import { generateDocumentPdfBlob, downloadPdf, shareOrDownloadPdf } from './pdf-generate.js';

const NA = 'N/A';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function splitModelType(combined) {
  const value = (combined || '').trim();
  if (!value) return { model: '', type: '' };
  const extraMatch = /^(.+?)\s*(?:\|\s*(.+))?$/.exec(value);
  const withoutExtra = (extraMatch && extraMatch[1] ? extraMatch[1] : value).trim();
  const extras = (extraMatch && extraMatch[2]) || '';
  const baseMatch = /^(.*?)\s*\((.*?)\)\s*$/.exec(withoutExtra);
  const modelName = baseMatch ? (baseMatch[1] || '').trim() : withoutExtra;
  const typeBase = baseMatch ? (baseMatch[2] || '').trim() : '';
  if (!extras.trim()) return { model: modelName, type: typeBase };
  const typeWithExtras = typeBase ? `${typeBase} | ${extras.trim()}` : extras.trim();
  return { model: modelName, type: typeWithExtras };
}

// Prefix fix pentru orice serie afisata in document — soferul tasteaza doar
// partea variabila (vezi seriesField() din screens-pv-form.js), care poate
// veni deja fara sau (din date vechi) cu "EE-" pus manual; nu il dublam.
function withSeriesPrefix(raw) {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  return /^EE-/i.test(clean) ? clean : `EE-${clean}`;
}

/** Randeaza lista de serii ale unui produs ca text cu delimitator "; ",
 * maxim 6 serii pe linie — grupele suplimentare de 6 trec pe randul urmator
 * (in interiorul aceleiasi celule din tabel). Fiecare cod de serie e
 * infasurat intr-un span "doc-series-token" (white-space:nowrap in
 * print.css) — daca celula nu are destul loc pe orizontala (vezi
 * balanceProductsTableColumns() din utils.js) si randul se imparte automat
 * pe mai multe linii vizuale, ruptura poate cadea DOAR intre coduri
 * (dupa "; "), niciodata in mijlocul unui cod (ex: "EE-333" pe un rand,
 * "333" pe urmatorul, ca inainte). */
function formatSeriesCell(seriesList) {
  if (!seriesList.length) return '-';
  const withPrefix = seriesList.map(withSeriesPrefix);
  const lines = [];
  for (let i = 0; i < withPrefix.length; i += 6) {
    lines.push(
      withPrefix
        .slice(i, i + 6)
        .map((s) => `<span class="doc-series-token">${esc(s)}</span>`)
        .join('; ')
    );
  }
  return lines.join('<br>');
}

function productRows(model) {
  const modelEntries = (model.productModel || '').split(';').map((e) => e.trim()).filter(Boolean);
  const seriesGroups = (model.productSeries || '').split(';').map((e) => e.trim());
  const qty = parseInt(String(model.field3 || '').replace(/[^0-9-]/g, ''), 10);
  const hasNoSeriesData = seriesGroups.every((g) => !g);
  const activeRows = modelEntries.length > seriesGroups.length ? modelEntries.length : modelEntries.length || 1;
  const rows = [];
  for (let i = 0; i < activeRows; i++) {
    const combined = i < modelEntries.length ? modelEntries[i] : '';
    const split = splitModelType(combined);
    const seriesGroup = i < seriesGroups.length ? seriesGroups[i] : '';
    const seriesList = seriesGroup.split(',').map((s) => s.trim()).filter(Boolean);
    const bucCount = seriesList.length
      ? seriesList.length
      : hasNoSeriesData && i === 0 && !isNaN(qty) && qty !== 0
      ? Math.abs(qty)
      : 1;
    rows.push({ buc: bucCount, model: split.model, type: split.type, seriesList });
  }
  return rows;
}

function avizRows(model) {
  const modelEntries = (model.productModel || '').split(';').map((e) => e.trim()).filter(Boolean);
  const seriesGroups = (model.productSeries || '').split(';').map((e) => e.trim());
  const qty = parseInt(String(model.field3 || '').replace(/[^0-9-]/g, ''), 10);
  const rows = [];
  modelEntries.forEach((combined, i) => {
    const split = splitModelType(combined);
    const seriesGroup = i < seriesGroups.length ? seriesGroups[i] : '';
    // La fel ca in tabelul de produse de pe pagina PV (formatSeriesCell,
    // care aplica withSeriesPrefix), seriile trebuie afisate cu prefixul
    // "EE-" si in tabelul Aviz — inainte, aici se afisa doar partea
    // variabila tastata de sofer (ex: "S23" in loc de "EE-S23"). Fiecare cod
    // e infasurat intr-un span "doc-series-token" (white-space:nowrap), ca
    // sa nu se rupa niciodata in mijloc daca randul se imparte pe mai multe
    // linii vizuale — la fel ca in tabelul de produse (vezi formatSeriesCell
    // mai sus). "denumire" e deja HTML sigur (piesele dinamice sunt escapate
    // individual mai jos), deci NU se mai trece prin esc() la randare.
    const seriesTokens = seriesGroup.split(',').map((s) => s.trim()).filter(Boolean).map(withSeriesPrefix);
    const seriesFormattedHtml = seriesTokens.map((s) => `<span class="doc-series-token">${esc(s)}</span>`).join(', ');
    const baseDenumireHtml = split.type ? `${esc(split.model)} - ${esc(split.type)}` : esc(split.model);
    const denumireHtml = seriesFormattedHtml ? `${baseDenumireHtml} | ${seriesFormattedHtml}` : baseDenumireHtml;
    const cant = seriesTokens.length
      ? seriesTokens.length
      : i === 0 && !isNaN(qty) && qty !== 0
      ? Math.abs(qty)
      : 1;
    rows.push([String(i + 1), denumireHtml, 'BUC', String(cant)]);
  });
  if (!rows.length) rows.push(['1', '-', 'BUC', '1']);
  return rows;
}

function anexaFotoTitle(model, index) {
  // Adresa apare EXACT cum a scris-o soferul (model.field1), fara nicio
  // extragere/abreviere de judet — inainte titlul incerca sa deduca separat
  // localitatea si judetul din text, si daca adresa nu continea explicit
  // "Jud." (ex: Bucuresti cu Sector, sau comuna/sat fara acel cuvant), cadea
  // pe judetul DEPOZITULUI soferului, nu pe cel real al adresei. Vezi si
  // "Adresa:" din banner-ul pozei (photoOverlayLines, screens-pv-form.js),
  // care e singurul loc unde adresa NU vine din comanda, ci din GPS.
  const client = (model.clientName || '').trim() || 'BENEFICIAR';
  const address = (model.field1 || '').trim() || 'ADRESA NECUNOSCUTA';
  return `ANEXA FOTO ${index} : ${withoutDiacritics(client).toUpperCase()}, ${withoutDiacritics(address).toUpperCase()}`;
}

function docDateTime(iso) {
  const dt = iso ? new Date(iso) : new Date();
  return {
    date: `${weekdayLabelRo(dt, true)} _ ${formatDateRo(dt)}`,
    hour: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
    short: `${String(dt.getDate()).padStart(2, '0')} - ${String(dt.getMonth() + 1).padStart(2, '0')} - ${dt.getFullYear()}`,
  };
}

// Exportata si folosita de pdf-cereri.js (Cereri/Documente: Concediu, Invoire,
// Demisie) — acelasi footer, identic vizual cu cel de pe Procesul Verbal, ca
// toate documentele generate de aplicatie sa ramana consistente.
export function runningFooter(model, depotEmail, depotPhone, pageIndex, pageTotal) {
  const pageLabel = pageIndex && pageTotal ? `<div class="doc-footer-sep"></div><div class="doc-footer-page">Pagina ${pageIndex} din ${pageTotal}</div>` : '';
  return `
    <div class="doc-footer">
      <div class="doc-footer-rule"></div>
      <div class="doc-footer-row">
        <img class="doc-footer-logo" src="assets/logo/euro_ecologic_logo.png" alt="" />
        <div class="doc-footer-sep"></div>
        <div class="doc-footer-text">
          <div><strong>${esc(COMPANY_INFO.name)}</strong> | Sediu social: ${esc(COMPANY_INFO.address)}.</div>
          <div>${esc(COMPANY_INFO.phone)} | Nr. Reg. Com.: ${esc(COMPANY_INFO.regCom)} | CUI: ${esc(COMPANY_INFO.cui)} | Website: ${esc(COMPANY_INFO.website)}</div>
          <div>Punct de lucru <strong>${esc((model.depotName || '').toUpperCase())}</strong>: ${esc(depotEmail)} / <strong>${esc(depotPhone)}</strong>
            &nbsp;|&nbsp; <strong>${esc((model.depotRepresentativeName || 'RESPONSABIL DEPOZIT').toUpperCase())}</strong></div>
        </div>
        ${pageLabel}
      </div>
    </div>`;
}

function conditionsBox(processTypeUpper) {
  const lines = CONDITIONS_BY_TYPE[processTypeUpper] || CONDITIONS_BY_TYPE.VANZARE;
  return `
    <div class="doc-box doc-conditions">
      <div class="doc-conditions-title">${esc(lines[0])}</div>
      <ul class="doc-conditions-list">
        ${lines.slice(1).map((l) => `<li>${esc(l)}</li>`).join('')}
      </ul>
    </div>`;
}

function productsTableHtml(model) {
  const rows = productRows(model);
  return `
    <div class="doc-table-frame doc-table-frame-green">
      <table class="doc-table doc-products-table">
        <thead><tr><th class="col-buc">BUC.</th><th class="col-model">MODEL PRODUS</th><th class="col-tip">TIP PRODUS</th><th class="col-serii">SERII</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td class="col-buc center">${r.buc}</td><td class="col-model">${esc(r.model)}</td><td class="col-tip">${esc(r.type)}</td><td class="col-serii">${formatSeriesCell(r.seriesList)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function pageOnePv({ model, driver, isPreview, depotEmail, depotPhone, beneficiarySignatureUrl, driverSignatureUrl, stampAvailable, pageIndex, pageTotal }) {
  const processTypeUpper = (model.processType || '').trim().toUpperCase();
  const needsAviz = ['AMPLASARE', 'RIDICARE', 'VANZARE'].includes(processTypeUpper);
  const dt = docDateTime(model.createdAt);
  const ciSeries = (model.beneficiaryCiSeries || '').trim().toUpperCase();
  const ciNumber = (model.beneficiaryCiNumber || '').trim().toUpperCase();
  const ciInactive = (!ciSeries && !ciNumber) || ciSeries === NA || ciNumber === NA;
  const showMissingPersonnelNote = ciInactive && !beneficiarySignatureUrl;
  // Caseta "Mentiuni" e populata automat, niciodata scrisa de mana de sofer:
  // - LIPSA PERSONAL cand nu exista nici CI beneficiar, nici semnatura (nimeni
  //   prezent care sa preia/semneze PV-ul);
  // - ZONA SECURIZATA / FOTO INTERZIS cand soferul a bifat "Zona securizata
  //   (fara poza confirmare)" in aplicatie (model.secureAreaNoPhoto).
  // Observatiile libere ale soferului au propria caseta mai jos
  // (doc-observatii-sofer) si apar doar daca soferul chiar a scris ceva.
  const mentiuni = [];
  if (model.secureAreaNoPhoto) mentiuni.push('ZONA SECURIZATA / FOTO INTERZIS');
  if (showMissingPersonnelNote) mentiuni.push('LIPSA PERSONAL');
  const valueClass = (v) => {
    const n = (v || '').trim().toUpperCase();
    return n === '' || n === NA ? 'doc-value-missing' : '';
  };
  const contractRef = (model.contractReference || '').trim() || '__________';
  const soferObservations = (model.observatii || '').trim();
  const locationLabel = processTypeUpper === 'LIPSA ACCES' ? 'Locatia de Constatare Lipsa Acces' : `Locatia ceruta de <strong>${esc(model.processType)}</strong>`;

  return `
  <section class="doc-page">
    <div class="doc-header">
      <img class="doc-header-img" src="assets/docs/header.png" alt="" />
      <div class="doc-header-rule"></div>
    </div>
    ${isPreview ? '<div class="doc-preview-badge">PREVIEW</div>' : ''}
    <h1 class="doc-title">PROCES VERBAL DE: ${esc(processTypeUpper)}</h1>
    <div class="doc-subtitle">Emis de depozit ${esc(model.depotName)}</div>
    <div class="doc-meta-line">Nr. document: <strong>${esc(displayPvNumber(model.pvNumber))}</strong>&nbsp;&nbsp;&nbsp;Data: <strong>${esc(dt.date)}</strong>&nbsp;&nbsp;&nbsp;Ora: <strong>${esc(dt.hour)}</strong></div>

    <div class="doc-label">PRESTATOR</div>
    <div class="doc-text"><strong>${esc(COMPANY_INFO.name)}</strong>, cu sediul in Vlahita, Str M. Eminescu, Nr. A, Jud. HR, inregistrata la Reg.Com. sub Nr. ${esc(COMPANY_INFO.regCom)}, Cod Fiscal ${esc(COMPANY_INFO.cui)}</div>

    <div class="doc-label">BENEFICIAR</div>
    <div class="doc-beneficiar-line">- <strong>${esc(model.clientName || '-')}</strong></div>

    <div class="doc-row-2">
      <div class="doc-box doc-box-signer">
        <div class="doc-box-title center">Persoana Responsabila Preluare/Semnare</div>
        <div class="doc-signer-grid">
          <div class="doc-signer-info">
            <div>Nume: <strong>${esc(model.field2 || '-')}</strong></div>
            <div>CI Serie: <strong class="${valueClass(model.beneficiaryCiSeries)}">${esc(displayOrNa(model.beneficiaryCiSeries))}</strong>
              &nbsp;&nbsp;NR: <strong class="${valueClass(model.beneficiaryCiNumber)}">${esc(displayOrNa(model.beneficiaryCiNumber))}</strong></div>
            <div>Telefon: <strong class="${valueClass(model.beneficiaryPhone)}">${esc(displayOrNa(model.beneficiaryPhone))}</strong></div>
          </div>
          <div class="doc-signature-box">
            ${beneficiarySignatureUrl ? `<img src="${beneficiarySignatureUrl}" alt="semnatura" />` : '<span class="doc-signature-placeholder">Semnatura</span>'}
          </div>
        </div>
      </div>
      <div class="doc-box doc-box-obs">
        <div class="doc-box-title center">Mentiuni:</div>
        ${mentiuni.length ? mentiuni.map((m) => `<div class="doc-value-missing doc-bold">${esc(m)}</div>`).join('') : '<div>-</div>'}
      </div>
    </div>

    <div class="doc-row-2">
      <div class="doc-box">
        <div>In data de: <strong>${esc(dt.date)}</strong></div>
        <div>A intervenit urmatorul PV de: <strong>${esc(model.processType)}</strong></div>
        ${needsAviz ? `<div>La Contract: <strong>${esc(contractRef.toUpperCase())}</strong></div>` : ''}
      </div>
      <div class="doc-box">
        <div>Punct de lucru: <strong>${esc((model.depotName || '').toUpperCase())}</strong></div>
        <div>Nume Sofer: <strong>${esc(shortDriverName(model.userName))}</strong></div>
        ${model.userFunctie ? `<div>Functie: <strong>${esc(model.userFunctie)}</strong></div>` : ''}
        <div>Numar Masina: <strong>${esc((model.carNumar || '').toUpperCase())}</strong></div>
      </div>
    </div>

    <div class="doc-box doc-location-bar">${locationLabel} : <strong>${esc(model.field1 ? model.field1.toUpperCase() : '-')}</strong></div>

    ${productsTableHtml(model)}

    <div class="doc-box doc-confirmation-banner">${esc(confirmationBanner(model.processType))}</div>

    ${conditionsBox(processTypeUpper)}

    ${
      needsAviz
        ? `<div class="doc-return-message doc-return-message-p1">TRIMITETI ACEST P.V. DE ${esc(processTypeUpper || 'AMPLASARE')}, SEMNAT SI STAMPILAT, LA ADRESA DE E-MAIL: ${esc(model.avizReturnEmail || '')}</div>`
        : ''
    }

    ${
      soferObservations
        ? `<div class="doc-box doc-observatii-sofer">
            ${
              processTypeUpper === 'LIPSA ACCES'
                ? `<div class="doc-bold">Observatii discutie:</div><div>Soferul ${esc(shortDriverName(model.userName))} a discutat si a constatat urmatoarele:</div><div>${esc(soferObservations)}</div>`
                : `<div class="doc-bold">OBSERVATII SOFER:</div><div>${esc(soferObservations)}</div>`
            }
          </div>`
        : ''
    }

    <table class="doc-table doc-parties-table">
      <tr><td>PRESTATOR</td><td class="right">BENEFICIAR</td></tr>
      <tr>
        <td><strong>${esc(COMPANY_INFO.name)}</strong></td>
        <td class="right"><strong>${esc((model.clientName || 'DENUMIRE BENEFICIAR').toUpperCase())}</strong></td>
      </tr>
    </table>

    ${runningFooter(model, depotEmail, depotPhone, pageIndex, pageTotal)}
  </section>`;
}

function pageTwoAviz({ model, depotEmail, depotPhone, beneficiarySignatureUrl, driverSignatureUrl, stampAvailable, pageIndex, pageTotal }) {
  const processTypeUpper = (model.processType || '').trim().toUpperCase();
  const avizNumber = displayAvizNumber(model.avizNumber);
  const clientName = (model.clientName || '').trim().toUpperCase() || 'BENEFICIAR';
  const rows = avizRows(model);
  const dt = docDateTime(model.createdAt);

  return `
  <section class="doc-page">
    <div class="doc-header">
      <img class="doc-header-img" src="assets/docs/header.png" alt="" />
      <div class="doc-header-rule"></div>
    </div>

    <div class="doc-row-2 doc-aviz-parties">
      <div class="doc-box doc-furnizor">
        <div class="doc-box-title">Furnizor</div>
        <div class="doc-divider"></div>
        <div><strong>${esc(COMPANY_INFO.name)}</strong></div>
        <div>${esc(COMPANY_INFO.regCom.replace('J 2007', 'J 2007 ').replace('000205', '000205 '))}</div>
        <div>${esc(COMPANY_INFO.cui)}</div>
        <div>Vlahita, Str. M. Eminescu Nr 9A / HR</div>
        <div>Telefon: ${esc(COMPANY_INFO.phone)}</div>
        <div><strong>Pct. Lucru depozit ${esc((model.depotName || '').toUpperCase())}</strong></div>
        <div>${esc(model.depotAddress || '')}</div>
        <div>Telefon: ${esc(depotPhone)}</div>
      </div>
      <div class="doc-box doc-beneficiar-box">
        <div class="doc-box-title">Beneficiar</div>
        <div class="doc-divider"></div>
        <div class="doc-beneficiar-grid">
          <div>
            <div><strong>${esc(clientName)}</strong></div>
            <div>Reprezentant: ${esc(model.field2 ? model.field2.toUpperCase() : '-')}</div>
            <div>Serie CI - Nr: ${esc(model.beneficiaryCiSeries || 'N/A')} - ${esc(model.beneficiaryCiNumber || 'N/A')}</div>
            <div>Telefon: ${esc(model.beneficiaryPhone || 'N/A')}</div>
          </div>
          <div class="doc-beneficiar-stamp-slot">
            ${beneficiarySignatureUrl ? `<img src="${beneficiarySignatureUrl}" alt="semnatura" />` : ''}
          </div>
        </div>
      </div>
    </div>

    <h1 class="doc-title">AVIZ DE INSOTIRE A MARFII</h1>
    <div class="doc-subtitle center doc-bold">pentru ${esc(model.processType || '-')}</div>

    <div class="doc-aviz-meta-row">
      <div>
        <div>Emis de depozit: ${esc(model.depotName)}</div>
        <div>Nr. document: ${esc(avizNumber)}</div>
      </div>
      <div>Data: ${esc(dt.date)}</div>
      <div>Ora: ${esc(dt.hour)}</div>
    </div>

    <table class="doc-table doc-aviz-table">
      <thead><tr><th class="col-nr">Nr.</th><th>Denumire produs</th><th class="col-um">U.M.</th><th class="col-cant">Cantitate</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td class="center">${esc(r[0])}</td><td>${r[1]}</td><td class="center">${esc(r[2])}</td><td class="center">${esc(r[3])}</td></tr>`).join('')}</tbody>
    </table>

    <div class="doc-box doc-no-transport">PRODUSELE TRANSPORTATE SUNT FARA VALOARE DE TRANSPORT (NU SE FACTUREAZA).</div>

    <div class="doc-box doc-location-bar">Locatia ceruta de <strong>${esc(processTypeUpper)}</strong> : <strong>${esc(model.field1 ? model.field1.toUpperCase() : '-')}</strong></div>

    <div class="doc-aviz-spacer"></div>

    <table class="doc-table doc-signature-table">
      <thead>
        <tr>
          <th>Semnatura si stampila Prestator</th>
          <th>Date Privind Expeditia</th>
          <th>Semnatura si stampila Beneficiar</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${esc(COMPANY_INFO.name)}</strong></td>
          <td></td>
          <td><strong>${esc(clientName)}</strong></td>
        </tr>
        <tr class="doc-signature-row">
          <td class="center">
            <div class="doc-stamp-slot">
              ${driverSignatureUrl ? `<img class="doc-stamp-signature" src="${driverSignatureUrl}" alt="" />` : ''}
              ${stampAvailable ? `<img class="doc-stamp-img" src="assets/docs/stampila_euro_ecologic.png" alt="" />` : '<div class="doc-stamp-missing">STAMPILA<br/>LIPSA</div>'}
            </div>
          </td>
          <td>
            <div class="doc-expeditie-grid">
              <div>Delegat:</div><div>${esc(model.userName || '-')}</div>
              <div>BI / CI</div><div>${esc(model.userCi || '-')}</div>
              <div>Nr. Auto</div><div>${esc(model.carNumar || '-')}</div>
              <div>Data:</div><div>${esc(dt.short)}</div>
            </div>
            <div class="doc-driver-sign-row">
              <span>Semnatura SOFER</span>
              ${driverSignatureUrl ? `<img src="${driverSignatureUrl}" alt="" />` : '<span class="doc-sign-line"></span>'}
            </div>
          </td>
          <td></td>
        </tr>
      </tbody>
    </table>

    ${runningFooter(model, depotEmail, depotPhone, pageIndex, pageTotal)}
  </section>`;
}

function photoPage({ model, index, photoUrl, depotEmail, depotPhone, pageIndex, pageTotal }) {
  return `
  <section class="doc-page">
    <div class="doc-header">
      <img class="doc-header-img" src="assets/docs/header.png" alt="" />
      <div class="doc-header-rule"></div>
    </div>
    <div class="doc-annex-title">${esc(anexaFotoTitle(model, index))}</div>
    <div class="doc-annex-photo-frame">
      <img src="${photoUrl}" alt="" />
    </div>
    ${runningFooter(model, depotEmail, depotPhone, pageIndex, pageTotal)}
  </section>`;
}

/**
 * Construieste HTML-ul complet al documentului (toate paginile) pentru un PV.
 * @param {object} params
 * @param {object} params.model  ProcessVerbalModel-like plain object
 * @param {object} params.driver driver curent (pentru semnatura implicita, neutilizata direct aici)
 * @param {boolean} params.isPreview
 * @param {string[]} params.photoUrls  object URLs pentru pozele adnotate
 * @param {string} params.beneficiarySignatureUrl
 * @param {string} params.driverSignatureUrl
 * @param {boolean} params.stampAvailable
 */
export function buildDocumentHtml(params) {
  const { model, isPreview = false, photoUrls = [] } = params;
  const processTypeUpper = (model.processType || '').trim().toUpperCase();
  const needsAviz = ['AMPLASARE', 'RIDICARE', 'VANZARE'].includes(processTypeUpper);
  const depotEmail = (model.depotRepresentativeEmail || '').trim() || `${withoutDiacritics(model.depotName || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}@eurowc.ro`;
  const depotPhone = (model.depotRepresentativePhone || '').trim() || '0735 214 762';

  // "Zona securizata (fara poza confirmare)" nu mai genereaza o pagina de
  // anexa foto cu placeholder — pur si simplu nu exista nicio poza de anexat
  // in acest caz, mentiunea corespunzatoare apare doar la "Mentiuni" pe
  // pagina 1 (vezi pageOnePv / model.secureAreaNoPhoto).
  const annexUrls = photoUrls;
  const pageTotal = 1 + (needsAviz ? 1 : 0) + annexUrls.length;
  let pageIndex = 0;

  let html = '';
  pageIndex += 1;
  html += pageOnePv({ ...params, depotEmail, depotPhone, isPreview, pageIndex, pageTotal });
  if (needsAviz) {
    pageIndex += 1;
    html += pageTwoAviz({ ...params, depotEmail, depotPhone, pageIndex, pageTotal });
  }

  annexUrls.forEach((url, i) => {
    pageIndex += 1;
    html += photoPage({ model, index: i + 1, photoUrl: url, depotEmail, depotPhone, pageIndex, pageTotal });
  });

  return html;
}

// Textul rosu "va rog sa retrimiteti..." trebuie sa incapa mereu pe UN
// singur rand (vezi shrinkTextToFitOneLine din utils.js) — indiferent de
// lungimea lui (tip proces + adresa de email pot varia). Functie comuna,
// apelata din toate cele 3 locuri unde documentul e randat efectiv (preview
// in-app, tiparire nativa, export PDF din pdf-generate.js) — la fel ca
// shrinkProductsTableToFit (vezi utils.js), apelata imediat dupa, in
// aceleasi 3 locuri.
function fitReturnMessages(root) {
  root.querySelectorAll('.doc-return-message').forEach((el) => shrinkTextToFitOneLine(el));
}

/**
 * Deschide fereastra de tiparire a browserului cu documentul dat, afisand
 * dialogul nativ de "Salveaza ca PDF" (Chrome pe Android).
 */
export async function printDocument(html, suggestedTitle) {
  const printRoot = document.getElementById('print-root');
  printRoot.innerHTML = html;
  // Imaginile (antet, footer, stampila) incep sa se incarce imediat ce sunt
  // inserate in DOM, chiar daca #print-root e "display:none" — asteptam sa
  // se termine ACUM (de obicei aproape instant, fiind deja in cache-ul
  // aplicatiei), inainte de "beforeprint", ca masuratoarea tabelului de
  // produse de mai jos sa vada inaltimea reala a antetului, nu 0.
  await waitForImagesLoaded(printRoot);
  const previousTitle = document.title;
  if (suggestedTitle) document.title = suggestedTitle;
  // #print-root e "display:none" in afara @media print (vezi print.css) —
  // pana nu incepe efectiv tiparirea, elementele din el nu au layout deloc
  // (scrollWidth/clientWidth ar fi 0), deci nu putem calcula micsorarea
  // fontului mai devreme. "beforeprint" e evenimentul care se declanseaza
  // chiar in momentul in care browserul comuta pe stilurile de print,
  // exact cand avem nevoie sa masuram/ajustam.
  const onBeforePrint = () => {
    fitReturnMessages(printRoot);
    balanceProductsTableColumns(printRoot);
    shrinkProductsTableToFit(printRoot);
  };
  window.addEventListener('beforeprint', onBeforePrint);
  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener('afterprint', restore);
    window.removeEventListener('beforeprint', onBeforePrint);
  };
  window.addEventListener('afterprint', restore);
  setTimeout(() => {
    window.print();
    setTimeout(restore, 1500);
  }, 60);
}

/**
 * Ecran de previzualizare in-app a documentului, scalat sa incapa pe
 * telefon, cu buton pentru a deschide dialogul de tiparire/salvare PDF.
 * Documentul (NU restul ecranului — bara de sus/jos raman fixe) poate fi
 * marit prin ciupire (pinch) sau dublu-tap, ca soferul sa poata verifica
 * detalii mici fara sa piarda accesul la butonul Inapoi.
 * @param {() => Promise<void>|void} [onEditAgain] Cand e dat, butonul
 *   "Inapoi" cere confirmare si il apeleaza inainte sa inchida ecranul —
 *   folosit de ecranul de PV DUPA ce PV-ul a fost deja salvat (are numar
 *   real, e deja in istoric), ca sa stearga acea inregistrare inainte sa se
 *   intoarca la formular, evitand un PV gol/gresit ramas in istoric daca
 *   soferul revine sa corecteze ceva. Omis la preview-ul DINAINTE de
 *   salvare (onPreview()), unde nu exista nimic de sters.
 */
export async function openPrintPreview({ html, title = 'Previzualizare document', suggestedFileName, showBadge = false, onConfirmPrint, onPdfReady, onEditAgain }) {
  // Fiecare .doc-page e mutata intr-un "frame" care primeste dimensiunile
  // FINALE (scalate) prin JS, ca layout-ul normal (centrare, spatiere) sa
  // functioneze corect indiferent de transform-ul aplicat paginii interioare.
  const measureHost = el('div', { style: 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0' });
  measureHost.innerHTML = html;
  document.body.appendChild(measureHost);
  // IMPORTANT: asteptam ca imaginile (antet, footer, stampila) sa fie
  // incarcate INAINTE sa masuram orice inaltime mai jos — un <img> fara
  // width/height explicit (ex. ".doc-header-img") are inaltime 0 cat timp
  // nu s-a incarcat, ceea ce ar duce la o estimare gresita a spatiului
  // disponibil pentru tabelul de produse (de obicei imaginile sunt deja in
  // cache-ul aplicatiei, deci asta se rezolva aproape instant).
  await waitForImagesLoaded(measureHost);
  // Inainte sa masuram dimensiunile naturale ale paginii (mai jos) —
  // altfel, daca textul rosu s-ar micsora DUPA masuratoare, inaltimea
  // paginii calculata aici ar ramane cea veche (cu 2 randuri), gresita.
  fitReturnMessages(measureHost);
  balanceProductsTableColumns(measureHost);
  shrinkProductsTableToFit(measureHost);
  const sourcePages = Array.from(measureHost.querySelectorAll('.doc-page'));

  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'preview-screen' });
    async function handleBack() {
      if (onEditAgain) {
        const ok = await confirmDialog({
          title: 'Editezi din nou?',
          message: 'PV-ul a fost deja salvat in istoric. Ca sa nu ramana o inregistrare gresita/goala acolo, cea salvata acum va fi stearsa — dupa ce corectezi, apasa din nou Salveaza.',
          okLabel: 'Da, editez',
          cancelLabel: 'Ramai aici',
        });
        if (!ok) return;
        await onEditAgain();
        // Distinct de un pop normal (undefined) — apelantul (onSave() din
        // screens-pv-form.js) foloseste asta ca sa STEA pe ecranul de
        // formular (deja completat) in loc sa il inchida si el, ca soferul
        // sa poata corecta direct si apasa din nou Salveaza.
        pop({ editAgain: true });
        return;
      }
      pop(undefined);
    }
    const topBar = el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn', onclick: handleBack }, ['←']),
      el('div', { class: 'topbar-title' }, [title]),
    ]);
    screen.appendChild(topBar);
    if (showBadge) screen.appendChild(el('div', { class: 'preview-badge' }, ['PREVIEW']));

    const pagesHost = el('div', { class: 'preview-pages' });
    const frames = sourcePages.map((page) => {
      const naturalWidth = page.offsetWidth;
      const naturalHeight = page.offsetHeight;
      const frame = el('div', { class: 'preview-page-frame' });
      page.style.transformOrigin = 'top left';
      frame.appendChild(page);
      pagesHost.appendChild(frame);
      return { frame, naturalWidth, naturalHeight, page };
    });
    measureHost.remove();

    const zoomResetBtn = el('button', { class: 'preview-zoom-reset', onclick: () => setZoom(1, 0, 0) }, ['✕  100%']);
    const zoomHint = el('div', { class: 'preview-zoom-hint' }, ['Ciupeste documentul ca sa il maresti']);
    const scroller = el('div', { class: 'preview-scroller' }, [pagesHost, zoomResetBtn, zoomHint]);
    screen.appendChild(scroller);

    function applyScale() {
      const containerWidth = scroller.clientWidth - 24;
      frames.forEach(({ frame, naturalWidth, naturalHeight, page }) => {
        const scale = containerWidth / naturalWidth;
        page.style.transform = `scale(${scale})`;
        frame.style.width = `${containerWidth}px`;
        frame.style.height = `${naturalHeight * scale}px`;
      });
    }
    requestAnimationFrame(applyScale);
    window.addEventListener('resize', applyScale);

    // ---------------- zoom / pan scopit STRICT la document ----------------
    // Marim/panoram DOAR .preview-pages (documentul din interiorul
    // scroller-ului) — niciodata bara de sus (butonul Inapoi) sau bara de
    // jos (Printeaza/Salveaza/Trimite), care raman intotdeauna la marime
    // normala si usor de apasat, oricat de mult a marit soferul documentul
    // ca sa verifice un detaliu (vezi si touch-action:pan-y pe
    // .preview-scroller in styles.css, care lasa scroll-ul vertical normal
    // pe mana browserului cat timp nu suntem zoomati, dar ne lasa noua,
    // exclusiv, gestul cu 2 degete).
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 4;
    let zoom = 1;
    let panX = 0;
    let panY = 0;

    function clampPan(z, x, y) {
      const cw = scroller.clientWidth;
      const ch = scroller.clientHeight;
      const contentW = cw * z;
      const contentH = pagesHost.scrollHeight * z; // scrollHeight e neafectat de transform (CSS)
      const minX = Math.min(0, cw - contentW);
      const minY = Math.min(0, ch - contentH);
      return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
    }

    function setZoom(z, x, y) {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      if (zoom <= 1.001) {
        zoom = 1;
        panX = 0;
        panY = 0;
      } else {
        const clamped = clampPan(zoom, x, y);
        panX = clamped.x;
        panY = clamped.y;
      }
      pagesHost.style.transform = zoom === 1 ? '' : `translate(${panX}px, ${panY}px) scale(${zoom})`;
      scroller.classList.toggle('zoomed', zoom > 1);
    }

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    function localPoint(clientX, clientY) {
      const rect = scroller.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    const activePointers = new Map(); // pointerId -> {x,y}, coordonate locale scroller
    let pinch = null; // {startDist, startZoom, startMid, startPan}
    let singlePan = null; // {startX, startY, startPanX, startPanY}
    let lastTap = null; // {time, x, y}

    function startSinglePan(p) {
      singlePan = { startX: p.x, startY: p.y, startPanX: panX, startPanY: panY };
    }

    function onPointerDown(e) {
      // Butonul de reset zoom sta in interiorul .preview-scroller (ca sa
      // poata fi pozitionat peste document) — daca am captura pointerul aici
      // ca la un gest normal, click-ul pe buton ar fi "furat" de scroller
      // (setPointerCapture re-directioneaza si evenimentul click ulterior
      // catre elementul care are capture-ul, nu catre buton). Il excludem.
      if (e.target.closest && e.target.closest('.preview-zoom-reset')) return;
      // setPointerCapture poate arunca eroare in unele situatii (ex. tip de
      // pointer neobisnuit) — nu lasam asta sa opreasca urmarirea gestului.
      try {
        scroller.setPointerCapture?.(e.pointerId);
      } catch (err) {
        /* ignoram — urmarirea prin activePointers functioneaza si fara capture */
      }
      activePointers.set(e.pointerId, localPoint(e.clientX, e.clientY));
      if (activePointers.size === 2) {
        singlePan = null;
        const pts = Array.from(activePointers.values());
        pinch = { startDist: Math.max(1, dist(pts[0], pts[1])), startZoom: zoom, startMid: mid(pts[0], pts[1]), startPan: { x: panX, y: panY } };
      } else if (activePointers.size === 1 && zoom > 1) {
        pinch = null;
        startSinglePan(localPoint(e.clientX, e.clientY));
      }
    }

    function onPointerMove(e) {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, localPoint(e.clientX, e.clientY));
      if (pinch && activePointers.size === 2) {
        e.preventDefault();
        const pts = Array.from(activePointers.values());
        const newDist = dist(pts[0], pts[1]);
        const newMid = mid(pts[0], pts[1]);
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.startZoom * (newDist / pinch.startDist)));
        // ancoram punctul de continut aflat sub degete la inceputul
        // gestului, ca sa ramana sub degete pe tot parcursul (zoom+pan simultan)
        const contentPoint = { x: (pinch.startMid.x - pinch.startPan.x) / pinch.startZoom, y: (pinch.startMid.y - pinch.startPan.y) / pinch.startZoom };
        setZoom(newZoom, newMid.x - contentPoint.x * newZoom, newMid.y - contentPoint.y * newZoom);
      } else if (singlePan && activePointers.size === 1) {
        e.preventDefault();
        const p = localPoint(e.clientX, e.clientY);
        setZoom(zoom, singlePan.startPanX + (p.x - singlePan.startX), singlePan.startPanY + (p.y - singlePan.startY));
      }
    }

    function onPointerUp(e) {
      // Simetric cu excluderea din onPointerDown — daca acest pointer nu a
      // fost retinut acolo (ex. a pornit pe butonul de reset zoom), nu are
      // ce sa "ridicam" aici; altfel am putea declansa gresit un dublu-tap.
      if (!activePointers.has(e.pointerId)) return;
      const wasSinglePointer = activePointers.size === 1;
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) pinch = null;
      if (activePointers.size === 1 && zoom > 1) {
        // ramane un deget jos dupa ce s-a ridicat celalalt din ciupit —
        // continuam panoramarea lin, fara sa astepte un gest nou
        startSinglePan(Array.from(activePointers.values())[0]);
      } else if (activePointers.size === 0) {
        singlePan = null;
        if (wasSinglePointer) {
          // dublu-tap: revenire la 1x daca eram zoomati, altfel marire
          // ancorata pe punctul atins — utila pentru cine nu incearca
          // ciupitul din prima.
          const now = Date.now();
          const p = localPoint(e.clientX, e.clientY);
          if (lastTap && now - lastTap.time < 320 && dist(lastTap, p) < 30) {
            lastTap = null;
            if (zoom > 1) {
              setZoom(1, 0, 0);
            } else {
              const targetZoom = 2.5;
              setZoom(targetZoom, p.x * (1 - targetZoom), p.y * (1 - targetZoom));
            }
          } else {
            lastTap = { time: now, x: p.x, y: p.y };
          }
        }
      }
    }

    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', onPointerUp);
    scroller.addEventListener('pointercancel', onPointerUp);

    // Indiciu discret, o singura data, ca soferul sa stie ca poate ciupi
    // documentul ca sa il mareasca — dispare singur dupa cateva secunde.
    requestAnimationFrame(() => {
      zoomHint.classList.add('visible');
      setTimeout(() => zoomHint.classList.remove('visible'), 2500);
    });

    const fileNameBase = suggestedFileName || fileToken(title) || 'Proces-Verbal';
    // Generam PDF-ul o singura data si il refolosim daca soferul apasa mai
    // multe butoane (Salveaza, apoi Trimite) — evitam randarea de doua ori.
    let cachedBlobPromise = null;
    function getPdfBlob() {
      if (!cachedBlobPromise) cachedBlobPromise = generateDocumentPdfBlob(html);
      return cachedBlobPromise;
    }
    // Pornim generarea PDF-ului DIN ACEST MOMENT (nu abia la apasarea unui
    // buton) — randarea (mai ales cu poze la Anexa Foto) poate lua o secunda
    // sau mai mult pe telefoane mai slabe. Daca am astepta acest timp DUPA
    // click, pana apelam efectiv navigator.share() in shareOrDownloadPdf()
    // ar fi putut trece prea mult timp de la gestul soferului (tap), iar
    // browserul poate refuza share() ca sigur nu mai vine de la o actiune
    // directa a utilizatorului — evidente reale au aratat exact asta
    // ("NotAllowedError: Permission denied" din navigator.share()). Cu
    // PDF-ul deja gata cand apasa "Trimite", share() porneste aproape
    // instant dupa tap. Dar generarea eager singura nu ajunge daca soferul
    // apasa INAINTE sa se termine — de-aia butoanele raman dezactivate (mai
    // jos) pana cand promisiunea chiar se rezolva, ca await-ul din click sa
    // nu mai astepte NIMIC (garantand ca share() ramane in fereastra de timp
    // a gestului).
    const saveBtn = el('button', { class: 'btn btn-outline', style: 'flex:1', disabled: true }, ['⏳  Se pregateste PDF-ul...']);
    const sendBtn = el('button', { class: 'btn btn-outline', style: 'flex:1', disabled: true }, ['⏳  Se pregateste PDF-ul...']);
    const sendBtnLabel = '📤  Trimite';
    // IMPORTANT — cauza reala a "NotAllowedError: Permission denied": nu
    // conta doar CA blob-ul era deja gata la click (pdfReady), ci si faptul
    // ca handler-ul facea in continuare "await getPdfBlob()" inainte de
    // share() — un "await" pe o promisiune deja rezolvata tot introduce un
    // microtask intre gestul de tap si apelul efectiv navigator.share(), iar
    // pe unele WebView-uri Android acel singur microtask e suficient ca sa
    // piarda "user activation". Fix real: pastram blob-ul GATA intr-o
    // variabila simpla (readyBlob), nu doar un boolean — click-ul foloseste
    // acea variabila DIRECT, sincron, fara niciun await inainte de a apela
    // shareOrDownloadPdf() (care la randul ei ajunge sincron pana la
    // navigator.share() — vezi pdf-generate.js). Asa, share() porneste in
    // acelasi tick de JS ca gestul de tap, cu zero intarziere intre ele.
    let readyBlob = null;
    let readyError = null;
    let settled = false;
    getPdfBlob()
      .then((blob) => {
        readyBlob = blob;
        settled = true;
        saveBtn.textContent = '💾  Salveaza PDF';
        saveBtn.disabled = false;
        sendBtn.textContent = sendBtnLabel;
        sendBtn.disabled = false;
        // Sincronizare in cloud (Istoric PV din admin) — vezi
        // uploadPvRecordToCloud() din auth.js. Refolosim exact acest blob
        // (PDF-ul deja generat pentru Salveaza/Trimite), fara sa mai randam
        // documentul a doua oara. Fire-and-forget: nu blocheaza si nu arata
        // nicio eroare soferului daca esueaza — PV-ul e deja salvat local.
        if (onPdfReady) onPdfReady(blob);
      })
      .catch((e) => {
        // Lasam butoanele activate chiar daca generarea eager a esuat —
        // click-ul insusi va arata eroarea reala (readyError) in loc sa
        // blocheze soferul definitiv.
        readyError = e;
        settled = true;
        saveBtn.textContent = '💾  Salveaza PDF';
        saveBtn.disabled = false;
        sendBtn.textContent = sendBtnLabel;
        sendBtn.disabled = false;
      });

    let saveBusy = false;
    saveBtn.addEventListener('click', () => {
      if (saveBusy || !settled) return;
      if (readyError) {
        showToast('Nu am putut genera PDF-ul: ' + readyError.message, { danger: true });
        return;
      }
      saveBusy = true;
      const originalLabel = saveBtn.textContent;
      saveBtn.textContent = 'Se salveaza...';
      saveBtn.disabled = true;
      try {
        // Descarcare DIRECTA (nu prin meniul de distribuire) — cea mai
        // sigura metoda sa garantam numele exact al fisierului salvat
        // ("PVA - CLIENT - ADRESA - DATA.pdf"). Meniul de distribuire al
        // Android poate, la unele combinatii telefon/aplicatie (ex:
        // "Salveaza in Fisiere"), sa ignore numele nostru si sa puna unul
        // generat de sistem — de-asta NU trecem prin el aici.
        const safeName = downloadPdf(readyBlob, fileNameBase);
        showToast(`PDF salvat in Descarcari: ${safeName}`);
      } catch (e) {
        console.error(e);
        showToast('Nu am putut salva PDF-ul: ' + e.message, { danger: true });
      } finally {
        saveBusy = false;
        saveBtn.textContent = originalLabel;
        saveBtn.disabled = false;
      }
    });

    let sendBusy = false;
    sendBtn.addEventListener('click', async () => {
      if (sendBusy || !settled) return;
      if (readyError) {
        showToast('Nu am putut genera PDF-ul: ' + readyError.message, { danger: true });
        return;
      }
      sendBusy = true;
      const originalLabel = sendBtn.textContent;
      sendBtn.textContent = 'Se trimite...';
      sendBtn.disabled = true;
      try {
        // Niciun await inainte de linia de mai jos — vezi comentariul de la
        // declararea lui readyBlob. Aici mergem pe meniul nativ de
        // distribuire (WhatsApp, Email etc.) — util pentru trimitere rapida
        // catre alta aplicatie; daca telefonul nu suporta distribuirea,
        // descarcam fisierul ca rezerva.
        const result = await shareOrDownloadPdf(readyBlob, fileNameBase, { title: fileNameBase });
        if (result.status === 'downloaded') {
          // Includem motivul exact (vezi shareOrDownloadPdf) direct in toast —
          // fara acces la depanare USB / chrome://inspect pe telefonul
          // soferului, acesta e singurul mod sa aflam de ce nu s-a deschis
          // meniul de distribuire (WhatsApp etc.) in loc sa descarce fisierul.
          showToast(`Trimiterea nu a fost posibila, PDF-ul a fost descarcat. (${result.reason || 'motiv necunoscut'})`, { danger: true });
        }
      } catch (e) {
        console.error(e);
        showToast('Nu am putut trimite PDF-ul: ' + e.message, { danger: true });
      } finally {
        sendBusy = false;
        sendBtn.textContent = originalLabel;
        sendBtn.disabled = false;
      }
    });

    const saveSendRow = el('div', { style: 'display:flex;gap:10px' }, [saveBtn, sendBtn]);

    const bottomBar = el('div', { class: 'preview-bottom-bar' }, [
      el(
        'button',
        {
          class: 'btn btn-block btn-primary',
          onclick: () => {
            if (onConfirmPrint) onConfirmPrint();
            printDocument(html, suggestedFileName);
          },
        },
        ['🖨  Printeaza / Salveaza ca PDF']
      ),
      saveSendRow,
    ]);
    screen.appendChild(bottomBar);

    return screen;
  });
}
