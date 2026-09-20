// auth.js — autentificare sofer/admin prin Supabase si sincronizarea
// datelor centrale (profil propriu, masini, produse) in IndexedDB local,
// ca soferul sa poata continua sa lucreze fara semnal dupa ce s-a logat
// macar o data. Genereaza PV-uri complet offline, la fel ca inainte —
// singura diferenta e ca acum aplicatia porneste cu un ecran de login.
//
// IMPORTANT: libraria supabase-js vine de pe un CDN extern (esm.sh), nu
// din acest proiect. Daca am importa-o static la nivel de modul, o
// pornire OFFLINE a aplicatiei (dupa ce soferul s-a logat deja o data)
// ar putea pica integral doar pentru ca acel fetch cross-origin esueaza —
// exact opusul a ce ne-am dorit. De aceea clientul Supabase se incarca
// LENES (dynamic import), o singura data, doar cand chiar e nevoie de
// retea, iar fiecare functie de mai jos are o cale de rezerva pe date
// cachuite local cand reteaua lipseste.

import { DriverRepo, CarRepo, DepotRepo, CatalogRepo, MetaRepo } from './db.js';
import { DEFAULT_AUXILIARY_BY_CATEGORY, COMPANY_INFO } from './catalog-defaults.js';

/** Cheie de comparatie insensibila la majuscule/spatii, folosita ca sa
 * detectam un rand local (adaugat manual, de INAINTE sa existe admin-ul
 * centralizat) care de fapt descrie aceeasi masina/acelasi depozit ca unul
 * proaspat sincronizat — ca sa nu apara duplicat in selectoare. */
function dedupeKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

const SUPABASE_URL = 'https://xrveoxmsdvryzyemmkqx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P1TSfVqqbyr3L-elKVgopg_1FpIpkv4';
const FUNCTIONS_URL = SUPABASE_URL + '/functions/v1/admin-manage-users';

// id local stabil pentru randul DriverRepo/CarRepo sincronizat din profilul
// autentificat, ca sincronizarile repetate sa actualizeze acelasi rand
// (put pe indexeddb) in loc sa creeze duplicate la fiecare login.
const LOCAL_DRIVER_KEY = 'synced-driver';

let clientPromise = null;
function getSupabase() {
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2')
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
      )
      .catch((e) => {
        clientPromise = null; // permite o noua incercare data viitoare (poate revine semnalul)
        throw e;
      });
  }
  return clientPromise;
}

function usernameToEmail(username) {
  const clean = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `pv-sofer-${clean}@eurowc.ro`;
}

export async function getSession() {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  } catch (e) {
    return null; // fara retea la incarcarea librariei -> tratam ca "neautentificat acum"
  }
}

export async function signIn(username, password) {
  let supabase;
  try {
    supabase = await getSupabase();
  } catch (e) {
    return { error: 'Autentificarea are nevoie de internet. Verifica conexiunea si incearca din nou.' };
  }
  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = String(error.message || error.code || '').toLowerCase();
    if (msg.includes('banned') || msg.includes('disabled')) {
      return { error: 'Acest cont a fost dezactivat. Contacteaza administratorul.' };
    }
    return { error: 'Utilizator sau parola gresita' };
  }
  const profile = await fetchOwnProfile(supabase, data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    return { error: 'Nu am gasit profilul acestui cont' };
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    return { error: 'Acest cont a fost dezactivat. Contacteaza administratorul.' };
  }
  await MetaRepo.set('lastProfile', profile);
  return { profile };
}

/** Lista soferilor activi pentru ecranul de selectare de la pornirea
 * aplicatiei (inainte de orice autentificare) — doar id + nume, nimic
 * sensibil (username, masina etc. raman ascunse). */
export async function listDriversForLogin() {
  let supabase;
  try {
    supabase = await getSupabase();
  } catch (e) {
    return { error: 'Ai nevoie de internet ca sa vezi lista de soferi.' };
  }
  const { data, error } = await supabase.rpc('list_drivers_for_login');
  if (error) return { error: 'Nu am putut incarca lista de soferi.' };
  return { drivers: data || [] };
}

/** Autentificare FARA parola: soferul doar isi atinge numele din lista
 * (populata din panoul de admin). Un Edge Function dedicat verifica
 * server-side ca id-ul chiar corespunde unui cont de sofer activ, apoi
 * emite un token de sesiune pe care il schimbam aici pe o sesiune reala
 * Supabase — la fel de valida ca una obtinuta cu parola, doar ca fara sa
 * fi tastat vreuna. Odata stabilita, sesiunea ramane pe telefon (la fel
 * ca inainte), asa ca acest ecran nu mai reapare decat dupa deconectare
 * explicita. */
export async function signInAsDriver(driverId) {
  let supabase;
  try {
    supabase = await getSupabase();
  } catch (e) {
    return { error: 'Autentificarea are nevoie de internet. Verifica conexiunea si incearca din nou.' };
  }
  let payload;
  try {
    const res = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'issue_driver_session', driver_id: driverId }),
    });
    payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Cerere esuata');
  } catch (e) {
    return { error: 'Nu am putut incepe sesiunea: ' + e.message };
  }
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: payload.token_hash, type: 'magiclink' });
  if (error) return { error: 'Nu am putut incepe sesiunea.' };
  const profile = await fetchOwnProfile(supabase, data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    return { error: 'Nu am gasit profilul acestui cont' };
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    return { error: 'Acest cont a fost dezactivat. Contacteaza administratorul.' };
  }
  await MetaRepo.set('lastProfile', profile);
  return { profile };
}

export async function signOut() {
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } catch (e) {
    // fara retea: nu putem invalida sesiunea pe server acum, dar stergem
    // oricum copia locala ca ecranul de login sa reapara la reincarcare
  }
  await MetaRepo.set('lastProfile', null);
}

async function fetchOwnProfile(supabase, userId) {
  // RPC (POST), nu .from().select() (GET): raspunsurile GET pot fi cachuite
  // undeva intre client si Supabase dupa URL, indiferent de contul folosit —
  // asta ar putea insemna ca un sofer dezactivat de admin tot trece de poarta
  // de login pentru ca primeste un raspuns vechi, cu "active: true", din
  // cache. POST-ul unei functii RPC nu e cachuit, deci verificarea e mereu
  // pe date proaspete.
  const { data, error } = await supabase.rpc('get_own_profile');
  if (error || !data || !data.length) return null;
  return data[0];
}

/** Profilul soferului logat momentan, sau null daca nu exista sesiune
 * cunoscuta local. Daca reteaua lipseste, foloseste ultima copie cachuita
 * (asa ramane accesul functional offline dupa primul login reusit). */
export async function getCurrentProfile() {
  const cached = await MetaRepo.get('lastProfile');
  const cachedProfile = cached?.value || null;
  try {
    const supabase = await getSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session) return null; // fara sesiune reala (expirata/delogata) -> nu folosim un profil vechi cachuit
    const profile = await fetchOwnProfile(supabase, session.user.id);
    if (profile) {
      await MetaRepo.set('lastProfile', profile);
      return profile;
    }
    return null;
  } catch (e) {
    // offline: daca stim ca a existat un login anterior, il folosim ca atare
    return cachedProfile;
  }
}

/** Salveaza semnatura proprie a soferului (setata o singura data, la prima
 * utilizare) — necesita internet, e un pas ce se intampla o singura data. */
export async function saveOwnSignature(dataUrl) {
  const supabase = await getSupabase().catch(() => {
    throw new Error('Ai nevoie de internet ca sa-ti setezi semnatura prima data.');
  });
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) throw new Error('Sesiune expirata — reloghati-va.');
  const { error } = await supabase
    .from('profiles')
    .update({ signature_url: dataUrl, signature_set: true })
    .eq('id', session.user.id);
  if (error) throw new Error(error.message);
  const profile = await fetchOwnProfile(supabase, session.user.id);
  if (profile) await MetaRepo.set('lastProfile', profile);
  return profile;
}

/** Numele soferilor activi a caror zi de nastere e chiar azi (fus orar RO),
 * indiferent cine e logat — folosit pentru mesajul general "La multi ani"
 * aratat oricui deschide aplicatia in acea zi (vezi app.js). RPC SECURITY
 * DEFINER (la fel ca listDriversForLogin), pentru ca RLS pe profiles
 * limiteaza altfel fiecare cont sa vada doar randul propriu. Best-effort:
 * fara internet, intoarce pur si simplu lista goala (nu blocheaza pornirea
 * aplicatiei si nu arata eroare — nu e o functionalitate esentiala).
 */
export async function getTodayBirthdays() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('list_today_birthdays');
    if (error || !data) return [];
    return data.map((r) => r.full_name).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/** Urca in Supabase (PDF final + rand de metadate) un Proces Verbal abia
 * salvat de sofer — ca administratorul sa il vada in Istoric PV din panoul
 * de admin, separat de copia locala (IndexedDB) care ramane neschimbata si
 * ramane sursa principala pentru sofer. Fire-and-forget, best-effort: PV-ul
 * e deja salvat local INAINTE sa ajungem aici (vezi onSave() din
 * screens-pv-form.js), deci daca soferul nu are internet in acel moment,
 * sau ceva pica pe drum, nu pierde nimic — doar ca acel PV nu va aparea in
 * admin pana la urmatoarea generare cu semnal (nu reincercam automat mai
 * tarziu, ca sa nu complicam — in practica soferii au semnal aproape mereu
 * cand salveaza un PV). `meta.id` e acelasi uuid folosit si pentru randul
 * din PvRepo local (vezi uuid() din onSave()), ca cele doua copii sa poata
 * fi asociate daca e nevoie vreodata. */
export async function uploadPvRecordToCloud(meta, blob) {
  try {
    const supabase = await getSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    // Fara sesiune (foarte rar, ex. token expirat exact in acest moment) nu
    // putem respecta politica RLS de INSERT ("driver_id = auth.uid()") —
    // renuntam silentios, PV-ul ramane oricum salvat local.
    if (!session) return;
    const storagePath = `${session.user.id}/${meta.id}.pdf`;
    // FARA upsert: fiecare PV are un id (uuid) nou la fiecare salvare, deci
    // nu exista niciodata un conflict real de nume — iar upsert:true ar
    // genera un INSERT ... ON CONFLICT DO UPDATE, care cere Postgres sa
    // verifice si o politica RLS de UPDATE (nu doar INSERT) chiar daca
    // conflictul nu se produce niciodata efectiv. Cum am definit doar
    // politica de INSERT pentru folderul propriu al soferului, upsert:true
    // pica mereu cu "new row violates row-level security policy" — un simplu
    // INSERT (fara upsert) foloseste doar politica de INSERT si functioneaza.
    const { error: uploadErr } = await supabase.storage.from('pv-documents').upload(storagePath, blob, {
      contentType: 'application/pdf',
    });
    if (uploadErr) {
      // console.warn, nu o eroare aratata soferului -- PV-ul local ramane
      // neschimbat. Util insa de vazut in consola telefonului/desktopului
      // daca cineva investigheaza de ce un PV nu a ajuns in admin.
      console.warn('[pv-sync] incarcare PDF esuata:', uploadErr.message || uploadErr);
      return;
    }
    const { error: insertErr } = await supabase.from('pv_records').insert({
      id: meta.id,
      driver_id: session.user.id,
      driver_name: meta.driverName,
      depot_name: meta.depotName,
      client_name: meta.clientName,
      location: meta.location,
      county: meta.county,
      process_type: meta.processType,
      pv_number: meta.pvNumber,
      car_number: meta.carNumber,
      created_at: meta.createdAt,
      file_size: blob.size,
      storage_path: storagePath,
    });
    if (insertErr) {
      console.warn('[pv-sync] salvare rand pv_records esuata:', insertErr.message || insertErr);
    }
  } catch (e) {
    // best-effort — vezi comentariul de mai sus
    console.warn('[pv-sync] sincronizare PV esuata:', e?.message || e);
  }
}

/** Sincronizeaza profilul propriu (ca "sofer" local) si flota de masini /
 * catalogul de produse active in IndexedDB, ca ecranele existente (care
 * citesc DriverRepo/CarRepo/CatalogRepo local) sa functioneze neschimbate.
 * Best-effort: daca nu exista semnal, pastreaza ce era deja sincronizat. */
export async function syncMasterData(profile) {
  if (!profile) return;
  try {
    const ci = [profile.ci_serie, profile.ci_numar].filter(Boolean).join(' ');
    await DriverRepo.save({
      id: LOCAL_DRIVER_KEY,
      name: profile.full_name,
      ci,
      // Functia e acum gestionata de admin (panoul separat) si sincronizata
      // de aici — nu mai e un camp editabil local. Foloseste "profile.functie", nu "" ca inainte.
      functia: profile.functie || '',
      signatureDataUrl: profile.signature_url || '',
      nrContract: profile.nr_contract || '',
      dataAngajare: profile.data_angajare || '',
      // Depozitul la care e alocat soferul, setat din admin (tab Soferi) —
      // foloseste acelasi format de cheie locala ca DepotRepo ("synced-<id>"),
      // ca ecranul de acasa (screens-home.js) sa il poata gasi direct in
      // lista de depozite sincronizate, fara sa mai fie ales manual.
      depotId: profile.depot_id ? 'synced-' + profile.depot_id : '',
      sortOrder: 0,
    });
    // Soferii/masinile/depozitele nu mai sunt gestionate local (vezi
    // eliminarea sectiunilor din screens-setup.js) — un singur telefon
    // corespunde mereu unui singur cont logat, deci orice alt rand de sofer
    // ramas din perioada de INAINTE sa existe login-ul (id-uri numerice
    // vechi, generate local) e un rest orfan care doar ar duplica selectorul
    // de pe Acasa. Il stergem aici, la fiecare sincronizare.
    const existingDrivers = await DriverRepo.getAll();
    for (const d of existingDrivers) {
      if (d.id !== LOCAL_DRIVER_KEY) {
        await DriverRepo.remove(d.id);
      }
    }
  } catch (e) {
    // IndexedDB indisponibil — foarte improbabil, ignoram
  }

  let supabase;
  try {
    supabase = await getSupabase();
  } catch (e) {
    return; // offline: pastram tot ce era deja sincronizat anterior
  }

  try {
    // RPC (POST), nu GET — vezi comentariul din fetchOwnProfile().
    const { data: vehicles, error } = await supabase.rpc('list_active_vehicles');
    if (!error && vehicles) {
      const existing = await CarRepo.getAll();
      const syncedIds = new Set(vehicles.map((v) => 'synced-' + v.id));
      // sterge din local doar masinile sincronizate anterior care nu mai
      // sunt active/existente pe server; masinile adaugate manual local
      // (fara prefix "synced-") raman neatinse
      for (const car of existing) {
        if (String(car.id).startsWith('synced-') && !syncedIds.has(car.id)) {
          await CarRepo.remove(car.id);
        }
      }
      for (const v of vehicles) {
        await CarRepo.save({ id: 'synced-' + v.id, marca: v.brand, numar: v.plate_number, sortOrder: 0 });
      }
      // O masina adaugata manual, local, INAINTE sa existe flota din admin
      // (id numeric vechi) care are exact acelasi numar de inmatriculare ca
      // una proaspat sincronizata e acelasi vehicul, doar duplicat vizual in
      // selector — o stergem.
      const syncedPlates = new Set(vehicles.map((v) => dedupeKey(v.plate_number)));
      const stillLocal = await CarRepo.getAll();
      for (const car of stillLocal) {
        if (!String(car.id).startsWith('synced-') && syncedPlates.has(dedupeKey(car.numar))) {
          await CarRepo.remove(car.id);
        }
      }
    }
  } catch (e) {
    // offline: pastram flota cachuita anterior
  }

  try {
    // RPC (POST), nu GET — vezi comentariul din fetchOwnProfile().
    const { data: products, error } = await supabase.rpc('list_active_products');
    if (!error && products && products.length) {
      const byModel = new Map();
      for (const p of products) {
        if (!byModel.has(p.model)) byModel.set(p.model, []);
        if (p.type) byModel.get(p.model).push(p.type);
      }
      for (const [model, types] of byModel.entries()) {
        await CatalogRepo.save({ model, types, aux: DEFAULT_AUXILIARY_BY_CATEGORY[model] || [] });
      }
    }
  } catch (e) {
    // offline: pastram catalogul cachuit anterior (sau valorile implicite)
  }

  try {
    // Depozitele (principal + secundare/colaboratoare) sunt gestionate
    // centralizat din panoul de admin (tab "Depozite") si sincronizate aici
    // in DepotRepo local, la fel ca masinile mai sus — ca ecranul de acasa
    // (selectarea depozitului) si formularul de PV (adresa de retrimitere a
    // avizului semnat) sa vada mereu aceleasi date, pe orice telefon.
    // RPC (POST), nu GET — vezi comentariul din fetchOwnProfile().
    const { data: depots, error } = await supabase.rpc('list_active_depots');
    if (!error && depots) {
      const existing = await DepotRepo.getAll();
      const syncedIds = new Set(depots.map((d) => 'synced-' + d.id));
      // sterge din local doar depozitele sincronizate anterior care nu mai
      // sunt active/existente pe server; un depozit adaugat manual local
      // (fara prefix "synced-") ramane neatins
      for (const dep of existing) {
        if (String(dep.id).startsWith('synced-') && !syncedIds.has(dep.id)) {
          await DepotRepo.remove(dep.id);
        }
      }
      for (const d of depots) {
        await DepotRepo.save({
          id: 'synced-' + d.id,
          depotType: d.type,
          name: d.name,
          countyCode: d.county_code || '',
          address: d.address || '',
          representativeName: d.representative_name || '',
          representativeFunction: d.representative_function || '',
          representativePhone: d.representative_phone || '',
          representativeEmail: d.representative_email || '',
          representativeAccessCode: d.representative_access_code || '',
          sortOrder: d.sort_order || 0,
          // Optional: cand e completat, acest depozit e o exceptie legata de
          // un contract/client anume (ex: "NOVALIS"), nu de un judet — vezi
          // resolveAvizReturnEmail() din js/screens-pv-form.js.
          contractKeyword: d.contract_keyword || '',
        });
      }
      // Un depozit adaugat manual, local, INAINTE sa existe centralizarea
      // (id numeric vechi) cu exact aceeasi denumire ca unul proaspat
      // sincronizat (ex: HUNEDOARA existent deja pe telefon + HUNEDOARA
      // migrat acum in admin) e acelasi depozit, doar duplicat vizual in
      // selector — il stergem.
      const syncedNames = new Set(depots.map((d) => dedupeKey(d.name)));
      const stillLocal = await DepotRepo.getAll();
      for (const dep of stillLocal) {
        if (!String(dep.id).startsWith('synced-') && syncedNames.has(dedupeKey(dep.name))) {
          await DepotRepo.remove(dep.id);
        }
      }
    }
  } catch (e) {
    // offline: pastram depozitele cachuite anterior
  }

  try {
    // Datele firmei (Sediu) — gestionate din admin (tab Depozite > Sediu),
    // ca sa nu mai fie nevoie de o versiune noua de cod pentru o simpla
    // schimbare de email/telefon/adresa. COMPANY_INFO e importat din
    // catalog-defaults.js ca obiect (nu valori primitive), asa ca il
    // MODIFICAM in loc (Object.assign) — toate modulele care l-au importat
    // deja (pdf-print.js, screens-home.js, screens-pv-form.js) tin o
    // referinta la acelasi obiect, deci vad automat noile valori, fara sa
    // mai fie nevoie sa treaca datele explicit prin fiecare functie.
    const { data, error } = await supabase.rpc('get_company_info');
    if (!error && data && data.length) {
      const c = data[0];
      Object.assign(COMPANY_INFO, {
        name: c.name || COMPANY_INFO.name,
        address: c.address || COMPANY_INFO.address,
        regCom: c.reg_com || COMPANY_INFO.regCom,
        cui: c.cui || COMPANY_INFO.cui,
        phone: c.phone || COMPANY_INFO.phone,
        email: c.email || COMPANY_INFO.email,
        website: c.website || COMPANY_INFO.website,
      });
      // cachuim si local, ca o pornire OFFLINE viitoare sa foloseasca ultima
      // varianta cunoscuta (sincronizata), nu valorile implicite din cod.
      await MetaRepo.set('companyInfo', { ...COMPANY_INFO });
    } else {
      const cached = await MetaRepo.get('companyInfo');
      if (cached?.value) Object.assign(COMPANY_INFO, cached.value);
    }
  } catch (e) {
    // offline: aplicam ultima copie cachuita local, daca exista
    try {
      const cached = await MetaRepo.get('companyInfo');
      if (cached?.value) Object.assign(COMPANY_INFO, cached.value);
    } catch (e2) {
      // fara cache local nici acesta -> ramanem pe valorile implicite din cod
    }
  }
}
