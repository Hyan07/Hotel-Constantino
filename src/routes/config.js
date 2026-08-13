import { Router } from 'express';
import { env } from '../config/env.js';

export const configRouter = Router();

configRouter.get('/', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({
    supabaseUrl: env.SUPABASE_URL,
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    appName: "Constantino's Hotel",
    timezone: 'America/Sao_Paulo'
  });
});
