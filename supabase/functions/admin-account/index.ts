import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

const MINIMUM_PASSWORD_LENGTH = 8;
const GENERIC_FAILURE = 'ADMIN_ACCOUNT_FAILED';

function text(body: Record<string, unknown>, key: string, max = 200): string {
  return String(body[key] ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.split(' ').filter(Boolean);
  return { firstName: parts[0] ?? displayName, lastName: parts.slice(1).join(' ') || '-' };
}

function emailFor(role: string, recordId: string): string {
  const domain = role === 'teacher'
    ? (Deno.env.get('TEACHER_ACCESS_EMAIL_DOMAIN') ?? 'teachers.smart-classroom.invalid')
    : role === 'student'
      ? (Deno.env.get('STUDENT_ACCESS_EMAIL_DOMAIN') ?? 'students.smart-classroom.invalid')
      : (Deno.env.get('PARENT_ACCESS_EMAIL_DOMAIN') ?? 'parents.smart-classroom.invalid');
  return `${role}.${recordId}@${domain}`;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  try {
    const { user, service } = clients(request);
    const { data: authData, error: authError } = await user.auth.getUser();
    const actor = authData?.user?.id;
    if (authError || !actor) return json({ code: 'AUTH_REQUIRED' }, 401, headers);

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const schoolId = text(body, 'schoolId', 80);
    const role = text(body, 'role', 20);
    if (!schoolId || !['teacher', 'student', 'parent'].includes(role)) return json({ code: 'VALIDATION_ERROR' }, 400, headers);

    const { data: adminMembership, error: membershipError } = await service.from('school_memberships')
      .select('id').eq('school_id', schoolId).eq('profile_id', actor).eq('role', 'admin').eq('status', 'active').maybeSingle();
    if (membershipError || !adminMembership) return json({ code: 'FORBIDDEN' }, 403, headers);

    if (action === 'set-password') {
      const password = String(body.password ?? '');
      const profileId = text(body, 'profileId', 80);
      if (!profileId || password.length < MINIMUM_PASSWORD_LENGTH) return json({ code: 'VALIDATION_ERROR' }, 400, headers);
      const { data: targetMembership } = await service.from('school_memberships').select('profile_id')
        .eq('school_id', schoolId).eq('profile_id', profileId).eq('role', role).eq('status', 'active').maybeSingle();
      if (!targetMembership) return json({ code: 'NOT_FOUND' }, 404, headers);
      const { error } = await service.auth.admin.updateUserById(profileId, { password });
      if (error) return json({ code: GENERIC_FAILURE }, 400, headers);
      await service.from('audit_log').insert({ school_id: schoolId, actor_profile_id: actor,
        action: 'MANAGED_ACCOUNT_PASSWORD_CHANGED', entity_type: role, entity_id: profileId,
        after_json: { role, profileId } });
      return json({ updated: true }, 200, headers);
    }

    if (action !== 'provision') return json({ code: 'ACTION_NOT_SUPPORTED' }, 400, headers);
    const password = String(body.password ?? '');
    const displayName = text(body, 'displayName');
    const recordId = text(body, 'recordId', 80) || crypto.randomUUID();
    const studentId = text(body, 'studentId', 80) || null;
    const { firstName, lastName } = splitName(displayName);
    if (password.length < MINIMUM_PASSWORD_LENGTH || displayName.length < 2) return json({ code: 'VALIDATION_ERROR' }, 400, headers);

    const parentRecordId: string | null = role === 'parent' ? recordId : null;
    const email = emailFor(role, recordId);
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: displayName, requested_role: role },
      app_metadata: { access_model: 'admin_managed_name_password', member_role: role, school_id: schoolId }
    });
    let profileId = created.user?.id ?? null;
    if (createError || !profileId) {
      // The address is deterministic for this record, so a repeat provision lands on the account an
      // earlier half-finished attempt created. Adopt it and reset the password to the new one.
      const { data: existingId } = await service.rpc('find_auth_user_by_email', { p_email: email });
      profileId = typeof existingId === 'string' ? existingId : null;
      if (!profileId) return json({ code: GENERIC_FAILURE }, 400, headers);
      const { error: updateError } = await service.auth.admin.updateUserById(profileId, { password });
      if (updateError) return json({ code: GENERIC_FAILURE }, 400, headers);
    }

    const bindFunction = role === 'parent' && !studentId ? 'provision_parent_without_child' : 'provision_managed_account';
    const bindParams = bindFunction === 'provision_parent_without_child'
      ? {
        p_actor: actor, p_school_id: schoolId, p_parent_id: parentRecordId ?? recordId, p_profile_id: profileId,
        p_display_name: displayName, p_first_name: firstName, p_last_name: lastName,
        p_auth_email: email, p_phone: text(body, 'phone', 80)
      }
      : {
        p_actor: actor, p_school_id: schoolId, p_role: role,
        p_record_id: parentRecordId ?? recordId, p_student_id: studentId, p_profile_id: profileId,
        p_display_name: displayName, p_first_name: firstName, p_last_name: lastName,
        p_auth_email: email, p_relationship: text(body, 'relationship', 80) || 'ผู้ปกครอง', p_phone: text(body, 'phone', 80)
      };
    const { data: bound, error: bindError } = await service.rpc(bindFunction, bindParams);
    if (bindError || !bound) {
      if (created.user) await service.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      const message = String(bindError?.message ?? '');
      const code = message.includes('FORBIDDEN') ? 'FORBIDDEN' : message.includes('NOT_FOUND') ? 'NOT_FOUND'
        : message.includes('TARGET_ALREADY_LINKED') ? 'TARGET_ALREADY_LINKED' : message.includes('ROLE_CONFLICT') ? 'ROLE_CONFLICT'
          // One active guardian per name per school. The index is the guarantee; this is the sentence.
          : message.includes('parents_unique_active_name') || message.includes('PARENT_NAME_EXISTS') ? 'PARENT_NAME_EXISTS'
            : message.includes('VALIDATION_ERROR') ? 'VALIDATION_ERROR' : GENERIC_FAILURE;
      // An unrecognised database refusal carries its own reason back to the administrator who caused
      // it. Every named case above is already a sentence the screen can show; what is left is the
      // case nobody anticipated, and answering that with a bare "ไม่สำเร็จ" is how a bug survives —
      // there is no log a school can read, and the same click fails the same way forever. The caller
      // here is an authenticated administrator of this school acting on this school's own records.
      const reason = code === GENERIC_FAILURE ? message.slice(0, 300) : undefined;
      return json({ code, ...(reason ? { reason } : {}) }, code === 'FORBIDDEN' ? 403 : 400, headers);
    }
    return json({ ...(bound as Record<string, unknown>), email, passwordSet: true }, 201, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
