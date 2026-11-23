import { renderFrame } from './canvas.js';

/**
 * Esegue ogni schermata con il proprio intervallo. I render passano da una
 * coda unica: canvas lavora in modo sincrono e sul NAS due render in parallelo
 * servirebbero solo a rallentarsi a vicenda.
 *
 * Una schermata che fallisce non tocca le altre; un frame che non si riesce a
 * disegnare mantiene l'ultima immagine buona.
 */
export class Scheduler {
    constructor({ screens, store }) {
        this.screens = screens;
        this.store = store;
        this.chain = Promise.resolve();
        this.state = new Map(screens.map(s => [s.id, {
            queued: false,
            lastRun: null,
            lastSuccess: null,
            lastError: null,
            lastDurationMs: null,
        }]));
        this.startedAt = Date.now();
    }

    start() {
        for (const screen of this.screens) {
            // Intervallo tra 1 minuto e 24 ore: un valore assurdo (es. 0 o enorme, che Node
            // trasforma in 1 ms) non deve far rigenerare la schermata in continuazione.
            const requested = Number.isFinite(screen.refreshMinutes) ? screen.refreshMinutes : 15;
            const minutes = Math.min(Math.max(requested, 1), 24 * 60);
            if (minutes !== screen.refreshMinutes) {
                console.warn(`⚠️  [${screen.id}] refreshMinutes=${screen.refreshMinutes} fuori range, uso ${minutes}`);
                screen.refreshMinutes = minutes;
            }
            this.trigger(screen.id);
            setInterval(() => this.trigger(screen.id), minutes * 60 * 1000);
        }
    }

    /** Mette in coda un render della schermata (ignorato se ce n'è già uno in attesa). */
    trigger(screenId) {
        const screen = this.screens.find(s => s.id === screenId);
        const st = this.state.get(screenId);
        if (!screen || st.queued) return;
        st.queued = true;
        this.chain = this.chain.then(() => this.#run(screen, st));
    }

    async #run(screen, st) {
        st.queued = false;
        st.lastRun = Date.now();
        try {
            const specs = await screen.frames(new Date());
            const entries = [];
            let failed = 0;
            for (const spec of specs) {
                try {
                    entries.push({ name: spec.name, buffer: await renderFrame(screen, spec) });
                } catch (e) {
                    failed++;
                    console.error(`❌ [${screen.id}] errore nel frame "${spec.name}":`, e);
                    entries.push({ name: spec.name, buffer: null });
                }
            }
            this.store.commit(screen.id, entries);

            st.lastDurationMs = Date.now() - st.lastRun;
            if (failed) {
                st.lastError = `${failed} frame non generati`;
            } else {
                st.lastError = null;
                st.lastSuccess = Date.now();
            }
            console.log(`✅ [${screen.id}] ${this.store.names(screen.id).length} frame (${st.lastDurationMs} ms)`);
        } catch (e) {
            st.lastDurationMs = Date.now() - st.lastRun;
            st.lastError = e.message;
            console.error(`❌ [${screen.id}] errore generazione:`, e);
        }
    }

    /** Stato per /api/status. Una schermata è "in ritardo" se l'ultimo successo è più vecchio di 3 intervalli. */
    report() {
        const now = Date.now();
        const screens = {};
        let ok = true;
        for (const screen of this.screens) {
            const st = this.state.get(screen.id);
            const maxAgeMs = 3 * screen.refreshMinutes * 60 * 1000 + 120 * 1000;
            const healthy = st.lastSuccess !== null && now - st.lastSuccess <= maxAgeMs;
            if (!healthy) ok = false;
            screens[screen.id] = {
                healthy,
                frames: this.store.names(screen.id),
                refreshMinutes: screen.refreshMinutes,
                lastRun: st.lastRun ? new Date(st.lastRun).toISOString() : null,
                lastSuccess: st.lastSuccess ? new Date(st.lastSuccess).toISOString() : null,
                lastError: st.lastError,
                lastDurationMs: st.lastDurationMs,
            };
        }
        return { ok, screens };
    }
}
