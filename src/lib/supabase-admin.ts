import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://avaojajwgjmcpviaikcy.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY;

  if (!supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }

  return createClient(SUPABASE_URL, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
