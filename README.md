# GestiuneEE – Euro Ecologic (v1.0)

Aplicație web de gestiune (stoc, mișcări echipamente, clienți/contracte/anexe, nomenclatoare),
construită după modelul fișierului Excel `09. SEPTEMBRIE - 2026-TEST.xlsm`.

## Fișiere

| Fișier | Rol |
|---|---|
| `index.html` | aplicația (un singur fișier, HTML + JS) |
| `manifest.json` | permite „Adaugă pe ecranul de start” (PWA) |
| `versions/index_v1.0.html` | copia versiunii 1.0 (baseline stabil) |
| `import/` | datele extrase din Excel + scriptul SQL de import (doar pentru istoric) |

## Backend

- Supabase, proiect **EuroEcologic-Gestiune** (`xrveoxmsdvryzyemmkqx`, regiunea Frankfurt)
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

## Publicare pe GitHub Pages (pași)

1. Intră pe https://github.com/new → **Repository name:** `gestiune-ee` → Public → **Create repository**.
2. Pe pagina repo-ului nou apasă **uploading an existing file**, trage în fereastră fișierele
   `index.html`, `manifest.json`, `README.md` și folderul `versions` → **Commit changes**.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. După ~1 minut aplicația e la: `https://AOvidiu81.github.io/gestiune-ee/`

Pentru actualizări ulterioare: pe GitHub → deschide `index.html` → butonul ✏️ sau **Add file → Upload files**
(înlocuiește fișierul cu cel nou din folderul local) → Commit.

## Roadmap

- **v2** – Rute (pagina Ruta_HD): puncte de servisare pe zi/mașină/frecvență, grila săptămânală W1–W53
  cu coduri `HHMM-minute staționare` și literele A/L/O/R/S (amplasare, lipsă acces, ..., ridicare, suspendat)
- **v3** – Rapoarte: RAPORT-LUNA (bucăți pe fiecare zi a lunii, per client/locație), FACTURARE lunară
  (zile × preț × cant, fără/cu TVA), REG DOCUMENTE – export Excel/PDF
- **v4** – unificare cu aplicațiile Ruta / PV-uri / Admin (date comune: șoferi, mașini, clienți, produse)
