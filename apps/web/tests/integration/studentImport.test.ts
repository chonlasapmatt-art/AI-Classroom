import { beforeEach, describe, expect, it } from 'vitest';
import { DexieSchoolRepository } from '../../src/data/dexieSchoolRepository';
import { db } from '../../src/db/database';
import { readImportFile } from '../../src/data/importParsing';
import {
  buildDraftRows, classifyRows, displayNameOf, isRunnable, looksLikeHeaderRow, suggestMapping
} from '../../src/features/imports/importPlan';

const schoolId = '77777777-7777-4777-8777-777777777777';

function fileOf(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as unknown as File;
}

/**
 * The path the screen takes, without the screen: read a file, plan it, then run the accepted rows
 * through the ordinary repository. Nothing here writes to Dexie directly, which is the property
 * worth pinning — a bulk import must not become a second way to create a student.
 */
async function importFile(repository: DexieSchoolRepository, file: File, existingStudents: {
  id: string; studentCode: string; displayName: string;
}[]) {
  const parsed = await readImportFile(file);
  const headerless = !looksLikeHeaderRow(parsed.table.columns);
  const mappings = suggestMapping(
    headerless ? [] : parsed.table.columns,
    headerless ? [parsed.table.columns, ...parsed.table.rows] : parsed.table.rows
  );
  const rows = classifyRows(
    buildDraftRows(parsed.table, mappings, headerless, { lowConfidence: parsed.confidence === 'low' }),
    existingStudents, []
  );
  let created = 0; let skipped = 0;
  for (const row of rows) {
    if (!isRunnable(row)) { skipped += 1; continue; }
    await repository.saveStudent({
      id: `imported-${row.studentCode}`, studentCode: row.studentCode.trim(),
      displayName: displayNameOf(row), avatarIndex: created * 7
    });
    created += 1;
  }
  await repository.recordImportRun({
    target: 'student', actorProfileId: 'teacher-1', fileName: file.name, fileKind: parsed.kind,
    startedAt: new Date().toISOString(), rowsDetected: rows.length, created, updated: 0, skipped, failed: 0
  });
  return { rows, created, skipped };
}

describe('importing a roster through the real student path', () => {
  const repository = new DexieSchoolRepository(schoolId);

  beforeEach(async () => {
    await Promise.all([db.students.clear(), db.enrollments.clear(), db.syncQueue.clear(), db.importRuns.clear()]);
  });

  it('creates every student in the database and queues each one for the server', async () => {
    const csv = 'รหัสนักเรียน,ชื่อ,นามสกุล\n25690001,ธนกร,ศรีสุวรรณ\n25690002,พิมพ์ชนก,ใจดี';
    const outcome = await importFile(repository, fileOf('roster.csv', csv), []);

    expect(outcome.created).toBe(2);
    const students = await db.students.toArray();
    expect(students.map((student) => student.displayName).sort())
      .toEqual(['พิมพ์ชนก ใจดี', 'ธนกร ศรีสุวรรณ'].sort());

    // Every row went through the same boundary a manually typed student uses.
    const queued = await db.syncQueue.toArray();
    expect(queued).toHaveLength(2);
    expect(queued.every((item) => item.entityType === 'student' && item.operation === 'upsert')).toBe(true);
  });

  it('reads a file with no header row at all', async () => {
    const text = '25690101\tสมชาย\tใจดี\tป.4/1\n25690102\tอารีย์\tสุขใจ\tป.4/1';
    const outcome = await importFile(repository, fileOf('roster.txt', text), []);
    expect(outcome.created).toBe(2);
    const codes = (await db.students.toArray()).map((student) => student.studentCode).sort();
    expect(codes).toEqual(['25690101', '25690102']);
  });

  it('leaves an existing student alone instead of overwriting them', async () => {
    await repository.saveStudent({
      id: 'student-existing', studentCode: '25690001', displayName: 'ธนกร ศรีสุวรรณ', avatarIndex: 1
    });
    await db.syncQueue.clear();

    const csv = 'รหัสนักเรียน,ชื่อ,นามสกุล\n25690001,ธนกร,ศรีสุวรรณ\n25690003,ใหม่,มาก';
    const outcome = await importFile(repository, fileOf('roster.csv', csv), [
      { id: 'student-existing', studentCode: '25690001', displayName: 'ธนกร ศรีสุวรรณ' }
    ]);

    expect(outcome.created).toBe(1);
    expect(outcome.skipped).toBe(1);
    expect(await db.students.count()).toBe(2);
    expect((await db.students.get('student-existing'))!.displayName).toBe('ธนกร ศรีสุวรรณ');
  });

  it('imports the good rows and holds back the broken ones', async () => {
    const csv = [
      'รหัสนักเรียน,ชื่อ,นามสกุล',
      '25690201,ดี,มาก',
      ',ไม่มี,รหัส',
      '25690202,ชื่อเดียว,',
      '25690203,ครบ,ถ้วน'
    ].join('\n');
    const outcome = await importFile(repository, fileOf('roster.csv', csv), []);

    expect(outcome.created).toBe(2);
    expect(outcome.skipped).toBe(2);
    expect(await db.students.count()).toBe(2);
    const review = outcome.rows.filter((row) => row.status === 'review');
    expect(review).toHaveLength(2);
  });

  it('keeps a receipt of the run that a teacher can look back at', async () => {
    await importFile(repository, fileOf('roster.csv', 'รหัสนักเรียน,ชื่อ,นามสกุล\n25690301,ก,ข'), []);
    const runs = await repository.listImportRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ target: 'student', fileName: 'roster.csv', rowsDetected: 1, created: 1 });
    expect(runs[0]!.finishedAt.length).toBeGreaterThan(0);
  });

  it('sends every row of an uncertain file to review rather than saving it', async () => {
    const pdf = [
      '%PDF-1.4', '4 0 obj', '<< /Length 90 >>', 'stream',
      'BT (25690401 Somchai Jaidee) Tj T* (25690402 Aree Sukjai) Tj ET',
      'endstream', 'endobj', '%%EOF'
    ].join('\n');
    const outcome = await importFile(repository, fileOf('roster.pdf', pdf), []);
    expect(outcome.rows.every((row) => row.status === 'review')).toBe(true);
    expect(outcome.rows.every((row) => row.issues.includes('อ่านจากไฟล์ไม่ชัดเจน'))).toBe(true);
  });
});
