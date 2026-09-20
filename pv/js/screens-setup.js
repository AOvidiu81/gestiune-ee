// screens-setup.js — ecranul de Setari, accesibil din selectorul principal.
// Soferii, masinile si depozitele erau inainte gestionate local, manual, pe
// fiecare telefon (wizard de prima configurare + liste editabile aici) —
// acum vin toate sincronizate automat din panoul de administrare (vezi
// syncMasterData in js/auth.js), asa ca acest ecran a ramas doar cu contul
// (Deconectare). Editarea manuala locala a fost eliminata intentionat: nu se
// sincroniza niciodata inapoi in admin, ramanea un fund de sac, si putea
// produce duplicate in selectoare (un rand local + acelasi rand sincronizat
// din admin) — vezi discutia care a dus la aceasta schimbare.

import { el } from './utils.js';
import { pushScreen } from './router.js';
import { outlineButton, sectionCard, confirmDialog } from './components.js';
import { getCurrentProfile, signOut } from './auth.js';

function topBar(title, onBack) {
  return el('div', { class: 'topbar' }, [
    onBack ? el('button', { class: 'icon-btn', onclick: onBack }, ['←']) : el('div', { class: 'topbar-spacer' }),
    el('div', { class: 'topbar-title' }, [title]),
    el('div', { class: 'topbar-spacer' }),
  ]);
}

/** Ecranul de Setari, accesibil din selectorul principal. */
export async function openSettingsScreen() {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(topBar('Setari', () => pop(undefined)));

    const accountHost = el('div', {});
    (async () => {
      const profile = await getCurrentProfile();
      if (!profile) return; // aplicatie fara login configurat (versiune veche/offline la prima rulare)
      accountHost.appendChild(
        sectionCard('Cont', [
          el('div', { style: 'margin-bottom:10px;color:var(--ink-soft);font-size:13.5px' }, [
            `Autentificat ca `, el('strong', {}, [profile.full_name || profile.username]),
          ]),
          el('div', { style: 'margin-bottom:14px;color:var(--ink-soft);font-size:12.5px' }, [
            'Soferii, masinile si depozitele sunt gestionate din panoul de administrare si se sincronizeaza automat pe acest telefon — nu mai pot fi adaugate/editate de aici.',
          ]),
          outlineButton('Deconectare', async () => {
            if (!(await confirmDialog({ title: 'Deconectare', message: 'Iesi din cont pe acest telefon?', okLabel: 'Deconecteaza-ma' }))) return;
            await signOut();
            location.reload();
          }),
        ])
      );
    })();

    const scroll = el('div', { class: 'screen-scroll' }, [accountHost]);
    screen.appendChild(scroll);
    return screen;
  });
}
