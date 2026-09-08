import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@naukri-update/database';

/**
 * Creates a server-side Supabase client for Server Components and Route Handlers.
 * Uses the authenticated user's cookies, enforcing Row Level Security (RLS) as auth.uid().
 */
export async function createServerSupabaseClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? process.env['SUPABASE_URL'] ?? '';
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignored if called from a Server Component
        }
      },
    },
  });
}

export { createServerSupabaseClient as createClient };
