import { drawRoundedRect, drawImageCover, fitFont, loadImage, encodeTrueGrayscalePNG } from '../core/canvas.js';
import { getState, getForecast, getWeatherIcon } from '../core/ha.js';
import { getSensors } from '../core/sensors.js';
import { photos } from '../core/synology.js';
import { config } from '../core/config.js';

// Dashboard portrait 600x800 in scala di grigi per il Kindle WP63GW (e-ink):
// foto random da Synology Photos come sfondo, meteo e sensori Home Assistant
// in overlay. Il disegno è invariato rispetto a kindle-kiosk.

// Dimensioni native del pannello e-ink Kindle WP63GW (portrait)
const WIDTH = 600;
const HEIGHT = 800;

const WEATHER_ENTITY = config.ha.weatherEntity;

// I sensori in basso si scelgono in data/sensors.json (chiave "photo-dashboard"),
// con icona MDI a piacere.

// Ogni quanti render pescare una NUOVA foto (PHOTO_EVERY_N_REFRESH). Se il
// download fallisce si riusa l'ultima foto buona invece dello sfondo grigio.
let renders = 0;
let lastPhoto = null;
async function nextPhoto() {
    const due = !lastPhoto || renders % config.photoEveryNRefresh === 0;
    renders++;
    if (due) {
        const buffer = await photos.getRandom();
        if (buffer) lastPhoto = buffer;
    }
    return lastPhoto;
}

async function drawDashboard(ctx) {
    // Sfondo: foto random Synology, se disponibile
    const photoBuffer = await nextPhoto();
    if (photoBuffer) {
        try {
            const img = await loadImage(photoBuffer);
            drawImageCover(ctx, img, 0, 0, WIDTH, HEIGHT);
        } catch (e) {
            console.error('Errore decodifica foto:', e.message);
            ctx.fillStyle = '#dddddd';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }
    } else {
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // --- FASCIA METEO (in alto), card semi-trasparente ---
    const forecast = WEATHER_ENTITY ? (await getForecast(WEATHER_ENTITY))?.slice(0, 3) ?? null : null;
    const weatherBoxH = 150;
    drawRoundedRect(ctx, 15, 15, WIDTH - 30, weatherBoxH, 18, 'rgba(255,255,255,0.82)');

    if (forecast && forecast.length > 0) {
        const colW = (WIDTH - 60) / forecast.length;
        forecast.forEach((day, i) => {
            const cx = 45 + colW * i + colW / 2;
            const date = new Date(day.datetime);
            const label = date.toLocaleDateString('it-IT', { weekday: 'short' }).toUpperCase();

            ctx.textAlign = 'center';
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 20px DejaVu Sans';
            ctx.fillText(label, cx, 45);

            ctx.font = '46px MDI';
            ctx.fillStyle = '#000000';
            ctx.fillText(getWeatherIcon(day.condition), cx, 100);

            ctx.font = 'bold 22px DejaVu Sans';
            ctx.fillStyle = '#000000';
            const hi = Number.isFinite(day.temperature) ? `${Math.round(day.temperature)}°` : '--°';
            const lo = Number.isFinite(day.templow) ? `${Math.round(day.templow)}°` : '--°';
            ctx.fillText(`${hi} / ${lo}`, cx, 140);
        });
    } else {
        ctx.textAlign = 'center';
        ctx.font = 'italic 22px DejaVu Sans';
        ctx.fillStyle = '#666666';
        ctx.fillText('Meteo non disponibile', WIDTH / 2, 95);
    }
    ctx.textAlign = 'left';

    // --- FASCIA SENSORI (in basso), griglia 2 righe x N colonne ---
    // Altezza del box fissa (2 righe), indipendentemente da quanti sensori
    // sono configurati: aggiungerne altri aggiunge colonne, non altezza,
    // così la foto resta grande.
    const sensors = getSensors('photo-dashboard');
    if (sensors.length > 0) {
        const GRID_ROWS = 2;
        const cols = Math.max(1, Math.ceil(sensors.length / GRID_ROWS));
        const cellH = 95;
        const boxPad = 10;
        const boxX = 15;
        const boxW = WIDTH - 30;
        const boxH = boxPad * 2 + cellH * GRID_ROWS;
        const boxY = HEIGHT - boxH - 15;
        drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 18, 'rgba(255,255,255,0.82)');

        const sensorData = await Promise.all(sensors.map(s => getState(s.entity, { decimals: s.decimals, unit: s.unit })));
        const cellW = boxW / cols;
        const chipSize = 40;

        // Divisore orizzontale tra le due righe, solo se la seconda riga è usata
        if (sensors.length > cols) {
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(boxX + 15, boxY + boxPad + cellH);
            ctx.lineTo(boxX + boxW - 15, boxY + boxPad + cellH);
            ctx.stroke();
        }

        sensorData.forEach((data, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cellX = boxX + col * cellW;
            const cellTop = boxY + boxPad + row * cellH;
            const cellCx = cellX + cellW / 2;

            // Divisore verticale tra colonne (non prima della prima colonna)
            if (col > 0) {
                ctx.strokeStyle = 'rgba(0,0,0,0.12)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cellX, cellTop + 10);
                ctx.lineTo(cellX, cellTop + cellH - 10);
                ctx.stroke();
            }

            // Chip circolare + icona, centrati in alto nella cella
            const chipCy = cellTop + chipSize / 2 + 10;
            ctx.beginPath();
            ctx.arc(cellCx, chipCy, chipSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fill();

            ctx.font = '24px MDI';
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sensors[i].glyph, cellCx, chipCy + 1);

            // Valore, centrato sotto l'icona, con font che si adatta alla colonna
            const valueText = `${data.state} ${data.unit}`.trim();
            const valueMaxWidth = cellW - 16;
            ctx.textBaseline = 'alphabetic';
            const displayValue = fitFont(ctx, valueText, valueMaxWidth, 22);
            ctx.fillStyle = '#000000';
            ctx.fillText(displayValue, cellCx, chipCy + chipSize / 2 + 30);

            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        });
    }
}

export default {
    id: 'photo-dashboard',
    width: WIDTH,
    height: HEIGHT,
    grayscale: true,
    encode: encodeTrueGrayscalePNG, // PNG grayscale puro: il decoder del Kindle non gestisce bene RGBA
    refreshMinutes: config.refresh.dashboard,
    async frames() {
        return [{ name: 'photo-dashboard', draw: ctx => drawDashboard(ctx) }];
    },
};
