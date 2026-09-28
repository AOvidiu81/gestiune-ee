// screens-pv-form.js — formularul central: completarea si generarea unui
// proces verbal (AMPLASARE / RIDICARE / SERVISARE / LIPSA ACCES / VANZARE).
// Port simplificat dupa process_verbal_details_screen.dart: pastreaza
// fluxul esential (client/beneficiar, produse din catalog, poza de
// confirmare cu poarta GPS, semnatura beneficiarului, generare document,
// salvare in istoric). Include si un import rapid din text WhatsApp
// (whatsapp-import.js) — completare aproximativa, de verificat manual.

import { el, uuid, formatDateTimeRo, blobToDataUrl, withoutDiacritics, countyAbbreviation, matchCountyCodeInText, extractCountyFromAddress, addressWithoutCounty } from './utils.js';
import { pushScreen } from './router.js';
import { CatalogRepo, PvRepo, ClientLocationRepo, DepotRepo } from './db.js';
import {
  textField,
  textAreaField,
  selectField,
  sectionCard,
  primaryButton,
  outlineButton,
  showToast,
  confirmDialog,
  pickFromList,
  pickMultiFromList,
  captureSignature,
  gpsAccuracyGate,
  captureCameraPhoto,
} from './components.js';
import { DEFAULT_PRODUCT_CATALOG, DEFAULT_AUXILIARY_BY_CATEGORY, COMPANY_INFO } from './catalog-defaults.js';
import { annotatePhotoWithMetadata } from './photo-annotate.js';
import { nextPvNumber, nextAvizNumber, prefixForType, displayPvNumber, displayAvizNumber } from './pv-numbering.js';
import { buildDocumentHtml, openPrintPreview } from './pdf-print.js';
import { openWhatsAppImportDialog } from './whatsapp-import.js';
import { uploadPvRecordToCloud } from './auth.js';
import { saveContact } from './vcard.js';

const NA = 'N/A';
const NEEDS_AVIZ = new Set(['AMPLASARE', 'RIDICARE', 'VANZARE']);

let logoImageCache = null;
function loadLogoImage() {
  if (logoImageCache) return logoImageCache;
  logoImageCache = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'assets/logo/euro_ecologic_mark.png';
  });
  return logoImageCache;
}

async function ensureCatalogSeeded() {
  const existing = await CatalogRepo.getAll();
  if (existing.length) return;
  const models = new Set([...Object.keys(DEFAULT_PRODUCT_CATALOG), ...Object.keys(DEFAULT_AUXILIARY_BY_CATEGORY)]);
  for (const model of models) {
    await CatalogRepo.save({ model, types: DEFAULT_PRODUCT_CATALOG[model] || [], aux: DEFAULT_AUXILIARY_BY_CATEGORY[model] || [] });
  }
}

/** Camp de serie cu prefixul fix "EE-" afisat lipit de input (nu face parte
 * din valoarea salvata) — soferul tasteaza doar cifrele/literele de dupa
 * prefix; prefixul e adaugat la afisarea in PDF (pdf-print.js). */
function seriesField({ label, value, onInput }) {
  const input = el('input', { class: 'field-input series-suffix-input', value: value || '' });
  input.addEventListener('input', () => onInput(input.value));
  const wrap = el('div', { class: 'series-input-wrap' }, [el('span', { class: 'series-prefix' }, ['EE-']), input]);
  return el('div', { class: 'field' }, [el('label', { class: 'field-label' }, [label]), wrap]);
}

function newProductEntry() {
  return { id: uuid(), model: '', type: '', series: [''], aux: [], condition: 'Produs Nou' };
}

function isEntryComplete(entry, noSeriesMode) {
  if (!entry.model.trim() || !entry.type.trim()) return false;
  if (noSeriesMode) return true;
  return entry.series.every((s) => s.trim());
}

function productModelSummary(entries) {
  return entries
    .filter((e) => e.model.trim())
    .map((e) => {
      const base = e.type.trim() ? `${e.model.trim()} (${e.type.trim()})` : e.model.trim();
      const aux = e.aux.filter((a) => a.trim()).join(', ');
      return aux ? `${base} | ${aux}` : base;
    })
    .join(';');
}

function productSeriesEncoded(entries, noSeriesMode) {
  return entries
    .filter((e) => e.model.trim())
    .map((e) => (noSeriesMode ? '' : e.series.map((s) => s.trim()).filter(Boolean).join(',')))
    .join(';');
}

export async function openProcessVerbalForm({ driver, car, depot, processType }) {
  await ensureCatalogSeeded();
  const catalogEntries = await CatalogRepo.getAll();
  const catalogByModel = {};
  const auxByModel = {};
  catalogEntries.forEach((c) => {
    catalogByModel[c.model] = c.types || [];
    auxByModel[c.model] = c.aux || [];
  });
  const savedModels = Object.keys(catalogByModel).sort();
  // Toate depozitele configurate (inclusiv cele secundare/colaboratoare) —
  // folosite pentru a determina automat, dupa ce se gaseste "La Contract" in
  // comanda, la ce adresa de e-mail trebuie retrimis P.V.-ul semnat: fie dupa
  // denumirea depozitului mentionata direct (ex: "Craiova", "Sibiu") sau un
  // cuvant cheie de contract/client (ex: "NOVALIS"), fie — cand nu apare nici
  // denumirea, nici cuvantul cheie — dupa codul de judet mentionat (ex: "HD",
  // "Hunedoara") — vezi resolveAvizReturnEmail().
  const allDepots = await DepotRepo.getAll().catch(() => []);

  // Exceptie: HARGHITA [HR] nu e un depozit de teren, ci sediul central al
  // firmei (Vlahita, jud. Harghita — vezi COMPANY_INFO), asa ca P.V.-urile
  // de acolo se retrimit la adresa oficiala a firmei, nu la un "depozit".
  const SPECIAL_COUNTY_EMAILS = { HR: COMPANY_INFO.email };

  // "Depozit CRAIOVA" -> "CRAIOVA" (scoate prefixul comun din denumire, ca sa
  // ramana doar partea distinctiva de cautat in text).
  function depotNameKeyword(name) {
    return withoutDiacritics(name || '').toUpperCase().replace(/^DEPOZIT\s+/, '').trim();
  }

  function resolveAvizReturnEmail(contractReferenceRaw) {
    const normalizedContract = withoutDiacritics(contractReferenceRaw || '').toUpperCase();

    // 1) Cuvant cheie de contract/client (ex: "NOVALIS") — cea mai specifica
    // potrivire, verificata prima. Un depozit cu cuvant cheie completat NU
    // mai e luat in calcul mai jos, la potrivirea dupa judet — altfel doua
    // depozite pe acelasi judet (ex: Depozit SIBIU si Depozit NOVALIS,
    // ambele SB) s-ar calca in picioare, iar rezultatul ar depinde de
    // ordinea intamplatoare in care sunt sincronizate local.
    const keywordMatch = allDepots.find((d) => {
      const keyword = (d.contractKeyword || '').trim();
      if (!keyword || !(d.representativeEmail || '').trim()) return false;
      return normalizedContract.includes(withoutDiacritics(keyword).toUpperCase());
    });
    if (keywordMatch) return keywordMatch.representativeEmail.trim();

    // 2) Denumirea depozitului secundar mentionata direct in text (ex:
    // soferul scrie "Depozit Craiova" sau doar "Craiova"). Necesar pentru ca
    // orasul de resedinta al unui judet nu e mereu acelasi cu numele
    // judetului insusi (Craiova e orasul, dar judetul e Dolj — "Craiova" nu
    // s-ar fi gasit niciodata la pasul (3), care cauta doar judete). Doar
    // depozitele SECUNDARE conteaza aici — cel Principal e oricum
    // fallback-ul implicit de mai jos, nu are nevoie de potrivire dupa nume.
    const nameMatch = allDepots.find((d) => {
      if (d.depotType !== 'secundar') return false;
      const nameKeyword = depotNameKeyword(d.name);
      if (!nameKeyword || !(d.representativeEmail || '').trim()) return false;
      return normalizedContract.includes(nameKeyword);
    });
    if (nameMatch) return nameMatch.representativeEmail.trim();

    // 3) Codul de judet mentionat in text — doar printre depozitele FARA
    // cuvant cheie de contract (vezi pasul 1).
    const code = matchCountyCodeInText(contractReferenceRaw);
    if (code) {
      if (SPECIAL_COUNTY_EMAILS[code]) return SPECIAL_COUNTY_EMAILS[code];
      // Depozitele sincronizate din admin au deja "countyCode" setat explicit
      // (ales dintr-o lista de judete, nu ghicit din denumire) — mult mai
      // sigur decat countyAbbreviation(d.name), care ramane doar ca fallback
      // pentru un depozit adaugat manual, local, fara sincronizare.
      const match = allDepots.find(
        (d) =>
          !(d.contractKeyword || '').trim() &&
          (d.countyCode || countyAbbreviation(d.name)) === code &&
          (d.representativeEmail || '').trim()
      );
      if (match) return match.representativeEmail.trim();
    }
    return (
      (depot.representativeEmail || '').trim() ||
      `${withoutDiacritics(depot.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}@eurowc.ro`
    );
  }

  return pushScreen(({ pop }) => {
    const needsAviz = NEEDS_AVIZ.has(processType);
    const isLipsaAcces = processType === 'LIPSA ACCES';

    // ---------------- state ----------------
    const state = {
      clientName: '',
      field1: '',
      contractReference: '',
      beneficiaryResponsible: '',
      beneficiaryPhone: '',
      beneficiaryCi: '',
      beneficiaryNr: '',
      observatii: '',
      productQuantity: '1',
      nrFactura: '',
      valoare: '',
      modalitatePlata: 'CHITANTA',
      plataNeefectuata: false,
      noSeriesMode: false,
      beneficiaryCiUnavailable: false,
      beneficiaryAbsentFromLocation: false,
      secureAreaNoPhoto: false,
      productEntries: [newProductEntry()],
      confirmationPhotos: [], // { rawBlob, previewUrl }
      gps: '',
      // Adresa dedusa din coordonatele GPS (Jud./Localitate/Strada, via
      // Nominatim — vezi gpsAccuracyGate in components.js), folosita DOAR in
      // bannerul ars pe poza de confirmare (photoOverlayLines mai jos).
      // Pretutindeni altundeva in PV (Locatia ceruta, Anexa Foto, Aviz,
      // fisier, admin) ramane adresa scrisa de sofer in comanda — neschimbata.
      gpsAddress: '',
      confirmationTime: '',
      beneficiarySignatureBlob: null,
      beneficiarySignatureUrl: '',
    };

    let missing = new Set();
    let showHints = false;
    let isBusy = false;

    function hasAtLeastOneCompleteProduct() {
      if (!state.productEntries.length) return false;
      return state.productEntries.every((e) => isEntryComplete(e, state.noSeriesMode));
    }

    function validate() {
      const m = new Set();
      if (!state.clientName.trim()) m.add('clientName');
      if (!state.field1.trim()) m.add('field1');
      if (!isLipsaAcces && !state.beneficiaryResponsible.trim()) m.add('beneficiaryResponsible');
      if (!isLipsaAcces && !state.beneficiaryPhone.trim()) m.add('beneficiaryPhone');
      if (!state.beneficiaryCi.trim() && !state.beneficiaryCiUnavailable) m.add('beneficiaryCi');
      if (!state.beneficiaryNr.trim() && !state.beneficiaryCiUnavailable) m.add('beneficiaryNr');
      if (!state.beneficiarySignatureUrl && !state.beneficiaryAbsentFromLocation) m.add('beneficiarySignature');
      const qty = parseInt(state.productQuantity, 10) || 0;
      if (qty <= 0 || !hasAtLeastOneCompleteProduct()) m.add('productDetails');
      const hasPhoto = state.confirmationPhotos.length > 0;
      if (!hasPhoto && !state.secureAreaNoPhoto) m.add('confirmationPhoto');
      missing = m;
      showHints = true;
      return m;
    }

    function validationMessage(m) {
      if (m.has('productDetails')) return 'Completeaza cantitatea si toate produsele adaugate (model, tip, serie).';
      if (m.has('confirmationPhoto')) return 'Fara poza de confirmare nu poti continua.';
      if (m.has('beneficiarySignature')) return 'Adauga semnatura beneficiarului.';
      return 'Completeaza campurile obligatorii marcate.';
    }

    // ---------------- screen shell ----------------
    const topBarColors = { AMPLASARE: '#EAF7EC', RIDICARE: '#FFE9EE', SERVISARE: '#F0E9FF', 'LIPSA ACCES': '#FFF1E2', VANZARE: '#EAF2FF' };
    const screen = el('div', { class: 'screen' });
    const topBarEl = el('div', { class: 'topbar', style: `background:${topBarColors[processType] || '#fff'}` }, [
      el('button', { class: 'icon-btn', onclick: () => pop(undefined) }, ['←']),
      el('div', { class: 'topbar-title' }, [`P.V. — ${processType}`]),
      el('div', { class: 'topbar-spacer' }),
    ]);
    const bodyHost = el('div', {});
    const previewBtn = outlineButton('👁 Preview', () => onPreview());
    const saveBtn = primaryButton('Genereaza Proces Verbal', () => onSave());
    const bottomBar = el('div', { class: 'bottom-actions' }, [previewBtn, saveBtn]);

    screen.appendChild(topBarEl);
    screen.appendChild(el('div', { class: 'screen-scroll' }, [bodyHost]));
    screen.appendChild(bottomBar);

    render();

    // ---------------- render ----------------
    function render() {
      bodyHost.innerHTML = '';
      bodyHost.appendChild(el('div', { style: 'margin-bottom:10px' }, [outlineButton('📋 Importa din WhatsApp', onImportFromWhatsApp)]));
      bodyHost.appendChild(renderBeneficiarySection());
      if (processType === 'VANZARE') bodyHost.appendChild(renderFinancialSection());
      bodyHost.appendChild(renderConfirmationSection());
      if (needsAviz) {
        bodyHost.appendChild(el('div', { class: 'info-box' }, ['ℹ Pentru acest tip se va genera automat si Aviz de insotire a marfii.']));
      }
    }

    function fieldWithError(key, factory) {
      const node = factory(showHints && missing.has(key) ? 'Camp obligatoriu.' : undefined);
      return node;
    }

    function renderBeneficiarySection() {
      const sectionTitle = processType === 'VANZARE' ? 'Detalii Cumparator / Beneficiar' : 'Detalii Beneficiar';
      const locationLabel = { RIDICARE: 'Locatia de ridicare ceruta', SERVISARE: 'Locatia interventiei', 'LIPSA ACCES': 'Locatia fara acces' }[processType] || 'Locatia de amplasare ceruta';

      const clientField = fieldWithError('clientName', (err) =>
        textField({ label: processType === 'VANZARE' ? 'Nume Cumparator / Beneficiar' : 'Nume Client', value: state.clientName, required: true, errorText: err, onInput: (v) => { state.clientName = v; missing.delete('clientName'); } })
      );
      const field1El = fieldWithError('field1', (err) => textField({ label: locationLabel, value: state.field1, required: true, errorText: err, onInput: (v) => { state.field1 = v; missing.delete('field1'); } }));
      const contractEl = needsAviz ? textField({ label: 'La Contract (optional)', value: state.contractReference, onInput: (v) => (state.contractReference = v) }) : null;
      const respEl = fieldWithError('beneficiaryResponsible', (err) =>
        textField({ label: isLipsaAcces ? 'Persoana responsabila (optional)' : 'Persoana responsabila', value: state.beneficiaryResponsible, errorText: err, onInput: (v) => { state.beneficiaryResponsible = v; missing.delete('beneficiaryResponsible'); } })
      );
      const phoneEl = fieldWithError('beneficiaryPhone', (err) =>
        textField({ label: isLipsaAcces ? 'Telefon (optional)' : 'Telefon', value: state.beneficiaryPhone, errorText: err, onInput: (v) => { state.beneficiaryPhone = v; missing.delete('beneficiaryPhone'); } })
      );
      // Salveaza contactul beneficiarului in agenda telefonului (vcard.js) —
      // numele clientului + persoana responsabila ca nume de contact, numele
      // clientului ca firma (ORG) si telefonul completat mai sus. Pusa aici,
      // imediat dupa campul de telefon, ca soferul sa poata salva contactul
      // de indata ce a completat numarul, fara sa mai caute alt buton.
      const saveContactBtn = outlineButton(
        '📇 Salveaza contact in agenda',
        async () => {
          if (!state.clientName.trim() && !state.beneficiaryResponsible.trim() && !state.beneficiaryPhone.trim()) {
            showToast('Completeaza cel putin numele sau telefonul ca sa poti salva contactul.');
            return;
          }
          const contactName = [state.clientName.trim(), state.beneficiaryResponsible.trim()].filter(Boolean).join(' - ');
          await saveContact({
            name: contactName,
            org: state.clientName.trim(),
            phone: state.beneficiaryPhone.trim(),
          });
        }
      );

      const ciField = textField({
        label: 'CI',
        value: state.beneficiaryCi,
        readOnly: state.beneficiaryCiUnavailable,
        errorText: showHints && missing.has('beneficiaryCi') ? 'Obligatoriu.' : undefined,
        onInput: (v) => { state.beneficiaryCi = v; missing.delete('beneficiaryCi'); },
      });
      const nrField = textField({
        label: 'Nr',
        value: state.beneficiaryNr,
        readOnly: state.beneficiaryCiUnavailable,
        errorText: showHints && missing.has('beneficiaryNr') ? 'Obligatoriu.' : undefined,
        onInput: (v) => { state.beneficiaryNr = v; missing.delete('beneficiaryNr'); },
      });
      const ciRow = el('div', { style: 'display:flex;gap:10px' }, [el('div', { style: 'flex:1' }, [ciField]), el('div', { style: 'flex:1' }, [nrField])]);

      const ciToggle = el('button', { class: `btn btn-outline btn-block`, style: state.beneficiaryCiUnavailable ? 'background:#ffd8d8;border-color:#cc3b3b;color:#111' : 'background:#ddf7dd;border-color:#4fa85d;color:#111', onclick: () => { state.beneficiaryCiUnavailable = !state.beneficiaryCiUnavailable; if (state.beneficiaryCiUnavailable) { state.beneficiaryCi = NA; state.beneficiaryNr = NA; missing.delete('beneficiaryCi'); missing.delete('beneficiaryNr'); } else { if (state.beneficiaryCi === NA) state.beneficiaryCi = ''; if (state.beneficiaryNr === NA) state.beneficiaryNr = ''; } render(); } }, ['🪪 CI indisponibil']);
      const absentToggle = el('button', { class: 'btn btn-outline btn-block', style: state.beneficiaryAbsentFromLocation ? 'background:#ffd8d8;border-color:#cc3b3b;color:#111' : 'background:#ddf7dd;border-color:#4fa85d;color:#111', onclick: () => { state.beneficiaryAbsentFromLocation = !state.beneficiaryAbsentFromLocation; if (state.beneficiaryAbsentFromLocation) { state.beneficiarySignatureBlob = null; state.beneficiarySignatureUrl = ''; missing.delete('beneficiarySignature'); } render(); } }, ['🧍 Beneficiar absent']);
      const toggleRow = el('div', { style: 'display:flex;gap:10px;margin-top:6px' }, [el('div', { style: 'flex:1' }, [ciToggle]), el('div', { style: 'flex:1' }, [absentToggle])]);

      const sigError = showHints && missing.has('beneficiarySignature') && !state.beneficiaryAbsentFromLocation;
      const sigBtn = outlineButton(
        state.beneficiaryAbsentFromLocation ? 'Semnatura beneficiar — N/A' : state.beneficiarySignatureUrl ? 'Semnatura beneficiar salvata ✓' : 'Semnatura beneficiar',
        async () => {
          const blob = await captureSignature({ title: 'Semnatura beneficiar' });
          if (!blob) return;
          state.beneficiarySignatureBlob = blob;
          state.beneficiarySignatureUrl = await blobToDataUrl(blob);
          missing.delete('beneficiarySignature');
          render();
        },
        { disabled: state.beneficiaryAbsentFromLocation, error: sigError }
      );

      const children = [clientField, field1El, contractEl, respEl, phoneEl, saveContactBtn, ciRow, toggleRow, el('div', { style: 'height:10px' })];
      if (sigError) children.push(el('div', { class: 'hint-text' }, ['Semnatura beneficiarului este obligatorie.']));
      children.push(sigBtn);
      if (state.beneficiarySignatureUrl) children.push(el('img', { src: state.beneficiarySignatureUrl, style: 'height:70px;margin-top:8px;object-fit:contain;background:#fff;border:1px solid var(--border);border-radius:8px;padding:4px' }));

      return sectionCard(sectionTitle + ':', children);
    }

    function renderFinancialSection() {
      const nrFacturaEl = textField({ label: 'Nr. Factura', value: state.nrFactura, onInput: (v) => (state.nrFactura = v) });
      const valoareEl = textField({ label: 'Valoare (LEI + TVA)', value: state.valoare, onInput: (v) => (state.valoare = v) });
      const modalitateEl = selectField({
        label: 'Modalitate plata',
        value: state.modalitatePlata,
        options: ['OP', 'BO', 'CHITANTA', 'CARD'],
        onChange: (v) => (state.modalitatePlata = v),
      });
      const children = [nrFacturaEl, valoareEl, modalitateEl];
      if (state.plataNeefectuata) {
        children.push(
          el('div', { class: 'warning-box' }, [
            '⚠ Plata neefectuata.',
            el('button', { style: 'margin-left:auto;background:none;border:none;color:#8f2b41', onclick: () => { state.plataNeefectuata = false; render(); } }, ['✕']),
          ])
        );
      }
      return sectionCard('Detalii Financiare:', children);
    }

    function renderProductGroup(entry, index) {
      const availableTypes = catalogByModel[entry.model.trim()] || [];
      const availableAux = auxByModel[entry.model.trim()] || [];
      const hasError = showHints && missing.has('productDetails');

      const modelField = textField({ label: 'Model produs', value: entry.model, readOnly: true });
      const modelPickBtn = el('button', { class: 'pick-action-btn', onclick: async () => {
        const selected = await pickFromList({ title: 'Alege Model Produs', values: savedModels });
        if (!selected) return;
        entry.model = selected;
        if (!availableTypes.includes(entry.type)) { entry.type = ''; entry.aux = []; }
        missing.delete('productDetails');
        render();
      } }, ['+']);

      const typeField = textField({ label: 'Tip produs', value: entry.type, readOnly: true, placeholder: availableTypes.length ? undefined : 'Alege mai intai modelul' });
      const typePickBtn = el('button', { class: 'pick-action-btn', disabled: !availableTypes.length, onclick: async () => {
        const selected = await pickFromList({ title: 'Alege Tip Produs', values: availableTypes });
        if (!selected) return;
        entry.type = selected;
        missing.delete('productDetails');
        render();
      } }, ['+']);

      const rows = [
        el('div', { class: 'field-with-action' }, [modelField, modelPickBtn]),
        el('div', { class: 'field-with-action' }, [typeField, typePickBtn]),
      ];

      if (availableAux.length) {
        const auxSummary = el('div', { class: 'aux-summary' }, [entry.aux.length ? entry.aux.join(', ') : 'Niciun element selectat']);
        const auxWrap = el('div', {}, [el('div', { class: 'field-label' }, ['Elemente auxiliare']), auxSummary]);
        const auxBtn = el('button', { class: 'pick-action-btn', onclick: async () => {
          const result = await pickMultiFromList({ title: 'Elemente auxiliare', values: availableAux, selected: entry.aux });
          if (result === null) return;
          entry.aux = result.sort();
          render();
        } }, ['☑']);
        rows.push(el('div', { class: 'field-with-action' }, [auxWrap, auxBtn]));
      }

      if (processType === 'VANZARE') {
        rows.push(selectField({ label: 'Stare produs', value: entry.condition, options: ['Produs Nou', 'Produs Second Hand'], onChange: (v) => (entry.condition = v) }));
      }

      if (processType === 'SERVISARE' && index === 0) {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = state.noSeriesMode;
        cb.addEventListener('change', () => { state.noSeriesMode = cb.checked; missing.delete('productDetails'); render(); });
        rows.push(
          el('label', { class: 'checkbox-row' }, [cb, el('div', {}, [el('div', { class: 'checkbox-label' }, ['Fara serii individuale']), el('div', { class: 'checkbox-sub' }, ['Cantitatea introdusa va fi trecuta ca atare, fara serii.'])])])
        );
      }

      if (!state.noSeriesMode) {
        entry.series.forEach((series, si) => {
          const sField = seriesField({ label: `Serie ${si + 1}`, value: series, onInput: (v) => { entry.series[si] = v; missing.delete('productDetails'); } });
          const row = el('div', { class: 'series-row' }, [sField]);
          if (entry.series.length > 1) {
            row.appendChild(el('button', { class: 'series-remove', onclick: () => { entry.series.splice(si, 1); syncTotalQuantity(); render(); } }, ['⊖']));
          }
          rows.push(row);
        });
        rows.push(el('button', { class: 'btn btn-text', style: 'padding-left:0', onclick: () => { entry.series.push(''); syncTotalQuantity(); render(); } }, ['+ Adauga serie']));
      }

      const head = el('div', { class: 'product-group-head' }, [
        el('div', { class: 'grow' }, [`Tip produs ${index + 1}`]),
        state.productEntries.length > 1 ? el('button', { style: 'background:none;border:none;color:var(--danger);font-size:18px', onclick: () => { state.productEntries.splice(index, 1); syncTotalQuantity(); render(); } }, ['🗑']) : null,
      ]);

      return el('div', { class: `product-group${hasError ? ' has-error' : ''}` }, [head, ...rows]);
    }

    function syncTotalQuantity() {
      const total = state.productEntries.reduce((sum, e) => sum + (state.noSeriesMode ? 0 : e.series.length), 0);
      if (total > 0) state.productQuantity = String(total);
    }

    function renderConfirmationSection() {
      const obsBtn = outlineButton(state.observatii.trim() ? 'Editeaza observatii' : 'Adauga observatii', async () => {
        const result = await openObservatiiEditor(state.observatii);
        if (result === undefined) return;
        state.observatii = result;
        render();
      });

      const qtyField = textField({
        label: 'Cantitate Produse',
        value: state.productQuantity,
        errorText: showHints && missing.has('productDetails') ? 'Camp obligatoriu.' : undefined,
        onInput: (v) => {
          state.productQuantity = v.replace(/[^0-9]/g, '');
          const qty = parseInt(state.productQuantity, 10);
          if (qty > 0 && state.productEntries.length) {
            const first = state.productEntries[0];
            while (first.series.length < qty) first.series.push('');
            while (first.series.length > qty) first.series.pop();
          }
        },
      });

      const groupsHost = el('div', {}, state.productEntries.map((entry, i) => renderProductGroup(entry, i)));
      const addTypeBtn = outlineButton('+ Adauga tip produs nou', () => { state.productEntries.push(newProductEntry()); render(); });

      const secureCb = el('input', { type: 'checkbox' });
      secureCb.checked = state.secureAreaNoPhoto;
      secureCb.addEventListener('change', () => {
        state.secureAreaNoPhoto = secureCb.checked;
        if (secureCb.checked) missing.delete('confirmationPhoto');
        render();
      });
      // Bifarea asta nu mai cere soferului sa scrie observatii — mentiunea
      // "ZONA SECURIZATA / FOTO INTERZIS" e adaugata automat in caseta
      // "Mentiuni" de pe PV (vezi model.secureAreaNoPhoto in pdf-print.js),
      // si nu se mai creeaza nicio pagina de anexa foto pentru acest caz.
      const secureRow = el('label', { class: 'checkbox-row' }, [secureCb, el('div', {}, [el('div', { class: 'checkbox-label' }, ['Zona securizata (fara poza confirmare)']), el('div', { class: 'checkbox-sub' }, ['La PV va aparea automat, la Mentiuni: "Zona Securizata / Foto Interzis".'])])]);

      const maxPhotosReached = state.confirmationPhotos.length >= 5;
      const photoBtnError = showHints && missing.has('confirmationPhoto');
      const photoBtn = outlineButton(isBusy ? 'Se proceseaza...' : maxPhotosReached ? 'Ai atins limita de 5 poze' : '📷 Adauga Poza', () => onCapturePhoto(), { disabled: maxPhotosReached || isBusy, error: photoBtnError });

      const photosHost = el('div', {});
      if (state.confirmationPhotos.length) {
        photosHost.appendChild(el('div', { style: 'font-weight:700;margin:10px 0 8px' }, ['Poze de confirmare adaugate']));
        state.confirmationPhotos.forEach((photo, idx) => {
          photosHost.appendChild(
            el('div', { class: 'photo-item' }, [
              el('div', { class: 'photo-item-head' }, [el('div', { class: 'grow' }, [`ANEXA FOTO ${idx + 1}`]), el('button', { class: 'photo-remove-btn', onclick: () => { state.confirmationPhotos.splice(idx, 1); render(); } }, ['Sterge'])]),
              el('img', { class: 'photo-thumb', src: photo.previewUrl }),
            ])
          );
        });
      }

      const children = [obsBtn, el('div', { style: 'height:12px' }), qtyField, groupsHost, addTypeBtn];
      if (showHints && missing.has('productDetails')) children.push(el('div', { class: 'hint-text' }, ['Completeaza cantitatea si toate produsele adaugate (model, tip, serie).']));
      if (photoBtnError) children.push(el('div', { class: 'hint-text' }, ['Poza de confirmare este obligatorie.']));
      children.push(photoBtn, secureRow, photosHost);

      return sectionCard('Detalii produs si poza de confirmare', children);
    }

    // ---------------- import din WhatsApp ----------------
    async function onImportFromWhatsApp() {
      const parsed = await openWhatsAppImportDialog();
      if (!parsed) return;
      applyWhatsAppImport(parsed);
    }

    function applyWhatsAppImport(parsed) {
      let anyField = false;
      if (parsed.clientName) {
        state.clientName = parsed.clientName;
        missing.delete('clientName');
        anyField = true;
      }
      if (parsed.address) {
        state.field1 = parsed.address;
        missing.delete('field1');
        anyField = true;
      }
      if (parsed.persRes) {
        state.beneficiaryResponsible = parsed.persRes;
        missing.delete('beneficiaryResponsible');
        anyField = true;
      }
      if (parsed.tel) {
        state.beneficiaryPhone = parsed.tel;
        missing.delete('beneficiaryPhone');
        anyField = true;
      }
      if (parsed.ctr) {
        state.contractReference = parsed.ctr;
        anyField = true;
      }
      // NU mai scriem "Servisare: X" in Observatii la import — caseta
      // "OBSERVATII SOFER" de pe PV trebuie sa ramana activa STRICT cand
      // soferul chiar adauga observatii proprii (butonul "Adauga
      // observatii"), nu cand un camp din comanda a fost parsat automat.
      // parsed.servisare ramane disponibil in obiectul intors de parser
      // pentru eventuale utilizari viitoare, dar nu mai atinge state.observatii.
      if (parsed.productQty && parsed.productQty > 0) {
        state.productQuantity = String(parsed.productQty);
        const first = state.productEntries[0];
        while (first.series.length < parsed.productQty) first.series.push('');
        while (first.series.length > parsed.productQty) first.series.pop();
        anyField = true;
      }
      if (parsed.productText) {
        const upperText = withoutDiacritics(parsed.productText).toUpperCase();
        const matchedModel = savedModels.find((m) => upperText.includes(withoutDiacritics(m).toUpperCase()));
        const first = state.productEntries[0];
        if (matchedModel) {
          first.model = matchedModel;
          const types = catalogByModel[matchedModel] || [];
          const remainder = upperText.replace(withoutDiacritics(matchedModel).toUpperCase(), '').trim();
          const matchedType = types.find((t) => remainder.includes(withoutDiacritics(t).toUpperCase()));
          if (matchedType) first.type = matchedType;
        } else {
          first.model = parsed.productText;
        }
        missing.delete('productDetails');
        anyField = true;
      }
      render();
      showToast(anyField ? 'Date importate — verifica si completeaza ce lipseste.' : 'Nu am recunoscut niciun camp in textul lipit.');
    }

    // ---------------- photo capture flow ----------------
    async function onCapturePhoto() {
      if (isBusy) return;
      if (state.confirmationPhotos.length >= 5) return;
      const missingClient = !state.clientName.trim();
      const missingProduct = !hasAtLeastOneCompleteProduct();
      if (missingClient || missingProduct) {
        showHints = true;
        if (missingClient) missing.add('clientName');
        if (missingProduct) missing.add('productDetails');
        render();
        showToast('Completeaza clientul si datele produselor inainte de poza.');
        return;
      }
      if (!('geolocation' in navigator)) {
        showToast('GPS indisponibil pe acest dispozitiv.');
      }
      const gpsResult = await gpsAccuracyGate();
      if (gpsResult === undefined) return;

      isBusy = true;
      render();
      try {
        const file = await captureCameraPhoto();
        if (!file) return;
        let coordsLabel = 'GPS indisponibil';
        let gpsAddressLabel = '';
        // gpsAccuracyGate() intoarce 'skip' daca soferul a sarit peste
        // verificarea GPS (semnal absent/slab) — in acel caz nu avem nici
        // coordonate, nici adresa dedusa, si ramanem pe fallback-ul de mai
        // jos (adresa scrisa de mana). Altfel intoarce { position,
        // geocodedLabel } — geocodedLabel poate fi null daca soferul nu a
        // avut internet in acel moment sau Nominatim n-a apucat sa raspunda.
        if (gpsResult && gpsResult !== 'skip' && gpsResult.position?.coords) {
          const { latitude, longitude } = gpsResult.position.coords;
          coordsLabel = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          gpsAddressLabel = gpsResult.geocodedLabel || '';
        }
        state.gps = coordsLabel;
        state.gpsAddress = gpsAddressLabel;
        state.confirmationTime = formatDateTimeRo();
        const previewUrl = await blobToDataUrl(file);
        state.confirmationPhotos.push({ rawBlob: file, previewUrl });
        missing.delete('confirmationPhoto');
        showToast(`Poza a fost adaugata (${state.confirmationPhotos.length}/5).`);
      } finally {
        isBusy = false;
        render();
      }
    }

    // ---------------- build model ----------------
    function buildModel({ id, pvNumber, avizNumber, createdAt, annotatedPhotoUrls }) {
      return {
        id,
        pvNumber,
        avizNumber,
        createdAt,
        processType,
        userName: driver.name,
        userCi: driver.ci,
        userFunctie: driver.functia,
        carMarca: car.marca,
        carNumar: car.numar,
        depotName: depot.name,
        depotAddress: depot.address,
        depotRepresentativeName: depot.representativeName,
        depotRepresentativePhone: depot.representativePhone,
        depotRepresentativeEmail: depot.representativeEmail,
        field1: state.field1.trim(),
        field2: state.beneficiaryResponsible.trim(),
        field3: state.productQuantity.trim(),
        observatii: state.observatii.trim(),
        secureAreaNoPhoto: state.secureAreaNoPhoto,
        confirmationPhotoUrls: annotatedPhotoUrls,
        gps: state.gps,
        confirmationTime: state.confirmationTime,
        clientName: state.clientName.trim(),
        productModel: productModelSummary(state.productEntries),
        productSeries: productSeriesEncoded(state.productEntries, state.noSeriesMode),
        beneficiaryPhone: state.beneficiaryPhone.trim(),
        beneficiaryCiSeries: state.beneficiaryCi.trim(),
        beneficiaryCiNumber: state.beneficiaryNr.trim(),
        beneficiarySignatureUrl: state.beneficiarySignatureUrl,
        contractReference: state.contractReference.trim(),
        avizReturnEmail: resolveAvizReturnEmail(state.contractReference),
        driverSignatureUrl: driver.signatureDataUrl || '',
      };
    }

    function photoOverlayLines({ pvNumber, avizNumber }) {
      const productLines = state.productEntries.filter((e) => e.model.trim()).map((e) => (e.type.trim() ? `${e.model.trim()} (${e.type.trim()})` : e.model.trim()));
      const pvLabel = displayPvNumber(pvNumber);
      const avzLabel = avizNumber ? displayAvizNumber(avizNumber) : '';
      const lines = [
        `Client: ${state.clientName.trim()}`,
        `Cantitate: ${state.productQuantity.trim()}`,
        productLines.length ? `Produse: ${productLines.join(', ')}` : null,
        `Data: ${formatDateTimeRo()}`,
        state.gps ? `GPS: ${state.gps}` : null,
        // In banner adresa vine din pozitia GPS reala a telefonului la
        // momentul pozei (dedusa via Nominatim, vezi gpsAccuracyGate) — NU
        // din adresa scrisa de sofer in comanda. Cade inapoi pe adresa
        // scrisa de mana (state.field1) doar daca soferul nu a avut
        // semnal/internet in acel moment. Peste tot altundeva in PV
        // (Locatia ceruta, Anexa Foto, Aviz, fisier, admin) adresa ramane
        // exact cea scrisa in comanda, neschimbata.
        `Adresa: ${state.gpsAddress || state.field1.trim()}`,
        `Sofer: ${driver.name} | Auto: ${car.numar}`,
        avzLabel ? `Nr PV: ${pvLabel} | Nr AVZ: ${avzLabel}` : `Nr PV: ${pvLabel}`,
      ];
      return lines.filter(Boolean);
    }

    async function annotateAllPhotos({ pvNumber, avizNumber }) {
      if (!state.confirmationPhotos.length) return [];
      const logo = await loadLogoImage();
      const lines = photoOverlayLines({ pvNumber, avizNumber });
      const results = [];
      for (const photo of state.confirmationPhotos) {
        try {
          const annotatedBlob = await annotatePhotoWithMetadata(photo.rawBlob, lines, (depot.name || '').toUpperCase(), logo);
          results.push(await blobToDataUrl(annotatedBlob));
        } catch (e) {
          results.push(photo.previewUrl);
        }
      }
      return results;
    }

    // ---------------- preview / save ----------------
    async function onPreview() {
      if (isBusy) return;
      const m = validate();
      render();
      if (m.size) {
        showToast(validationMessage(m));
        return;
      }
      isBusy = true;
      try {
        const previewPvNumber = `${prefixForType(processType)}_00000`;
        const previewAvizNumber = needsAviz ? `AVZ-EE_${new Date().getFullYear()}_000` : '';
        const annotatedPhotoUrls = await annotateAllPhotos({ pvNumber: previewPvNumber, avizNumber: previewAvizNumber });
        const model = buildModel({ id: 'preview', pvNumber: previewPvNumber, avizNumber: previewAvizNumber, createdAt: new Date().toISOString(), annotatedPhotoUrls });
        const html = buildDocumentHtml({ model, isPreview: true, photoUrls: annotatedPhotoUrls, beneficiarySignatureUrl: model.beneficiarySignatureUrl, driverSignatureUrl: model.driverSignatureUrl, stampAvailable: true });
        await openPrintPreview({ html, title: 'Preview Proces Verbal', showBadge: true });
      } finally {
        isBusy = false;
        render();
      }
    }

    async function onSave() {
      if (isBusy) return;
      const m = validate();
      render();
      if (m.size) {
        showToast(validationMessage(m));
        return;
      }
      isBusy = true;
      render();
      try {
        const pvNumber = await nextPvNumber(processType);
        const avizNumber = needsAviz ? await nextAvizNumber() : '';
        const createdAt = new Date().toISOString();
        const id = uuid();
        const annotatedPhotoUrls = await annotateAllPhotos({ pvNumber, avizNumber });
        const model = buildModel({ id, pvNumber, avizNumber, createdAt, annotatedPhotoUrls });

        await PvRepo.save(model);
        if (processType === 'AMPLASARE') {
          const gpsMatch = /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(state.gps || '');
          if (gpsMatch) {
            await ClientLocationRepo.save({
              id: uuid(),
              processVerbalId: id,
              createdAt,
              clientName: model.clientName,
              address: model.field1,
              latitude: parseFloat(gpsMatch[1]),
              longitude: parseFloat(gpsMatch[2]),
            });
          }
        }

        // Codul de judet (2 litere, exceptie "B" pentru Bucuresti) — extras
        // din adresa ("jud. X" scris de sofer la Locatie), sau, daca lipseste,
        // dedus din depozit (acelasi tipar deja folosit la legenda Anexei
        // Foto — vezi pdf-print.js). Folosit atat in numele fisierului local
        // de mai jos, cat si trimis la Supabase (uploadPvRecordToCloud) ca
        // admin sa il poata folosi identic la descarcare.
        const countyRaw = extractCountyFromAddress(state.field1) || depot.name;
        const countyCode = countyAbbreviation(countyRaw);
        const fileToken = (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const locationForFile = `${countyCode} ${addressWithoutCounty(model.field1)}`.trim();
        const fileName = `${fileToken(prefixForType(processType))} - ${fileToken(model.clientName) || 'CLIENT'} - ${fileToken(locationForFile) || 'ADRESA'} - ${new Date(createdAt).toLocaleDateString('ro-RO')}`;

        const html = buildDocumentHtml({ model, isPreview: false, photoUrls: annotatedPhotoUrls, beneficiarySignatureUrl: model.beneficiarySignatureUrl, driverSignatureUrl: model.driverSignatureUrl, stampAvailable: true });
        showToast('Proces verbal salvat in istoric.');
        const previewResult = await openPrintPreview({
          html,
          title: 'Proces Verbal salvat',
          suggestedFileName: fileName,
          // Sincronizare in cloud pentru Istoric PV din admin — vezi
          // uploadPvRecordToCloud() din auth.js si comentariul din
          // openPrintPreview(). Doar aici (nu si la onPreview()), fiindca
          // acolo e doar o previzualizare cu numar fictiv, nu un PV real.
          onPdfReady: (blob) => {
            uploadPvRecordToCloud(
              {
                id,
                pvNumber,
                driverName: driver.name,
                depotName: depot.name,
                clientName: model.clientName,
                location: model.field1,
                county: countyCode,
                processType,
                carNumber: car.numar,
                createdAt,
              },
              blob
            );
          },
          // Daca soferul apasa Inapoi de pe acest preview (dupa salvare),
          // stergem inregistrarea local-salvata ca sa nu ramana un PV
          // gresit/gol in Istoric — vezi comentariul din openPrintPreview().
          onEditAgain: async () => {
            await PvRepo.remove(id);
          },
        });
        if (previewResult && previewResult.editAgain) {
          // Ramanem pe ecranul de formular (inca plin cu datele soferului)
          // ca sa corecteze direct, in loc sa inchidem ecranul ca la o
          // salvare normala.
          return;
        }
        pop({ saved: true });
      } catch (e) {
        console.error(e);
        showToast('Eroare la salvarea documentului: ' + e.message, { danger: true });
      } finally {
        isBusy = false;
        render();
      }
    }

    return screen;
  });
}

async function openObservatiiEditor(initialText) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(el('div', { class: 'topbar' }, [el('button', { class: 'icon-btn', onclick: () => pop(undefined) }, ['←']), el('div', { class: 'topbar-title' }, ['Observatii'])]));
    const area = textAreaField({ label: 'Observatii sofer', value: initialText, rows: 8 });
    screen.appendChild(el('div', { class: 'screen-scroll' }, [area]));
    screen.appendChild(el('div', { class: 'bottom-actions' }, [primaryButton('Salveaza', () => pop(area.input.value))]));
    return screen;
  });
}
