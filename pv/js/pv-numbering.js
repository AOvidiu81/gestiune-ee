// pv-numbering.js — generare numere secventiale PV / Aviz, port din
// pv_numbering.dart. Contoarele traiesc in store-ul "counters" din IndexedDB.

import { CounterRepo } from './db.js';

export function prefixForType(processType) {
  switch ((processType || '').trim().toUpperCase()) {
    case 'AMPLASARE':
      return 'PVA';
    case 'RIDICARE':
      return 'PVR';
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

export async function nextPvNumber(processType) {
  const counter = await CounterRepo.next('pv_counter_value');
  const prefix = prefixForType(processType);
  return `${prefix}_${counter}`;   // v92 (cerut de Ovidiu, 26.10): fara zerourile din fata (PVS_1, nu PVS_00001)
}

export async function nextAvizNumber() {
  const currentYear = new Date().getFullYear();
  const counter = await CounterRepo.next('aviz_counter_value', {
    resetIf: (record) => record.year !== currentYear,
  });
  return `AVZ-EE_${currentYear}_${String(counter).padStart(3, '0')}`;
}

export function displayPvNumber(value) {
  const match = /^(PV[A-Z]*)_(\d+)$/.exec(value || '');
  if (!match) return value || '';
  return `${match[1]} - ${parseInt(match[2], 10)}`;   // v92: si PV-urile vechi (00001) se arata fara zerouri
}

export function displayAvizNumber(value) {
  const match = /^AVZ-EE_(\d{4})_(\d{3})$/.exec(value || '');
  if (!match) return value || '';
  return `AVZ - EE _ ${match[1]} _ ${match[2]}`;
}
