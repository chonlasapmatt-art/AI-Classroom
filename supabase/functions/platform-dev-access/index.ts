// Development sign-in to the operations console: the platform code and a display name to save.
//
// This is a separate deployable on purpose. It is the only endpoint in the system that mints a
// session without a password, so it does not share a function with the endpoints a production
// project relies on — a production project simply does not deploy it, and there is nothing to
// switch off, misconfigure or reason about.
//
// Where it is deployed, three things all have to hold before it does anything:
//
//   * PLATFORM_DEV_SIGN_IN must be exactly 'true' in the server environment. No production project
//     sets it, and setting it by accident grants nothing on its own.
//   * The platform code must be right, checked against the same hash as enrolment, in constant time.
//   * There must be exactly one operator to sign in as, or the deployment must name one. Choosing
//     between several would sign somebody in as a colleague and record the session as them.
//
// It creates no account and grants no authority. Everything it can hand back is a session for an
// operator who already existed, and the sign-in is written to the platform security log under that
// operator's own id, so a development shortcut is still a recorded event rather than a silent one.

import { corsHeaders, json } from '../_shared/http.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const GENERIC_FAILURE = 'PLATFORM_ACCESS_DENIED';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

/** Compares two hex digests without letting the time taken say how much of it matched. */
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  // Checked before anything else is read, so a deployment that has not opted in never looks at the
  // request at all.
  if (Deno.env.get('PLATFORM_DEV_SIGN_IN') !== 'true') {
    return json({ code: 'PLATFORM_DEV_SIGN_IN_DISABLED' }, 403, headers);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Keep the operator code server-side, and keep it separate from the customer's.
  //
  // This used to read `ADMIN_ACCESS_CODE_HASH` first — the code that activates a school. One value
  // therefore opened two doors of very different consequence: a customer who was handed the
  // activation code for their own server also held the code to the operations console for every
  // school on the platform. `PLATFORM_ADMIN_CODE_HASH` is this door's own secret and is checked
  // first; the activation code stays as a fallback so a deployment that has only ever set that one
  // keeps working until its operator sets the dedicated value.
  const expected = (Deno.env.get('PLATFORM_ADMIN_CODE_HASH')?.trim()
    || Deno.env.get('ADMIN_ACCESS_CODE_HASH')?.trim()
    || '').toLowerCase();
  if (!url || !anonKey || !serviceKey || !expected || !/^[a-f0-9]{64}$/.test(expected)) {
    return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const fingerprintHash = await sha256(`${forwarded}|${request.headers.get('user-agent') ?? 'unknown'}`);
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  // Counted by machine rather than by account: there is no account yet, and one machine getting
  // five attempts however it identifies itself is the stricter of the two readings anyway.
  const { count } = await service.from('admin_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('fingerprint_hash', fingerprintHash).eq('succeeded', false)
    .gte('attempted_at', windowStart);
  if ((count ?? 0) >= MAX_FAILURES) {
    return json({ code: 'PLATFORM_ACCESS_LOCKED', retryAfterMinutes: WINDOW_MINUTES }, 429, headers);
  }

  const record = (succeeded: boolean) => service.from('admin_access_attempts').insert({
    actor_profile_id: null, fingerprint_hash: fingerprintHash, succeeded,
    failure_reason: succeeded ? null : 'dev_sign_in'
  });

  try {
    const body = await request.json() as Record<string, unknown>;
    const suppliedDisplayName = String(body.displayName ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const supplied = await sha256(String(body.accessCode ?? '').trim());
    if (!constantTimeEqual(supplied, expected)) {
      await record(false);
      return json({ code: GENERIC_FAILURE }, 403, headers);
    }

    const chosen = Deno.env.get('PLATFORM_DEV_OPERATOR')?.trim();
    const { data: operators } = await service.from('platform_admins')
      .select('profile_id').eq('status', 'active').is('revoked_at', null);
    const candidates = (operators ?? []).map((row) => String(row.profile_id));
    const target = chosen && candidates.includes(chosen)
      ? chosen
      : (candidates.length === 1 ? candidates[0] : null);
    if (!target) {
      return json({
        code: candidates.length === 0 ? 'PLATFORM_NO_OPERATOR' : 'PLATFORM_OPERATOR_AMBIGUOUS'
      }, 409, headers);
    }

    // The name is profile data, not authority. The code still has to match and the target must be
    // an active platform operator. The first device may provide a display name; later visits can
    // omit it and reuse the server-saved name. The local device flag is only a UI hint.
    const { data: platformOperator, error: profileReadError } = await service.from('platform_admins')
      .select('display_name').eq('profile_id', target).maybeSingle();
    if (profileReadError) return json({ code: GENERIC_FAILURE }, 400, headers);
    const displayName = suppliedDisplayName || String(platformOperator?.display_name ?? '').trim();
    if (!displayName) {
      await record(false);
      return json({ code: 'PLATFORM_DISPLAY_NAME_REQUIRED' }, 400, headers);
    }
    if (suppliedDisplayName) {
      const { error: profileError } = await service.from('platform_admins')
        .update({ display_name: suppliedDisplayName })
        .eq('profile_id', target);
      if (profileError) return json({ code: GENERIC_FAILURE }, 400, headers);
    }

    const { data: account } = await service.auth.admin.getUserById(target);
    const email = account?.user?.email;
    if (!email) return json({ code: GENERIC_FAILURE }, 409, headers);

    // A link is generated and consumed here rather than sent anywhere. It is the supported way to
    // mint a session for an account whose password this function does not have and must not ask for.
    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink', email
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) return json({ code: GENERIC_FAILURE }, 400, headers);

    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: tokenHash, type: 'magiclink'
    });
    if (verifyError || !verified.session) return json({ code: GENERIC_FAILURE }, 400, headers);

    await service.rpc('record_platform_event', {
      p_actor: target, p_action: 'PLATFORM_DEV_SIGN_IN', p_school_id: null, p_profile_id: null,
      p_reason: 'development sign-in with the platform code', p_metadata: { displayName }
    });
    // The server-side access code is the re-authentication factor for this explicitly enabled
    // development door. This lets a code-authenticated operator perform guarded console actions
    // during the same short window as a password-authenticated operator.
    await service.rpc('record_platform_reauth', { p_actor: target });
    await record(true);
    return json({
      session: {
        accessToken: verified.session.access_token, refreshToken: verified.session.refresh_token
      }
    }, 200, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
