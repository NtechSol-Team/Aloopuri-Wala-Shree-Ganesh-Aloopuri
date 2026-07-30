import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { startOfIstDay } from '../../shared/utils/date';

/**
 * Live presence tracking for the developer console.
 *
 * State lives in memory (module-level Maps), NOT in the database: connects and
 * disconnects happen far too often to justify a write each, and none of it is
 * business data — a process restart legitimately means "nobody is connected
 * right now" anyway. The only DB write is one row per completed online span,
 * when a user's last connection closes for good.
 */

export interface ConnectionInfo {
  userId: string;
  name: string;
  role: UserRole;
  outletId: string | null;
}

export interface OnlineUser extends ConnectionInfo {
  onlineSince: string;
}

export interface ClosedInterval {
  userId: string;
  startedAt: Date;
  endedAt: Date;
}

/**
 * How long to wait after a user's last socket drops before calling the span
 * over. Navigating between the dashboard and POS layouts genuinely tears the
 * socket down and re-establishes it a moment later; without this grace period
 * every such navigation would split one real session into several fragments.
 */
const RECONNECT_GRACE_MS = 25_000;

const infoBySocket = new Map<string, ConnectionInfo>();
const socketsByUser = new Map<string, Set<string>>();
/**
 * The user's currently-open span. Holds its own copy of the identity so the
 * user still resolves during the reconnect grace window, when they have no
 * live socket to read a name off — otherwise they'd vanish from the live list
 * on every navigation while their time kept accruing, which is contradictory.
 */
const spans = new Map<string, { startedAt: Date; info: ConnectionInfo }>();
/** Pending "user went offline" timers, keyed by user — cancelled on reconnect. */
const closeTimers = new Map<string, NodeJS.Timeout>();

/**
 * Register a new connection. Returns true only when this makes a user newly
 * online (i.e. it's their first live socket and they weren't inside the
 * reconnect grace window) — the caller uses that to decide whether to
 * broadcast, so extra tabs never produce duplicate "came online" events.
 */
export function recordConnect(socketId: string, info: ConnectionInfo): boolean {
  infoBySocket.set(socketId, info);
  const sockets = socketsByUser.get(info.userId) ?? new Set<string>();
  sockets.add(socketId);
  socketsByUser.set(info.userId, sockets);

  // Reconnected inside the grace window: keep the original span running.
  const pending = closeTimers.get(info.userId);
  if (pending) {
    clearTimeout(pending);
    closeTimers.delete(info.userId);
    return false;
  }

  if (!spans.has(info.userId)) {
    spans.set(info.userId, { startedAt: new Date(), info });
    return true;
  }
  return false;
}

/**
 * Deregister a connection. When it was the user's last one, the span is not
 * closed immediately — `onClosed` fires only after RECONNECT_GRACE_MS passes
 * with no reconnect, and receives the completed interval to persist.
 */
export function recordDisconnect(socketId: string, onClosed: (interval: ClosedInterval) => void): void {
  const info = infoBySocket.get(socketId);
  infoBySocket.delete(socketId);
  if (!info) return;

  const sockets = socketsByUser.get(info.userId);
  sockets?.delete(socketId);
  if (sockets && sockets.size > 0) return; // other tabs still open — nothing to do
  socketsByUser.delete(info.userId);

  const span = spans.get(info.userId);
  if (!span) return;

  const timer = setTimeout(() => {
    closeTimers.delete(info.userId);
    // Re-check: a reconnect during the window clears this timer, but guard anyway.
    if (socketsByUser.has(info.userId)) return;
    spans.delete(info.userId);
    onClosed({ userId: info.userId, startedAt: span.startedAt, endedAt: new Date() });
  }, RECONNECT_GRACE_MS);
  // Don't hold the event loop open on shutdown for a pending presence timer.
  timer.unref?.();
  closeTimers.set(info.userId, timer);
}

/** Everyone with an open span right now, and when it began. */
export function listOnline(): OnlineUser[] {
  const out: OnlineUser[] = [];
  for (const { startedAt, info } of spans.values()) {
    out.push({ ...info, onlineSince: startedAt.toISOString() });
  }
  return out.sort((a, b) => a.onlineSince.localeCompare(b.onlineSince));
}

/**
 * Total active time per user for today, combining completed intervals from the
 * DB with any span still open in memory (so the numbers don't jump the moment
 * someone logs off). IST calendar day, matching the convention used across the API.
 */
export async function getTodaySummary() {
  const now = new Date();
  const dayStart = startOfIstDay(now);

  const grouped = await prisma.userActivityInterval.groupBy({
    by: ['userId'],
    where: { isDeleted: false, startedAt: { gte: dayStart } },
    _sum: { activeSeconds: true },
  });

  const totals = new Map<string, number>();
  for (const row of grouped) totals.set(row.userId, row._sum.activeSeconds ?? 0);

  // Fold in time accrued so far by anyone whose span is still open.
  for (const [userId, span] of spans) {
    const from = span.startedAt > dayStart ? span.startedAt : dayStart;
    const openSeconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
    totals.set(userId, (totals.get(userId) ?? 0) + openSeconds);
  }

  if (totals.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...totals.keys()] } },
    select: { id: true, name: true, role: true, outlet: { select: { name: true } } },
  });

  return users
    .map((u) => ({
      userId: u.id,
      name: u.name,
      role: u.role,
      outletName: u.outlet?.name ?? null,
      activeSeconds: totals.get(u.id) ?? 0,
      isOnline: spans.has(u.id),
    }))
    .sort((a, b) => b.activeSeconds - a.activeSeconds);
}

export const developerPresenceService = { listOnline, getTodaySummary };
