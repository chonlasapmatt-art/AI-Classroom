import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// These assertions read the deployed artefacts rather than mocking them. The rule being protected —
// that nobody becomes a teacher without their school saying so — is enforced by a grant, a signature
// and a definer function, and none of those can be checked by exercising the client.

const repositoryRoot = resolve(process.cwd(), '../..');
// Line endings are a checkout artifact on Windows, not a property of the file, so they are
// normalised before anything is asserted about the text.
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8').split('\r\n').join('\n');

const migration = read('supabase/migrations/202608310020_teacher_access_codes.sql');
const codeFunction = read('supabase/functions/teacher-code/index.ts');
const memberFunction = read('supabase/functions/member-access/index.ts');
const sharedCrypto = read('supabase/functions/_shared/teacherCode.ts');
const registerPage = read('apps/web/src/features/auth/AccountPages.tsx');
const adminPanel = read('apps/web/src/features/teachers/TeacherAccessCodePanel.tsx');
const clientModule = read('apps/web/src/features/teachers/teacherAccessCode.ts');

describe('teacher access codes', () => {
  describe('the table', () => {
    it('is readable by no browser session at all', () => {
      expect(migration).toContain('alter table public.teacher_access_codes enable row level security');
      expect(migration).toMatch(/revoke all on public\.teacher_access_codes from public, anon, authenticated/);
      expect(migration).toMatch(/revoke all on public\.teacher_access_code_uses from public, anon, authenticated/);
      // No policy re-opens it: a grant that was never made cannot be worked around by a policy.
      expect(migration).not.toMatch(/grant select on public\.teacher_access_codes/);
    });

    it('never stores a usable code beside its own key', () => {
      expect(migration).toContain('code_hash text not null');
      expect(migration).toContain('code_cipher text not null');
      expect(sharedCrypto).toContain('AES-GCM');
      // The key is passed in from the environment by the caller; the module holds none of its own.
      expect(sharedCrypto).not.toContain('Deno.env.get');
    });

    it('allows one live code per school so rotation cannot leave two working', () => {
      expect(migration).toMatch(
        /create unique index if not exists teacher_access_code_active_school\s+on public\.teacher_access_codes\(school_id\) where status = 'active'/
      );
    });
  });

  describe('who may issue one', () => {
    it('requires an administrator, not merely somebody who can operate the school', () => {
      expect(migration).toContain('create or replace function public.member_is_school_admin');
      expect(migration).toMatch(/m\.role='admin'/);
      // member_can_operate admits verified teachers, which would let a teacher staff the school.
      const guarded = ['issue_teacher_access_code', 'reveal_teacher_access_code',
        'revoke_teacher_access_code', 'teacher_access_code_history'];
      for (const name of guarded) {
        const body = migration.slice(migration.indexOf(`function public.${name}`));
        expect(body.slice(0, 1500)).toContain('member_is_school_admin');
      }
    });

    it('keeps every code function away from browser sessions', () => {
      const serviceOnly = [
        'issue_teacher_access_code(uuid,uuid,text,text,text,text,timestamptz,integer)',
        'reveal_teacher_access_code(uuid,uuid)',
        'revoke_teacher_access_code(uuid,uuid,text)',
        'teacher_access_code_history(uuid,uuid)',
        'claim_teacher_access_code(uuid,text)',
        'record_teacher_access_code_use(uuid,uuid,uuid,text)',
        'release_teacher_access_code(uuid)'
      ];
      for (const signature of serviceOnly) {
        expect(migration).toContain(`revoke all on function public.${signature} from public,anon,authenticated`);
        expect(migration).toContain(`grant execute on function public.${signature} to service_role`);
      }
    });
  });

  describe('registration', () => {
    it('drops the signature that let a teacher register without a code', () => {
      expect(migration).toContain(
        'drop function if exists public.register_member_identity(uuid,text,text,text,text,uuid,text)'
      );
      expect(migration).toContain('p_access_code_id uuid default null');
    });

    it('refuses a teacher with no code, in the database rather than only in the gateway', () => {
      expect(migration).toContain('TEACHER_CODE_REQUIRED');
      expect(migration).toMatch(/if p_access_code_id is null then\s+raise exception 'TEACHER_CODE_REQUIRED'/);
    });

    it('refuses a code belonging to another school', () => {
      expect(migration).toMatch(
        /select \* into claimed from public\.teacher_access_codes\s+where id=p_access_code_id and school_id=target_school\.id/
      );
    });

    it('grants the teacher membership only, never an administrator one', () => {
      const teacherBranch = migration.slice(migration.indexOf("if p_role='teacher' then\n    select id into teacher_id"));
      expect(teacherBranch).toContain("values(target_school.id,p_actor,'teacher','active')");
      expect(teacherBranch).not.toContain("'admin'");
    });
  });

  describe('claiming a use', () => {
    it('locks the row so two teachers cannot both take the last use', () => {
      expect(migration).toMatch(
        /where school_id=p_school_id and code_hash=lower\(p_code_hash\) for update/
      );
    });

    it('answers the same way for revoked, expired and used-up codes', () => {
      const claim = migration.slice(migration.indexOf('function public.claim_teacher_access_code'));
      expect(claim).toContain("'valid', false");
      expect(claim).toContain("'reason', 'revoked'");
      expect(claim).toContain("'reason', 'expired'");
      expect(claim).toContain("'reason', 'exhausted'");
    });

    it('claims before the account is created and hands the use back when it fails', () => {
      const claimIndex = memberFunction.indexOf("claim_teacher_access_code");
      const createIndex = memberFunction.indexOf('auth.admin.createUser');
      expect(claimIndex).toBeGreaterThan(-1);
      expect(claimIndex).toBeLessThan(createIndex);
      expect(memberFunction).toContain('release_teacher_access_code');
      expect(memberFunction).toContain('await releaseClaim()');
    });

    it('records every redemption in the school audit log', () => {
      expect(migration).toContain("'TEACHER_CODE_REDEEMED'");
      expect(migration).toContain("'TEACHER_CODE_CREATED'");
      expect(migration).toContain("'TEACHER_CODE_ROTATED'");
      expect(migration).toContain("'TEACHER_CODE_REVOKED'");
      expect(migration).toContain("'TEACHER_CODE_VIEWED'");
    });
  });

  describe('the gateway', () => {
    it('binds a code to its school so the same digits elsewhere are a different code', () => {
      expect(sharedCrypto).toContain('teacher-code|${schoolId}|');
    });

    it('keys both halves from one place, so issuing and redeeming cannot drift apart', () => {
      // They did drift: issuing read TEACHER_CODE_SECRET and redeeming read
      // MEMBER_ACCESS_HMAC_SECRET, which agreed only while the dedicated secret was unset. Setting
      // it broke every code in the system. One resolver, asked by both.
      expect(sharedCrypto).toContain('export function resolveTeacherCodeSecret');
      for (const source of [codeFunction, memberFunction]) {
        expect(source).toContain('resolveTeacherCodeSecret');
      }
      // Neither may reach for a code key by name on its own again.
      for (const source of [codeFunction, memberFunction]) {
        expect(source).not.toMatch(/Deno\.env\.get\('TEACHER_CODE_SECRET'\)/);
      }
      // The hash that redeems is computed with the resolved key, never with this gateway's own.
      expect(memberFunction).toMatch(/hashAccessCode\(schoolId!, accessCode, codeSecret\)/);
    });

    it('rate limits code operations and refuses an unauthenticated caller', () => {
      expect(codeFunction).toContain("json({ code: 'AUTH_REQUIRED' }, 401, headers)");
      expect(codeFunction).toContain('TEACHER_CODE_LOCKED');
      expect(codeFunction).toContain('member_access_attempts');
    });

    it('never returns the sealed value to the browser', () => {
      expect(codeFunction).toContain('const { cipher: _sealed, ...safe } = result');
    });
  });

  describe('the client', () => {
    it('does not expose teacher self-registration', () => {
      expect(registerPage).not.toContain('registerTeacher');
      expect(registerPage).not.toContain('รหัสสำหรับครู');
    });

    it('decides nothing about validity in React', () => {
      // Comparing a code in the browser would put every school's code in the bundle.
      for (const source of [clientModule, adminPanel, registerPage]) {
        expect(source).not.toMatch(/code_hash|codeHash|===\s*['"]SC-/);
      }
    });

    it('keeps no code in browser storage', () => {
      expect(clientModule).not.toContain('localStorage');
      expect(adminPanel).not.toContain('localStorage');
    });
  });
});
