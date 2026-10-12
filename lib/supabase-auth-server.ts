import { createClient } from '@supabase/supabase-js';

export function getSupabaseAuthServerClient() {
  const supabaseUrl =
    process.env.SUPABASE_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase Auth server connection is not configured');
  }

  // Auth clients hold session state in memory. Keep them request-scoped so
  // concurrent logins can never share or overwrite another user's session.
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
