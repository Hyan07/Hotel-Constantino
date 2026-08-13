import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env.js';
import { query, withTransaction } from '../lib/db.js';
import { requireRoles } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { HttpError, assertFound } from '../utils/http-error.js';
import { normalizeStoragePath, requestIp } from '../utils/safe.js';

const allowedBuckets = ['guest-documents', 'receipts'];
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
const storageInput = z.object({
  bucket: z.enum(allowedBuckets),
  path: z.string().min(3).max(400)
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(_request, file, callback) {
    if (!allowedMimeTypes.includes(file.mimetype)) return callback(new HttpError(400, 'Formato de arquivo não permitido.', 'INVALID_FILE_TYPE'));
    callback(null, true);
  }
});

export const storageRouter = Router();

storageRouter.post('/upload', requireRoles('admin', 'reception'), upload.single('file'), async (request, response, next) => {
  try {
    const input = storageInput.parse(request.body);
    const path = normalizeStoragePath(input.path);
    if (!path) throw new HttpError(400, 'Caminho de arquivo inválido.', 'INVALID_PATH');
    if (!request.file) throw new HttpError(400, 'Selecione um arquivo.', 'FILE_REQUIRED');
    const id = crypto.randomUUID();
    await withTransaction(async (connection) => {
      try {
        await connection.execute(
          `INSERT INTO private_files
            (id, bucket, path, file_name, mime_type, size_bytes, file_data, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.bucket, path, request.file.originalname.slice(0, 255), request.file.mimetype, request.file.size, request.file.buffer, request.auth.user.id]
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Já existe um arquivo neste caminho.', 'DUPLICATE_FILE');
        throw error;
      }
      await writeAudit({
        userId: request.auth.user.id,
        action: 'UPLOAD_PRIVATE_FILE',
        tableName: 'private_files',
        recordId: id,
        after: { bucket: input.bucket, path, mime_type: request.file.mimetype, size_bytes: request.file.size },
        ipAddress: requestIp(request),
        userAgent: request.get('user-agent'),
        connection
      });
    });
    response.status(201).json({ ok: true, data: { id, path } });
  } catch (error) {
    next(error);
  }
});

storageRouter.post('/download-url', requireRoles('admin', 'reception'), async (request, response, next) => {
  try {
    const input = storageInput.parse(request.body);
    const path = normalizeStoragePath(input.path);
    if (!path) throw new HttpError(400, 'Caminho de arquivo inválido.', 'INVALID_PATH');
    const [file] = await query('SELECT id FROM private_files WHERE bucket = ? AND path = ? LIMIT 1', [input.bucket, path]);
    assertFound(file, 'Arquivo não encontrado.');
    response.json({ ok: true, data: { url: `/api/storage/files/${file.id}` } });
  } catch (error) {
    next(error);
  }
});

storageRouter.get('/files/:id', requireRoles('admin', 'reception'), async (request, response, next) => {
  try {
    const file = await withTransaction(async (connection) => {
      const [files] = await connection.execute(
        'SELECT id, bucket, path, file_name, mime_type, size_bytes, file_data FROM private_files WHERE id = ? LIMIT 1',
        [request.params.id]
      );
      const selected = assertFound(files[0], 'Arquivo não encontrado.');
      await writeAudit({
        userId: request.auth.user.id,
        action: 'DOWNLOAD_PRIVATE_FILE',
        tableName: 'private_files',
        recordId: selected.id,
        after: { bucket: selected.bucket, path: selected.path },
        ipAddress: requestIp(request),
        userAgent: request.get('user-agent'),
        connection
      });
      return selected;
    });
    const safeName = String(file.file_name || 'arquivo').replace(/[\r\n"\\]/g, '_');
    response.set({
      'Content-Type': file.mime_type,
      'Content-Length': String(file.size_bytes),
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.send(file.file_data);
  } catch (error) {
    next(error);
  }
});
