'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// contextIsolation stays on (Electron's recommended default) -- the settings
// window is the only UI surface and it only ever talks to our own main
// process, never loads remote content, but there's no reason to hand it raw
// Node/ipcRenderer access when this narrow bridge is all it needs.
contextBridge.exposeInMainWorld('printAgent', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveServerUrl: (serverUrl) => ipcRenderer.invoke('config:save-server', serverUrl),
  login: (identifier, password) => ipcRenderer.invoke('config:login', { identifier, password }),
  logout: () => ipcRenderer.invoke('config:logout'),
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  savePrinter: (settings) => ipcRenderer.invoke('printer:save', settings),
  testPrint: () => ipcRenderer.invoke('printer:test'),
  getStatus: () => ipcRenderer.invoke('status:get'),
  onStatusChanged: (cb) => {
    const handler = (_event, status) => cb(status);
    ipcRenderer.on('status:changed', handler);
    return () => ipcRenderer.removeListener('status:changed', handler);
  },
});
