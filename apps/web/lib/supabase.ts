/**
 * Supabase client helpers for the Next.js web application.
 *
 * SECURITY RULES:
 * - createServerSupabaseClient() uses the service-role key.
 *   → Server-only (API routes, Server Components). NEVER import in client components.
 *   → Bypasses Row Level Security — use with care.
 *
 * - createBrowserSupabaseClient() uses the anon key.
 *   → Safe for browser code. Respects Row Level Security.
 *   → NEXT_PUBLIC_ prefix intentionally exposes this to the browser.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client.
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment.
 * Call only from API routes or Server Components.
 */
export function createServerSupabaseClient() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !key) {
    throw new Error(
      '[supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for server-side access. ' +
        'Do NOT add these to NEXT_PUBLIC_ variables.'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Browser-side Supabase client.
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Safe for use in client components and browser code.
 */
export function createBrowserSupabaseClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !key) {
    throw new Error(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.'
    );
  }

  return createClient(url, key);
}
