import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const logBatchSchema = z.object({
  productId: z.string().uuid(),
  quantityProduced: z.coerce.number().positive('Quantity must be greater than 0'),
  productionDate: z.coerce.date().default(() => new Date()),
  batchNumber: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

export const listBatchesQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const logIntakeSchema = z.object({
  rawMaterialId: z.string().uuid(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  costPerUnit: z.coerce.number().nonnegative(),
  supplierName: z.string().max(120).optional(),
  invoiceNumber: z.string().max(80).optional(),
  intakeDate: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).optional(),
});

export const listIntakeQuerySchema = paginationQuerySchema.extend({
  rawMaterialId: z.string().uuid().optional(),
});

// A purchase bill: one supplier invoice with mixed lines —
//  • RAW_MATERIAL → goods receipt into inventory (updates stock + avg cost)
//  • OTHER        → non-inventory item booked to an expense category
const rawMaterialLine = z.object({
  kind: z.literal('RAW_MATERIAL'),
  rawMaterialId: z.string().uuid(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  costPerUnit: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  hsnCode: z.string().max(12).optional(),
});
const finishedGoodLine = z.object({
  kind: z.literal('FINISHED_GOOD'),
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  costPerUnit: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  hsnCode: z.string().max(12).optional(),
});
const otherLine = z.object({
  kind: z.literal('OTHER'),
  categoryId: z.string().uuid(),
  description: z.string().max(200).optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  hsnCode: z.string().max(12).optional(),
});

export const recordPurchaseSchema = z.object({
  supplierName: z.string().max(120).optional(),
  supplierGstin: z.string().max(15).optional(),
  invoiceNumber: z.string().max(80).optional(),
  intakeDate: z.coerce.date().default(() => new Date()),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  // How much is paid to the supplier at entry: 0 = full credit, < total = partial.
  amountPaidNow: z.coerce.number().min(0).default(0),
  // Credit terms — due date = intakeDate + creditDays. Only meaningful when a balance remains.
  creditDays: z.coerce.number().int().positive().max(365).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(z.discriminatedUnion('kind', [rawMaterialLine, finishedGoodLine, otherLine])).min(1, 'Add at least one line'),
});
export type RecordPurchaseInput = z.infer<typeof recordPurchaseSchema>;

export type LogBatchInput = z.infer<typeof logBatchSchema>;
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;
export type LogIntakeInput = z.infer<typeof logIntakeSchema>;
export type ListIntakeQuery = z.infer<typeof listIntakeQuerySchema>;
