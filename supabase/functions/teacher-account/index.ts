import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

const GENERIC_FAILURE = 'TEACHER_ACCOUNT_FAILED';

// No O/0, I/l/1: an administrator reads this password aloud to a teacher, or writes it on paper.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_LENGTH = 14;

/**
 * The teacher's first password, shown once to the administrator who created the account.
 *
 * Base-36 of four random 32-bit numbers produced a string of unpredictable length — a draw of small
 * values gave a short password, and `slice(0, 20)` then cut a long one mid-way. Drawing characters
 * directly gives every password the same length and the same strength.
 */
function password(): string {
  const characters: string[] = [];
  // Bytes at or above the last whole multiple of the alphabet are redrawn rather than folded, so no
  // character is fractionally more likely than another.
  const ceiling = Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  while (characters.length < PASSWORD_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(PASSWORD_LENGTH))) {
      if (byte >= ceiling) continue;
      characters.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]!);
      if (characters.length === PASSWORD_LENGTH) break;
    }
  }
  return `SC-${characters.join('')}`;
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
    if (String(body.action ?? '') !== 'provision') return json({ code: 'ACTION_NOT_SUPPORTED' }, 400, headers);
    const schoolId = String(body.schoolId ?? '');
    const teacherId = String(body.teacherId ?? '');
    if (!schoolId || !teacherId) return json({ code: 'VALIDATION_ERROR' }, 400, headers);

    const { data: teacher, error: teacherError } = await service.from('teachers')
      .select('id,school_id,profile_id,teacher_code,display_name,email,status,verification_status,deleted_at')
      .eq('id', teacherId).eq('school_id', schoolId).maybeSingle();
    if (teacherError || !teacher || teacher.status !== 'active' || teacher.deleted_at) {
      return json({ code: 'NOT_FOUND' }, 404, headers);
    }
    if (teacher.profile_id) return json({ code: 'TARGET_ALREADY_LINKED' }, 409, headers);
    // Admin-created teachers do not need an email to become usable. Supabase Auth still needs a
    // unique identifier, so use a deterministic internal address that is never shown or typed by a
    // teacher. Recovery email remains an optional future setting, not a prerequisite for first login.
    const email = `teacher.${teacher.id}@teachers.smart-classroom.invalid`;

    const initialPassword = password();
    let profileId: string | null = null;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email, password: initialPassword, email_confirm: true,
      user_metadata: { display_name: String(teacher.display_name ?? ''), requested_role: 'teacher' },
      app_metadata: { access_model: 'name_password', member_role: 'teacher', has_recovery_email: false }
    });
    if (created?.user) profileId = created.user.id;
    if (createError || !profileId) {
      const message = String(createError?.message ?? '').toLowerCase();
      if (message.includes('already registered') || message.includes('already been registered') || message.includes('duplicate')) {
        // The address belongs to an earlier attempt that reached Auth and stopped. Adopt that user
        // rather than fail: the teacher row is still unbound, which is the whole reason we are here.
        const { data: existingId } = await service.rpc('find_auth_user_by_email', { p_email: email });
        profileId = typeof existingId === 'string' ? existingId : null;
      }
      if (!profileId) return json({ code: GENERIC_FAILURE }, 400, headers);
    }

    const { data: bound, error: bindError } = await service.rpc('provision_teacher_identity', {
      p_actor: actor, p_school_id: schoolId, p_teacher_id: teacherId,
      p_profile_id: profileId, p_auth_email: email
    });
    if (bindError) {
      if (created?.user) await service.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      const code = String(bindError.message ?? '').includes('FORBIDDEN') ? 'FORBIDDEN'
        : String(bindError.message ?? '').includes('TEACHER_NOT_VERIFIED') ? 'TEACHER_NOT_VERIFIED'
          : String(bindError.message ?? '').includes('TARGET_ALREADY_LINKED') ? 'TARGET_ALREADY_LINKED' : GENERIC_FAILURE;
      return json({ code }, code === 'FORBIDDEN' ? 403 : 400, headers);
    }

    return json({ ...(bound as Record<string, unknown>), teacherCode: teacher.teacher_code, initialPassword }, 201, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
