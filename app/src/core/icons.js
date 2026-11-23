import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Tutte le icone Material Design Icons contenute nel font incluso
// (assets/materialdesignicons-webfont.ttf): nome → codepoint esadecimale.
// Il nome è quello del catalogo MDI (https://pictogrammers.com/library/mdi/),
// scritto come nella pagina dell'icona: "mdi-ab-testing" (webfont). Sono accettati
// anche "mdi:ab-testing" (Home Assistant) e "ab-testing".
const ICONS = JSON.parse(fs.readFileSync(path.join(config.assetsDir, 'mdi-icons.json'), 'utf8'));

export function normalizeIconName(name) {
    return String(name ?? '').trim().toLowerCase().replace(/^mdi[:-]/, '');
}

export function hasIcon(name) {
    return Object.hasOwn(ICONS, normalizeIconName(name));
}

/** Carattere da disegnare con il font MDI, oppure null se l'icona non esiste. */
export function iconGlyph(name) {
    const hex = ICONS[normalizeIconName(name)];
    return hex ? String.fromCodePoint(parseInt(hex, 16)) : null;
}

/** Nomi che contengono tutte le parole cercate (es. "battery charge"), ordinati per lunghezza. */
function searchIcons(term, limit = 50) {
    const words = normalizeIconName(term).split(/[\s-]+/).filter(Boolean);
    if (words.length === 0) return [];
    return Object.keys(ICONS)
        .filter(name => words.every(w => name.includes(w)))
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
        .slice(0, limit);
}

/** Suggerimenti per un nome sbagliato: prima per sottostringa, poi per singola parola. */
export function suggestIcons(name, limit = 5) {
    const wanted = normalizeIconName(name);
    const exact = searchIcons(wanted, limit);
    if (exact.length) return exact;
    const seen = new Set();
    for (const word of wanted.split(/[\s-]+/).filter(w => w.length > 2)) {
        for (const n of searchIcons(word, limit)) seen.add(n);
        if (seen.size >= limit) break;
    }
    return [...seen].slice(0, limit);
}
