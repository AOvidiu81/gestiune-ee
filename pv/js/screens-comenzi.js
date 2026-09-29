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
import { showToast } from './components.js';
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

function accentFor(pvType) {
  return (PROCESS_TYPES.find((p) => p.type === pvType) || {}).accent || '#0b3b66';
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
  };
}

async function citesteDinCloud() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('comenzi_active');
  if (error) throw error;
  const rows = data || [];
  await MetaRepo.set(CACHE_KEY, { rows, at: new Date().toISOString() });
  return rows;
}

export async function openComenziActive({ driver, car, depot, onFaraComanda }) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    const refreshBtn = el('button', { class: 'icon-btn', title: 'Reincarca', onclick: () => load(true) }, ['⟳']);
    screen.appendChild(
      el('div', { class: 'topbar' }, [
        el('button', { class: 'icon-btn', onclick: () => pop(undefined) }, ['←']),
        el('div', { class: 'topbar-title' }, ['Comenzi active']),
        refreshBtn,
      ])
    );

    let rows = [];
    let perioada = 'toate'; // azi | sapt | toate
    let judet = '';
    let statusText = '';
    let offline = false;

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
        const d = parseDay(r.data);
        if (!d) return perioada === 'toate';
        // "Azi" cuprinde si comenzile ramase din zilele trecute (inca fara PV = V)
        if (perioada === 'azi') return d <= azi;
        if (perioada === 'sapt') return d <= duminica;
        return true;
      });
    }

    async function preiau(c, da) {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('preia_comanda', { p_id: c.id, p_preiau: da });
        if (error) throw error;
        const r = (data || [])[0] || {};
        if (da && r.preluat_de && r.preluat_de !== driver.name) {
          showToast(`A preluat-o deja ${r.preluat_de}.`, { danger: true });
        } else {
          showToast(da ? 'Ai preluat comanda.' : 'Ai renuntat la comanda.');
        }
      } catch (e) {
        showToast('Fara semnal — incearca din nou cand ai internet.', { danger: true });
        return;
      }
      load(true);
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
      const produs = `${Math.abs(Number(c.buc) || 0)} buc ${[c.produs, c.model].filter(Boolean).join(' ')}`.trim();
      const serv = [c.frecv_serv, c.zi_servisare ? String(c.zi_servisare).replace(/,/g, ', ') : ''].filter(Boolean).join(', ');

      const eu = c.preluat_de && c.preluat_de === driver.name;
      const stare = [];
      if (c.pv_facut_de) stare.push(el('div', { class: 'ca-stare ca-pv' }, [`✔ PV facut de ${c.pv_facut_de}, ${oraDin(c.pv_facut_la)}`]));
      if (c.preluat_de) stare.push(el('div', { class: 'ca-stare' }, [`👤 Preluat de ${eu ? 'tine' : c.preluat_de}, ${oraDin(c.preluat_la)}`]));

      const btnPreiau = el(
        'button',
        {
          class: `btn ca-btn${eu ? ' btn-outline' : ' btn-primary'}`,
          onclick: (e) => { e.stopPropagation(); preiau(c, !eu); },
        },
        [eu ? 'Renunt' : 'Preiau eu']
      );
      const btnPv = el('button', { class: 'btn btn-outline ca-btn', onclick: (e) => { e.stopPropagation(); deschidePv(c); } }, ['📄 Fa PV']);
      // Cand a preluat-o altcineva, nu mai arat "Preiau eu" (se vede cine a luat-o)
      const actiuni = el('div', { class: 'ca-actiuni' }, [c.preluat_de && !eu ? null : btnPreiau, btnPv]);

      return el('div', { class: 'ca-card', style: `border-left-color:${accent}`, onclick: () => deschidePv(c) }, [
        el('div', { class: 'ca-tip', style: `color:${accent}` }, [tipLabel]),
        el('div', { class: 'ca-client' }, [c.client || '—']),
        adresa ? el('div', { class: 'ca-linie' }, ['📍 ', adresa]) : null,
        el('div', { class: 'ca-linie' }, ['📦 ', produs, c.accesorii ? ` · ${c.accesorii}` : '']),
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
    screen.appendChild(el('div', { class: 'screen-scroll' }, [filtre, status, lista]));
    screen.appendChild(el('div', { class: 'bottom-actions' }, [faraComanda]));

    load(false).then(() => load(true));
    return screen;
  });
}
