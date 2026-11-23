import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(here, '..', '..');

// Numero positivo da variabile d'ambiente, altrimenti il default
const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Cartella dati (in Docker è montata su /data): credentials.json, token.json,
// birthdays.json, birthday_images/, devices.json e sensors.json
const dataDir = process.env.DATA_DIR || path.join(APP_DIR, 'data');

export const config = {
    port: num(process.env.PORT, 8085),
    appDir: APP_DIR,
    dataDir,
    publicDir: path.join(APP_DIR, 'public'),
    assetsDir: path.join(APP_DIR, 'assets'),

    ha: {
        url: process.env.HA_URL,
        token: process.env.HA_TOKEN,
        weatherEntity: process.env.WEATHER_ENTITY_ID || 'weather.forecast_casafb_am',
    },

    google: {
        calendarId: process.env.CALENDAR_ID,
        credentialsPath: path.join(dataDir, 'credentials.json'),
        tokenPath: path.join(dataDir, 'token.json'),
        // Solo per sviluppo/test (mock locale delle API Google)
        rootUrl: process.env.GOOGLE_API_ROOT_URL || undefined,
    },

    syno: {
        url: process.env.SYNO_URL,
        account: process.env.SYNO_ACCOUNT,
        password: process.env.SYNO_PASSWORD,
    },

    birthdays: {
        file: path.join(dataDir, 'birthdays.json'),
        imagesDir: path.join(dataDir, 'birthday_images'),
    },

    devicesFile: path.join(dataDir, 'devices.json'),

    // Ogni quanti minuti rigenerare ciascuna schermata
    refresh: {
        calendar: num(process.env.REFRESH_MINUTES_CALENDAR, 5),
        birthday: num(process.env.REFRESH_MINUTES_BIRTHDAY, 5),
        dashboard: num(process.env.REFRESH_MINUTES_DASHBOARD, 15),
        photo: num(process.env.REFRESH_MINUTES_PHOTO, 15),
    },

    // Ogni quanti refresh della dashboard Kindle pescare una nuova foto
    photoEveryNRefresh: num(process.env.PHOTO_EVERY_N_REFRESH, 1),
};
