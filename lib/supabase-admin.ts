import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type AnySupabaseClient = SupabaseClient<any, any, any>;

let cachedClient: AnySupabaseClient | null = null;

function getSupabaseAdminClient(): AnySupabaseClient {
  const supabaseUrl =
    process.env.SUPABASE_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Supabase server connection is not configured');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}

export const supabaseAdmin = new Proxy({} as AnySupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdminClient() as any;
    const value = client[prop];

    if (typeof value === 'function') {
      return value.bind(client);
    }

    return value;
  },
});
