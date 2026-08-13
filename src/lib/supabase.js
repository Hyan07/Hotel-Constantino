import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const commonOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
};

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  commonOptions
);

export function createUserScopedClient(accessToken) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...commonOptions,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  });
}
