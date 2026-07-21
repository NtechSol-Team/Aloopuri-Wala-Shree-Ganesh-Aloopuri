import { create } from 'zustand';

export interface CartItem {
  menuItemId: string;
  name: string;
  unit: string;
  mrp: number;
  taxPercent: number;
  quantity: number;
  discount: number; // line-level amount
}

export type OrderType = 'DINE_IN' | 'PARCEL';

export interface HeldBill {
  id: string;
  items: CartItem[];
  billDiscount: number;
  customerName: string;
  orderType: OrderType;
  at: string;
}

interface CartState {
  items: CartItem[];
  billDiscount: number;
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  held: HeldBill[];
  addItem: (p: { menuItemId: string; name: string; unit: string; mrp: number; taxPercent: number }) => void;
  setQty: (menuItemId: string, qty: number) => void;
  setItemDiscount: (menuItemId: string, discount: number) => void;
  removeItem: (menuItemId: string) => void;
  setBillDiscount: (v: number) => void;
  setCustomer: (name: string, phone: string) => void;
  setOrderType: (t: OrderType) => void;
  clear: () => void;
  hold: () => void;
  resume: (id: string) => void;
}

export const usePosCart = create<CartState>((set, get) => ({
  items: [],
  billDiscount: 0,
  customerName: '',
  customerPhone: '',
  orderType: 'DINE_IN',
  held: [],
  addItem: (p) =>
    set((s) => {
      const existing = s.items.find((i) => i.menuItemId === p.menuItemId);
      if (existing) return { items: s.items.map((i) => (i.menuItemId === p.menuItemId ? { ...i, quantity: i.quantity + 1 } : i)) };
      return { items: [...s.items, { ...p, quantity: 1, discount: 0 }] };
    }),
  setQty: (menuItemId, qty) =>
    set((s) => ({ items: qty <= 0 ? s.items.filter((i) => i.menuItemId !== menuItemId) : s.items.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: qty } : i)) })),
  setItemDiscount: (menuItemId, discount) => set((s) => ({ items: s.items.map((i) => (i.menuItemId === menuItemId ? { ...i, discount: Math.max(0, discount) } : i)) })),
  removeItem: (menuItemId) => set((s) => ({ items: s.items.filter((i) => i.menuItemId !== menuItemId) })),
  setBillDiscount: (v) => set({ billDiscount: Math.max(0, v) }),
  setCustomer: (customerName, customerPhone) => set({ customerName, customerPhone }),
  setOrderType: (orderType) => set({ orderType }),
  // Dine In is the reset default — a held/resumed bill carries its own choice,
  // but a brand-new sale always starts from the common case.
  clear: () => set({ items: [], billDiscount: 0, customerName: '', customerPhone: '', orderType: 'DINE_IN' }),
  hold: () =>
    set((s) => {
      if (!s.items.length) return s;
      const bill: HeldBill = {
        id: crypto.randomUUID(), items: s.items, billDiscount: s.billDiscount,
        customerName: s.customerName, orderType: s.orderType, at: new Date().toISOString(),
      };
      return { held: [...s.held, bill], items: [], billDiscount: 0, customerName: '', customerPhone: '', orderType: 'DINE_IN' };
    }),
  resume: (id) => {
    const bill = get().held.find((b) => b.id === id);
    if (!bill) return;
    set((s) => ({
      items: bill.items, billDiscount: bill.billDiscount, customerName: bill.customerName,
      orderType: bill.orderType, held: s.held.filter((b) => b.id !== id),
    }));
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
