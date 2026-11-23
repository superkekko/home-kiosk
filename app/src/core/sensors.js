import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { iconGlyph, hasIcon, normalizeIconName, suggestIcons } from './icons.js';

// Sensori mostrati dalle schermate, configurati in data/sensors.json (riletto a
// ogni rigenerazione: nessun riavvio), per schermata:
//
//   {
//     "calendar":        [ { "entity": "sensor.x", "label": "Consumato", "icon": "mdi-home-lightning-bolt-outline",
//                            "unit": "kWh", "decimals": 2, "format": "number" }, ... ],
//     "photo-dashboard": [ { "entity": "sensor.y", "icon": "mdi-solar-power" }, ... ]
//   }
//
// Campi: entity (obbligatorio), label, icon (nome MDI come sul sito: "mdi-ab-testing"),
// unit (default: quella di Home Assistant), decimals, format (number | timing | text, solo agenda).

const SENSORS_FILE = path.join(config.dataDir, 'sensors.json');
const MAX_SENSORS = { calendar: 10, 'photo-dashboard': 12 };
const FORMATS = ['number', 'timing', 'text'];
const FALLBACK_ICON = 'gauge'; // se "icon" manca o non esiste

// Ogni messaggio di avviso compare nel log una volta sola (le schermate si rigenerano di continuo)
const warned = new Set();
function warnOnce(msg) {
    if (warned.has(msg)) return;
    warned.add(msg);
    console.warn(`⚠️  [sensors] ${msg}`);
}

function readConfigFile() {
    if (!fs.existsSync(SENSORS_FILE)) {
        warnOnce(`${SENSORS_FILE} non trovato: nessun sensore verrà mostrato (vedi README, "Sensori e icone")`);
        return {};
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(SENSORS_FILE, 'utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('deve essere un oggetto con una lista per schermata');
        return parsed;
    } catch (e) {
        warnOnce(`${SENSORS_FILE} non valido (${e.message}): nessun sensore verrà mostrato`);
        return {};
    }
}

function normalizeItem(screenId, raw, index) {
    const where = `${screenId}[${index}]`;
    const entity = String(raw?.entity ?? '').trim();
    if (!entity) {
        warnOnce(`${where}: manca "entity", sensore ignorato`);
        return null;
    }
    const label = raw.label != null ? String(raw.label) : entity;

    let iconName = raw.icon != null && raw.icon !== '' ? normalizeIconName(raw.icon) : FALLBACK_ICON;
    if (!hasIcon(iconName)) {
        const hint = suggestIcons(iconName);
        warnOnce(`${where} (${entity}): icona "${raw.icon}" inesistente${hint.length ? `, forse: ${hint.map(n => `mdi-${n}`).join(', ')}` : ''}; uso "mdi-${FALLBACK_ICON}"`);
        iconName = FALLBACK_ICON;
    }

    let format = raw.format ?? 'number';
    if (!FORMATS.includes(format)) {
        warnOnce(`${where} (${entity}): format "${format}" sconosciuto (${FORMATS.join(', ')}); uso "number"`);
        format = 'number';
    }

    let decimals;
    if (raw.decimals != null) {
        decimals = Number(raw.decimals);
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
            warnOnce(`${where} (${entity}): decimals deve essere un intero tra 0 e 6; lo ignoro`);
            decimals = undefined;
        }
    }

    return {
        entity,
        label,
        iconName,
        glyph: iconGlyph(iconName),
        unit: raw.unit != null ? String(raw.unit) : undefined, // undefined = unità di Home Assistant
        decimals,
        format,
    };
}

/** Sensori normalizzati e pronti da disegnare per la schermata indicata. */
export function getSensors(screenId) {
    const file = readConfigFile();
    const list = file[screenId];
    if (list === undefined) {
        if (fs.existsSync(SENSORS_FILE)) warnOnce(`manca la chiave "${screenId}" in ${SENSORS_FILE}: nessun sensore per questa schermata`);
        return [];
    }
    if (!Array.isArray(list)) {
        warnOnce(`"${screenId}" in ${SENSORS_FILE} deve essere una lista: nessun sensore per questa schermata`);
        return [];
    }

    const max = MAX_SENSORS[screenId] ?? 12;
    if (list.length > max) warnOnce(`${screenId}: ${list.length} sensori configurati, ne mostro ${max}`);
    return list.slice(0, max).map((raw, i) => normalizeItem(screenId, raw, i)).filter(Boolean);
}
