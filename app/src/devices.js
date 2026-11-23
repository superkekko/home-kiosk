import fs from 'node:fs';
import { config } from './core/config.js';
import { SCREENS } from './screens/index.js';

// Un "dispositivo" è un display fisico: una lista ordinata di schermate,
// definita in data/devices.json. L'elenco dei file che gli arrivano è
// l'insieme dei frame attivi di quelle schermate, nello stesso ordine.
export function loadDevices() {
    if (!fs.existsSync(config.devicesFile)) {
        throw new Error(`${config.devicesFile} non trovato: crea il file con i tuoi dispositivi (vedi README, "Dispositivi")`);
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(config.devicesFile)).devices;
    } catch (e) {
        throw new Error(`devices.json non valido (${config.devicesFile}): ${e.message}`);
    }
    if (raw === null || typeof raw !== 'object' || Object.keys(raw).length === 0) {
        throw new Error('devices.json: serve la chiave "devices" con almeno un dispositivo');
    }

    const devices = {};
    for (const [id, def] of Object.entries(raw)) {
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) throw new Error(`devices.json: id dispositivo non valido "${id}"`);
        if (!Array.isArray(def?.screens) || def.screens.length === 0) {
            throw new Error(`devices.json: "${id}" deve avere un elenco "screens" non vuoto`);
        }
        const unknown = def.screens.filter(s => !SCREENS[s]);
        if (unknown.length) {
            throw new Error(`devices.json: "${id}" usa schermate sconosciute: ${unknown.join(', ')} (disponibili: ${Object.keys(SCREENS).join(', ')})`);
        }
        devices[id] = {
            screens: def.screens,
            // Con più frame, /devices/<id>/current.png li ruota ogni N secondi (default: sempre il primo)
            rotateSeconds: Number(def.rotateSeconds) > 0 ? Number(def.rotateSeconds) : null,
        };
    }
    return devices;
}

/** Schermate da eseguire = quelle usate da almeno un dispositivo. */
export function activeScreens(devices) {
    const ids = new Set(Object.values(devices).flatMap(d => d.screens));
    return Object.keys(SCREENS).filter(id => ids.has(id)).map(id => SCREENS[id]);
}
