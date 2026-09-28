// pdf-cereri.js — construieste documentele modulului "Cereri / Documente"
// (Cerere de Concediu de Odihna, Cerere de Invoire, Cerere de Demisie — Caz 1
// si Caz 2), ca pagini ".doc-page" identice ca aspect vizual (antet, footer,
// tipografie) cu Procesul Verbal — refolosim direct clasele .doc-* din
// css/print.css si helperele deja existente in pdf-print.js (esc, running
// Footer), ca cele doua tipuri de documente sa ramana perfect consistente.
// Continutul text/legal este pastrat cat mai aproape de aplicatia veche
// (APK), extras din exemplele furnizate de utilizator (folderul EXEMPLE):
// un PDF generat real (Cerere de Concediu) + 13 capturi de ecran care acopera
// meniul, cele 3 formulare si documentele generate (inclusiv ambele cazuri
// de Demisie). Micile inconsistente observate intre documentele vechi (ex:
// "C.I. seria si nr." la Concediu vs doar "C.I. seria" la Invoire/Demisie)
// au fost uniformizate aici la varianta completa.
//
// Documentele NU se numeroteaza si nu se salveaza in istoricul aplicatiei
// (spre deosebire de PV) — sunt generate direct din formular si trimise mai
// departe (WhatsApp/altă aplicatie) prin acelasi ecran openPrintPreview() din
// pdf-print.js, fara nicio duplicare de UI/logica de generare PDF.

import { esc, runningFooter } from './pdf-print.js';
import { formatDateRo } from './utils.js';

function depotEmailFor(depot) {
  const own = (depot?.representativeEmail || '').trim();
  if (own) return own;
  const token = (depot?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return token ? `${token}@eurowc.ro` : 'office@eurowc.ro';
}

function depotPhoneFor(depot) {
  return (depot?.representativePhone || '').trim() || '0735 214 762';
}

function footerModelFor(depot) {
  return { depotName: depot?.name || '', depotRepresentativeName: depot?.representativeName || '' };
}

function signatureBlock({ driverName, driverSignatureUrl, dataLabel }) {
  return `
    <div class="doc-row-2 doc-cerere-sign-row">
      <div class="doc-cerere-date-col">
        <div class="doc-label">DATA</div>
        <div class="doc-text doc-bold">${esc(dataLabel)}</div>
      </div>
      <div class="doc-cerere-solicitant-col">
        <div class="doc-cerere-solicitant-slot">
          ${driverSignatureUrl ? `<img src="${driverSignatureUrl}" alt="semnatura" />` : ''}
        </div>
        <div class="doc-cerere-solicitant-caption">Numele si Semnatura Solicitantului</div>
        <div class="doc-bold">${esc(driverName || '-')}</div>
      </div>
    </div>`;
}

function approvalBlock({ depotRepresentativeName }) {
  return `
    <div class="doc-row-2" style="margin-top:5mm">
      <div class="doc-box doc-cerere-approval">
        <div class="doc-label">AVIZAT</div>
        <div class="doc-text">${esc(depotRepresentativeName || '-')}</div>
        <div class="doc-cerere-line"></div>
        <div class="doc-cerere-caption">Data / Semnatura</div>
      </div>
      <div class="doc-box doc-cerere-approval">
        <div class="doc-label">APROBAT</div>
        <div class="doc-cerere-approval-spacer"></div>
        <div class="doc-cerere-line"></div>
        <div class="doc-cerere-caption">Data / Semnatura</div>
      </div>
    </div>`;
}

function cererePage({ title, bodyHtml, depot, driverName, driverSignatureUrl, isPreview }) {
  const dataLabel = formatDateRo(new Date());
  return `
  <section class="doc-page">
    <div class="doc-header">
      <img class="doc-header-img" src="assets/docs/header.png" alt="" />
      <div class="doc-header-rule"></div>
    </div>
    ${isPreview ? '<div class="doc-preview-badge">PREVIEW</div>' : ''}
    <h1 class="doc-title">${esc(title)}</h1>
    ${bodyHtml}
    <div class="doc-cerere-spacer"></div>
    ${signatureBlock({ driverName, driverSignatureUrl, dataLabel })}
    ${approvalBlock({ depotRepresentativeName: depot?.representativeName })}
    ${runningFooter(footerModelFor(depot), depotEmailFor(depot), depotPhoneFor(depot), 1, 1)}
  </section>`;
}

function mentiuniBlock(mentiuni) {
  const trimmed = (mentiuni || '').trim();
  return trimmed ? `<div class="doc-text doc-cerere-mentiuni"><strong>Mentiuni:</strong> ${esc(trimmed)}</div>` : '';
}

// ------------------------------------------------------------------
// Cerere de Concediu de Odihna
// ------------------------------------------------------------------
export function buildCerereConcediuHtml({ driver, depot, dataInceputLabel, dataSfarsitLabel, zileLucratoare, isPreview = false }) {
  const nume = (driver?.name || '').trim().toUpperCase();
  const ci = (driver?.ci || '').trim().toUpperCase() || 'N/A';
  const functia = (driver?.functia || '').trim().toUpperCase() || 'ANGAJAT';
  const body = `
    <div class="doc-text doc-cerere-body">
      Subsemnatul <strong>${esc(nume || '-')}</strong>, identificat cu C.I. seria si nr. <strong>${esc(ci)}</strong>, angajat al
      societatii S.C. EURO ECOLOGIC S.R.L., in calitate de <strong>${esc(functia)}</strong>, prin prezenta va rog
      sa imi aprobati efectuarea de <strong>CONCEDIU DE ODIHNA</strong>, incepand cu data de <strong>${esc(dataInceputLabel)}</strong>
      pana in data de <strong>${esc(dataSfarsitLabel)}</strong> inclusiv, adica un numar de <strong>${esc(zileLucratoare)} ZILE LUCRATOARE</strong>.
    </div>`;
  return cererePage({
    title: 'CERERE DE CONCEDIU DE ODIHNA',
    bodyHtml: body,
    depot,
    driverName: nume,
    driverSignatureUrl: driver?.signatureDataUrl,
    isPreview,
  });
}

// ------------------------------------------------------------------
// Cerere de Invoire
// ------------------------------------------------------------------
export function buildCerereInvoireHtml({ driver, depot, dataLabel, oraInceput, oraSfarsit, motiv, recuperareOre, isPreview = false }) {
  const nume = (driver?.name || '').trim().toUpperCase();
  const ci = (driver?.ci || '').trim().toUpperCase() || 'N/A';
  const functia = (driver?.functia || '').trim().toUpperCase() || 'ANGAJAT';
  const motivTrimmed = (motiv || '').trim();
  const motivText = motivTrimmed ? motivTrimmed : 'motive personale';

  const paragraphs = [];
  paragraphs.push(`
    <div class="doc-text doc-cerere-body">
      Subsemnatul <strong>${esc(nume || '-')}</strong>, identificat cu C.I. seria si nr. <strong>${esc(ci)}</strong>, angajat in functia de
      <strong>${esc(functia)}</strong>, va rog sa aprobati acordarea unei invoiri in data de <strong>${esc(dataLabel)}</strong>, in
      intervalul orar <strong>${esc(oraInceput)} - ${esc(oraSfarsit)}</strong>, pentru ${esc(motivText)}.
    </div>`);

  if (recuperareOre) {
    paragraphs.push(`
      <div class="doc-text doc-cerere-body">
        Mentionez ca timpul aferent invoirii va fi recuperat ulterior, conform programului si procedurilor interne stabilite.
      </div>`);
    paragraphs.push(`
      <div class="doc-text doc-cerere-body">
        Invoirea este solicitata cu recuperare ulterioara conform programului stabilit intern.
      </div>`);
  }

  paragraphs.push(`
    <div class="doc-cerere-legal-note">
      Nota legala: invoirea este o absenta motivata acordata prin acordul partilor; aplicarea concreta se face conform
      regulamentului intern/contractului colectiv, iar art. 54 din Codul muncii permite suspendarea raportului de munca
      prin acordul partilor.
    </div>`);

  return cererePage({
    title: 'CERERE DE INVOIRE',
    bodyHtml: paragraphs.join(''),
    depot,
    driverName: nume,
    driverSignatureUrl: driver?.signatureDataUrl,
    isPreview,
  });
}

// ------------------------------------------------------------------
// Cerere de Demisie — Caz 1 (la zi, acordul partilor) / Caz 2 (preaviz)
// ------------------------------------------------------------------
export function buildCerereDemisieHtml({ driver, depot, caz, subcaz, dataIncetareLabel, zileLucratoare, mentiuni, isPreview = false }) {
  const nume = (driver?.name || '').trim().toUpperCase();
  const ci = (driver?.ci || '').trim().toUpperCase() || 'N/A';
  const functia = (driver?.functia || '').trim().toUpperCase() || 'ANGAJAT';

  if (caz === 1) {
    const body = `
      <div class="doc-text doc-cerere-body">
        Subsemnatul <strong>${esc(nume || '-')}</strong>, identificat cu C.I. seria si nr. <strong>${esc(ci)}</strong>, avand functia de
        <strong>${esc(functia)}</strong>, va rog sa aprobati incetarea contractului individual de munca prin acordul partilor,
        incepand cu data de <strong>${esc(dataIncetareLabel)}</strong>.
      </div>
      <div class="doc-text doc-cerere-body">Temei legal: art. 55 lit. b din Codul muncii (incetare prin acordul partilor).</div>
      ${mentiuniBlock(mentiuni)}`;
    return cererePage({
      title: 'CERERE DE INCETARE C.I.M. PRIN ACORDUL PARTILOR',
      bodyHtml: body,
      depot,
      driverName: nume,
      driverSignatureUrl: driver?.signatureDataUrl,
      isPreview,
    });
  }

  // Caz 2 — demisie cu preaviz
  const body = `
    <div class="doc-text doc-cerere-body">
      Subsemnatul <strong>${esc(nume || '-')}</strong>, identificat cu C.I. seria si nr. <strong>${esc(ci)}</strong>, avand functia de
      <strong>${esc(functia)}</strong>, va notific demisia cu preaviz de <strong>${esc(zileLucratoare)} zile lucratoare</strong>,
      solicitand incetarea contractului individual de munca la data de <strong>${esc(dataIncetareLabel)}</strong>.
    </div>
    <div class="doc-text doc-cerere-body">Temei legal: art. 81 din Codul muncii (demisie cu preaviz).</div>
    <div class="doc-text doc-cerere-body">Durata preaviz selectata: <strong>${esc(zileLucratoare)} zile lucratoare</strong>${subcaz === 'conducere' ? ' (functie de conducere)' : ''}.</div>
    ${mentiuniBlock(mentiuni)}`;
  return cererePage({
    title: 'NOTIFICARE DE DEMISIE',
    bodyHtml: body,
    depot,
    driverName: nume,
    driverSignatureUrl: driver?.signatureDataUrl,
    isPreview,
  });
}
