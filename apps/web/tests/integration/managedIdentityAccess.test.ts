import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('managed roster identity flows', () => {
  const teacherPage = read('apps/web/src/features/teachers/TeachersPage.tsx');
  const teacherFunction = read('supabase/functions/teacher-account/index.ts');
  const teacherMigration = read('supabase/migrations/202609010036_managed_identity_access.sql');
  const teacherLoginMigration = read('supabase/migrations/202609010039_teacher_code_login.sql');
  const teacherPasswordlessMigration = read('supabase/migrations/202609010040_teacher_code_passwordless_access.sql');
  const teacherEmailFixMigration = read('supabase/migrations/202609010042_teacher_email_optional_fix.sql');
  const parentRegistrationMigration = read('supabase/migrations/202609010043_parent_registration_overload_fix.sql');
  const subjectMigration = read('supabase/migrations/202609010037_teacher_subject_assignments.sql');
  const importPage = read('apps/web/src/features/imports/ImportPage.tsx');
  const parentPage = read('apps/web/src/features/parents/ChildLinkPanel.tsx');
  const parentClient = read('apps/web/src/features/auth/memberAccess.ts');
  const parentFunction = read('supabase/functions/member-access/index.ts');
  const loginPage = read('apps/web/src/features/auth/LoginPage.tsx');
  const registerPage = read('apps/web/src/features/auth/AccountPages.tsx');

  it('keeps managed teacher provisioning as an admin action without an email field', () => {
    expect(teacherPage).not.toContain('provisionTeacherAccount');
    expect(teacherPage).not.toContain('name="email"');
    expect(teacherPage).not.toContain('สร้างคำเชิญบัญชีเข้าใช้งาน');
    expect(teacherPage).toContain('รหัสผ่านเริ่มต้น');
    expect(teacherPage).toContain('provisionManagedAccount');
    expect(teacherFunction).toContain('teachers.smart-classroom.invalid');
    expect(teacherFunction).not.toContain('TEACHER_EMAIL_REQUIRED');
    expect(teacherMigration).toContain("'TEACHER_LOGIN_CREDENTIAL_CREATED'");
    expect(teacherEmailFixMigration).toContain("coalesce(nullif(trim(coalesce(p_email,'')),''),'')");
  });

  it('lets an admin choose an existing subject or type a new subject and save it', () => {
    expect(teacherPage).toContain('name="subject"');
    expect(teacherPage).toContain('list="teacher-subject-options"');
    expect(teacherPage).toContain('พิมพ์ชื่อวิชาใหม่ของโรงเรียนแล้วกดบันทึก');
    expect(teacherPage).toContain('repository.saveSubject');
    expect(teacherPage).not.toContain('type="checkbox"');
    expect(subjectMigration).toContain('subject_id');
    expect(subjectMigration).toContain('TEACHER_SUBJECT_CLASS_ASSIGNED');
    expect(importPage).toContain('readImportFile(file)');
    expect(importPage).toContain('acceptedImportExtensions');
    expect(importPage).toContain('buildStaffRows');
  });

  it('keeps parent child search inside the selected school and links immediately', () => {
    expect(parentPage).toContain('searchChildren(schoolId, childName)');
    expect(parentClient).toContain("action: 'children-search', schoolId");
    expect(parentFunction).toContain("p_school_id: String(body.schoolId ?? '')");
    expect(teacherMigration).toContain("values(target.school_id,parent_id,target.id,clean_relationship,'linked',clock_timestamp())");
    expect(teacherMigration).toContain("'PARENT_CHILD_LINKED'");
    expect(parentRegistrationMigration).toContain('drop function if exists public.register_member_identity(uuid,text,text,text,text,uuid,text,uuid)');
    expect(parentFunction).toContain("const REGISTRATION_FAILURE = 'MEMBER_REGISTRATION_FAILED'");
    expect(parentClient).toContain("code === 'MEMBER_REGISTRATION_FAILED'");
  });

  it('keeps public registration disabled at both UI and gateway layers', () => {
    expect(registerPage).not.toContain('registerParent');
    expect(parentFunction).toContain("code: 'PUBLIC_ACCESS_DISABLED'");
    expect(teacherMigration).toContain("if p_role='teacher' then raise exception 'TEACHER_ADMIN_ONLY'");
  });

  it('uses the saved teacher code for teacher login and keeps passwords for parents', () => {
    expect(teacherPage).toContain('รหัสครู');
    expect(teacherPage).toContain('ใช้เป็นรหัสประจำตัวครู ไม่ใช่รหัสผ่าน');
    // The button sets a password. It does not create the account — the sign-in gateway does that on
    // first use from the name and code — and calling it "สร้างบัญชีเข้าใช้" made a teacher who had
    // never pressed it look locked out when they were not.
    expect(teacherPage).toContain('ตั้งรหัสผ่าน');
    expect(teacherPage).toContain('ยืนยันไอดี');
    expect(loginPage).toContain('teacherLogin');
    expect(loginPage).toContain('teacherCode: password');
    expect(loginPage).toContain('ใช้ชื่อและรหัสครูที่แอดมินโรงเรียนบันทึกให้');
    expect(loginPage).toContain("role: 'parent'");
    expect(teacherLoginMigration).toContain('teachers_login_code_idx');
    expect(teacherLoginMigration).toContain('t.teacher_code');
    expect(teacherLoginMigration).toContain('p_role=\'teacher\'');
    expect(teacherLoginMigration).toContain('grant execute on function public.resolve_member_login(text,text) to service_role');
    expect(teacherPasswordlessMigration).toContain('resolve_teacher_access');
    expect(teacherPasswordlessMigration).toContain('activate_teacher_access');
    expect(teacherPasswordlessMigration).toContain('teacher_code');
    expect(teacherPasswordlessMigration).toContain('grant execute on function public.activate_teacher_access(uuid,uuid,text) to service_role');
    expect(parentFunction).toContain("action === 'teacher-login'");
  });
});
