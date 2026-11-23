import axios from 'axios';
import { config } from './config.js';

// Client minimale per Synology Photos (Spazio Condiviso, SYNO.FotoTeam.*).
// Interfaccia pubblica: `photos.getRandom()` e `photos.status()`. Tutto il
// resto è un dettaglio interno, così l'implementazione si può sostituire in
// futuro (es. con un servizio dedicato) senza toccare le schermate.
//
// Consiglio: utente Synology dedicato, sola lettura sull'album foto,
// SENZA 2FA attivo (il secondo fattore non è gestito).
const { url: SYNO_URL, account: SYNO_ACCOUNT, password: SYNO_PASSWORD } = config.syno;

let synoSid = null;
let synoSidExpires = 0;

async function synoLogin() {
    if (synoSid && Date.now() < synoSidExpires) return synoSid;
    try {
        const res = await axios.get(`${SYNO_URL}/webapi/auth.cgi`, {
            params: {
                api: 'SYNO.API.Auth',
                version: 3,
                method: 'login',
                account: SYNO_ACCOUNT,
                passwd: SYNO_PASSWORD,
                session: 'FotoTeam',
                format: 'sid',
            },
        });
        if (res.data?.success) {
            synoSid = res.data.data.sid;
            // rinnova il login ogni ora per stare larghi
            synoSidExpires = Date.now() + 55 * 60 * 1000;
            return synoSid;
        }
        console.error('❌ Login Synology fallito:', res.data?.error);
        return null;
    } catch (e) {
        console.error('❌ Errore login Synology:', e.message);
        return null;
    }
}

// Cache della lista foto candidate (ultimo anno), rinnovata periodicamente
// per non interrogare l'API Synology ad ogni singolo refresh
let photoCache = [];
let photoCacheExpires = 0;
const PHOTO_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 ore

async function refreshPhotoCache() {
    const sid = await synoLogin();
    if (!sid) return;

    const now = Date.now();
    const oneYearAgoSec = Math.floor((now - 365 * 24 * 60 * 60 * 1000) / 1000);

    try {
        // SYNO.FotoTeam.* (Spazio Condiviso) invece di SYNO.Foto.* (Spazio
        // Personale) — vedi https://github.com/zeichensatz/SynologyPhotosAPI
        const res = await axios.get(`${SYNO_URL}/webapi/entry.cgi`, {
            params: {
                api: 'SYNO.FotoTeam.Browse.Item',
                version: 1,
                method: 'list',
                _sid: sid,
                type: 'photo',
                offset: 0,
                limit: 2000,
                sort_by: 'takentime',
                sort_direction: 'desc',
                additional: JSON.stringify(['thumbnail']),
            },
        });

        if (res.data?.success && Array.isArray(res.data.data?.list)) {
            photoCache = res.data.data.list.filter(item => item.time >= oneYearAgoSec);
            photoCacheExpires = now + PHOTO_CACHE_TTL_MS;
            console.log(`✅ Cache foto Synology aggiornata: ${photoCache.length} candidate (ultimo anno).`);
            if (photoCache.length === 0) {
                console.log('ℹ️ Nessuna foto trovata con la lista "piatta", provo enumerando le cartelle condivise...');
                await refreshPhotoCacheViaFolders(sid, oneYearAgoSec);
            }
        } else {
            console.error('❌ Risposta inattesa da SYNO.FotoTeam.Browse.Item, provo enumerando le cartelle condivise:', JSON.stringify(res.data).slice(0, 300));
            await refreshPhotoCacheViaFolders(sid, oneYearAgoSec);
        }
    } catch (e) {
        console.error('❌ Errore recupero foto Synology (lista piatta), provo enumerando le cartelle condivise:', e.response?.data || e.message);
        try {
            await refreshPhotoCacheViaFolders(sid, oneYearAgoSec);
        } catch (e2) {
            console.error('❌ Errore anche nel fallback per cartelle:', e2.response?.data || e2.message);
        }
    }
}

// Fallback: alcune configurazioni di Spazio Condiviso non espongono una
// lista "piatta" di tutte le foto (richiedono un folder_id). Qui enumeriamo
// le cartelle di primo livello e raccogliamo le foto da ciascuna.
async function refreshPhotoCacheViaFolders(sid, oneYearAgoSec) {
    const foldersRes = await axios.get(`${SYNO_URL}/webapi/entry.cgi`, {
        params: {
            api: 'SYNO.FotoTeam.Browse.Folder',
            version: 1,
            method: 'list_parents',
            _sid: sid,
        },
    });

    if (!foldersRes.data?.success || !Array.isArray(foldersRes.data.data?.list)) {
        console.error('❌ Impossibile enumerare le cartelle condivise:', JSON.stringify(foldersRes.data).slice(0, 300));
        return;
    }

    const rootFolders = foldersRes.data.data.list;
    let collected = [];

    for (const folder of rootFolders) {
        try {
            const itemsRes = await axios.get(`${SYNO_URL}/webapi/entry.cgi`, {
                params: {
                    api: 'SYNO.FotoTeam.Browse.Item',
                    version: 1,
                    method: 'list',
                    _sid: sid,
                    folder_id: folder.id,
                    offset: 0,
                    limit: 500,
                    additional: JSON.stringify(['thumbnail']),
                },
            });
            if (itemsRes.data?.success && Array.isArray(itemsRes.data.data?.list)) {
                collected = collected.concat(itemsRes.data.data.list.filter(item => item.time >= oneYearAgoSec));
            }
        } catch (e) {
            console.error(`❌ Errore lista foto cartella "${folder.name}":`, e.message);
        }
    }

    photoCache = collected;
    photoCacheExpires = Date.now() + PHOTO_CACHE_TTL_MS;
    console.log(`✅ Cache foto Synology aggiornata via cartelle: ${photoCache.length} candidate (ultimo anno).`);
}


async function getRandomPhotoBuffer() {
    if (!SYNO_URL) return null; // Synology non configurato: la schermata usa lo sfondo grigio
    if (Date.now() > photoCacheExpires || photoCache.length === 0) {
        await refreshPhotoCache();
    }
    if (photoCache.length === 0) return null;

    const sid = await synoLogin();
    if (!sid) return null;

    const item = photoCache[Math.floor(Math.random() * photoCache.length)];

    try {
        // Scarica la versione "originale" (o adatta a "xl" se troppo pesante)
        const res = await axios.get(`${SYNO_URL}/webapi/entry.cgi`, {
            params: {
                api: 'SYNO.FotoTeam.Thumbnail',
                version: 1,
                method: 'get',
                _sid: sid,
                id: item.id,
                cache_key: item.additional?.thumbnail?.cache_key,
                type: 'unit',
                size: 'xl',
            },
            responseType: 'arraybuffer',
        });
        return Buffer.from(res.data);
    } catch (e) {
        console.error('❌ Errore download foto Synology:', e.message);
        return null;
    }
}

export const photos = {
    isConfigured: () => Boolean(SYNO_URL && SYNO_ACCOUNT && SYNO_PASSWORD),
    getRandom: getRandomPhotoBuffer,
    status: () => ({
        candidates: photoCache.length,
        lastCacheRefresh: photoCacheExpires ? new Date(photoCacheExpires - PHOTO_CACHE_TTL_MS).toISOString() : null,
    }),
};
