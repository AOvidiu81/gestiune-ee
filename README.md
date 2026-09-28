# PV Euro Ecologic — WebApp (PWA)

Recreare a fluxului principal de Procese Verbale din aplicația Flutter
(`pv_euro_ecologic_v2`) ca aplicație web instalabilă (PWA), în HTML/CSS/JS
simplu, fără framework și fără dependențe externe — funcționează 100% offline
după prima încărcare.

## Ce este inclus (faza 1 — MVP)

- Configurare inițială: șoferi, mașini, depozite (stocate local, pe telefon).
- Selector sofer / auto / depozit → alegere tip P.V. (AMPLASARE, RIDICARE,
  SERVISARE, LIPSA ACCES, VANZARE).
- Import rapid din WhatsApp: lipești textul comenzii primite (client, adresă,
  persoană de contact, contract, produs) și formularul se pre-completează
  automat — verifici și completezi ce nu a fost recunoscut.
- Formularul complet de proces verbal: date client/beneficiar, catalog de
  produse (model/tip/serii/elemente auxiliare), secțiune financiară pentru
  VANZARE, observații, poartă GPS + poză de confirmare (cu banner de metadate
  ars pe poză), semnătura beneficiarului (canvas).
- Generare document: Proces Verbal + Aviz de însoțire (când e cazul) + anexe
  foto, cu conținutul legal păstrat identic cu aplicația Flutter, dar cu un
  aspect vizual nou, mai premium.
- Trimitere directă a PDF-ului (WhatsApp / email / orice aplicație) chiar din
  ecranul de previzualizare — fără să mai treci prin „Salvează ca PDF" +
  Fișiere. Vezi mai jos „Cum trimiți documentul mai departe".
- Numerotare automată PV / Aviz (contoare persistente, ca în aplicația veche).
- Istoric documente: redeschidere, retipărire și retrimitere a oricărui PV
  salvat.
- Instalabilă pe Android ca aplicație (Add to Home Screen) și funcțională
  offline (service worker).

## Ce NU este inclus încă (rămâne pentru o etapă viitoare)

- Modulul „Cereri / Documente" (concediu, demisie, învoire) — buton prezent,
  dar dezactivat.
- Ecran de gestiune a catalogului de produse (momentan se editează direct în
  `js/catalog-defaults.js`).
- Istoric locații client / hartă.
- Depozite de colaborare, parolă de depozit.
- Sincronizare/cont — datele rămân locale pe fiecare telefon (ai ales această
  variantă în locul unei baze de date centralizate).

## Cum genereză „PDF"-ul

Nu am putut aduce o librărie PDF (jsPDF etc.) pentru că acest mediu de lucru
nu are acces la internet. Sunt disponibile două căi, ambele generate local pe
telefon, fără server:

1. **Printeaza / Salveaza ca PDF** — deschide dialogul nativ de printare al
   browserului (Chrome → „Salvează ca PDF"). Fișierul ajunge în Descărcări.
2. **Trimite (WhatsApp / altă aplicație)** — generează un fișier PDF real
   direct în aplicație (fiecare pagină a documentului e „fotografiată" intern
   și asamblată într-un PDF, fără nicio librărie externă) și deschide meniul
   nativ de distribuire al telefonului, unde alegi WhatsApp (sau orice altă
   aplicație) direct — fără să mai treci prin Descărcări. Dacă telefonul/
   browserul nu suportă distribuirea directă, PDF-ul se descarcă automat, ca
   la opțiunea 1.

## Cum trimiți documentul mai departe

Din ecranul de previzualizare (după Preview sau după Genereaza Proces Verbal,
și din Istoric → Deschide), apasă „📤 Trimite (WhatsApp / altă aplicație)".
Telefonul îți arată meniul lui de distribuire — alegi contactul sau grupul de
WhatsApp și documentul pleacă direct ca fișier PDF, fără pași suplimentari.

## Cum o testezi local pe calculator

Ai nevoie de un mic server local (nu poți deschide `index.html` direct cu
dublu-click, din cauza modulelor JS și a service worker-ului). Cel mai simplu,
din acest folder:

```
npx serve .
```

sau, dacă ai Python instalat:

```
python -m http.server 8080
```

apoi deschizi `http://localhost:8080` în Chrome.

## Cum o instalezi pe telefonul Android (pas următor)

Un PWA poate fi instalat („Add to Home Screen") și poate funcționa offline
doar dacă este servit prin HTTPS (sau `localhost`). Cel mai simplu mod, gratuit:

1. Creezi un cont pe [Netlify](https://app.netlify.com) (sau GitHub Pages,
   Vercel — oricare merge).
2. Tragi acest folder întreg (`PV-WEBAPP`) în Netlify Drop
   (https://app.netlify.com/drop) — primești un link `https://ceva.netlify.app`.
3. Deschizi acel link pe telefonul Android, în Chrome → meniul „⋮" →
   „Adaugă pe ecranul de start" (sau apare automat un banner de instalare).

Spune-mi când ești gata pentru acest pas și te ajut să alegi și să configurezi
o găzduire — sau, dacă preferi, putem încerca alt mod de hosting.

## Structura proiectului

```
index.html          — pagina principală (shell-ul aplicației)
manifest.json        — configurare PWA (nume, icoane, culori)
sw.js                — service worker (cache offline)
css/styles.css        — interfața aplicației
css/print.css         — aspectul documentului generat (PV/Aviz/Anexe foto)
js/db.js              — persistență locală (IndexedDB)
js/app.js              — pornirea aplicației
js/screens-*.js        — ecranele aplicației
js/pdf-print.js         — construirea documentului + previzualizare + print
js/pdf-generate.js       — genereaza PDF-ul real (fara librarie) + trimitere
js/whatsapp-import.js     — extrage campuri dintr-un text de comanda WhatsApp
js/photo-annotate.js     — banner cu metadate ars pe poza de confirmare
js/catalog-defaults.js    — catalogul de produse implicit + info companie
assets/, icons/          — logo, imagini document, iconițe PWA
```

## Date implicite

Depozitul „HUNEDOARA" este pre-completat cu datele tale, ca în aplicația
veche. Șoferii și mașinile nu sunt pre-completate — le adaugi din Setări
(⚙ din ecranul principal) sau la prima pornire.
