import { corsHeaders, json } from '../_shared/http.ts';

/** Deprecated: owner setup moved to the rate-limited admin-access boundary. */
Deno.serve((request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return json({ code: 'OWNER_AUTHORIZATION_REQUIRED' }, 410, headers);
});
