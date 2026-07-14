import path from 'node:path';
import fs from 'node:fs/promises';
import { OutletDocumentCategory, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../shared/utils/AppError';
import type { AuthUser } from '../../shared/types/api';
import type { UploadDocumentInput } from './outlets.schema';

const documentSelect = {
  id: true, outletId: true, title: true, category: true, fileName: true,
  mimeType: true, sizeBytes: true, notes: true, createdAt: true,
} as const;

/**
 * Outlet paperwork (GST certificate, food licence, franchise agreement…).
 *
 * Files live under UPLOAD_DIR/private/outlet-docs, deliberately outside the
 * publicly-served /uploads route — these are licences and signed agreements, so
 * the bytes only ever leave through `readDocumentFile`, which re-checks the
 * caller every time.
 */
export const DOCS_DIR = path.resolve(process.cwd(), env.UPLOAD_DIR, 'private', 'outlet-docs');

/** The main owner sees every outlet's papers; an outlet's own staff see only theirs. */
function assertCanRead(user: AuthUser, outletId: string) {
  if (user.role === UserRole.SUPER_ADMIN) return;
  if (user.outletId === outletId) return;
  throw AppError.forbidden();
}

export async function listDocuments(user: AuthUser, outletId: string) {
  assertCanRead(user, outletId);
  return prisma.outletDocument.findMany({
    where: { outletId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    select: documentSelect,
  });
}

export async function addDocument(
  user: AuthUser,
  outletId: string,
  file: Express.Multer.File,
  input: UploadDocumentInput,
) {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false }, select: { id: true } });
  if (!outlet) {
    // Nothing should be left on disk for an outlet that doesn't exist.
    await fs.unlink(file.path).catch(() => undefined);
    throw AppError.notFound('Outlet not found');
  }

  return prisma.outletDocument.create({
    data: {
      outletId,
      title: input.title,
      category: input.category ?? OutletDocumentCategory.OTHER,
      notes: input.notes,
      fileName: file.originalname,
      // Store the path relative to the docs dir; the absolute location is resolved
      // at read time, so moving UPLOAD_DIR later doesn't invalidate every row.
      storagePath: path.basename(file.path),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedById: user.id,
    },
    select: documentSelect,
  });
}

/** Resolve a document to bytes on disk, after checking the caller may see it. */
export async function readDocumentFile(user: AuthUser, outletId: string, docId: string) {
  const doc = await prisma.outletDocument.findFirst({
    where: { id: docId, outletId, isDeleted: false },
    select: { fileName: true, mimeType: true, storagePath: true },
  });
  if (!doc) throw AppError.notFound('Document not found');
  assertCanRead(user, outletId);

  // storagePath is a bare filename we generated; re-join and confirm it still
  // resolves inside DOCS_DIR so a tampered row can't escape the directory.
  const abs = path.resolve(DOCS_DIR, doc.storagePath);
  if (!abs.startsWith(DOCS_DIR + path.sep)) throw AppError.notFound('Document not found');
  try {
    await fs.access(abs);
  } catch {
    throw AppError.notFound('The stored file is missing');
  }
  return { absolutePath: abs, fileName: doc.fileName, mimeType: doc.mimeType };
}

/** Soft-delete: the row goes, the file stays on disk for auditability. */
export async function deleteDocument(outletId: string, docId: string) {
  const doc = await prisma.outletDocument.findFirst({ where: { id: docId, outletId, isDeleted: false } });
  if (!doc) throw AppError.notFound('Document not found');
  await prisma.outletDocument.update({ where: { id: docId }, data: { isDeleted: true } });
  return { deleted: true };
}

export const documentsService = { listDocuments, addDocument, readDocumentFile, deleteDocument, DOCS_DIR };
