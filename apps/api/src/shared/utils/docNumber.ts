import type { Prisma } from '@prisma/client';
import { financialYearStart } from './financialYear';

export type DocCounterKey =
  | 'BILL'
  | 'ORDER'
  | 'TRANSFER'
  | 'BATCH'
  | 'PAYMENT'
  | 'POS_RECEIPT'
  | 'POS_SESSION'
  | 'USER_CODE'
  | 'SUPPLIER_BILL'
  | 'SUPPLIER_PAYMENT'
  | 'ASSET'
  | 'EMPLOYEE'
  | 'PAYROLL'
  | 'ADVANCE';

const PREFIX: Record<DocCounterKey, string> = {
  BILL: 'BL',
  ORDER: 'ORD',
  TRANSFER: 'TRF',
  BATCH: 'BATCH',
  PAYMENT: 'PAY',
  POS_RECEIPT: 'RCP',
  POS_SESSION: 'POS',
  USER_CODE: 'EMP',
  SUPPLIER_BILL: 'PB',
  SUPPLIER_PAYMENT: 'SP',
  ASSET: 'AST',
  // Deliberately EMPL, not EMP: USER_CODE above already mints EMP-prefixed codes off
  // its own counter, so sharing the prefix would produce duplicate-looking ids.
  EMPLOYEE: 'EMPL',
  // PAY is already taken by PAYMENT, so payroll rows use PR.
  PAYROLL: 'PR',
  ADVANCE: 'ADV',
};

/**
 * Series that restart at 00001 each Indian financial year (1 Apr – 31 Mar), because
 * they are the invoice/voucher books an auditor reads year by year.
 *
 * Identity codes are deliberately NOT here: an employee, asset or user code has to
 * stay unique and stable for the life of the record, so those keep one running
 * sequence forever.
 */
const FY_SERIES = new Set<DocCounterKey>([
  'BILL', 'ORDER', 'PAYMENT', 'POS_RECEIPT', 'SUPPLIER_BILL', 'SUPPLIER_PAYMENT',
]);

/**
 * Atomically reserve the next number for a document type and format it as
 * `PREFIX-YYYY-00000N`. Must be called inside a transaction so the counter
 * increment and the row insert commit together.
 *
 * `docDate` is the date the document itself carries, not "now" — a bill back-entered
 * today for last December belongs to last December's book, and numbering it with
 * this year would put the invoice number and the invoice date in different years.
 */
export async function nextDocNumber(
  tx: Prisma.TransactionClient,
  key: DocCounterKey,
  docDate: Date = new Date(),
): Promise<string> {
  const fy = financialYearStart(docDate);
  const perYear = FY_SERIES.has(key);
  // Per-year series get their own counter row so each April starts at 00001 again.
  const counterKey = perYear ? `${key}:${fy}` : key;

  const counter = await tx.documentCounter.upsert({
    where: { key: counterKey },
    create: { key: counterKey, value: BigInt(1) },
    update: { value: { increment: BigInt(1) } },
    select: { value: true },
  });
  const year = perYear ? fy : docDate.getFullYear();
  const seq = counter.value.toString().padStart(5, '0');
  return `${PREFIX[key]}-${year}-${seq}`;
}
