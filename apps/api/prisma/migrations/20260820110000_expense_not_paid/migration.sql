-- Expense-only payment-method value: the amount is owed but not yet actually
-- paid by any method. Editing to a real method later is how it gets marked paid.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'NOT_PAID';
