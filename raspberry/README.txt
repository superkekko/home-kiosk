Lato Raspberry Pi (Visualizzazione) - kiosk basato su feh

1. Script di gestione
   Copia raspberry/aggiorna_agenda.sh in /home/USER/aggiorna_agenda.sh
   e rendilo eseguibile:  chmod +x /home/USER/aggiorna_agenda.sh
   (richiede jq:  sudo apt install jq)
   Lo script chiede le immagini a  http://<server>:8085/devices/<DEVICE_ID>/list  e le scarica da
   .../devices/<DEVICE_ID>/<file>. Di default SERVER_URL=http://192.168.0.101:8085 e
   DEVICE_ID=pi-agenda (l'id deve esistere in data/devices.json sul server); si possono
   cambiare con variabili d'ambiente, per esempio in cima al crontab.

2. Automazione e risparmio energetico  (crontab -e)
   Le due variabili in cima servono a wlr-randr, che da cron non trova la
   sessione Wayland (i valori vanno verificati sul tuo Pi: `echo $XDG_RUNTIME_DIR $WAYLAND_DISPLAY`).

   XDG_RUNTIME_DIR=/run/user/1000
   WAYLAND_DISPLAY=wayland-1
   */5 * * * * /home/USER/aggiorna_agenda.sh
   00 21 * * * wlr-randr --output HDMI-A-1 --off
   00 06 * * * wlr-randr --output HDMI-A-1 --on

   Il server rigenera le immagini ogni 5 minuti, quindi anche il Pi controlla ogni 5:
   il ritardo massimo scende da ~30 a ~10 minuti.

3. Autostart (~/.config/autostart/agenda.desktop)
   [Desktop Entry]
   Type=Application
   Name=Agenda
   Exec=/home/USER/aggiorna_agenda.sh

4. Pulsante fisico di spegnimento (tenuto premuto 1 secondo)
   Pulsante tra Pin 5 (GPIO 3) e Pin 6 (GND).

   NON usare `dtoverlay=gpio-shutdown`: non ha alcun tempo di pressione (genera un
   KEY_POWER al primo tocco e poi dipende da logind/desktop, che può ignorarlo).
   Se l'avevi messo, toglilo da /boot/firmware/config.txt (e annulla anche le modifiche
   a /etc/systemd/logind.conf: HandlePowerKey / PowerKeyIgnoreInhibited non servono più).

   Installazione (dalla cartella raspberry/ copiata sul Pi):
     sudo apt install python3-gpiozero python3-lgpio
     sudo cp pulsante-spegni.py /usr/local/bin/
     sudo chmod +x /usr/local/bin/pulsante-spegni.py
     sudo cp pulsante-spegni.service /etc/systemd/system/
     sudo systemctl daemon-reload
     sudo systemctl enable --now pulsante-spegni.service
     sudo reboot            (necessario se hai tolto il dtoverlay)

   Verifica:  systemctl status pulsante-spegni   -> "active (running)"
              Tocco breve (meno di 1 s): non succede nulla. Tenuto 1 s: il Pi si spegne.
   Per cambiare il tempo: Environment=HOLD_SECONDS=… in /etc/systemd/system/pulsante-spegni.service, poi
   sudo systemctl daemon-reload && sudo systemctl restart pulsante-spegni

   Riaccensione: dopo lo spegnimento, un nuovo tocco del pulsante (GPIO3 a massa)
   riaccende il Pi. È una funzione del Pi stesso e non dipende dall'overlay.

   Se non spegne:
     1. Il pulsante arriva al Pin 5/6?  pinctrl get 3   (o: raspi-gpio get 3)
        a pulsante rilasciato deve dire "hi", mentre lo tieni premuto "lo".
        Se non cambia, il problema è il cablaggio/pulsante, non il software.
     2. Il servizio legge il pulsante?  journalctl -u pulsante-spegni -f
        premendo devono comparire "pulsante premuto" e "pulsante rilasciato".
     3. Il servizio è attivo?  systemctl status pulsante-spegni
        Se parte ma va in errore sul pin, `dtoverlay=gpio-shutdown` è ancora in
        /boot/firmware/config.txt (occupa GPIO3): toglilo e riavvia.
