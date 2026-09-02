-- There used to be two register_member_identity signatures: the current seven-argument member
-- flow and the retired eight-argument teacher-code flow. PostgREST can see defaulted parameters as
-- optional, so a parent request with seven named fields could become ambiguous and return only the
-- generic access error. Teacher accounts are now provisioned by an administrator, therefore the
-- retired overload is no longer callable and must be removed.

begin;

drop function if exists public.register_member_identity(uuid,text,text,text,text,uuid,text,uuid);

revoke all on function public.register_member_identity(uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.register_member_identity(uuid,text,text,text,text,uuid,text) to service_role;

comment on function public.register_member_identity(uuid,text,text,text,text,uuid,text)
  is 'Single managed identity registration path for parent/admin accounts; teachers are provisioned by a school administrator.';

commit;
