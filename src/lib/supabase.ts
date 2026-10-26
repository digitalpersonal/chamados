import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  let url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  let anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (typeof window !== 'undefined') {
    try {
      const storedUrl = localStorage.getItem('guaranesia_supabase_url');
      const storedKey = localStorage.getItem('guaranesia_supabase_anon_key');
      if (storedUrl && !url) url = storedUrl.trim();
      if (storedKey && !anonKey) anonKey = storedKey.trim();
    } catch (e) {}
  }

  return { url, anonKey };
}

let cachedClient: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) return null;

  if (cachedClient && lastUrl === url && lastKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey);
    lastUrl = url;
    lastKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return null;
  }
}

export function isSupabaseReady(): boolean {
  const { url, anonKey } = getSupabaseCredentials();
  return Boolean(url && anonKey);
}

export function saveSupabaseCredentials(url: string, anonKey: string): boolean {
  try {
    localStorage.setItem('guaranesia_supabase_url', url.trim());
    localStorage.setItem('guaranesia_supabase_anon_key', anonKey.trim());
    cachedClient = null;
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSupabaseCredentials(): void {
  try {
    localStorage.removeItem('guaranesia_supabase_url');
    localStorage.removeItem('guaranesia_supabase_anon_key');
    cachedClient = null;
  } catch (e) {}
}

export const isSupabaseConfigured = isSupabaseReady();
export const supabase = getSupabaseClient();
