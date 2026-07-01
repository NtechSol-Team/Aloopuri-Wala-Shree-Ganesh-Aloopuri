import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../utils/AppError';
import { isValidGstin, gstinStateCode, stateNameFromCode } from '../utils/gst';

export interface GstLookupResult {
  gstin: string;
  valid: boolean;
  stateCode: string | null;
  stateName: string | null;
  legalName: string | null;
  tradeName: string | null;
  address: string | null;
  status: string | null;
  source: 'gstzen' | 'validation';
  note?: string;
}

interface GstzenAddress { addr?: string }
interface GstzenCompany {
  legal_name?: string;
  trade_name?: string;
  company_status?: string;
  state_info?: { code?: string; name?: string };
  pradr?: GstzenAddress;
  adadr?: GstzenAddress[];
}
interface GstzenResponse {
  status?: number; // 1 = call ok, 0 = error (bad key / subscription)
  valid?: boolean;
  message?: string;
  company_details?: GstzenCompany;
}

/**
 * Resolve a GSTIN. Always validates locally (format + checksum) and derives the
 * state. If GSTzen is configured, enriches with legal/trade name + address via
 * the GSTIN Validator API (POST + `Token` header).
 */
export async function lookupGstin(rawGstin: string): Promise<GstLookupResult> {
  const gstin = rawGstin.toUpperCase().trim();
  if (!isValidGstin(gstin)) throw AppError.badRequest('Invalid GSTIN (format/checksum failed)', undefined, 'gstin');

  const stateCode = gstinStateCode(gstin);
  const base: GstLookupResult = {
    gstin, valid: true, stateCode, stateName: stateNameFromCode(stateCode),
    legalName: null, tradeName: null, address: null, status: null, source: 'validation',
  };

  if (!env.GSTZEN_API_KEY) return base;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(env.GSTZEN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Token: env.GSTZEN_API_KEY },
      body: JSON.stringify({ gstin }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = (await res.json()) as GstzenResponse;

    // status 0 → provider error (invalid key, subscription exhausted/expired).
    if (json.status === 0) {
      logger.warn({ message: json.message, gstin }, 'GSTzen provider error');
      return { ...base, note: json.message ?? 'GSTzen lookup unavailable' };
    }
    // status 1 + valid false → GSTN has no such active taxpayer.
    if (json.valid === false) {
      return { ...base, note: 'GSTIN not found on the GST portal' };
    }

    const c = json.company_details ?? {};
    const address = c.pradr?.addr ?? c.adadr?.[0]?.addr ?? null;
    return {
      ...base,
      source: 'gstzen',
      legalName: c.legal_name ?? null,
      tradeName: c.trade_name ?? null,
      address,
      status: c.company_status ?? null,
      stateCode: c.state_info?.code ?? base.stateCode,
      stateName: c.state_info?.name ?? base.stateName,
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, gstin }, 'GSTzen lookup failed; validation-only');
    return { ...base, note: 'Could not reach GSTzen' };
  }
}
