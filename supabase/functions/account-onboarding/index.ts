import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function text(body: Record<string, unknown>, key: string, max = 200): string {
  return String(body[key] ?? '').trim().slice(0, max);
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  const { user, service } = clients(request);
  const { data: authData, error: authError } = await user.auth.getUser();
  if (authError || !authData.user) return json({ code: 'AUTH_REQUIRED' }, 401, headers);
  if (!authData.user.email_confirmed_at) return json({ code: 'EMAIL_NOT_VERIFIED' }, 403, headers);

  const { count } = await service.from('account_onboarding_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('actor_profile_id', authData.user.id)
    .gte('attempted_at', new Date(Date.now() - 15 * 60_000).toISOString());
  if ((count ?? 0) >= 10) return json({ code: 'TOO_MANY_ATTEMPTS' }, 429, headers);

  let action = '';
  let schoolCode = '';
  try {
    const body = await request.json() as Record<string, unknown>;
    action = text(body, 'action', 20);
    schoolCode = text(body, 'schoolCode', 20).toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(schoolCode)) return json({ code: 'DETAILS_MISMATCH' }, 400, headers);

    let data: unknown;
    let error: { code?: string; message?: string } | null = null;
    if (action === 'student') {
      const result = await service.rpc('claim_student_account', {
        p_actor: authData.user.id,
        p_school_code: schoolCode,
        p_student_code: text(body, 'studentCode', 40),
        p_display_name: text(body, 'displayName')
      });
      data = result.data; error = result.error;
    } else if (action === 'teacher') {
      const result = await service.rpc('request_teacher_account', {
        p_actor: authData.user.id,
        p_school_code: schoolCode,
        p_display_name: text(body, 'displayName')
      });
      data = result.data; error = result.error;
    } else if (action === 'parent') {
      const result = await service.rpc('request_parent_account_link', {
        p_actor: authData.user.id,
        p_school_code: schoolCode,
        p_student_code: text(body, 'studentCode', 40),
        p_student_name: text(body, 'studentName'),
        p_parent_name: text(body, 'displayName'),
        p_relationship: text(body, 'relationship', 100)
      });
      data = result.data; error = result.error;
    } else {
      return json({ code: 'ROLE_NOT_SUPPORTED' }, 400, headers);
    }

    await service.from('account_onboarding_attempts').insert({
      actor_profile_id: authData.user.id,
      action,
      school_code_hash: await sha256(schoolCode),
      succeeded: !error,
      failure_reason: error?.code ?? null
    });
    if (error) {
      const conflict = error.code === '23505';
      return json({ code: conflict ? 'ALREADY_LINKED' : 'DETAILS_MISMATCH' }, conflict ? 409 : 400, headers);
    }
    return json(data, 200, headers);
  } catch {
    if (schoolCode) {
      await service.from('account_onboarding_attempts').insert({
        actor_profile_id: authData.user.id,
        action: action || 'unknown',
        school_code_hash: await sha256(schoolCode),
        succeeded: false,
        failure_reason: 'INTERNAL_ERROR'
      });
    }
    return json({ code: 'INTERNAL_ERROR' }, 500, headers);
  }
});
