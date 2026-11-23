import fs from 'node:fs';
import { google } from 'googleapis';
import { config } from './config.js';

const { calendarId, credentialsPath, tokenPath, rootUrl } = config.google;
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function newOAuthClient() {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function getAuthClient() {
    if (!fs.existsSync(credentialsPath)) {
        console.error(`❌ Errore: credentials.json non trovato in ${credentialsPath}`);
        return null;
    }

    const oAuth2Client = newOAuthClient();

    if (fs.existsSync(tokenPath)) {
        oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
        return oAuth2Client;
    }

    // Se non c'è il token, genera l'URL e stampalo nei log
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline', // fondamentale per avere il refresh_token
        prompt: 'consent',      // forza la schermata di consenso per essere sicuri
        scope: SCOPES,
    });
    console.log('\n------------------------------------------');
    console.log(' AUTORIZZAZIONE RICHIESTA');
    console.log('1. Apri questo link:', authUrl);
    console.log('2. Copia il codice che ti dà Google');
    console.log('3. Vai su: http://IP-DEL-NAS:PORTA/auth?code=IL_CODICE');
    console.log('------------------------------------------\n');

    return null;
}

/**
 * Prossimi eventi del calendario; array vuoto in caso di errore.
 */
export async function getCalendarEvents() {
    try {
        const auth = await getAuthClient();
        if (!auth) {
            console.error('Autenticazione Google fallita.');
            return [];
        }

        const calendar = google.calendar({ version: 'v3', auth, ...(rootUrl ? { rootUrl } : {}) });
        const res = await calendar.events.list({
            calendarId,
            timeMin: new Date().toISOString(),
            maxResults: 10, // Ne prendiamo 10 per sicurezza
            singleEvents: true,
            orderBy: 'startTime',
        });

        return res.data.items || [];
    } catch (error) {
        console.error('Errore durante il recupero degli eventi:', error.message);
        return [];
    }
}

/**
 * Handler di /auth: salva il token tramite URL (utile senza terminale).
 * `onAuthorized` viene chiamato a token salvato (per rigenerare subito l'agenda).
 */
export function authHandler(onAuthorized) {
    return async (req, res) => {
        // Endpoint di sola configurazione iniziale: con il token presente si disattiva.
        // Per ri-autorizzare, elimina token.json.
        if (fs.existsSync(tokenPath)) {
            return res.status(403).send('Token già presente: /auth è disattivato. Elimina token.json per ri-autorizzare.');
        }
        const code = req.query.code;
        if (!code) return res.send('❌ Codice mancante nell\'URL!');

        try {
            const { tokens } = await newOAuthClient().getToken(code);
            fs.writeFileSync(tokenPath, JSON.stringify(tokens));

            res.send('<h1>✅ Token salvato!</h1><p>L\'immagine si aggiornerà tra pochi istanti. Puoi chiudere questa pagina.</p>');
            console.log('✅ File token.json creato con successo!');
            onAuthorized?.();
        } catch (e) {
            res.status(500).send('❌ Errore durante il salvataggio: ' + String(e.message).replace(/[<>&]/g, ''));
        }
    };
}
