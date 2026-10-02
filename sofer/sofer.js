// sofer.js — „Șofer EE”: aplicatia unica a soferilor (Rută · PV-uri · Comenzi).
//
// Refoloseste direct modulele aplicatiei de PV-uri (../pv/js/), fara copii:
// <base href="../pv/"> din index.html face ca imaginile, css-ul si sabloanele
// PDF sa se incarce ca in /pv/. Fiind aceeasi origine, login-ul (cheia
// 'ee-pv-auth'), IndexedDB-ul si numerotarea PV-urilor sunt comune cu /pv/.
//
// Pornire: login (tinut minte) -> in fiecare dimineata „Alege un coleg” ->
// pagina „Ziua de azi” (masina + km obligatorii; traseu, zi, zona, ordine) ->
// „Generează ruta” sau „Fără rută azi” -> cele 3 file.
//   Rută    = aplicatia de rute (../ruta/?sofer=1) intr-un cadru; primeste datele
//             din „Ziua de azi” si sare peste ecranul ei de start
//   PV-uri  = tipurile de PV + Cereri + Istoric (doar soferul principal + masina)
//   Comenzi = comenzile active (screens-comenzi.js, varianta embedded)

import { el, APP_VERSION as PV_VERSION, forceUpdateApp } from '../pv/js/utils.js';
import { replaceRoot, pushScreen } from '../pv/js/router.js';
import { DriverRepo, CarRepo, DepotRepo } from '../pv/js/db.js';
import { runLoginGate } from '../pv/js/screens-login.js';
import { getCurrentProfile, syncMasterData, getTodayBirthdays, getSupabase, listDriversForLogin, signOut } from '../pv/js/auth.js';
import { tile, openModal, primaryButton, outlineButton, sectionCard } from '../pv/js/components.js';
import { PROCESS_TYPES } from '../pv/js/catalog-defaults.js';
import { openProcessVerbalForm } from '../pv/js/screens-pv-form.js';
import { openCereriMenu } from '../pv/js/screens-cereri.js';
import { openHistoryScreen } from '../pv/js/screens-history.js';
import { buildComenziActive } from '../pv/js/screens-comenzi.js';
import { openSettingsScreen } from '../pv/js/screens-setup.js';

export const SOFER_VERSION = 's7';

const KEY_ZI = 'ee-sofer-zi'; // ziua deschisa: { zi, coleg, carId, km, trasee, zile, zona, ordine, ruta }
const KEY_ULTIMA = 'ee-sofer-ultima'; // ultimele alegeri (masina, traseu, zona) — precompletare
const KEY_LISTE = 'ee-sofer-liste'; // colegi, trasee, zone, saptamani — pentru pornirea fara semnal
const KEY_FILA = 'ee-sofer-fila'; // ultima fila deschisa
const KEY_LOGAT = 'ee-sofer-logat'; // ziua in care s-a ales soferul; zi noua -> din nou „Cine ești?”
const FILE = ['ruta', 'pv', 'comenzi'];
const PROCESS_ICONS = { pin: '📍', truck: '🚚', wrench: '🔧', block: '⛔', invoice: '🧾' };
const ZILE = [
  { v: 'Luni', t: 'Lun.' }, { v: 'Marti', t: 'Mar.' }, { v: 'Miercuri', t: 'Mie.' }, { v: 'Joi', t: 'Joi' },
  { v: 'Vineri', t: 'Vin.' }, { v: 'Sambata', t: 'Sâm.' }, { v: 'Duminica', t: 'Dum.' },
];
const ZI_DIN_DATA = ['Duminica', 'Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata'];

const stare = { driver: null, car: null, depot: null, drivers: [], cars: [], depots: [], zi: null };
let ui = null; // legatura cu ecranul cu file, dupa ce e construit

// ---------- mici ajutoare ----------
function aziIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function citeste(k) {
  try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
}
function scrie(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}
const eticheta = (c) => `${c.marca} - ${c.numar}`;
const ctx = () => ({ driver: stare.driver, car: stare.car, depot: stare.depot });
const numeEchipa = (coleg) => [stare.driver?.name, coleg].filter(Boolean).join(' + ');

// Acelasi criteriu ca in screens-home.js: depozitul alocat soferului din
// GestiuneEE, altfel cel Principal.
function depozitPentru(driver, depots) {
  if (driver?.depotId) {
    const m = depots.find((d) => d.id === driver.depotId);
    if (m) return m;
  }
  return depots.find((d) => d.depotType === 'principal') || depots[0] || null;
}

async function incarcaLocal() {
  const [drivers, cars, depots] = await Promise.all([DriverRepo.getAll(), CarRepo.getAll(), DepotRepo.getAll()]);
  Object.assign(stare, { drivers, cars, depots });
  stare.driver = drivers[0] || null; // dupa login exista un singur sofer local: contul propriu
  stare.depot = depozitPentru(stare.driver, depots);
  if (stare.car) stare.car = cars.find((c) => c.id === stare.car.id) || null;
}

async function resincronizeaza() {
  try {
    const p = await getCurrentProfile();
    if (p) await syncMasterData(p);
  } catch (e) { /* fara semnal: ramane ce e local */ }
}

// ---------- listele pentru „Ziua de azi” (colegi, trasee, zone, saptamani) ----------
function listeImplicite() {
  return { colegi: [], trasee: ['Traseu I', 'Traseu II', 'Traseu III'], zone: [], saptamani: [], ...(citeste(KEY_LISTE) || {}) };
}

async function incarcaListe() {
  const liste = listeImplicite();
  const cuLimita = (p) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), 6000))]);
  try {
    const sb = await getSupabase();
    const [colegi, clienti, sesiuni, sapt] = await Promise.all([
      cuLimita(listDriversForLogin()),
      cuLimita(sb.from('clients').select('masina')),
      cuLimita(sb.from('route_sessions').select('zona').not('zona', 'is', null).order('created_at', { ascending: false }).limit(300)),
      cuLimita(sb.from('week_meta').select('week_num,start_date,end_date')),
    ]);
    if (colegi?.drivers?.length) liste.colegi = colegi.drivers.map((d) => d.full_name).filter(Boolean);
    if (clienti?.data?.length) {
      const t = new Set(liste.trasee);
      clienti.data.forEach((r) => { if (r.masina) t.add(String(r.masina).trim()); });
      liste.trasee = [...t].sort((a, b) => a.length - b.length || a.localeCompare(b));
    }
    if (sesiuni?.data) liste.zone = [...new Set(sesiuni.data.map((r) => String(r.zona || '').trim().toUpperCase()).filter(Boolean))].sort();
    if (sapt?.data?.length) liste.saptamani = sapt.data.map((w) => ({ num: w.week_num, start: w.start_date, end: w.end_date }));
    scrie(KEY_LISTE, liste);
  } catch (e) { /* fara semnal: ramane ce e tinut minte */ }
  return liste;
}

// Aceeasi regula ca in aplicatia de rute: saptamana in care cade ziua de azi
function optiuniOrdine(saptamani) {
  const opt = [
    { v: 'depot', t: '🧭 GPS optimizat (start/retur Depozit)' },
    { v: '', t: '✖ Ordine normală (alfabetic)' },
  ];
  const azi = aziIso();
  let cur = saptamani.find((w) => w.start && w.end && azi >= w.start && azi <= w.end);
  if (!cur) cur = saptamani.filter((w) => w.end && w.end <= azi).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  if (!cur) return opt;
  const scurt = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)}.${m}`; };
  const nume = ['săptămâna aceasta', 'săptămâna trecută', 'acum 2 săptămâni', 'acum 3 săptămâni', 'acum 4 săptămâni'];
  for (let i = 0; i <= 4; i++) {
    const w = saptamani.find((x) => x.num === cur.num - i);
    if (!w || !w.start || !w.end) continue;
    opt.push({ v: String(w.num), t: `🕐 Cu istoric: ${nume[i]} — W${w.num} (${scurt(w.start)}–${scurt(w.end)})` });
  }
  return opt;
}

async function checkBirthdays() {
  const names = await getTodayBirthdays();
  if (!names.length) return;
  const message = names.length === 1 ? `La multi ani, ${names[0]}! 🎉` : `La multi ani, ${names.join(' si ')}! 🎉`;
  await openModal({
    title: '🎂 Zi de nastere',
    bodyNode: el('div', { style: 'text-align:center;font-size:16px;font-weight:700;padding:6px 0' }, [message]),
    actions: [{ label: 'Multumesc!', value: true, primary: true }],
  });
}

// A ales gresit numele: deconectare locala si inapoi la „Cine ești?”
async function altSofer() {
  try { await signOut(); } catch (e) {}
  try { localStorage.removeItem(KEY_LOGAT); localStorage.removeItem(KEY_ZI); } catch (e) {}
  location.reload();
}

// ---------- ferestre mici ----------
// „Alege un coleg”: ceilalti soferi + „Sunt singur”, apoi OK. Intoarce numele colegului sau ''.
async function alegeColeg(colegi, curent, cuInapoi) {
  let ales = curent || '';
  const lista = el('div', { class: 'sofer-colegi' });
  const optiuni = [...colegi.filter((n) => n && n !== stare.driver.name).map((n) => ({ v: n, t: `👤 ${n}` })), { v: '', t: '🙋 Sunt singur' }];
  if (ales && !optiuni.some((o) => o.v === ales)) ales = '';
  const butoane = optiuni.map((o) => {
    const b = el('button', { class: 'sofer-coleg', onclick: () => { ales = o.v; marcheaza(); } }, [o.t]);
    lista.appendChild(b);
    return { o, b };
  });
  function marcheaza() { butoane.forEach(({ o, b }) => b.classList.toggle('on', o.v === ales)); }
  marcheaza();
  const actions = [{ label: 'OK', value: true, primary: true }];
  if (cuInapoi) actions.unshift({ label: '← Nu sunt eu', value: 'inapoi' });
  const ok = await openModal({ title: cuInapoi ? `Bună, ${stare.driver.name}! Alege un coleg` : 'Alege un coleg', bodyNode: lista, actions });
  if (ok === 'inapoi') { await altSofer(); return curent || ''; }
  return ok ? ales : (curent || '');
}

function campNumar(titlu, valoare) {
  const input = el('input', { class: 'field-input', type: 'number', inputmode: 'numeric', min: '0', placeholder: 'ex. 125430' });
  if (valoare !== undefined && valoare !== null && valoare !== '') input.value = String(valoare);
  return { nod: el('div', { class: 'field' }, [el('label', { class: 'field-label' }, [titlu]), input]), input };
}
function campMasina(titlu, idAles, faraId) {
  const sel = el('select', { class: 'field-input' });
  sel.appendChild(el('option', { value: '' }, ['— alege mașina —']));
  stare.cars.filter((c) => c.id !== faraId).forEach((c) => sel.appendChild(el('option', { value: String(c.id) }, [`🚚 ${eticheta(c)}`])));
  if (idAles !== undefined && idAles !== null) sel.value = String(idAles);
  return { nod: el('div', { class: 'field' }, [el('label', { class: 'field-label' }, [titlu]), sel]), sel };
}
const masinaDupaId = (v) => (v === undefined || v === null || v === '' ? null : stare.cars.find((c) => String(c.id) === String(v)) || null);
const kmValid = (v) => /^\d+$/.test(String(v).trim());

// Fereastra cu campuri si validare; `valori()` intoarce rezultatul sau un text de eroare.
async function fereastraCuCampuri({ title, noduri, okLabel, valori }) {
  const eroare = el('div', { class: 'field-error' }, ['']);
  const corp = el('div', {}, [...noduri, eroare]);
  for (;;) {
    const ok = await openModal({
      title,
      bodyNode: corp,
      actions: [{ label: 'Renunță', value: false }, { label: okLabel, value: true, primary: true }],
    });
    if (!ok) return null;
    const r = valori();
    if (typeof r !== 'string') return r;
    eroare.textContent = r;
  }
}

// ---------- ecranele de pornire ----------
function ecranDateLipsa(lipsa) {
  return new Promise((resolve) => {
    replaceRoot(() => {
      const screen = el('div', { class: 'screen' });
      const card = sectionCard('Configurare incompletă', [
        el('div', { style: 'color:var(--ink-soft);font-size:14px;margin-bottom:16px;line-height:1.5' }, [
          `Lipsește: ${lipsa.join(', ')}. Anunță administratorul, apoi apasă „Reîncearcă”.`,
        ]),
        primaryButton('Reîncearcă', async () => { await resincronizeaza(); resolve(); }),
      ]);
      screen.appendChild(el('div', { class: 'screen-scroll' }, [card]));
      return screen;
    });
  });
}

// Pagina „Ziua de azi”. `initial` = valorile de pornire; `gata(z)` primeste ziua completata;
// `inapoi` (optional) = renuntare, cand pagina e deschisa din aplicatie.
function construiesteZiua({ initial, liste, gata, inapoi, cereColeg }) {
  const z = { coleg: '', carId: null, km: '', trasee: [], zile: [], zona: '', ordine: 'depot', ruta: false, ...initial };
  const screen = el('div', { class: 'screen' });
  if (inapoi) {
    screen.appendChild(el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn', onclick: () => inapoi() }, ['←']),
      el('div', { class: 'topbar-title' }, ['Ziua de azi']),
      el('div', { class: 'topbar-spacer' }),
    ]));
  }

  const echipa = el('button', { class: 'sofer-echipa', title: 'Schimbă colegul' }, ['']);
  const arataEchipa = () => { echipa.textContent = `👥 ${numeEchipa(z.coleg)}${z.coleg ? '' : ' (singur)'}  ✎`; };
  echipa.addEventListener('click', async () => { z.coleg = await alegeColeg(liste.colegi, z.coleg); arataEchipa(); });
  arataEchipa();

  const masina = campMasina('Mașina *', z.carId);
  const km = campNumar('Km bord *', z.km);

  function bife(valori, alese) {
    const rand = el('div', { class: 'sofer-bife' });
    const set = new Set(alese);
    valori.forEach(({ v, t }) => {
      const b = el('button', { class: 'sofer-bifa' }, [t]);
      b.classList.toggle('on', set.has(v));
      b.addEventListener('click', () => { if (set.has(v)) set.delete(v); else set.add(v); b.classList.toggle('on', set.has(v)); });
      rand.appendChild(b);
    });
    return { nod: rand, valori: () => valori.map((x) => x.v).filter((v) => set.has(v)) };
  }
  const trasee = bife(liste.trasee.map((t) => ({ v: t, t })), z.trasee);
  const zile = bife(ZILE, z.zile);

  const zona = el('input', { class: 'field-input', type: 'text', placeholder: 'ex. HUNEDOARA, DEVA', list: 'sofer-zone', autocapitalize: 'characters' });
  zona.value = z.zona || '';
  const zone = el('datalist', { id: 'sofer-zone' }, liste.zone.map((n) => el('option', { value: n })));

  const ordine = el('select', { class: 'field-input' });
  const optOrd = optiuniOrdine(liste.saptamani);
  if (!optOrd.some((o) => o.v === z.ordine)) optOrd.push({ v: z.ordine, t: `🕐 Cu istoric: W${z.ordine}` });
  optOrd.forEach((o) => ordine.appendChild(el('option', { value: o.v }, [o.t])));
  ordine.value = z.ordine;

  const eroare = el('div', { class: 'field-error sofer-eroare' }, ['']);
  function aduna(cuRuta) {
    const car = masinaDupaId(masina.sel.value);
    if (!car) { eroare.textContent = 'Alege mașina.'; masina.sel.focus(); return; }
    if (!kmValid(km.input.value)) { eroare.textContent = 'Completează km de la bord (doar cifre).'; km.input.focus(); return; }
    eroare.textContent = '';
    gata({
      zi: aziIso(), coleg: z.coleg, carId: car.id, km: parseInt(km.input.value, 10),
      trasee: trasee.valori(), zile: zile.valori(), zona: zona.value.trim().toUpperCase(), ordine: ordine.value, ruta: cuRuta,
    });
  }

  const camp = (t, nod, nota) => el('div', { class: 'field' }, [el('label', { class: 'field-label' }, [t]), nod, nota ? el('div', { class: 'sofer-nota' }, [nota]) : null]);
  const card = sectionCard('Ziua de azi', [
    echipa,
    masina.nod,
    km.nod,
    camp('Traseu', trasee.nod, 'Poți bifa mai multe. Nimic bifat = toate traseele.'),
    camp('Ziua', zile.nod, 'Poți bifa mai multe zile (rută complementară).'),
    camp('Zona', el('div', {}, [zona, zone])),
    camp('Ordinea rutei', ordine),
    eroare,
    primaryButton('🗺️ Generează ruta', () => aduna(true)),
    el('div', { style: 'height:10px' }),
    z.ruta ? null : outlineButton('Fără rută azi', () => aduna(false)),
    inapoi ? null : el('div', { style: 'height:10px' }),
    inapoi ? null : el('button', { class: 'btn btn-text btn-block', onclick: () => altSofer() }, ['← Nu sunt eu (alege alt șofer)']),
  ]);
  const sus = inapoi ? [] : [
    el('img', { class: 'brand-logo', src: 'assets/logo/euro_ecologic_logo.png', alt: 'Euro Ecologic' }),
    el('div', { class: 'app-version-tag' }, [`Șofer EE ${SOFER_VERSION} · PV ${PV_VERSION}`]),
  ];
  screen.appendChild(el('div', { class: 'screen-scroll' }, [...sus, card]));
  if (cereColeg) setTimeout(async () => { z.coleg = await alegeColeg(liste.colegi, z.coleg, true); arataEchipa(); }, 250);
  return screen;
}

function valoriDePornire() {
  const u = citeste(KEY_ULTIMA) || {};
  const azi = ZI_DIN_DATA[new Date().getDay()];
  return {
    coleg: '', carId: masinaDupaId(u.carId) ? u.carId : null, km: '',
    trasee: Array.isArray(u.trasee) ? u.trasee : [], zile: [azi], zona: u.zona || '', ordine: 'depot', ruta: false,
  };
}

function salveazaZiua(z) {
  stare.zi = z;
  stare.car = masinaDupaId(z.carId);
  scrie(KEY_ZI, z);
  scrie(KEY_ULTIMA, { carId: z.carId, trasee: z.trasee, zona: z.zona });
}

// Dimineata: „Alege un coleg” peste pagina „Ziua de azi”
async function deschideZiua() {
  const liste = await incarcaListe();
  const z = await new Promise((resolve) => {
    replaceRoot(() => construiesteZiua({ initial: valoriDePornire(), liste, gata: resolve, cereColeg: true }));
  });
  salveazaZiua(z);
}

// Din aplicatie: aceeasi pagina, cu valorile de azi (creionul din ruta, numele din bara, „Generează ruta”)
let editareDeschisa = false;
async function editeazaZiua() {
  if (editareDeschisa) return;
  editareDeschisa = true;
  try {
    const liste = await incarcaListe();
    const z = await pushScreen(({ pop }) => construiesteZiua({ initial: stare.zi, liste, gata: (v) => pop(v), inapoi: () => pop(null) }));
    if (!z) return;
    salveazaZiua(z);
    ui?.peZiNoua();
  } finally { editareDeschisa = false; }
}

// Masina din bara de sus. Inainte de ruta: schimbare simpla. Cu ruta pornita: stricata / aleasa gresit.
async function schimbaMasina() {
  if (!stare.cars.length || !stare.zi) return;
  const z = stare.zi;
  let fel = 'simplu';
  if (z.ruta) {
    const lista = el('div', { class: 'sofer-colegi' });
    let inchide = null;
    const alege = (v) => () => inchide?.(v);
    lista.appendChild(el('button', { class: 'sofer-coleg', onclick: alege('stricat') }, ['🛠️ Mașina s-a stricat / trec pe rezervă']));
    lista.appendChild(el('button', { class: 'sofer-coleg', onclick: alege('gresit') }, ['✏️ Am ales greșit mașina']));
    const p = openModal({ title: 'Schimbi mașina?', bodyNode: lista, actions: [{ label: 'Renunță', value: null }] });
    inchide = document.body.lastElementChild.__close; // fereastra tocmai deschisa
    fel = await p;
    if (!fel) return;
  }

  if (fel === 'stricat') {
    const kmFinal = campNumar(`Km final — ${stare.car ? eticheta(stare.car) : 'mașina veche'} *`, '');
    const noua = campMasina('Mașina nouă *', null, stare.car?.id);
    const kmStart = campNumar('Km bord mașina nouă *', '');
    const r = await fereastraCuCampuri({
      title: 'Trec pe altă mașină', noduri: [kmFinal.nod, noua.nod, kmStart.nod], okLabel: 'Schimbă',
      valori: () => {
        const car = masinaDupaId(noua.sel.value);
        if (!kmValid(kmFinal.input.value)) return 'Completează km final al mașinii vechi.';
        if (parseInt(kmFinal.input.value, 10) < Number(z.km)) return `Km final e mai mic decât km de pornire (${z.km}).`;
        if (!car) return 'Alege mașina nouă.';
        if (!kmValid(kmStart.input.value)) return 'Completează km de la bordul mașinii noi.';
        return { car, kmFinal: parseInt(kmFinal.input.value, 10), kmStart: parseInt(kmStart.input.value, 10) };
      },
    });
    if (!r) return;
    const rez = await ui?.schimbaMasinaPeRuta({ kmFinal: r.kmFinal, brand: r.car.marca, plate: r.car.numar, kmStart: r.kmStart });
    if (!rez?.ok) {
      await openModal({
        title: 'Mașina nu a fost schimbată',
        bodyNode: el('div', { class: 'modal-message' }, [rez?.mesaj || 'Deschide întâi fila Rută, apoi încearcă din nou.']),
        actions: [{ label: 'OK', value: true, primary: true }],
      });
      return;
    }
    salveazaZiua({ ...z, carId: r.car.id, km: r.kmStart });
    ui?.peMasinaNoua();
    return;
  }

  const masina = campMasina('Mașina *', z.carId);
  const km = campNumar('Km bord *', z.km);
  const r = await fereastraCuCampuri({
    title: fel === 'gresit' ? 'Corectează mașina' : 'Cu ce mașină ești?', noduri: [masina.nod, km.nod], okLabel: 'Salvează',
    valori: () => {
      const car = masinaDupaId(masina.sel.value);
      if (!car) return 'Alege mașina.';
      if (!kmValid(km.input.value)) return 'Completează km de la bord.';
      return { car, km: parseInt(km.input.value, 10) };
    },
  });
  if (!r) return;
  salveazaZiua({ ...z, carId: r.car.id, km: r.km });
  ui?.peZiNoua(false);
}

function ecranSetari() {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn', onclick: () => pop(undefined) }, ['←']),
      el('div', { class: 'topbar-title' }, ['Setări']),
      el('div', { class: 'topbar-spacer' }),
    ]));
    const card = sectionCard('Șofer EE', [
      el('div', { class: 'sofer-setari' }, [
        el('div', { class: 'sofer-info' }, [`Versiune: Șofer EE ${SOFER_VERSION} · PV ${PV_VERSION}`]),
        el('div', { class: 'sofer-info' }, [`Depozit: ${stare.depot?.name || '-'}`]),
        outlineButton('📅 Ziua de azi (coleg, traseu, zonă)', () => { pop(undefined); editeazaZiua(); }),
        outlineButton('🚚 Schimbă mașina', () => { pop(undefined); schimbaMasina(); }),
        outlineButton('⟳ Forțează actualizarea', () => forceUpdateApp()),
        outlineButton('👤 Cont / Deconectare', () => openSettingsScreen()),
      ]),
    ]);
    screen.appendChild(el('div', { class: 'screen-scroll' }, [card]));
    return screen;
  });
}

// ---------- ecranul principal, cu cele 3 file ----------
function ecranFile() {
  replaceRoot(() => {
    const screen = el('div', { class: 'screen sofer-root' });

    const numeBtn = el('button', { class: 'sofer-nume', title: 'Ziua de azi', onclick: () => editeazaZiua() }, ['']);
    const masinaBtn = el('button', { class: 'sofer-masina', onclick: () => schimbaMasina() }, ['']);
    const top = el('div', { class: 'topbar sofer-top' }, [
      el('div', { class: 'sofer-cine' }, [numeBtn, masinaBtn]),
      el('button', { class: 'icon-btn', title: 'Setări', onclick: () => ecranSetari() }, ['⚙']),
    ]);

    const panouri = el('div', { class: 'sofer-panouri' });
    const file = [
      { k: 'ruta', icon: '🗺️', label: 'Rută' },
      { k: 'comenzi', icon: '📋', label: 'Comenzi' },
      { k: 'pv', icon: '📄', label: 'PV-uri' },
    ];
    const bara = el('div', { class: 'sofer-bara' });
    file.forEach((f) => {
      f.panou = el('div', { class: 'sofer-panou' });
      panouri.appendChild(f.panou);
      f.btn = el('button', { class: 'sofer-fila', onclick: () => arata(f.k) }, [
        el('span', { class: 'sofer-fila-icon' }, [f.icon]),
        el('span', {}, [f.label]),
      ]);
      bara.appendChild(f.btn);
    });
    const panou = (k) => file.find((f) => f.k === k).panou;

    // PV-uri: tipurile de PV direct (fara pasul intermediar din /pv/)
    function construiestePv() {
      const p = panou('pv');
      p.innerHTML = '';
      const tiles = el('div', { class: 'sofer-tiles' });
      PROCESS_TYPES.forEach((pt) => {
        tiles.appendChild(tile({
          label: pt.title,
          sub: pt.subtitle,
          icon: PROCESS_ICONS[pt.icon] || '📄',
          accent: pt.accent,
          badge: pt.accent + '1a',
          onClick: () => openProcessVerbalForm({ ...ctx(), processType: pt.type }),
        }));
      });
      tiles.appendChild(tile({
        label: 'CERERI / DOCUMENTE',
        sub: 'Concediu, demisie, invoire',
        icon: '📁',
        accent: '#2D4D7A',
        badge: '#EEF3FA',
        onClick: () => openCereriMenu(ctx()),
      }));
      const istoric = el('button', { class: 'btn btn-outline btn-block', onclick: () => openHistoryScreen() }, ['📂 Istoric documente']);
      p.appendChild(el('div', { class: 'screen-scroll' }, [tiles, el('div', { style: 'height:16px' }), istoric]));
    }

    // Comenzi: se reconstruieste la schimbarea masinii (masina intra in PV)
    let comenzi = null;
    function construiesteComenzi() {
      const p = panou('comenzi');
      p.innerHTML = '';
      comenzi = buildComenziActive({ ...ctx(), embedded: true, onFaraComanda: () => arata('pv') });
      comenzi.classList.add('sofer-embedded');
      p.appendChild(comenzi);
    }

    // Rută: cu ruta generata -> cadrul aplicatiei de rute, tinut viu (ruta pornita nu se pierde la
    // schimbarea filei) si alimentat cu datele din „Ziua de azi”; fara ruta -> buton de generare.
    let cadru = null;
    let cadruGata = false;
    function dateRuta() {
      const z = stare.zi;
      return {
        driver1: stare.driver.name, driver2: z.coleg || '', brand: stare.car?.marca || '', plate: stare.car?.numar || '',
        km: z.km, zile: z.zile, trasee: z.trasee, zona: z.zona, ordine: z.ordine,
      };
    }
    function trimiteLaRuta() {
      if (!cadru || !cadruGata) return;
      try { cadru.contentWindow.eeSoferAplica(dateRuta()); } catch (e) { console.warn('Șofer EE: ruta nu a primit datele', e); }
    }
    function construiesteRuta() {
      const p = panou('ruta');
      if (stare.zi.ruta) {
        if (cadru) { trimiteLaRuta(); return; }
        p.innerHTML = '';
        cadruGata = false;
        cadru = el('iframe', { class: 'sofer-iframe', src: '../ruta/index.html?sofer=1', allow: 'geolocation', title: 'Rută' });
        cadru.addEventListener('load', () => { cadruGata = true; trimiteLaRuta(); });
        p.appendChild(cadru);
        return;
      }
      cadru = null;
      cadruGata = false;
      p.innerHTML = '';
      p.appendChild(el('div', { class: 'screen-scroll' }, [
        sectionCard('Fără rută azi', [
          el('div', { class: 'sofer-intrebare' }, ['Nu ai generat nicio rută pentru azi. O poți genera oricând de aici.']),
          primaryButton('🗺️ Generează ruta', () => editeazaZiua()),
        ]),
      ]));
    }

    let curenta = null;
    function arata(k) {
      file.forEach((f) => {
        f.panou.classList.toggle('on', f.k === k);
        f.btn.classList.toggle('on', f.k === k);
      });
      if (k === 'comenzi' && curenta && curenta !== 'comenzi') comenzi?.reload?.();
      curenta = k;
      scrie(KEY_FILA, k);
    }

    function afiseazaSus() {
      numeBtn.textContent = `👤 ${numeEchipa(stare.zi.coleg)}`;
      masinaBtn.textContent = `🚚 ${stare.car ? eticheta(stare.car) : 'alege mașina'} · ${stare.zi.km} km ▾`;
    }

    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !cadru || e.source !== cadru.contentWindow) return;
      if (e.data?.type === 'ee-ruta-editeaza') editeazaZiua();
      if (e.data?.type === 'ee-ruta-incheiata') { salveazaZiua({ ...stare.zi, ruta: false }); construiesteRuta(); }
    });

    ui = {
      peMasinaNoua() { afiseazaSus(); construiesteComenzi(); }, // masina schimbata pe drum: ruta stie deja
      peZiNoua(sariLaRuta = true) {
        afiseazaSus(); construiesteComenzi(); construiesteRuta();
        if (sariLaRuta && stare.zi.ruta) arata('ruta');
      },
      reincarca() { if (curenta === 'comenzi') comenzi?.reload?.(); },
      async schimbaMasinaPeRuta(m) {
        if (!cadru || !cadruGata) return { ok: false, mesaj: 'Ruta nu e încă încărcată. Deschide fila Rută și încearcă din nou.' };
        try { return await cadru.contentWindow.eeSoferSchimbaMasina(m); } catch (e) { return { ok: false }; }
      },
    };

    afiseazaSus();
    construiestePv();
    construiesteComenzi();
    construiesteRuta();
    screen.append(top, panouri, bara);
    const ultima = citeste(KEY_FILA);
    arata(FILE.includes(ultima) ? ultima : (stare.zi.ruta ? 'ruta' : 'comenzi'));
    return screen;
  });
}

// ---------- pornirea ----------
async function boot() {
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});

  // Zi noua: aplicatia porneste din nou cu „Cine ești?” (cerut 02.10) — login-ul se tine minte doar in aceeasi zi
  if (citeste(KEY_LOGAT) !== aziIso()) {
    try { await signOut(); } catch (e) {}
    try { localStorage.removeItem(KEY_ZI); } catch (e) {}
  }
  await runLoginGate(); // login + semnatura + sincronizarea datelor (din /pv/)
  scrie(KEY_LOGAT, aziIso());
  checkBirthdays();

  await incarcaLocal();
  while (!stare.drivers.length || !stare.cars.length || !stare.depots.length) {
    const lipsa = [];
    if (!stare.drivers.length) lipsa.push('soferul');
    if (!stare.cars.length) lipsa.push('cel putin o masina activa');
    if (!stare.depots.length) lipsa.push('cel putin un depozit');
    await ecranDateLipsa(lipsa);
    await incarcaLocal();
  }

  // Ziua deschisa azi se tine minte; zi noua (sau masina disparuta) -> „Alege un coleg” + „Ziua de azi”
  const z = citeste(KEY_ZI);
  if (z && z.zi === aziIso() && masinaDupaId(z.carId)) {
    stare.zi = z;
    stare.car = masinaDupaId(z.carId);
  } else {
    await deschideZiua();
    scrie(KEY_FILA, null); // dimineata: fila Rută daca s-a generat ruta, altfel Comenzi
  }

  ecranFile();

  // La revenirea in aplicatie: date noi din GestiuneEE; zi noua -> se redeschide ziua
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if (stare.zi?.zi !== aziIso()) { location.reload(); return; }
    await resincronizeaza();
    await incarcaLocal();
    stare.car = masinaDupaId(stare.zi.carId) || stare.car;
    ui?.reincarca();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('./sw.js', import.meta.url).href, { scope: new URL('./', import.meta.url).href })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
    let reincarcat = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reincarcat) return;
      reincarcat = true;
      location.reload();
    });
  });
}

boot();
