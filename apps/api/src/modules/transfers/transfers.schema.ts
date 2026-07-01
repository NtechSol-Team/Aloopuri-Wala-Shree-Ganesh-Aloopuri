import { z } from 'zod';
import { StockTransferStatus, TransferDestination } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const createTransferSchema = z
  .object({
    destinationType: z.nativeEnum(TransferDestination).default(TransferDestination.MAIN_BRANCH),
    destinationOutletId: z.string().uuid().optional(),
    transferDate: z.coerce.date().default(() => new Date()),
    vehicleNumber: z.string().max(40).optional(),
    notes: z.string().max(500).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.coerce.number().positive('Quantity must be greater than 0'),
        }),
      )
      .min(1, 'Add at least one product'),
  })
  .refine((v) => v.destinationType !== TransferDestination.OUTLET || Boolean(v.destinationOutletId), {
    message: 'Select the destination outlet',
    path: ['destinationOutletId'],
  });

// Forward-only status transitions: DRAFT → DISPATCHED → RECEIVED (or CANCELLED from DRAFT).
export const updateTransferStatusSchema = z.object({
  status: z.enum([StockTransferStatus.DISPATCHED, StockTransferStatus.RECEIVED, StockTransferStatus.CANCELLED]),
});

export const listTransfersQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(StockTransferStatus).optional(),
  productId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransferStatusInput = z.infer<typeof updateTransferStatusSchema>;
export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;
