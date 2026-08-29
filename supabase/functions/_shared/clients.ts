import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export function clients(request: Request) {
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) throw new Error('SERVER_CONFIGURATION_ERROR');
  const authorization = request.headers.get('Authorization') ?? '';
  return {
    user: createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } }),
    service: createClient(url, service, { auth: { persistSession: false } })
  };
}
