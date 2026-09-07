import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.js';

/**
 * Creates a Supabase client for server-side use (Next.js API routes, agent).
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment.
 *
 * IMPORTANT: The service-role key bypasses RLS. Never expose it to the browser.
 * Use createBrowserClient() for client-side code instead.
 */
export function createServerClient() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for server-side Supabase access.'
    );
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Creates a Supabase client for browser/client-side use.
 * Uses the anon key which respects Row Level Security.
 *
 * IMPORTANT: Only the anon key is safe to expose in browser code.
 */
export function createBrowserClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.'
    );
  }

  return createClient<Database>(url, key);
}
