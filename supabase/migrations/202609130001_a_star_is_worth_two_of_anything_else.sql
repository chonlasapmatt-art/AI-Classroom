-- A star is worth two of anything else, and there are only twenty of them per child.
--
-- The activity hub gives a teacher one button per child: a star, for joining in. It is worth four
-- points where a register mark and a marked piece of work are worth two, because a child who stands
-- up in front of the room should move faster than one who hands work in quietly — that is the whole
-- intent of the thing, and it feeds the same ledger every other award goes through, so it counts
-- towards the level that unlocks avatar pieces without a second scheme to keep in step.
--
-- ── Why the category, and not a reason or a source id ──
-- Both halves of the rule need the server to recognise a star: the fixed value and the ceiling.
-- `reason` is free text a teacher can rephrase, and `source_id` is a uuid column pointing at
-- whatever produced an award — neither can carry a marker. `category` is the column that already
-- says what kind of award a row is, so it says this one too.
--
-- ── Why a trigger rather than a check in the write path ──
-- `apply_sync_mutation` is the only way a session writes today, and a rule that lives inside one
-- writer is a rule that holds until somebody adds another. A ceiling on how much a child may be
-- given is exactly the kind of invariant that has to survive that, so it sits on the table: every
-- path in, now and later, meets it.
--
-- Twenty stars is eighty points — most of two levels — which is a real reward and not a way around
-- the rest of the scheme. Nothing already awarded is touched: the ceiling counts the rows that
-- exist, and a school that has never given a star starts from zero.

begin;

/*
 * `star` joins the categories.
 *
 * The constraint is replaced rather than added to, because a check constraint is one expression.
 * The name is the one Postgres generated for the inline check in 202608300018; it is looked up
 * rather than assumed, so this still applies if that table was ever rebuilt under another name.
 */
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'score_events' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%category%participation%';
  if constraint_name is not null then
    execute format('alter table public.score_events drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.score_events add constraint score_events_category_check
  check (category in ('bonus','participation','assignment','activity','project','test','exam','manual','other','star'));

/**
 * What a star is allowed to be.
 *
 * Two rules, both of them about a number a teacher never types: a star is four points, and a child
 * may hold twenty of them. Anything else claiming to be a star is refused rather than quietly
 * stored, because a star that is worth seven to one class and four to another is not a star.
 *
 * The count excludes the row being written — an update re-counts itself otherwise — and excludes
 * deleted rows, so withdrawing a star gives the child their place back rather than burning it.
 */
create or replace function public.enforce_star_award()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  held integer;
begin
  if new.category is distinct from 'star' then return new; end if;

  if new.points <> 4 then
    raise exception 'STAR_VALUE: a star is worth 4 points, not %', new.points using errcode='22000';
  end if;

  select count(*) into held from public.score_events
  where student_id = new.student_id
    and category = 'star'
    and deleted_at is null
    and id <> new.id;

  if held >= 20 then
    raise exception 'STAR_CAP_REACHED: % already holds 20 stars', new.student_id using errcode='22000';
  end if;

  return new;
end $fn$;

comment on function public.enforce_star_award() is
  'A star is 4 points and a child may hold 20. Enforced on the table so every write path meets it.';

drop trigger if exists score_events_star_rules on public.score_events;
create trigger score_events_star_rules
  before insert or update on public.score_events
  for each row execute function public.enforce_star_award();

commit;
