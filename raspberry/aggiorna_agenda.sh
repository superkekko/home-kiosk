#!/bin/bash
# Kiosk agenda: scarica le immagini dal server e le mostra con feh.
# - Non cancella nulla finché i nuovi file non sono stati scaricati con successo
#   (se il server è spento il display continua a mostrare l'ultima immagine).
# - feh resta sempre aperto e ricarica i file da solo (-R); viene riavviato
#   solo se cambia l'elenco delle immagini (es. compare/sparisce birthday.png).
# Lo script usa funzioni di bash: se lanciato con `sh script.sh` si rilancia con bash
[ -n "$BASH_VERSION" ] || exec bash "$0" "$@"

export DISPLAY=:0

SERVER_URL="http://192.168.0.101:8084"
# Id del dispositivo in data/devices.json sul server: il server riconosce questo
# display solo dall'indirizzo che chiede (/devices/<id>/...)
DEVICE_ID="pi-agenda"
DEVICE_URL=$SERVER_URL"/devices/"$DEVICE_ID
TARGET_DIR="/home/francesco/display"
# Log: un messaggio per ogni anomalia (server spento, download fallito...), con data e ora.
# Si tengono solo le ultime LOG_MAX_LINES righe, così il file non cresce.
LOG_FILE="/home/francesco/aggiorna_agenda.log"
LOG_MAX_LINES="200"
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"
    if [ "$(wc -l < "$LOG_FILE")" -gt "$LOG_MAX_LINES" ]; then
        tail -n "$LOG_MAX_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
}

if ! command -v jq >/dev/null 2>&1; then
    log "ERRORE: il pacchetto jq è necessario (sudo apt install jq)"
    exit 1
fi

mkdir -p "$TARGET_DIR"
# Cartella temporanea sullo stesso filesystem: lo spostamento è atomico
TMP_DIR=$(mktemp -d "$TARGET_DIR/.tmp.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

# 1. Elenco file dal server (es. ["birthday-1.png","calendar.png"])
FILES_JSON=$(curl -sf --max-time 10 "$DEVICE_URL/list") || {
    log "Server non raggiungibile ($DEVICE_URL/list): mantengo le immagini attuali"; exit 0; }
mapfile -t FILES < <(echo "$FILES_JSON" | jq -r '.[]' 2>/dev/null)
if [ ${#FILES[@]} -eq 0 ]; then
    log "Elenco immagini vuoto o non valido: mantengo quelle attuali"; exit 0
fi

# 2. Scarica tutto nella cartella temporanea; al primo errore non tocca nulla
for f in "${FILES[@]}"; do
    case "$f" in */*|.*) continue ;; esac   # solo nomi di file semplici
    wget -q --timeout=15 -O "$TMP_DIR/$f" "$DEVICE_URL/$f" || {
        log "Download fallito ($f): mantengo le immagini attuali"; exit 0; }
done

# 3. Sostituisce i file e rimuove quelli non più presenti sul server
OLD_LIST=$(cd "$TARGET_DIR" && ls -1 *.png 2>/dev/null | sort)
NEW_LIST=$(cd "$TMP_DIR" && ls -1 *.png 2>/dev/null | sort)
for f in $OLD_LIST; do
    grep -qxF "$f" <<< "$NEW_LIST" || rm -f "$TARGET_DIR/$f"
done
mv -f "$TMP_DIR"/*.png "$TARGET_DIR"/

# 4. (Ri)avvia feh solo se serve
if [ "$OLD_LIST" != "$NEW_LIST" ] || ! pgrep -x feh > /dev/null; then
    pkill -x feh > /dev/null 2>&1
    # Con più immagini ruotano ogni 10 secondi; -R 60 ricarica i file aggiornati
    setsid feh -F -Y -x --zoom fill -Z --hide-pointer -D 10 -R 60 "$TARGET_DIR" > /dev/null 2>&1 &
fi