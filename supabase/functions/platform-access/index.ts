// The two things the operations console cannot do for itself: becoming an operator, and proving it
// is still the operator sitting there.
//
// Enrolment is deliberately not something any signed-in account can request. It needs a code held in
// the server environment, checked here, rate limited and recorded — the same shape as the private
// owner entry, for the same reason: a hidden URL is not a permission, and an email address is not an
// authorisation.
//
// Re-authentication exists because the dangerous actions in the console — suspending a school,
// raising the minimum client version — are checked in the database against a timestamp this function
// is the only thing allowed to write. The console cannot decide it has re-authenticated; it can only
// ask GoTrue to verify a password and let the database record that it did.

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

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);

  const authorization = request.headers.get('Authorization') ?? '';
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const scoped = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false }
  });

  const { data: authData } = await scoped.auth.getUser();
  const actor = authData?.user?.id;
  const actorEmail = authData?.user?.email;
  if (!actor) return json({ code: 'AUTH_REQUIRED' }, 401, headers);

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const fingerprintHash = await sha256(`${forwarded}|${request.headers.get('user-agent') ?? 'unknown'}`);
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  /** Reuses the administrator attempt ledger rather than starting a second one for the same job. */
  async function failures(): Promise<number> {
    const { count } = await service.from('admin_access_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('actor_profile_id', actor).eq('fingerprint_hash', fingerprintHash)
      .eq('succeeded', false).gte('attempted_at', windowStart);
    return count ?? 0;
  }

  async function recordAttempt(succeeded: boolean): Promise<void> {
    await service.from('admin_access_attempts').insert({
      actor_profile_id: actor, fingerprint_hash: fingerprintHash, succeeded
    });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (await failures() >= MAX_FAILURES) {
      return json({ code: 'PLATFORM_ACCESS_LOCKED', retryAfterMinutes: WINDOW_MINUTES }, 429, headers);
    }


    if (action === 'enroll') {
      const expected = Deno.env.get('PLATFORM_ADMIN_CODE_HASH')?.trim().toLowerCase();
      if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
        return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
      }
      // Pasted codes arrive with trailing whitespace far more often than they arrive wrong. Trimming
      // the outside costs nothing; what is inside still has to match byte for byte.
      const supplied = await sha256(String(body.accessCode ?? '').trim());
      if (!constantTimeEqual(supplied, expected)) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 403, headers);
      }
      const { data, error } = await service.rpc('grant_platform_admin', {
        p_actor: actor, p_profile_id: actor,
        p_display_name: String(body.displayName ?? '').slice(0, 200),
        p_notes: String(body.notes ?? '').slice(0, 400)
      });
      if (error) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 403, headers);
      }
      await recordAttempt(true);
      return json(data, 201, headers);
    }

    if (action === 'reauthenticate') {
      const password = String(body.password ?? '');
      if (!actorEmail || password.length < 1) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 400, headers);
      }
      const { data: platform } = await service.from('platform_admins')
        .select('profile_id').eq('profile_id', actor).eq('status', 'active').maybeSingle();
      if (!platform) {
        await recordAttempt(false);
        return json({ code: 'PLATFORM_FORBIDDEN' }, 403, headers);
      }
      // GoTrue verifies the password, exactly as it does at sign-in. This function never sees a
      // hash and never compares one.
      const { data: verified, error: signInError } = await anon.auth.signInWithPassword({
        email: actorEmail, password
      });
      if (signInError || !verified.session) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 401, headers);
      }
      const { error: recordError } = await service.rpc('record_platform_reauth', { p_actor: actor });
      if (recordError) return json({ code: GENERIC_FAILURE }, 400, headers);
      await recordAttempt(true);
      return json({ verified: true, windowMinutes: 15 }, 200, headers);
    }

    if (action === 'grant') {
      // Granting somebody else platform authority needs a fresh password of the operator doing it,
      // which the database checks; this endpoint only carries the request.
      const targetProfileId = String(body.profileId ?? '');
      if (!targetProfileId) return json({ code: GENERIC_FAILURE }, 400, headers);
      const { data: fresh } = await service.rpc('platform_reauth_fresh', { p_actor: actor, p_minutes: 15 });
      if (fresh !== true) return json({ code: 'REAUTHENTICATION_REQUIRED' }, 403, headers);
      const { data, error } = await service.rpc('grant_platform_admin', {
        p_actor: actor, p_profile_id: targetProfileId,
        p_display_name: String(body.displayName ?? '').slice(0, 200),
        p_notes: String(body.notes ?? '').slice(0, 400)
      });
      if (error) return json({ code: 'PLATFORM_FORBIDDEN' }, 403, headers);
      return json(data, 201, headers);
    }

    if (action === 'revoke') {
      const targetProfileId = String(body.profileId ?? '');
      const reason = String(body.reason ?? '').trim().slice(0, 400);
      if (!targetProfileId || reason.length < 4) return json({ code: GENERIC_FAILURE }, 400, headers);
      const { data: fresh } = await service.rpc('platform_reauth_fresh', { p_actor: actor, p_minutes: 15 });
      if (fresh !== true) return json({ code: 'REAUTHENTICATION_REQUIRED' }, 403, headers);
      const { error } = await service.rpc('revoke_platform_admin', {
        p_actor: actor, p_profile_id: targetProfileId, p_reason: reason
      });
      if (error) {
        const message = String(error.message ?? '');
        if (message.includes('LAST_PLATFORM_ADMIN')) return json({ code: 'LAST_PLATFORM_ADMIN' }, 409, headers);
        return json({ code: 'PLATFORM_FORBIDDEN' }, 403, headers);
      }
      return json({ revoked: true }, 200, headers);
    }

    return json({ code: 'UNSUPPORTED_ACTION' }, 400, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
