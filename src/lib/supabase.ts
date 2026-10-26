import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  let url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  let anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  // Final Safety Fallback (Production Keys found in config)
  if (!url || url.includes('your-project')) {
    url = 'https://exopuyocqfmvvyvsnlqv.supabase.co';
  }
  if (!anonKey || anonKey.includes('your-supabase-anon-key')) {
    anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4b3B1eW9jcWZtdnZ5dnNubHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4OTU1MjQsImV4cCI6MjEwODQ3MTUyNH0.y8zf_zCI8ZC7MbL2M-i9Xd2B4oFucVHBXiMBAfgRtGA';
  }

  if (typeof window !== 'undefined') {
    try {
      const storedUrl = localStorage.getItem('guaranesia_supabase_url');
      const storedKey = localStorage.getItem('guaranesia_supabase_anon_key');
      if (storedUrl && storedUrl.trim()) url = storedUrl.trim();
      if (storedKey && storedKey.trim()) anonKey = storedKey.trim();
    } catch (e) {}
  }

  // Clean trailing /rest/v1/ or trailing slashes if present
  if (url) {
    url = url.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
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
  // Check for presence of credentials and that they aren't placeholders
  const hasUrl = url && url.startsWith('http') && !url.includes('your-project');
  const hasKey = anonKey && anonKey.length > 50 && !anonKey.includes('your-supabase-anon-key');
  return Boolean(hasUrl && hasKey);
}

export const isSupabaseConfigured = (): boolean => {
  return isSupabaseReady();
};

export function saveSupabaseCredentials(url: string, anonKey: string): boolean {
  try {
    const cleanUrl = url.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    const cleanKey = anonKey.trim();
    localStorage.setItem('guaranesia_supabase_url', cleanUrl);
    localStorage.setItem('guaranesia_supabase_anon_key', cleanKey);
    cachedClient = null;

    // Send credentials to backend config so all mobile devices auto-connect
    fetch('/api/system/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl: cleanUrl, supabaseAnonKey: cleanKey })
    }).catch(() => {});

    return true;
  } catch (e) {
    return false;
  }
}

export async function fetchAndApplyServerCredentials(): Promise<boolean> {
  try {
    const res = await fetch('/api/system/config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.supabaseUrl && data.supabaseAnonKey) {
        // Only save if local is different or empty
        const local = getSupabaseCredentials();
        if (local.url !== data.supabaseUrl || local.anonKey !== data.supabaseAnonKey) {
          saveSupabaseCredentials(data.supabaseUrl, data.supabaseAnonKey);
          return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

export function clearSupabaseCredentials(): void {
  try {
    localStorage.removeItem('guaranesia_supabase_url');
    localStorage.removeItem('guaranesia_supabase_anon_key');
    cachedClient = null;
    fetch('/api/system/config', { method: 'DELETE' }).catch(() => {});
  } catch (e) {}
}

export const supabase = getSupabaseClient();
