'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, Printer, Eye, ReceiptText, IndianRupee, Plus, Trash2, Pencil, Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatINR, ist, todayIso } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useBills, useBill, useOpenBillPdf, usePrintBillPdf, useUpdateBillCharges, type BillStatus } from '@/hooks/useBilling';
import { useCallNumber } from '@/hooks/useSettings';
import { useOutlets } from '@/hooks/useOutlets';
import { PayDialog, type PayTarget } from '@/components/payments/pay-dialog';
import { ManualBillDialog } from '@/components/sales/manual-bill-dialog';
import { DeleteBillDialog, type DeleteTarget } from '@/components/sales/delete-bill-dialog';
import { apiErrorMessage } from '@/lib/api';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import toast from 'react-hot-toast';

/** See OrdersTab — `lockedOutletId` pins the tab to the outlet card that was clicked. */
export function BillsTab({ lockedOutletId }: { lockedOutletId?: string } = {}) {
  const isAdmin = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const [status, setStatus] = useState<BillStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState('billDate');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  // Outlet filter only means anything for the admin — a franchise owner is
  // already scoped server-side to their own outlet regardless of this value.
  const [outletId, setOutletId] = useState('');
  const { data: outlets } = useOutlets();
  const range = periodRange(period, custom);
  const effectiveOutletId = lockedOutletId ?? outletId;
  // Every row would repeat the outlet you already drilled into.
  const showOutletColumn = isAdmin && !lockedOutletId;
  const { data, isLoading } = useBills({
    status: status || undefined, overdueOnly: overdueOnly || undefined, sort,
    ...(isAdmin && effectiveOutletId ? { outletId: effectiveOutletId } : {}),
    ...range,
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const openPdf = useOpenBillPdf();
  const printPdf = usePrintBillPdf();

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-muted-foreground">
            Every sales bill raised for the franchises.
          </p>
          {/* Back-entry only — deliberately nothing to do with the POS counter flow. */}
          <Button onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" /> Manual Sales Bill</Button>
        </div>
      )}
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </>
        )}
        {isAdmin && !lockedOutletId && (
          <div className="space-y-1.5">
            <Label>Franchise</Label>
            <Select className="w-48" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              <option value="">All franchises</option>
              {(outlets ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value as BillStatus | '')}>
          <option value="">All statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="PAID">Paid</option>
          {/* Cancelled bills are removed from the books, so they only appear when
              asked for — this is the view that explains gaps in the number series. */}
          {isAdmin && <option value="CANCELLED">Cancelled (deleted)</option>}
        </Select>
        <Select className="w-44" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="billDate">Newest first</option>
          <option value="dueDate">Due date</option>
          <option value="amount">Amount</option>
        </Select>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" className="h-4 w-4" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
      </div>

      {isLoading ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</Card>
      ) : !data?.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <ReceiptText className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No bills found.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Bill #</TH>{showOutletColumn && <TH>Outlet</TH>}<TH>Date</TH><TH>Due</TH>
                <TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH>Status</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((b) => {
                return (
                  <TR key={b.id}>
                    <TD className="font-medium">{b.billNumber}</TD>
                    {showOutletColumn && <TD>{b.outlet.name}</TD>}
                    <TD>{format(ist(b.billDate), 'dd MMM yyyy')}</TD>
                    <TD className={cn(b.isOverdue && 'font-semibold text-danger')}>{format(ist(b.dueDate), 'dd MMM yyyy')}</TD>
                    <TD className="text-right">{formatINR(b.grandTotal)}</TD>
                    <TD className={cn('text-right', Number(b.balanceDue) > 0 && 'font-medium text-warning')}>{formatINR(b.balanceDue)}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={statusBadgeVariant(b.status)}>{b.status.replace('_', ' ')}</Badge>
                        {b.isOverdue && <Badge variant="danger">Overdue</Badge>}
                        {!b.isGstBill && <Badge variant="neutral">No GST</Badge>}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {b.status !== 'PAID' && b.status !== 'CANCELLED' && (
                          <Button variant="primary" size="sm" onClick={() => setPayTarget({ id: b.id, billNumber: b.billNumber, balanceDue: b.balanceDue, outletName: b.outlet.name })}>
                            <IndianRupee className="h-3.5 w-3.5" /> Pay Now
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="View" onClick={() => setDetailId(b.id)}><Eye className="h-4 w-4" /></Button>
                        <Button
                          variant="ghost" size="icon" title="Print" loading={printPdf.isPending}
                          onClick={() => printPdf.mutate(b.id, { onError: (e) => toast.error(apiErrorMessage(e)) })}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" title="Download PDF" loading={openPdf.isPending}
                          onClick={() => openPdf.mutate(b.id, { onError: (e) => toast.error(apiErrorMessage(e)) })}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost" size="icon" title="Delete bill"
                            onClick={() => setDeleteTarget({ id: b.id, billNumber: b.billNumber, grandTotal: b.grandTotal, amountPaid: b.amountPaid, outletName: b.outlet.name })}
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <BillDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      <PayDialog bill={payTarget} onClose={() => setPayTarget(null)} />
      <ManualBillDialog open={manualOpen} onOpenChange={setManualOpen} />
      <DeleteBillDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function BillDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN';
  const { data: bill, isLoading } = useBill(id);
  const printPdf = usePrintBillPdf();
  const updateCharges = useUpdateBillCharges();
  // Only meaningful for a franchise owner — the main owner calling themselves
  // makes no sense — and only once the main owner has actually set a number.
  const { data: callSetting } = useCallNumber();

  // Packing/transport/etc — editable by the main owner on any bill, including one
  // auto-raised from a franchise's own order, which has no creation-time step of
  // its own to set these on.
  const [editingCharges, setEditingCharges] = useState(false);
  const [chargeDraft, setChargeDraft] = useState<Array<{ label: string; amount: number }>>([]);

  useEffect(() => {
    setEditingCharges(false);
  }, [id]);

  const startEditingCharges = () => {
    setChargeDraft((bill?.charges ?? []).map((c) => ({ label: c.label, amount: Number(c.amount) })));
    setEditingCharges(true);
  };
  const updateDraftRow = (i: number, patch: Partial<{ label: string; amount: number }>) =>
    setChargeDraft((r) => r.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeDraftRow = (i: number) => setChargeDraft((r) => r.filter((_, idx) => idx !== i));
  const addDraftRow = () => setChargeDraft((r) => [...r, { label: '', amount: 0 }]);

  const saveCharges = () => {
    if (!id) return;
    if (chargeDraft.some((c) => !c.label.trim() || c.amount <= 0)) {
      toast.error('Every charge needs a label and an amount greater than 0');
      return;
    }
    updateCharges.mutate(
      { id, charges: chargeDraft.map((c) => ({ label: c.label.trim(), amount: c.amount })) },
      {
        onSuccess: () => { toast.success('Charges updated'); setEditingCharges(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2">
              {bill ? `Invoice ${bill.billNumber}` : 'Invoice'}
              {bill && !bill.isGstBill && <Badge variant="neutral">No GST</Badge>}
            </DialogTitle>
            {bill && (
              <div className="flex items-center gap-2">
                {role === 'FRANCHISE_OWNER' && callSetting?.phone && (
                  <Button variant="secondary" size="sm" asChild>
                    <a href={`tel:${callSetting.phone.replace(/[^\d+]/g, '')}`}>
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                  </Button>
                )}
                <Button variant="secondary" size="sm" loading={printPdf.isPending} onClick={() => id && printPdf.mutate(id, { onError: (e) => toast.error(apiErrorMessage(e)) })}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>
        {isLoading || !bill ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between text-body">
              <div>
                <p className="font-medium">{bill.outlet.name}</p>
                {bill.outlet.address && <p className="text-muted-foreground">{bill.outlet.address}</p>}
              </div>
              <div className="text-right text-caption text-muted-foreground">
                <p>Date: {format(ist(bill.billDate), 'dd MMM yyyy')}</p>
                <p>Due: {format(ist(bill.dueDate), 'dd MMM yyyy')}</p>
              </div>
            </div>
            <Table>
              <THead><TR><TH>Item</TH><TH className="text-right">Qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Tax</TH><TH className="text-right">Total</TH></TR></THead>
              <TBody>
                {bill.items.map((it) => (
                  <TR key={it.id}>
                    <TD>{it.productNameSnapshot}</TD>
                    <TD className="text-right">{Number(it.quantity)}</TD>
                    <TD className="text-right">{formatINR(it.rate)}</TD>
                    <TD className="text-right">{Number(it.taxPercent)}%</TD>
                    <TD className="text-right">{formatINR(it.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            {isAdmin && editingCharges ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <Label>Additional Charges <span className="text-muted-foreground">(packing, transport, etc.)</span></Label>
                {chargeDraft.map((charge, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-[10rem] flex-1"
                      placeholder="e.g. Packing"
                      value={charge.label}
                      onChange={(e) => updateDraftRow(i, { label: e.target.value })}
                    />
                    <Input
                      type="number"
                      className="w-28"
                      step="0.01"
                      placeholder="Amount"
                      value={charge.amount || ''}
                      onChange={(e) => updateDraftRow(i, { amount: Number(e.target.value) })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeDraftRow(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button variant="secondary" size="sm" onClick={addDraftRow}><Plus className="h-4 w-4" /> Add charge</Button>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditingCharges(false)}>Cancel</Button>
                    <Button size="sm" loading={updateCharges.isPending} onClick={saveCharges}>Save</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ml-auto w-56 space-y-1 text-body">
                <Row label="Sub-total" value={formatINR(bill.subTotal)} />
                <Row label="Tax" value={formatINR(bill.taxTotal)} />
                {bill.charges.map((c) => (
                  <Row key={c.id} label={c.label} value={formatINR(c.amount)} className="text-muted-foreground" />
                ))}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={startEditingCharges}
                    className="flex items-center gap-1 text-caption text-primary hover:underline"
                  >
                    <Pencil className="h-3 w-3" /> {bill.charges.length ? 'Edit charges' : 'Add a charge'}
                  </button>
                )}
                <Row label="Grand Total" value={formatINR(bill.grandTotal)} bold />
                <Row label="Paid" value={formatINR(bill.amountPaid)} className="text-success" />
                <Row label="Balance Due" value={formatINR(bill.balanceDue)} className="text-danger" bold />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className={cn('flex justify-between', bold && 'font-semibold', className)}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
