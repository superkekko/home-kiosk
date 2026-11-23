import fs from 'node:fs';
import path from 'node:path';
import { loadImage } from '../core/canvas.js';
import { config } from '../core/config.js';

// Schermata di auguri 1920x1080. Produce UN frame per ogni festeggiato del
// giorno (birthday-1.png, birthday-2.png, ...) e nessun frame negli altri
// giorni. Il disegno è invariato rispetto a home-kiosk.

const BIRTHDAYS_PATH = config.birthdays.file;               // [{ "name": "...", "date": "GG-MM" }]
const BIRTHDAY_IMAGES_DIR = config.birthdays.imagesDir;     // carosello sfondi

// Nomi di chi compie gli anni oggi (anche più di uno, nell'ordine del file)
let warnedMissing = false;
function getBirthdayPeople(now) {
    if (!fs.existsSync(BIRTHDAYS_PATH)) {
        if (!warnedMissing) {
            console.warn(`⚠️  birthdays.json non trovato in ${BIRTHDAYS_PATH}: nessun compleanno verrà mostrato.`);
            warnedMissing = true;
        }
        return [];
    }

    try {
        const birthdays = JSON.parse(fs.readFileSync(BIRTHDAYS_PATH));
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const todayStr = `${day}-${month}`; // Formato "GG-MM"

        return birthdays.filter(b => b.date === todayStr && b.name).map(b => String(b.name));
    } catch (e) {
        console.error('Errore nel controllo del file dei compleanni:', e);
        return [];
    }
}

// --- FUNZIONE RENDERING COMPLEANNO ---
async function drawBirthdayScreen(ctx, WIDTH, HEIGHT, name) {
    try {
        // Default in caso la cartella sia vuota o non esista
        ctx.fillStyle = '#FFEEF2';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        if (fs.existsSync(BIRTHDAY_IMAGES_DIR)) {
            const files = fs.readdirSync(BIRTHDAY_IMAGES_DIR).filter(file => {
                return ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file).toLowerCase());
            });

            if (files.length > 0) {
                // Selezione randomica dal carosello di immagini
                const randomFile = files[Math.floor(Math.random() * files.length)];
                const imgPath = path.join(BIRTHDAY_IMAGES_DIR, randomFile);
                
                const background = await loadImage(imgPath);
                // Disegna l'immagine adattandola al display 16:9
                ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
            }
        }

        // Sovrapposizione Rettangolo Scuro Semitrasparente per rendere leggibile il testo
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Configurazione del Testo dell'augurio
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 15;

        // Scritta superiore
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 70px Arial';
        ctx.fillText("TANTI AUGURI DI BUON COMPLEANNO", WIDTH / 2, HEIGHT / 2 - 100);

        ctx.font = 'bold 110px Arial';
        ctx.fillStyle = '#FFD166'; // Un bell'oro/giallo acceso per il nome
        ctx.fillText(`${name.toUpperCase()}`, WIDTH / 2, HEIGHT / 2 + 30);

        // Ripristina le impostazioni del testo per non alterare i cicli successivi
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.shadowBlur = 0;
    } catch (err) {
        console.error("Errore durante il disegno dello schermo di compleanno:", err);
    }
}

export default {
    id: 'birthday',
    width: 1920,
    height: 1080,
    grayscale: false,
    refreshMinutes: config.refresh.birthday,
    async frames(now) {
        return getBirthdayPeople(now).map((name, i) => ({
            name: `birthday-${i + 1}`,
            draw: (ctx, w, h) => drawBirthdayScreen(ctx, w, h, name),
        }));
    },
};
