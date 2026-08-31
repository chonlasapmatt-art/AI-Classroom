-- Categories for the question bank.
--
-- The bank already had `unit` and `topic`, which are free text. Free text is fine for a note and
-- wrong for a category: two teachers write "เศษส่วน" and "เศษ ส่วน", the filter shows two groups,
-- and nobody can rename either without editing every question that used it. A category a school
-- can create, rename, reorder and retire has to be a row.
--
-- Retiring rather than deleting is the same decision the rest of the schema makes. A category that
-- disappears takes its questions' grouping with it, and an exam sat last term keeps a snapshot of
-- the question but not of what it was filed under, so an archived category stays readable and stops
-- being offered for new questions instead.
--
-- Reading stays a plain select under the existing staff-only policy — the console filters and the
-- teacher's screen both want ordinary queries — and every write goes through a definer function that
-- checks the school for itself.

begin;

create table if not exists public.question_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  -- A category usually belongs to a subject. Leaving it null makes one that spans subjects, which a
  -- school that files by theme rather than by subject will want.
  subject_id uuid references public.subjects(id),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '',
  position integer not null default 0,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live category per name per subject. Case and spacing are collapsed so "เศษส่วน" and
-- "เศษส่วน " cannot both exist and split a teacher's questions between them.
create unique index if not exists question_categories_unique_name
  on public.question_categories(
    school_id, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  ) where status = 'active';
create index if not exists question_categories_listing
  on public.question_categories(school_id, subject_id, position);

alter table public.question_categories enable row level security;
revoke all on public.question_categories from public, anon, authenticated;
grant select on public.question_categories to authenticated;

-- Same rule the bank itself follows: staff material, and students and parents are refused by
-- privilege rather than by a policy that has to keep being written correctly.
drop policy if exists question_categories_staff_read on public.question_categories;
create policy question_categories_staff_read on public.question_categories for select to authenticated
  using (
    public.has_school_role(school_id,'admin')
    or public.is_verified_teacher(school_id,(select auth.uid()))
  );

comment on table public.question_categories is
  'Named groups inside the question bank. Renaming one renames it everywhere; archiving one keeps history readable.';

alter table public.question_bank
  add column if not exists category_id uuid references public.question_categories(id);
create index if not exists question_bank_category_idx
  on public.question_bank(school_id, category_id, status);

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

/** Creates or renames a category. New ones land at the end of their subject's list. */
create or replace function public.save_question_category(
  p_school_id uuid, p_category_id uuid, p_subject_id uuid, p_name text, p_description text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target uuid; next_position integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_name,''))) < 1 then raise exception 'VALIDATION_ERROR: name'; end if;
  if p_subject_id is not null and not exists(
    select 1 from public.subjects s where s.id=p_subject_id and s.school_id=p_school_id
  ) then raise exception 'NOT_FOUND: subject'; end if;

  if p_category_id is null then
    select coalesce(max(c.position), 0) + 1 into next_position
      from public.question_categories c
      where c.school_id = p_school_id and c.subject_id is not distinct from p_subject_id;
    insert into public.question_categories(school_id, subject_id, name, description, position, created_by)
      values(p_school_id, p_subject_id, regexp_replace(trim(p_name),'\s+',' ','g'),
        left(coalesce(p_description,''),400), next_position, actor)
      returning id into target;
  else
    update public.question_categories set
      name = regexp_replace(trim(p_name),'\s+',' ','g'),
      description = left(coalesce(p_description,''),400),
      subject_id = p_subject_id,
      status = 'active',
      updated_at = clock_timestamp()
    where id = p_category_id and school_id = p_school_id
    returning id into target;
    if target is null then raise exception 'NOT_FOUND'; end if;
  end if;

  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(p_school_id, actor,
      case when p_category_id is null then 'QUESTION_CATEGORY_CREATED' else 'QUESTION_CATEGORY_RENAMED' end,
      'question_category', target,
      jsonb_build_object('name', trim(p_name), 'subjectId', p_subject_id));
  return target;
end $$;

/** Puts the categories in the order the school wants to see them. */
create or replace function public.reorder_question_categories(p_school_id uuid, p_ordered_ids uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); moved integer := 0; category_id uuid; index integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  foreach category_id in array p_ordered_ids loop
    index := index + 1;
    update public.question_categories set position = index, updated_at = clock_timestamp()
      where id = category_id and school_id = p_school_id;
    if found then moved := moved + 1; end if;
  end loop;
  return moved;
end $$;

/**
 * Retires a category, or brings one back.
 *
 * Questions filed under it keep pointing at it: the group they belong to did not stop being true
 * when the school stopped using it, and an archived category still reads correctly in an old filter.
 */
create or replace function public.set_question_category_status(p_category_id uuid, p_status text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target public.question_categories%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if p_status not in ('active','archived') then raise exception 'VALIDATION_ERROR: status'; end if;
  select * into target from public.question_categories where id = p_category_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.can_operate_school(target.school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;

  update public.question_categories set status = p_status, updated_at = clock_timestamp()
    where id = p_category_id;
  insert into public.audit_log(school_id, actor_profile_id, action, entity_type, entity_id, after_json)
    values(target.school_id, actor,
      case when p_status = 'archived' then 'QUESTION_CATEGORY_ARCHIVED' else 'QUESTION_CATEGORY_RESTORED' end,
      'question_category', p_category_id, jsonb_build_object('name', target.name));
end $$;

-- ---------------------------------------------------------------------------
-- The bank write learns about categories
-- ---------------------------------------------------------------------------

create or replace function public.save_bank_question(
  p_school_id uuid, p_question_id uuid, p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target uuid; chosen_category uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.can_operate_school(p_school_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(trim(p_payload->>'prompt'),'')='' then raise exception 'VALIDATION_ERROR'; end if;

  -- A category from another school would file this question somewhere its own staff cannot see.
  chosen_category := (p_payload->>'categoryId')::uuid;
  if chosen_category is not null and not exists(
    select 1 from public.question_categories c where c.id = chosen_category and c.school_id = p_school_id
  ) then raise exception 'NOT_FOUND: category'; end if;

  insert into public.question_bank(id,school_id,subject_id,category_id,grade_level,unit,topic,difficulty,
    question_type,prompt,choices,answer_key,explanation,points,tags,status,created_by,updated_by)
  values(coalesce(p_question_id,gen_random_uuid()),p_school_id,(p_payload->>'subjectId')::uuid,chosen_category,
    coalesce(p_payload->>'gradeLevel',''),coalesce(p_payload->>'unit',''),coalesce(p_payload->>'topic',''),
    coalesce(p_payload->>'difficulty','medium'),coalesce(p_payload->>'questionType','multiple_choice'),
    trim(p_payload->>'prompt'),coalesce(p_payload->'choices','[]'::jsonb),coalesce(p_payload->'answerKey','[]'::jsonb),
    coalesce(p_payload->>'explanation',''),coalesce((p_payload->>'points')::numeric,1),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb)) as value),'{}'),
    coalesce(p_payload->>'status','active'),actor,actor)
  on conflict(id) do update set subject_id=excluded.subject_id,category_id=excluded.category_id,
    grade_level=excluded.grade_level,unit=excluded.unit,topic=excluded.topic,difficulty=excluded.difficulty,
    question_type=excluded.question_type,prompt=excluded.prompt,choices=excluded.choices,
    answer_key=excluded.answer_key,explanation=excluded.explanation,points=excluded.points,
    tags=excluded.tags,status=excluded.status,updated_by=actor,updated_at=clock_timestamp(),deleted_at=null
  returning id into target;

  insert into public.audit_log(school_id,actor_profile_id,action,entity_type,entity_id,after_json)
    values(p_school_id,actor,case when p_question_id is null then 'QUESTION_CREATED' else 'QUESTION_UPDATED' end,
      'question_bank',target,jsonb_build_object('prompt',left(trim(p_payload->>'prompt'),200),
        'difficulty',p_payload->>'difficulty','type',p_payload->>'questionType','categoryId',chosen_category));
  return target;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.save_question_category(uuid,uuid,uuid,text,text) from public,anon;
revoke all on function public.reorder_question_categories(uuid,uuid[]) from public,anon;
revoke all on function public.set_question_category_status(uuid,text) from public,anon;
grant execute on function public.save_question_category(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.reorder_question_categories(uuid,uuid[]) to authenticated;
grant execute on function public.set_question_category_status(uuid,text) to authenticated;

commit;
