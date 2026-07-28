'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Terminal, Lock, LogIn, Plus, Pencil, Trash2, Tag, ArrowLeft, Store, Loader2, ReceiptText,
  IndianRupee, AlertTriangle, History,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { useDevStore } from '@/store/dev.store';
import { useOutlets, useSaveOutlet, useVerifyDeveloperKey, type Outlet } from '@/hooks/useOutlets';
import {
  useDeveloperPaymentClients, useSaveDeveloperPayment, useDeleteDeveloperPayment,
  type DeveloperPaymentClient, type RenewalStatus,
} from '@/hooks/useDeveloperPayments';
import { OutletPricesDialog } from '@/components/outlets/outlet-prices-dialog';

export default function DeveloperPage() {
  const [mounted, setMounted] = useState(false);
  const devKey = useDevStore((s) => s.devKey);
  useEffect(() => setMounted(true), []);

  // Avoid an SSR/hydration flash: the key lives in sessionStorage, which only
  // exists on the client, so wait until we've mounted before deciding the screen.
  if (!mounted) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }
  return devKey ? <DeveloperConsole /> : <UnlockScreen />;
}

// ─────────────────────────────── Unlock ─────────────────────────────────────
function UnlockScreen() {
  const setDevKey = useDevStore((s) => s.setDevKey);
  const verify = useVerifyDeveloperKey();
  const [pass, setPass] = useState('');

  const unlock = () => {
    if (!pass.trim()) { toast.error('Enter the developer passphrase'); return; }
    verify.mutate(pass, {
      onSuccess: () => { setDevKey(pass); toast.success('Developer access granted'); },
      onError: (e) => toast.error(apiErrorMessage(e, 'Invalid passphrase')),
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Terminal className="h-7 w-7" /></div>
          <h1 className="text-page-heading font-bold">Developer Console</h1>
          <p className="text-body text-slate-400">Restricted area. Enter the developer passphrase to manage outlets.</p>
        </div>
        <Label className="text-slate-300">Passphrase</Label>
        <Input
          type="password" autoFocus value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') unlock(); }}
          className="mt-1.5 border-slate-700 bg-slate-950 text-slate-100"
          placeholder="••••••••"
        />
        <Button className="mt-5 w-full" loading={verify.isPending} onClick={unlock}><LogIn className="h-4 w-4" /> Unlock</Button>
      </div>
      <Button asChild variant="ghost" className="text-slate-400 hover:bg-slate-800 hover:text-slate-100">
        <Link href="/"><ArrowLeft className="h-4 w-4" /> Back to app</Link>
      </Button>
    </div>
  );
}

// ─────────────────────────────── Console ────────────────────────────────────
function DeveloperConsole() {
  const clearDevKey = useDevStore((s) => s.clearDevKey);
  const [tab, setTab] = useState<'outlets' | 'payments'>('outlets');

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground"><Terminal className="h-5 w-5" /></div>
          <div>
            <h1 className="text-page-heading font-bold leading-none">Developer Console</h1>
            <p className="mt-1 text-caption text-slate-400">Outlet provisioning, special pricing &amp; your service payments</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" asChild>
            <Link href="/"><ArrowLeft className="h-4 w-4" /> App</Link>
          </Button>
          <Button variant="secondary" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={() => { clearDevKey(); toast.success('Locked'); }}>
            <Lock className="h-4 w-4" /> Lock
          </Button>
        </div>
      </div>

      <div className="mb-5 flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
        {([['outlets', 'Outlets'], ['payments', 'Payments & Renewals']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-caption font-medium transition-colors sm:flex-none sm:px-4',
              tab === k ? 'bg-primary text-primary-foreground' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'outlets' ? <OutletsTab /> : <PaymentsTab />}
    </div>
  );
}

// ─────────────────────────────── Outlets tab ─────────────────────────────────
function OutletsTab() {
  const { data: outlets, isLoading } = useOutlets();
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [creating, setCreating] = useState(false);
  const [pricesFor, setPricesFor] = useState<Outlet | null>(null);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New Outlet</Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !outlets?.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Store className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No outlets yet.</p>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create the first outlet</Button>
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Outlet</TH><TH>Code</TH><TH>Pricing</TH><TH className="text-right">Credit</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {outlets.map((o) => (
                <TR key={o.id}>
                  <TD className="font-medium">{o.name}{!o.isActive && <span className="ml-1.5 text-caption text-muted-foreground">(inactive)</span>}</TD>
                  <TD className="text-muted-foreground">{o.code}</TD>
                  <TD><Badge variant={o.pricingMode === 'SPECIAL' ? 'info' : 'neutral'}>{o.pricingMode === 'SPECIAL' ? 'Special' : 'Generic'}</Badge></TD>
                  <TD className="text-right text-muted-foreground">{o.creditPeriodDays}d</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPricesFor(o)}><Tag className="h-3.5 w-3.5" /> Prices</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditing(o)}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <OutletFormDialog
        open={creating || !!editing}
        outlet={editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        onManagePrices={(o) => { setCreating(false); setEditing(null); setPricesFor(o); }}
      />
      <OutletPricesDialog outlet={pricesFor} onClose={() => setPricesFor(null)} />
    </div>
  );
}

// ─────────────────────────────── Payments tab ────────────────────────────────
const STATUS_META: Record<RenewalStatus, { label: string; variant: 'danger' | 'warning' | 'success' | 'neutral' }> = {
  OVERDUE: { label: 'Overdue', variant: 'danger' },
  DUE_SOON: { label: 'Due soon', variant: 'warning' },
  OK: { label: 'OK', variant: 'success' },
  NEVER_PAID: { label: 'Never paid', variant: 'neutral' },
};

// Partnership split: the CA friend's cut of every payment collected. Purely a
// display split of money already recorded above — doesn't change what's
// stored, so adjusting this later needs no data migration.
const PARTNER_SHARE_PCT = 40;
const MY_SHARE_PCT = 100 - PARTNER_SHARE_PCT;

function RevenueSplitCard({ clients }: { clients: DeveloperPaymentClient[] }) {
  const allPayments = clients.flatMap((c) => c.history);
  const totalAllTime = allPayments.reduce((s, h) => s + Number(h.amount), 0);
  const thisYear = new Date().getFullYear();
  const totalThisYear = allPayments
    .filter((h) => new Date(h.paidOn).getFullYear() === thisYear)
    .reduce((s, h) => s + Number(h.amount), 0);

  const Split = ({ label, total }: { label: string; total: number }) => (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="text-caption uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-page-heading font-bold text-slate-100">{formatINR(total)}</p>
      <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-2.5">
        <div className="flex items-center justify-between text-body">
          <span className="text-slate-300">Your share ({MY_SHARE_PCT}%)</span>
          <span className="font-semibold text-success">{formatINR((total * MY_SHARE_PCT) / 100)}</span>
        </div>
        <div className="flex items-center justify-between text-body">
          <span className="text-slate-300">Partner share ({PARTNER_SHARE_PCT}%)</span>
          <span className="font-semibold text-primary">{formatINR((total * PARTNER_SHARE_PCT) / 100)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Split label={`Total Collected — ${thisYear}`} total={totalThisYear} />
      <Split label="Total Collected — All Time" total={totalAllTime} />
    </div>
  );
}

function PaymentsTab() {
  const { data: clients, isLoading } = useDeveloperPaymentClients(true);
  const [payFor, setPayFor] = useState<DeveloperPaymentClient | null>(null);
  const [historyFor, setHistoryFor] = useState<DeveloperPaymentClient | null>(null);

  const dueSoon = (clients ?? []).filter((c) => c.status === 'OVERDUE' || c.status === 'DUE_SOON');

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <RevenueSplitCard clients={clients ?? []} />

      {dueSoon.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-4 w-4" /> Renewals due soon</p>
          <ul className="space-y-1 text-body text-slate-200">
            {dueSoon.map((c) => (
              <li key={c.outletId ?? 'main'} className="flex items-center justify-between">
                <span>{c.name}</span>
                <span className={cn('font-medium', c.status === 'OVERDUE' ? 'text-danger' : 'text-warning')}>
                  {c.status === 'OVERDUE'
                    ? `Overdue by ${Math.abs(c.daysUntilRenewal ?? 0)}d`
                    : `Due in ${c.daysUntilRenewal}d`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className="overflow-hidden">
        <Table>
          <THead><TR><TH>Client</TH><TH className="text-right">Last Paid</TH><TH>Renewal Date</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR></THead>
          <TBody>
            {(clients ?? []).map((c) => (
              <TR key={c.outletId ?? 'main'}>
                <TD className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {c.outletId ? <Store className="h-3.5 w-3.5 text-slate-500" /> : <IndianRupee className="h-3.5 w-3.5 text-slate-500" />}
                    {c.name}
                    {!c.isActive && <span className="text-caption text-slate-500">(inactive)</span>}
                  </span>
                </TD>
                <TD className="text-right text-slate-300">
                  {c.lastPayment ? `${formatINR(c.lastPayment.amount)} · ${format(new Date(c.lastPayment.paidOn), 'dd MMM yyyy')}` : '—'}
                </TD>
                <TD className="text-slate-300">{c.lastPayment ? format(new Date(c.lastPayment.renewalDate), 'dd MMM yyyy') : '—'}</TD>
                <TD><Badge variant={STATUS_META[c.status].variant}>{STATUS_META[c.status].label}</Badge></TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setHistoryFor(c)} disabled={!c.history.length}><History className="h-3.5 w-3.5" /> History</Button>
                    <Button size="sm" onClick={() => setPayFor(c)}><Plus className="h-3.5 w-3.5" /> Record Payment</Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <RecordPaymentDialog client={payFor} onClose={() => setPayFor(null)} />
      <PaymentHistoryDialog client={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

const METHODS = ['CASH', 'CARD', 'UPI', 'NET_BANKING', 'RAZORPAY', 'BANK_TRANSFER'];
const today = () => format(new Date(), 'yyyy-MM-dd');

function RecordPaymentDialog({ client, onClose }: { client: DeveloperPaymentClient | null; onClose: () => void }) {
  const save = useSaveDeveloperPayment();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [paidOn, setPaidOn] = useState(today());
  const [renewalDate, setRenewalDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!client) return;
    setAmount(client.lastPayment ? String(Number(client.lastPayment.amount)) : '');
    setMethod('UPI');
    setPaidOn(today());
    setRenewalDate('');
    setNotes('');
  }, [client]);

  if (!client) return null;

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    save.mutate(
      {
        scope: client.scope,
        outletId: client.outletId ?? undefined,
        amount: amt,
        method,
        paidOn: new Date(paidOn).toISOString(),
        renewalDate: renewalDate ? new Date(renewalDate).toISOString() : undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: () => { toast.success(`Payment recorded for ${client.name}`); onClose(); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment — {client.name}</DialogTitle>
          <DialogDescription>Renewal date defaults to one year after the paid-on date if left blank.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label required>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select>
          </div>
          <div className="space-y-1.5"><Label required>Paid on</Label><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Renewal date (optional)</Label><Input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>Save Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentHistoryDialog({ client, onClose }: { client: DeveloperPaymentClient | null; onClose: () => void }) {
  const del = useDeleteDeveloperPayment();
  if (!client) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Payment History — {client.name}</DialogTitle></DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
          <Table>
            <THead><TR><TH>Paid On</TH><TH className="text-right">Amount</TH><TH>Renewal</TH><TH>Method</TH><TH className="w-8" /></TR></THead>
            <TBody>
              {client.history.map((h) => (
                <TR key={h.id}>
                  <TD>{format(new Date(h.paidOn), 'dd MMM yyyy')}</TD>
                  <TD className="text-right font-medium">{formatINR(h.amount)}</TD>
                  <TD>{format(new Date(h.renewalDate), 'dd MMM yyyy')}</TD>
                  <TD className="text-muted-foreground">{h.method?.replace('_', ' ') ?? '—'}</TD>
                  <TD>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      loading={del.isPending}
                      onClick={() => del.mutate(h.id, { onSuccess: () => toast.success('Payment removed') })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────── Outlet form ────────────────────────────────
function suggestCode(name: string): string {
  const letters = name.trim().toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean).map((w) => w.slice(0, 4)).join('-');
  return letters ? `OUT-${letters}` : '';
}
const empty = { name: '', code: '', address: '', phone: '', creditPeriodDays: 15, special: false, gstBilling: true };

function OutletFormDialog({ open, outlet, onOpenChange, onManagePrices }: {
  open: boolean;
  outlet: Outlet | null;
  onOpenChange: (v: boolean) => void;
  onManagePrices: (o: Outlet) => void;
}) {
  const isEdit = !!outlet;
  const save = useSaveOutlet();
  const [form, setForm] = useState({ ...empty });
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(outlet
        ? {
            name: outlet.name, code: outlet.code, address: outlet.address ?? '', phone: outlet.phone ?? '',
            creditPeriodDays: outlet.creditPeriodDays, special: outlet.pricingMode === 'SPECIAL', gstBilling: outlet.gstBilling,
          }
        : { ...empty });
      setCodeTouched(!!outlet);
    }
  }, [open, outlet]);

  const setName = (name: string) => setForm((f) => ({ ...f, name, code: codeTouched ? f.code : suggestCode(name) }));

  const submit = () => {
    if (form.name.trim().length < 2) { toast.error('Enter an outlet name'); return; }
    if (form.code.trim().length < 2) { toast.error('Enter an outlet code'); return; }
    save.mutate(
      {
        id: outlet?.id,
        name: form.name.trim(), code: form.code.trim().toUpperCase(),
        address: form.address || undefined, phone: form.phone || undefined,
        creditPeriodDays: form.creditPeriodDays,
        pricingMode: form.special ? 'SPECIAL' : 'GENERIC',
        gstBilling: form.gstBilling,
      },
      {
        onSuccess: (saved) => {
          toast.success(isEdit ? 'Outlet updated' : `Outlet "${saved.name}" created`);
          onOpenChange(false);
          // Jump straight to price-setting for special-pricing outlets.
          if (form.special) onManagePrices(saved);
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? `Edit ${outlet?.name}` : 'New Outlet'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label required>Outlet name</Label><Input value={form.name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Piplod Outlet" /></div>
          <div className="space-y-1.5"><Label required>Code</Label><Input value={form.code} onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })); }} placeholder="OUT-PIPLOD" /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label>Credit period (days)</Label><Input type="number" value={form.creditPeriodDays} onChange={(e) => setForm((f) => ({ ...f, creditPeriodDays: Number(e.target.value) }))} /></div>
        </div>
        <label className="flex items-start gap-2 rounded-md border border-border bg-surface p-2.5 text-body">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.special} onChange={(e) => setForm((f) => ({ ...f, special: e.target.checked }))} />
          <span>
            <span className="flex items-center gap-1 font-medium"><Tag className="h-3.5 w-3.5 text-primary" /> Special price selling</span>
            <span className="block text-caption text-muted-foreground">This outlet gets its own negotiated prices instead of the standard catalog price. You&apos;ll set the actual prices right after saving.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-border bg-surface p-2.5 text-body">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.gstBilling} onChange={(e) => setForm((f) => ({ ...f, gstBilling: e.target.checked }))} />
          <span>
            <span className="flex items-center gap-1 font-medium"><ReceiptText className="h-3.5 w-3.5 text-primary" /> Bill this outlet with GST</span>
            <span className="block text-caption text-muted-foreground">
              Their orders are priced — and paid for — before you review them, so this decides whether GST is added to the amount they pay. Untick for a no-GST outlet.
            </span>
          </span>
        </label>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{isEdit ? 'Save' : 'Create Outlet'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
