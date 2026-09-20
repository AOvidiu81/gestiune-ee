// catalog-defaults.js — valorile default ale catalogului de produse si ale
// depozitului implicit, portate 1:1 din product_catalog_defaults.dart si
// depot_model.dart, ca instalarile noi sa porneasca cu aceleasi optiuni ca
// aplicatia veche.

export const CANONICAL_TOILET_MODEL = 'TOALETA';
export const CONTAINER_MODEL = 'CONTAINER';
export const FENCE_MODEL = 'GARD';
export const EXTERIOR_SINK_MODEL = 'LAVOAR EXTERIOR';

export const PRIMARY_CATALOG_ORDER = [CONTAINER_MODEL, FENCE_MODEL, EXTERIOR_SINK_MODEL, CANONICAL_TOILET_MODEL];

export const DEFAULT_PRODUCT_CATALOG = {
  [CANONICAL_TOILET_MODEL]: ['SIMPLA', 'CU LAVOAR INTERIOR', 'PROPRIE', 'CLASIC SIMPLA', 'CLASIC'],
  [EXTERIOR_SINK_MODEL]: ['MARE 80-L', 'MIC 40-L'],
  [CONTAINER_MODEL]: ['BIROU', 'DEPOZITARE', 'SANITAR'],
  [FENCE_MODEL]: ['CORDON F6 [ 1.2X2M ]', 'GARD F2 [ 3.5X2M ]'],
};

export const DEFAULT_AUXILIARY_BY_CATEGORY = {
  [CANONICAL_TOILET_MODEL]: ['DOZATOR SAPUN', 'DISP. PROSOP HARTIE'],
  [EXTERIOR_SINK_MODEL]: ['DISP. PROSOP HARTIE', 'DOZATOR SAPUN'],
  [FENCE_MODEL]: ['CLEMA PRINDERE', 'TALPA SUSTINERE'],
  [CONTAINER_MODEL]: ['AER CONDITIONAT', 'RADIATOR INCALZIRE', 'S-14 WC', 'S-6 WC'],
};

export const DEFAULT_DEPOT = {
  name: 'HUNEDOARA',
  address: 'Pestisul Mare, Jud. HD',
  representativeName: 'ANITOIU OVIDIU',
  representativeFunction: 'Sales Manager',
  representativePhone: '0735 214 762',
  representativeEmail: 'hunedoara@eurowc.ro',
  // Parola de acces pentru "Cerere de Demisie" (vezi js/screens-cereri.js) —
  // goala implicit; se configureaza din Setari > Depozit.
  representativeAccessCode: '',
  sortOrder: 0,
};

export const COMPANY_INFO = {
  name: 'SC EURO ECOLOGIC SRL',
  address: 'Str. M. Eminescu nr. 9, Vlahita, jud. Harghita',
  regCom: 'J 2007000205190',
  cui: 'RO 21311085',
  phone: '0742 029 410',
  email: 'info@eurowc.ro',
  website: 'www.eurowc.ro',
};

export const PROCESS_TYPES = [
  {
    type: 'AMPLASARE',
    title: 'P.V. de AMPLASARE',
    subtitle: 'Instalare echipament la client',
    accent: '#2E8B3C',
    icon: 'pin',
  },
  {
    type: 'RIDICARE',
    title: 'P.V. de RIDICARE',
    subtitle: 'Demontare echipament',
    accent: '#D93A5E',
    icon: 'truck',
  },
  {
    type: 'SERVISARE',
    title: 'P.V. de SERVISARE',
    subtitle: 'Interventie tehnica',
    accent: '#6F42C1',
    icon: 'wrench',
  },
  {
    type: 'LIPSA ACCES',
    title: 'P.V. de LIPSA ACCES',
    subtitle: 'Acces restrictionat',
    accent: '#E57A00',
    icon: 'block',
  },
  {
    type: 'VANZARE',
    title: 'P.V. de VANZARE',
    subtitle: 'Livrare / vanzare echipament',
    accent: '#1E63D6',
    icon: 'invoice',
  },
];

export const CONDITIONS_BY_TYPE = {
  AMPLASARE: [
    'Conditii minime de acceptare pentru amplasare:',
    'Beneficiarul este responsabil pentru asigurarea conditiilor de acces auto de 3.5T, fara obstacole, conform specificatiilor tehnice.',
    'Nerespectarea conditiilor poate duce la costuri suplimentare sau reprogramari.',
    'Inainte de amplasare, produsul este igienizat complet (golire, spalare, odorizare, hartie).',
    'Beneficiarul trebuie sa asigure teren stabil si accesibil, spatiu suficient pentru manevrare.',
    'Paza si integritatea produselor dupa amplasare revin beneficiarului.',
    'Orice relocare ulterioara se taxeaza separat.',
  ],
  RIDICARE: [
    'Conditii minime de acceptare pentru ridicare:',
    'Beneficiarul este responsabil pentru asigurarea conditiilor de acces auto de 3.5T, fara obstacole, conform specificatiilor tehnice.',
    'Nerespectarea conditiilor poate duce la costuri suplimentare sau reprogramari.',
    'Inainte de ridicare, produsul se igienizeaza complet (golire, spalare, odorizare, hartie).',
    'Beneficiarul trebuie sa asigure teren stabil si accesibil, spatiu suficient pentru manevrare.',
    'Beneficiarul are obligatia de a asigura paza si integritatea produselor pana la predarea lor catre prestator.',
    'Ridicarea nereusita din cauza lipsei accesului poate genera costuri suplimentare.',
  ],
  SERVISARE: [
    'Conditii minime pentru servisare / intretinere:',
    'Asigurare acces auto obligatoriu pentru auto de 3.5T in perimetrul santier/locatie.',
    'Servisarea / intretinerea se efectueaza conform procedurilor prestatorului.',
    'Igienizare toalete ecologice: golire, spalare, odorizare, hartie igienica.',
    'Distanta maxima pentru serviciul de igienizare toalete: 5m fara obstacole.',
  ],
  'LIPSA ACCES': [
    'Constatare lipsa acces:',
    'Accesul in locatie nu a fost asigurat la momentul interventiei.',
    'Echipajul a constatat imposibilitatea efectuarii operatiunii (drum blocat, distanta peste 5m, obstacole, tonaj interzis, spatiu insuficient).',
    'Situatia a fost comunicata beneficiarului in timp real.',
    'Reprogramarea se poate face numai dupa confirmarea accesului si remedierea conditiilor.',
    'Deplasarea nereusita poate genera costuri suplimentare.',
  ],
  VANZARE: [
    'Conditii minime de acceptare pentru livrare:',
    'Beneficiarul este responsabil pentru asigurarea conditiilor de acces auto de 3.5T, fara obstacole, conform specificatiilor tehnice.',
    'Distanta maxima 5m fara obstacole.',
    'Nerespectarea conditiilor poate duce la costuri suplimentare sau reprogramari.',
  ],
};

export function confirmationBanner(processType) {
  const t = (processType || '').trim().toUpperCase();
  if (t === 'LIPSA ACCES') return 'INTERVENTIA NU A PUTUT FI EFECTUATA: LIPSA ACCES LA LOCATIE';
  if (t === 'AMPLASARE' || t === 'VANZARE') return 'LA AMPLASARE, PRODUSELE AU FOST VERIFICATE SI SUNT CONFORME';
  if (t === 'RIDICARE') return 'LA RIDICARE, PRODUSELE AU FOST VERIFICATE SI SUNT CONFORME';
  if (t === 'SERVISARE') return 'SERVISAREA/INTRETINEREA A FOST EFECTUATA CONFORM PROCEDURILOR PRESTATORULUI';
  return `PRODUSELE AU FOST LIVRATE SI VERIFICATE PE LOCATIE, LA ${t} PRODUSELE LIVRATE SUNT CONFORME`;
}
