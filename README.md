# GestiuneEE – Euro Ecologic (v1.0)

Aplicație web de gestiune (stoc, mișcări echipamente, clienți/contracte/anexe, nomenclatoare),
construită după modelul fișierului Excel lunar (pagini MUTARI-VERIFICARI, FACTURARE, DATE).

Aplicația live: https://AOvidiu81.github.io/gestiune-ee/

## Fișiere

| Fișier | Rol |
|---|---|
| `index.html` | aplicația (un singur fișier, HTML + JS) |
| `manifest.json` | permite „Adaugă pe ecranul de start” (PWA) |

## Backend

- Supabase, proiect **EuroEcologic-Gestiune** (regiunea Frankfurt)
- Tabele: `nomenclatoare`, `depozite`, `soferi`, `masini`, `clienti`, `contracte`, `anexe`, `miscari`, `stoc_initial`
- View `v_stoc` = replica formulelor din capul paginii MUTARI-VERIFICARI (ÎNCHIRIATE / DEPOZIT / TOTAL)

### Cum se calculează stocul
`stoc_initial` (valorile START) + mișcările înregistrate **de la data de referință încolo**.
Fiecare tip de mișcare are un *efect stoc* (editabil în Nomenclatoare → tip_miscare):

| efect | ce face |
|---|---|
| `inchiriere` | AMPLASARE (+buc) crește ÎNCHIRIATE și scade DEPOZIT; RIDICARE (−buc) invers |
| `depozit_in` | TransferIN: crește DEPOZIT |
| `depozit_out` | TransferOUT, VANZARE: scade DEPOZIT |
| `niciun` | SERVISARE, FACTURAT etc.: nu modifică stocul |

## Roadmap

- **v2** – Rute (pagina Ruta_HD): puncte de servisare pe zi/mașină/frecvență, grila săptămânală W1–W53
- **v3** – Rapoarte: RAPORT-LUNA, FACTURARE lunară, REG DOCUMENTE – export Excel/PDF
- **v4** – unificare cu aplicațiile Ruta / PV-uri / Admin
