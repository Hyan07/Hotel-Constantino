import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRoles } from '../middleware/auth.js';
import { HttpError } from '../utils/http-error.js';
import { normalizeStoragePath } from '../utils/safe.js';

const uploadSchema = z.object({
  bucket: z.enum(['guest-documents', 'receipts']),
  path: z.string().min(3).max(400)
});

const downloadSchema = z.object({
  bucket: z.enum(['guest-documents', 'receipts']),
  path: z.string().min(3).max(400)
});

function assertConfiguredBucket(bucket) {
  const allowed = [env.STORAGE_GUEST_DOCUMENTS_BUCKET, env.STORAGE_RECEIPTS_BUCKET];
  if (!allowed.includes(bucket)) throw new HttpError(400, 'Bucket não autorizado.', 'INVALID_BUCKET');
}

export const storageRouter = Router();

storageRouter.post('/signed-upload', requireRoles('admin', 'reception'), async (request, response, next) => {
  try {
    const input = uploadSchema.parse(request.body);
    assertConfiguredBucket(input.bucket);
    const path = normalizeStoragePath(input.path);
    if (!path) throw new HttpError(400, 'Caminho de arquivo inválido.', 'INVALID_PATH');

    const { data, error } = await supabaseAdmin.storage.from(input.bucket).createSignedUploadUrl(path, {
      upsert: false
    });
    if (error) throw new HttpError(400, error.message, error.name);
    response.json({ ok: true, data: { path, token: data.token, signedUrl: data.signedUrl } });
  } catch (error) {
    next(error);
  }
});

storageRouter.post('/signed-download', requireRoles('admin', 'reception'), async (request, response, next) => {
  try {
    const input = downloadSchema.parse(request.body);
    assertConfiguredBucket(input.bucket);
    const path = normalizeStoragePath(input.path);
    if (!path) throw new HttpError(400, 'Caminho de arquivo inválido.', 'INVALID_PATH');

    const { data, error } = await supabaseAdmin.storage
      .from(input.bucket)
      .createSignedUrl(path, env.SIGNED_URL_TTL_SECONDS, { download: false });
    if (error) throw new HttpError(404, error.message, error.name);
    response.json({ ok: true, data: { signedUrl: data.signedUrl, expiresIn: env.SIGNED_URL_TTL_SECONDS } });
  } catch (error) {
    next(error);
  }
});
