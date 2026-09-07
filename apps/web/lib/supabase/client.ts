import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@naukri-update/database';

/**
 * Creates a browser-side Supabase client using @supabase/ssr.
 * Uses public environment variables only (NEXT_PUBLIC_*).
 * Safe for client components ('use client').
 */
export function createBrowserSupabaseClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

  return createBrowserClient<Database>(url, anonKey);
}

export { createBrowserSupabaseClient as createClient };
