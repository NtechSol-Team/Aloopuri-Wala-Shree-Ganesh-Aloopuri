'use strict';

// Real-time order events, straight from the same Socket.IO layer the web app
// uses (apps/api/src/sockets/realtime.ts / events.ts) -- checked against the
// live server, not assumed:
//
//   - "new_order" is real and carries a full print-ready payload (items,
//     prices, outlet, GST flag) the instant an order lands. Mirrors
//     apps/web/components/orders/order-print-listener.tsx exactly.
//   - There is no "order_modified" or "order_cancelled" event today. The
//     closest real, live signal is "order_status_changed" ({orderId,
//     orderNumber, status, outletName, reason?}) -- cancelOrder() emits this
//     with status: 'CANCELLED' and the cancellation reason, which is what this
//     agent treats as the cancellation trigger. There is also no order-revision
//     concept anywhere in the schema (no version field), so nothing server-side
//     can ever fire a real "revised order" print yet.
//   - This agent still wires up literal 'order_modified' / 'order_cancelled'
//     listeners too, so it starts working immediately for free the day the
//     backend adds either one -- they're just dormant right now.
const { io } = require('socket.io-client');
const EventEmitter = require('node:events');
const configStore = require('./config-store');
const apiClient = require('./api-client');
const printerManager = require('./printer-manager');
const receiptBuilder = require('./receipt-builder');

class SocketClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.printedIds = new Set(); // dedup: `${orderId}:${kind}` -- guards a reconnect replay from double-printing
    this.modificationVersions = new Map(); // orderId -> count, best-effort fallback when a modified-order event carries no version of its own

    apiClient.on('token-refreshed', (token) => this._reauth(token));
    apiClient.on('session-expired', () => this._setStatus('auth-expired'));
  }

  start() {
    if (this.socket) return;
    const { serverUrl } = configStore.getConfig();
    if (!serverUrl || !apiClient.accessToken) {
      this._setStatus('disconnected');
      return;
    }
    this._setStatus('connecting');
    this.socket = io(serverUrl, {
      auth: { token: apiClient.accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });

    this.socket.on('connect', () => this._setStatus('connected'));
    this.socket.on('disconnect', () => this._setStatus('disconnected'));
    this.socket.on('connect_error', (err) => {
      console.error('[socket] connect_error', err.message);
      this._setStatus('disconnected');
    });

    this.socket.on('new_order', (msg) => this._handleNewOrder(msg?.data));
    this.socket.on('order_status_changed', (msg) => this._handleStatusChanged(msg?.data));
    // Dormant today (see file header) -- kept ready for when/if the backend adds them.
    this.socket.on('order_modified', (msg) => this._handleModified(msg?.data));
    this.socket.on('order_cancelled', (msg) => this._handleCancelled(msg?.data));
  }

  stop() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this._setStatus('disconnected');
  }

  /** A background token refresh replaces the handshake auth -- Socket.IO needs a fresh
   *  connection to actually use it, so reconnect. Near-instant on a healthy network. */
  _reauth(token) {
    if (!this.socket) return;
    this.socket.auth = { token };
    if (this.socket.connected) {
      this.socket.disconnect().connect();
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }

  async _handleNewOrder(data) {
    if (!data?.orderId) return;
    const key = `${data.orderId}:new`;
    if (this.printedIds.has(key)) return;
    this.printedIds.add(key);
    await this._print(receiptBuilder.buildNewOrderReceipt(data), `New order ${data.orderNumber} (${data.outletName})`);
  }

  async _handleStatusChanged(data) {
    if (!data?.orderId || data.status !== 'CANCELLED') return; // other transitions aren't a print trigger here
    await this._handleCancelled(data);
  }

  async _handleCancelled(data) {
    if (!data?.orderId) return;
    const key = `${data.orderId}:cancelled`;
    if (this.printedIds.has(key)) return;
    this.printedIds.add(key);
    try {
      const order = data.items ? data : await this._enrichWithOrderDetail(data);
      await this._print(receiptBuilder.buildCancelledOrderReceipt(order), `Cancelled order ${order.orderNumber} (${order.outletName})`);
    } catch (err) {
      this.emit('print-error', { orderNumber: data.orderNumber, error: err.message });
    }
  }

  async _handleModified(data) {
    if (!data?.orderId) return;
    const version = data.version ?? this._nextLocalVersion(data.orderId);
    try {
      const order = data.items ? data : await this._enrichWithOrderDetail(data);
      await this._print(receiptBuilder.buildModifiedOrderReceipt(order, version), `Revised order ${order.orderNumber} (${order.outletName})`);
    } catch (err) {
      this.emit('print-error', { orderNumber: data.orderNumber, error: err.message });
    }
  }

  _nextLocalVersion(orderId) {
    const next = (this.modificationVersions.get(orderId) ?? 1) + 1;
    this.modificationVersions.set(orderId, next);
    return next;
  }

  /** The socket payload for a status change carries no items -- fetch the order for a full slip. */
  async _enrichWithOrderDetail(data) {
    const order = await apiClient.getOrder(data.orderId);
    return {
      orderNumber: order.orderNumber,
      outletName: order.outlet?.name ?? data.outletName,
      isGstBill: order.isGstBill,
      orderDate: order.orderDate,
      reason: data.reason ?? null,
      items: (order.items ?? []).map((i) => ({
        name: i.product?.name ?? 'Item',
        unit: i.product?.unit?.name ?? '',
        qty: Number(i.confirmedQuantity ?? i.requestedQuantity ?? 0),
        price: Number(i.unitPriceSnapshot ?? i.product?.mrp ?? 0),
      })),
    };
  }

  async _print(lines, description) {
    try {
      const { paperWidth } = configStore.getConfig();
      const buffer = printerManager.buildEscPosBuffer(lines, { paperWidth });
      await printerManager.sendToConfiguredPrinter(buffer);
      this.emit('printed', description);
    } catch (err) {
      console.error('[print]', description, err);
      this.emit('print-error', { orderNumber: description, error: err.message });
    }
  }
}

module.exports = new SocketClient();
