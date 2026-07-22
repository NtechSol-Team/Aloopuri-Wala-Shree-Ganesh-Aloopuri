'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getSocket } from '@/lib/socket';
import {
  Search, Plus, Minus, Trash2, Pause, Play, ArrowLeft, Wifi, WifiOff, Receipt,
  ChefHat, ReceiptText, Power, Star, Keyboard, X, ShoppingCart, Printer,
  ShoppingBag, LogOut, Banknote, QrCode, SplitSquareHorizontal, Move, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useLogout } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useCurrentSession, useOpenSession, usePosProducts, useCreateSale, useReorderPosProducts,
  type PosProduct, type PosTxn, type CreateTxnPayload,
} from '@/hooks/usePos';
import { usePosCart, cartTotals, type CartItem } from '@/store/pos-cart.store';
import { productImageSrc } from '@/lib/menu-images';
import { enqueueSale, flushQueue, queueSize } from '@/lib/offline-queue';
import { beepAdd, beepError, beepSuccess } from '@/lib/beep';
import { SuccessOverlay } from '@/components/pos/success-overlay';
import { CartLineDialog } from '@/components/pos/cart-line-dialog';
import { EodDialog } from '@/components/pos/eod-dialog';
import { TxnsDrawer } from '@/components/pos/txns-drawer';
import { PrinterSettingsDialog } from '@/components/printer-settings-dialog';

/**
 * Vibrant per-item colour, hashed off the product id, so the grid reads like a
 * colourful menu board (the client's old POS look) instead of a wall of look-
 * alike tiles. Each entry is a gradient background that fills a no-photo tile
 * AND tints the name bar, giving every item one consistent identity colour.
 * All shades are dark enough that bold white text sits legibly on top.
 */
const CARD_COLORS = [
  'from-rose-500 to-rose-700',
  'from-orange-500 to-orange-700',
  'from-amber-500 to-amber-700',
  'from-lime-500 to-lime-700',
  'from-emerald-500 to-emerald-700',
  'from-teal-500 to-teal-700',
  'from-cyan-500 to-cyan-700',
  'from-sky-500 to-sky-700',
  'from-blue-500 to-blue-700',
  'from-indigo-500 to-indigo-700',
  'from-violet-500 to-violet-700',
  'from-fuchsia-500 to-fuchsia-700',
  'from-pink-500 to-pink-700',
  'from-red-500 to-red-700',
];
function cardColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return CARD_COLORS[Math.abs(h) % CARD_COLORS.length];
}

type PayMode = 'CASH' | 'UPI' | 'SPLIT';

const PAY_MODES: Array<{ key: PayMode; label: string; icon: typeof Banknote }> = [
  { key: 'CASH', label: 'Cash', icon: Banknote },
  { key: 'UPI', label: 'UPI', icon: QrCode },
  { key: 'SPLIT', label: 'Split', icon: SplitSquareHorizontal },
];

export default function PosPage() {
  const { data: session, isLoading } = useCurrentSession();
  if (isLoading) return <div className="flex h-full items-center justify-center"><Skeleton className="h-40 w-96" /></div>;
  if (!session) return <OpenSessionScreen />;
  return <PosTerminal sessionId={session.id} sessionNumber={session.sessionNumber} />;
}

// ─────────────────────────────── Open session ───────────────────────────────
function OpenSessionScreen() {
  const open = useOpenSession();
  const [cash, setCash] = useState(2000);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Receipt className="h-7 w-7" /></div>
          <h1 className="text-page-heading font-bold">Open POS Session</h1>
          <p className="text-body text-muted-foreground">Count the drawer before you start selling.</p>
        </div>
        <label className="text-body font-medium">Opening cash in drawer</label>
        <Input type="number" value={cash} onChange={(e) => setCash(Number(e.target.value))} className="mt-1.5 h-14 text-center text-2xl font-bold" />
        <div className="mt-2 flex gap-2">
          {[1000, 2000, 5000].map((v) => (
            <button key={v} onClick={() => setCash(v)} className={cn('flex-1 rounded-md border py-1.5 text-caption font-semibold', cash === v ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>
              {formatINR(v)}
            </button>
          ))}
        </div>
        <Button size="lg" className="mt-5 h-12 w-full" loading={open.isPending} onClick={() => open.mutate(cash, { onError: (e) => toast.error(apiErrorMessage(e)) })}>
          Start Selling
        </Button>
      </div>
      <Button asChild variant="ghost"><Link href="/"><ArrowLeft className="h-4 w-4" /> Back to Dashboard</Link></Button>
    </div>
  );
}

// ─────────────────────────────── POS terminal ───────────────────────────────
function PosTerminal({ sessionId, sessionNumber }: { sessionId: string; sessionNumber: string }) {
  const { data: products, isLoading } = usePosProducts();
  const cashierName = useAuthStore((s) => s.user?.name);
  // Only the Main Owner arranges the menu grid — an outlet's menu is owner-managed
  // and may be shared, so outlet tills are read-only (no Arrange mode).
  const isOwner = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const logout = useLogout();
  const qc = useQueryClient();
  const cart = usePosCart();
  const totals = cartTotals(cart.items, cart.billDiscount);
  const sale = useCreateSale();
  const reorder = useReorderPosProducts();
  const [payMode, setPayMode] = useState<PayMode>('CASH');
  const [split, setSplit] = useState({ cash: 0, card: 0, upi: 0 });
  const splitTotal = split.cash + split.card + split.upi;

  // Keep the default even split (all-UPI) in sync with the live total — as
  // items are added it should track the bill, not the amount from before
  // the last item was scanned.
  useEffect(() => {
    setSplit({ cash: 0, card: 0, upi: totals.grandTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.grandTotal]);

  /**
   * Arranging is an explicit mode, not something armed during normal selling.
   *
   * It used to be press-and-hold: every card was a dnd-kit sortable, so every
   * touch anywhere on the grid was intercepted by a drag sensor holding a 2s
   * timer. On the shop's Android tablet that swallowed taps outright — a real
   * finger drifts a few pixels while tapping, and once it passed the sensor's
   * 8px tolerance the touch was cancelled and never became a click, so the item
   * silently didn't get added. (A mouse never drifts, which is why it only
   * showed up on the tablet.) The non-passive touch listeners it attached on
   * every press also made the grid feel laggy.
   *
   * Now the selling path has no drag machinery at all — a tap is just a tap —
   * and dnd-kit is only mounted while the Arrange toggle is on.
   */
  const [arranging, setArranging] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Short hold, so a quick swipe still scrolls the grid while arranging.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [eodOpen, setEodOpen] = useState(false);
  const [txnsOpen, setTxnsOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [successTxn, setSuccessTxn] = useState<PosTxn | null>(null);
  const [qtyBuffer, setQtyBuffer] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<CartItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Focus the search box only where a physical keyboard is likely (a device with
   * a fine pointer). On a touch tablet, programmatic focus pops the on-screen
   * keyboard — which used to appear on load and after every sale, covering the
   * screen — so there we leave focus alone until the cashier taps the field.
   */
  const focusSearchSoft = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches) {
      searchRef.current?.focus();
    }
  };

  // Desktop convenience: land in the search box on open. Skipped on touch devices
  // (see focusSearchSoft) so the soft keyboard doesn't cover the product grid.
  useEffect(() => { focusSearchSoft(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dialogOpen = eodOpen || txnsOpen || logoutOpen || !!successTxn || !!editingLine;

  // Midnight auto-rollover: the till this terminal was using just got auto-closed
  // and replaced with a fresh one server-side. Swap over instantly so an
  // unattended overnight terminal doesn't sell against a now-closed session.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => {
      toast('New day started — session refreshed', { icon: '🌙' });
      void qc.invalidateQueries({ queryKey: ['pos', 'session'] });
    };
    socket.on('pos_session_rollover', handler);
    return () => { socket.off('pos_session_rollover', handler); };
  }, [qc]);

  // Online/offline detection + background sync.
  useEffect(() => {
    setOnline(navigator.onLine);
    setPendingSync(queueSize());
    const onOnline = async () => {
      setOnline(true);
      const n = await flushQueue();
      if (n) toast.success(`Synced ${n} offline sale(s)`);
      setPendingSync(queueSize());
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    (products ?? []).forEach((p) => map.set(p.category.id, p.category.name));
    const hasPopular = (products ?? []).some((p) => p.popular);
    return [
      { id: 'all', name: 'All' },
      ...(hasPopular ? [{ id: 'popular', name: '★ Popular' }] : []),
      ...[...map].map(([id, name]) => ({ id, name })),
    ];
  }, [products]);

  const filtered = useMemo(
    () =>
      (products ?? []).filter(
        (p) =>
          (activeCat === 'all' || (activeCat === 'popular' ? p.popular : p.category.id === activeCat)) &&
          (search === '' || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())),
      ),
    [products, activeCat, search],
  );
  // Quantity of each product currently in the bill — cards show a green badge
  // with the count so the cashier sees at a glance what's already been added.
  const cartQtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of cart.items) m.set(i.menuItemId, (m.get(i.menuItemId) ?? 0) + i.quantity);
    return m;
  }, [cart.items]);

  // Arranging only makes sense on a stable list — not the dynamic ★ Popular
  // view, and not a search result subset.
  const canReorder = isOwner && activeCat !== 'popular' && search.trim() === '';
  // Leaving that stable list (searching, or switching to ★ Popular) drops us
  // back to selling rather than stranding the terminal in arrange mode.
  useEffect(() => { if (!canReorder) setArranging(false); }, [canReorder]);
  const isArranging = arranging && canReorder;

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = filtered.map((p) => p.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const moved = arrayMove(filtered, from, to);
    // Reassign the same set of displayOrder slots this view already occupies,
    // so rearranging inside one tab never shifts other tabs' items.
    const slots = filtered.map((p) => p.displayOrder).sort((a, b) => a - b);
    const updates = moved.map((p, i) => ({ id: p.id, displayOrder: slots[i] }));
    reorder.mutate(updates, { onError: () => toast.error('Could not save the new order') });
  };

  /** Add a product honoring the typed-ahead quantity buffer, with feedback. */
  const addProduct = (p: PosProduct) => {
    if (p.trackInventory && p.stock !== null && p.stock <= 0) { beepError(); toast.error(`${p.name} is out of stock`); return; }
    const buffered = parseFloat(qtyBuffer);
    const existing = cart.items.find((i) => i.menuItemId === p.id);
    cart.addItem({ menuItemId: p.id, name: p.name, unit: p.unit, mrp: Number(p.mrp), taxPercent: Number(p.taxPercent) });
    if (!Number.isNaN(buffered) && buffered > 0) cart.setQty(p.id, (existing?.quantity ?? 0) + buffered);
    setQtyBuffer('');
    beepAdd();
    setFlashId(p.id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 350);
  };
  // Identity-stable handler for the memoized cards: without it every render
  // hands each of the ~30 cards a fresh closure and the memo never skips work.
  const addProductRef = useRef(addProduct);
  addProductRef.current = addProduct;
  const onCardAdd = useCallback((p: PosProduct) => addProductRef.current(p), []);
  // While arranging, a tap is a drag handle — not an "add to bill".
  const noopAdd = useCallback(() => {}, []);

  /** Barcode/SKU fast path: Enter in search adds the exact or only match. */
  const onSearchEnter = () => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = (products ?? []).find((p) => p.sku.toLowerCase() === q);
    const target = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (target) { addProduct(target); setSearch(''); } else { beepError(); }
  };

  const completeSale = (payload: { paymentMode: PayMode; cashReceived?: number; split?: { cash: number; card: number; upi: number } }) => {
    const full: CreateTxnPayload = {
      sessionId,
      clientUuid: crypto.randomUUID(),
      orderType: cart.orderType,
      billDiscount: cart.billDiscount,
      items: cart.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, discount: i.discount })),
      ...payload,
    };
    if (!navigator.onLine) {
      enqueueSale({ ...full, soldAt: new Date().toISOString() });
      setPendingSync(queueSize());
      toast.success('Saved offline — will sync when back online');
      cart.clear();
      setPayMode('CASH');
      setCartSheetOpen(false);
      return;
    }
    sale.mutate(full, {
      onSuccess: (res) => {
        beepSuccess();
        cart.clear();
        setPayMode('CASH');
        setCartSheetOpen(false);
        setSuccessTxn(res);
      },
      onError: (e) => { beepError(); toast.error(apiErrorMessage(e)); },
    });
  };

  /** Charge now completes the sale directly using whichever mode is selected
   *  above the button — there's no separate confirm step. */
  const handleCharge = () => {
    if (cart.items.length === 0 || sale.isPending) return;
    if (payMode === 'SPLIT' && Math.abs(splitTotal - totals.grandTotal) > 0.01) { toast.error('Split must equal the total'); return; }
    completeSale({
      paymentMode: payMode,
      cashReceived: payMode === 'CASH' ? totals.grandTotal : undefined,
      split: payMode === 'SPLIT' ? split : undefined,
    });
  };

  // Global shortcuts: F2 search · F4 sales · F8 hold · F9 pay · digits = qty buffer.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (dialogOpen) return;
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'F4') { e.preventDefault(); setTxnsOpen(true); return; }
      if (e.key === 'F8') { e.preventDefault(); cart.hold(); return; }
      if (e.key === 'F9') { e.preventDefault(); handleCharge(); return; }
      const inInput = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (e.key === 'Escape') { setQtyBuffer(''); if (!inInput) setSearch(''); return; }
      if (inInput) return;
      if (/^[0-9.]$/.test(e.key)) setQtyBuffer((b) => (e.key === '.' && b.includes('.') ? b : (b + e.key).slice(0, 6)));
      else if (e.key === 'Backspace') setQtyBuffer((b) => b.slice(0, -1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, cart, payMode, split, totals.grandTotal]);

  const popular = (products ?? []).filter((p) => p.popular).slice(0, 8);

  /** Session header + held bills + cart lines + totals/charge — shared by the
   *  desktop panel and the mobile sheet. Kept as a JSX value, NOT an inline
   *  component: an inline `const X = () => …` gets a new identity every render,
   *  which makes React unmount + rebuild the whole panel DOM on each keystroke —
   *  visibly sluggish on the shop's Android tablet. */
  const cartPanelBody = (
    <>
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption text-muted-foreground">Session {sessionNumber}{cashierName ? ` · ${cashierName}` : ''}</p>
            <p className="hidden text-label font-semibold lg:block">Current Bill</p>
          </div>
          <div className="flex gap-1">
            <Button asChild variant="ghost" size="icon" title="Kitchen board"><Link href="/pos/kitchen"><ChefHat className="h-5 w-5" /></Link></Button>
            <Button variant="ghost" size="icon" title="Today's sales (F4)" onClick={() => setTxnsOpen(true)}><ReceiptText className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" title="Printer settings" onClick={() => setPrinterOpen(true)}><Printer className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" title="Hold bill (F8)" onClick={cart.hold}><Pause className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" title="End of day" onClick={() => setEodOpen(true)}><Power className="h-5 w-5 text-danger" /></Button>
            {/* Cashiers never see the dashboard header, so this is their only
                way out. Confirmed, so a mis-tap mid-service can't sign them out. */}
            <Button variant="ghost" size="icon" title="Sign out" onClick={() => setLogoutOpen(true)}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </div>

      {cart.held.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-border bg-surface p-2">
          {cart.held.map((h) => (
            <button key={h.id} onClick={() => cart.resume(h.id)} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-caption font-medium">
              <Play className="h-3 w-3 text-primary" /> {h.items.length} items · {formatINR(cartTotals(h.items, h.billDiscount).grandTotal)}
              {h.orderType === 'PARCEL' && <ShoppingBag className="h-3 w-3 text-warning" />}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {cart.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
            <Receipt className="h-8 w-8" />
            <p className="text-body">Tap products to add them</p>
            <p className="text-caption">Tip: type a quantity first, then tap</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.items.map((i) => (
              <SwipeToDeleteRow key={i.menuItemId} onDelete={() => cart.removeItem(i.menuItemId)}>
                <div className="border border-border">
                  <button className="flex w-full items-center justify-between p-2.5 text-left" onClick={() => setEditingLine(i)}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{i.name}</p>
                      <p className="text-caption text-muted-foreground">
                        {i.quantity} × {formatINR(i.mrp)}
                        {i.discount > 0 && <span className="text-success"> · −{formatINR(i.discount)}</span>}
                      </p>
                    </div>
                    <span className="ml-2 font-bold">{formatINR(Math.max(0, i.mrp * i.quantity - i.discount))}</span>
                  </button>
                  <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => cart.setQty(i.menuItemId, i.quantity - 1)}><Minus className="h-4 w-4" /></Button>
                      <span className="w-10 text-center font-bold">{i.quantity}</span>
                      <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => cart.setQty(i.menuItemId, i.quantity + 1)}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => cart.removeItem(i.menuItemId)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                </div>
              </SwipeToDeleteRow>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <div className="mb-2 space-y-1 text-body">
          <Row label="Sub-total" value={formatINR(totals.subTotal)} />
          {totals.itemDiscount > 0 && <Row label="Item discounts" value={`−${formatINR(totals.itemDiscount)}`} className="text-success" />}
          {/* Prices are GST-inclusive — this is a breakdown of tax already inside
              the Sub-total above, not an amount added to it. Labelled "(incl.)"
              so it doesn't read as Sub-total + Tax = Charge (it doesn't). */}
          <Row label="GST (incl.)" value={formatINR(totals.tax)} className="text-muted-foreground" />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bill discount</span>
            <Input type="number" className="h-8 w-24 text-right" value={cart.billDiscount} onChange={(e) => cart.setBillDiscount(Number(e.target.value))} />
          </div>
        </div>

        {/* Payment mode + Parcel live right on the panel now — Charge below
            completes the sale immediately, there's no separate confirm dialog. */}
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          {PAY_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setPayMode(m.key)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border-2 py-2 text-caption font-semibold transition-colors',
                payMode === m.key ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              <m.icon className="h-4 w-4" />
              {m.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => cart.setOrderType(cart.orderType === 'PARCEL' ? 'DINE_IN' : 'PARCEL')}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border-2 py-2 text-caption font-semibold transition-colors',
              cart.orderType === 'PARCEL' ? 'border-warning bg-warning/10 text-warning' : 'border-border text-muted-foreground hover:border-warning/40',
            )}
          >
            <ShoppingBag className="h-4 w-4" />
            Parcel
          </button>
        </div>

        {payMode === 'UPI' && (
          <p className="mb-2 rounded-lg bg-surface p-2.5 text-center text-caption text-muted-foreground">
            Scan the counter QR and confirm <b className="text-foreground">{formatINR(totals.grandTotal)}</b> received.
          </p>
        )}

        {payMode === 'SPLIT' && (
          <div className="mb-2 space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5">
              {(['cash', 'card', 'upi'] as const).map((k) => (
                <div key={k} className="space-y-0.5">
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">{k}</label>
                  <Input type="number" className="h-9 text-right text-caption font-semibold" value={split[k]} onChange={(e) => setSplit({ ...split, [k]: Number(e.target.value) })} />
                </div>
              ))}
            </div>
            <p className={cn('text-right text-caption font-semibold', Math.abs(splitTotal - totals.grandTotal) < 0.01 ? 'text-success' : 'text-danger')}>
              Split total {formatINR(splitTotal)} / {formatINR(totals.grandTotal)}
            </p>
          </div>
        )}

        <Button className="h-14 w-full text-lg font-bold" disabled={cart.items.length === 0} loading={sale.isPending} onClick={handleCharge}>
          Charge {formatINR(totals.grandTotal)}
          <span className="ml-2 hidden rounded bg-primary-foreground/20 px-1.5 text-caption font-semibold lg:inline">F9</span>
        </Button>
      </div>
    </>
  );

  return (
    <div className="relative grid h-full grid-cols-1 lg:grid-cols-[1fr_440px]">
      {/* LEFT: products */}
      <div className="flex h-full flex-col overflow-hidden lg:border-r lg:border-border">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b border-border bg-card p-3">
          <Button asChild variant="ghost" size="icon"><Link href="/"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Scan barcode or search…"
              className="h-11 pl-10 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearchEnter(); } }}
            />
          </div>
          {qtyBuffer && (
            <button onClick={() => setQtyBuffer('')} className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-2 font-bold text-primary-foreground">
              {qtyBuffer} × <X className="h-3.5 w-3.5" />
            </button>
          )}
          <span className={cn('hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-caption font-medium sm:flex', online ? 'text-success' : 'text-danger')}>
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {online ? 'Online' : 'Offline'}
            {pendingSync > 0 && ` · ${pendingSync} queued`}
          </span>
          {canReorder && (
            <button
              onClick={() => setArranging((v) => !v)}
              title={arranging ? 'Finish arranging' : 'Rearrange the menu tiles'}
              className={cn(
                'shrink-0 rounded-md p-2.5 transition-colors',
                arranging ? 'bg-warning text-white' : 'text-muted-foreground hover:bg-surface',
              )}
              aria-label={arranging ? 'Finish arranging' : 'Arrange items'}
            >
              <Move className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => setCartSheetOpen(true)}
            className="relative shrink-0 rounded-md p-2.5 text-foreground hover:bg-surface lg:hidden"
            aria-label="View cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {cart.items.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cart.items.length}
              </span>
            )}
          </button>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-card p-2 scrollbar-thin">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={cn(
                'whitespace-nowrap rounded-full px-3.5 py-1.5 text-body font-semibold transition-colors',
                activeCat === c.id ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Arrange mode — makes it obvious the grid isn't selling right now. */}
        {isArranging && (
          <div className="flex items-center justify-between gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2">
            <span className="text-body font-semibold text-warning">
              Arrange mode — drag tiles to reorder. Tapping won&apos;t add to the bill.
            </span>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setArranging(false)}>
              <Check className="h-4 w-4" /> Done
            </Button>
          </div>
        )}

        {/* Quick picks */}
        {!isArranging && popular.length > 0 && activeCat === 'all' && !search && (
          <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface/60 p-2 scrollbar-thin">
            {popular.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                disabled={p.trackInventory && p.stock !== null && p.stock <= 0}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-body font-medium shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {p.name}
                <span className="font-bold text-primary">{formatINR(p.mrp)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Product grid — a phone shows 3-up and a tablet 4-5-up with minimal
            scrolling; images keep each item instantly recognisable. Cards sized
            up a step from before (one fewer column per breakpoint from sm up)
            so both the photo and the name read more comfortably.
            Selling renders plain cards (no drag sensors — see `arranging`);
            the sortable grid is only mounted while Arrange mode is on. */}
        <div data-pos-scroller className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto p-2.5 pb-24 scrollbar-thin sm:grid-cols-3 lg:grid-cols-4 lg:pb-2.5 xl:grid-cols-5">
          {isLoading ? (
            Array.from({ length: 18 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] h-auto" />)
          ) : filtered.length === 0 ? (
            <p className="col-span-full py-16 text-center text-body text-muted-foreground">No products match &ldquo;{search}&rdquo;</p>
          ) : isArranging ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filtered.map((p) => p.id)} strategy={rectSortingStrategy}>
                {filtered.map((p) => (
                  <SortableProductCard key={p.id} product={p} flashing={false} cartQty={cartQtyById.get(p.id) ?? 0} onAdd={noopAdd} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            filtered.map((p) => <ProductCard key={p.id} product={p} flashing={flashId === p.id} cartQty={cartQtyById.get(p.id) ?? 0} onAdd={onCardAdd} />)
          )}
        </div>

        {/* Shortcut hints */}
        <div className="hidden items-center gap-4 border-t border-border bg-card px-4 py-1.5 text-caption text-muted-foreground lg:flex">
          <Keyboard className="h-3.5 w-3.5" />
          <span><b>F2</b> Search</span>
          <span><b>F4</b> Sales</span>
          <span><b>F8</b> Hold</span>
          <span><b>F9</b> Pay</span>
          <span>Type a number, then tap a product to set quantity</span>
        </div>
      </div>

      {/* RIGHT: cart — static panel on desktop */}
      <div className="hidden h-full min-h-0 flex-col overflow-hidden bg-card lg:flex">
        {cartPanelBody}
      </div>

      {/* Mobile: floating "view cart / charge" bar, shown once something's in the bill */}
      {cart.items.length > 0 && !cartSheetOpen && (
        <button
          onClick={() => setCartSheetOpen(true)}
          className="fixed inset-x-3 z-30 flex items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-nav lg:hidden"
          style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <span className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-5 w-5" /> {cart.items.length} item{cart.items.length > 1 ? 's' : ''}</span>
          <span className="font-bold">{formatINR(totals.grandTotal)} · View Cart</span>
        </button>
      )}

      {/* Mobile: cart bottom sheet */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', cartSheetOpen ? 'pointer-events-auto' : 'pointer-events-none')}>
        <div
          className={cn('absolute inset-0 bg-black/40 transition-opacity duration-200 ease-smooth', cartSheetOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setCartSheetOpen(false)}
          aria-hidden="true"
        />
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex max-h-[88vh] supports-[height:100dvh]:max-h-[88dvh] flex-col rounded-t-2xl bg-card shadow-nav transition-transform duration-200 ease-smooth',
            cartSheetOpen ? 'translate-y-0' : 'translate-y-full',
          )}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between border-b border-border px-3 pt-2">
            <div className="mx-auto h-1 w-10 rounded-full bg-border" />
          </div>
          <div className="flex items-center justify-between px-3 pt-1">
            <p className="text-label font-semibold">Current Bill</p>
            <button onClick={() => setCartSheetOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface" aria-label="Close cart">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            {cartPanelBody}
          </div>
        </div>
      </div>

      <CartLineDialog item={editingLine} onClose={() => setEditingLine(null)} onQty={cart.setQty} onDiscount={cart.setItemDiscount} />
      <EodDialog open={eodOpen} onOpenChange={setEodOpen} sessionId={sessionId} />
      <TxnsDrawer open={txnsOpen} onOpenChange={setTxnsOpen} sessionId={sessionId} cashierName={cashierName ?? undefined} />
      <PrinterSettingsDialog open={printerOpen} onOpenChange={setPrinterOpen} />
      <SuccessOverlay txn={successTxn} cashierName={cashierName ?? undefined} onDone={() => { setSuccessTxn(null); focusSearchSoft(); }} />

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out{cashierName ? ` ${cashierName}` : ''}?</DialogTitle>
            <DialogDescription>
              {cart.items.length > 0
                ? `The current bill (${cart.items.length} item${cart.items.length === 1 ? '' : 's'}) will be lost. Hold it first if you want to come back to it.`
                : 'The till stays open — signing out only ends your session on this device.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLogoutOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={logout.isPending} onClick={() => logout.mutate()}>
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** dnd bindings the sortable wrapper passes down to the card's root button. */
type DragBindings = {
  setNodeRef: (node: HTMLElement | null) => void;
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
  style: CSSProperties;
  isDragging: boolean;
};

/** Wraps ProductCard with drag-to-reorder behavior (press-hold 2s / mouse-drag).
 *  memo'd so cart typing / other cards' changes don't re-render the whole grid. */
const SortableProductCard = memo(function SortableProductCard(props: { product: PosProduct; flashing: boolean; cartQty: number; onAdd: (p: PosProduct) => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: props.product.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  return <ProductCardInner {...props} drag={{ setNodeRef, attributes, listeners, style, isDragging }} />;
});

/**
 * Finger travel we still forgive as a tap *provided the list never moved*.
 * Generous on purpose: a fat-finger press on a tablet easily wanders this far.
 */
const TAP_SLOP_PX = 40;
/** A press that lingers longer than this was a hold, not a quick tap. */
const TAP_MAX_MS = 700;

/**
 * Tap handling that survives a slightly sloppy finger.
 *
 * Chrome hands a touch to the scroller as soon as it drifts ~10px and then
 * never fires `click` — so on the shop's tablet a cashier tapping quickly
 * would see the item silently not get added, while a mouse (which never
 * drifts) worked every time. `touchend` still fires in that case, so we
 * decide "was that a tap?" ourselves and fall back to `click` for mouse and
 * keyboard.
 *
 * The real question isn't how far the finger moved, it's *did the menu move
 * under it*: if the grid didn't scroll, the finger merely wobbled and the
 * cashier meant to tap; if it did scroll, they were scrolling and must not
 * get a surprise item on the bill. Distance is kept only as a sanity bound,
 * measured as the furthest the finger ever got from where it started (not
 * start-to-end), so a scroll finishing back near its origin can't sneak past.
 */
function useTapToAdd(add: () => void, dragging: boolean) {
  const start = useRef<{ x: number; y: number; t: number; scroller: Element | null; scrollTop: number } | null>(null);
  const maxDist = useRef(0);
  const handledTouch = useRef(false);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const scroller = (e.currentTarget as HTMLElement).closest('[data-pos-scroller]');
      start.current = {
        x: t.clientX, y: t.clientY, t: Date.now(),
        scroller, scrollTop: scroller?.scrollTop ?? 0,
      };
      maxDist.current = 0;
      handledTouch.current = false;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const s = start.current;
      const t = e.touches[0];
      if (!s || !t) return;
      maxDist.current = Math.max(maxDist.current, Math.hypot(t.clientX - s.x, t.clientY - s.y));
    },
    onTouchEnd: () => {
      const s = start.current;
      start.current = null;
      // While arranging, dnd-kit owns the gesture — don't also add to the bill.
      if (!s || dragging) return;
      const scrolled = (s.scroller?.scrollTop ?? 0) !== s.scrollTop;
      if (!scrolled && maxDist.current <= TAP_SLOP_PX && Date.now() - s.t <= TAP_MAX_MS) {
        handledTouch.current = true; // suppress the click Chrome may still send
        add();
      }
    },
    onClick: () => {
      if (handledTouch.current) { handledTouch.current = false; return; }
      add();
    },
  };
}

/**
 * Image-first product tile — the fastest way for a cashier to recognise an item.
 * A food photo fills the top square; price sits on a high-contrast chip over it;
 * the availability/qty state is a corner badge. Items with no photo (uploaded or
 * matched) fall back to a coloured initial tile so the grid still reads cleanly.
 */
function ProductCardInner({ product, flashing, cartQty, onAdd, drag }: { product: PosProduct; flashing: boolean; cartQty: number; onAdd: (p: PosProduct) => void; drag?: DragBindings }) {
  const out = product.trackInventory && product.stock !== null && product.stock <= 0;
  const low = product.trackInventory && product.stock !== null && !out && product.stock <= 5;
  const inCart = cartQty > 0;
  const [imgFailed, setImgFailed] = useState(false);
  const imgSrc = imgFailed ? null : productImageSrc(product);
  const tap = useTapToAdd(() => onAdd(product), !!drag);
  // This item's identity colour — fills the no-photo tile and tints the name bar.
  const color = cardColor(product.id);

  return (
    <button
      ref={drag?.setNodeRef}
      {...(drag?.attributes ?? {})}
      {...(drag?.listeners ?? {})}
      {...tap}
      disabled={out}
      // manipulation opts out of double-tap-to-zoom, which is what makes a
      // WebView sit on a tap for ~300ms before delivering the click.
      style={{ ...drag?.style, touchAction: drag ? undefined : 'manipulation' }}
      className={cn(
        // self-start: full (unclamped) names can make some cards taller than
        // their row-mates — this keeps each card its own height instead of
        // every card in the row stretching to match the tallest one.
        // transition-transform (not transition-all): on a low-end tablet
        // animating every property is a needless per-frame style recalc.
        'group relative flex flex-col self-start overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-transform hover:shadow-md active:scale-[0.98] disabled:opacity-45',
        // In the bill → green frame so it's obvious at a glance what's added.
        inCart ? 'border-success ring-[1.5px] ring-success' : 'border-border',
        flashing && !inCart && 'ring-2 ring-primary',
        // Lifted while being dragged into a new position.
        drag?.isDragging && 'scale-105 opacity-80 shadow-xl ring-2 ring-primary',
        out && 'cursor-not-allowed',
      )}
    >
      {/* Image / fallback — 4:3 keeps the card compact so more fit per screen. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={product.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className={cn('h-full w-full object-cover transition-transform duration-200 group-hover:scale-105', out && 'grayscale')}
          />
        ) : (
          <div className={cn('relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br', color)}>
            {/* Big translucent initial as a watermark, so a photo-less tile still
                has some texture and isn't a flat block of colour. */}
            <span className="absolute -right-2 -top-3 select-none text-7xl font-black leading-none text-white/15">
              {product.name.replace(/[^\p{L}\p{N}]/u, '').charAt(0) || '•'}
            </span>
            <span className="text-4xl font-black text-white drop-shadow">
              {product.name.replace(/[^\p{L}\p{N}]/u, '').charAt(0) || '•'}
            </span>
          </div>
        )}

        {product.popular && (
          <Star className="absolute left-1 top-1 h-3.5 w-3.5 fill-amber-400 text-amber-400 drop-shadow" />
        )}

        {/* Top-right: how many are in the bill, else the stock/availability chip. */}
        {inCart ? (
          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 text-caption font-extrabold text-white shadow">
            {cartQty}
          </span>
        ) : (
          <span className={cn(
            'absolute right-1 top-1 rounded-full px-1.5 py-px text-[9px] font-bold shadow-sm',
            out ? 'bg-danger text-white' : low ? 'bg-warning text-white' : 'bg-white/90 text-muted-foreground',
          )}>
            {!product.trackInventory ? 'Always' : out ? 'Out' : `${product.stock} ${product.unit}`}
          </span>
        )}

        {/* Price chip — dark for contrast over any photo. */}
        <span className="absolute bottom-1 left-1 rounded-md bg-black/75 px-1.5 py-px text-[12.5px] font-extrabold text-white">
          {formatINR(product.mrp)}
        </span>
      </div>

      {/* Name — the item's identity colour so every card reads distinctly (not a
          uniform black bar). No fixed height, so a long name grows the bar
          instead of being clipped. */}
      <div className={cn('bg-gradient-to-r px-1.5 py-1.5', color)}>
        <p className="whitespace-normal break-words text-[16px] font-extrabold leading-tight text-white drop-shadow-sm">{product.name}</p>
      </div>
    </button>
  );
}

// Only re-render a card when its own product/qty/flash state changes — not on
// every keystroke or unrelated cart update across the ~30-card grid.
const ProductCard = memo(ProductCardInner);

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', className)}>{value}</span>
    </div>
  );
}

/**
 * Wraps a cart line so swiping it left deletes it — the delete button stays too,
 * this is just the faster gesture cashiers expect from any mobile cart (Swiggy/
 * Zomato/Amazon all do this). A red "delete" bed sits behind the row and is
 * revealed as it's dragged; releasing past ~40% of the row's width commits the
 * removal (row flies the rest of the way off), otherwise it snaps back — so a
 * short, accidental drag while scrolling never deletes anything.
 *
 * Pointer events (not touch-only) so it works with a mouse on the Windows till
 * too. `touch-action: pan-y` lets the list's own vertical scroll keep working;
 * we only take over once a drag is confirmed to be more horizontal than vertical.
 */
function SwipeToDeleteRow({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const gesture = useRef<{ x: number; y: number; locked: 'h' | 'v' | null } | null>(null);

  const commitDelete = () => {
    setAnimating(true);
    setDragX(-(widthRef.current || 400));
    setTimeout(onDelete, 160);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    widthRef.current = rowRef.current?.offsetWidth ?? 0;
    gesture.current = { x: e.clientX, y: e.clientY, locked: null };
    setAnimating(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      g.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (g.locked === 'h') rowRef.current?.setPointerCapture(e.pointerId);
    }
    if (g.locked === 'h') {
      e.preventDefault();
      setDragX(Math.min(0, dx)); // left only — this is a delete swipe, not a drawer
    }
  };

  const endGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.locked !== 'h') return;
    const threshold = (widthRef.current || 400) * 0.4;
    if (-dragX >= threshold) commitDelete();
    else { setAnimating(true); setDragX(0); }
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-0 flex items-center justify-end bg-danger pr-4">
        <Trash2 className="h-5 w-5 text-white" />
      </div>
      <div
        ref={rowRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        style={{ transform: `translateX(${dragX}px)`, transition: animating ? 'transform 180ms ease-out' : 'none', touchAction: 'pan-y' }}
        className="relative select-none bg-card"
      >
        {children}
      </div>
    </div>
  );
}
