export function corsHeaders(origin: string | null): HeadersInit {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const safeOrigin = origin && allowed.includes(origin) ? origin : allowed[0] ?? 'http://localhost:5173';
  return { 'Access-Control-Allow-Origin': safeOrigin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
}
export function json(body: unknown, status: number, headers: HeadersInit): Response { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } }); }
