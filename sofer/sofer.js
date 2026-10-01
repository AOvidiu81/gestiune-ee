// sofer.js — „Șofer EE”: aplicatia unica a soferilor (Rută · PV-uri · Comenzi).
//
// Refoloseste direct modulele aplicatiei de PV-uri (../pv/js/), fara copii:
// <base href="../pv/"> din index.html face ca imaginile, css-ul si sabloanele
// PDF sa se incarce ca in /pv/. Fiind aceeasi origine, login-ul (cheia
// 'ee-pv-auth'), IndexedDB-ul si numerotarea PV-urilor sunt comune cu /pv/.
//
// Etapa 1: pornire (login + masina zilei) si bara cu 3 file.
//   Rută    = aplicatia de rute (../ruta/) intr-un cadru, neschimbata deocamdata
//   PV-uri  = tipurile de PV + Cereri + Istoric
//   Comenzi = comenzile active (screens-comenzi.js, varianta embedded)
// Masina se alege la prima pornire din zi si se poate schimba oricand.

import { el, APP_VERSION as PV_VERSION, forceUpdateApp } from '../pv/js/utils.js';
import { replaceRoot, pushScreen } from '../pv/js/router.js';
import { DriverRepo, CarRepo, DepotRepo } from '../pv/js/db.js';
import { runLoginGate } from '../pv/js/screens-login.js';
import { getCurrentProfile, syncMasterData, getTodayBirthdays } from '../pv/js/auth.js';
import { tile, openModal, pickFromList, primaryButton, outlineButton, sectionCard } from '../pv/js/components.js';
import { PROCESS_TYPES } from '../pv/js/catalog-defaults.js';
import { openProcessVerbalForm } from '../pv/js/screens-pv-form.js';
import { openCereriMenu } from '../pv/js/screens-cereri.js';
import { openHistoryScreen } from '../pv/js/screens-history.js';
import { buildComenziActive } from '../pv/js/screens-comenzi.js';
import { openSettingsScreen } from '../pv/js/screens-setup.js';

export const SOFER_VERSION = 's1';

const KEY_MASINA = 'ee-sofer-masina'; // { id, zi } — masina aleasa si ziua alegerii
const KEY_FILA = 'ee-sofer-fila'; // ultima fila deschisa
const FILE = ['ruta', 'pv', 'comenzi'];
const PROCESS_ICONS = { pin: '📍', truck: '🚚', wrench: '🔧', block: '⛔', invoice: '🧾' };

const stare = { driver: null, car: null, depot: null, drivers: [], cars: [], depots: [] };
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

function seteazaMasina(c) {
  stare.car = c;
  scrie(KEY_MASINA, { id: c.id, zi: aziIso() });
  ui?.peMasinaNoua();
}

async function schimbaMasina() {
  if (!stare.cars.length) return;
  const c = await pickFromList({
    title: 'Cu ce mașină ești?',
    values: stare.cars,
    renderLabel: (c) => `🚚 ${eticheta(c)}${stare.car && c.id === stare.car.id ? '  ✔' : ''}`,
  });
  if (c) seteazaMasina(c);
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

function ecranAlegeMasina() {
  return new Promise((resolve) => {
    replaceRoot(() => {
      const screen = el('div', { class: 'screen' });
      const logo = el('img', { class: 'brand-logo', src: 'assets/logo/euro_ecologic_logo.png', alt: 'Euro Ecologic' });
      const ver = el('div', { class: 'app-version-tag' }, [`Șofer EE ${SOFER_VERSION} · PV ${PV_VERSION}`]);
      const lista = el('div', { class: 'sofer-lista-masini' });
      stare.cars.forEach((c) => lista.appendChild(primaryButton(`🚚 ${eticheta(c)}`, () => resolve(c))));
      const card = sectionCard(`Bună, ${stare.driver.name}!`, [
        el('div', { class: 'sofer-intrebare' }, ['Cu ce mașină pleci azi? O poți schimba oricând din bara de sus.']),
        lista,
      ]);
      screen.appendChild(el('div', { class: 'screen-scroll' }, [logo, ver, card]));
      return screen;
    });
  });
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
        outlineButton('🚚 Schimbă mașina', () => schimbaMasina()),
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

    const masinaBtn = el('button', { class: 'sofer-masina', onclick: () => schimbaMasina() }, ['']);
    const top = el('div', { class: 'topbar sofer-top' }, [
      el('div', { class: 'sofer-cine' }, [el('div', { class: 'sofer-nume' }, [`👤 ${stare.driver.name}`]), masinaBtn]),
      el('button', { class: 'icon-btn', title: 'Setări', onclick: () => ecranSetari() }, ['⚙']),
    ]);

    const panouri = el('div', { class: 'sofer-panouri' });
    const file = [
      { k: 'ruta', icon: '🗺️', label: 'Rută' },
      { k: 'pv', icon: '📄', label: 'PV-uri' },
      { k: 'comenzi', icon: '📋', label: 'Comenzi' },
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

    // Rută: cadrul se creeaza la prima deschidere si ramane viu (ruta pornita nu se pierde la schimbarea filei)
    let rutaCreata = false;
    function creeazaRuta() {
      if (rutaCreata) return;
      rutaCreata = true;
      panou('ruta').appendChild(el('iframe', { class: 'sofer-iframe', src: '../ruta/index.html', allow: 'geolocation', title: 'Rută' }));
    }

    let curenta = null;
    function arata(k) {
      file.forEach((f) => {
        f.panou.classList.toggle('on', f.k === k);
        f.btn.classList.toggle('on', f.k === k);
      });
      if (k === 'ruta') creeazaRuta();
      if (k === 'comenzi' && curenta && curenta !== 'comenzi') comenzi?.reload?.();
      curenta = k;
      scrie(KEY_FILA, k);
    }

    function afiseazaMasina() {
      masinaBtn.textContent = `🚚 ${stare.car ? eticheta(stare.car) : 'alege mașina'} ▾`;
    }

    ui = {
      peMasinaNoua() { afiseazaMasina(); construiesteComenzi(); },
      reincarca() { if (curenta === 'comenzi') comenzi?.reload?.(); },
    };

    afiseazaMasina();
    construiestePv();
    construiesteComenzi();
    screen.append(top, panouri, bara);
    const ultima = citeste(KEY_FILA);
    arata(FILE.includes(ultima) ? ultima : 'comenzi');
    return screen;
  });
}

// ---------- pornirea ----------
async function boot() {
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});

  await runLoginGate(); // login + semnatura + sincronizarea datelor (din /pv/)
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

  const salvata = citeste(KEY_MASINA);
  if (salvata && salvata.zi === aziIso()) stare.car = stare.cars.find((c) => c.id === salvata.id) || null;
  if (!stare.car) seteazaMasina(await ecranAlegeMasina());

  ecranFile();

  // La revenirea in aplicatie: date noi din GestiuneEE; zi noua -> se cere din nou masina
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const inainte = stare.car?.id;
    await resincronizeaza();
    await incarcaLocal();
    if (stare.car?.id !== inainte) ui?.peMasinaNoua();
    else ui?.reincarca();
    if (!stare.car || citeste(KEY_MASINA)?.zi !== aziIso()) await schimbaMasina();
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
