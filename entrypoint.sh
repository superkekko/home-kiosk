#!/bin/sh
set -e
# Le librerie di sistema (cairo/pango/font per `canvas`) e `npm ci` vengono
# installate AL PRIMO AVVIO, non in fase di build: sul NAS la rete non è
# raggiungibile durante `docker build`, ma lo è a runtime (network_mode: host).
# Gli `node_modules` stanno in un volume, le librerie di sistema nel livello
# scrivibile del container: per questo i controlli sono due e indipendenti.
STATE=/usr/src/app/.state
LOCK_HASH=$(md5sum package-lock.json | cut -d' ' -f1)

syslibs_ok() {
  command -v fc-match >/dev/null 2>&1 \
    && [ -f /etc/fonts/fonts.conf ] \
    && fc-match "DejaVu Sans" >/dev/null 2>&1 \
    && ldconfig -p | grep -q 'libcairo.so.2' \
    && ldconfig -p | grep -q 'libpangocairo-1.0.so.0'
}

# node_modules vanno bene se corrispondono al package-lock attuale e canvas si carica davvero
modules_ok() {
  [ -f "$STATE/lock_hash" ] \
    && [ "$(cat "$STATE/lock_hash")" = "$LOCK_HASH" ] \
    && node -e "import('canvas').then(()=>process.exit(0),()=>process.exit(1))" 2>/dev/null
}

if ! syslibs_ok; then
  echo "Installazione librerie di sistema (cairo, pango, font)..."
  apt-get update
  apt-get install -y --no-install-recommends \
      build-essential python3 pkg-config \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      fontconfig fonts-dejavu-core
  fc-cache -f
  rm -rf /var/lib/apt/lists/*
  rm -f "$STATE/lock_hash"   # canvas va ricompilato contro le librerie appena installate
fi

if ! modules_ok; then
  echo "Installazione dipendenze npm..."
  mkdir -p "$STATE"
  rm -f "$STATE/lock_hash"
  npm ci --omit=dev
  echo "$LOCK_HASH" > "$STATE/lock_hash"
fi

if ! syslibs_ok || ! modules_ok; then
  echo "❌ Installazione incompleta: controlla la connettività di rete del NAS durante l'avvio del container."
  exit 1
fi

echo "Dipendenze verificate, avvio."
exec node index.js
