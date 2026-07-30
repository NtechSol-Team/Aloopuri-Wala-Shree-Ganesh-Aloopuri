/**
 * The business runs entirely in India, so the API treats Asia/Kolkata as *the*
 * timezone — not the server's. A droplet provisioned in UTC would otherwise roll
 * "today" over at 05:30 IST, putting the first five and a half hours of every
 * morning's sales, expenses and attendance into the previous day.
 *
 * Setting process.env.TZ makes every bare `new Date()`, `getHours()`,
 * `setHours(0,0,0,0)` and date-fns call in the process work in IST. Import this
 * module before anything that touches dates — `config/env` does, and env is the
 * root of the import graph, so it lands first no matter which entrypoint runs.
 *
 * Two things this deliberately does NOT cover, handled separately:
 *   - Postgres bucketing (`date_trunc`) — see `AT TIME ZONE` in the raw queries.
 *   - Bare "YYYY-MM-DD" request params — JS parses those as UTC regardless of
 *     TZ, so see `istDate` in shared/utils/date.ts.
 */
export const IST_TZ = 'Asia/Kolkata';

/** Fixed +05:30. India has no DST, so this never varies. */
export const IST_OFFSET_MINUTES = 330;

process.env.TZ = IST_TZ;
