'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { AlertTriangle, HandCoins, Wallet } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, ist, todayIso } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useOutlets } from '@/hooks/useOutlets';
import {
  useOutstandingBills, useReceivePaymentPreview, useReceivePayment, useOutletPaymentHistory,
  type ReceivableMethod,
} from '@/hooks/usePayments';

const METHODS: Array<[ReceivableMethod, string]> = [
  ['CASH', 'Cash'], ['UPI', 'UPI'], ['BANK_TRANSFER', 'Bank Transfer'], ['CHEQUE', 'Cheque'], ['CARD', 'Card'],
];
const REFERENCE_REQUIRED: ReceivableMethod[] = ['UPI', 'BANK_TRANSFER', 'CHEQUE'];

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Collect a payment from a franchise, applied FIFO across its oldest-first
 * outstanding bills. Every number the user acts on — the outstanding total,
 * the allocation preview, the running balances — comes straight from the
 * server; nothing here is computed client-side and then trusted, because the
 * server recomputes the same thing again right before it commits anything.
 */
export function ReceivePaymentTab() {
  const { data: outlets } = useOutlets();
  const active = useMemo(() => (outlets ?? []).filter((o) => o.isActive), [outlets]);

  const [outletId, setOutletId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState<ReceivableMethod>('CASH');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const amount = Number(amountInput);
  const validAmount = amountInput.trim() !== '' && Number.isFinite(amount) && amount > 0;

  const outstanding = useOutstandingBills(outletId || undefined);
  const preview = useReceivePaymentPreview(outletId || undefined, validAmount ? amount : 0);
  const history = useOutletPaymentHistory(outletId || undefined);
  const receive = useReceivePayment();

  // A fresh receipt attempt needs a fresh idempotency key — otherwise a genuine
  // second payment for the same outlet would collide with the first's key.
  useEffect(() => { setIdempotencyKey(newIdempotencyKey()); }, [outletId]);

  const resetForm = () => {
    setAmountInput('');
    setReferenceNumber('');
    setNotes('');
    setMethod('CASH');
    setPaymentDate(todayIso());
    setIdempotencyKey(newIdempotencyKey());
  };

  const referenceRequired = REFERENCE_REQUIRED.includes(method);
  const referenceOk = !referenceRequired || referenceNumber.trim().length > 0;
  const canSubmit = !!outletId && validAmount && !!preview.data && referenceOk && !!paymentDate && !receive.isPending;

  const submit = () => {
    if (!preview.data) return;
    if (!referenceOk) {
      toast.error('Please enter a reference/transaction number for this payment method.');
      return;
    }
    receive.mutate(
      {
        outletId,
        amount,
        method,
        paymentDate,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations: preview.data.allocations.map((a) => ({ billId: a.billId, amount: Number(a.allocated) })),
        advanceAmount: Number(preview.data.advanceAmount),
        idempotencyKey,
      },
      {
        onSuccess: (res) => {
          if (res.alreadyRecorded) {
            toast.success(`${res.paymentNumber} was already recorded — nothing new to do.`);
          } else {
            const billNote = res.bills.length ? ` across ${res.bills.length} bill${res.bills.length > 1 ? 's' : ''}` : ' as advance/credit';
            toast.success(`${res.paymentNumber} recorded — ${formatINR(res.amountReceived)} received${billNote}.`);
          }
          resetForm();
        },
        onError: (e) => {
          const msg = apiErrorMessage(e);
          toast.error(msg);
          // A stale allocation (someone else's payment landed first) — the preview
          // query is already keyed on outlet+amount, so just force it to refetch.
          if (/outstanding balance changed/i.test(msg)) preview.refetch();
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-card-title font-semibold">Receive Payment</h2>
        <p className="text-caption text-muted-foreground">
          Pick a franchise, enter what came in, and it's applied to their oldest outstanding bills first.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Outlet</Label>
            <SearchableSelect
              items={active.map((o) => ({ id: o.id, label: o.name, sublabel: o.code }))}
              value={outletId}
              onChange={setOutletId}
              placeholder="Search franchises…"
            />
          </div>
          <div className="flex items-end justify-between rounded-md border border-border bg-surface px-3 py-2 sm:justify-end sm:gap-2">
            {!outletId ? (
              <p className="text-caption text-muted-foreground">Pick an outlet to see what it owes.</p>
            ) : outstanding.isLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <div className="flex items-center gap-4">
                {Number(outstanding.data?.advanceBalance ?? 0) > 0 && (
                  <div className="text-right">
                    <p className="text-caption uppercase tracking-wide text-muted-foreground">Advance / Credit</p>
                    <p className="text-body font-semibold text-success">{formatINR(outstanding.data!.advanceBalance)}</p>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-caption uppercase tracking-wide text-muted-foreground">Total Outstanding</p>
                  <p className={cn('text-card-title font-bold', Number(outstanding.data?.totalOutstanding ?? 0) > 0 ? 'text-danger' : 'text-success')}>
                    {formatINR(outstanding.data?.totalOutstanding ?? 0)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {outletId && outstanding.data && (
          <div className="overflow-hidden rounded-md border border-border">
            {!outstanding.data.bills.length ? (
              <p className="p-6 text-center text-body text-muted-foreground">No outstanding bills — this outlet is all settled up.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Bill No.</TH><TH>Date</TH><TH className="text-right">Bill Amount</TH>
                    <TH className="text-right">Paid</TH><TH className="text-right">Pending</TH><TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {outstanding.data.bills.map((b) => (
                    <TR key={b.id}>
                      <TD className="font-medium">{b.billNumber}</TD>
                      <TD className="text-muted-foreground">{format(ist(b.billDate), 'dd MMM yyyy')}</TD>
                      <TD className="text-right tabular-nums">{formatINR(b.grandTotal)}</TD>
                      <TD className="text-right tabular-nums text-success">{formatINR(b.amountPaid)}</TD>
                      <TD className="text-right font-medium tabular-nums text-danger">{formatINR(b.balanceDue)}</TD>
                      <TD><Badge variant={statusBadgeVariant(b.status)}>{b.status.replace('_', ' ')}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        )}
      </Card>

      {outletId && (
        <Card className="space-y-4 p-4">
          <CardHeader className="p-0">
            <CardTitle className="flex items-center gap-2 text-body"><HandCoins className="h-4 w-4" /> New Receipt</CardTitle>
          </CardHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Received Amount</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as ReceivableMethod)}>
                {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Date</Label>
              <Input type="date" value={paymentDate} max={todayIso()} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{referenceRequired ? 'Reference / Transaction No.' : 'Reference / Transaction No. (optional)'}</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder={referenceRequired ? 'Required for this method' : 'UTR, cheque no., etc.'}
                aria-invalid={referenceRequired && !referenceNumber.trim()}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <textarea
              className="min-h-[56px] w-full rounded-md border border-border bg-card px-3 py-2 text-body outline-none focus:border-primary"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {validAmount && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Bill Allocation Preview</p>
              {preview.isLoading ? (
                <Skeleton className="h-24" />
              ) : preview.isError ? (
                <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-caption text-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {apiErrorMessage(preview.error)}
                </div>
              ) : preview.data ? (
                <>
                  {preview.data.allocations.length > 0 && (
                    <div className="overflow-hidden rounded-md border border-border">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Bill No.</TH><TH className="text-right">Bill Amount</TH><TH className="text-right">Previously Paid</TH>
                            <TH className="text-right">Allocated Now</TH><TH className="text-right">New Balance</TH><TH>New Status</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {preview.data.allocations.map((a) => (
                            <TR key={a.billId}>
                              <TD className="font-medium">{a.billNumber}</TD>
                              <TD className="text-right tabular-nums">{formatINR(a.billAmount)}</TD>
                              <TD className="text-right tabular-nums text-muted-foreground">{formatINR(a.previouslyPaid)}</TD>
                              <TD className="text-right font-medium tabular-nums text-success">{formatINR(a.allocated)}</TD>
                              <TD className="text-right tabular-nums">{formatINR(a.newBalanceDue)}</TD>
                              <TD><Badge variant={statusBadgeVariant(a.newStatus)}>{a.newStatus.replace('_', ' ')}</Badge></TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  )}

                  {Number(preview.data.advanceAmount) > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-caption">
                      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <p>
                        {preview.data.allocations.length === 0
                          ? `${preview.data.outlet.name} has no outstanding bills right now — the`
                          : 'This is more than the outlet currently owes — the remaining'}{' '}
                        <span className="font-semibold">{formatINR(preview.data.advanceAmount)}</span> will be recorded as{' '}
                        <span className="font-semibold">Advance / Credit</span> against this outlet, not applied to any bill.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <SummaryStat label="Total Received" value={preview.data.totalReceived} />
                    <SummaryStat label="Total Allocated" value={preview.data.totalAllocated} className="text-success" />
                    <SummaryStat label="Total Remaining Outstanding" value={preview.data.totalOutstandingAfter} className="text-danger" />
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-3">
            <Button onClick={submit} disabled={!canSubmit} loading={receive.isPending}>
              <HandCoins className="h-4 w-4" /> Confirm & Receive Payment
            </Button>
          </div>
        </Card>
      )}

      {outletId && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Payment History — {history.data?.outlet.name ?? ''}</CardTitle></CardHeader>
          {history.isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : !history.data?.rows.length ? (
            <p className="py-10 text-center text-body text-muted-foreground">No payments recorded for this outlet yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH><TH>Bill No.</TH><TH className="text-right">Bill Amount</TH><TH className="text-right">Received</TH>
                  <TH className="text-right">Adjusted</TH><TH className="text-right">Pending</TH><TH>Payment Method</TH>
                </TR>
              </THead>
              <TBody>
                {history.data.rows.map((r, i) => (
                  <TR key={`${r.paymentNumber}-${r.billNumber}-${i}`}>
                    <TD>{format(ist(r.date), 'dd MMM yyyy')}</TD>
                    <TD className="font-medium">{r.billNumber}</TD>
                    <TD className="text-right tabular-nums">{formatINR(r.billAmount)}</TD>
                    <TD className="text-right tabular-nums">{formatINR(r.received)}</TD>
                    <TD className="text-right tabular-nums text-success">{formatINR(r.adjusted)}</TD>
                    <TD className={cn('text-right tabular-nums', Number(r.pending) > 0 && 'font-medium text-danger')}>{formatINR(r.pending)}</TD>
                    <TD>{r.method.replace('_', ' ')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function SummaryStat({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-caption uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-body font-bold', className)}>{formatINR(value)}</p>
    </div>
  );
}
