#!/bin/bash
# ============================================================
#  Shree Ganesh Aloopuri — POS Terminal (silent receipt print)
#  Receipts print straight to the DEFAULT printer, no popup.
#  First set your receipt printer as the default printer:
#  System Settings → Printers & Scanners → Default printer.
# ============================================================

POS_URL="${1:-https://scfc-web.onrender.com/pos}"
PROFILE="$HOME/Library/Application Support/SCFC-POS-Profile"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$CHROME" ]; then
  echo "Google Chrome is not installed. Please install it from https://google.com/chrome"
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

exec "$CHROME" --kiosk-printing --app="$POS_URL" --user-data-dir="$PROFILE"
