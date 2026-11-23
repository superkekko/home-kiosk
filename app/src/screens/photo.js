import { drawImageCover, createCanvas, loadImage } from '../core/canvas.js';
import { photos } from '../core/synology.js';
import { config } from '../core/config.js';

// Foto random da Synology Photos a tutto schermo (1920x1080, a colori), senza
// overlay (le foto con proporzioni diverse dallo schermo non vengono ritagliate): pensata per il Raspberry, in rotazione con agenda e compleanni.

const WIDTH = 1920;
const HEIGHT = 1080;

// Se il download fallisce si riusa l'ultima foto buona
let lastPhoto = null;

// PHOTO_FIT: auto (default) | cover | contain
//  - cover: riempie lo schermo ritagliando i bordi;
//  - contain: foto intera, con sfondo sfocato ai lati;
//  - auto: cover se le proporzioni sono vicine a quelle dello schermo (si perde poco),
//    altrimenti contain (tipico delle foto verticali, che col ritaglio perderebbero metà immagine).
const FIT = (process.env.PHOTO_FIT || 'auto').toLowerCase();
const AUTO_MAX_DIFF = 0.15; // differenza massima di proporzioni per usare "cover"

// Sfondo "sfocato": la foto ridotta molto e riportata a schermo intero (cover) + velo scuro
function drawBlurredBackground(ctx, img) {
    const small = createCanvas(32, Math.round(32 * HEIGHT / WIDTH));
    const sctx = small.getContext('2d');
    drawImageCover(sctx, img, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawContain(ctx, img) {
    const scale = Math.min(WIDTH / img.width, HEIGHT / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    ctx.drawImage(img, Math.round((WIDTH - w) / 2), Math.round((HEIGHT - h) / 2), w, h);
}

async function drawPhoto(ctx) {
    const buffer = await photos.getRandom();
    if (buffer) lastPhoto = buffer;
    if (!lastPhoto) throw new Error('nessuna foto disponibile da Synology Photos');
    const img = await loadImage(lastPhoto);

    const diff = Math.abs(img.width / img.height - WIDTH / HEIGHT) / (WIDTH / HEIGHT);
    const useCover = FIT === 'cover' || (FIT !== 'contain' && diff <= AUTO_MAX_DIFF);
    if (useCover) {
        drawImageCover(ctx, img, 0, 0, WIDTH, HEIGHT);
    } else {
        drawBlurredBackground(ctx, img);
        drawContain(ctx, img);
    }
}

export default {
    id: 'photo',
    width: WIDTH,
    height: HEIGHT,
    grayscale: false,
    refreshMinutes: config.refresh.photo,
    async frames() {
        return [{ name: 'photo', draw: ctx => drawPhoto(ctx) }];
    },
};
