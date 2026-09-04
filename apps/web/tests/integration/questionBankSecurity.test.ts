import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A question carries its own answer key, so who may read the bank is the whole security question.
// It is settled by a grant and a policy, neither of which a test can exercise by rendering a screen.

const repositoryRoot = resolve(process.cwd(), '../..');
// Line endings are a checkout artifact on Windows, not a property of the file, so they are
// normalised before anything is asserted about the text.
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8').split('\r\n').join('\n');

const bankMigration = read('supabase/migrations/202608300019_exam_schedule_and_question_bank.sql');
const categoryMigration = read('supabase/migrations/202608310025_question_categories.sql');
const client = read('apps/web/src/features/questions/questionBank.ts');
const page = read('apps/web/src/features/questions/QuestionBankPage.tsx');
const menu = read('apps/web/src/layouts/navigation.ts');

describe('the question bank', () => {
  it('is staff material, refused to students and parents by privilege', () => {
    expect(bankMigration).toContain('revoke all on public.question_bank from public, anon, authenticated');
    expect(bankMigration).toContain('grant select on public.question_bank to authenticated');
    expect(bankMigration).toMatch(
      /create policy question_bank_staff_read[\s\S]{0,240}has_school_role\(school_id,'admin'\)\s*or public\.is_verified_teacher/
    );
  });

  it('gives categories the same rule as the questions filed under them', () => {
    expect(categoryMigration).toContain('revoke all on public.question_categories from public, anon, authenticated');
    expect(categoryMigration).toMatch(
      /create policy question_categories_staff_read[\s\S]{0,260}is_verified_teacher/
    );
  });

  it('checks the school inside every write rather than trusting the caller', () => {
    for (const name of ['save_question_category', 'reorder_question_categories',
      'set_question_category_status', 'save_bank_question']) {
      const body = categoryMigration.slice(categoryMigration.indexOf(`function public.${name}`));
      expect(body.slice(0, 1400)).toContain('can_operate_school');
    }
  });

  it('refuses a category belonging to another school', () => {
    // Filing a question under a stranger's category would hide it from the staff who own it.
    expect(categoryMigration).toMatch(
      /where c\.id = chosen_category and c\.school_id = p_school_id[\s\S]{0,120}NOT_FOUND: category/
    );
  });

  it('keeps one live category per name, so a filter cannot split one topic in two', () => {
    expect(categoryMigration).toContain('create unique index if not exists question_categories_unique_name');
    expect(categoryMigration).toContain("lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))");
    expect(categoryMigration).toContain("where status = 'active'");
  });

  it('archives a category instead of deleting it', () => {
    expect(categoryMigration).not.toMatch(/delete from public\.question_categories/);
    expect(categoryMigration).toContain("p_status not in ('active','archived')");
  });

  it('records every change to the bank in the school audit log', () => {
    for (const action of ['QUESTION_CREATED', 'QUESTION_UPDATED', 'QUESTION_CATEGORY_CREATED',
      'QUESTION_CATEGORY_RENAMED', 'QUESTION_CATEGORY_ARCHIVED']) {
      expect(categoryMigration).toContain(action);
    }
  });
});

describe('the question bank screen', () => {
  it('searches on the server rather than downloading the bank to filter it', () => {
    // An answer key for a question nobody matched should never reach the device.
    expect(client).toMatch(/query = query\.or\(`prompt\.ilike/);
    expect(client).toContain(".limit(limit)");
    expect(page).not.toMatch(/questions\.filter\([^)]*prompt/);
  });

  it('is offered to staff only, and says why when somebody else opens it', () => {
    // The menu is written per role now, so "who sees the bank" is how many role menus name it:
    // the admin's and the teacher's, and no others.
    expect(menu).toContain("destination('/question-bank', 'คลังข้อสอบ', 'question-bank')");
    expect(menu.split("'/question-bank'").length - 1).toBe(2);
    expect(page).toContain('หน้านี้สำหรับครูและผู้ดูแลโรงเรียน');
  });

  it('validates before asking the server, and still lets the server decide', () => {
    expect(client).toContain('const problems = validateDraft(draft)');
    expect(client).toMatch(/rpc\('save_bank_question'/);
    // Nothing in the browser writes to the table directly.
    expect(client).not.toMatch(/from\('question_bank'\)\s*\.(insert|update|upsert|delete)/);
    expect(client).not.toMatch(/from\('question_categories'\)\s*\.(insert|update|upsert|delete)/);
  });

  it('tells a teacher that editing the bank does not rewrite a sat paper', () => {
    const editor = read('apps/web/src/features/questions/QuestionEditor.tsx');
    expect(editor).toContain('ข้อสอบที่สอบไปแล้วใช้สำเนาของคำถามตอนนั้น');
  });
});
