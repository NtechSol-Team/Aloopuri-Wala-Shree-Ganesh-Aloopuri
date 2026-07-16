import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  unit: string;
  mrp: number;
  taxPercent: number;
  quantity: number;
  discount: number; // line-level amount
}

export interface HeldBill {
  id: string;
  items: CartItem[];
  billDiscount: number;
  customerName: string;
  at: string;
}

interface CartState {
  items: CartItem[];
  billDiscount: number;
  customerName: string;
  customerPhone: string;
  held: HeldBill[];
  addItem: (p: { productId: string; name: string; unit: string; mrp: number; taxPercent: number }) => void;
  setQty: (productId: string, qty: number) => void;
  setItemDiscount: (productId: string, discount: number) => void;
  removeItem: (productId: string) => void;
  setBillDiscount: (v: number) => void;
  setCustomer: (name: string, phone: string) => void;
  clear: () => void;
  hold: () => void;
  resume: (id: string) => void;
}

export const usePosCart = create<CartState>((set, get) => ({
  items: [],
  billDiscount: 0,
  customerName: '',
  customerPhone: '',
  held: [],
  addItem: (p) =>
    set((s) => {
      const existing = s.items.find((i) => i.productId === p.productId);
      if (existing) return { items: s.items.map((i) => (i.productId === p.productId ? { ...i, quantity: i.quantity + 1 } : i)) };
      return { items: [...s.items, { ...p, quantity: 1, discount: 0 }] };
    }),
  setQty: (productId, qty) =>
    set((s) => ({ items: qty <= 0 ? s.items.filter((i) => i.productId !== productId) : s.items.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)) })),
  setItemDiscount: (productId, discount) => set((s) => ({ items: s.items.map((i) => (i.productId === productId ? { ...i, discount: Math.max(0, discount) } : i)) })),
  removeItem: (productId) => set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
  setBillDiscount: (v) => set({ billDiscount: Math.max(0, v) }),
  setCustomer: (customerName, customerPhone) => set({ customerName, customerPhone }),
  clear: () => set({ items: [], billDiscount: 0, customerName: '', customerPhone: '' }),
  hold: () =>
    set((s) => {
      if (!s.items.length) return s;
      const bill: HeldBill = { id: crypto.randomUUID(), items: s.items, billDiscount: s.billDiscount, customerName: s.customerName, at: new Date().toISOString() };
      return { held: [...s.held, bill], items: [], billDiscount: 0, customerName: '', customerPhone: '' };
    }),
  resume: (id) => {
    const bill = get().held.find((b) => b.id === id);
    if (!bill) return;
    set((s) => ({ items: bill.items, billDiscount: bill.billDiscount, customerName: bill.customerName, held: s.held.filter((b) => b.id !== id) }));
  },
}));

/** Compute cart totals (mirrors the server-side math). */
export function cartTotals(items: CartItem[], billDiscount: number) {
  let subTotal = 0;
  let itemDiscount = 0;
  let tax = 0;
  for (const i of items) {
    const gross = i.mrp * i.quantity;
    const taxable = Math.max(0, gross - i.discount);
    subTotal += gross;
    itemDiscount += i.discount;
    // GST is included in the MRP (B2C counter pricing): extract it, don't add it on
    // top. Must mirror the server (pos.service.ts) exactly or the Charge amount and
    // the recorded sale would disagree.
    tax += i.taxPercent > 0 ? (taxable * i.taxPercent) / (100 + i.taxPercent) : 0;
  }
  // Tax already sits inside the prices, so the total is just price minus discounts.
  const grandTotal = Math.max(0, subTotal - itemDiscount - billDiscount);
  return { subTotal, itemDiscount, billDiscount, tax, grandTotal };
}
