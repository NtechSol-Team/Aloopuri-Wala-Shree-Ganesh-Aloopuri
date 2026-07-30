import type { Prisma } from '@prisma/client';

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
  | 'PAYROLL';

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
};

/**
 * Atomically reserve the next number for a document type and format it as
 * `PREFIX-YYYY-00000N`. Must be called inside a transaction so the counter
 * increment and the row insert commit together.
 */
export async function nextDocNumber(
  tx: Prisma.TransactionClient,
  key: DocCounterKey,
): Promise<string> {
  const counter = await tx.documentCounter.upsert({
    where: { key },
    create: { key, value: BigInt(1) },
    update: { value: { increment: BigInt(1) } },
    select: { value: true },
  });
  const year = new Date().getFullYear();
  const seq = counter.value.toString().padStart(5, '0');
  return `${PREFIX[key]}-${year}-${seq}`;
}
