import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeActivatedLogin } from '../../src/features/auth/identityActivation';

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const migration = read('supabase/migrations/202609020011_identity_activation_and_parent_uniqueness.sql');
const gateway = read('supabase/functions/admin-account/index.ts');
const teachers = read('apps/web/src/features/teachers/TeachersPage.tsx');
const students = read('apps/web/src/features/students/StudentsPage.tsx');
const parents = read('apps/web/src/features/parents/ParentsPage.tsx');

/**
 * "I added them and they cannot get in" was unanswerable from the screen: a roster row can fail the
 * sign-in for four separate reasons and none of them were visible. One button now sets all of them.
 */
describe('confirming an identity', () => {
  it('sets every condition each role\'s sign-in checks', () => {
    // Teacher: resolvable only while active, not deleted, and verified.
    expect(migration).toMatch(/update public\.teachers[\s\S]*status = 'active', deleted_at = null, verification_status = 'verified_teacher'/);
    // Student: the access switch is separate from the record being active, and both are checked.
    expect(migration).toMatch(/update public\.students[\s\S]*status = 'active', deleted_at = null, student_access_enabled = true/);
    // Guardian: the record active, and the identity and membership put back where an account exists.
    expect(migration).toMatch(/update public\.parents[\s\S]*status = 'active'/);
    expect(migration).toContain("update public.member_login_identities set status = 'active'");
    expect(migration).toContain('p_role::public.membership_role');
  });

  it('is an administrator action on their own school', () => {
    expect(migration).toMatch(/if not public\.has_school_role\(p_school_id,'admin'\) then raise exception 'FORBIDDEN'/);
    expect(migration).toMatch(/revoke all on function public\.activate_member_login\(uuid,text,uuid\) from public,anon/);
    expect(migration).toMatch(/grant execute on function public\.activate_member_login\(uuid,text,uuid\) to authenticated, service_role/);
  });

  it('never returns or invents a password', () => {
    // It reports that a guardian still needs one; it never reads, writes or derives the value.
    expect(migration).not.toMatch(/encrypted_password|crypt\(|auth\.users/);
    expect(migration).toContain("'needsPassword', p_role = 'parent' and linked_profile is null");
  });

  it('tells the administrator exactly what to type', () => {
    expect(describeActivatedLogin({
      role: 'teacher', recordId: 'r', displayName: 'สมศรี ปมฆรัง',
      signInCode: 'T-1BC2F4EB2F', hasAccount: true, needsPassword: false
    })).toContain('รหัสครู T-1BC2F4EB2F');
    expect(describeActivatedLogin({
      role: 'student', recordId: 'r', displayName: 'ชนากานต์ ทดสอบ',
      signInCode: 'P6-01', hasAccount: false, needsPassword: false
    })).toContain('เลขประจำตัว P6-01');
    expect(describeActivatedLogin({
      role: 'parent', recordId: 'r', displayName: 'กิตติศักดิ์ แสงทอง',
      signInCode: null, hasAccount: false, needsPassword: true
    })).toContain('เหลือตั้งรหัสผ่าน');
  });

  it('is reachable from all three roster screens', () => {
    for (const page of [teachers, students, parents]) {
      expect(page).toContain('activateMemberLogin');
      expect(page).toContain('ยืนยันไอดี');
    }
  });

  it('stops describing a teacher as having no account', () => {
    // A teacher's Auth identity is created by the gateway on first sign-in, so the roster never had
    // anything true to say here — and what it did say read as a blocker that could not be cleared.
    expect(teachers).not.toContain('ยังไม่มีบัญชีเข้าใช้');
  });
});

describe('one guardian per name', () => {
  it('holds the rule in the database, not only in the screen', () => {
    expect(migration).toMatch(/create unique index if not exists parents_unique_active_name[\s\S]*where status = 'active'/);
    expect(migration).toContain("lower(regexp_replace(trim(display_name),'\\s+',' ','g'))");
  });

  it('answers a duplicate with a sentence, not a constraint dump', () => {
    expect(gateway).toContain("message.includes('parents_unique_active_name')");
    expect(gateway).toContain("'PARENT_NAME_EXISTS'");
    expect(read('apps/web/src/features/auth/adminAccount.ts')).toContain('PARENT_NAME_EXISTS:');
  });

  it('updates the guardian already on the roster instead of adding another', () => {
    // Five identical guardians appeared in forty seconds because every save minted a new record id.
    expect(parents).toContain('managedParents.find((parent) => sameName(parent.parentName, displayName))');
    expect(parents).toContain('recordId: existing?.id ?? crypto.randomUUID()');
  });
});
