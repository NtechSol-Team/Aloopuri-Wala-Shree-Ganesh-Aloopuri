import type { Request, Response } from 'express';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { productionService } from './production.service';
import type { ListBatchesQuery, ListIntakeQuery, LogBatchInput, LogIntakeInput, RecordPurchaseInput } from './production.schema';

function actor(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

export const logBatchController = async (req: Request, res: Response) =>
  created(res, await productionService.logBatch(req.body as LogBatchInput, actor(req)), 'Production batch logged');

export const listBatchesController = async (req: Request, res: Response) => {
  const { rows, meta } = await productionService.listBatches(req.query as unknown as ListBatchesQuery);
  return paginated(res, rows, meta);
};

export const getBatchController = async (req: Request, res: Response) =>
  ok(res, await productionService.getBatch(req.params.id));

export const logIntakeController = async (req: Request, res: Response) =>
  created(res, await productionService.logIntake(req.body as LogIntakeInput, actor(req)), 'Raw material intake logged');

export const listIntakeController = async (req: Request, res: Response) => {
  const { rows, meta } = await productionService.listIntake(req.query as unknown as ListIntakeQuery);
  return paginated(res, rows, meta);
};

export const recordPurchaseController = async (req: Request, res: Response) =>
  created(res, await productionService.logPurchase(req.body as RecordPurchaseInput, actor(req)), 'Purchase recorded');

export const updatePurchaseController = async (req: Request, res: Response) =>
  ok(res, await productionService.updatePurchase(req.params.id, req.body as RecordPurchaseInput, actor(req)), 'Purchase bill updated');

export const deletePurchaseController = async (req: Request, res: Response) =>
  ok(res, await productionService.deletePurchase(req.params.id), 'Purchase bill deleted');

export const listPurchasesController = async (req: Request, res: Response) =>
  ok(res, await productionService.listPurchases({ status: req.query.status as string | undefined, search: req.query.search as string | undefined }));

export const getPurchaseDetailController = async (req: Request, res: Response) =>
  ok(res, await productionService.getPurchaseDetail(req.params.id));

export const godownStockController = async (_req: Request, res: Response) =>
  ok(res, await productionService.getGodownStock());
