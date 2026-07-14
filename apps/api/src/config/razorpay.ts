import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from './env';

export const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/**
 * The Razorpay SDK rejects with a plain object ({ statusCode, error: { code,
 * description } }), not an Error — so `err.message` is undefined. Dig the human
 * message out of whichever shape we got.
 */
export function razorpayErrorMessage(err: unknown): string {
  const e = err as { error?: { description?: string; reason?: string }; message?: string; statusCode?: number };
  return (
    e?.error?.description ??
    e?.error?.reason ??
    e?.message ??
    (e?.statusCode ? `payment gateway returned HTTP ${e.statusCode}` : 'payment gateway unreachable')
  );
}

/** Verify the checkout signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');
  return safeEqual(expected, params.signature);
}

/** Verify a webhook signature: HMAC_SHA256(rawBody, webhook_secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return safeEqual(expected, signature);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
