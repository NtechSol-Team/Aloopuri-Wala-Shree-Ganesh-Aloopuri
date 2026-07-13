'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { format, differenceInCalendarDays } from 'date-fns';
import { Plus, Search, Eye, ShoppingBag, Boxes, Package, Tag, IndianRupee, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { usePurchases, usePurchaseDetail, useDeletePurchase, type PurchaseBillDetail } from '@/hooks/useProduction';
import { PurchaseDialog } from '@/components/production/purchase-dialog';
import { PaySupplierDialog, type SupplierBillRef } from '@/components/payables/pay-supplier-dialog';

const KIND_META: Record<string, { label: string; icon: typeof Boxes }> = {
  RAW_MATERIAL: { label: 'Raw material', icon: Boxes },
  FINISHED_GOOD: { label: 'Finished good', icon: Package },
  OTHER: { label: 'Other', icon: Tag },
};

/** Due-date pill: red once overdue, amber inside the 5-day reminder window, muted otherwise. */
function DueCell({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <span className="text-muted-foreground">—</span>;
  const days = differenceInCalendarDays(new Date(dueDate), new Date());
  const cls = days < 0 ? 'text-danger font-semibold' : days <= 5 ? 'text-warning font-semibold' : 'text-muted-foreground';
  return (
    <span className={cls}>
      {format(new Date(dueDate), 'dd MMM yyyy')}
      {days < 0 ? ` · ${Math.abs(days)}d overdue` : days <= 10 ? ` · ${days}d left` : ''}
    </span>
  );
}

export default function PurchasesPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const { data, isLoading } = usePurchases({ status: status || undefined, search: search || undefined });
  const [recordOpen, setRecordOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<SupplierBillRef | null>(null);
  const [editBill, setEditBill] = useState<PurchaseBillDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseBillDetail | null>(null);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search bill #, supplier, invoice…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIALLY_PAID">Partially paid</option>
              <option value="PAID">Paid</option>
            </Select>
          </div>
          <Button onClick={() => setRecordOpen(true)}><Plus className="h-4 w-4" /> Record Purchase</Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No purchase bills yet.</p>
            <Button onClick={() => setRecordOpen(true)}><Plus className="h-4 w-4" /> Record first purchase</Button>
          </div>
        ) : (
          <Table>
            <THead>
              <TR><TH>Bill #</TH><TH>Supplier</TH><TH>GSTIN</TH><TH>Date</TH><TH>Type</TH><TH className="text-right">Taxable</TH><TH className="text-right">GST</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH>Due</TH><TH>Status</TH><TH /></TR>
            </THead>
            <TBody>
              {data.map((b) => (
                <TR key={b.id} className="cursor-pointer" onClick={() => setDetailId(b.id)}>
                  <TD className="font-medium text-primary">{b.billNumber}</TD>
                  <TD>{b.supplierName ?? '—'}</TD>
                  <TD className="text-muted-foreground">{b.supplierGstin ?? '—'}</TD>
                  <TD>{format(new Date(b.billDate), 'dd MMM yyyy')}</TD>
                  <TD><Badge variant={b.isGstBill ? 'info' : 'neutral'}>{b.isGstBill ? 'GST' : 'No GST'}</Badge></TD>
                  <TD className="text-right">{formatINR(b.taxableAmount)}</TD>
                  <TD className="text-right text-muted-foreground">{formatINR(b.taxAmount)}</TD>
                  <TD className="text-right font-medium">{formatINR(b.totalAmount)}</TD>
                  <TD className={cn('text-right', Number(b.balanceDue) > 0 && 'text-danger')}>{formatINR(b.balanceDue)}</TD>
                  <TD><DueCell dueDate={b.dueDate} /></TD>
                  <TD><Badge variant={statusBadgeVariant(b.status)}>{b.status.replace('_', ' ')}</Badge></TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {b.status !== 'PAID' && (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); setPayTarget({ id: b.id, billNumber: b.billNumber, supplierName: b.supplierName, balanceDue: b.balanceDue }); }}>
                          <IndianRupee className="h-3.5 w-3.5" /> Pay
                        </Button>
                      )}
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <PurchaseDialog
        open={recordOpen || !!editBill}
        onOpenChange={(v) => { if (!v) { setRecordOpen(false); setEditBill(null); } }}
        editBill={editBill}
      />
      <PurchaseDetailDialog
        id={detailId}
        onClose={() => setDetailId(null)}
        onPay={(b) => { setDetailId(null); setPayTarget(b); }}
        onEdit={(b) => { setDetailId(null); setEditBill(b); }}
        onDelete={(b) => { setDetailId(null); setDeleteTarget(b); }}
      />
      <PaySupplierDialog bill={payTarget} onClose={() => setPayTarget(null)} />
      <DeletePurchaseDialog bill={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function PurchaseDetailDialog({ id, onClose, onPay, onEdit, onDelete }: {
  id: string | null;
  onClose: () => void;
  onPay: (b: SupplierBillRef) => void;
  onEdit: (b: PurchaseBillDetail) => void;
  onDelete: (b: PurchaseBillDetail) => void;
}) {
  const { data: bill, isLoading } = usePurchaseDetail(id);
  const canModify = !!bill && bill.payments.length === 0;
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2">
              {bill ? `Purchase ${bill.billNumber}` : 'Purchase'}
              {bill && <Badge variant={bill.isGstBill ? 'info' : 'neutral'}>{bill.isGstBill ? 'GST' : 'No GST'}</Badge>}
            </DialogTitle>
            {canModify && (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => onEdit(bill)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => onDelete(bill)}><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            )}
          </div>
          <DialogDescription>{bill ? `${bill.supplierName ?? 'Supplier'}${bill.supplierGstin ? ` · ${bill.supplierGstin}` : ''}${bill.invoiceNumber ? ` · Inv ${bill.invoiceNumber}` : ''}` : 'Loading…'}</DialogDescription>
          {bill && !canModify && (
            <p className="text-caption text-muted-foreground">This bill has a payment recorded against it, so it can no longer be edited or deleted.</p>
          )}
        </DialogHeader>

        {isLoading || !bill ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (
          <div className="space-y-4">
            <Table>
              <THead><TR><TH>Type</TH><TH>Item</TH><TH>HSN</TH><TH className="text-right">Qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Taxable</TH><TH className="text-right">GST</TH><TH className="text-right">Total</TH></TR></THead>
              <TBody>
                {bill.items.map((it) => {
                  const M = KIND_META[it.kind] ?? KIND_META.OTHER;
                  return (
                    <TR key={it.id}>
                      <TD><span className="inline-flex items-center gap-1 text-caption text-muted-foreground"><M.icon className="h-3.5 w-3.5" />{M.label}</span></TD>
                      <TD className="font-medium">{it.name}</TD>
                      <TD className="text-muted-foreground">{it.hsnCode ?? '—'}</TD>
                      <TD className="text-right">{it.quantity ? Number(it.quantity) : '—'}</TD>
                      <TD className="text-right">{it.unitCost ? formatINR(it.unitCost) : '—'}</TD>
                      <TD className="text-right">{formatINR(it.taxableAmount)}</TD>
                      <TD className="text-right text-muted-foreground">{Number(it.taxRate)}% · {formatINR(it.taxAmount)}</TD>
                      <TD className="text-right font-medium">{formatINR(it.lineTotal)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            <div className="ml-auto w-64 space-y-1 text-body">
              <Row label="Taxable value" value={formatINR(bill.taxableAmount)} />
              {Number(bill.igst) > 0 ? (
                <Row label="IGST" value={formatINR(bill.igst)} muted />
              ) : (
                <>
                  <Row label="CGST" value={formatINR(bill.cgst)} muted />
                  <Row label="SGST" value={formatINR(bill.sgst)} muted />
                </>
              )}
              <Row label="Grand total" value={formatINR(bill.totalAmount)} bold />
              <Row label="Paid" value={formatINR(bill.amountPaid)} className="text-success" />
              <Row label="Balance" value={formatINR(bill.balanceDue)} className="text-danger" bold />
              {bill.dueDate && (
                <Row label={`Credit terms (net ${bill.creditDays}d)`} value={<DueCell dueDate={bill.dueDate} />} />
              )}
            </div>

            {bill.payments.length > 0 && (
              <div>
                <p className="mb-1 text-caption font-semibold uppercase text-muted-foreground">Payments</p>
                {bill.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-caption text-muted-foreground">
                    <span>{p.paymentNumber} · {p.method.replace('_', ' ')} · {format(new Date(p.paymentDate), 'dd MMM yyyy')}</span>
                    <span className="text-success">{formatINR(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {bill.status !== 'PAID' && (
              <div className="flex justify-end border-t border-border pt-3">
                <Button onClick={() => onPay({ id: bill.id, billNumber: bill.billNumber, supplierName: bill.supplierName, balanceDue: bill.balanceDue })}>
                  <IndianRupee className="h-4 w-4" /> Record Payment · {formatINR(bill.balanceDue)} due
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, muted, className }: { label: string; value: React.ReactNode; bold?: boolean; muted?: boolean; className?: string }) {
  return <div className={cn('flex justify-between', bold && 'border-t border-border pt-1 font-semibold', muted && 'text-muted-foreground', className)}><span>{label}</span><span>{value}</span></div>;
}

function DeletePurchaseDialog({ bill, onClose }: { bill: PurchaseBillDetail | null; onClose: () => void }) {
  const del = useDeletePurchase();
  return (
    <Dialog open={!!bill} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {bill?.billNumber}?</DialogTitle>
          <DialogDescription>
            This reverses the stock and cost it added — refused automatically if any of that stock has already been used elsewhere. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger" loading={del.isPending}
            onClick={() => {
              if (!bill) return;
              del.mutate(bill.id, {
                onSuccess: () => { toast.success(`${bill.billNumber} deleted`); onClose(); },
                onError: (e) => toast.error(apiErrorMessage(e)),
              });
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
