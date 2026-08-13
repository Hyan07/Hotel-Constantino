import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

export const healthRouter = Router();

healthRouter.get('/', async (_request, response) => {
  const started = Date.now();
  const { error } = await supabaseAdmin.from('room_categories').select('id', { head: true, count: 'exact' }).limit(1);
  response.status(error ? 503 : 200).json({
    ok: !error,
    service: 'constantinos-hotel',
    database: error ? 'unavailable' : 'available',
    responseTimeMs: Date.now() - started,
    timestamp: new Date().toISOString()
  });
});
