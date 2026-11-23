#!/usr/bin/env python3
"""Pulsante fisico (Pin 5 = GPIO3, Pin 6 = GND): tenuto premuto HOLD_SECONDS spegne il Pi.

Sostituisce `dtoverlay=gpio-shutdown`: legge il pin direttamente, senza passare
da logind/desktop (che possono ignorare l'evento). Ogni pressione viene scritta
nel journal: `journalctl -u pulsante-spegni -f`.
"""
import os
import subprocess
from signal import pause

from gpiozero import Button

GPIO_PIN = 3
HOLD_SECONDS = float(os.environ.get("HOLD_SECONDS", "1"))


def log(msg):
    print(msg, flush=True)


def poweroff():
    log(f"tenuto {HOLD_SECONDS:g} s: spengo")
    subprocess.run(["systemctl", "poweroff"], check=False)


def main():
    # pull_up=True: il pulsante collega GPIO3 a GND. bounce_time evita falsi contatti.
    button = Button(GPIO_PIN, pull_up=True, bounce_time=0.05, hold_time=HOLD_SECONDS)
    button.when_pressed = lambda: log("pulsante premuto")
    button.when_released = lambda: log("pulsante rilasciato")
    button.when_held = poweroff
    log(f"in ascolto su GPIO{GPIO_PIN}, spegnimento dopo {HOLD_SECONDS:g} s di pressione")
    pause()


if __name__ == "__main__":
    main()
