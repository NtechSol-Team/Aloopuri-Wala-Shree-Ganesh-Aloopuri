'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Download, Eye, ReceiptText, IndianRupee } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatINR } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useBills, useBill, billPdfHref, type BillStatus } from '@/hooks/useBilling';
import { PayDialog, type PayTarget } from '@/components/payments/pay-dialog';

export default function BillingPage() {
  const isAdmin = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const [status, setStatus] = useState<BillStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState('billDate');
  const { data, isLoading } = useBills({ status: status || undefined, overdueOnly: overdueOnly || undefined, sort });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value as BillStatus | '')}>
          <option value="">All statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="PAID">Paid</option>
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
                <TH>Bill #</TH>{isAdmin && <TH>Outlet</TH>}<TH>Date</TH><TH>Due</TH>
                <TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH>Status</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((b) => {
                const pdf = billPdfHref(b.pdfUrl);
                return (
                  <TR key={b.id}>
                    <TD className="font-medium">{b.billNumber}</TD>
                    {isAdmin && <TD>{b.outlet.name}</TD>}
                    <TD>{format(new Date(b.billDate), 'dd MMM yyyy')}</TD>
                    <TD className={cn(b.isOverdue && 'font-semibold text-danger')}>{format(new Date(b.dueDate), 'dd MMM yyyy')}</TD>
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
                        {pdf && <Button asChild variant="ghost" size="icon" title="Download PDF"><a href={pdf} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a></Button>}
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
    </div>
  );
}

function BillDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: bill, isLoading } = useBill(id);
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {bill ? `Invoice ${bill.billNumber}` : 'Invoice'}
            {bill && !bill.isGstBill && <Badge variant="neutral">No GST</Badge>}
          </DialogTitle>
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
                <p>Date: {format(new Date(bill.billDate), 'dd MMM yyyy')}</p>
                <p>Due: {format(new Date(bill.dueDate), 'dd MMM yyyy')}</p>
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
            <div className="ml-auto w-56 space-y-1 text-body">
              <Row label="Sub-total" value={formatINR(bill.subTotal)} />
              <Row label="Tax" value={formatINR(bill.taxTotal)} />
              <Row label="Grand Total" value={formatINR(bill.grandTotal)} bold />
              <Row label="Paid" value={formatINR(bill.amountPaid)} className="text-success" />
              <Row label="Balance Due" value={formatINR(bill.balanceDue)} className="text-danger" bold />
            </div>
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
