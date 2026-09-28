// app.js — bootstrap-ul aplicatiei: verifica daca exista date de baza
// (sofer/auto/depozit — sincronizate automat din admin la login), arata un
// ecran de asteptare cu reincercare daca adminul nu a configurat inca totul,
// apoi deschide ecranul principal. Inregistreaza si service worker-ul
// pentru functionare offline / instalare ca PWA.

import { el } from './utils.js';
import { DriverRepo, CarRepo, DepotRepo } from './db.js';
import { pushScreen } from './router.js';
import { primaryButton, sectionCard, openModal } from './components.js';
import { openMainSelector } from './screens-home.js';
import { runLoginGate } from './screens-login.js';
import { getCurrentProfile, syncMasterData, getTodayBirthdays } from './auth.js';

// Mesaj general de zi de nastere: NU e legat de soferul logat momentan —
// arata numele oricarui sofer activ a carui zi e chiar azi (data nasterii se
// seteaza doar din panoul de admin), vazut de ORICINE deschide aplicatia in
// acea zi. Fire-and-forget: nu blocheaza pornirea aplicatiei, iar fara
// internet getTodayBirthdays() intoarce pur si simplu o lista goala.
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

// Incercam sa blocam orientarea pe portret cat mai devreme posibil, in
// completarea "orientation" din manifest.json (care se aplica abia dupa ce
// Chrome regenereaza in fundal WebAPK-ul deja instalat pe telefon — poate
// dura si sa nu se intample instant dupa un update). Blocarea prin JS are
// efect imediat pe telefoanele unde e suportata. Ecranul de semnatura
// (captureSignatureScreen din components.js) NU depinde totusi de reusita
// acestui apel — chenarul ramane ingust/vertical prin CSS (vmin/vmax)
// indiferent de orientare, iar la salvare rotim intotdeauna neconditionat —
// asta e doar un bonus care evita reflow-ul intregii pagini cand soferul
// intoarce telefonul. Esueaza silentios acolo unde API-ul lipseste sau
// contextul nu permite blocarea (ex: nu ruleaza ca PWA instalata).
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('portrait').catch(() => {});
}

/** Ecran de blocare aratat doar cand adminul nu a configurat inca (sau nu
 * s-a sincronizat inca, ex: fara semnal la primul login) cel putin un sofer/
 * o masina/un depozit activ — nu mai exista un wizard local in care soferul
 * sa le adauge singur, fiindca datele astea vin acum exclusiv din panoul de
 * admin. "Reincearca" cere din nou sincronizarea, pentru cazul in care
 * adminul a rezolvat deja intre timp. */
function showMissingDataScreen(missingLabels) {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    const card = sectionCard('Configurare incompleta', [
      el('div', { style: 'color:var(--ink-soft);font-size:14px;margin-bottom:16px;line-height:1.5' }, [
        `Administratorul nu a configurat inca (sau nu s-a sincronizat inca pe acest telefon): ${missingLabels.join(', ')}. Contacteaza administratorul, apoi apasa "Reincearca".`,
      ]),
    ]);
    const retryBtn = primaryButton('Reincearca', async () => {
      const profile = await getCurrentProfile();
      if (profile) await syncMasterData(profile);
      pop();
    });
    const scroll = el('div', { class: 'screen-scroll' }, [card]);
    screen.appendChild(scroll);
    screen.appendChild(el('div', { class: 'bottom-actions' }, [retryBtn]));
    return screen;
  });
}

async function boot() {
  // Poarta de login: blocheaza pana la autentificare + (la prima utilizare)
  // setarea semnaturii. Sincronizeaza si profilul/masinile/produsele din
  // panoul de admin in baza de date locala, ca restul aplicatiei sa
  // functioneze neschimbat, inclusiv offline.
  await runLoginGate();

  // Nu asteptam acest apel — vezi comentariul de la checkBirthdays().
  checkBirthdays();

  let [drivers, cars, depots] = await Promise.all([DriverRepo.getAll(), CarRepo.getAll(), DepotRepo.getAll()]);
  while (!drivers.length || !cars.length || !depots.length) {
    const missing = [];
    if (!drivers.length) missing.push('soferul');
    if (!cars.length) missing.push('cel putin o masina activa');
    if (!depots.length) missing.push('cel putin un depozit');
    await showMissingDataScreen(missing);
    [drivers, cars, depots] = await Promise.all([DriverRepo.getAll(), CarRepo.getAll(), DepotRepo.getAll()]);
  }
  await openMainSelector();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        // Cerem activ o verificare de versiune noua la fiecare pornire —
        // un WebAPK Android instalat nu pare sa re-verifice sw.js la fel
        // de des ca un tab obisnuit de Chrome, asa ca soferul putea ramane
        // blocat pe o versiune veche mult timp fara asta.
        reg.update().catch(() => {});
      })
      .catch(() => {});
    // Cand un service worker nou preia controlul (dupa skipWaiting() +
    // clients.claim() din sw.js), pagina curenta ruleaza in continuare cu
    // codul vechi deja incarcat in memorie. Reincarcam o singura data ca sa
    // preluam automat tot codul nou, fara sa mai fie nevoie ca soferul sa
    // apese manual pe "Forteaza actualizarea" (utils.js) de fiecare data.
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      location.reload();
    });
  });
}

boot();
