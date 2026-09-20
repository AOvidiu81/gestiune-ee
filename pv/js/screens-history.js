// screens-history.js — istoricul proceselor verbale salvate, cu redeschidere
// (regenerare document + print/salvare PDF) si stergere. Port simplificat
// din process_verbal_history_screen.dart.

import { el } from './utils.js';
import { pushScreen } from './router.js';
import { PvRepo } from './db.js';
import { confirmDialog, showToast } from './components.js';
import { displayPvNumber, displayAvizNumber } from './pv-numbering.js';
import { buildDocumentHtml, openPrintPreview } from './pdf-print.js';

const BADGE_COLORS = {
  AMPLASARE: { bg: '#EAF7EC', fg: '#2E8B3C' },
  RIDICARE: { bg: '#FFE9EE', fg: '#D93A5E' },
  SERVISARE: { bg: '#F0E9FF', fg: '#6F42C1' },
  'LIPSA ACCES': { bg: '#FFF1E2', fg: '#E57A00' },
  VANZARE: { bg: '#EAF2FF', fg: '#1E63D6' },
};

export async function openHistoryScreen() {
  return pushScreen(({ pop }) => {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn', onclick: () => pop(undefined) }, ['←']),
      el('div', { class: 'topbar-title' }, ['Istoric documente']),
      el('div', { class: 'topbar-spacer' }),
    ]));

    const listHost = el('div', {});
    const scroll = el('div', { class: 'screen-scroll' }, [listHost]);
    screen.appendChild(scroll);

    async function refresh() {
      const records = await PvRepo.getAll();
      listHost.innerHTML = '';
      if (!records.length) {
        listHost.appendChild(el('div', { class: 'empty-state' }, ['Niciun proces verbal salvat inca.']));
        return;
      }
      records.forEach((record) => listHost.appendChild(renderCard(record, refresh)));
    }
    refresh();

    return screen;
  });
}

function renderCard(record, onChanged) {
  const colors = BADGE_COLORS[record.processType] || { bg: '#eee', fg: '#333' };
  const date = record.createdAt ? new Date(record.createdAt) : new Date();
  const dateLabel = date.toLocaleDateString('ro-RO') + ' ' + date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

  const card = el('div', { class: 'history-card' }, [
    el('div', { class: 'history-card-top' }, [el('div', { class: 'history-pv-number' }, [displayPvNumber(record.pvNumber)]), el('div', { class: 'history-date' }, [dateLabel])]),
    el('div', { class: 'history-client' }, [record.clientName || '(fara nume client)']),
    el('div', { class: 'history-meta' }, [record.field1 || '']),
    el('div', { class: 'history-meta' }, [`Depozit: ${record.depotName || '-'} · Sofer: ${record.userName || '-'} · Auto: ${record.carNumar || '-'}`]),
    el('div', { class: 'history-badge', style: `background:${colors.bg};color:${colors.fg}` }, [record.processType]),
    el('div', { class: 'history-actions' }, [
      el('button', { class: 'btn btn-outline', onclick: () => openDocument(record) }, ['📄 Deschide']),
      el(
        'button',
        {
          class: 'btn btn-outline btn-outline-error',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'Sterge proces verbal?', message: `${displayPvNumber(record.pvNumber)} — ${record.clientName || ''}`, danger: true, okLabel: 'Sterge' });
            if (!ok) return;
            await PvRepo.remove(record.id);
            showToast('Sters din istoric.');
            onChanged();
          },
        },
        ['🗑 Sterge']
      ),
    ]),
  ]);
  return card;
}

async function openDocument(record) {
  const html = buildDocumentHtml({
    model: record,
    isPreview: false,
    photoUrls: record.confirmationPhotoUrls || [],
    beneficiarySignatureUrl: record.beneficiarySignatureUrl || '',
    driverSignatureUrl: record.driverSignatureUrl || '',
    stampAvailable: true,
  });
  await openPrintPreview({ html, title: displayPvNumber(record.pvNumber) });
}
