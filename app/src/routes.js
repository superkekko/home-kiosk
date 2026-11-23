import path from 'node:path';
import express from 'express';
import { authHandler } from './core/google.js';
import { photos } from './core/synology.js';

// Ogni display chiede le proprie immagini all'indirizzo del proprio dispositivo
// (vedi data/devices.json): il server non lo riconosce da IP o altro, conta solo l'URL.
export function buildApp({ config, store, scheduler, devices }) {
    const app = express();
    app.disable('x-powered-by');

    const deviceFiles = id => store.filesFor(devices[id].screens);

    const withDevice = (req, res, next) => {
        if (!Object.hasOwn(devices, req.params.id)) return res.status(404).json({ error: 'Dispositivo sconosciuto' });
        res.setHeader('Cache-Control', 'no-cache');
        next();
    };

    // Tutti i dispositivi con schermate e file attivi
    app.get('/devices', (req, res) => {
        res.json(Object.fromEntries(Object.entries(devices).map(([id, d]) => [id, {
            screens: d.screens,
            files: deviceFiles(id),
        }])));
    });

    // Elenco dei PNG attivi di un dispositivo, nell'ordine delle sue schermate
    app.get('/devices/:id/list', withDevice, (req, res) => {
        res.json(deviceFiles(req.params.id));
    });

    // Un solo PNG, per i display che ne mostrano uno alla volta: il primo, oppure
    // a rotazione ogni `rotateSeconds` se il dispositivo lo prevede
    app.get('/devices/:id/current.png', withDevice, (req, res) => {
        const device = devices[req.params.id];
        const files = deviceFiles(req.params.id);
        if (files.length === 0) return res.status(503).json({ error: 'Nessuna immagine ancora pronta' });
        const index = device.rotateSeconds
            ? Math.floor(Date.now() / (device.rotateSeconds * 1000)) % files.length
            : 0;
        res.sendFile(path.join(config.publicDir, files[index]));
    });

    // Un PNG dell'elenco del dispositivo
    app.get('/devices/:id/:file', withDevice, (req, res) => {
        const { id, file } = req.params;
        if (!deviceFiles(id).includes(file)) return res.status(404).json({ error: 'Immagine non disponibile per questo dispositivo' });
        res.sendFile(path.join(config.publicDir, file));
    });

    // Stato per schermata; 503 se una non si rigenera da troppo (usato dall'healthcheck)
    app.get('/api/status', (req, res) => {
        const report = scheduler.report();
        res.status(report.ok ? 200 : 503).json({
            ...report,
            devices: Object.fromEntries(Object.keys(devices).map(id => [id, deviceFiles(id)])),
            photos: photos.isConfigured() ? photos.status() : null,
        });
    });

    // Autorizzazione Google Calendar (si disattiva da sola a token creato)
    app.get('/auth', authHandler(() => scheduler.trigger('calendar')));

    return app;
}
