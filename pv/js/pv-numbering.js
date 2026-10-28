// pv-numbering.js — generare numere secventiale PV / Aviz, port din
// pv_numbering.dart. Contoarele traiesc in store-ul "counters" din IndexedDB.

import { CounterRepo } from './db.js';

// v93 (cerut de Ovidiu, 28.10): la evenimente PVA-EV / PVR-EV (SUPLIMENTARE intra la PVA, REDUCERE la PVR)
export function prefixForType(processType, ev = false) {
  switch ((processType || '').trim().toUpperCase()) {
    case 'AMPLASARE':
      return ev ? 'PVA-EV' : 'PVA';
    case 'RIDICARE':
      return ev ? 'PVR-EV' : 'PVR';
    case 'SERVISARE':
      return 'PVS';
    case 'VANZARE':
      return 'PVV';
    case 'LIPSA ACCES':
      return 'PVLA';
    default:
      return 'PV';
  }
}

// v93 (cerut de Ovidiu, 28.10): numarul PV e unic si crescator PE DEPOZIT (indiferent de sofer si de tip),
// luat din baza (pv_numar_urmator). Fara semnal: unul din numerele rezervate dinainte pe telefon.
// Daca nu exista nici rezervare (rar): numar local „L<n>” (nu se amesteca cu cele din baza).
export async function nextPvNumber(processType, { depot = '', ev = false } = {}) {
  const prefix = prefixForType(processType, ev);
  let n = null;
  try { const { iaPvNumar } = await import('./auth.js'); n = await iaPvNumar(depot); } catch (e) { n = null; }
  if (n == null) return `${prefix}_L${await CounterRepo.next('pv_counter_value')}`;
  return `${prefix}_${n}`;
}

export async function nextAvizNumber() {
  const currentYear = new Date().getFullYear();
  const counter = await CounterRepo.next('aviz_counter_value', {
    resetIf: (record) => record.year !== currentYear,
  });
  return `AVZ-EE_${currentYear}_${String(counter).padStart(3, '0')}`;
}

export function displayPvNumber(value) {
  const match = /^(PV[A-Z]*(?:-EV)?)_(L?)(\d+)$/.exec(value || '');
  if (!match) return value || '';
  return `${match[1]} - ${match[2]}${parseInt(match[3], 10)}`;   // v92: fara zerouri; v93: PVA-EV / PVR-EV, L = numar local
}

export function displayAvizNumber(value) {
  const match = /^AVZ-EE_(\d{4})_(\d{3})$/.exec(value || '');
  if (!match) return value || '';
  return `AVZ - EE _ ${match[1]} _ ${match[2]}`;
}
