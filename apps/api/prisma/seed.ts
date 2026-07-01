/* eslint-disable no-console */
import {
  PrismaClient,
  UserRole,
  MeasurementUnit,
  OutletOrderStatus,
  StockTransferStatus,
  BillStatus,
  PaymentChannel,
  PaymentMethod,
  ExpenseLocation,
  PosSessionStatus,
  PosTransactionStatus,
  PosPaymentMode,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const hash = (pwd: string): Promise<string> => bcrypt.hash(pwd, 10);
const daysFromNow = (d: number): Date => new Date(Date.now() + d * 86_400_000);
const daysAgo = (d: number): Date => new Date(Date.now() - d * 86_400_000);

async function wipe(): Promise<void> {
  // Dev-only clean slate. TRUNCATE does not fire row-level audit triggers.
  const tables = [
    'pos_transaction_items', 'pos_transactions', 'pos_sessions',
    'payment_audit', 'payments', 'bill_audit', 'bill_items', 'bills',
    'outlet_order_items', 'outlet_orders',
    'stock_transfer_audit', 'stock_transfer_items', 'stock_transfers',
    'production_batch_audit', 'production_batch_items', 'production_batches',
    'raw_material_intake', 'bill_of_materials',
    'outlet_stock', 'main_branch_stock', 'godown_stock',
    'expenses', 'expense_categories',
    'products', 'product_categories', 'raw_materials',
    'analytics_snapshots', 'document_counters',
    'user_sessions', 'users', 'outlets',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
}

async function main(): Promise<void> {
  console.log('🌱 Seeding Surat Food Chain...');
  await wipe();

  // ── Outlets (created first; owners linked after users exist) ───────────────
  const [adajan, vesu, katargam] = await Promise.all([
    prisma.outlet.create({ data: { name: 'Adajan Outlet', code: 'OUT-ADJ', address: 'Adajan Gam Rd, Surat', phone: '+91 90000 11111', creditPeriodDays: 15 } }),
    prisma.outlet.create({ data: { name: 'Vesu Outlet', code: 'OUT-VESU', address: 'VIP Rd, Vesu, Surat', phone: '+91 90000 22222', creditPeriodDays: 30 } }),
    prisma.outlet.create({ data: { name: 'Katargam Outlet', code: 'OUT-KAT', address: 'Katargam Main Rd, Surat', phone: '+91 90000 33333', creditPeriodDays: 7 } }),
  ]);

  // ── Users ──────────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: { userId: 'ADMIN001', email: 'admin@suratfood.com', name: 'Ramesh Patel', phone: '+91 99999 00001', role: UserRole.SUPER_ADMIN, passwordHash: await hash('Admin@123') },
  });
  const godown = await prisma.user.create({
    data: { userId: 'GODOWN001', email: 'godown@suratfood.com', name: 'Suresh Shah', phone: '+91 99999 00002', role: UserRole.GODOWN_MANAGER, passwordHash: await hash('Godown@123'), createdById: admin.id },
  });

  const owner1 = await prisma.user.create({ data: { userId: 'OWNER001', email: 'owner.adajan@suratfood.com', name: 'Kiran Mehta', phone: '+91 99999 11111', role: UserRole.FRANCHISE_OWNER, outletId: adajan.id, passwordHash: await hash('Owner@123'), createdById: admin.id } });
  const owner2 = await prisma.user.create({ data: { userId: 'OWNER002', email: 'owner.vesu@suratfood.com', name: 'Nilesh Desai', phone: '+91 99999 22222', role: UserRole.FRANCHISE_OWNER, outletId: vesu.id, passwordHash: await hash('Owner@123'), createdById: admin.id } });
  const owner3 = await prisma.user.create({ data: { userId: 'OWNER003', email: 'owner.katargam@suratfood.com', name: 'Bhavna Joshi', phone: '+91 99999 33333', role: UserRole.FRANCHISE_OWNER, outletId: katargam.id, passwordHash: await hash('Owner@123'), createdById: admin.id } });

  await prisma.user.create({ data: { userId: 'CASH001', email: 'cashier.adajan@suratfood.com', name: 'Amit Prajapati', role: UserRole.CASHIER, outletId: adajan.id, passwordHash: await hash('Cashier@123'), createdById: admin.id } });

  await Promise.all([
    prisma.outlet.update({ where: { id: adajan.id }, data: { ownerUserId: owner1.id, createdById: admin.id } }),
    prisma.outlet.update({ where: { id: vesu.id }, data: { ownerUserId: owner2.id, createdById: admin.id } }),
    prisma.outlet.update({ where: { id: katargam.id }, data: { ownerUserId: owner3.id, createdById: admin.id } }),
  ]);

  // ── Categories ──────────────────────────────────────────────────────────────
  const catNames = ['Namkeen', 'Sweets', 'Farsan', 'Snacks', 'Beverages'];
  const cats = await Promise.all(
    catNames.map((name) => prisma.productCategory.create({ data: { name, createdById: admin.id } })),
  );
  const catId = (n: string): string => cats[catNames.indexOf(n)].id;

  // ── Raw materials (10) ───────────────────────────────────────────────────────
  const rmDefs: Array<{ name: string; unit: MeasurementUnit; cost: number; stock: number; reorder: number; supplier: string }> = [
    { name: 'Potato', unit: MeasurementUnit.KG, cost: 25, stock: 500, reorder: 100, supplier: 'APMC Surat' },
    { name: 'Gram Flour (Besan)', unit: MeasurementUnit.KG, cost: 80, stock: 300, reorder: 80, supplier: 'Shree Flour Mills' },
    { name: 'Wheat Flour', unit: MeasurementUnit.KG, cost: 40, stock: 400, reorder: 100, supplier: 'Shree Flour Mills' },
    { name: 'Refined Oil', unit: MeasurementUnit.LITRE, cost: 130, stock: 250, reorder: 60, supplier: 'Gokul Oils' },
    { name: 'Sugar', unit: MeasurementUnit.KG, cost: 45, stock: 200, reorder: 50, supplier: 'Sayan Sugars' },
    { name: 'Salt', unit: MeasurementUnit.KG, cost: 20, stock: 150, reorder: 30, supplier: 'Tata Salt Distributor' },
    { name: 'Spice Mix', unit: MeasurementUnit.KG, cost: 220, stock: 80, reorder: 20, supplier: 'MDH Distributor' },
    { name: 'Ghee', unit: MeasurementUnit.KG, cost: 550, stock: 60, reorder: 15, supplier: 'Amul Dairy' },
    { name: 'Milk', unit: MeasurementUnit.LITRE, cost: 60, stock: 100, reorder: 40, supplier: 'Sumul Dairy' },
    { name: 'Packaging Pouch', unit: MeasurementUnit.PIECE, cost: 2, stock: 5000, reorder: 1000, supplier: 'Pack India' },
  ];
  const rms = await Promise.all(
    rmDefs.map((r) => prisma.rawMaterial.create({ data: { name: r.name, unit: r.unit, costPerUnit: r.cost, currentStock: r.stock, reorderLevel: r.reorder, supplierName: r.supplier, createdById: admin.id } })),
  );
  const rm = (name: string) => rms[rmDefs.findIndex((d) => d.name === name)];

  // ── Products (20) ────────────────────────────────────────────────────────────
  const prodDefs: Array<{ name: string; sku: string; cat: string; unit: MeasurementUnit; base: number; mrp: number; tax: number; reorder: number }> = [
    { name: 'Aloo Puri', sku: 'SKU-ALOOPURI', cat: 'Farsan', unit: MeasurementUnit.PACKET, base: 90, mrp: 120, tax: 5, reorder: 40 },
    { name: 'Aloo Bhujia', sku: 'SKU-ALOOBHUJIA', cat: 'Namkeen', unit: MeasurementUnit.PACKET, base: 70, mrp: 95, tax: 12, reorder: 50 },
    { name: 'Sev Mamra', sku: 'SKU-SEVMAMRA', cat: 'Namkeen', unit: MeasurementUnit.PACKET, base: 60, mrp: 80, tax: 12, reorder: 50 },
    { name: 'Khaman Dhokla', sku: 'SKU-KHAMAN', cat: 'Farsan', unit: MeasurementUnit.BOX, base: 110, mrp: 150, tax: 5, reorder: 30 },
    { name: 'Fafda', sku: 'SKU-FAFDA', cat: 'Farsan', unit: MeasurementUnit.PACKET, base: 80, mrp: 110, tax: 5, reorder: 40 },
    { name: 'Gathiya', sku: 'SKU-GATHIYA', cat: 'Namkeen', unit: MeasurementUnit.PACKET, base: 75, mrp: 100, tax: 12, reorder: 40 },
    { name: 'Mathiya', sku: 'SKU-MATHIYA', cat: 'Namkeen', unit: MeasurementUnit.PACKET, base: 85, mrp: 115, tax: 12, reorder: 30 },
    { name: 'Chorafali', sku: 'SKU-CHORAFALI', cat: 'Namkeen', unit: MeasurementUnit.PACKET, base: 95, mrp: 130, tax: 12, reorder: 30 },
    { name: 'Mohanthal', sku: 'SKU-MOHANTHAL', cat: 'Sweets', unit: MeasurementUnit.BOX, base: 260, mrp: 340, tax: 5, reorder: 20 },
    { name: 'Jalebi', sku: 'SKU-JALEBI', cat: 'Sweets', unit: MeasurementUnit.KG, base: 180, mrp: 240, tax: 5, reorder: 25 },
    { name: 'Gulab Jamun', sku: 'SKU-GULABJAMUN', cat: 'Sweets', unit: MeasurementUnit.BOX, base: 200, mrp: 280, tax: 5, reorder: 25 },
    { name: 'Penda', sku: 'SKU-PENDA', cat: 'Sweets', unit: MeasurementUnit.BOX, base: 240, mrp: 320, tax: 5, reorder: 20 },
    { name: 'Samosa', sku: 'SKU-SAMOSA', cat: 'Snacks', unit: MeasurementUnit.PIECE, base: 12, mrp: 18, tax: 5, reorder: 100 },
    { name: 'Kachori', sku: 'SKU-KACHORI', cat: 'Snacks', unit: MeasurementUnit.PIECE, base: 14, mrp: 20, tax: 5, reorder: 100 },
    { name: 'Dabeli', sku: 'SKU-DABELI', cat: 'Snacks', unit: MeasurementUnit.PIECE, base: 20, mrp: 30, tax: 5, reorder: 80 },
    { name: 'Khakhra', sku: 'SKU-KHAKHRA', cat: 'Farsan', unit: MeasurementUnit.PACKET, base: 55, mrp: 75, tax: 5, reorder: 60 },
    { name: 'Thepla', sku: 'SKU-THEPLA', cat: 'Farsan', unit: MeasurementUnit.PACKET, base: 65, mrp: 90, tax: 5, reorder: 50 },
    { name: 'Masala Chaas', sku: 'SKU-CHAAS', cat: 'Beverages', unit: MeasurementUnit.PIECE, base: 15, mrp: 25, tax: 12, reorder: 80 },
    { name: 'Lassi', sku: 'SKU-LASSI', cat: 'Beverages', unit: MeasurementUnit.PIECE, base: 25, mrp: 40, tax: 12, reorder: 60 },
    { name: 'Masala Soda', sku: 'SKU-SODA', cat: 'Beverages', unit: MeasurementUnit.PIECE, base: 18, mrp: 30, tax: 18, reorder: 60 },
  ];
  const products = await Promise.all(
    prodDefs.map((p) => prisma.product.create({ data: { name: p.name, sku: p.sku, categoryId: catId(p.cat), unit: p.unit, basePrice: p.base, mrp: p.mrp, taxPercent: p.tax, reorderLevel: p.reorder, batchTrackingEnabled: true, createdById: admin.id } })),
  );
  const prod = (sku: string) => products[prodDefs.findIndex((d) => d.sku === sku)];

  // ── Bill of materials (representative) ───────────────────────────────────────
  const bomData: Array<{ sku: string; mats: Array<[string, number]> }> = [
    { sku: 'SKU-ALOOPURI', mats: [['Potato', 0.3], ['Wheat Flour', 0.2], ['Refined Oil', 0.1], ['Spice Mix', 0.02], ['Packaging Pouch', 1]] },
    { sku: 'SKU-ALOOBHUJIA', mats: [['Gram Flour (Besan)', 0.4], ['Refined Oil', 0.15], ['Spice Mix', 0.03], ['Packaging Pouch', 1]] },
    { sku: 'SKU-GATHIYA', mats: [['Gram Flour (Besan)', 0.45], ['Refined Oil', 0.15], ['Salt', 0.02], ['Packaging Pouch', 1]] },
    { sku: 'SKU-JALEBI', mats: [['Wheat Flour', 0.3], ['Sugar', 0.4], ['Refined Oil', 0.2]] },
    { sku: 'SKU-MOHANTHAL', mats: [['Gram Flour (Besan)', 0.5], ['Ghee', 0.3], ['Sugar', 0.4]] },
    { sku: 'SKU-SAMOSA', mats: [['Wheat Flour', 0.05], ['Potato', 0.06], ['Refined Oil', 0.02], ['Spice Mix', 0.005]] },
  ];
  for (const b of bomData) {
    await Promise.all(
      b.mats.map(([mat, qty]) =>
        prisma.billOfMaterials.create({ data: { productId: prod(b.sku).id, rawMaterialId: rm(mat).id, quantity: qty, createdById: admin.id } }),
      ),
    );
  }

  // ── Stock ledgers ────────────────────────────────────────────────────────────
  await Promise.all(products.map((p) => prisma.godownStock.create({ data: { productId: p.id, quantity: 200 } })));
  await Promise.all(products.map((p) => prisma.mainBranchStock.create({ data: { productId: p.id, quantity: 120 } })));
  for (const outlet of [adajan, vesu, katargam]) {
    await Promise.all(
      products.slice(0, 12).map((p, i) =>
        prisma.outletStock.create({ data: { outletId: outlet.id, productId: p.id, quantity: 20 + ((i * 3) % 25) } }),
      ),
    );
  }

  // ── Production batches ────────────────────────────────────────────────────────
  let batchSeq = 0;
  for (const sku of ['SKU-ALOOPURI', 'SKU-ALOOBHUJIA', 'SKU-JALEBI']) {
    batchSeq += 1;
    const p = prod(sku);
    const bom = bomData.find((b) => b.sku === sku);
    const qty = 100;
    const items = (bom?.mats ?? []).map(([mat, perUnit]) => {
      const material = rm(mat);
      const consumed = perUnit * qty;
      return { rawMaterialId: material.id, quantityConsumed: consumed, unitCostSnapshot: Number(material.costPerUnit), lineCost: consumed * Number(material.costPerUnit) };
    });
    const totalCost = items.reduce((s, it) => s + it.lineCost, 0);
    await prisma.productionBatch.create({
      data: {
        batchNumber: `BATCH-2025-${String(batchSeq).padStart(5, '0')}`,
        productId: p.id,
        quantityProduced: qty,
        totalMaterialCost: totalCost,
        productionDate: daysAgo(batchSeq * 3),
        notes: 'Seed batch',
        createdById: godown.id,
        items: { create: items },
      },
    });
  }

  // ── Stock transfer (godown → main) ─────────────────────────────────────────────
  await prisma.stockTransfer.create({
    data: {
      transferNumber: 'TRF-2025-00001',
      status: StockTransferStatus.RECEIVED,
      transferDate: daysAgo(5),
      dispatchedAt: daysAgo(5),
      receivedAt: daysAgo(4),
      vehicleNumber: 'GJ-05-AB-1234',
      createdById: godown.id,
      items: { create: [
        { productId: prod('SKU-ALOOPURI').id, quantity: 50 },
        { productId: prod('SKU-ALOOBHUJIA').id, quantity: 40 },
      ] },
    },
  });

  // ── Outlet orders + bills + payments ────────────────────────────────────────────
  const orderSpecs: Array<{ outlet: typeof adajan; owner: typeof owner1; status: OutletOrderStatus; items: Array<[string, number]>; daysOld: number; bill?: { paid: number; channel: PaymentChannel; method: PaymentMethod } }> = [
    { outlet: adajan, owner: owner1, status: OutletOrderStatus.DELIVERED, daysOld: 10, items: [['SKU-ALOOPURI', 20], ['SKU-KHAMAN', 10], ['SKU-JALEBI', 5]], bill: { paid: 0, channel: PaymentChannel.CASH, method: PaymentMethod.CASH } },
    { outlet: vesu, owner: owner2, status: OutletOrderStatus.DELIVERED, daysOld: 8, items: [['SKU-ALOOBHUJIA', 15], ['SKU-GATHIYA', 15], ['SKU-PENDA', 8]], bill: { paid: 1500, channel: PaymentChannel.CASH, method: PaymentMethod.CASH } },
    { outlet: katargam, owner: owner3, status: OutletOrderStatus.DELIVERED, daysOld: 3, items: [['SKU-SAMOSA', 50], ['SKU-KACHORI', 50], ['SKU-LASSI', 20]], bill: { paid: 9999, channel: PaymentChannel.DIGITAL, method: PaymentMethod.RAZORPAY } },
    { outlet: adajan, owner: owner1, status: OutletOrderStatus.PENDING, daysOld: 1, items: [['SKU-FAFDA', 10], ['SKU-MATHIYA', 10]] },
    { outlet: vesu, owner: owner2, status: OutletOrderStatus.CONFIRMED, daysOld: 0, items: [['SKU-MOHANTHAL', 6], ['SKU-GULABJAMUN', 6]] },
  ];

  let orderSeq = 0;
  let billSeq = 0;
  let paymentSeq = 0;
  for (const spec of orderSpecs) {
    orderSeq += 1;
    const orderItems = spec.items.map(([sku, qty]) => {
      const p = prod(sku);
      return { productId: p.id, requestedQuantity: qty, confirmedQuantity: spec.status === OutletOrderStatus.PENDING ? null : qty, unitPriceSnapshot: Number(p.basePrice) };
    });
    const order = await prisma.outletOrder.create({
      data: {
        orderNumber: `ORD-2025-${String(orderSeq).padStart(5, '0')}`,
        outletId: spec.outlet.id,
        status: spec.status,
        orderDate: daysAgo(spec.daysOld),
        confirmedAt: spec.status === OutletOrderStatus.PENDING ? null : daysAgo(spec.daysOld),
        deliveredAt: spec.status === OutletOrderStatus.DELIVERED ? daysAgo(spec.daysOld - 1) : null,
        createdById: spec.owner.id,
        items: { create: orderItems },
      },
    });

    if (spec.bill) {
      billSeq += 1;
      const billItems = spec.items.map(([sku, qty]) => {
        const p = prod(sku);
        const rate = Number(p.basePrice);
        const lineBase = rate * qty;
        const taxAmount = (lineBase * Number(p.taxPercent)) / 100;
        return { productId: p.id, productNameSnapshot: p.name, quantity: qty, rate, taxPercent: Number(p.taxPercent), taxAmount, lineTotal: lineBase + taxAmount };
      });
      const subTotal = billItems.reduce((s, it) => s + it.rate * Number(it.quantity), 0);
      const taxTotal = billItems.reduce((s, it) => s + Number(it.taxAmount), 0);
      const grandTotal = subTotal + taxTotal;
      const amountPaid = Math.min(spec.bill.paid, grandTotal);
      const balanceDue = grandTotal - amountPaid;
      const status = amountPaid <= 0 ? BillStatus.UNPAID : amountPaid >= grandTotal ? BillStatus.PAID : BillStatus.PARTIALLY_PAID;

      const bill = await prisma.bill.create({
        data: {
          billNumber: `BL-2025-${String(billSeq).padStart(5, '0')}`,
          outletId: spec.outlet.id,
          orderId: order.id,
          billDate: daysAgo(spec.daysOld - 1),
          dueDate: daysFromNow(spec.outlet.creditPeriodDays - (spec.daysOld - 1)),
          subTotal, taxTotal, grandTotal, amountPaid, balanceDue, status,
          lockedAt: new Date(),
          createdById: admin.id,
          items: { create: billItems.map((it) => ({ ...it, lockedAt: new Date() })) },
        },
      });

      if (amountPaid > 0) {
        paymentSeq += 1;
        await prisma.payment.create({
          data: {
            paymentNumber: `PAY-2025-${String(paymentSeq).padStart(5, '0')}`,
            billId: bill.id,
            outletId: spec.outlet.id,
            channel: spec.bill.channel,
            method: spec.bill.method,
            amount: amountPaid,
            paymentDate: daysAgo(spec.daysOld - 2),
            receivedById: spec.bill.channel === PaymentChannel.CASH ? admin.id : null,
            razorpayPaymentId: spec.bill.channel === PaymentChannel.DIGITAL ? `pay_seed_${paymentSeq}` : null,
            notes: 'Seed payment',
            createdById: admin.id,
          },
        });
      }
    }
  }

  // ── Expense categories (pre-seeded, per spec) + sample expenses ──────────────
  const expenseCats = [
    'Godown Rent', 'Godown Utilities', 'Godown Staff Salary', 'Godown Maintenance',
    'Main Shop Rent', 'Main Shop Utilities', 'Main Shop Staff Salary',
    'Vehicle / Transport', 'Packaging Material', 'Miscellaneous',
  ];
  const expCats = await Promise.all(
    expenseCats.map((name) => prisma.expenseCategory.create({ data: { name, isSystem: true, createdById: admin.id } })),
  );
  const expCat = (n: string) => expCats[expenseCats.indexOf(n)];

  await Promise.all([
    prisma.expense.create({ data: { categoryId: expCat('Godown Rent').id, amount: 35000, expenseDate: daysAgo(20), paymentMethod: PaymentMethod.BANK_TRANSFER, paidTo: 'Landlord', location: ExpenseLocation.GODOWN, createdById: admin.id } }),
    prisma.expense.create({ data: { categoryId: expCat('Main Shop Rent').id, amount: 45000, expenseDate: daysAgo(20), paymentMethod: PaymentMethod.BANK_TRANSFER, paidTo: 'Landlord', location: ExpenseLocation.MAIN_BRANCH, createdById: admin.id } }),
    prisma.expense.create({ data: { categoryId: expCat('Vehicle / Transport').id, amount: 8500, expenseDate: daysAgo(6), paymentMethod: PaymentMethod.UPI, paidTo: 'Transport Vendor', location: ExpenseLocation.GENERAL, createdById: godown.id } }),
    prisma.expense.create({ data: { categoryId: expCat('Packaging Material').id, amount: 12000, expenseDate: daysAgo(12), paymentMethod: PaymentMethod.CASH, paidTo: 'Pack India', location: ExpenseLocation.GODOWN, createdById: godown.id } }),
    prisma.expense.create({ data: { categoryId: expCat('Godown Staff Salary').id, amount: 60000, expenseDate: daysAgo(1), paymentMethod: PaymentMethod.BANK_TRANSFER, paidTo: 'Godown Staff', location: ExpenseLocation.GODOWN, createdById: admin.id } }),
  ]);

  // ── POS: one open session at Adajan + a completed sale ──────────────────────
  const posSession = await prisma.posSession.create({
    data: { sessionNumber: 'POS-2025-00001', outletId: adajan.id, openedById: owner1.id, openedAt: daysAgo(0), status: PosSessionStatus.OPEN, openingCash: 2000 },
  });
  const saleItems = [
    { p: prod('SKU-SAMOSA'), qty: 4 },
    { p: prod('SKU-LASSI'), qty: 2 },
  ].map(({ p, qty }) => {
    const unitPrice = Number(p.mrp);
    const base = unitPrice * qty;
    const taxAmount = (base * Number(p.taxPercent)) / 100;
    return { productId: p.id, productNameSnapshot: p.name, quantity: qty, unitPrice, discount: 0, taxPercent: Number(p.taxPercent), taxAmount, lineTotal: base + taxAmount };
  });
  const posSub = saleItems.reduce((s, it) => s + it.unitPrice * Number(it.quantity), 0);
  const posTax = saleItems.reduce((s, it) => s + Number(it.taxAmount), 0);
  const posGrand = posSub + posTax;
  await prisma.posTransaction.create({
    data: {
      receiptNumber: 'RCP-2025-00001', sessionId: posSession.id, outletId: adajan.id, status: PosTransactionStatus.COMPLETED,
      subTotal: posSub, taxTotal: posTax, grandTotal: posGrand, paymentMode: PosPaymentMode.CASH,
      cashReceived: Math.ceil(posGrand / 10) * 10, changeGiven: Math.ceil(posGrand / 10) * 10 - posGrand, cashAmount: posGrand,
      soldById: owner1.id, soldAt: daysAgo(0),
      items: { create: saleItems },
    },
  });
  await prisma.posSession.update({ where: { id: posSession.id }, data: { totalSales: posGrand, cashCollected: posGrand } });

  // ── Advance document counters so API-created docs continue the sequences ─────
  await Promise.all([
    prisma.documentCounter.create({ data: { key: 'ORDER', value: BigInt(orderSeq) } }),
    prisma.documentCounter.create({ data: { key: 'BILL', value: BigInt(billSeq) } }),
    prisma.documentCounter.create({ data: { key: 'PAYMENT', value: BigInt(paymentSeq) } }),
    prisma.documentCounter.create({ data: { key: 'TRANSFER', value: BigInt(1) } }),
    prisma.documentCounter.create({ data: { key: 'BATCH', value: BigInt(batchSeq) } }),
    prisma.documentCounter.create({ data: { key: 'POS_RECEIPT', value: BigInt(1) } }),
    prisma.documentCounter.create({ data: { key: 'POS_SESSION', value: BigInt(1) } }),
    prisma.documentCounter.create({ data: { key: 'USER_CODE', value: BigInt(1) } }),
  ]);

  // Refresh analytics MVs with the new data.
  await prisma.$executeRawUnsafe('SELECT refresh_analytics_views()');

  console.log('✅ Seed complete.');
  console.log('   Super Admin → admin@suratfood.com / Admin@123  (or user ID ADMIN001)');
  console.log('   Godown Mgr  → godown@suratfood.com / Godown@123 (GODOWN001)');
  console.log('   Owner       → owner.adajan@suratfood.com / Owner@123 (OWNER001)');
  console.log('   Cashier     → cashier.adajan@suratfood.com / Cashier@123 (CASH001)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
