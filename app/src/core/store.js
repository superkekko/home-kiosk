import fs from 'node:fs';
import path from 'node:path';

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RESERVED_NAMES = ['current']; // /devices/<id>/current.png è un endpoint

/**
 * Archivio dei frame PNG pronti. Ogni schermata possiede un elenco ordinato di
 * frame (anche vuoto); i file vivono in una cartella piatta servita da Express.
 * Le scritture sono atomiche (file temporaneo + rename): chi scarica non può
 * mai ricevere un PNG a metà.
 */
export class FrameStore {
    constructor(dir) {
        this.dir = dir;
        this.byScreen = new Map(); // screenId -> [nome, ...] (senza estensione)
    }

    // All'avvio parte pulito: niente PNG vecchi rimasti da una run precedente
    // (es. un compleanno di ieri); finché non sono rigenerati non vengono elencati.
    init() {
        fs.mkdirSync(this.dir, { recursive: true });
        for (const f of fs.readdirSync(this.dir)) {
            if (f.endsWith('.png') || (f.startsWith('.') && f.endsWith('.tmp'))) {
                fs.rmSync(path.join(this.dir, f), { force: true });
            }
        }
    }

    names(screenId) {
        return [...(this.byScreen.get(screenId) ?? [])];
    }

    /**
     * Sostituisce i frame di una schermata.
     * entries: [{ name, buffer }] in ordine di visualizzazione.
     *   - buffer presente → il file viene (ri)scritto;
     *   - buffer null → generazione fallita: si tiene il file precedente, se c'era.
     * I frame che la schermata non produce più vengono cancellati.
     */
    commit(screenId, entries) {
        const prev = new Set(this.byScreen.get(screenId) ?? []);
        const next = [];

        for (const { name, buffer } of entries) {
            if (!NAME_RE.test(name) || RESERVED_NAMES.includes(name)) throw new Error(`Nome frame non valido: "${name}"`);
            const owner = this.#owner(name);
            if (owner && owner !== screenId) {
                throw new Error(`Il frame "${name}" appartiene già alla schermata "${owner}"`);
            }
            if (buffer) {
                const tmp = path.join(this.dir, `.${name}.png.tmp`);
                fs.writeFileSync(tmp, buffer);
                fs.renameSync(tmp, path.join(this.dir, `${name}.png`));
                next.push(name);
            } else if (prev.has(name)) {
                next.push(name);
            }
        }

        for (const name of prev) {
            if (!next.includes(name)) fs.rmSync(path.join(this.dir, `${name}.png`), { force: true });
        }
        this.byScreen.set(screenId, next);
    }

    /** Nomi file (con .png) dei frame attivi per un elenco ordinato di schermate. */
    filesFor(screenIds) {
        return screenIds.flatMap(id => this.names(id)).map(n => `${n}.png`);
    }

    #owner(name) {
        for (const [id, names] of this.byScreen) if (names.includes(name)) return id;
        return null;
    }
}
