import { Prisma } from '@prisma/client';
import { addDays } from 'date-fns';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { env } from '../../config/env';
import { gstinStateCode, splitGst } from '../../shared/utils/gst';
import type { ListBatchesQuery, ListIntakeQuery, LogBatchInput, LogIntakeInput } from './production.schema';

/**
 * Log a production batch: consume the product's BOM (raw materials AND any
 * finished-product components, e.g. Khawsa used to make frozen Khawsa),
 * increment finished-goods stock at the godown, and compute the true per-unit
 * cost (material + component + overhead), rolling it into the product's
 * weighted-average cost so multi-level costs cascade. Fully atomic.
 */
export async function logBatch(input: LogBatchInput, userId: string) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, isDeleted: false },
    include: {
      godownStock: true,
      bom: {
        where: { isDeleted: false },
        include: { rawMaterial: true, componentProduct: { include: { godownStock: true } } },
      },
    },
  });
  if (!product) throw AppError.notFound('Product not found');

  const producedQty = new Prisma.Decimal(input.quantityProduced);
  const overrideMap = new Map((input.ingredients ?? []).map((i) => [i.bomItemId, i]));

  // Build the consumption plan for both component kinds, verifying stock up front.
  // Quantity/price default to the recipe × live cost, but the caller can override
  // either per line (actual usage can differ from theory; prices fluctuate daily).
  const consumption = product.bom.map((b) => {
    const override = overrideMap.get(b.id);
    const required = override ? new Prisma.Decimal(override.quantity) : new Prisma.Decimal(b.quantity).mul(producedQty);
    if (b.componentType === 'PRODUCT') {
      const cp = b.componentProduct;
      if (!cp) throw AppError.badRequest('A component product in the recipe is missing');
      const unitCost = override ? new Prisma.Decimal(override.unitCost) : new Prisma.Decimal(cp.avgCost);
      const available = new Prisma.Decimal(cp.godownStock?.quantity ?? 0);
      if (available.lessThan(required)) {
        throw AppError.insufficientStock(`Not enough ${cp.name} in godown: need ${required.toString()} ${cp.unit}, have ${available.toString()}`);
      }
      return { kind: 'PRODUCT' as const, id: cp.id, name: cp.name, required, unitCost, belowReorder: false };
    }
    const rm = b.rawMaterial;
    if (!rm) throw AppError.badRequest('A raw material in the recipe is missing');
    const unitCost = override ? new Prisma.Decimal(override.unitCost) : new Prisma.Decimal(rm.costPerUnit);
    if (new Prisma.Decimal(rm.currentStock).lessThan(required)) {
      throw AppError.insufficientStock(`Not enough ${rm.name}: need ${required.toString()} ${rm.unit}, have ${rm.currentStock}`);
    }
    return { kind: 'RAW_MATERIAL' as const, id: rm.id, name: rm.name, required, unitCost, belowReorder: false };
  });

  const materialCost = consumption.reduce((s, c) => s.add(c.unitCost.mul(c.required)), new Prisma.Decimal(0));
  const overheadCost = (input.overheads ?? []).reduce((s, o) => s.add(new Prisma.Decimal(o.amount)), new Prisma.Decimal(0));
  const totalCost = materialCost.add(overheadCost);
  const costPerUnit = producedQty.greaterThan(0) ? totalCost.div(producedQty) : new Prisma.Decimal(0);

  // Roll the batch cost into the product's weighted-average unit cost.
  const oldQty = new Prisma.Decimal(product.godownStock?.quantity ?? 0);
  const oldAvg = new Prisma.Decimal(product.avgCost);
  const newQty = oldQty.add(producedQty);
  const newAvg = newQty.greaterThan(0) ? oldQty.mul(oldAvg).add(totalCost).div(newQty) : costPerUnit;

  const batch = await prisma.$transaction(async (tx) => {
    const batchNumber = input.batchNumber ?? (await nextDocNumber(tx, 'BATCH'));
    const items = consumption.map((c) => ({
      componentType: c.kind,
      rawMaterialId: c.kind === 'RAW_MATERIAL' ? c.id : null,
      componentProductId: c.kind === 'PRODUCT' ? c.id : null,
      nameSnapshot: c.name,
      quantityConsumed: c.required,
      unitCostSnapshot: c.unitCost.toDecimalPlaces(2),
      lineCost: c.unitCost.mul(c.required).toDecimalPlaces(2),
    }));

    const created = await tx.productionBatch.create({
      data: {
        batchNumber,
        productId: product.id,
        quantityProduced: input.quantityProduced,
        totalMaterialCost: materialCost.toDecimalPlaces(2),
        overheadCost: overheadCost.toDecimalPlaces(2),
        costPerUnit: costPerUnit.toDecimalPlaces(2),
        productionDate: input.productionDate,
        notes: input.notes,
        createdById: userId,
        items: { create: items },
        overheads: input.overheads?.length
          ? { create: input.overheads.map((o) => ({ label: o.label, amount: o.amount })) }
          : undefined,
      },
      include: { items: true, overheads: true, product: { select: { name: true, unit: true } } },
    });

    // Deduct consumed components from their respective stock ledgers.
    for (const c of consumption) {
      if (c.kind === 'RAW_MATERIAL') {
        await tx.rawMaterial.update({ where: { id: c.id }, data: { currentStock: { decrement: c.required } } });
      } else {
        await tx.godownStock.update({ where: { productId: c.id }, data: { quantity: { decrement: c.required } } });
      }
    }
    // Add finished goods to the godown + update the product's rolling avg cost.
    await tx.godownStock.upsert({
      where: { productId: product.id },
      create: { productId: product.id, quantity: input.quantityProduced },
      update: { quantity: { increment: input.quantityProduced } },
    });
    await tx.product.update({ where: { id: product.id }, data: { avgCost: newAvg.toDecimalPlaces(2) } });

    return created;
  });

  cache.invalidateTags(CacheTag.INVENTORY, CacheTag.PRODUCTION, CacheTag.DASHBOARD);

  // Low-stock alerts for any consumed raw material below its reorder level.
  for (const c of consumption) {
    if (c.kind !== 'RAW_MATERIAL') continue;
    const fresh = await prisma.rawMaterial.findUnique({ where: { id: c.id }, select: { name: true, currentStock: true, reorderLevel: true } });
    if (fresh && new Prisma.Decimal(fresh.currentStock).lessThan(fresh.reorderLevel)) {
      await emitRealtime(RealtimeEvent.STOCK_LOW, { productName: fresh.name, currentStock: Number(fresh.currentStock), type: 'raw_material' });
    }
  }

  return batch;
}

export async function listBatches(query: ListBatchesQuery) {
  const where: Prisma.ProductionBatchWhereInput = {
    isDeleted: false,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.from || query.to
      ? { productionDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.productionBatch.findMany({
      where,
      orderBy: { productionDate: 'desc' },
      skip,
      take,
      select: {
        id: true, batchNumber: true, quantityProduced: true, totalMaterialCost: true, overheadCost: true, costPerUnit: true, productionDate: true, notes: true,
        product: { select: { id: true, name: true, unit: true } },
      },
    }),
    prisma.productionBatch.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

export async function getBatch(id: string) {
  const batch = await prisma.productionBatch.findFirst({
    where: { id, isDeleted: false },
    include: {
      items: { include: { rawMaterial: { select: { name: true, unit: true } }, componentProduct: { select: { name: true, unit: true } } } },
      overheads: true,
      product: { select: { name: true, unit: true } },
    },
  });
  if (!batch) throw AppError.notFound('Batch not found');
  return batch;
}

/** Log raw-material purchase: increase stock, recompute weighted-average cost. */
export async function logIntake(input: LogIntakeInput, userId: string) {
  const material = await prisma.rawMaterial.findFirst({ where: { id: input.rawMaterialId, isDeleted: false } });
  if (!material) throw AppError.notFound('Raw material not found');

  const oldStock = new Prisma.Decimal(material.currentStock);
  const oldCost = new Prisma.Decimal(material.costPerUnit);
  const addQty = new Prisma.Decimal(input.quantity);
  const addCost = new Prisma.Decimal(input.costPerUnit);
  const newStock = oldStock.add(addQty);
  // Weighted-average cost (guard divide-by-zero).
  const weightedCost = newStock.greaterThan(0)
    ? oldStock.mul(oldCost).add(addQty.mul(addCost)).div(newStock)
    : addCost;

  const intake = await prisma.$transaction(async (tx) => {
    const created = await tx.rawMaterialIntake.create({
      data: {
        rawMaterialId: input.rawMaterialId,
        quantity: addQty,
        costPerUnit: addCost,
        totalCost: addQty.mul(addCost),
        supplierName: input.supplierName ?? material.supplierName,
        invoiceNumber: input.invoiceNumber,
        intakeDate: input.intakeDate,
        notes: input.notes,
        createdById: userId,
      },
      include: { rawMaterial: { select: { name: true, unit: true } } },
    });
    await tx.rawMaterial.update({
      where: { id: input.rawMaterialId },
      data: { currentStock: newStock, costPerUnit: weightedCost.toDecimalPlaces(2) },
    });
    return created;
  });

  cache.invalidateTags(CacheTag.INVENTORY, CacheTag.DASHBOARD);
  return intake;
}

/**
 * Record a purchase bill: one supplier invoice with mixed lines.
 *  • RAW_MATERIAL lines → goods receipt (stock += qty, weighted-avg cost)
 *  • OTHER lines        → booked to an expense category (non-inventory item)
 * All lines commit atomically; "other" lines carry the supplier + invoice so the
 * full bill is reconstructable and shows in the Day Book / Expenses.
 */
export async function logPurchase(input: import('./production.schema').RecordPurchaseInput, userId: string) {
  // Without-GST bills carry no tax at all, regardless of what the client sent per line.
  const items = input.isGstBill ? input.items : input.items.map((it) => ({ ...it, taxRate: 0 }));

  const rmIds = items.flatMap((i) => (i.kind === 'RAW_MATERIAL' ? [i.rawMaterialId] : []));
  const fgIds = items.flatMap((i) => (i.kind === 'FINISHED_GOOD' ? [i.productId] : []));
  const catIds = items.flatMap((i) => (i.kind === 'OTHER' ? [i.categoryId] : []));

  if (rmIds.length && (await prisma.rawMaterial.count({ where: { id: { in: rmIds }, isDeleted: false } })) !== new Set(rmIds).size)
    throw AppError.badRequest('One or more raw materials are invalid');
  if (catIds.length && (await prisma.expenseCategory.count({ where: { id: { in: catIds }, isDeleted: false } })) !== new Set(catIds).size)
    throw AppError.badRequest('One or more expense categories are invalid');

  const products = fgIds.length ? await prisma.product.findMany({ where: { id: { in: fgIds }, isDeleted: false }, select: { id: true, name: true } }) : [];
  if (products.length !== new Set(fgIds).size) throw AppError.badRequest('One or more finished goods are invalid');
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const categories = catIds.length ? await prisma.expenseCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // Per-line taxable base + GST; raw-material/FG cost stays EX-GST (GST = recoverable ITC).
  const lineCalc = items.map((it) => {
    const base = it.kind === 'OTHER' ? new Prisma.Decimal(it.amount) : new Prisma.Decimal(it.quantity).mul(it.costPerUnit);
    const tax = base.mul(it.taxRate).div(100).toDecimalPlaces(2);
    return { base, tax };
  });
  const taxableTotal = lineCalc.reduce((s, l) => s.add(l.base), new Prisma.Decimal(0));
  const taxTotal = lineCalc.reduce((s, l) => s.add(l.tax), new Prisma.Decimal(0));
  const billTotal = taxableTotal.add(taxTotal);
  const paidNow = Prisma.Decimal.min(new Prisma.Decimal(input.amountPaidNow), billTotal);
  const supplierStateCode = input.supplierGstin ? gstinStateCode(input.supplierGstin) : null;
  const { cgst, sgst, igst } = splitGst(Number(taxTotal), supplierStateCode, env.HOME_STATE_CODE);

  const result = await prisma.$transaction(async (tx) => {
    let rawLineCount = 0;
    let fgLineCount = 0;
    let otherLineCount = 0;

    // 1) The payable bill (header) with GST breakup.
    const balance = billTotal.sub(paidNow);
    const status = balance.lessThanOrEqualTo(0) ? 'PAID' : paidNow.greaterThan(0) ? 'PARTIALLY_PAID' : 'UNPAID';
    // Credit terms only mean anything while a balance remains.
    const creditDays = balance.greaterThan(0) ? input.creditDays : undefined;
    const dueDate = creditDays ? addDays(input.intakeDate, creditDays) : null;
    const bill = await tx.supplierBill.create({
      data: {
        billNumber: await nextDocNumber(tx, 'SUPPLIER_BILL'),
        supplierName: input.supplierName,
        supplierGstin: input.supplierGstin,
        invoiceNumber: input.invoiceNumber,
        billDate: input.intakeDate,
        taxableAmount: taxableTotal,
        cgst, sgst, igst,
        taxAmount: taxTotal,
        totalAmount: billTotal,
        amountPaid: paidNow,
        balanceDue: balance,
        status,
        paymentMethod: input.paymentMethod,
        creditDays,
        dueDate,
        isGstBill: input.isGstBill,
        notes: input.notes,
        createdById: userId,
      },
    });

    // 2) Each line: store an itemized bill line + apply its side effect.
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { base, tax } = lineCalc[i];
      const lineTotal = base.add(tax);

      if (item.kind === 'RAW_MATERIAL') {
        const m = await tx.rawMaterial.findUniqueOrThrow({ where: { id: item.rawMaterialId } });
        const oldStock = new Prisma.Decimal(m.currentStock);
        const oldCost = new Prisma.Decimal(m.costPerUnit);
        const addQty = new Prisma.Decimal(item.quantity);
        const addCost = new Prisma.Decimal(item.costPerUnit);
        const newStock = oldStock.add(addQty);
        const weighted = newStock.greaterThan(0) ? oldStock.mul(oldCost).add(addQty.mul(addCost)).div(newStock) : addCost;
        await tx.rawMaterialIntake.create({
          data: {
            rawMaterialId: item.rawMaterialId, quantity: addQty, costPerUnit: addCost, totalCost: base,
            taxRate: item.taxRate, taxAmount: tax, hsnCode: item.hsnCode,
            supplierName: input.supplierName ?? m.supplierName, invoiceNumber: input.invoiceNumber, intakeDate: input.intakeDate,
            notes: input.notes, supplierBillId: bill.id, createdById: userId,
          },
        });
        await tx.rawMaterial.update({ where: { id: item.rawMaterialId }, data: { currentStock: newStock, costPerUnit: weighted.toDecimalPlaces(2) } });
        await tx.supplierBillItem.create({ data: { supplierBillId: bill.id, kind: 'RAW_MATERIAL', refId: item.rawMaterialId, name: m.name, hsnCode: item.hsnCode, quantity: addQty, unitCost: addCost, taxRate: item.taxRate, taxableAmount: base, taxAmount: tax, lineTotal } });
        rawLineCount += 1;
      } else if (item.kind === 'FINISHED_GOOD') {
        // Bought finished goods land in godown finished-goods stock.
        await tx.godownStock.upsert({
          where: { productId: item.productId },
          create: { productId: item.productId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
        await tx.supplierBillItem.create({ data: { supplierBillId: bill.id, kind: 'FINISHED_GOOD', refId: item.productId, name: productName.get(item.productId) ?? 'Product', hsnCode: item.hsnCode, quantity: new Prisma.Decimal(item.quantity), unitCost: new Prisma.Decimal(item.costPerUnit), taxRate: item.taxRate, taxableAmount: base, taxAmount: tax, lineTotal } });
        fgLineCount += 1;
      } else {
        await tx.expense.create({
          data: {
            categoryId: item.categoryId, amount: base, expenseDate: input.intakeDate, paymentMethod: input.paymentMethod,
            taxRate: item.taxRate, taxAmount: tax, hsnCode: item.hsnCode,
            paidTo: input.supplierName, supplierName: input.supplierName, invoiceNumber: input.invoiceNumber,
            note: item.description ?? input.notes, supplierBillId: bill.id, createdById: userId,
          },
        });
        await tx.supplierBillItem.create({ data: { supplierBillId: bill.id, kind: 'OTHER', refId: item.categoryId, name: categoryName.get(item.categoryId) ?? 'Expense', hsnCode: item.hsnCode, taxRate: item.taxRate, taxableAmount: base, taxAmount: tax, lineTotal } });
        otherLineCount += 1;
      }
    }

    // 3) Initial supplier payment (if anything paid at entry).
    if (paidNow.greaterThan(0)) {
      await tx.supplierPayment.create({
        data: {
          paymentNumber: await nextDocNumber(tx, 'SUPPLIER_PAYMENT'),
          supplierBillId: bill.id, amount: paidNow, method: input.paymentMethod,
          paymentDate: input.intakeDate, paidById: userId, createdById: userId,
        },
      });
    }

    return { bill, rawLineCount, fgLineCount, otherLineCount };
  });

  cache.invalidateTags(CacheTag.INVENTORY, CacheTag.EXPENSES, CacheTag.PAYMENTS, CacheTag.ANALYTICS, CacheTag.DASHBOARD);
  return {
    billNumber: result.bill.billNumber,
    invoiceNumber: input.invoiceNumber,
    supplierName: input.supplierName,
    intakeDate: input.intakeDate,
    totalCost: billTotal,
    amountPaid: paidNow,
    balanceDue: result.bill.balanceDue,
    status: result.bill.status,
    lineCount: result.rawLineCount + result.fgLineCount + result.otherLineCount,
  };
}

export interface ListPurchasesQuery { status?: string; search?: string }

/** Purchase bills (supplier bills) for the Purchases register. */
export async function listPurchases(query: ListPurchasesQuery = {}) {
  const where: Prisma.SupplierBillWhereInput = {
    isDeleted: false,
    ...(query.status ? { status: query.status as Prisma.EnumSupplierBillStatusFilter['equals'] } : {}),
    ...(query.search
      ? { OR: [{ supplierName: { contains: query.search, mode: 'insensitive' } }, { invoiceNumber: { contains: query.search, mode: 'insensitive' } }, { billNumber: { contains: query.search, mode: 'insensitive' } }] }
      : {}),
  };
  return prisma.supplierBill.findMany({
    where, orderBy: { billDate: 'desc' }, take: 200,
    select: {
      id: true, billNumber: true, supplierName: true, supplierGstin: true, invoiceNumber: true, billDate: true,
      taxableAmount: true, taxAmount: true, totalAmount: true, amountPaid: true, balanceDue: true, status: true,
      creditDays: true, dueDate: true, isGstBill: true,
      _count: { select: { items: true } },
    },
  });
}

/** Full itemized purchase bill with GST breakup + payments. */
export async function getPurchaseDetail(id: string) {
  const bill = await prisma.supplierBill.findFirst({
    where: { id, isDeleted: false },
    include: { items: { where: { isDeleted: false } }, payments: { where: { isDeleted: false }, orderBy: { paymentDate: 'desc' } } },
  });
  if (!bill) throw AppError.notFound('Purchase bill not found');
  return bill;
}

export async function listIntake(query: ListIntakeQuery) {
  const where: Prisma.RawMaterialIntakeWhereInput = {
    isDeleted: false,
    ...(query.rawMaterialId ? { rawMaterialId: query.rawMaterialId } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.rawMaterialIntake.findMany({
      where,
      orderBy: { intakeDate: 'desc' },
      skip,
      take,
      include: { rawMaterial: { select: { name: true, unit: true } } },
    }),
    prisma.rawMaterialIntake.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

/** Finished-goods stock at the godown (per product). */
export async function getGodownStock() {
  return prisma.godownStock.findMany({
    where: { isDeleted: false, product: { isDeleted: false } },
    orderBy: { product: { name: 'asc' } },
    select: {
      quantity: true,
      product: { select: { id: true, name: true, sku: true, unit: true, reorderLevel: true } },
    },
  });
}

export const productionService = { logBatch, listBatches, getBatch, logIntake, listIntake, logPurchase, listPurchases, getPurchaseDetail, getGodownStock };
