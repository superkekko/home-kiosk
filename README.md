# kiosk-server

Un solo container Node.js che genera le immagini PNG per tutti i display di casa: agenda e
compleanni per il Raspberry, dashboard con foto per il Kindle e-ink, e tutti i kiosk che
aggiungerai. Ogni display chiede le proprie immagini al proprio indirizzo.

## Come è fatto

```
app/
  index.js              avvio: carica i dispositivi, parte lo scheduler, espone le rotte
  src/
    core/               pezzi condivisi: Home Assistant, Google, Synology, canvas, icone MDI, sensori, store, scheduler
    screens/            una schermata per file: calendar, birthday, photo-dashboard
    devices.js          dispositivi = liste ordinate di schermate (data/devices.json)
    routes.js           endpoint HTTP
  assets/               font icone MDI (webfont) e mappa nome → icona
  dev/mock-services.js  HA/Synology/Google finti per provare senza NAS
data/                   configurazione e dati personali (montata nel container su /data)
raspberry/              script del Raspberry (immagini e pulsante di spegnimento)
```

- **Schermata**: sa disegnarsi e produce **zero, uno o più frame** (PNG). Esempio: `birthday`
  produce `birthday-1.png`, `birthday-2.png`... se più persone compiono gli anni lo stesso giorno,
  e nessun frame negli altri giorni.
- **Dispositivo**: un display fisico = elenco ordinato di schermate. Il file che riceve è
  l'insieme dei frame attivi di quelle schermate.
- **Scheduler**: ogni schermata ha il suo intervallo; i render passano da una coda unica.
  Se un frame non si riesce a disegnare resta l'ultima immagine buona; se una schermata
  smette di produrre un frame (compleanno finito) il file viene cancellato.

## Setup

1. `cp .env.example .env` e compila `HA_TOKEN` (e gli altri valori che ti servono).
2. Metti in `data/` (la cartella accanto a `compose.yaml`):
   - `devices.json` e `sensors.json`: già presenti, da adattare (vedi sotto);
   - `credentials.json` e `token.json` per Google Calendar;
   - `birthdays.json` e `birthday_images/` (vedi "Compleanni").
3. `docker compose up -d --build`
4. Se manca `token.json`: `http://<host>:8084/auth` (attivo solo finché il token non esiste).
5. Controlla `http://<host>:8085/api/status` e `http://<host>:8084/devices`.

Al primo avvio il container installa librerie di sistema e `npm ci` (serve rete a runtime,
non in fase di build: sul NAS la rete di build non è usabile). Ai riavvii successivi parte subito.
Se cambia `package-lock.json` le dipendenze npm si reinstallano da sole.

## Dispositivi e indirizzi (`data/devices.json`)

```json
{
  "devices": {
    "pi-agenda": { "screens": ["birthday", "calendar"] },
    "kindle":    { "screens": ["photo-dashboard"] }
  }
}
```

**Il server non riconosce il dispositivo da IP o altro: conta solo l'indirizzo che il display chiede.**
Ogni display usa il proprio id (`pi-agenda`, `kindle`, `cucina`...):

| Indirizzo | Cosa restituisce |
|---|---|
| `/devices` | tutti i dispositivi con schermate e file attivi |
| `/devices/<id>/list` | elenco JSON dei PNG attivi del dispositivo, nell'ordine delle sue schermate |
| `/devices/<id>/<file>.png` | uno dei PNG dell'elenco (404 se non appartiene a quel dispositivo) |
| `/devices/<id>/current.png` | un solo PNG: il primo, oppure a rotazione ogni `rotateSeconds` |
| `/api/status` | stato per schermata; **503** se una non si rigenera da più di 3 intervalli (lo usa l'healthcheck) |
| `/auth` | autorizzazione Google Calendar (solo finché manca `token.json`) |

Un nuovo display, per esempio un tablet in cucina che alterna le due schermate ogni 20 secondi:

```json
"cucina": { "screens": ["calendar", "birthday"], "rotateSeconds": 20 }
```

e il tablet chiede `http://<host>:8085/devices/cucina/current.png`. Vengono eseguite solo le
schermate usate da almeno un dispositivo. `devices.json` è obbligatorio e si legge all'avvio:
dopo averlo modificato riavvia il container.

## Sensori e icone (`data/sensors.json`)

I sensori di Home Assistant mostrati dalle schermate si scelgono in `data/sensors.json`, ciascuno con
l'icona che vuoi tra **tutte le 7.430 icone MDI** del webfont incluso. Il file viene riletto a ogni
rigenerazione (nessun riavvio).

```json
{
  "calendar": [
    { "entity": "sensor.energia_prodotta", "label": "Prodotta", "icon": "mdi-solar-power", "decimals": 1 },
    { "entity": "sensor.inverter_battery_soc", "label": "Batteria", "icon": "mdi-battery-80", "decimals": 0 },
    { "entity": "sensor.timing_carica_batteria", "label": "Carica", "icon": "mdi-battery-charging-high", "format": "timing", "unit": "" }
  ],
  "photo-dashboard": [
    { "entity": "sensor.temperatura_soggiorno", "icon": "mdi-sofa" },
    { "entity": "sensor.umidita_soggiorno", "icon": "mdi-water-percent", "decimals": 0 }
  ]
}
```

- `calendar` = riquadro "STATO CASA" dell'agenda (fino a 10 sensori; sopra 6 le righe si stringono da sole).
  `photo-dashboard` = griglia in basso nella dashboard Kindle (fino a 12; mostra solo icona e valore).
- Se il file o la chiave di una schermata mancano, quella schermata non mostra sensori (e il log lo dice).

| Campo | Significato |
|---|---|
| `entity` | obbligatorio, l'entity_id di Home Assistant |
| `label` | testo davanti al valore (solo agenda; default: l'entity_id) |
| `icon` | nome dell'icona MDI **come sul sito**: `mdi-ab-testing`. Senza `icon` o con un nome inesistente si vede `mdi-gauge` |
| `unit` | unità mostrata; se manca vale quella di Home Assistant (`""` = nessuna) |
| `decimals` | cifre decimali, da 0 a 6 (agenda: default 2; Kindle: intero se intero, altrimenti 1) |
| `format` | solo agenda: `number` (default), `timing` (sensori data/ora di carica/scarica), `text` (stato così com'è) |

**Scegliere l'icona:** cerca sul [catalogo MDI](https://pictogrammers.com/library/mdi/), apri l'icona e copia il
nome del webfont (`mdi-ab-testing`). Il font incluso (`app/assets/materialdesignicons-webfont.ttf`)
contiene le icone di una certa versione: un'icona molto recente potrebbe mancare, e in tal caso
sostituisci il font e rigenera `mdi-icons.json` (nome → codepoint, ricavabile dal font stesso).

Errori di configurazione non fermano nulla: un'icona inesistente diventa `mdi-gauge` e nel log compare
un avviso con i nomi simili (`docker compose logs kiosk-server | grep sensors`); un `sensors.json`
non valido fa mostrare zero sensori; un'entità inesistente mostra `N/D`.

## Compleanni

La schermata di auguri usa due cose in `data/`:

- **`birthdays.json`**: elenco di persone, data nel formato **`GG-MM`** (giorno-mese, con lo zero davanti, senza anno).
  ```json
  [
    { "name": "Mario", "date": "14-10" },
    { "name": "Anna",  "date": "03-02" }
  ]
  ```
  (un esempio è in `data/birthdays.example.json`). Se due persone compiono gli anni lo stesso giorno
  vengono mostrati due frame, uno per ciascuna. Dopo aver modificato il file non serve riavviare:
  viene riletto a ogni rigenerazione (ogni 5 minuti per default).
- **`birthday_images/`** (facoltativa): immagini `.png`, `.jpg`, `.jpeg`, `.webp` usate a caso come sfondo.
  Se la cartella è vuota o manca, lo sfondo è rosa chiaro.

Se `birthdays.json` non c'è, non si vede nessun compleanno e nei log compare
`birthdays.json non trovato in /data/birthdays.json` (`docker compose logs kiosk-server`).
Per provarlo subito, metti la data di oggi nel file e controlla `http://<host>:8085/devices/pi-agenda/list`:
deve comparire `birthday-1.png`.

## Lato Raspberry (agenda)

Il Pi scarica i PNG con `raspberry/aggiorna_agenda.sh` (cron ogni 5 minuti) e li mostra con `feh`.
Lo script chiede `SERVER_URL/devices/$DEVICE_ID/list` e scarica ciascun file da
`SERVER_URL/devices/$DEVICE_ID/<file>` (`SERVER_URL` e `DEVICE_ID` si possono cambiare con variabili
d'ambiente; di default `http://192.168.0.101:8085` e `pi-agenda`).
Il testo completo (crontab, autostart, risparmio energetico) è in `raspberry/README.txt`.

**Pulsante di spegnimento.** Pulsante tra Pin 5 (GPIO 3) e Pin 6 (GND): tenuto premuto 1 secondo
spegne il Pi, un nuovo tocco lo riaccende. Lo gestisce `raspberry/pulsante-spegni.py`, un servizio
systemd che legge il pin direttamente (tempo regolabile con `HOLD_SECONDS` nel file `.service`).

Non si usa `dtoverlay=gpio-shutdown` (né le righe `HandlePowerKey` / `PowerKeyIgnoreInhibited` in
`logind.conf`): l'overlay non ha alcun tempo di pressione e dipende da logind/desktop, che possono
ignorare l'evento. Se lo avevi, toglilo da `/boot/firmware/config.txt`.

```sh
sudo apt install python3-gpiozero python3-lgpio
sudo cp raspberry/pulsante-spegni.py /usr/local/bin/ && sudo chmod +x /usr/local/bin/pulsante-spegni.py
sudo cp raspberry/pulsante-spegni.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pulsante-spegni.service
sudo reboot        # necessario se hai tolto il dtoverlay
```

Se non spegne: `pinctrl get 3` deve passare da `hi` a `lo` premendo (altrimenti è cablaggio/pulsante);
`journalctl -u pulsante-spegni -f` mostra ogni pressione letta. Dettagli in `raspberry/README.txt`.

## Lato Kindle (WP63GW)

Il server genera la dashboard come **PNG grayscale puro** (color type 0, 8 bit, senza alpha):
`canvas` esporta sempre RGBA e il decoder del firmware Kindle (2014) su alcuni dispositivi
deforma l'immagine. La ricodifica usa `pngjs` (`encodeTrueGrayscalePNG` in `app/src/core/canvas.js`)
ed è attivata solo per la schermata `photo-dashboard`.

Sul Kindle uno script periodico (`/mnt/us/dashboard-loop.sh`) scarica
`http://<host>:8085/devices/kindle/current.png` e lo mostra con `eips -g`.

Su questo Kindle `/var` è un tmpfs: dopo ogni riavvio **crond e il crontab spariscono** e vanno ricreati
(`dashboard-loop.sh` resta, perché sta su `/mnt/us`). Via kterm o SSH (`ssh -p 2222 root@<ip-kindle>`):

```sh
mkdir -p /var/spool/cron/crontabs     # 1. cartella dei crontab
crontab -e                            # 2. riga: */15 * * * * /mnt/us/dashboard-loop.sh
crontab -l                            # 3. verifica
crond -l 2 -L /mnt/us/crond.log       # 4. avvia crond
ps | grep crond                       # 5. verifica
~ds                                   # 6. disattiva lo screensaver (si resetta a ogni riavvio)
```

Senza `~ds`, dopo un po' di inattività il Kindle sovrascrive il dashboard con la sua immagine di spegnimento.
La soluzione definitiva è uno script in `/etc/init.d/` che esegua questi passaggi a ogni boot
(non ancora configurato).

Foto: la dashboard pesca una foto a caso dallo Spazio Condiviso di Synology Photos (ultimo anno).
`PHOTO_EVERY_N_REFRESH` fa cambiare foto solo ogni N rigenerazioni; se il download fallisce resta
l'ultima foto buona. Consigliato un utente Synology dedicato, sola lettura, senza 2FA.

## Aggiungere una schermata

1. Nuovo file in `app/src/screens/` che esporta `{ id, width, height, grayscale, refreshMinutes, frames(now) }`
   (opzionale `encode(ctx, w, h)` per una codifica PNG particolare).
   `frames()` restituisce un array di `{ name, draw(ctx, w, h) }` (anche vuoto). I nomi dei frame
   devono essere unici tra tutte le schermate (`current` è riservato).
2. Aggiungila all'elenco in `app/src/screens/index.js`.
3. Inseriscila nella lista `screens` di un dispositivo in `data/devices.json`.

Un nuovo kiosk non richiede un nuovo container.

## Prove senza NAS

```sh
cd app && npm install && npm run mock        # HA, Synology e Google finti su :18100
HA_URL=http://127.0.0.1:18100/ha/api HA_TOKEN=x \
SYNO_URL=http://127.0.0.1:18100/dsm SYNO_ACCOUNT=a SYNO_PASSWORD=b \
GOOGLE_API_ROOT_URL=http://127.0.0.1:18100/ CALENDAR_ID=test \
DATA_DIR=./data npm start
```

## Note

- Il client Synology (`app/src/core/synology.js`) espone solo `photos.getRandom()` e `photos.status()`:
  se un giorno vorrai spostarlo in un servizio separato basta sostituire quel file.
- `data/` contiene segreti (`token.json`, `credentials.json`): sono esclusi da git e dall'immagine Docker.
- Il container si controlla da solo: l'healthcheck usa `/api/status`, che diventa 503 se una
  schermata non si rigenera.

## Se arrivi dai vecchi `home-kiosk` e `kindle-kiosk`

Ferma i due vecchi container (`home-kiosk` usava già la porta 8085), copia la sua cartella `data/`
dentro `kiosk-server/data/`, riunisci le variabili dei due `.env` e sposta l'elenco `HA_SENSORS`
del Kindle in `data/sensors.json`. I display vanno poi puntati ai nuovi indirizzi: il Raspberry usa
il nuovo `raspberry/aggiorna_agenda.sh`, il Kindle `http://<host>:8085/devices/kindle/current.png`.
`REFRESH_MINUTES` è diventato `REFRESH_MINUTES_CALENDAR`, `_BIRTHDAY` e `_DASHBOARD`.
