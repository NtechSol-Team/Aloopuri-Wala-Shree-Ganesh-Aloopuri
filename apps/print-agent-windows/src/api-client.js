'use strict';

// Auth against the real API: there is no separate "device token" concept in
// this backend (checked apps/api/src/sockets/realtime.ts and auth.service.ts) --
// a Socket.IO connection authenticates with the exact same short-lived (15
// minute) access token a browser session uses, minted via POST /auth/login and
// renewed via POST /auth/refresh. So "configured authentication token" for this
// agent really means "logged-in session, kept alive in the background" -- the
// agent logs in once, stores only the refresh token (encrypted, see
// config-store.js), and proactively refreshes well inside the 15-minute window
// so the socket's handshake token never goes stale.
//
// The account used to log in must be SUPER_ADMIN or GODOWN_MANAGER -- those are
// the only roles the server puts in the admin room that order events broadcast
// to (see Room.ADMIN in sockets/events.ts). A franchise-owner or cashier login
// will connect fine but never receive new_order.
const axios = require('axios');
const EventEmitter = require('node:events');
const configStore = require('./config-store');

// The access token this API mints is good for 15 minutes (apps/api/src/config/env.ts
// JWT_ACCESS_TTL). Refresh with plenty of runway to spare -- the server's own grace window for a
// just-rotated token is 30s, so refreshing every 10 minutes leaves a wide margin
// even if the agent is asleep (laptop suspend) for a few minutes around the tick.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

class ApiClient extends EventEmitter {
  constructor() {
    super();
    this.accessToken = null;
    this.refreshTimer = null;
  }

  get baseUrl() {
    const url = configStore.getConfig().serverUrl;
    if (!url) throw new Error('Server URL is not configured');
    return `${url}/api/v1`;
  }

  /** Email/user-code + password login. Persists the refresh token on success. */
  async login(identifier, password) {
    const { data } = await axios.post(`${this.baseUrl}/auth/login`, { identifier, password }, { timeout: 15000 });
    const { accessToken, refreshToken, user } = data.data;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'GODOWN_MANAGER') {
      throw new Error(
        `${user.name} is signed in as ${user.role.replace('_', ' ')}. Order print events only reach a Super Admin or Godown/Warehouse Manager login.`,
      );
    }
    this.accessToken = accessToken;
    configStore.saveRefreshToken(refreshToken, identifier);
    this._scheduleRefresh();
    return { accessToken, user };
  }

  /** Restores a session from the saved refresh token at startup, without asking for a password again. */
  async resumeSession() {
    const refreshToken = configStore.loadRefreshToken();
    if (!refreshToken) return null;
    const accessToken = await this._refreshWith(refreshToken);
    return accessToken;
  }

  async _refreshWith(refreshToken) {
    const { data } = await axios.post(`${this.baseUrl}/auth/refresh`, { refreshToken }, { timeout: 15000 });
    const next = data.data;
    this.accessToken = next.accessToken;
    // Rotation: the server issues a new refresh token on every use and expects
    // the old one to stop circulating -- store the fresh one immediately, same
    // as the web app does.
    configStore.saveRefreshToken(next.refreshToken, configStore.getConfig().userIdentifier);
    this._scheduleRefresh();
    return this.accessToken;
  }

  _scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this._refreshLoop();
    }, REFRESH_INTERVAL_MS);
    // Doesn't hold the process open on its own — a stray timer must never be the
    // reason the app can't quit from the tray.
    if (this.refreshTimer.unref) this.refreshTimer.unref();
  }

  async _refreshLoop() {
    const refreshToken = configStore.loadRefreshToken();
    if (!refreshToken) return;
    try {
      const accessToken = await this._refreshWith(refreshToken);
      this.emit('token-refreshed', accessToken);
    } catch (err) {
      // A refresh can only fail like this if the session was actually revoked
      // (password changed, logged out elsewhere, or the refresh token simply
      // expired after 30 days of the agent never being restarted) -- not on a
      // network blip, since axios itself would reject before the server ever
      // gets to judge the token. Ask to sign in again rather than retry forever.
      console.error('[api] background token refresh failed', err.message);
      this.emit('session-expired', err);
    }
  }

  stop() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.accessToken = null;
  }

  logout() {
    this.stop();
    configStore.clearLogin();
  }

  /** Full order detail (with items) for a print that needs more than the socket payload carried. */
  async getOrder(orderId) {
    if (!this.accessToken) throw new Error('Not signed in');
    const { data } = await axios.get(`${this.baseUrl}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      timeout: 15000,
    });
    return data.data;
  }
}

module.exports = new ApiClient();
