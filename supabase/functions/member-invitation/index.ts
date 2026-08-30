import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

async function hashCode(code: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(code));
  return [...new Uint8Array(signature)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function invitationCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  return `${bytes[0]! % 10_000}`.padStart(4, '0') + `${bytes[1]! % 10_000}`.padStart(4, '0');
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  try {
    const secret = Deno.env.get('MEMBER_INVITATION_HMAC_SECRET');
    if (!secret || secret.length < 32) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
    const { user, service } = clients(request);
    const { data: authData, error: authError } = await user.auth.getUser();
    if (authError || !authData.user) return json({ code: 'AUTH_REQUIRED' }, 401, headers);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (action === 'create') {
      const role = String(body.role ?? '');
      if (!['teacher', 'student', 'parent'].includes(role)) return json({ code: 'ROLE_NOT_ALLOWED' }, 400, headers);
      const code = invitationCode();
      const codeHash = await hashCode(code, secret);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
      const { data: invitationId, error } = await user.rpc('create_member_invitation', {
        p_school_id: String(body.schoolId ?? ''), p_role: role,
        p_target_entity_id: String(body.targetEntityId ?? ''), p_email: String(body.email ?? ''),
        p_code_hash: codeHash, p_expires_at: expiresAt
      });
      if (error) return json({ code: 'INVITATION_REJECTED' }, error.code === '42501' ? 403 : 400, headers);
      return json({ invitationId, code, expiresAt }, 201, headers);
    }

    if (action === 'redeem') {
      const code = String(body.code ?? '').replace(/\s|-/g, '');
      if (!/^\d{8}$/.test(code)) return json({ code: 'INVITATION_INVALID' }, 400, headers);
      const codeHash = await hashCode(code, secret);
      const { data: invitation } = await service.from('school_member_invitations')
        .select('id,attempt_count,max_attempts,expires_at,used_at,revoked_at').eq('code_hash', codeHash).maybeSingle();
      if (!invitation || invitation.used_at || invitation.revoked_at || invitation.attempt_count >= invitation.max_attempts || new Date(invitation.expires_at).getTime() <= Date.now()) {
        return json({ code: 'INVITATION_INVALID' }, 400, headers);
      }
      const { data, error } = await service.rpc('redeem_member_invitation', {
        p_actor: authData.user.id, p_invitation_id: invitation.id
      });
      if (error) {
        await service.rpc('record_member_invitation_failure', { p_invitation_id: invitation.id });
        return json({ code: error.code === '42501' ? 'INVITATION_EMAIL_MISMATCH' : 'INVITATION_REJECTED' }, error.code === '42501' ? 403 : 400, headers);
      }
      return json(data, 200, headers);
    }

    return json({ code: 'ACTION_NOT_SUPPORTED' }, 400, headers);
  } catch {
    return json({ code: 'INTERNAL_ERROR' }, 500, headers);
  }
});
