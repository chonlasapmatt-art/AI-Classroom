begin;

-- Creating a school administrator from the platform console could never succeed.
--
-- `member_login_identities.registration_source` accepts five values, and every path that writes an
-- identity uses one of them — except `provision_school_admin`, which was written to record that the
-- account came from the platform console and wrote 'platform'. That is not one of the five, so the
-- check constraint refused the insert, the whole provision rolled back, the Edge Function deleted
-- the Auth user it had just made, and the operator was told "สร้างบัญชีแอดมินไม่สำเร็จ" with nothing
-- to act on. Every attempt failed the same way from the day the function shipped.
--
-- The value is the honest one: an account made by a platform operator did not come from a school
-- administrator ('admin'), from a self-registration, an invitation, an import, or the system. So the
-- column learns the sixth source rather than the function lying about the fifth.
alter table public.member_login_identities
  drop constraint if exists member_login_identities_registration_source_check;
alter table public.member_login_identities
  add constraint member_login_identities_registration_source_check
  check (registration_source in ('self_registration','invitation','import','admin','system','platform'));

comment on column public.member_login_identities.registration_source is
  'How this identity came to exist. ''platform'' means a platform operator provisioned it from the console.';

commit;
