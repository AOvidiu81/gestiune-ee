// photo-annotate.js — arde pe poza de confirmare un banner cu metadate
// (client, cantitate, produse, data/ora, GPS, adresa, sofer/auto, nr PV/AVZ),
// echivalent cu photo_annotation.dart (_annotatePhotoWithMetadataInBackground).

// Logo-ul salvat in assets ("euro_ecologic_mark.png") e un simbol solid pe
// fundal transparent, in albastrul de brand — il "recoloram" o singura data
// intr-o varianta ALB, ca sa se potriveasca cu restul textului din banner
// (asa cum arata si bannerul din aplicatia veche APK). Pastram rezultatul
// intr-un cache (dupa referinta imaginii sursa), ca sa nu recalculam la
// fiecare poza adnotata in aceeasi sesiune.
const whiteLogoCache = new WeakMap();
function toWhiteLogo(logoImg) {
  if (!logoImg) return null;
  if (whiteLogoCache.has(logoImg)) return whiteLogoCache.get(logoImg);
  const c = document.createElement('canvas');
  c.width = logoImg.naturalWidth || logoImg.width;
  c.height = logoImg.naturalHeight || logoImg.height;
  const cctx = c.getContext('2d');
  cctx.drawImage(logoImg, 0, 0, c.width, c.height);
  // pastram doar forma (alfa) logo-ului, umplem restul cu alb
  cctx.globalCompositeOperation = 'source-in';
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, c.width, c.height);
  whiteLogoCache.set(logoImg, c);
  return c;
}

// Raportul de aspect (latime:inaltime) al cadrului "Anexa Foto" din
// documentul tiparit (.doc-annex-photo-frame, vezi print.css): pagina A4
// (210x297mm) minus margini (10mm sus, 14mm stanga/dreapta, 8mm jos) minus
// antet/titlu/subsol ramase ≈182mm latime x ≈227mm inaltime ≈ 0.80 — foarte
// aproape de 4/5, exact ce isi amintea utilizatorul de la aplicatia veche
// (APK). Decupam poza sursa (centrat, ca un "cover") la acest raport
// INAINTE de a o adnota, ca sa umple aproape tot cadrul in PDF, indiferent
// de formatul nativ al camerei telefonului (4:3, 16:9, etc) — fara sa
// denatureze imaginea (nu o intindem, doar taiem marginile in exces).
const TARGET_ASPECT = 4 / 5;

function cropRectForAspect(srcWidth, srcHeight, targetAspect) {
  const srcAspect = srcWidth / srcHeight;
  let sx = 0, sy = 0, sw = srcWidth, sh = srcHeight;
  if (srcAspect > targetAspect) {
    // sursa mai LATA decat cadrul tinta -> taiem simetric pe laterale
    sw = Math.round(srcHeight * targetAspect);
    sx = Math.round((srcWidth - sw) / 2);
  } else if (srcAspect < targetAspect) {
    // sursa mai INALTA decat cadrul tinta -> taiem simetric sus/jos
    sh = Math.round(srcWidth / targetAspect);
    sy = Math.round((srcHeight - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

function wrapLine(line, maxChars) {
  const normalized = line.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];
  const words = normalized.split(' ');
  const wrapped = [];
  let current = '';
  for (let word of words) {
    while (word.length > maxChars) {
      if (current) {
        wrapped.push(current);
        current = '';
      }
      wrapped.push(word.substring(0, maxChars - 1) + '-');
      word = word.substring(maxChars - 1);
    }
    const probe = current ? `${current} ${word}` : word;
    if (probe.length <= maxChars) {
      current = probe;
    } else {
      if (current) wrapped.push(current);
      current = word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped;
}

/**
 * @param {Blob} sourceBlob poza originala
 * @param {string[]} lines liniile de metadate
 * @param {string} depotName numele depozitului (titlu banner)
 * @param {HTMLImageElement|null} logoImg logo optional pentru banner
 * @returns {Promise<Blob>} poza adnotata (JPEG)
 */
export async function annotatePhotoWithMetadata(sourceBlob, lines, depotName, logoImg) {
  const img = await blobToImage(sourceBlob);
  const crop = cropRectForAspect(img.width, img.height, TARGET_ASPECT);
  // 2000px (fata de 1600px inainte): rezolutie mai mare, ca textul din
  // banner sa nu para "pixelat" la zoom in vizualizatorul de PDF.
  const maxWidth = 2000;
  const scale = crop.sw > maxWidth ? maxWidth / crop.sw : 1;
  const width = Math.round(crop.sw * scale);
  const height = Math.round(crop.sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

  const whiteLogo = toWhiteLogo(logoImg);
  const cleanLines = lines.map((l) => l.trim()).filter(Boolean);
  const margin = Math.min(30, Math.max(12, Math.round(width * 0.016)));
  // Marimile din banner (font, logo) sunt calculate ca sa dea o dimensiune
  // FIXA pe pagina TIPARITA, nu un numar fix de pixeli — cadrul "Anexa Foto"
  // din PDF (.doc-annex-photo-frame, print.css) umple ≈182mm latime din
  // pagina A4 ≈ 516pt, indiferent de rezolutia nativa a pozei; daca am folosi
  // un font fix in pixeli, el ar iesi tiparit la marimi diferite in functie
  // de camera telefonului (o poza de rezolutie mica ar avea text URIAS, una
  // de rezolutie mare ar avea text MINUSCUL — exact problema semnalata:
  // "abia se citeste, si daca maresc, se pixeleaza"). Calculam deci fontul
  // ca fractiune din latimea FINALA a imaginii (dupa decupare+scalare),
  // tintind ≈8.5pt text si ≈12pt titlu pe pagina tiparita (comparabil cu
  // restul textului din document: vezi print.css .doc-table 8.6pt, .doc-title
  // 15pt) — verificat empiric cu Playwright (poze test la rezolutii diferite,
  // toate ies la aceeasi marime tiparita).
  const MM_TO_PT = 2.83465;
  const FRAME_WIDTH_PT = 182 * MM_TO_PT; // latimea cadrului Anexa Foto in PDF
  const TARGET_BODY_PT = 8.5;
  const TARGET_TITLE_PT = 12;
  const fontSize = Math.round((TARGET_BODY_PT * width) / FRAME_WIDTH_PT);
  const titleFontSize = Math.round((TARGET_TITLE_PT * width) / FRAME_WIDTH_PT);
  const lineHeight = Math.round(fontSize * 1.4);
  const logoH = whiteLogo ? Math.round(titleFontSize * 1.6) : 0;
  const headerHeight = Math.round(logoH + fontSize * 0.9);

  ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  const maxBannerWidth = width - 2 * margin;
  let maxCharsPerLine = 60;
  // estimam nr de caractere pe baza masuratorii medii a fontului
  const avgCharWidth = ctx.measureText('ABCDEFGHIJ0123456789').width / 21;
  maxCharsPerLine = Math.max(18, Math.min(120, Math.floor((maxBannerWidth - 24) / avgCharWidth)));

  const wrapped = [];
  cleanLines.forEach((line) => wrapped.push(...wrapLine(line, maxCharsPerLine)));

  const maxBannerHeight = height - 2 * margin;
  const maxContentLines = Math.max(1, Math.floor((maxBannerHeight - headerHeight - 18) / lineHeight));
  const visibleLines = wrapped.length > maxContentLines ? wrapped.slice(0, maxContentLines) : wrapped;
  if (wrapped.length > maxContentLines && visibleLines.length) {
    const idx = visibleLines.length - 1;
    if (visibleLines[idx].length > maxCharsPerLine - 3) {
      visibleLines[idx] = visibleLines[idx].substring(0, maxCharsPerLine - 3) + '...';
    } else {
      visibleLines[idx] += '...';
    }
  }

  const bannerHeight = headerHeight + 8 + visibleLines.length * lineHeight + 10;

  // Latimea chenarului "se strange" pe continut, in loc sa ocupe mereu toata
  // latimea pozei (asa arata bannerul din aplicatia veche APK): masuram cel
  // mai lat element (titlul + logo, sau cea mai lunga linie de text) si
  // dimensionam dreptunghiul dupa acel continut, cu putin padding — dar fara
  // sa depaseasca latimea maxima disponibila (bannerul tot poate creste pana
  // acolo, pentru comenzi cu text lung).
  const rightPad = 14;
  const textLeftPad = 12;
  const logoW = whiteLogo ? (logoH / whiteLogo.height) * whiteLogo.width : 0;
  const titleLeftOffset = whiteLogo ? 10 + logoW + 14 : 14;

  ctx.font = `700 ${titleFontSize}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  let neededWidth = titleLeftOffset + ctx.measureText(depotName).width + rightPad;

  ctx.font = `${fontSize}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  for (const line of visibleLines) {
    const lineWidth = textLeftPad + ctx.measureText(line).width + rightPad;
    if (lineWidth > neededWidth) neededWidth = lineWidth;
  }

  const minBannerWidth = 140;
  const bannerWidth = Math.max(minBannerWidth, Math.min(maxBannerWidth, Math.ceil(neededWidth)));
  const startX = margin;
  const startY = Math.max(0, height - bannerHeight - margin);

  ctx.fillStyle = 'rgba(0,0,0,0.66)';
  roundRect(ctx, startX, startY, bannerWidth, bannerHeight, 10);
  ctx.fill();

  let titleX = startX + 14;
  if (whiteLogo) {
    ctx.drawImage(whiteLogo, startX + 10, startY + 8, logoW, logoH);
    titleX = startX + 10 + logoW + 14;
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${titleFontSize}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(depotName, titleX, startY + headerHeight / 2 + 4);

  ctx.font = `${fontSize}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  let textY = startY + headerHeight + 8 + lineHeight / 2;
  for (const line of visibleLines) {
    ctx.fillText(line, startX + textLeftPad, textY);
    textY += lineHeight;
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.87));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}
