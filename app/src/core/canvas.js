import path from 'node:path';
import pkg from 'canvas';
import { PNG } from 'pngjs';
import { config } from './config.js';

const { createCanvas, registerFont, loadImage } = pkg;

// Font icone Material Design Icons (usato da tutte le schermate)
registerFont(path.join(config.assetsDir, 'materialdesignicons-webfont.ttf'), { family: 'MDI' });

export { createCanvas, loadImage };

/**
 * Rettangolo arrotondato (fillRoundRect non esiste di default in node-canvas).
 */
export function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
}

// Converte l'intero canvas in scala di grigi (miglior resa sull'e-ink
// rispetto a lasciare che sia il firmware Kindle a farlo al volo)
export function toGrayscale(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);
}

// Disegna un'immagine "cover" (riempie tutto il riquadro, ritagliando l'eccesso)
export function drawImageCover(ctx, img, x, y, w, h) {
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;
    let sx, sy, sw, sh;
    if (imgRatio > boxRatio) {
        sh = img.height;
        sw = sh * boxRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        sw = img.width;
        sh = sw / boxRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Riduce il font finché il testo non entra in maxWidth (min 14px); se anche
// al minimo non entra, tronca il testo con ellissi come ultima rete di sicurezza.
export function fitFont(ctx, text, maxWidth, startPx, family = 'DejaVu Sans', bold = true) {
    let size = startPx;
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`;
    while (size > 14 && ctx.measureText(text).width > maxWidth) {
        size -= 2;
        ctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`;
    }
    let truncated = text;
    while (truncated.length > 1 && ctx.measureText(truncated).width > maxWidth) {
        truncated = truncated.slice(0, -1);
    }
    if (truncated !== text) truncated = truncated.trimEnd() + '…';
    return truncated;
}

// `canvas` esporta sempre PNG RGBA (32 bit), anche quando il contenuto è già
// in scala di grigi. Il decoder PNG del Kindle (firmware del 2014) a volte non
// gestisce bene quel formato e produce un'immagine corrotta/"stretchata". Qui
// ricodifichiamo come PNG grayscale "puro" (color type 0, 8 bit, un byte per
// pixel, senza canale alpha): il formato PNG più semplice e compatibile.
// Da usare dopo toGrayscale() (R=G=B).
export function encodeTrueGrayscalePNG(ctx, width, height) {
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const gray = Buffer.alloc(width * height);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
        gray[j] = rgba[i];
    }
    const png = new PNG({
        width,
        height,
        colorType: 0,
        bitDepth: 8,
        inputColorType: 0,
        inputHasAlpha: false,
    });
    png.data = gray;
    return PNG.sync.write(png, { colorType: 0, bitDepth: 8, inputColorType: 0, inputHasAlpha: false });
}

/**
 * Disegna un frame di una schermata e restituisce il PNG.
 * `frame.draw(ctx, width, height)` fa il disegno. Proprietà della schermata:
 *   - grayscale: conversione in scala di grigi (e-ink);
 *   - encode(ctx, width, height): codifica personalizzata del PNG (default: canvas.toBuffer).
 */
export async function renderFrame(screen, frame) {
    const canvas = createCanvas(screen.width, screen.height);
    const ctx = canvas.getContext('2d');
    await frame.draw(ctx, screen.width, screen.height);
    if (screen.grayscale) toGrayscale(ctx, screen.width, screen.height);
    if (screen.encode) return screen.encode(ctx, screen.width, screen.height);
    return canvas.toBuffer('image/png');
}
