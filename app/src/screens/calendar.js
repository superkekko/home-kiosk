import { drawRoundedRect } from '../core/canvas.js';
import { getEntity, getForecast, getWeatherIcon } from '../core/ha.js';
import { getSensors } from '../core/sensors.js';
import { getCalendarEvents } from '../core/google.js';
import { config } from '../core/config.js';

// Agenda 1920x1080 a colori: eventi Google Calendar + stato casa (Home
// Assistant) + previsioni meteo. I sensori di "STATO CASA" si scelgono in
// data/sensors.json (chiave "calendar"), con icona MDI a piacere; senza file
// restano quelli di home-kiosk e il disegno è identico.

const WEATHER_ENTITY = config.ha.weatherEntity;

// Valore da mostrare per un sensore, secondo il suo "format" (number | timing | text)
function formatSensorValue(sensor, state) {
	if (sensor.format === 'timing') return formatTiming(state);
	if (sensor.format === 'text') return state;
	const decimals = sensor.decimals ?? 2;
	return parseFloat(state) ? parseFloat(state).toFixed(decimals) : state;
}

// Formatta i sensori "timing" di HA (stesso formato di prima), gestendo anche "unavailable"
function formatTiming(value) {
    if (!value || ["N/D", "unknown", "unavailable"].includes(value)) return "--:--";
    return `${value.substring(0, 5)} ${value.substring(11, 16)}`;
}

// Funzione pura dedicata esclusivamente al disegno del layout del calendario
async function drawCalendarScreen(ctx, WIDTH, HEIGHT) {
	const now = new Date();
	
	// Recupero dati in parallelo per massima velocità
	const sensors = getSensors('calendar');
	const [events, sensorData, weatherForecast] = await Promise.all([
		getCalendarEvents(),
		Promise.all(sensors.map(sensor => getEntity(sensor.entity))),
		getForecast(WEATHER_ENTITY)
	]);
	
	// Sfondo principale
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	
	// --- SEZIONE SINISTRA ---
	const leftX = 40;
	const boxWidth = 550;
	const borderRadius = 20;
	
	// Box 1: STATO CASA (Parte superiore)
	const casaBoxY = 40;
	const casaBoxHeight = 650; // Ridotto per far spazio al secondo box
	
	drawRoundedRect(ctx, leftX, casaBoxY, boxWidth, casaBoxHeight, borderRadius, '#118AB233');
	
	// Icona e Titolo Casa
	ctx.fillStyle = '#03a9f4';
	ctx.font = '50px MDI';
	ctx.fillText("\u{F07D0}", leftX + 40, casaBoxY + 80); 
	
	ctx.fillStyle = '#000000';
	ctx.font = 'bold 40px Arial';
	ctx.fillText("STATO CASA", leftX + 110, casaBoxY + 80);
	
	ctx.font = '35px Arial';
	let haY = casaBoxY + 160;
	// 6 righe a passo 85; con più sensori il passo si stringe per restare nel box
	const interlinea = sensors.length > 1 ? Math.min(85, (casaBoxHeight - 200) / (sensors.length - 1)) : 85;
	
	sensors.forEach((sensor, i) => {
		const data = sensorData[i];
		const val = formatSensorValue(sensor, data.state);
		const unit = sensor.unit ?? data.unit;
	
		ctx.fillStyle = '#4472C4'; // Un bel blu per le icone
		ctx.font = '40px MDI';
		ctx.fillText(sensor.glyph, 80, haY);
	
		ctx.fillStyle = '#000000'; // Nero per il testo
		ctx.font = '35px Arial';
		ctx.fillText(`${sensor.label}: ${val} ${unit}`, 160, haY);
		haY += interlinea;
	});
	
	// Box 2: PREVISIONI (Parte inferiore)
	const meteoBoxY = 710; // 20px di margine dal box sopra
	const meteoBoxHeight = 330;
	
	drawRoundedRect(ctx, leftX, meteoBoxY, boxWidth, meteoBoxHeight, borderRadius, '#073B4C33');
	
	// --- DISEGNO DATI METEO ---
	if (weatherForecast && weatherForecast.length > 0) {
		// Titolo Sezione Meteo
		ctx.fillStyle = '#03a9f4';
		ctx.font = '50px MDI';
		ctx.fillText("\u{F0595}", leftX + 40, meteoBoxY + 60);
		
		ctx.fillStyle = '#333333';
		ctx.font = 'bold 40px Arial';
		ctx.fillText("PREVISIONI", leftX + 100, meteoBoxY + 60);
	
		// Griglia Meteo (Oggi + 2 Giorni)
		let weatherX = leftX + 30;
		const weatherY = meteoBoxY + 130;
	
		weatherForecast.slice(0, 3).forEach((day, index) => {
			ctx.save(); // Salva lo stato (textAlign = left)
			
			const centerX = weatherX + 75;
			ctx.textAlign = 'center'; // Centra solo per questo giorno
			
			// Giorno
			ctx.fillStyle = '#666666';
			ctx.font = 'bold 20px Arial';
			ctx.fillText(index === 0 ? "OGGI" : new Date(day.datetime).toLocaleDateString('it-IT', { weekday: 'short' }).toUpperCase(), centerX, weatherY);
	
			// ICONA GRANDE (75px)
			ctx.font = '75px MDI';
			ctx.fillStyle = (day.condition || '').includes('rain') ? '#2196F3' : '#4472C4';
			ctx.fillText(getWeatherIcon(day.condition), centerX, weatherY + 85);
	
			// TEMPERATURE
			ctx.font = 'bold 26px Arial';
			ctx.fillStyle = '#000000';
			ctx.fillText(Number.isFinite(day.temperature) ? `${Math.round(day.temperature)}°` : "--°", centerX - 35, weatherY + 140);
			
			ctx.font = '22px Arial';
			ctx.fillStyle = '#888888';
			ctx.fillText(Number.isFinite(day.templow) ? `${Math.round(day.templow)}°` : "--°", centerX + 35, weatherY + 140);
	
			ctx.restore(); // Torna immediatamente a textAlign = left
			weatherX += 165;
		});
	}
		
	// --- SEZIONE DESTRA: AGENDA ---
	// 1. Disegna l'icona del Calendario
	ctx.fillStyle = '#4285F4'; // Blu Google Calendar
	ctx.font = '50px MDI';
	ctx.fillText("\u{F00ED}", 650, 120); // Posizionata a x: 650
	
	// 2. Disegna il Titolo Agenda
	ctx.fillStyle = '#000000';
	ctx.font = 'bold 40px Arial';
	ctx.fillText("AGENDA", 730, 120); // Spostata a x: 730 per fare spazio all'icona
	
	let y = 230;
	
	if (!events || events.length === 0) {
		ctx.font = 'italic 40px Arial';
		ctx.fillStyle = '#666666';
		ctx.fillText("Nessun evento in programma.", 650, y);
	} else {
		events.forEach((ev, i) => {
			const start = new Date(ev.start.dateTime || ev.start.date);
			const ora = ev.start.dateTime ? start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : "Tutto il giorno";
			const giorno = start.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
			const summary = ev.summary || '(senza titolo)'; // evita il crash su eventi senza titolo
	
			// --- I PRIMI DUE IN RISALTO (COMPATTATI) ---
			if (i < 2) {
				// --- LOGICA COLORE DINAMICO ---
				const oggi = new Date();
				const domani = new Date();
				domani.setDate(oggi.getDate() + 1);
			
				// Funzione rapida per azzerare l'orario e confrontare solo la data
				const isSameDay = (d1, d2) => 
					d1.getFullYear() === d2.getFullYear() &&
					d1.getMonth() === d2.getMonth() &&
					d1.getDate() === d2.getDate();
			
				let bgColor = '#06D6A033'; // Default: Verde (Successivi)
				
				if (isSameDay(start, oggi)) {
					bgColor = '#EF476F33'; // Rosso: Oggi
				} else if (isSameDay(start, domani)) {
					bgColor = '#FFD16633'; // Giallo: Domani
				}
			
				// --- DISEGNO BOX ---
				const highlightX = 650;
				const highlightWidth = 1200;
				const highlightHeight = 130; // Ridotto da 160 a 130
				const highlightRadius = 15;
			
				// Disegno box con y riproporzionata
				drawRoundedRect(ctx, highlightX, y - 60, highlightWidth, highlightHeight, highlightRadius, bgColor);
				
				ctx.fillStyle = '#000000';
				ctx.font = 'bold 45px Arial, NotoEmoji';
				const titolo = summary.length > 35 ? summary.substring(0, 32) + "..." : summary;
				ctx.fillText(`${titolo}`, 680, y - 5);
				
				ctx.font = '30px Arial'; // Font ridotto (da 35 a 30)
				ctx.fillStyle = '#444444';
				ctx.fillText(`${giorno} - ${ora}`, 680, y + 40);
				
				y += 150;
			
			} else if (y < 1020) {
				// --- GLI ALTRI IN LISTA COMPATTA (PIÙ STRETTI) ---
			
				if (i > 2) {
					ctx.strokeStyle = '#eeeeee';
					ctx.lineWidth = 1;
					ctx.beginPath(); 
					ctx.moveTo(650, y - 35); 
					ctx.lineTo(1850, y - 35); 
					ctx.stroke();
				}
			
				ctx.fillStyle = '#000000';
				ctx.font = 'bold 34px Arial, NotoEmoji';
				// Tronca solo se il titolo esce dall'area agenda (1200px)
				let titoloCompatto = summary;
				if (ctx.measureText(titoloCompatto).width > 1200) {
					while (titoloCompatto.length > 1 && ctx.measureText(titoloCompatto + "...").width > 1200) {
						titoloCompatto = titoloCompatto.slice(0, -1);
					}
					titoloCompatto = titoloCompatto.trimEnd() + "...";
				}
				ctx.fillText(titoloCompatto, 650, y);
				
				ctx.font = '28px Arial'; // Ridotto da 30 a 28
				ctx.fillStyle = '#666666';
				ctx.fillText(`${giorno} - ${ora}`, 650, y + 35);
				
				y += 90;
			}
		});
	}
	
	// --- FOOTER (Aggiornamento) ---
	const timestamp = now.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	const footerText = `aggiornamento: ${timestamp}`;
	
	ctx.textAlign = 'right'; // Allinea il testo a destra
	ctx.fillStyle = '#999999';
	ctx.font = 'italic 25px Arial';
	
	// Usiamo WIDTH - 70 per lasciare un po' di margine dal bordo destro
	ctx.fillText(footerText, 1850, 1040); 
	
	// Disegniamo l'icona subito a sinistra del testo
	ctx.font = '25px MDI';
	const textWidth = ctx.measureText(footerText).width;
	ctx.fillText("\u{F0459}", 1850 - textWidth - 10, 1040);
	
	ctx.textAlign = 'left'; // IMPORTANTE: Resetta l'allineamento a sinistra per le prossime generazioni
}

export default {
    id: 'calendar',
    width: 1920,
    height: 1080,
    grayscale: false,
    refreshMinutes: config.refresh.calendar,
    async frames() {
        return [{ name: 'calendar', draw: drawCalendarScreen }];
    },
};
