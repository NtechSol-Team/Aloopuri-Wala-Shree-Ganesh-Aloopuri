'use strict';

const $ = (id) => document.getElementById(id);

function setMsg(el, text, kind) {
  el.textContent = text;
  el.className = 'msg' + (kind ? ` ${kind}` : '');
}

function setStatus(status) {
  const dot = $('statusDot');
  const text = $('statusText');
  dot.className = `dot ${status}`;
  const labels = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
    'auth-expired': 'Sign-in expired — please sign in again',
  };
  text.textContent = labels[status] || status;
}

async function loadPrinters(selected) {
  const select = $('printerName');
  select.innerHTML = '';
  const printers = await window.printAgent.listPrinters();
  if (!printers.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No printers found';
    opt.value = '';
    select.appendChild(opt);
    return;
  }
  for (const p of printers) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.isDefault ? `${p.name} (default)` : p.name;
    if (p.name === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

function togglePrinterFields(iface) {
  $('systemPrinterField').style.display = iface === 'system' ? '' : 'none';
  $('networkPrinterField').style.display = iface === 'network' ? '' : 'none';
  $('blePrinterField').style.display = iface === 'ble' ? '' : 'none';
  $('usbRawPrinterField').style.display = iface === 'usb-raw' ? '' : 'none';
}

async function init() {
  const cfg = await window.printAgent.getConfig();
  $('serverUrl').value = cfg.serverUrl || '';
  $('identifier').value = cfg.userIdentifier || '';
  $('printerInterface').value = cfg.printerInterface || 'system';
  $('printerNetworkAddress').value = cfg.printerNetworkAddress || '';
  $('bleDeviceName').value = cfg.bleDeviceName || '';
  $('paperWidth').value = String(cfg.paperWidth || 48);
  togglePrinterFields(cfg.printerInterface);
  await loadPrinters(cfg.printerName);

  const status = await window.printAgent.getStatus();
  setStatus(status);
  window.printAgent.onStatusChanged(setStatus);

  $('printerInterface').addEventListener('change', (e) => togglePrinterFields(e.target.value));
  $('refreshPrinters').addEventListener('click', () => loadPrinters($('printerName').value));

  // --- BLE printer picking ------------------------------------------------
  // Electron has no built-in Bluetooth chooser: the main process streams the
  // devices it discovers here, and the scan stays pending until one is chosen.
  window.printAgent.onBleDevices((devices) => {
    const sel = $('bleDevices');
    const previous = sel.value;
    sel.innerHTML = '';
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.deviceName;
      sel.appendChild(opt);
    }
    if (previous) sel.value = previous;
    $('bleDeviceList').style.display = devices.length ? '' : 'none';
    if (devices.length) setMsg($('bleMsg'), `Found ${devices.length} device(s). Pick your printer and press Use.`);
  });

  $('bleScan').addEventListener('click', async () => {
    const msg = $('bleMsg');
    $('bleScan').disabled = true;
    setMsg(msg, 'Scanning… make sure the printer is on and not connected to anything else.');
    try {
      const picked = await window.printAgent.bleScan(false);
      $('bleDeviceName').value = picked.name;
      $('bleDeviceList').style.display = 'none';
      setMsg(msg, `Connected to ${picked.name}. Test Print to confirm.`, 'ok');
    } catch (err) {
      const text = err && err.message ? err.message : String(err);
      setMsg(msg, /cancel|chooser/i.test(text) ? 'Scan cancelled.' : text, 'error');
    } finally {
      $('bleScan').disabled = false;
    }
  });

  $('bleUse').addEventListener('click', () => {
    const deviceId = $('bleDevices').value;
    if (!deviceId) return setMsg($('bleMsg'), 'Pick a device from the list first.', 'error');
    setMsg($('bleMsg'), 'Connecting…');
    window.printAgent.bleChoose(deviceId);
  });

  $('bleStop').addEventListener('click', () => {
    window.printAgent.bleCancel();
    $('bleDeviceList').style.display = 'none';
    setMsg($('bleMsg'), 'Scan stopped.');
  });

  $('saveConnection').addEventListener('click', async () => {
    const btn = $('saveConnection');
    const msg = $('connMsg');
    const serverUrl = $('serverUrl').value.trim();
    const identifier = $('identifier').value.trim();
    const password = $('password').value;
    if (!serverUrl) return setMsg(msg, 'Enter the server URL.', 'error');
    btn.disabled = true;
    setMsg(msg, 'Connecting…');
    try {
      await window.printAgent.saveServerUrl(serverUrl);
      if (identifier && password) {
        await window.printAgent.login(identifier, password);
        $('password').value = '';
      }
      setMsg(msg, 'Saved.', 'ok');
    } catch (err) {
      setMsg(msg, err?.message || String(err), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('signOut').addEventListener('click', async () => {
    await window.printAgent.logout();
    $('identifier').value = '';
    $('password').value = '';
    setMsg($('connMsg'), 'Signed out.', 'ok');
  });

  $('savePrinter').addEventListener('click', async () => {
    const msg = $('printerMsg');
    try {
      await window.printAgent.savePrinter({
        printerInterface: $('printerInterface').value,
        printerName: $('printerName').value,
        printerNetworkAddress: $('printerNetworkAddress').value.trim(),
        paperWidth: Number($('paperWidth').value),
      });
      setMsg(msg, 'Saved.', 'ok');
    } catch (err) {
      setMsg(msg, err?.message || String(err), 'error');
    }
  });

  $('testPrint').addEventListener('click', async () => {
    const btn = $('testPrint');
    const msg = $('printerMsg');
    btn.disabled = true;
    setMsg(msg, 'Printing…');
    try {
      await window.printAgent.testPrint();
      setMsg(msg, 'Test slip sent.', 'ok');
    } catch (err) {
      setMsg(msg, err?.message || String(err), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('openBtSettings').addEventListener('click', () => window.printAgent.openBluetoothPairing());

  $('detectBt').addEventListener('click', async () => {
    const btn = $('detectBt');
    const msg = $('btMsg');
    btn.disabled = true;
    setMsg(msg, 'Looking for paired printers not set up yet…');
    try {
      const candidates = await window.printAgent.detectBluetoothPrinters();
      const select = $('btPort');
      select.innerHTML = '';
      if (!candidates.length) {
        $('btCandidates').style.display = 'none';
        setMsg(msg, 'Nothing new found. Pair it in Bluetooth Settings first, or it may already be installed — check Printer above.', 'error');
        return;
      }
      for (const c of candidates) {
        const opt = document.createElement('option');
        opt.value = c.port;
        opt.textContent = `${c.name} (${c.port})`;
        select.appendChild(opt);
      }
      $('btCandidates').style.display = '';
      setMsg(msg, `Found ${candidates.length}. Name it and install below.`, 'ok');
    } catch (err) {
      setMsg(msg, err?.message || String(err), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('installBt').addEventListener('click', async () => {
    const btn = $('installBt');
    const msg = $('btMsg');
    const portName = $('btPort').value;
    const printerName = $('btPrinterName').value.trim();
    if (!portName) return setMsg(msg, 'Detect a paired printer first.', 'error');
    if (!printerName) return setMsg(msg, 'Give the printer a name.', 'error');
    btn.disabled = true;
    setMsg(msg, 'Installing… Windows may ask for admin permission now.');
    try {
      await window.printAgent.installBluetoothPrinter(portName, printerName);
      setMsg(msg, `Installed as "${printerName}". Select it under Printer above.`, 'ok');
      $('btCandidates').style.display = 'none';
      await loadPrinters(printerName);
      $('printerInterface').value = 'system';
      togglePrinterFields('system');
    } catch (err) {
      setMsg(msg, err?.message || String(err), 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

init();
