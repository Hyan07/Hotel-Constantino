import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getConfig } from './config.js';

let clientPromise;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = getConfig().then((config) => createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'constantinos-hotel-session'
        },
        realtime: { params: { eventsPerSecond: 5 } }
      }
    ));
  }
  return clientPromise;
}
