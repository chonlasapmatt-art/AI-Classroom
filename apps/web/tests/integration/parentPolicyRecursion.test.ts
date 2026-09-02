import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const fix = readFileSync(join(repositoryRoot, 'supabase/migrations/202609020010_parent_policy_recursion_fix.sql'), 'utf8');
const engine = readFileSync(join(repositoryRoot, 'apps/web/src/sync/engine.ts'), 'utf8');

/**
 * Two policies that read each other's table are a cycle Postgres refuses to walk. It surfaces only
 * when one statement touches both tables — which is every sync, because the pull reads the parent
 * links with the guardian embedded. The whole background sync ended in the error state because of it.
 */
describe('parent policies and the sync pull', () => {
  it('asks cross-table authority questions through definer helpers', () => {
    for (const fn of ['profile_owns_parent', 'staff_can_read_parent', 'staff_can_read_student_links']) {
      expect(fix).toContain(`create or replace function public.${fn}(`);
      expect(fix).toMatch(new RegExp(`function public\\.${fn}\\(p_[a-z_]+ uuid\\)[\\s\\S]{0,120}security definer`));
      expect(fix).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to authenticated`));
    }
  });

  it('leaves neither policy reading the other table inline', () => {
    const policies = fix.slice(fix.indexOf('drop policy if exists parents_scoped_read'));
    expect(policies).not.toMatch(/using \([\s\S]*exists\(select 1 from public\.parent_student_links/);
    expect(policies).not.toMatch(/using \([\s\S]*exists\(select 1 from public\.parents/);
    expect(policies).toContain('public.staff_can_read_parent(id)');
    expect(policies).toContain('public.profile_owns_parent(parent_id)');
  });

  it('keeps the same boundary the policies always drew', () => {
    // Administrator of the school, the guardian themselves, or staff who teach the child.
    expect(fix).toMatch(/create policy parents_scoped_read[\s\S]*has_school_role\(school_id,'admin'\)[\s\S]*profile_id = \(select auth\.uid\(\)\)[\s\S]*staff_can_read_parent\(id\)/);
    expect(fix).toMatch(/create policy parent_links_scoped_read[\s\S]*has_school_role\(school_id,'admin'\)[\s\S]*parent_has_active_link\(student_id\)/);
  });

  it('is on the path every sync takes', () => {
    // If this read throws, pullStructure throws with it and no device ever syncs anything.
    expect(engine).toContain("client.from('parent_student_links')");
    expect(engine).toContain('parents(profile_id, avatar_id, display_name, phone, line_user_id)');
    expect(engine).toContain('applied += await pullParentLinks(schoolId);');
  });
});
