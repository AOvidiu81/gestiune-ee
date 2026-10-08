// screens-comenzi.js — "Comenzi active": comenzile generate in GestiuneEE
// (butonul verde), comune pentru toti soferii, grupate pe zile. Apasat pe o
// comanda -> se deschide PV-ul potrivit, precompletat (soferul verifica si
// corecteaza). "PV fara comanda" -> meniul de pana acum.
// Lista vine din functia comenzi_active() din baza si se pastreaza local
// (MetaRepo 'comenziActive'), ca sa se vada si fara semnal.
// O comanda dispare din lista doar cand Ovidiu pune PV = V in GestiuneEE.

import { el, formatDateRo, weekdayLabelRo, pad2 } from './utils.js';
import { pushScreen } from './router.js';
import { MetaRepo } from './db.js';
import { getSupabase } from './auth.js';
import { PROCESS_TYPES } from './catalog-defaults.js';
import { openProcessVerbalForm } from './screens-pv-form.js';

const CACHE_KEY = 'comenziActive';

// Tip comanda (GestiuneEE) -> tip PV
const TIP_PV = {
  AMPLASARE: 'AMPLASARE',
  SUPLIMENTARE: 'AMPLASARE',
  'EVENIMENT-A': 'AMPLASARE',
  RIDICARE: 'RIDICARE',
  REDUCERE: 'RIDICARE',
  'EVENIMENT-R': 'RIDICARE',
  SERVISARE: 'SERVISARE',
  VANZARE: 'VANZARE',
};

// Culorile cerute pentru comenzi: amplasare verde, ridicare rosu, servisare portocaliu
const CULOARE_TIP = { AMPLASARE: '#2E8B3C', RIDICARE: '#C0392B', SERVISARE: '#D97706' };

function accentFor(pvType) {
  return CULOARE_TIP[pvType] || (PROCESS_TYPES.find((p) => p.type === pvType) || {}).accent || '#0b3b66';
}

function parseDay(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
}

function isoOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function oraDin(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const azi = isoOf(new Date()) === isoOf(d);
  return `${azi ? '' : formatDateRo(d) + ' '}${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Comanda -> obiectul pe care formularul de PV il stie deja de la importul
 * din WhatsApp (vezi parseGestiuneOrder in whatsapp-import.js). */
function prefillDin(c) {
  const address = [c.jud ? `Jud. ${String(c.jud).toUpperCase()}` : '', c.loc, c.sat].filter(Boolean).join(', ');
  const ctr = c.nr_ctr
    ? `${c.nr_ctr}${c.ctr_data ? ' din ' + formatDateRo(parseDay(c.ctr_data)).replace(/\./g, '-') : ''}${c.anexa ? '  ·  ' + c.anexa : ''}`
    : '';
  return {
    clientName: c.client || '',
    address,
    persRes: c.pers_resp || '',
    tel: c.telefon || '',
    ctr,
    servisare: c.frecv_serv || '',
    dep: c.depozit || '',
    productQty: Math.abs(Number(c.buc) || 0),
    productText: [c.produs, c.model].filter(Boolean).join(' '),
    // Seriile trecute in GestiuneEE la amplasare (fara prefixul fix "EE-" al campului)
    mentiune: TIP_PV[c.tip_miscare] && TIP_PV[c.tip_miscare] !== c.tip_miscare ? c.tip_miscare + (c.anexa ? ' - ' + c.anexa : '') : '',   // s29
    aux: String(c.accesorii || '').split(',').map((x) => x.trim()).filter(Boolean),   // s28: accesoriile comenzii -> Elemente auxiliare
    series: (Array.isArray(c.serii) ? c.serii : []).map((s) => String((s && s.serie) || '').trim().replace(/^EE-?\s*/i, '')).filter(Boolean),
  };
}

async function citesteDinCloud() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('comenzi_active');
  if (error) throw error;
  const rows = data || [];
  // Seriile vin dintr-o functie separata (comenzi_active_serii); daca cererea
  // pica, lista de comenzi ramane buna, doar fara serii.
  try {
    const rs = await supabase.rpc('comenzi_active_serii');
    if (!rs.error) {
      const dupaId = new Map((rs.data || []).map((x) => [x.id, x]));
      rows.forEach((r) => {
        const x = dupaId.get(r.id);
        if (x) { r.serii = x.serii; r.serii_punct = x.serii_punct; }
      });
    }
  } catch (e) { /* fara serii */ }
  await MetaRepo.set(CACHE_KEY, { rows, at: new Date().toISOString() });
  return rows;
}

// Accesoriile, prescurtate ca in GestiuneEE (cerut 03.10), ca sa nu lungeasca cardul comenzii
const ACC_SCURT = { 'LAVOAR INTERIOR': 'L.I.', 'DOZATOR SAPUN': 'D.S.', 'DISPENSER PROSOP': 'D.P.H.', 'DISPENSER PROSOP HARTIE': 'D.P.H.' };
// Seriile unei comenzi, grupate pe model: "ARMAL EE-1, EE-2; MONDO EE-3"
function seriiText(lista) {
  const g = {};
  (Array.isArray(lista) ? lista : []).forEach((s) => {
    const m = s.model || s.produs || '';
    (g[m] = g[m] || []).push(s.serie || 'fara serie');
  });
  return Object.keys(g).map((m) => (m ? m + ' ' : '') + g[m].join(', ')).join('; ');
}
const accScurt = (t) => String(t || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => ACC_SCURT[x.toUpperCase()] || x).join(', ');

export async function openComenziActive(ctx) {
  return pushScreen(({ pop }) => buildComenziActive({ ...ctx, pop }));
}

/** Construieste ecranul de comenzi active. Folosit si de aplicatia unica
 * pentru soferi (/sofer/) ca fila "Comenzi": embedded = fara bara de sus cu
 * sageata si fara butonul de jos; screen.reload() cere din nou lista. */
export function buildComenziActive({ driver, car, depot, onFaraComanda, pop, embedded = false }) {
  return (() => {
    const screen = el('div', { class: 'screen' });
    const refreshBtn = el('button', { class: 'icon-btn', title: 'Reincarca', onclick: () => load(true) }, ['⟳']);
    if (!embedded) {
      screen.appendChild(
        el('div', { class: 'topbar' }, [
          el('button', { class: 'icon-btn', onclick: () => pop(undefined) }, ['←']),
          el('div', { class: 'topbar-title' }, ['Comenzi active']),
          refreshBtn,
        ])
      );
    }

    let rows = [];
    let perioada = 'azi'; // azi | sapt | toate
    let judet = '';
    let statusText = '';
    let offline = false;
    const deschise = new Set(); // comenzile din alte zile, desfacute de sofer

    const filtre = el('div', { class: 'ca-filtre' });
    const status = el('div', { class: 'ca-status' });
    const lista = el('div', { class: 'ca-lista' });

    function renderFiltre() {
      filtre.innerHTML = '';
      const chips = el('div', { class: 'ca-chips' });
      [
        ['azi', 'Azi'],
        ['sapt', 'Saptamana asta'],
        ['toate', 'Toate'],
      ].forEach(([k, label]) => {
        chips.appendChild(
          el('button', { class: `ca-chip${perioada === k ? ' on' : ''}`, onclick: () => { perioada = k; renderFiltre(); renderLista(); } }, [label])
        );
      });
      filtre.appendChild(chips);
      const judete = [...new Set(rows.map((r) => (r.jud || '').toUpperCase()).filter(Boolean))].sort();
      if (judete.length > 1 || judet) {
        const sel = el('select', { class: 'field-input ca-jud', onchange: (e) => { judet = e.target.value; renderLista(); } }, [
          el('option', { value: '' }, ['Toate judetele']),
          ...judete.map((j) => el('option', { value: j }, [j])),
        ]);
        sel.value = judet;
        filtre.appendChild(sel);
      }
    }

    function filtrate() {
      const azi = new Date();
      azi.setHours(0, 0, 0, 0);
      const luni = new Date(azi);
      luni.setDate(azi.getDate() - ((azi.getDay() + 6) % 7));
      const duminica = new Date(luni);
      duminica.setDate(luni.getDate() + 6);
      return rows.filter((r) => {
        if (judet && (r.jud || '').toUpperCase() !== judet) return false;
        // Comanda cu PV facut dispare din lista soferilor (cerut 02.10): PV-ul ajunge in GestiuneEE
        // si ramane pe telefon in „Istoric documente”
        if (r.pv_facut_de) return false;
        const d = parseDay(r.data);
        if (!d) return perioada === 'toate';
        // "Azi" cuprinde si comenzile ramase din zilele trecute (inca fara PV = V)
        if (perioada === 'azi') return d <= azi;
        if (perioada === 'sapt') return d <= duminica;
        return true;
      });
    }

    async function deschidePv(c) {
      const processType = TIP_PV[c.tip_miscare];
      if (!processType) return;
      await openProcessVerbalForm({ driver, car, depot, processType, prefill: prefillDin(c), miscareId: c.id });
      load(true);
    }

    function card(c) {
      const pvType = TIP_PV[c.tip_miscare] || c.tip_miscare;
      const accent = accentFor(pvType);
      const tipLabel = c.tip_miscare === pvType ? pvType : `${c.tip_miscare} → PV ${pvType}`;
      const adresa = [c.jud, c.loc, c.sat].filter(Boolean).join(', ');

      // Comenzile de AZI se vad intregi; cele din alte zile, restranse (tip + client | localitate - judet)
      const alteZile = c.data !== isoOf(new Date());
      if (alteZile && !deschise.has(c.id)) {
        const unde = [c.loc, c.jud ? String(c.jud).toUpperCase() : ''].filter(Boolean).join(' - ');
        return el('div', { class: 'ca-card ca-restrans', style: `border-left-color:${accent}`, onclick: () => { deschise.add(c.id); renderLista(); } }, [
          el('div', { class: 'ca-tip ca-tip-rand', style: `color:${accent}` }, [el('span', {}, [tipLabel]), el('span', { class: 'ca-sageata' }, ['▾'])]),
          el('div', { class: 'ca-rezumat' }, [[c.client || '—', unde].filter(Boolean).join('  |  ')]),
          c.pv_facut_de ? el('div', { class: 'ca-stare ca-pv' }, [`✔ PV facut de ${c.pv_facut_de}`]) : null,
        ]);
      }
      const produs = `${Math.abs(Number(c.buc) || 0)} buc ${[c.produs, c.model].filter(Boolean).join(' ')}`.trim();
      const serv = [c.frecv_serv, c.zi_servisare ? String(c.zi_servisare).replace(/,/g, ', ') : ''].filter(Boolean).join(', ');

      const eu = c.preluat_de && c.preluat_de === driver.name;
      const stare = [];
      if (c.pv_facut_de) stare.push(el('div', { class: 'ca-stare ca-pv' }, [`✔ PV facut de ${c.pv_facut_de}, ${oraDin(c.pv_facut_la)}`]));
      if (c.preluat_de) stare.push(el('div', { class: 'ca-stare' }, [`👤 Preluat de ${eu ? 'tine' : c.preluat_de}, ${oraDin(c.preluat_la)}`]));

      const btnPv = el('button', { class: 'btn btn-primary ca-btn', onclick: (e) => { e.stopPropagation(); deschidePv(c); } }, ['📄 Creează PV']);
      // „Preiau eu” a fost scos (02.10): PV-ul spune cine a facut comanda
      const actiuni = el('div', { class: 'ca-actiuni' }, [btnPv]);

      return el('div', { class: 'ca-card', style: `border-left-color:${accent}`, onclick: () => deschidePv(c) }, [
        alteZile
          ? el('div', { class: 'ca-tip ca-tip-rand', style: `color:${accent}`, onclick: (e) => { e.stopPropagation(); deschise.delete(c.id); renderLista(); } }, [el('span', {}, [tipLabel]), el('span', { class: 'ca-sageata' }, ['▴ restrânge'])])
          : el('div', { class: 'ca-tip', style: `color:${accent}` }, [tipLabel]),
        el('div', { class: 'ca-client' }, [c.client || '—']),
        adresa ? el('div', { class: 'ca-linie' }, ['📍 ', adresa]) : null,
        el('div', { class: 'ca-linie' }, ['📦 ', produs, c.accesorii ? ` · ${accScurt(c.accesorii)}` : '']),
        seriiText(c.serii) ? el('div', { class: 'ca-linie' }, ['🔢 Serii de ridicat: ', seriiText(c.serii)]) : null,
        c.tip_miscare === 'REDUCERE' && seriiText(c.serii_punct) ? el('div', { class: 'ca-linie' }, ['📍 Pe punct acum: ', seriiText(c.serii_punct)]) : null,
        serv ? el('div', { class: 'ca-linie' }, ['🔁 Servisare: ', serv]) : null,
        c.pers_resp || c.telefon
          ? el('div', { class: 'ca-linie' }, [
              '☎ ',
              c.pers_resp || '',
              c.telefon ? ' · ' : '',
              c.telefon ? el('a', { href: `tel:${String(c.telefon).replace(/[^\d+]/g, '')}`, onclick: (e) => e.stopPropagation() }, [c.telefon]) : null,
            ])
          : null,
        c.observatii ? el('div', { class: 'ca-linie ca-obs' }, ['📝 ', c.observatii]) : null,
        ...stare,
        actiuni,
      ]);
    }

    function renderLista() {
      status.textContent = statusText;
      status.classList.toggle('ca-offline', offline);
      lista.innerHTML = '';
      const vizibile = filtrate();
      if (!vizibile.length) {
        lista.appendChild(el('div', { class: 'empty-state' }, [rows.length ? 'Nicio comanda pentru filtrul ales.' : 'Nu exista comenzi active.']));
        return;
      }
      const aziIso = isoOf(new Date());
      let ziCurenta = null;
      vizibile.forEach((c) => {
        if (c.data !== ziCurenta) {
          ziCurenta = c.data;
          const d = parseDay(c.data);
          const titlu = d ? `${weekdayLabelRo(d, true)} ${formatDateRo(d)}` : 'FARA DATA';
          const eticheta = c.data === aziIso ? ' · AZI' : c.data < aziIso ? ' · RAMASA' : '';
          lista.appendChild(el('div', { class: 'ca-zi' }, [`—— ${titlu}${eticheta} ——`]));
        }
        lista.appendChild(card(c));
      });
    }

    async function load(fromCloud) {
      if (fromCloud) {
        refreshBtn.disabled = true;
        try {
          rows = await citesteDinCloud();
          offline = false;
          statusText = `Actualizat la ${oraDin(new Date().toISOString())}`;
        } catch (e) {
          const cached = await MetaRepo.get(CACHE_KEY).catch(() => null);
          rows = cached?.value?.rows || rows;
          offline = true;
          statusText = cached?.value?.at ? `Fara semnal — lista din ${oraDin(cached.value.at)}` : 'Fara semnal — nu am inca lista de comenzi.';
        }
        refreshBtn.disabled = false;
      } else {
        const cached = await MetaRepo.get(CACHE_KEY).catch(() => null);
        rows = cached?.value?.rows || [];
        statusText = cached?.value?.at ? `Se actualizeaza… (lista din ${oraDin(cached.value.at)})` : 'Se incarca…';
      }
      renderFiltre();
      renderLista();
    }

    const faraComanda = el('button', { class: 'btn btn-outline btn-block', onclick: () => onFaraComanda && onFaraComanda() }, ['📄 PV fara comanda / Cereri']);
    const statusRow = embedded ? el('div', { class: 'ca-embed-status' }, [status, refreshBtn]) : status;
    screen.appendChild(el('div', { class: 'screen-scroll' }, [filtre, statusRow, lista]));
    if (!embedded) screen.appendChild(el('div', { class: 'bottom-actions' }, [faraComanda]));
    screen.reload = () => load(true);

    load(false).then(() => load(true));
    return screen;
  })();
}
