// screens-login.js — poarta de autentificare a aplicatiei: soferul isi
// selecteaza numele dintr-o lista (contul e creat de administrator din
// panoul separat de admin), fara parola, urmat la prima utilizare de
// setarea obligatorie a semnaturii proprii. Dupa asta, restul aplicatiei
// functioneaza neschimbat (si offline) — sesiunea ramane pe telefon, deci
// acest ecran nu mai reapare decat dupa o deconectare explicita.

import { el, blobToDataUrl, APP_VERSION, forceUpdateApp } from './utils.js';
import { replaceRoot } from './router.js';
import { primaryButton, showToast, captureSignature } from './components.js';
import { getCurrentProfile, listDriversForLogin, signInAsDriver, signOut, saveOwnSignature, syncMasterData } from './auth.js';

/** Blocheaza pornirea aplicatiei pana cand exista un profil autentificat,
 * activ si cu semnatura setata. Intoarce acel profil. */
export async function runLoginGate() {
  let profile = await getCurrentProfile();

  if (!profile || !profile.active) {
    profile = await runLoginScreen();
  }

  if (!profile.signature_set) {
    profile = await runSignatureSetup(profile);
  }

  await syncMasterData(profile);
  return profile;
}

function runLoginScreen() {
  return new Promise((resolve) => {
    let cancelled = false;

    function render() {
      replaceRoot(() => {
        const screen = el('div', { class: 'screen' });
        const logo = el('img', { class: 'brand-logo', src: 'assets/logo/euro_ecologic_logo.png', alt: 'Euro Ecologic' });
        const versionTag = el('div', { class: 'app-version-tag' }, [`Versiune aplicatie: ${APP_VERSION}`]);
        const updateBtn = el(
          'button',
          {
            class: 'btn btn-text',
            style: 'display:block;margin:0 auto 4px;font-size:12px;padding:2px 8px;min-height:0',
            onclick: async () => {
              updateBtn.disabled = true;
              updateBtn.textContent = 'Se actualizeaza...';
              await forceUpdateApp();
            },
          },
          ['⟳ Forteaza actualizarea']
        );

        const statusBox = el('div', { style: 'text-align:center;color:var(--ink-soft);font-size:13.5px;margin:4px 0 2px' }, ['Se incarca lista de soferi...']);
        const listBox = el('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-top:4px' }, []);
        const errorBox = el('div', { style: 'color:var(--danger);font-size:13px;text-align:center;min-height:18px;margin-top:6px' }, []);

        const card = el('div', { class: 'section-card' }, [
          el('h3', { class: 'section-title', style: 'text-align:center' }, ['Cine esti?']),
          el('div', { style: 'text-align:center;color:var(--ink-soft);font-size:13px;margin-bottom:14px' }, [
            'Alege-ti numele din lista — contul e creat de administrator.',
          ]),
          statusBox,
          listBox,
          errorBox,
        ]);

        const scroll = el('div', { class: 'screen-scroll', style: 'display:flex;flex-direction:column;justify-content:center;min-height:100%' }, [logo, versionTag, updateBtn, card]);
        screen.appendChild(scroll);

        (async () => {
          const result = await listDriversForLogin();
          if (cancelled) return;
          statusBox.remove();
          if (result.error) {
            errorBox.textContent = result.error;
            listBox.appendChild(primaryButton('Incearca din nou', () => render()));
            return;
          }
          if (!result.drivers.length) {
            errorBox.textContent = 'Niciun sofer disponibil momentan. Contacteaza administratorul.';
            listBox.appendChild(primaryButton('Reincarca', () => render()));
            return;
          }
          for (const driver of result.drivers) {
            const btn = primaryButton(driver.full_name, async () => {
              const allButtons = Array.from(listBox.children);
              allButtons.forEach((b) => (b.disabled = true));
              errorBox.textContent = '';
              btn.textContent = 'Se conecteaza...';
              const signInResult = await signInAsDriver(driver.id);
              if (cancelled) return;
              if (signInResult.error) {
                errorBox.textContent = signInResult.error;
                allButtons.forEach((b) => (b.disabled = false));
                btn.textContent = driver.full_name;
                return;
              }
              resolve(signInResult.profile);
            });
            listBox.appendChild(btn);
          }
        })();

        return screen;
      });
    }

    render();
  });
}

function runSignatureSetup(profile) {
  return new Promise((resolve) => {
    replaceRoot(() => {
      const screen = el('div', { class: 'screen' });
      const card = el('div', { class: 'section-card' }, [
        el('h3', { class: 'section-title' }, [`Bine ai venit, ${profile.full_name || profile.username}!`]),
        el('div', { style: 'color:var(--ink-soft);font-size:13.5px;margin-bottom:16px' }, [
          'Inainte sa incepi, seteaza-ti semnatura — va aparea automat pe fiecare Proces Verbal pe care il generezi de acum inainte.',
        ]),
      ]);
      const sigBtn = primaryButton('✍️ Seteaza semnatura', async () => {
        const blob = await captureSignature({ title: 'Semnatura ta' });
        if (!blob) return;
        sigBtn.disabled = true;
        sigBtn.textContent = 'Se salveaza...';
        try {
          const dataUrl = await blobToDataUrl(blob);
          const updated = await saveOwnSignature(dataUrl);
          showToast('Semnatura salvata.');
          resolve(updated || { ...profile, signature_url: dataUrl, signature_set: true });
        } catch (e) {
          showToast('Nu am putut salva semnatura: ' + e.message, { danger: true });
          sigBtn.disabled = false;
          sigBtn.textContent = '✍️ Seteaza semnatura';
        }
      });

      const logoutLink = el(
        'button',
        {
          class: 'btn btn-text',
          style: 'display:block;margin:14px auto 0',
          onclick: async () => {
            await signOut();
            location.reload();
          },
        },
        ['Deconectare']
      );

      const scroll = el('div', { class: 'screen-scroll' }, [card, sigBtn, logoutLink]);
      screen.appendChild(scroll);
      return screen;
    });
  });
}
