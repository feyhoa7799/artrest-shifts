import { supabaseAdmin } from '@/lib/supabase-admin';

export type ActivitySummary = {
  user_id: string;
  email: string | null;
  last_seen_at: string | null;
  last_seen_source: string | null;
  last_page: string | null;
  last_login_at: string | null;
  last_application_at: string | null;
  last_action_at: string | null;
  ping_count: number | null;
  updated_at: string | null;
};

type TouchActivityInput = {
  userId: string;
  email?: string | null;
  lastPage?: string | null;
  source?: 'web' | 'application';
  markLogin?: boolean;
  markApplication?: boolean;
};

export function sanitizeActivityPage(value: unknown) {
  const page = String(value || '').trim();

  if (!page || page.length > 120) return null;
  if (!page.startsWith('/')) return null;
  if (page.startsWith('//')) return null;

  return page.replace(/[^\wа-яА-ЯёЁ\-./?=&%#]/g, '').slice(0, 120);
}

export async function touchUserActivity(input: TouchActivityInput) {
  const userId = input.userId.trim();

  if (!userId) return;

  const now = new Date().toISOString();
  const sanitizedPage = sanitizeActivityPage(input.lastPage);

  const { data: current, error: readError } = await supabaseAdmin
    .from('user_activity_summary')
    .select('ping_count, last_login_at, last_application_at, last_action_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  const currentPingCount = Number((current as { ping_count?: unknown } | null)?.ping_count || 0);

  const payload = {
    user_id: userId,
    email: input.email || null,
    last_seen_at: now,
    last_seen_source: input.source || 'web',
    last_page: sanitizedPage,
    last_login_at: input.markLogin
      ? now
      : ((current as { last_login_at?: string | null } | null)?.last_login_at ?? null),
    last_application_at: input.markApplication
      ? now
      : ((current as { last_application_at?: string | null } | null)?.last_application_at ?? null),
    last_action_at: input.markApplication
      ? now
      : ((current as { last_action_at?: string | null } | null)?.last_action_at ?? null),
    ping_count: currentPingCount + 1,
    updated_at: now,
  };

  const { error } = await supabaseAdmin
    .from('user_activity_summary')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) throw new Error(error.message);
}
