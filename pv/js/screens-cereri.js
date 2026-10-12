// screens-cereri.js — modulul "Cereri / Documente": Cerere de Concediu de
// Odihna, Cerere de Invoire si Cerere de Demisie (Caz 1: la zi, cu acordul
// partilor / Caz 2: cu preaviz — functie de conducere 45 zile sau functie de
// executie 20 zile). Port cat mai fidel al ecranelor din aplicatia veche
// (APK), pe baza exemplelor (capturi de ecran + un PDF generat real) puse la
// dispozitie de utilizator — vezi js/pdf-cereri.js pentru continutul exact
// al documentelor generate.
//
// (v81: se pastreaza pe telefon in "Documente generate" — vezi urcaCerere.)
// Documentele NU se numeroteaza si nu se salveaza in istoric (spre deosebire
// de Procesul Verbal) — se genereaza direct din formular si se trimit mai
// departe (WhatsApp/alta aplicatie) prin acelasi ecran de previzualizare
// (openPrintPreview, din pdf-print.js) folosit si de PV, fara nicio
// duplicare de UI/logica.

import { el, formatDateRo, countBusinessDaysInclusive, addBusinessDays, parseIsoDate, toIsoDate, fileToken, uuid } from './utils.js';
import { uploadPvRecordToCloud, flushPvQueue } from './auth.js';
import { MetaRepo } from './db.js';
import { downloadPdf, shareOrDownloadPdf } from './pdf-generate.js';
import { pushScreen } from './router.js';
import { textField, textAreaField, dateField, sectionCard, primaryButton, outlineButton, showToast, tile, confirmDialog } from './components.js';
import { openPrintPreview } from './pdf-print.js';
import { buildCerereConcediuHtml, buildCerereInvoireHtml, buildCerereDemisieHtml } from './pdf-cereri.js';

function topBar(title, onBack) {
  return el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn', onclick: onBack }, ['←']),
    el('div', { class: 'topbar-title' }, [title]),
    el('div', { class: 'topbar-spacer' }),
  ]);
}

// Documentele Cereri au nevoie de functia soferului (ex: "in calitate de
// AGENT VANZARI") — camp optional la nivelul profilului de sofer (vezi
// screens-setup.js), dar obligatoriu pentru ca aceste cereri sa aiba sens
// juridic. Blocam generarea (nu si navigarea prin formular) daca lipseste.
function ensureFunctiaSet(driver) {
  if ((driver?.functia || '').trim()) return true;
  showToast('Completeaza campul "Functie" al soferului din Setari, inainte de a genera o cerere.', { danger: true });
  return false;
}

function radioRow({ name, checked, title, sub, onChange }) {
  const input = el('input', { type: 'radio', name });
  input.checked = checked;
  input.addEventListener('change', onChange);
  return el('label', { class: 'checkbox-row' }, [
    input,
    el('div', {}, [el('div', { class: 'checkbox-label' }, [title]), sub ? el('div', { class: 'checkbox-sub' }, [sub]) : null]),
  ]);
}

// ------------------------------------------------------------------
// Meniu principal Cereri / Documente
// ------------------------------------------------------------------
// v69: cererile generate (nu si Preview) ajung in GestiuneEE, in fila Procese verbale,
// la fel ca PV-urile (aceeasi coada: fara semnal pleaca singure mai tarziu).
// v81 / s38 (cerut de Ovidiu, 12.10): fiecare cerere generata se pastreaza si pe telefon (IndexedDB, cheia
// "cerere:<id>", cu PDF-ul) — fila "Documente generate". Raman acolo cat vrea soferul (le sterge el).
// La birou ajung ca pana acum (GestiuneEE → Cereri / documente angajati), acelasi id.
const CERERE_PREFIX = 'cerere:';
function urcaCerere(tip, { driver, depot }, detalii, blob) {
  const id = uuid(), createdAt = new Date().toISOString();
  const fileName = `${tip.replace('CERERE ', '')} - ${fileToken(driver?.name)} - ${fileToken(String(detalii || '').split(' ')[0])}`;
  MetaRepo.set(CERERE_PREFIX + id, { id, tip, detalii: detalii || '', driverName: driver?.name || '', fileName, createdAt, blob })
    .catch((e) => console.warn('[cereri] nu am putut pastra cererea pe telefon:', e?.message || e));
  uploadPvRecordToCloud({
    id, pvNumber: tip.replace('CERERE ', ''), driverName: driver?.name || '', depotName: depot?.name || '',
    clientName: driver?.name || '', location: detalii || '', county: null, processType: tip,
    carNumber: null, miscareId: null, createdAt,
  }, blob);
}

const TIP_ETICHETA = { 'CERERE CONCEDIU': 'Cerere de concediu', 'CERERE INVOIRE': 'Cerere de invoire', 'CERERE DEMISIE': 'Cerere de demisie' };
function oraRo(iso) { const d = new Date(iso); return isNaN(d) ? '' : `${formatDateRo(d)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

async function openDocumenteGenerate() {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Documente generate', () => pop(undefined)));
    const lista = el('div', { style: 'display:flex;flex-direction:column;gap:12px;margin-top:6px' });
    screen.appendChild(el('div', { class: 'screen-scroll' }, [lista]));

    async function deseneaza() {
      let toate = [];
      try { toate = await MetaRepo.all(); } catch (e) { toate = []; }
      const inCoada = new Set(toate.filter((r) => String(r.key).startsWith('pvUpload:')).map((r) => String(r.key).slice(9)));
      const cereri = toate.filter((r) => String(r.key).startsWith(CERERE_PREFIX) && r.value && r.value.blob).map((r) => r.value)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      lista.innerHTML = '';
      if (!cereri.length) {
        lista.appendChild(el('div', { style: 'text-align:center;color:#6b7a90;padding:30px 10px;font-size:14px;line-height:1.5' },
          ['Nicio cerere generata pe acest telefon inca.', el('br'), 'Cererile pe care le generezi de acum inainte se pastreaza aici.']));
        return;
      }
      lista.appendChild(el('div', { style: 'color:#6b7a90;font-size:12px;line-height:1.4;padding:0 4px' },
        ['Se pastreaza pe acest telefon pana le stergi tu. La birou ajung singure, cand e semnal.']));
      cereri.forEach((c) => {
        const ajuns = !inCoada.has(c.id);
        const btnSave = el('button', { class: 'btn btn-outline', style: 'flex:1;padding:8px 6px;font-size:13px' }, ['💾 Salveaza PDF']);
        const btnSend = el('button', { class: 'btn btn-outline', style: 'flex:1;padding:8px 6px;font-size:13px' }, ['📤 Trimite']);
        const btnDel = el('button', { class: 'btn btn-outline', style: 'flex:0 0 auto;padding:8px 12px;font-size:13px;color:#C0392B;border-color:#e6b8b2' }, ['🗑']);
        btnSave.addEventListener('click', () => {
          try { showToast('PDF salvat in Descarcari: ' + downloadPdf(c.blob, c.fileName || 'Cerere')); }
          catch (e) { showToast('Nu am putut salva PDF-ul: ' + e.message, { danger: true }); }
        });
        btnSend.addEventListener('click', async () => {
          try {
            const r = await shareOrDownloadPdf(c.blob, c.fileName || 'Cerere', { title: c.fileName || 'Cerere' });
            if (r && r.status === 'downloaded') showToast('Trimiterea nu a fost posibila, PDF-ul a fost descarcat.', { danger: true });
          } catch (e) { showToast('Nu am putut trimite PDF-ul: ' + e.message, { danger: true }); }
        });
        btnDel.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: 'Stergi cererea de pe telefon?', message: (TIP_ETICHETA[c.tip] || c.tip) + ' · ' + c.detalii +
            (ajuns ? ' — La birou a ajuns deja — acolo ramane.' : ' — ATENTIE: nu a ajuns inca la birou (asteapta semnal). Trimiterea continua si daca o stergi de aici.'),
            okLabel: 'Sterge', danger: true });
          if (!ok) return;
          try { await MetaRepo.remove(CERERE_PREFIX + c.id); } catch (e) { showToast('Nu am putut sterge: ' + e.message, { danger: true }); return; }
          deseneaza();
        });
        lista.appendChild(el('div', { class: 'section-card', style: 'padding:12px 14px' }, [
          el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:baseline' }, [
            el('div', { style: 'font-weight:700;font-size:15px;color:#13294b' }, [TIP_ETICHETA[c.tip] || c.tip]),
            el('div', { style: `font-size:12px;font-weight:600;white-space:nowrap;color:${ajuns ? '#2E8B3C' : '#D97706'}` }, [ajuns ? '✓ ajunsa la birou' : '⏳ asteapta semnal']),
          ]),
          el('div', { style: 'font-size:14px;margin-top:2px' }, [c.detalii || '']),
          el('div', { style: 'font-size:12px;color:#6b7a90;margin-top:2px' }, ['generata ' + oraRo(c.createdAt) + (c.driverName ? ' · ' + c.driverName : '')]),
          el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, [btnSave, btnSend, btnDel]),
        ]));
      });
    }
    deseneaza();
    flushPvQueue().then(deseneaza).catch(() => {});
    return screen;
  });
}

export async function openCereriMenu({ driver, car, depot }) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Cereri / Documente', () => pop(undefined)));

    const tiles = el('div', { style: 'display:flex;flex-direction:column;gap:12px;margin-top:6px' }, [
      tile({
        label: 'CERERE DE CONCEDIU',
        sub: 'Concediu de odihna',
        icon: '🏖',
        accent: '#2E8B3C',
        badge: '#e8f6ea',
        onClick: () => openCerereConcediuForm({ driver, depot }),
      }),
      tile({
        label: 'CERERE DE INVOIRE',
        sub: 'Absenta pe ore, in cursul zilei',
        icon: '⏰',
        accent: '#0D5AA7',
        badge: '#e7f1ff',
        onClick: () => openCerereInvoireForm({ driver, depot }),
      }),
      tile({
        label: 'CERERE DE DEMISIE',
        sub: 'La zi sau cu preaviz',
        icon: '🚪',
        accent: '#D93A5E',
        badge: '#fbe8ec',
        onClick: () => openCerereDemisieAccessGate({ driver, depot }),
      }),
      tile({
        label: 'DOCUMENTE GENERATE',
        sub: 'Cererile tale, pastrate pe acest telefon',
        icon: '📁',
        accent: '#2D4D7A',
        badge: '#EEF3FA',
        onClick: () => openDocumenteGenerate(),
      }),
    ]);

    const scroll = el('div', { class: 'screen-scroll' }, [tiles]);
    screen.appendChild(scroll);
    return screen;
  });
}

// ------------------------------------------------------------------
// Cerere de Concediu de Odihna
// ------------------------------------------------------------------
async function openCerereConcediuForm({ driver, depot }) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Cerere Concediu de Odihna', () => pop(undefined)));

    const angajatCard = sectionCard('Angajat', [
      el('div', { style: 'font-weight:700;font-size:15px' }, [driver?.name || '-']),
      el('div', { style: 'color:var(--ink-soft);margin-top:2px;font-size:13.5px' }, [`C.I.: ${driver?.ci || '-'}`]),
      el('div', { style: 'color:var(--ink-soft);font-size:13.5px' }, [`Functie: ${(driver?.functia || '').trim() || 'necompletata — vezi Setari'}`]),
    ]);

    const today = new Date();
    const state = { dataInceput: today, dataSfarsit: today };

    const infoHost = el('div', { class: 'info-box' });
    const previewHost = el('div', { style: 'font-size:13.5px;line-height:1.55' });

    function refresh() {
      const zile = countBusinessDaysInclusive(state.dataInceput, state.dataSfarsit);
      infoHost.innerHTML = '';
      infoHost.appendChild(el('div', {}, [`${zile} ${zile === 1 ? 'zi lucratoare' : 'zile lucratoare'} (Luni-Vineri)`]));

      const nume = (driver?.name || '-').toUpperCase();
      const ci = (driver?.ci || 'N/A').toUpperCase();
      const functia = (driver?.functia || 'ANGAJAT').toUpperCase();
      previewHost.innerHTML = '';
      previewHost.appendChild(
        el('div', {}, [
          'Subsemnatul ',
          el('strong', {}, [nume]),
          ', identificat cu C.I. seria si nr. ',
          el('strong', {}, [ci]),
          ', angajat al societatii S.C. EURO ECOLOGIC S.R.L., in calitate de ',
          el('strong', {}, [functia]),
          ', prin prezenta va rog sa imi aprobati efectuarea de ',
          el('strong', {}, ['CONCEDIU DE ODIHNA']),
          ', incepand cu data de ',
          el('strong', {}, [formatDateRo(state.dataInceput)]),
          ' pana in data de ',
          el('strong', {}, [formatDateRo(state.dataSfarsit)]),
          ' inclusiv, adica un numar de ',
          el('strong', {}, [`${zile} ZILE LUCRATOARE`]),
          '.',
        ])
      );
    }

    const startField = dateField({ label: 'Data inceput', value: toIsoDate(state.dataInceput) });
    const endField = dateField({ label: 'Data sfarsit', value: toIsoDate(state.dataSfarsit) });
    startField.input.addEventListener('change', () => {
      const d = parseIsoDate(startField.input.value);
      if (!d) return;
      state.dataInceput = d;
      if (state.dataSfarsit < state.dataInceput) {
        state.dataSfarsit = state.dataInceput;
        endField.input.value = toIsoDate(state.dataSfarsit);
      }
      refresh();
    });
    endField.input.addEventListener('change', () => {
      const d = parseIsoDate(endField.input.value);
      if (!d) return;
      if (d < state.dataInceput) {
        showToast('Data de sfarsit nu poate fi inainte de data de inceput.');
        endField.input.value = toIsoDate(state.dataSfarsit);
        return;
      }
      state.dataSfarsit = d;
      refresh();
    });
    const datesRow = el('div', { style: 'display:flex;gap:10px' }, [el('div', { style: 'flex:1' }, [startField]), el('div', { style: 'flex:1' }, [endField])]);

    const perioadaCard = sectionCard('Perioada concediu', [datesRow, infoHost]);
    const previewCard = sectionCard('Previzualizare text', [previewHost]);
    refresh();

    function openDoc(isPreview) {
      if (!ensureFunctiaSet(driver)) return;
      const html = buildCerereConcediuHtml({
        driver,
        depot,
        dataInceputLabel: formatDateRo(state.dataInceput),
        dataSfarsitLabel: formatDateRo(state.dataSfarsit),
        zileLucratoare: countBusinessDaysInclusive(state.dataInceput, state.dataSfarsit),
        isPreview,
      });
      openPrintPreview({
        html,
        title: 'Cerere de Concediu',
        suggestedFileName: `CONCEDIU - ${fileToken(driver?.name)} - ${fileToken(formatDateRo(state.dataInceput))}`,
        showBadge: isPreview,
        onPdfReady: isPreview ? undefined : (blob) => urcaCerere('CERERE CONCEDIU', { driver, depot }, `${formatDateRo(state.dataInceput)} – ${formatDateRo(state.dataSfarsit)}`, blob),
      });
    }

    const previewBtn = outlineButton('👁 Preview', () => openDoc(true));
    const genBtn = primaryButton('📄 Genereaza', () => openDoc(false));
    const btnRow = el('div', { style: 'display:flex;gap:10px' }, [el('div', { style: 'flex:1' }, [previewBtn]), el('div', { style: 'flex:1' }, [genBtn])]);

    const scroll = el('div', { class: 'screen-scroll' }, [angajatCard, perioadaCard, previewCard]);
    screen.appendChild(scroll);
    screen.appendChild(el('div', { class: 'bottom-actions' }, [btnRow]));
    return screen;
  });
}

// ------------------------------------------------------------------
// Cerere de Invoire
// ------------------------------------------------------------------
async function openCerereInvoireForm({ driver, depot }) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Cerere de Invoire', () => pop(undefined)));

    const angajatCard = sectionCard('Angajat', [
      el('div', { style: 'font-weight:700;font-size:15px' }, [driver?.name || '-']),
      el('div', { style: 'color:var(--ink-soft);margin-top:2px;font-size:13.5px' }, [`C.I.: ${driver?.ci || '-'}`]),
    ]);

    const today = new Date();
    const dataField = dateField({ label: 'Data invoire', value: toIsoDate(today) });
    const oraInceputField = textField({ label: 'Ora inceput', type: 'time', value: '09:00' });
    const oraSfarsitField = textField({ label: 'Ora sfarsit', type: 'time', value: '12:00' });
    const motivField = textAreaField({ label: 'Motiv invoire (optional)', rows: 2 });

    const recuperareCb = el('input', { type: 'checkbox' });
    recuperareCb.checked = true;
    const recuperareRow = el('label', { class: 'checkbox-row' }, [
      recuperareCb,
      el('div', {}, [el('div', { class: 'checkbox-label' }, ['Recuperare ore'])]),
    ]);

    const noteBox = el('div', { class: 'info-box' }, [
      'Nota: Invoirea se acorda prin acordul partilor, conform regulilor interne; art. 54 din Codul muncii permite suspendarea contractului prin acordul partilor.',
    ]);

    const orarRow = el('div', { style: 'display:flex;gap:10px' }, [el('div', { style: 'flex:1' }, [oraInceputField]), el('div', { style: 'flex:1' }, [oraSfarsitField])]);
    const detaliiCard = sectionCard('Detalii invoire', [dataField, orarRow, motivField, recuperareRow, noteBox]);

    function openDoc(isPreview) {
      if (!ensureFunctiaSet(driver)) return;
      const d = parseIsoDate(dataField.input.value) || today;
      const html = buildCerereInvoireHtml({
        driver,
        depot,
        dataLabel: formatDateRo(d),
        oraInceput: oraInceputField.input.value || '-',
        oraSfarsit: oraSfarsitField.input.value || '-',
        motiv: motivField.input.value,
        recuperareOre: recuperareCb.checked,
        isPreview,
      });
      openPrintPreview({
        html,
        title: 'Cerere de Invoire',
        suggestedFileName: `INVOIRE - ${fileToken(driver?.name)} - ${fileToken(formatDateRo(d))}`,
        showBadge: isPreview,
        onPdfReady: isPreview ? undefined : (blob) => urcaCerere('CERERE INVOIRE', { driver, depot }, formatDateRo(d), blob),
      });
    }

    const previewBtn = outlineButton('👁 Preview', () => openDoc(true));
    const genBtn = primaryButton('📄 Genereaza', () => openDoc(false));
    const btnRow = el('div', { style: 'display:flex;gap:10px' }, [el('div', { style: 'flex:1' }, [previewBtn]), el('div', { style: 'flex:1' }, [genBtn])]);

    const scroll = el('div', { class: 'screen-scroll' }, [angajatCard, detaliiCard]);
    screen.appendChild(scroll);
    screen.appendChild(el('div', { class: 'bottom-actions' }, [btnRow]));
    return screen;
  });
}

// ------------------------------------------------------------------
// Cerere de Demisie — poarta de acces (parola depozit) -> tip solicitare -> formular
// ------------------------------------------------------------------
async function openCerereDemisieAccessGate({ driver, depot }) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Cerere Demisie - Acces', () => pop(undefined)));

    const repCard = sectionCard('Validare reprezentant', [
      el('div', {}, [`Reprezentant depozit: ${depot?.representativeName || '-'}`]),
      el('div', { style: 'color:var(--ink-soft);margin-top:2px' }, [`Functie reprezentant: ${depot?.representativeFunction || '-'}`]),
    ]);

    const accessCode = (depot?.representativeAccessCode || '').trim();
    const hasAccessCode = !!accessCode;

    const passField = textField({ label: 'Parola de acces', type: 'password', placeholder: 'Introdu parola de acces' });
    const confirmCb = el('input', { type: 'checkbox' });
    const confirmRow = el('label', { class: 'checkbox-row' }, [
      confirmCb,
      el('div', {}, [el('div', { class: 'checkbox-label' }, ['Confirm ca reprezentantul depozitului este prezent'])]),
    ]);

    const passCardChildren = hasAccessCode
      ? [passField, confirmRow]
      : [
          el('div', { class: 'warning-box' }, [
            'Depozitul nu are o parola de acces configurata (Setari ▸ Depozite). Poti continua doar cu confirmarea de mai jos.',
          ]),
          confirmRow,
        ];
    const passCard = sectionCard('Parola acces', passCardChildren);

    const continueBtn = primaryButton('→ Continua', () => {
      if (!confirmCb.checked) {
        showToast('Confirma ca reprezentantul depozitului este prezent.');
        return;
      }
      if (hasAccessCode && passField.input.value.trim() !== accessCode) {
        showToast('Parola de acces este gresita.', { danger: true });
        return;
      }
      openCerereDemisieTipSelection({ driver, depot });
    });

    const scroll = el('div', { class: 'screen-scroll' }, [repCard, passCard]);
    screen.appendChild(scroll);
    screen.appendChild(el('div', { class: 'bottom-actions' }, [continueBtn]));
    return screen;
  });
}

async function openCerereDemisieTipSelection({ driver, depot }) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Cerere Demisie - Tip solicitare', () => pop(undefined)));

    const state = { caz: 1, subcaz: 'executie' };
    const optionsHost = el('div', { class: 'section-card' });

    function render() {
      optionsHost.innerHTML = '';
      optionsHost.appendChild(
        radioRow({
          name: 'demisie-caz',
          checked: state.caz === 1,
          title: 'Caz 1: Demisie la zi cu acordul partilor',
          sub: 'Incetare prin acordul partilor (art. 55 lit. b Codul muncii).',
          onChange: () => { state.caz = 1; render(); },
        })
      );
      optionsHost.appendChild(
        radioRow({
          name: 'demisie-caz',
          checked: state.caz === 2,
          title: 'Caz 2: Demisie cu preaviz',
          sub: 'Conform art. 81 Codul muncii.',
          onChange: () => { state.caz = 2; render(); },
        })
      );
      if (state.caz === 2) {
        optionsHost.appendChild(
          radioRow({
            name: 'demisie-subcaz',
            checked: state.subcaz === 'conducere',
            title: 'Functie de conducere - 45 zile lucratoare',
            onChange: () => { state.subcaz = 'conducere'; render(); },
          })
        );
        optionsHost.appendChild(
          radioRow({
            name: 'demisie-subcaz',
            checked: state.subcaz === 'executie',
            title: 'Functie de executie - 20 zile lucratoare',
            onChange: () => { state.subcaz = 'executie'; render(); },
          })
        );
      }
    }
    render();

    const continueBtn = primaryButton('→ Continua catre formular', () => {
      openCerereDemisieForm({ driver, depot, caz: state.caz, subcaz: state.caz === 2 ? state.subcaz : null });
    });

    const scroll = el('div', { class: 'screen-scroll' }, [optionsHost]);
    screen.appendChild(scroll);
    screen.appendChild(el('div', { class: 'bottom-actions' }, [continueBtn]));
    return screen;
  });
}

async function openCerereDemisieForm({ driver, depot, caz, subcaz }) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Formular Cerere Demisie', () => pop(undefined)));

    const zileLucratoare = caz === 2 ? (subcaz === 'conducere' ? 45 : 20) : 0;
    const tipLabel =
      caz === 1
        ? 'Demisie la zi cu acordul partilor (art. 55 lit. b)'
        : `Demisie cu preaviz (art. 81) — ${subcaz === 'conducere' ? 'functie de conducere' : 'functie de executie'}, ${zileLucratoare} zile lucratoare`;
    const tipCard = sectionCard('Tip cerere', [el('div', { style: 'font-weight:700;font-size:15px' }, [tipLabel])]);

    const today = new Date();
    const state = { dataCererii: today, dataIncetare: caz === 2 ? addBusinessDays(today, zileLucratoare) : today };

    const cerereField = dateField({ label: 'Data cererii', value: toIsoDate(state.dataCererii) });
    const incetareField = dateField({ label: 'Data incetare', value: toIsoDate(state.dataIncetare) });

    cerereField.input.addEventListener('change', () => {
      const d = parseIsoDate(cerereField.input.value);
      if (!d) return;
      state.dataCererii = d;
      state.dataIncetare = caz === 2 ? addBusinessDays(d, zileLucratoare) : d;
      incetareField.input.value = toIsoDate(state.dataIncetare);
    });
    incetareField.input.addEventListener('change', () => {
      const d = parseIsoDate(incetareField.input.value);
      if (!d) return;
      state.dataIncetare = d;
    });

    const datesRow = el('div', { style: 'display:flex;gap:10px' }, [el('div', { style: 'flex:1' }, [cerereField]), el('div', { style: 'flex:1' }, [incetareField])]);
    const datesCard = sectionCard(null, [
      datesRow,
      caz === 2
        ? el('div', { style: 'color:var(--ink-soft);font-size:12.5px;margin-top:6px' }, [
            'Data incetare e precompletata la termenul legal de preaviz — poti ajusta manual daca e nevoie.',
          ])
        : null,
    ]);

    const mentiuniField = textAreaField({ label: 'Mentiuni (optional)', rows: 3 });
    const mentiuniCard = sectionCard(null, [mentiuniField]);

    function openDoc(isPreview) {
      if (!ensureFunctiaSet(driver)) return;
      const html = buildCerereDemisieHtml({
        driver,
        depot,
        caz,
        subcaz,
        dataIncetareLabel: formatDateRo(state.dataIncetare),
        zileLucratoare,
        mentiuni: mentiuniField.input.value,
        isPreview,
      });
      openPrintPreview({
        html,
        title: 'Cerere de Demisie',
        suggestedFileName: `DEMISIE - ${fileToken(driver?.name)} - ${fileToken(formatDateRo(state.dataIncetare))}`,
        showBadge: isPreview,
        onPdfReady: isPreview ? undefined : (blob) => urcaCerere('CERERE DEMISIE', { driver, depot }, formatDateRo(state.dataIncetare), blob),
      });
    }

    const previewBtn = outlineButton('👁 Preview', () => openDoc(true));
    const genBtn = primaryButton('📄 Genereaza', () => openDoc(false));
    const btnRow = el('div', { style: 'display:flex;gap:10px' }, [el('div', { style: 'flex:1' }, [previewBtn]), el('div', { style: 'flex:1' }, [genBtn])]);

    const scroll = el('div', { class: 'screen-scroll' }, [tipCard, datesCard, mentiuniCard]);
    screen.appendChild(scroll);
    screen.appendChild(el('div', { class: 'bottom-actions' }, [btnRow]));
    return screen;
  });
}
