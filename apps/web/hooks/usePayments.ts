'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface PaymentSummary {
  totalReceivables: number;
  collectedThisMonth: number;
  overdueAmount: number;
  outletOutstanding: Array<{ outletId: string; outletName: string; outstanding: number }>;
  aging: Array<{ label: string; amount: number }>;
}

export interface PaymentRow {
  id: string;
  paymentNumber: string;
  amount: string;
  channel: string;
  method: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  bill: { billNumber: string } | null;
  outlet: { name: string };
  /** Only present on rows from the flat /payments list — the portion of `amount`
   *  held as outlet credit rather than applied to any bill (a Receive Payment
   *  that came in for more than was owed). */
  advanceAmount?: string;
  /** Only present on rows from the flat /payments list — set when this receipt
   *  was split FIFO across more than one bill (bill/billId above is then null). */
  allocations?: Array<{ amount: string; bill: { billNumber: string } }>;
  /** Only present on rows read off a single bill's own payment history. */
  allocatedAmount?: string;
  splitAcrossBills?: boolean;
}

export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  ['bills', 'payments', 'dashboard', 'payment-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function usePaymentSummary() {
  return useQuery({
    queryKey: ['payment-summary'],
    queryFn: async () => (await api.get<ApiSuccess<PaymentSummary>>('/payments/summary')).data.data,
  });
}

export function usePayments(params: { outletId?: string } = {}) {
  return useQuery({
    queryKey: ['payments', params],
    queryFn: async () => (await api.get<ApiSuccess<PaymentRow[]>>('/payments', { params: { limit: 100, ...params } })).data.data,
  });
}

/** Records money taken in person — literal cash, or a UPI transfer the owner has seen land. */
export function useRecordCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { billId: string; amount: number; method?: 'CASH' | 'UPI' | 'BANK_TRANSFER'; referenceNumber?: string; notes?: string }) =>
      (await api.post('/payments/cash', input)).data,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRazorpayOrder() {
  return useMutation({
    mutationFn: async (billId: string) => (await api.post<ApiSuccess<RazorpayOrder>>('/payments/razorpay/order', { billId })).data.data,
  });
}

export function useVerifyRazorpay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { billId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      (await api.post('/payments/razorpay/verify', input)).data,
    onSuccess: () => invalidateAll(qc),
  });
}

/** Reverses a payment entered by mistake. The bill's paid/due/status re-derive
 *  from what's actually left, so this correctly "un-pays" it either partway or
 *  all the way back to Unpaid, matching however much was wrongly recorded. */
export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/payments/${id}`)).data,
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Receive Payment (FIFO across an outlet's outstanding bills) ─────────────

export type ReceivableMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD';

export interface OutstandingBill {
  id: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
  status: 'UNPAID' | 'PARTIALLY_PAID';
}

export function useOutstandingBills(outletId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'receive', 'outstanding', outletId],
    enabled: !!outletId,
    queryFn: async () =>
      (
        await api.get<
          ApiSuccess<{ outlet: { id: string; name: string; isActive: boolean }; bills: OutstandingBill[]; totalOutstanding: string; advanceBalance: string }>
        >('/payments/receive/outstanding', { params: { outletId } })
      ).data.data,
  });
}

export interface FifoAllocationPreview {
  billId: string;
  billNumber: string;
  billDate: string;
  billAmount: string;
  previouslyPaid: string;
  allocated: string;
  newAmountPaid: string;
  newBalanceDue: string;
  newStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
}

export interface ReceivePaymentPreview {
  outlet: { id: string; name: string };
  totalReceived: string;
  totalOutstandingBefore: string;
  totalAllocated: string;
  totalOutstandingAfter: string;
  /** Whatever's left once every outstanding bill is fully settled — the outlet
   *  paid more than it currently owes. Shown as its own line, never folded
   *  silently into a bill past what that bill actually owes. */
  advanceAmount: string;
  allocations: FifoAllocationPreview[];
}

/** The Bill Allocation Preview — recomputed fresh on every outlet/amount change,
 *  and the exact numbers sent back on submit for the server to check nothing
 *  moved underneath in between. */
export function useReceivePaymentPreview(outletId: string | undefined, amount: number) {
  return useQuery({
    queryKey: ['payments', 'receive', 'preview', outletId, amount],
    enabled: !!outletId && amount > 0,
    queryFn: async () => (await api.post<ApiSuccess<ReceivePaymentPreview>>('/payments/receive/preview', { outletId, amount })).data.data,
  });
}

export interface ReceivePaymentInput {
  outletId: string;
  amount: number;
  method: ReceivableMethod;
  /** yyyy-MM-dd */
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
  /** Exactly the Bill Allocation Preview the user reviewed — the server recomputes
   *  the same split fresh and refuses to proceed if it no longer matches. */
  allocations: Array<{ billId: string; amount: number }>;
  advanceAmount: number;
  /** One per Receive Payment attempt — a double-click or a retried request after
   *  a dropped connection carries the same key, so it's recorded once. */
  idempotencyKey: string;
}

export interface ReceivePaymentResult {
  alreadyRecorded: boolean;
  paymentNumber: string;
  amountReceived: string;
  advanceAmount: string;
  bills: Array<{ billNumber: string; status: string; amountPaid: string; balanceDue: string; grandTotal: string }>;
}

export function useReceivePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReceivePaymentInput) => (await api.post<ApiSuccess<ReceivePaymentResult>>('/payments/receive', input)).data.data,
    onSuccess: (_, variables) => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: ['payments', 'receive', 'outstanding', variables.outletId] });
      qc.invalidateQueries({ queryKey: ['payments', 'receive', 'history', variables.outletId] });
    },
  });
}

export interface OutletLedgerRow {
  date: string;
  billNumber: string;
  billAmount: string;
  /** The whole receipt's total — may exceed `adjusted` when it also covered other bills. */
  received: string;
  /** This bill's own share of that receipt. */
  adjusted: string;
  /** What was left owing on this bill right after this payment landed. */
  pending: string;
  method: string;
  paymentNumber: string;
  referenceNumber: string | null;
}

/** Date | Bill No. | Bill Amount | Received | Adjusted | Pending | Payment Method —
 *  exactly how every payment this outlet has made was allocated, bill by bill. */
export function useOutletPaymentHistory(outletId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'receive', 'history', outletId],
    enabled: !!outletId,
    queryFn: async () =>
      (await api.get<ApiSuccess<{ outlet: { id: string; name: string }; rows: OutletLedgerRow[] }>>('/payments/receive/history', { params: { outletId } })).data.data,
  });
}
