'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Terminal, Lock, LogIn, Plus, Pencil, Tag, ArrowLeft, Store, Loader2, ReceiptText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api';
import { useDevStore } from '@/store/dev.store';
import { useOutlets, useSaveOutlet, useVerifyDeveloperKey, type Outlet } from '@/hooks/useOutlets';
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
  const { data: outlets, isLoading } = useOutlets();
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [creating, setCreating] = useState(false);
  const [pricesFor, setPricesFor] = useState<Outlet | null>(null);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground"><Terminal className="h-5 w-5" /></div>
          <div>
            <h1 className="text-page-heading font-bold leading-none">Developer Console</h1>
            <p className="mt-1 text-caption text-slate-400">Outlet provisioning &amp; special pricing</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" asChild>
            <Link href="/"><ArrowLeft className="h-4 w-4" /> App</Link>
          </Button>
          <Button variant="secondary" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={() => { clearDevKey(); toast.success('Locked'); }}>
            <Lock className="h-4 w-4" /> Lock
          </Button>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New Outlet</Button>
        </div>
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
