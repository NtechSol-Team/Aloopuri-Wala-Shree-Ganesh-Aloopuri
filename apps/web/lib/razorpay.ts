interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayConstructor {
  new (options: RazorpayCheckoutOptions): { open: () => void };
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckout(opts: {
  order: { orderId: string; amount: number; currency: string; keyId: string };
  customerName?: string;
  onSuccess: (r: RazorpayHandlerResponse) => void;
  onDismiss?: () => void;
}): Promise<boolean> {
  const ok = await loadScript();
  if (!ok || !window.Razorpay) return false;

  const rzp = new window.Razorpay({
    key: opts.order.keyId,
    amount: opts.order.amount,
    currency: opts.order.currency,
    order_id: opts.order.orderId,
    name: 'Surat Food Chain',
    description: 'Bill payment',
    prefill: { name: opts.customerName },
    theme: { color: '#3730A3' },
    handler: opts.onSuccess,
    modal: { ondismiss: opts.onDismiss },
  });
  rzp.open();
  return true;
}
