import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Single source of truth: the monorepo-root .env. When the API runs (tsx/node)
// the cwd is apps/api, so the root is two levels up.
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
// Also allow a local apps/api/.env to override during isolated runs.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Interface to bind. Set to 127.0.0.1 behind a reverse proxy so the API is not
  // exposed on a public interface; containers need the 0.0.0.0 default.
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
  RAZORPAY_KEY_SECRET: z.string().default('placeholder_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('placeholder_webhook_secret'),

  // GST: home state for CGST/SGST vs IGST, and GSTzen GSTIN-lookup provider.
  HOME_STATE_CODE: z.string().default('24'), // Gujarat
  GSTZEN_API_KEY: z.string().default(''),
  GSTZEN_API_URL: z.string().default('https://my.gstzen.in/api/gstin-validator/'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(5),

  KPI_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  MATERIALIZED_VIEW_REFRESH_CRON: z.string().default('*/15 * * * *'),
  SUPPLIER_BILL_REMINDER_CRON: z.string().default('0 8 * * *'), // daily 8am: flags bills due in 10 or 5 days

  // Company letterhead details for invoice PDFs. GSTIN blank by default — only
  // printed on GST invoices once the business's actual registered GSTIN is set.
  COMPANY_NAME: z.string().default('Shree Ganesh Aloopuri'),
  COMPANY_TAGLINE: z.string().default('Surat Food Chain'),
  COMPANY_ADDRESS: z.string().default(''),
  COMPANY_PHONE: z.string().default(''),
  COMPANY_GSTIN: z.string().default(''),
  // Terms & Conditions printed at the foot of every sales invoice — pipe-separated,
  // one term per segment, numbered automatically. Best-effort default transcribed from
  // the shop's paper order form; VERIFY THE WORDING (money amounts especially) before
  // relying on it, then override via env instead of editing code.
  COMPANY_TERMS: z.string().default(
    'Orders must be placed at least 2 days in advance with advance payment.'
    + '|If payment is not completed on time, 5% GST will be added to the bill.'
    + '|Any changes to the order must be informed in advance.'
    + '|For pickup after 10 PM, please inform in advance — staff may not be available to verify/hand over material after that time.'
    + '|Cancelling a confirmed order will incur a 10% cancellation charge.',
  ),

  // Passphrase that unlocks the hidden developer window (outlet management).
  // Set your own in production; the default only exists so local dev works.
  // requireDeveloperKey fails closed, so an empty value blocks all outlet writes.
  DEVELOPER_KEY: z.string().default('Developer'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast at startup — never boot with an invalid configuration.
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
