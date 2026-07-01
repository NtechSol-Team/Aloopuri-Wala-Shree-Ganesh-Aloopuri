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
