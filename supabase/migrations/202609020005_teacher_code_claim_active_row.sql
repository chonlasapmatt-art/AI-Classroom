-- A rotated teacher code that reuses the same digits stopped working.
--
-- `teacher_access_codes` keeps every code a school ever issued, and only the *active* ones are held
-- unique by `teacher_access_code_active_hash`. A school that re-issues the code it had before —
-- which is the ordinary thing to do when a code is rotated on a schedule rather than because it
-- leaked — therefore ends up with two rows carrying the same `code_hash`: one revoked, one active.
--
-- `claim_teacher_access_code` selected on `code_hash` alone. With two matching rows the row it read
-- was whichever the planner reached first, so roughly half of those schools had their live code
-- answered with "revoked" and their new teachers turned away by a code that was, in fact, correct.
--
-- The fix is to say which row is meant. Claiming only ever concerns the active one; a hash that
-- matches nothing active is refused exactly as an unknown code is, which is the same answer the old
-- code gave for a genuinely revoked one.

begin;

create or replace function public.claim_teacher_access_code(p_school_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare code public.teacher_access_codes%rowtype;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('valid', false); end if;
  select * into code from public.teacher_access_codes
    where school_id=p_school_id and code_hash=lower(p_code_hash) and status='active'
    for update;
  if not found then return jsonb_build_object('valid', false); end if;
  if code.expires_at is not null and code.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if code.max_uses is not null and code.use_count >= code.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'exhausted');
  end if;

  update public.teacher_access_codes
    set use_count = use_count + 1 where id = code.id;

  return jsonb_build_object('valid', true, 'codeId', code.id, 'schoolId', code.school_id);
end $$;

revoke all on function public.claim_teacher_access_code(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_teacher_access_code(uuid,text) to service_role;

commit;
