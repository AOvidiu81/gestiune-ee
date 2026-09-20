// admin.js — panou de administrare pentru Euro Ecologic PV: gestioneaza
// soferi (creare/activare-dezactivare/reset parola), masini si produsele
// din catalog. Se conecteaza la acelasi proiect Supabase pe care il
// foloseste si aplicatia soferilor (PWA-ul din radacina proiectului).
//
// Cheia "anon" de mai jos e sigura de expus public: toate tabelele au Row
// Level Security activat, iar operatiile sensibile (creare cont, activare/
// dezactivare, reset parola) trec printr-un Edge Function separat care
// verifica server-side ca cel ce cere are rol de admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://xrveoxmsdvryzyemmkqx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P1TSfVqqbyr3L-elKVgopg_1FpIpkv4';
const FUNCTIONS_URL = SUPABASE_URL + '/functions/v1/admin-manage-users';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache cu toate depozitele (Principal + Secundare), populat de loadDepots()
// la pornirea panoului (vezi apelurile de mai jos) — folosit ca sursa pentru
// selectul "Depozit" din formularele de Sofer/Masina, ca fiecare sofer/masina
// sa poata fi alocat unui depozit (implicit cel Principal), pentru evidenta
// activelor/angajatilor pe depozite.
let allDepotsCache = [];

function depotSelectHtml(id, selectedDepotId) {
  if (!allDepotsCache.length) {
    return `<select id="${id}" disabled><option>Niciun depozit definit — vezi tabul Depozite</option></select>`;
  }
  const options = allDepotsCache
    .map((d) => {
      const label = d.type === 'principal' ? `${d.name} (Principal)` : d.name;
      return `<option value="${d.id}" ${String(d.id) === String(selectedDepotId) ? 'selected' : ''}>${esc(label)}</option>`;
    })
    .join('');
  return `<select id="${id}">${options}</select>`;
}

function defaultPrincipalDepotId() {
  return allDepotsCache.find((d) => d.type === 'principal')?.id || allDepotsCache[0]?.id || '';
}

// Foloseste cache-ul deja incarcat de loadDepots() la pornire; il reincarca
// explicit doar in cazul rar in care formularul e deschis inainte ca acel
// apel initial sa se termine (ex: retea foarte lenta).
async function ensureDepotsCache() {
  if (allDepotsCache.length) return;
  const { data, error } = await supabase.rpc('list_depots');
  if (!error && data) allDepotsCache = data;
}

function usernameToEmail(username) {
  const clean = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `pv-sofer-${clean}@eurowc.ro`;
}

// ---------- format data: DD-MM-YYYY in interfata, YYYY-MM-DD (ISO) in baza
// de date. Input-ul nativ <input type="date"> afiseaza formatul impus de
// browser/regiune (mm/dd/yyyy pe multe telefoane si pe Chrome din Windows),
// nu il putem forta din HTML — de-aia folosim un camp text cu formatare
// automata si validare proprie.
function isoToDmy(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return '';
  return `${d}-${m}-${y}`;
}

function dmyToIso(dmy) {
  const clean = String(dmy || '').trim();
  if (!clean) return { value: '' };
  const match = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return { error: 'Data trebuie scrisa in formatul ZZ-LL-AAAA (ex: 04-02-2025).' };
  const [, dStr, mStr, yStr] = match;
  const d = Number(dStr);
  const m = Number(mStr);
  const y = Number(yStr);
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) {
    return { error: 'Data nu este valida.' };
  }
  return { value: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

/** Ataseaza pe un input text formatarea automata cu cratime pe masura ce
 * se tasteaza cifre: "04022025" -> "04-02-2025". */
function attachDmyAutoformat(input) {
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    input.value = out;
  });
}

async function callAdminFn(action, extra) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Cerere esuata');
  return data;
}

// ---------- toast ----------
const toastHost = document.getElementById('toast-host');
function showToast(message, { danger = false } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (danger ? ' toast-danger' : '');
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- elemente ----------
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const topbarUser = document.getElementById('topbar-user');
const changePasswordBtn = document.getElementById('change-password-btn');
const logoutBtn = document.getElementById('logout-btn');
const modalHost = document.getElementById('modal-host');

let currentAdmin = null; // { id, username, full_name }

// ---------- login / sesiune ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Se autentifica...';
  try {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Utilizator sau parola gresita');
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username, full_name, role, active')
      .eq('id', data.user.id)
      .single();
    if (profileErr || !profile) throw new Error('Nu am gasit profilul acestui cont');
    if (profile.role !== 'admin') {
      await supabase.auth.signOut();
      throw new Error('Acest cont nu are drepturi de administrator');
    }
    if (!profile.active) {
      await supabase.auth.signOut();
      throw new Error('Acest cont e dezactivat');
    }
    currentAdmin = profile;
    enterDashboard();
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Intra in cont';
  }
});

changePasswordBtn.addEventListener('click', async () => {
  await openModal({
    title: 'Schimba parola',
    bodyHtml: `
      <div class="field"><label>Parola noua</label><input id="cp-pass1" type="password" autocomplete="new-password" /></div>
      <div class="field"><label>Confirma parola noua</label><input id="cp-pass2" type="password" autocomplete="new-password" /></div>
      <div class="error-text" id="cp-error"></div>
    `,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Salveaza',
        className: 'btn-primary',
        onClick: async (backdrop) => {
          const p1 = backdrop.querySelector('#cp-pass1').value;
          const p2 = backdrop.querySelector('#cp-pass2').value;
          const errEl = backdrop.querySelector('#cp-error');
          if (!p1) {
            errEl.textContent = 'Introdu parola noua.';
            return false;
          }
          if (p1 !== p2) {
            errEl.textContent = 'Parolele nu coincid.';
            return false;
          }
          const { error } = await supabase.auth.updateUser({ password: p1 });
          if (error) {
            errEl.textContent = error.message;
            return false;
          }
          showToast('Parola a fost schimbata.');
        },
      },
    ],
  });
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentAdmin = null;
  dashboard.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginForm.reset();
});

async function tryRestoreSession() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, active')
    .eq('id', session.user.id)
    .single();
  if (profile && profile.role === 'admin' && profile.active) {
    currentAdmin = profile;
    enterDashboard();
  } else {
    await supabase.auth.signOut();
  }
}

function enterDashboard() {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  topbarUser.textContent = currentAdmin.full_name || currentAdmin.username;
  loadDrivers();
  loadVehicles();
  loadProducts();
  loadDepots();
  loadSediu();
  loadPvFilterDrivers();
  loadPvRecords({ resetLimit: true });
}

// ---------- tabs ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------- sub-taburi (folosite doar de panoul Depozite: Principal / Secundar) ----------
document.querySelectorAll('.subtab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.subpanel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('subpanel-' + btn.dataset.subtab).classList.add('active');
  });
});

// ---------- modal helper ----------
function openModal({ title, bodyHtml, onMount, actions }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-card">
        <h3 class="modal-title">${title}</h3>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-actions"></div>
      </div>`;
    const actionsHost = backdrop.querySelector('.modal-actions');
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (a.className || 'btn-outline');
      btn.textContent = a.label;
      btn.addEventListener('click', async () => {
        if (a.onClick) {
          const result = await a.onClick(backdrop);
          if (result === false) return; // ramane deschis (ex: eroare de validare)
        }
        backdrop.remove();
        resolve(a.value !== undefined ? a.value : null);
      });
      actionsHost.appendChild(btn);
    });
    modalHost.appendChild(backdrop);
    if (onMount) onMount(backdrop);
  });
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ================= SOFERI =================
async function loadDrivers() {
  const tbody = document.getElementById('drivers-tbody');
  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Se incarca...</td></tr>`;
  // RPC (POST) in loc de .from().select() (GET): unele CDN-uri cachuiesc
  // raspunsurile GET dupa URL, ignorand contul autentificat — un sofer nou
  // adaugat sau o dezactivare puteau ramane invizibile in tabel mult timp.
  // POST-ul unei functii RPC nu e cachuit, deci datele sunt mereu proaspete.
  const { data, error } = await supabase.rpc('list_drivers');
  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Eroare: ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Niciun sofer adaugat inca.</td></tr>`;
    return;
  }
  tbody.innerHTML = data
    .map(
      (d) => `
    <tr data-id="${d.id}">
      <td data-label="Utilizator"><strong>${esc(d.username)}</strong></td>
      <td data-label="Nume">${esc(d.full_name)}</td>
      <td data-label="Masina">${esc(d.car_number || '-')}</td>
      <td data-label="Depozit">${esc(d.depot_name || '-')}</td>
      <td data-label="Acces"><span class="badge ${d.active ? 'badge-active' : 'badge-inactive'}">${d.active ? 'Activ' : 'Dezactivat'}</span></td>
      <td data-label="Semnatura"><span class="badge ${d.signature_set ? 'badge-yes' : 'badge-no'}">${d.signature_set ? 'Setata' : 'Neseta'}</span></td>
      <td data-label="Actiuni">
        <div class="row-actions">
          <button class="btn btn-sm btn-outline" data-act="edit">Editeaza</button>
          <button class="btn btn-sm ${d.active ? 'btn-danger-outline' : 'btn-outline'}" data-act="toggle">${d.active ? 'Dezactiveaza' : 'Activeaza'}</button>
          <button class="btn btn-sm btn-outline" data-act="reset">Reset parola</button>
          <button class="btn btn-sm btn-danger-outline" data-act="delete">Sterge</button>
        </div>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    const id = tr.dataset.id;
    const row = data.find((d) => d.id === id);
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => editDriver(row));
    tr.querySelector('[data-act="toggle"]').addEventListener('click', () => toggleDriver(row));
    tr.querySelector('[data-act="reset"]').addEventListener('click', () => resetDriverPassword(row));
    tr.querySelector('[data-act="delete"]').addEventListener('click', () => deleteDriver(row));
  });
}

document.getElementById('add-driver-btn').addEventListener('click', async () => {
  await ensureDepotsCache();
  await openModal({
    title: 'Adauga sofer',
    bodyHtml: `
      <div class="field"><label>Nume utilizator (login)</label><input id="m-username" placeholder="ex: ion.popescu" /></div>
      <div class="field"><label>Nume complet</label><input id="m-fullname" placeholder="Ion Popescu" /></div>
      <div class="field"><label>Numar masina (optional)</label><input id="m-car" placeholder="HR 28 ECC" /></div>
      <div class="field"><label>Depozit</label>${depotSelectHtml('m-depot', defaultPrincipalDepotId())}</div>
      <div class="field"><label>Parola initiala</label><input id="m-password" type="text" placeholder="minim 6 caractere" /></div>
      <div class="hint-text">Soferul se va loga cu acest nume de utilizator si parola. La prima intrare i se va cere sa-si seteze semnatura.</div>
      <div class="hint-text">Depozitul aloca soferul unui punct de lucru, ca sa poti tine evidenta angajatilor pe depozite.</div>
      <div class="error-text" id="m-error"></div>
    `,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Adauga',
        className: 'btn-primary',
        onClick: async (backdrop) => {
          const username = backdrop.querySelector('#m-username').value.trim();
          const full_name = backdrop.querySelector('#m-fullname').value.trim();
          const car_number = backdrop.querySelector('#m-car').value.trim();
          const depot_id = backdrop.querySelector('#m-depot').value;
          const password = backdrop.querySelector('#m-password').value;
          const errEl = backdrop.querySelector('#m-error');
          if (!username || !full_name || !password) {
            errEl.textContent = 'Completeaza utilizator, nume si parola.';
            return false;
          }
          if (password.length < 6) {
            errEl.textContent = 'Parola trebuie sa aiba minim 6 caractere.';
            return false;
          }
          try {
            await callAdminFn('create_driver', { username, password, full_name, car_number, depot_id });
            showToast('Sofer adaugat.');
            loadDrivers();
          } catch (e) {
            errEl.textContent = e.message;
            return false;
          }
        },
      },
    ],
  });
});

async function editDriver(row) {
  await ensureDepotsCache();
  await openModal({
    title: 'Editeaza sofer',
    bodyHtml: `
      <div class="field"><label>Nume utilizator (login)</label><input id="m-username" value="${esc(row.username)}" /></div>
      <div class="field"><label>Nume complet</label><input id="m-fullname" value="${esc(row.full_name)}" /></div>
      <div class="field"><label>CI — serie</label><input id="m-ci-serie" value="${esc(row.ci_serie || '')}" placeholder="ex: HR" /></div>
      <div class="field"><label>CI — numar</label><input id="m-ci-numar" value="${esc(row.ci_numar || '')}" placeholder="ex: 123456" /></div>
      <div class="field"><label>Numar contract</label><input id="m-contract" value="${esc(row.nr_contract || '')}" /></div>
      <div class="field"><label>Data angajarii</label><input id="m-angajare" type="text" inputmode="numeric" maxlength="10" placeholder="ZZ-LL-AAAA" value="${esc(isoToDmy(row.data_angajare))}" /></div>
      <div class="field"><label>Functie</label><input id="m-functie" value="${esc(row.functie || '')}" placeholder="ex: Agent Vanzari" /></div>
      <div class="field"><label>Data nasterii</label><input id="m-nastere" type="text" inputmode="numeric" maxlength="10" placeholder="ZZ-LL-AAAA" value="${esc(isoToDmy(row.data_nasterii))}" /></div>
      <div class="field"><label>Depozit</label>${depotSelectHtml('m-depot', row.depot_id)}</div>
      <div class="hint-text">Functia apare pe Procesele Verbale si pe Cererile generate de sofer. La ziua de nastere, oricine deschide aplicatia soferilor in acea zi vede un mesaj general de felicitare.</div>
      <div class="hint-text">Schimbarea numelui de utilizator schimba si datele de login ale soferului — anunta-l inainte.</div>
      <div class="error-text" id="m-error"></div>
    `,
    onMount: (backdrop) => {
      attachDmyAutoformat(backdrop.querySelector('#m-angajare'));
      attachDmyAutoformat(backdrop.querySelector('#m-nastere'));
    },
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Salveaza',
        className: 'btn-primary',
        onClick: async (backdrop) => {
          const username = backdrop.querySelector('#m-username').value.trim();
          const full_name = backdrop.querySelector('#m-fullname').value.trim();
          const ci_serie = backdrop.querySelector('#m-ci-serie').value.trim();
          const ci_numar = backdrop.querySelector('#m-ci-numar').value.trim();
          const nr_contract = backdrop.querySelector('#m-contract').value.trim();
          const functie = backdrop.querySelector('#m-functie').value.trim();
          const errEl = backdrop.querySelector('#m-error');
          if (!username || !full_name) {
            errEl.textContent = 'Utilizatorul si numele nu pot fi goale.';
            return false;
          }
          const angajareResult = dmyToIso(backdrop.querySelector('#m-angajare').value);
          if (angajareResult.error) {
            errEl.textContent = angajareResult.error;
            return false;
          }
          const nastereResult = dmyToIso(backdrop.querySelector('#m-nastere').value);
          if (nastereResult.error) {
            errEl.textContent = nastereResult.error;
            return false;
          }
          const depot_id = backdrop.querySelector('#m-depot').value;
          try {
            await callAdminFn('update_driver', {
              user_id: row.id,
              username: username !== row.username ? username : undefined,
              full_name,
              car_number: row.car_number || '',
              ci_serie,
              ci_numar,
              nr_contract,
              data_angajare: angajareResult.value,
              functie,
              data_nasterii: nastereResult.value,
              depot_id,
            });
            showToast('Sofer actualizat.');
            loadDrivers();
          } catch (e) {
            errEl.textContent = e.message;
            return false;
          }
        },
      },
    ],
  });
}

async function toggleDriver(row) {
  const nextActive = !row.active;
  const label = nextActive ? 'activezi' : 'dezactivezi';
  await openModal({
    title: nextActive ? 'Activeaza soferul' : 'Dezactiveaza soferul',
    bodyHtml: `<p>Sigur vrei sa ${label} accesul lui <strong>${esc(row.full_name)}</strong>?</p><div class="error-text" id="m-error"></div>`,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: nextActive ? 'Activeaza' : 'Dezactiveaza',
        className: nextActive ? 'btn-primary' : 'btn-danger',
        onClick: async (backdrop) => {
          try {
            await callAdminFn('set_active', { user_id: row.id, active: nextActive });
            showToast(nextActive ? 'Sofer activat.' : 'Sofer dezactivat.');
            loadDrivers();
          } catch (e) {
            backdrop.querySelector('#m-error').textContent = e.message;
            return false;
          }
        },
      },
    ],
  });
}

async function resetDriverPassword(row) {
  await openModal({
    title: 'Reseteaza parola',
    bodyHtml: `
      <p>Parola noua pentru <strong>${esc(row.full_name)}</strong> (${esc(row.username)}):</p>
      <div class="field"><input id="m-password" type="text" placeholder="minim 6 caractere" /></div>
      <div class="error-text" id="m-error"></div>
    `,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Reseteaza',
        className: 'btn-primary',
        onClick: async (backdrop) => {
          const password = backdrop.querySelector('#m-password').value;
          const errEl = backdrop.querySelector('#m-error');
          if (!password || password.length < 6) {
            errEl.textContent = 'Parola trebuie sa aiba minim 6 caractere.';
            return false;
          }
          try {
            await callAdminFn('reset_password', { user_id: row.id, password });
            showToast('Parola a fost resetata.');
          } catch (e) {
            errEl.textContent = e.message;
            return false;
          }
        },
      },
    ],
  });
}

async function deleteDriver(row) {
  await openModal({
    title: 'Sterge sofer',
    bodyHtml: `<p>Aceasta actiune e ireversibila. Stergi definitiv contul lui <strong>${esc(row.full_name)}</strong>?</p><div class="error-text" id="m-error"></div>`,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Sterge definitiv',
        className: 'btn-danger',
        onClick: async (backdrop) => {
          try {
            await callAdminFn('delete_driver', { user_id: row.id });
            showToast('Sofer sters.');
            loadDrivers();
          } catch (e) {
            backdrop.querySelector('#m-error').textContent = e.message;
            return false;
          }
        },
      },
    ],
  });
}

// ================= MASINI =================
async function loadVehicles() {
  const tbody = document.getElementById('vehicles-tbody');
  tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Se incarca...</td></tr>`;
  // RPC (POST), nu GET — vezi comentariul din loadDrivers().
  const { data, error } = await supabase.rpc('list_vehicles');
  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Eroare: ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Nicio masina adaugata inca.</td></tr>`;
    return;
  }
  // Selectul de Depozit din fiecare rand are nevoie de allDepotsCache — la
  // pornirea panoului, loadVehicles() si loadDepots() pornesc in paralel, deci
  // cache-ul poate sa nu fie inca populat cand se randeaza acest tabel.
  await ensureDepotsCache();
  tbody.innerHTML = data
    .map(
      (v) => `
    <tr data-id="${v.id}">
      <td data-label="Marca">${esc(v.brand)}</td>
      <td data-label="Numar">${esc(v.plate_number)}</td>
      <td data-label="Depozit">${depotSelectHtml('depot-select-' + v.id, v.depot_id)}</td>
      <td data-label="Stare"><span class="badge ${v.active ? 'badge-active' : 'badge-inactive'}">${v.active ? 'Activa' : 'Inactiva'}</span></td>
      <td data-label="Actiuni">
        <div class="row-actions">
          <button class="btn btn-sm btn-outline" data-act="toggle">${v.active ? 'Dezactiveaza' : 'Activeaza'}</button>
          <button class="btn btn-sm btn-danger-outline" data-act="delete">Sterge</button>
        </div>
      </td>
    </tr>`
    )
    .join('');
  tbody.querySelectorAll('tr').forEach((tr) => {
    const id = tr.dataset.id;
    const row = data.find((v) => v.id === id);
    tr.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
      const { error } = await supabase.from('vehicles').update({ active: !row.active }).eq('id', id);
      if (error) showToast(error.message, { danger: true });
      else loadVehicles();
    });
    // Depozitul masinii se schimba direct din select, fara modal separat —
    // ca sa fie rapid de realocat cand se muta o masina intre depozite.
    const depotSelect = tr.querySelector('[id^="depot-select-"]');
    if (depotSelect && !depotSelect.disabled) {
      depotSelect.addEventListener('change', async (ev) => {
        const { error: depotErr } = await supabase.from('vehicles').update({ depot_id: ev.target.value }).eq('id', id);
        if (depotErr) showToast(depotErr.message, { danger: true });
        else showToast('Depozit actualizat.');
      });
    }
    tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      await openModal({
        title: 'Sterge masina',
        bodyHtml: `<p>Stergi <strong>${esc(row.brand)} — ${esc(row.plate_number)}</strong>?</p>`,
        actions: [
          { label: 'Anuleaza', className: 'btn-outline' },
          {
            label: 'Sterge',
            className: 'btn-danger',
            onClick: async () => {
              const { error } = await supabase.from('vehicles').delete().eq('id', id);
              if (error) showToast(error.message, { danger: true });
              else { showToast('Masina stearsa.'); loadVehicles(); }
            },
          },
        ],
      });
    });
  });
}

document.getElementById('add-vehicle-btn').addEventListener('click', async () => {
  await ensureDepotsCache();
  await openModal({
    title: 'Adauga masina',
    bodyHtml: `
      <div class="field"><label>Marca</label><input id="m-brand" placeholder="MERCEDES" /></div>
      <div class="field"><label>Numar inmatriculare</label><input id="m-plate" placeholder="HR 28 ECC" /></div>
      <div class="field"><label>Depozit</label>${depotSelectHtml('m-depot', defaultPrincipalDepotId())}</div>
      <div class="hint-text">Depozitul aloca masina unui punct de lucru, ca sa poti tine evidenta activelor pe depozite.</div>
      <div class="error-text" id="m-error"></div>
    `,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Adauga',
        className: 'btn-primary',
        onClick: async (backdrop) => {
          const brand = backdrop.querySelector('#m-brand').value.trim();
          const plate_number = backdrop.querySelector('#m-plate').value.trim();
          const depot_id = backdrop.querySelector('#m-depot').value;
          const errEl = backdrop.querySelector('#m-error');
          if (!brand || !plate_number) {
            errEl.textContent = 'Completeaza marca si numarul.';
            return false;
          }
          const { error } = await supabase.from('vehicles').insert({ brand, plate_number, depot_id: depot_id || null });
          if (error) {
            errEl.textContent = error.message;
            return false;
          }
          showToast('Masina adaugata.');
          loadVehicles();
        },
      },
    ],
  });
});

// ================= PRODUSE =================
async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Se incarca...</td></tr>`;
  // RPC (POST), nu GET — vezi comentariul din loadDrivers().
  const { data, error } = await supabase.rpc('list_products');
  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Eroare: ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Niciun produs adaugat inca.</td></tr>`;
    return;
  }
  tbody.innerHTML = data
    .map(
      (p) => `
    <tr data-id="${p.id}">
      <td data-label="Model">${esc(p.model)}</td>
      <td data-label="Tip">${esc(p.type || '-')}</td>
      <td data-label="Stare"><span class="badge ${p.active ? 'badge-active' : 'badge-inactive'}">${p.active ? 'Activ' : 'Inactiv'}</span></td>
      <td data-label="Actiuni">
        <div class="row-actions">
          <button class="btn btn-sm btn-outline" data-act="toggle">${p.active ? 'Dezactiveaza' : 'Activeaza'}</button>
          <button class="btn btn-sm btn-danger-outline" data-act="delete">Sterge</button>
        </div>
      </td>
    </tr>`
    )
    .join('');
  tbody.querySelectorAll('tr').forEach((tr) => {
    const id = tr.dataset.id;
    const row = data.find((p) => p.id === id);
    tr.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
      const { error } = await supabase.from('products').update({ active: !row.active }).eq('id', id);
      if (error) showToast(error.message, { danger: true });
      else loadProducts();
    });
    tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      await openModal({
        title: 'Sterge produs',
        bodyHtml: `<p>Stergi <strong>${esc(row.model)} ${esc(row.type || '')}</strong>?</p>`,
        actions: [
          { label: 'Anuleaza', className: 'btn-outline' },
          {
            label: 'Sterge',
            className: 'btn-danger',
            onClick: async () => {
              const { error } = await supabase.from('products').delete().eq('id', id);
              if (error) showToast(error.message, { danger: true });
              else { showToast('Produs sters.'); loadProducts(); }
            },
          },
        ],
      });
    });
  });
}

document.getElementById('add-product-btn').addEventListener('click', async () => {
  await openModal({
    title: 'Adauga produs',
    bodyHtml: `
      <div class="field"><label>Model</label><input id="m-model" placeholder="ex: TOALETA" /></div>
      <div class="field"><label>Tip</label><input id="m-type" placeholder="ex: CLASIC" /></div>
      <div class="error-text" id="m-error"></div>
    `,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Adauga',
        className: 'btn-primary',
        onClick: async (backdrop) => {
          const model = backdrop.querySelector('#m-model').value.trim().toUpperCase();
          const type = backdrop.querySelector('#m-type').value.trim().toUpperCase();
          const errEl = backdrop.querySelector('#m-error');
          if (!model) {
            errEl.textContent = 'Modelul e obligatoriu.';
            return false;
          }
          const { error } = await supabase.from('products').insert({ model, type: type || null });
          if (error) {
            errEl.textContent = error.message;
            return false;
          }
          showToast('Produs adaugat.');
          loadProducts();
        },
      },
    ],
  });
});

// ================= DEPOZITE =================
// Gestionate centralizat aici (in loc de local, pe fiecare telefon, ca
// inainte) si sincronizate in aplicatia soferilor prin syncMasterData() /
// list_active_depots() (vezi js/auth.js) — asa ajung sa fie vizibile atat la
// alegerea depozitului la inceputul unui P.V., cat si la determinarea
// automata a adresei de e-mail la care se retrimite avizul semnat, dupa
// judetul mentionat in campul "La Contract" (vezi resolveAvizReturnEmail()
// din js/screens-pv-form.js).
//
// Depozit Principal: depozitul de baza (in prezent HUNEDOARA) — cel care
// apare implicit soferilor si e folosit ca adresa de rezerva cand niciun
// depozit secundar nu se potriveste cu judetul din comanda.
// Depozit Secundar: depozite colaboratoare din alte judete — fiecare e
// legat explicit de un judet (ales dintr-o lista, nu scris liber), ca
// potrivirea sa functioneze mereu corect si sa nu depinda de cum e scrisa
// denumirea depozitului.
const ROMANIAN_COUNTIES = [
  { code: 'AB', name: 'Alba' }, { code: 'AR', name: 'Arad' }, { code: 'AG', name: 'Arges' },
  { code: 'BC', name: 'Bacau' }, { code: 'BH', name: 'Bihor' }, { code: 'BN', name: 'Bistrita-Nasaud' },
  { code: 'BT', name: 'Botosani' }, { code: 'BR', name: 'Braila' }, { code: 'BV', name: 'Brasov' },
  { code: 'B', name: 'Bucuresti' }, { code: 'BZ', name: 'Buzau' }, { code: 'CL', name: 'Calarasi' },
  { code: 'CS', name: 'Caras-Severin' }, { code: 'CJ', name: 'Cluj' }, { code: 'CT', name: 'Constanta' },
  { code: 'CV', name: 'Covasna' }, { code: 'DB', name: 'Dambovita' }, { code: 'DJ', name: 'Dolj' },
  { code: 'GL', name: 'Galati' }, { code: 'GR', name: 'Giurgiu' }, { code: 'GJ', name: 'Gorj' },
  { code: 'HR', name: 'Harghita' }, { code: 'HD', name: 'Hunedoara' }, { code: 'IL', name: 'Ialomita' },
  { code: 'IS', name: 'Iasi' }, { code: 'IF', name: 'Ilfov' }, { code: 'MM', name: 'Maramures' },
  { code: 'MH', name: 'Mehedinti' }, { code: 'MS', name: 'Mures' }, { code: 'NT', name: 'Neamt' },
  { code: 'OT', name: 'Olt' }, { code: 'PH', name: 'Prahova' }, { code: 'SJ', name: 'Salaj' },
  { code: 'SM', name: 'Satu Mare' }, { code: 'SB', name: 'Sibiu' }, { code: 'SV', name: 'Suceava' },
  { code: 'TR', name: 'Teleorman' }, { code: 'TM', name: 'Timis' }, { code: 'TL', name: 'Tulcea' },
  { code: 'VL', name: 'Valcea' }, { code: 'VS', name: 'Vaslui' }, { code: 'VN', name: 'Vrancea' },
];
function countyLabel(code) {
  return ROMANIAN_COUNTIES.find((c) => c.code === code)?.name || code || '-';
}

async function loadDepots() {
  const tbodyPrincipal = document.getElementById('depots-principal-tbody');
  const tbodySecundar = document.getElementById('depots-secundar-tbody');
  tbodyPrincipal.innerHTML = `<tr><td colspan="6" class="empty-state">Se incarca...</td></tr>`;
  tbodySecundar.innerHTML = `<tr><td colspan="7" class="empty-state">Se incarca...</td></tr>`;
  // RPC (POST), nu GET — vezi comentariul din loadDrivers().
  const { data, error } = await supabase.rpc('list_depots');
  if (error) {
    tbodyPrincipal.innerHTML = `<tr><td colspan="6" class="empty-state">Eroare: ${esc(error.message)}</td></tr>`;
    tbodySecundar.innerHTML = `<tr><td colspan="7" class="empty-state">Eroare: ${esc(error.message)}</td></tr>`;
    return;
  }
  allDepotsCache = data || [];
  const principal = allDepotsCache.filter((d) => d.type === 'principal');
  const secundar = allDepotsCache.filter((d) => d.type === 'secundar');

  tbodyPrincipal.innerHTML = principal.length
    ? principal.map((d) => depotRowHtml(d, 'principal')).join('')
    : `<tr><td colspan="6" class="empty-state">Niciun depozit principal adaugat inca.</td></tr>`;
  tbodySecundar.innerHTML = secundar.length
    ? secundar.map((d) => depotRowHtml(d, 'secundar')).join('')
    : `<tr><td colspan="7" class="empty-state">Niciun depozit secundar adaugat inca.</td></tr>`;

  wireDepotRowActions(tbodyPrincipal, principal);
  wireDepotRowActions(tbodySecundar, secundar);
}

function depotRowHtml(d, type) {
  const repLine = [d.representative_name, d.representative_phone].filter(Boolean).join(' — ') || '-';
  // Cele doua tabele au coloane usor diferite (vezi index.html): cel
  // Principal are Adresa, cel Secundar are Judet + Cuvant cheie in loc —
  // randul trebuie sa aiba exact acelasi numar/ordine de celule ca antetul
  // respectiv.
  const judetCell = type === 'secundar' ? `<td data-label="Judet"><strong>${esc(countyLabel(d.county_code))}</strong></td>` : '';
  const addressCell = type === 'principal' ? `<td data-label="Adresa">${esc(d.address || '-')}</td>` : '';
  const keywordCell =
    type === 'secundar'
      ? `<td data-label="Cuvant cheie">${d.contract_keyword ? `<span class="badge badge-active">${esc(d.contract_keyword)}</span>` : '-'}</td>`
      : '';
  return `
    <tr data-id="${d.id}">
      ${judetCell}
      <td data-label="Denumire">${esc(d.name)}</td>
      ${addressCell}
      ${keywordCell}
      <td data-label="Reprezentant">${repLine}</td>
      <td data-label="Email">${esc(d.representative_email || '-')}</td>
      <td data-label="Stare"><span class="badge ${d.active ? 'badge-active' : 'badge-inactive'}">${d.active ? 'Activ' : 'Inactiv'}</span></td>
      <td data-label="Actiuni">
        <div class="row-actions">
          <button class="btn btn-sm btn-outline" data-act="edit">Editeaza</button>
          <button class="btn btn-sm ${d.active ? 'btn-danger-outline' : 'btn-outline'}" data-act="toggle">${d.active ? 'Dezactiveaza' : 'Activeaza'}</button>
          <button class="btn btn-sm btn-danger-outline" data-act="delete">Sterge</button>
        </div>
      </td>
    </tr>`;
}

function wireDepotRowActions(tbody, rows) {
  tbody.querySelectorAll('tr').forEach((tr) => {
    const id = tr.dataset.id;
    if (!id) return;
    const row = rows.find((d) => d.id === id);
    if (!row) return;
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => openDepotEditor(row));
    tr.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
      const { error } = await supabase.from('depots').update({ active: !row.active }).eq('id', id);
      if (error) showToast(error.message, { danger: true });
      else loadDepots();
    });
    tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      await openModal({
        title: 'Sterge depozit',
        bodyHtml: `<p>Stergi depozitul <strong>${esc(row.name)}</strong>?</p><p class="hint-text">Soferii care aveau acest depozit sincronizat local il vor pierde la urmatoarea sincronizare.</p>`,
        actions: [
          { label: 'Anuleaza', className: 'btn-outline' },
          {
            label: 'Sterge',
            className: 'btn-danger',
            onClick: async () => {
              const { error } = await supabase.from('depots').delete().eq('id', id);
              if (error) showToast(error.message, { danger: true });
              else { showToast('Depozit sters.'); loadDepots(); }
            },
          },
        ],
      });
    });
  });
}

function depotFormFieldsHtml(type, base) {
  const countyOptions = ROMANIAN_COUNTIES.map(
    (c) => `<option value="${c.code}" ${base.county_code === c.code ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
  const judetField =
    type === 'secundar'
      ? `<div class="field"><label>Judet</label><select id="m-county">${countyOptions}</select></div>`
      : '';
  // Cuvant cheie de contract/client (optional, doar Secundar): o exceptie
  // legata de un anumit contract, nu de o zona intreaga — vezi comentariul
  // din resolveAvizReturnEmail() (js/screens-pv-form.js). Verificat inaintea
  // judetului, si exclude acest depozit din potrivirea dupa judet, ca sa nu
  // intre in conflict cu alt depozit de pe acelasi judet (ex: Depozit SIBIU
  // vs. Depozit NOVALIS, ambele in judetul SB).
  const keywordField =
    type === 'secundar'
      ? `<div class="field"><label>Cuvant cheie contract (optional)</label><input id="m-keyword" value="${esc(base.contract_keyword || '')}" placeholder="ex: NOVALIS" /></div>`
      : '';
  return `
    ${judetField}
    <div class="field"><label>Denumire depozit</label><input id="m-name" value="${esc(base.name || '')}" placeholder="${type === 'secundar' ? 'ex: Depozit Alba' : 'ex: HUNEDOARA'}" /></div>
    <div class="field"><label>Adresa</label><input id="m-address" value="${esc(base.address || '')}" /></div>
    ${keywordField}
    <div class="field"><label>Reprezentant</label><input id="m-repname" value="${esc(base.representative_name || '')}" /></div>
    <div class="field"><label>Functie reprezentant</label><input id="m-repfunction" value="${esc(base.representative_function || '')}" /></div>
    <div class="field"><label>Telefon</label><input id="m-repphone" value="${esc(base.representative_phone || '')}" /></div>
    <div class="field"><label>Email reprezentant</label><input id="m-repemail" value="${esc(base.representative_email || '')}" placeholder="ex: alba@eurowc.ro" /></div>
    <div class="field"><label>Parola acces — Cerere de Demisie (optional)</label><input id="m-accesscode" value="${esc(base.representative_access_code || '')}" placeholder="lasa gol = fara verificare parola" /></div>
    ${
      type === 'secundar'
        ? '<div class="hint-text">Cand campul "La Contract" al comenzii mentioneaza acest judet, avizul semnat se retrimite automat la emailul de mai sus. Daca ai completat un Cuvant cheie, acela are prioritate (verificat primul) si depozitul nu mai e luat in calcul la potrivirea dupa judet — folositor cand exceptia e legata de un contract/client anume, nu de intreg judetul.</div>'
        : '<div class="hint-text">Depozitul principal apare implicit soferilor si e folosit ca adresa de retrimitere cand niciun depozit secundar nu se potriveste cu judetul din comanda.</div>'
    }
    <div class="error-text" id="m-error"></div>
  `;
}

async function openDepotEditor(existing) {
  const type = existing?.type || openDepotEditor.nextType;
  const base = existing || {};
  await openModal({
    title: existing ? 'Editeaza depozit' : type === 'secundar' ? 'Adauga depozit secundar' : 'Adauga depozit principal',
    bodyHtml: depotFormFieldsHtml(type, base),
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: existing ? 'Salveaza' : 'Adauga',
        className: 'btn-primary',
        onClick: async (backdrop) => {
          const name = backdrop.querySelector('#m-name').value.trim();
          const errEl = backdrop.querySelector('#m-error');
          if (!name) {
            errEl.textContent = 'Denumirea depozitului este obligatorie.';
            return false;
          }
          const payload = {
            type,
            name,
            county_code: type === 'secundar' ? backdrop.querySelector('#m-county').value : null,
            address: backdrop.querySelector('#m-address').value.trim(),
            contract_keyword: type === 'secundar' ? backdrop.querySelector('#m-keyword').value.trim() || null : null,
            representative_name: backdrop.querySelector('#m-repname').value.trim(),
            representative_function: backdrop.querySelector('#m-repfunction').value.trim(),
            representative_phone: backdrop.querySelector('#m-repphone').value.trim(),
            representative_email: backdrop.querySelector('#m-repemail').value.trim(),
            representative_access_code: backdrop.querySelector('#m-accesscode').value.trim(),
          };
          const { error } = existing
            ? await supabase.from('depots').update(payload).eq('id', existing.id)
            : await supabase.from('depots').insert(payload);
          if (error) {
            errEl.textContent = error.message;
            return false;
          }
          showToast(existing ? 'Depozit actualizat.' : 'Depozit adaugat.');
          loadDepots();
        },
      },
    ],
  });
}

document.getElementById('add-depot-principal-btn').addEventListener('click', () => {
  openDepotEditor.nextType = 'principal';
  openDepotEditor(null);
});
document.getElementById('add-depot-secundar-btn').addEventListener('click', () => {
  openDepotEditor.nextType = 'secundar';
  openDepotEditor(null);
});

// ================= SEDIU =================
// Datele firmei (un singur rand in Supabase, vezi tabelul company_info) —
// inainte hardcodate in js/catalog-defaults.js (COMPANY_INFO), acum
// editabile de aici. Aplicatia soferilor le sincronizeaza la syncMasterData()
// (js/auth.js) si le foloseste pe antetul documentelor si ca adresa de
// retrimitere a avizului pentru judetul Harghita.
async function loadSediu() {
  const { data, error } = await supabase.rpc('get_company_info');
  const errEl = document.getElementById('sediu-error');
  if (error) {
    errEl.textContent = 'Eroare la incarcare: ' + error.message;
    return;
  }
  errEl.textContent = '';
  const c = (data && data[0]) || {};
  document.getElementById('sediu-name').value = c.name || '';
  document.getElementById('sediu-address').value = c.address || '';
  document.getElementById('sediu-regcom').value = c.reg_com || '';
  document.getElementById('sediu-cui').value = c.cui || '';
  document.getElementById('sediu-phone').value = c.phone || '';
  document.getElementById('sediu-email').value = c.email || '';
  document.getElementById('sediu-website').value = c.website || '';
}

document.getElementById('save-sediu-btn').addEventListener('click', async () => {
  const errEl = document.getElementById('sediu-error');
  const btn = document.getElementById('save-sediu-btn');
  const payload = {
    name: document.getElementById('sediu-name').value.trim(),
    address: document.getElementById('sediu-address').value.trim(),
    reg_com: document.getElementById('sediu-regcom').value.trim(),
    cui: document.getElementById('sediu-cui').value.trim(),
    phone: document.getElementById('sediu-phone').value.trim(),
    email: document.getElementById('sediu-email').value.trim(),
    website: document.getElementById('sediu-website').value.trim(),
  };
  if (!payload.name || !payload.email) {
    errEl.textContent = 'Denumirea si emailul sunt obligatorii.';
    return;
  }
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Se salveaza...';
  try {
    const { error } = await supabase.from('company_info').update(payload).eq('id', true);
    if (error) throw error;
    showToast('Datele firmei au fost actualizate.');
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salveaza';
  }
});

// ================= PROCESE VERBALE =================
// Istoric al PV-urilor sincronizate din PWA (vezi uploadPvRecordToCloud() din
// js/auth.js) — copie separata in Supabase, NU inlocuieste istoricul local de
// pe telefonul soferului. Adminul le vede aici, le poate descarca (link
// semnat, valabil 2 minute, catre PDF-ul exact generat de sofer) si sterge
// definitiv dupa ce le-a arhivat local pe calculator.

const PV_TYPE_LABELS = {
  AMPLASARE: 'Amplasare',
  RIDICARE: 'Ridicare',
  SERVISARE: 'Servisare',
  'LIPSA ACCES': 'Lipsa acces',
  VANZARE: 'Vanzare',
};

let pvCurrentLimit = 200;

function pvFileSizeLabel(bytes) {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Acelasi format ca displayPvNumber() din js/pv-numbering.js ("PV_00001" ->
// "PV - 00001") — reprodus aici, nu importat, ca admin.js sa ramana complet
// independent de codul PWA-ului (nu impart niciun modul intre cele doua app-uri).
function pvDisplayNumber(value) {
  const match = /^(PV[A-Z]*)_(\d{5})$/.exec(value || '');
  if (!match) return value || '-';
  return `${match[1]} - ${match[2]}`;
}

// Ajuta la numele fisierului descarcat local (vezi buildPvFileName mai jos):
// litere mari, fara diacritice, doar A-Z/0-9, cuvintele despartite cu "-".
function fileToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Elimina segmentul de judet dintr-o adresa (ex: "Hunedoara, jud. Hunedoara,
// str. X" -> "Hunedoara, str. X") -- judetul e deja aratat separat, ca
// abreviere de 2 litere (row.county, calculata la sofer -- vezi
// screens-pv-form.js/utils.js din PWA), asa ca nu mai trebuie repetat si
// scris integral in numele fisierului.
function addressWithoutCounty(address) {
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  const rest = parts.filter((p) => !/^jud/i.test(p.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  return rest.join(', ') || String(address || '').trim();
}

// Numele fisierului la descarcare locala: TIP-CLIENT-JUDET-LOCATIE-DATA.pdf
// (ex: "PVA-FLORERO-GRUP-SRL-HD-HUNEDOARA-STR-STEFAN-CEL-MARE-03-09-2026.pdf").
// Prefixul de tip (PVA/PVR/etc.) e extras direct din pv_number, ca sa ramana
// mereu identic cu ce arata coloana "Nr PV" — nu mai reproducem separat
// maparea tip->prefix. Judetul (2 litere, exceptie "B" pentru Bucuresti) vine
// deja calculat de pe telefon (row.county) — PV-urile facute inainte de
// aceasta actualizare nu il au, si atunci pur si simplu lipseste din nume.
function buildPvFileName(row) {
  const prefixMatch = /^(PV[A-Z]*)_/.exec(row.pv_number || '');
  const prefix = prefixMatch ? prefixMatch[1] : 'PV';
  const created = new Date(row.created_at);
  const dateToken = `${String(created.getDate()).padStart(2, '0')}-${String(created.getMonth() + 1).padStart(2, '0')}-${created.getFullYear()}`;
  const clientToken = fileToken(row.client_name) || 'CLIENT';
  const restLocation = addressWithoutCounty(row.location);
  const locationToken = fileToken(`${row.county || ''} ${restLocation}`) || 'LOCATIE';
  return `${prefix}-${clientToken}-${locationToken}-${dateToken}.pdf`;
}

async function loadPvFilterDrivers() {
  const select = document.getElementById('pv-filter-driver');
  const { data, error } = await supabase.rpc('list_drivers');
  if (error || !data) return;
  const currentValue = select.value;
  select.innerHTML =
    '<option value="">Toti soferii</option>' + data.map((d) => `<option value="${esc(d.id)}">${esc(d.full_name)}</option>`).join('');
  select.value = currentValue;
}

async function loadPvRecords({ resetLimit = false } = {}) {
  if (resetLimit) pvCurrentLimit = 200;
  const tbody = document.getElementById('pv-tbody');
  const summary = document.getElementById('pv-summary');
  const loadMoreRow = document.getElementById('pv-load-more-row');
  tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Se incarca...</td></tr>`;
  summary.textContent = '';
  loadMoreRow.style.display = 'none';

  const driverId = document.getElementById('pv-filter-driver').value || null;
  const processType = document.getElementById('pv-filter-type').value || null;
  const fromResult = dmyToIso(document.getElementById('pv-filter-from').value);
  const toResult = dmyToIso(document.getElementById('pv-filter-to').value);
  if (fromResult.error) {
    tbody.innerHTML = '';
    summary.textContent = 'Data "de la" nu este valida (foloseste ZZ-LL-AAAA).';
    return;
  }
  if (toResult.error) {
    tbody.innerHTML = '';
    summary.textContent = 'Data "pana la" nu este valida (foloseste ZZ-LL-AAAA).';
    return;
  }

  // RPC (POST), nu .from().select() (GET) — vezi comentariul din loadDrivers().
  const { data, error } = await supabase.rpc('list_pv_records', {
    p_driver_id: driverId,
    p_process_type: processType,
    p_date_from: fromResult.value || null,
    p_date_to: toResult.value || null,
    p_limit: pvCurrentLimit,
  });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Eroare: ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Niciun proces verbal in Supabase pentru acest filtru.</td></tr>`;
    return;
  }

  const totalBytes = data.reduce((sum, r) => sum + (r.file_size || 0), 0);
  summary.textContent = `${data.length} document${data.length === 1 ? '' : 'e'} · ${pvFileSizeLabel(totalBytes)} total`;

  tbody.innerHTML = data
    .map((r) => {
      const created = new Date(r.created_at);
      const dateLabel = created.toLocaleDateString('ro-RO') + ' ' + created.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
      return `
    <tr data-id="${esc(r.id)}">
      <td data-label="Data">${dateLabel}</td>
      <td data-label="Nr PV"><strong>${esc(pvDisplayNumber(r.pv_number))}</strong></td>
      <td data-label="Tip">${esc(PV_TYPE_LABELS[r.process_type] || r.process_type || '-')}</td>
      <td data-label="Client">${esc(r.client_name || '-')}</td>
      <td data-label="Locatie">${r.county ? `<strong>[${esc(r.county)}]</strong> ` : ''}${esc(r.location || '-')}</td>
      <td data-label="Sofer">${esc(r.driver_name)}</td>
      <td data-label="Depozit">${esc(r.depot_name || '-')}</td>
      <td data-label="Marime">${pvFileSizeLabel(r.file_size)}</td>
      <td data-label="Actiuni">
        <div class="row-actions">
          ${
            r.downloaded_at
              ? `<button class="btn btn-sm btn-success" data-act="download">✓ Fisier Descarcat</button>
             <button class="btn btn-sm btn-danger-outline" data-act="delete">Sterge</button>`
              : `<button class="btn btn-sm btn-warning" data-act="download">Descarca</button>`
          }
        </div>
      </td>
    </tr>`;
    })
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    const id = tr.dataset.id;
    const row = data.find((r) => r.id === id);
    tr.querySelector('[data-act="download"]').addEventListener('click', () => downloadPvRecord(row));
    // Butonul de Sterge exista in DOM doar dupa ce PV-ul a fost deja
    // descarcat macar o data (vezi randul din template mai sus) -- inainte
    // de asta, pur si simplu nu e in pagina, deci verificam ca exista.
    const deleteBtn = tr.querySelector('[data-act="delete"]');
    if (deleteBtn) deleteBtn.addEventListener('click', () => deletePvRecord(row));
  });

  loadMoreRow.style.display = data.length >= pvCurrentLimit ? 'flex' : 'none';
}

async function downloadPvRecord(row) {
  const { data, error } = await supabase.storage.from('pv-documents').createSignedUrl(row.storage_path, 120);
  if (error || !data?.signedUrl) {
    showToast('Nu am putut genera link-ul de descarcare: ' + (error?.message || ''), { danger: true });
    return;
  }
  // Descarcam efectiv PDF-ul (fetch -> blob) in loc sa deschidem doar link-ul
  // semnat: atributul "download" al unui <a> e ignorat de browsere pentru
  // linkuri cross-origin (catre alt domeniu, ca cel al Supabase), asa ca
  // fara acest pas fisierul ar ajunge cu numele intern (un uuid.pdf) in loc
  // de numele citibil TIP-CLIENT-LOCATIE-DATA de mai jos. Cu blob-ul local
  // (aceeasi origine), "download" functioneaza corect.
  try {
    const res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = buildPvFileName(row);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    // Marcheaza in Supabase ca fisierul a fost descarcat macar o data — abia
    // dupa asta apare butonul Sterge (siguranta: nu poti sterge un PV inainte
    // sa confirmi ca l-ai salvat local macar o data). Reincarcam randul ca sa
    // arate imediat noua stare (Fisier Descarcat + Sterge).
    const { error: markErr } = await supabase.from('pv_records').update({ downloaded_at: new Date().toISOString() }).eq('id', row.id);
    if (!markErr) loadPvRecords();
  } catch (e) {
    showToast('Nu am putut descarca fisierul: ' + e.message, { danger: true });
  }
}

async function deletePvRecord(row) {
  await openModal({
    title: 'Sterge Proces Verbal',
    bodyHtml: `<p>Aceasta actiune e ireversibila. Stergi definitiv <strong>${esc(pvDisplayNumber(row.pv_number))}</strong> — ${esc(
      row.client_name || ''
    )}?</p><p class="hint-text">Asigura-te ca l-ai descarcat local, daca vrei sa-l pastrezi — dupa stergere nu mai poate fi recuperat.</p><div class="error-text" id="m-error"></div>`,
    actions: [
      { label: 'Anuleaza', className: 'btn-outline' },
      {
        label: 'Sterge definitiv',
        className: 'btn-danger',
        onClick: async (backdrop) => {
          try {
            const { error: storageErr } = await supabase.storage.from('pv-documents').remove([row.storage_path]);
            if (storageErr) throw storageErr;
            const { error: dbErr } = await supabase.from('pv_records').delete().eq('id', row.id);
            if (dbErr) throw dbErr;
            showToast('Proces verbal sters.');
            loadPvRecords();
          } catch (e) {
            backdrop.querySelector('#m-error').textContent = e.message;
            return false;
          }
        },
      },
    ],
  });
}

document.getElementById('pv-filter-apply').addEventListener('click', () => loadPvRecords({ resetLimit: true }));
attachDmyAutoformat(document.getElementById('pv-filter-from'));
attachDmyAutoformat(document.getElementById('pv-filter-to'));
document.getElementById('pv-load-more-btn').addEventListener('click', () => {
  pvCurrentLimit += 200;
  loadPvRecords();
});

// ---------- start ----------
tryRestoreSession();
