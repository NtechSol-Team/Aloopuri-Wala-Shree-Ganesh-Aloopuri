import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../../config/env';
import { AppError } from '../utils/AppError';
import { ErrorCode } from '../types/api';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Multer factory: stores an uploaded image under uploads/<subdir>/. */
export function imageUpload(subdir: string) {
  const dir = path.resolve(process.cwd(), env.UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED.has(file.mimetype)) {
        cb(new AppError({ statusCode: 400, code: ErrorCode.VALIDATION_ERROR, message: 'Only JPG, PNG, or WebP images are allowed' }));
        return;
      }
      cb(null, true);
    },
  });
}

/** Public URL for a stored upload. */
export function uploadUrl(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

const DOC_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * Multer factory for outlet paperwork (GST certificates, licences, agreements).
 *
 * Unlike `imageUpload`, these land under uploads/private/… which is NOT served by
 * the static /uploads route — the files are only ever streamed back through an
 * authenticated endpoint. Scans are usually PDFs, so those are allowed too.
 */
export function documentUpload(subdir: string) {
  const dir = path.resolve(process.cwd(), env.UPLOAD_DIR, 'private', subdir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      // Never reuse the client's filename: it would let a caller pick the path.
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.bin';
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!DOC_TYPES.has(file.mimetype)) {
        cb(new AppError({
          statusCode: 400,
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Upload a PDF, JPG, PNG or WebP file',
        }));
        return;
      }
      cb(null, true);
    },
  });
}
