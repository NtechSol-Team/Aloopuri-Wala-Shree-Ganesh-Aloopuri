# POS Terminal Setup — Silent Receipt Printing

The POS already prints a receipt **automatically after every sale**. Normally the browser shows a print popup first. The launcher in this folder removes that popup — receipts go straight to the printer.

## One-time setup on the counter computer

1. **Install the receipt printer** (connect USB, install its driver) and print a test page from the printer settings to confirm it works.
2. **Set it as the DEFAULT printer.**
   - **Windows:** Settings → Bluetooth & devices → Printers & scanners → your printer → *Set as default*. Also turn **off** "Let Windows manage my default printer".
   - **Mac:** System Settings → Printers & Scanners → *Default printer*.
3. **Set the paper size** in the printer driver to 80mm roll/receipt paper (often shown as "Roll Paper 80×297mm" or "72mm printable width").
4. **Copy this folder** to the counter computer and double-click the launcher:
   - **Windows:** `Start-POS-Windows.bat`
   - **Mac:** `Start-POS-Mac.command`

The POS opens in its own clean window. Log in once — it stays logged in for next time. From then on:

- Every completed sale prints the receipt **instantly, no popup**.
- **Reprint** (on the sale-complete screen and in Today's Sales) prints the same way.
- The **Item Summary report** (Today's Sales → Item Summary → Print Report) also prints silently.

## Troubleshooting

- **A print popup still appears** → close ALL Chrome windows completely, then start again using this launcher (the silent-print switch only works on a freshly started Chrome).
- **Receipt is cut off on the right side** → your printer likely uses 58mm paper, not 80mm. Tell the developer — the receipt width can be changed in one place.
- **Nothing prints** → check the receipt printer is the system **default** printer and is online (not paused).
- **Needs Google Chrome** (or Microsoft Edge on Windows). Install Chrome from <https://google.com/chrome>.

## Advanced

The launcher accepts a different URL as an argument, e.g. for local testing:

```
Start-POS-Windows.bat http://localhost:3000/pos
./Start-POS-Mac.command http://localhost:3000/pos
```
