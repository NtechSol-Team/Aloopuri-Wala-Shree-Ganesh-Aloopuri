'use strict';

const path = require('node:path');
const { Notification } = require('electron');

const ICON = path.join(__dirname, '..', 'build', 'icon.png');

function notify(title, body, { silent = false } = {}) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: ICON, silent }).show();
}

const printSuccess = (description) => notify('Printed', description);
const printFailure = ({ orderNumber, error }) => notify('Print failed', `${orderNumber}: ${error}`, { silent: false });
const connected = () => notify('Print Agent', 'Connected to server.');
const disconnected = () => notify('Print Agent', 'Disconnected from server — retrying…');

module.exports = { notify, printSuccess, printFailure, connected, disconnected };
