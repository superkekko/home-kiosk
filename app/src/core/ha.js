import axios from 'axios';
import { config } from './config.js';

const { url: HA_URL, token: HA_TOKEN } = config.ha;

if (!HA_TOKEN) {
    console.error('⚠️  HA_TOKEN non impostato: i dati di Home Assistant risulteranno N/D.');
}

const authHeaders = { Authorization: `Bearer ${HA_TOKEN}` };

// Stato "grezzo" di un'entità (stringa), "N/D" se non raggiungibile.
export async function getRawState(entityId) {
    try {
        const response = await axios.get(`${HA_URL}/states/${entityId}`, { headers: authHeaders });
        return response.data.state;
    } catch (e) {
        console.error(`Errore lettura HA (${entityId}):`, e.response?.status || e.message);
        return 'N/D';
    }
}

// Stato + unità di misura di un'entità, senza alcuna formattazione. In caso di
// errore restituisce { state: 'N/D', unit: '' }.
export async function getEntity(entityId) {
    try {
        const response = await axios.get(`${HA_URL}/states/${entityId}`, { headers: authHeaders });
        return { state: response.data.state, unit: response.data.attributes?.unit_of_measurement || '' };
    } catch (e) {
        console.error(`Errore lettura HA (${entityId}):`, e.response?.status || e.message);
        return { state: 'N/D', unit: '' };
    }
}

// Stato formattato per le card compatte: numeri con virgola decimale
// normalizzati, stati troppo lunghi troncati. Restituisce { state, unit }.
// `decimals` fissa le cifre decimali (default: intero se intero, altrimenti 1),
// `unit` sostituisce l'unità di Home Assistant.
export async function getState(entityId, { decimals, unit } = {}) {
    try {
        const response = await axios.get(`${HA_URL}/states/${entityId}`, { headers: authHeaders });
        let state = String(response.data.state ?? '');
        // Normalizza eventuale virgola decimale (locale IT) in punto
        const normalized = state.replace(',', '.');
        const asNumber = Number(normalized);
        if (state !== '' && Number.isFinite(asNumber)) {
            if (decimals != null) state = asNumber.toFixed(decimals);
            else state = Number.isInteger(asNumber) ? String(asNumber) : asNumber.toFixed(1);
        } else if (state.length > 12) {
            // Non è un numero riconoscibile ma è comunque troppo lungo per la card:
            // tronchiamo come ultima rete di sicurezza.
            state = state.slice(0, 12) + '…';
        }
        return { state, unit: unit ?? (response.data.attributes?.unit_of_measurement || '') };
    } catch (e) {
        console.error(`Errore lettura HA (${entityId}):`, e.response?.status || e.message);
        return { state: 'N/D', unit: unit ?? '' };
    }
}

// Previsioni giornaliere (array completo) oppure null.
export async function getForecast(entityId) {
    try {
        const response = await axios.post(
            `${HA_URL}/services/weather/get_forecasts?return_response=true`,
            { type: 'daily', entity_id: entityId },
            { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
        );
        const forecast = response.data?.service_response?.[entityId]?.forecast;
        if (Array.isArray(forecast)) return forecast;
        console.log('Struttura meteo inattesa:', JSON.stringify(response.data).substring(0, 200));
        return null;
    } catch (e) {
        console.error('Errore meteo HA:', e.response?.data || e.message);
        return null;
    }
}

export function getWeatherIcon(condition) {
    const map = {
        'sunny': '\u{F0599}',
        'clear-night': '\u{F0594}',
        'cloudy': '\u{F0590}',
        'partlycloudy': '\u{F0595}',
        'rainy': '\u{F0597}',
        'pouring': '\u{F0596}',
        'lightning-rainy': '\u{F067E}',
        'snowy': '\u{F0598}',
        'windy': '\u{F059D}',
        'fog': '\u{F0591}',
        'hail': '\u{F0592}',
        'lightning': '\u{F0593}',
        'snowy-rainy': '\u{F067F}',
        'windy-variant': '\u{F059E}',
        'exceptional': '\u{F0F2F}',
    };
    return map[condition] || '\u{F0599}'; // Default sole
}
