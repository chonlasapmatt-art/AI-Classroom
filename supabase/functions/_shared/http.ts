import { isAllowedOrigin } from './allowedOrigins.ts';

/**
 * Which browser origins may call these functions, and how the answer is written.
 *
 * The list is exact by default: an origin is allowed because somebody typed it into
 * `ALLOWED_ORIGINS`. That is the right rule for the two or three addresses a school actually uses,
 * and the wrong one for a hosting platform that mints a new hostname for every deployment — a
 * preview build of this app is served from a host nobody could have listed in advance, so every
 * call from it was answered with somebody else's origin and the browser threw the response away.
 * What the person saw was a sign-in that refused a correct password.
 *
 * `allowedOrigins.ts` holds the rule itself, including the one supported pattern.
 */
export function corsHeaders(origin: string | null): HeadersInit {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value: string) => value.trim()).filter(Boolean);
  const safeOrigin = origin && isAllowedOrigin(origin, allowed) ? origin : allowed[0] ?? 'http://localhost:5173';
  return { 'Access-Control-Allow-Origin': safeOrigin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
}

export { isAllowedOrigin };

export function json(body: unknown, status: number, headers: HeadersInit): Response { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } }); }
