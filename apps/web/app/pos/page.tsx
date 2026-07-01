'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Search, Plus, Minus, Trash2, X, Pause, Play, ArrowLeft, Wifi, WifiOff, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useCurrentSession, useOpenSession, useCloseSession, usePosProducts, useCreateSale, useSessionSummary, type PosProduct, type CreateTxnPayload } from '@/hooks/usePos';
import { usePosCart, cartTotals } from '@/store/pos-cart.store';
import { enqueueSale, flushQueue, queueSize } from '@/lib/offline-queue';

export default function PosPage() {
  const { data: session, isLoading } = useCurrentSession();
  if (isLoading) return <div className="flex h-full items-center justify-center"><Skeleton className="h-40 w-96" /></div>;
  if (!session) return <OpenSessionScreen />;
  return <PosTerminal sessionId={session.id} sessionNumber={session.sessionNumber} />;
}

function OpenSessionScreen() {
  const open = useOpenSession();
  const [cash, setCash] = useState(2000);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <Receipt className="h-12 w-12 text-primary" />
      <h1 className="text-page-heading font-bold">Open POS Session</h1>
      <div className="w-64 space-y-2">
        <label className="text-body font-medium">Opening cash in drawer</label>
        <Input type="number" value={cash} onChange={(e) => setCash(Number(e.target.value))} className="h-12 text-lg" />
      </div>
      <Button size="lg" loading={open.isPending} onClick={() => open.mutate(cash, { onError: (e) => toast.error(apiErrorMessage(e)) })}>Start Selling</Button>
      <Button asChild variant="ghost"><Link href="/"><ArrowLeft className="h-4 w-4" /> Back to Dashboard</Link></Button>
    </div>
  );
}

function PosTerminal({ sessionId, sessionNumber }: { sessionId: string; sessionNumber: string }) {
  const { data: products, isLoading } = usePosProducts();
  const cart = usePosCart();
  const totals = cartTotals(cart.items, cart.billDiscount);
  const sale = useCreateSale();
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [eodOpen, setEodOpen] = useState(false);

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
    return [{ id: 'all', name: 'All' }, ...[...map].map(([id, name]) => ({ id, name }))];
  }, [products]);

  const filtered = (products ?? []).filter(
    (p) => (activeCat === 'all' || p.category.id === activeCat) && (search === '' || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())),
  );

  const completeSale = (payload: Omit<CreateTxnPayload, 'sessionId' | 'items' | 'clientUuid'>) => {
    const full: CreateTxnPayload = {
      sessionId,
      clientUuid: crypto.randomUUID(),
      items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, discount: i.discount })),
      ...payload,
    };
    if (!navigator.onLine) {
      enqueueSale({ ...full, soldAt: new Date().toISOString() });
      setPendingSync(queueSize());
      toast.success('Saved offline — will sync when back online');
      cart.clear();
      setPayOpen(false);
      return;
    }
    sale.mutate(full, {
      onSuccess: (res) => {
        toast.success(`Sale ${res.receiptNumber} complete${res.changeGiven && Number(res.changeGiven) > 0 ? ` · Change ${formatINR(res.changeGiven)}` : ''}`);
        cart.clear();
        setPayOpen(false);
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_360px]">
      {/* LEFT: products */}
      <div className="flex h-full flex-col overflow-hidden border-r border-border">
        <div className="flex items-center gap-2 border-b border-border bg-card p-3">
          <Button asChild variant="ghost" size="icon"><Link href="/"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Search or scan SKU..." className="h-11 pl-10 text-base" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium', online ? 'text-success' : 'text-danger')}>
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{online ? 'Online' : 'Offline'}{pendingSync > 0 && ` · ${pendingSync} queued`}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-card p-2 scrollbar-thin">
          {categories.map((c) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)} className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-body font-medium', activeCat === c.id ? 'bg-primary text-primary-foreground' : 'bg-surface text-foreground')}>{c.name}</button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-3 scrollbar-thin sm:grid-cols-3 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-32" />)
            : filtered.map((p) => <ProductCard key={p.id} product={p} onAdd={() => cart.addItem({ productId: p.id, name: p.name, unit: p.unit, mrp: Number(p.mrp), taxPercent: Number(p.taxPercent) })} />)}
        </div>
      </div>

      {/* RIGHT: cart + payment */}
      <div className="flex h-full flex-col bg-card">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <p className="text-caption text-muted-foreground">Session {sessionNumber}</p>
            <p className="text-label font-semibold">Current Bill</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" title="Hold" onClick={cart.hold}><Pause className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" title="End of day" onClick={() => setEodOpen(true)}><Receipt className="h-5 w-5" /></Button>
          </div>
        </div>

        {cart.held.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-border bg-surface p-2">
            {cart.held.map((h) => (
              <button key={h.id} onClick={() => cart.resume(h.id)} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-caption">
                <Play className="h-3 w-3" /> {h.items.length} items
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          {cart.items.length === 0 ? (
            <p className="py-12 text-center text-body text-muted-foreground">Tap products to add them</p>
          ) : (
            <div className="space-y-2">
              {cart.items.map((i) => (
                <div key={i.productId} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{i.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cart.removeItem(i.productId)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => cart.setQty(i.productId, i.quantity - 1)}><Minus className="h-4 w-4" /></Button>
                      <span className="w-8 text-center font-semibold">{i.quantity}</span>
                      <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => cart.setQty(i.productId, i.quantity + 1)}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <span className="font-medium">{formatINR(i.mrp * i.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="mb-2 space-y-1 text-body">
            <Row label="Sub-total" value={formatINR(totals.subTotal)} />
            <Row label="Tax" value={formatINR(totals.tax)} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Bill discount</span>
              <Input type="number" className="h-8 w-24 text-right" value={cart.billDiscount} onChange={(e) => cart.setBillDiscount(Number(e.target.value))} />
            </div>
          </div>
          <div className="mb-3 flex items-center justify-between text-card-title font-bold">
            <span>Total</span><span>{formatINR(totals.grandTotal)}</span>
          </div>
          <Button className="h-14 w-full text-lg" disabled={cart.items.length === 0} onClick={() => setPayOpen(true)}>Charge {formatINR(totals.grandTotal)}</Button>
        </div>
      </div>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={totals.grandTotal} onComplete={completeSale} busy={sale.isPending} />
      <EodDialog open={eodOpen} onOpenChange={setEodOpen} sessionId={sessionId} />
    </div>
  );
}

function ProductCard({ product, onAdd }: { product: PosProduct; onAdd: () => void }) {
  const out = product.stock <= 0;
  return (
    <button
      onClick={onAdd}
      disabled={out}
      className={cn('flex min-h-[120px] flex-col justify-between rounded-lg border border-border bg-card p-3 text-left transition-shadow hover:shadow-md disabled:opacity-50', out && 'cursor-not-allowed')}
    >
      <div>
        <p className="line-clamp-2 font-semibold leading-tight">{product.name}</p>
        <p className="text-caption text-muted-foreground">{product.sku}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-label font-bold text-primary">{formatINR(product.mrp)}</span>
        <span className={cn('text-caption', out ? 'text-danger' : 'text-muted-foreground')}>{out ? 'Out' : `${product.stock} ${product.unit}`}</span>
      </div>
    </button>
  );
}

function PaymentDialog({ open, onOpenChange, total, onComplete, busy }: {
  open: boolean; onOpenChange: (v: boolean) => void; total: number;
  onComplete: (p: { billDiscount: number; paymentMode: 'CASH' | 'CARD' | 'UPI' | 'SPLIT'; cashReceived?: number; split?: { cash: number; card: number; upi: number } }) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'CASH' | 'CARD' | 'UPI' | 'SPLIT'>('CASH');
  const [received, setReceived] = useState(0);
  const [split, setSplit] = useState({ cash: 0, card: 0, upi: 0 });
  useEffect(() => { if (open) { setReceived(Math.ceil(total / 10) * 10); setMode('CASH'); setSplit({ cash: 0, card: 0, upi: total }); } }, [open, total]);

  const change = Math.max(0, received - total);
  const splitTotal = split.cash + split.card + split.upi;

  const submit = () => {
    if (mode === 'CASH' && received < total) { toast.error('Cash received is less than total'); return; }
    if (mode === 'SPLIT' && Math.abs(splitTotal - total) > 0.01) { toast.error('Split must equal the total'); return; }
    onComplete({ billDiscount: 0, paymentMode: mode, cashReceived: mode === 'CASH' ? received : undefined, split: mode === 'SPLIT' ? split : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Payment · {formatINR(total)}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {(['CASH', 'CARD', 'UPI', 'SPLIT'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn('rounded-md border py-2 text-body font-medium', mode === m ? 'border-primary bg-accent text-primary' : 'border-border')}>{m}</button>
          ))}
        </div>
        {mode === 'CASH' && (
          <div className="space-y-2">
            <label className="text-body font-medium">Cash received</label>
            <Input type="number" className="h-14 text-2xl" value={received} onChange={(e) => setReceived(Number(e.target.value))} />
            <div className="flex justify-between text-card-title font-bold"><span>Change</span><span className="text-success">{formatINR(change)}</span></div>
          </div>
        )}
        {mode === 'SPLIT' && (
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'card', 'upi'] as const).map((k) => (
              <div key={k} className="space-y-1"><label className="text-caption uppercase">{k}</label><Input type="number" value={split[k]} onChange={(e) => setSplit({ ...split, [k]: Number(e.target.value) })} /></div>
            ))}
            <p className={cn('col-span-3 text-caption', Math.abs(splitTotal - total) < 0.01 ? 'text-success' : 'text-danger')}>Split total: {formatINR(splitTotal)}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /> Cancel</Button>
          <Button className="px-8" loading={busy} onClick={submit}>Complete Sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EodDialog({ open, onOpenChange, sessionId }: { open: boolean; onOpenChange: (v: boolean) => void; sessionId: string }) {
  const { data: summary } = useSessionSummary(open ? sessionId : null);
  const close = useCloseSession();
  const [closingCash, setClosingCash] = useState(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>End of Day Summary</DialogTitle></DialogHeader>
        {!summary ? <Skeleton className="h-40" /> : (
          <div className="space-y-1 text-body">
            <Row label="Transactions" value={String(summary.transactionCount)} />
            <Row label="Total sales" value={formatINR(summary.totalSales)} />
            <Row label="Cash collected" value={formatINR(summary.cashCollected)} />
            <Row label="Card collected" value={formatINR(summary.cardCollected)} />
            <Row label="UPI collected" value={formatINR(summary.upiCollected)} />
            <Row label="Voids" value={String(summary.voidCount)} />
            <div className="pt-2"><label className="text-caption font-medium">Closing cash in drawer</label><Input type="number" value={closingCash} onChange={(e) => setClosingCash(Number(e.target.value))} /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Keep Open</Button>
          <Button variant="danger" loading={close.isPending} onClick={() => close.mutate({ id: sessionId, closingCash }, { onSuccess: () => { toast.success('Session closed'); onOpenChange(false); }, onError: (e) => toast.error(apiErrorMessage(e)) })}>Close Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
