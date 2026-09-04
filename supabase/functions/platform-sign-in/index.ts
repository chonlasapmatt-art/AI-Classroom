// The production entrance to the operations console.
//
// Until now there was none. `PlatformGate` rendered the development door — which signs a person in
// as an operator without asking who they are, and works only because there happens to be exactly
// one — or a notice telling you to enable it. Neither authenticates anybody.
//
// This is the ordinary rule of the product applied to operators: a name and a password, never an
// email address. The password is GoTrue's to check, exactly as it is for a teacher or a guardian;
// this function resolves the name to the accounts it could mean and asks GoTrue about each.
//
// It grants nothing. Only active operators are candidates, so a correct password for a revoked one
// produces the same refusal as a wrong password for a real one, and the entrance never becomes the
// place where somebody discovers their authority was withdrawn.
//
// The session it returns is `aal1`. That is deliberate: an operator with a second factor enrolled
// gets in and can read, but `platform_reauth_fresh` already requires `aal2` before any guarded
// action, so the factor is demanded at the point where it changes something rather than at the
// door. Nothing here records a re-authentication — unlike the development door, where the access
// code is itself the factor.

import { corsHeaders, json } from '../_shared/http.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 8;
/** One message for every way this can fail, so the door never says which half was wrong. */
const GENERIC_FAILURE = 'PLATFORM_ACCESS_DENIED';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

interface Candidate { profile_id: string; auth_email: string }

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const fingerprintHash = await sha256(`${forwarded}|${request.headers.get('user-agent') ?? 'unknown'}`);
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count } = await service.from('admin_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('fingerprint_hash', fingerprintHash).eq('succeeded', false)
    .gte('attempted_at', windowStart);
  if ((count ?? 0) >= MAX_FAILURES) {
    return json({ code: 'PLATFORM_ACCESS_LOCKED', retryAfterMinutes: WINDOW_MINUTES }, 429, headers);
  }

  const record = (succeeded: boolean, profileId: string | null) =>
    service.from('admin_access_attempts').insert({
      actor_profile_id: profileId, fingerprint_hash: fingerprintHash, succeeded,
      failure_reason: succeeded ? null : 'platform_sign_in'
    });

  try {
    const body = await request.json() as Record<string, unknown>;
    const displayName = String(body.displayName ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const password = String(body.password ?? '');
    if (displayName.length < 2 || password.length < 1) {
      await record(false, null);
      return json({ code: GENERIC_FAILURE }, 403, headers);
    }

    const { data: rows } = await service.rpc('resolve_platform_operator_login', { p_name: displayName });
    const candidates = (rows ?? []) as Candidate[];

    /*
     * Every candidate is tried rather than stopping at the first success.
     *
     * Two operators who chose the same password would otherwise mean whoever the database returned
     * first gets signed into — and the audit trail would name the wrong person for everything that
     * followed. Two successes is an ambiguity the door refuses instead of resolving by luck.
     */
    const verified: { profileId: string; accessToken: string; refreshToken: string }[] = [];
    for (const candidate of candidates) {
      const { data, error } = await anon.auth.signInWithPassword({
        email: candidate.auth_email, password
      });
      if (error || !data.session) continue;
      verified.push({
        profileId: candidate.profile_id,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token
      });
    }

    if (verified.length !== 1) {
      await record(false, null);
      // Both "no match" and "more than one match" answer the same way: a door that distinguishes
      // them tells an attacker which names exist.
      return json({ code: GENERIC_FAILURE }, 403, headers);
    }

    const operator = verified[0]!;
    await record(true, operator.profileId);
    await service.rpc('record_platform_event', {
      p_actor: operator.profileId, p_action: 'PLATFORM_SIGN_IN', p_school_id: null, p_profile_id: null,
      p_reason: 'operator signed in with name and password', p_metadata: { displayName }
    });
    await service.from('platform_admins')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('profile_id', operator.profileId);

    return json({
      session: { accessToken: operator.accessToken, refreshToken: operator.refreshToken }
    }, 200, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
