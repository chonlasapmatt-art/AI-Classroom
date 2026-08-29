import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isCloudConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = isCloudConfigured ? createClient(url!, anonKey!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('ยังไม่ได้กำหนดค่า Supabase สำหรับ environment นี้');
  return supabase;
}
