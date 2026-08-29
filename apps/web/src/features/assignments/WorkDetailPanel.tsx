import { useState } from 'react';
import { Badge, Button, DataTable, Field, Modal, ProgressBar, Stat } from '../../ui/components';
import { acknowledgementSummary, rosterRowsFor } from '../../academic/views';
import { workStateLabels, workStateTone } from '../../academic/workStatus';
import { rubricMaxScore } from '../../academic/rubric';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { Assignment, Student } from '../../domain/types';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ProfileAvatar } from '../avatars/ProfileAvatar';

interface Props {
  work: Assignment;
  roster: Student[];
  actorProfileId: string;
  onMessage(message: string): void;
}

/** The teacher's working view of one piece of work: who has it, who sent it back, and marking. */
export function WorkDetailPanel({ work, roster, actorProfileId, onMessage }: Props) {
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const rows = rosterRowsFor(snapshot, work, roster);
  const summary = acknowledgementSummary(snapshot, work.id, roster);
  const rubric = work.rubricId ? snapshot.rubrics.find((item) => item.id === work.rubricId) ?? null : null;

  const [grading, setGrading] = useState<Student | null>(null);
  const [extending, setExtending] = useState<Student | null>(null);
  const [revising, setRevising] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onMessage(message);
      setGrading(null);
      setExtending(null);
      setRevising(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="work-detail">
      <div className="ui-stat-grid">
        <Stat label="แจ้งเตือนแล้ว" value={summary.notified} hint="นักเรียนในห้อง" tone="brand" />
        <Stat label="เปิดดูแล้ว" value={summary.opened} hint={`ยังไม่เปิด ${summary.unopened}`} tone="info" />
        <Stat label="รับทราบแล้ว" value={summary.acknowledged} tone="success" />
        <Stat
          label="ส่งแล้ว"
          value={rows.filter((row) => ['submitted', 'late', 'graded'].includes(row.state)).length}
          hint={`ตรวจแล้ว ${rows.filter((row) => row.state === 'graded').length}`}
          tone="success"
        />
      </div>

      <AttachmentPanel
        ownerType="assignment" ownerId={work.id} uploadedBy={actorProfileId}
        canUpload title="เอกสารประกอบการสอน (แจกให้นักเรียนทั้งห้อง)"
        notify={{
          classId: work.classId,
          studentIds: roster.map((student) => student.id),
          assignmentId: work.id,
          title: `เอกสารใหม่: ${work.title}`
        }}
      />

      <DataTable
        caption={`รายชื่อการส่งงาน ${work.title}`}
        head={
          <tr>
            <th>นักเรียน</th><th>สถานะ</th><th>ส่งเมื่อ</th><th>เวอร์ชัน</th><th>คะแนน</th><th>จัดการ</th>
          </tr>
        }
      >
        {rows.map((row) => (
          <tr key={row.student.id}>
            <td>
              <div className="cell-person">
                <ProfileAvatar
                  displayName={row.student.displayName}
                  avatarId={row.student.avatarId}
                  avatarIndex={row.student.avatarIndex}
                  avatarConfig={row.student.avatarConfig}
                  size={34}
                />
                <div>
                  <strong>{row.student.displayName}</strong>
                  <span>{row.student.studentCode}{row.extended ? ' · ขยายเวลา' : ''}</span>
                </div>
              </div>
            </td>
            <td><Badge tone={workStateTone[row.state]}>{workStateLabels[row.state]}</Badge></td>
            <td>{row.submission?.submittedAt ? new Date(row.submission.submittedAt).toLocaleString('th-TH') : '—'}</td>
            <td>{row.versions === 0 ? '—' : `v${row.versions}`}</td>
            <td>
              {row.submission?.score === null || row.submission?.score === undefined
                ? '—'
                : `${row.submission.score}/${work.maxScore}${row.submission.finalGrade ? ` · ${row.submission.finalGrade}` : ''}`}
            </td>
            <td>
              <div className="cell-actions">
                <Button size="sm" variant="secondary" onClick={() => setGrading(row.student)}>ให้คะแนน</Button>
                <Button size="sm" variant="ghost" onClick={() => setRevising(row.student)}>ขอแก้ไข</Button>
                <Button size="sm" variant="ghost" onClick={() => setExtending(row.student)}>ขยายเวลา</Button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      {error && <p className="ui-field-message" role="alert">{error}</p>}

      {grading && (
        <GradeModal
          work={work}
          student={grading}
          rubricTitle={rubric?.title ?? null}
          criteria={rubric?.criteria ?? []}
          existing={snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === grading.id)}
          rubricScores={snapshot.rubricScores.filter((item) => item.assignmentId === work.id && item.studentId === grading.id)}
          busy={busy}
          onClose={() => setGrading(null)}
          onSubmit={(payload) => run(async () => {
            await repository.scoreSubmission({
              assignmentId: work.id,
              studentId: grading.id,
              ...(payload.score === undefined ? {} : { score: payload.score }),
              ...(payload.rubricEntries ? { rubricEntries: payload.rubricEntries } : {}),
              teacherNote: payload.teacherNote,
              gradedBy: actorProfileId
            });
            if (payload.overrideGrade) {
              await repository.overrideGrade(work.id, grading.id, payload.overrideGrade, payload.overrideReason, actorProfileId);
            }
          }, `บันทึกคะแนนของ ${grading.displayName} แล้ว`)}
        />
      )}

      {revising && (
        <Modal
          title={`ขอแก้ไขงานของ ${revising.displayName}`}
          description="นักเรียนจะได้รับแจ้งเตือนและส่งงานใหม่ได้ โดยประวัติเดิมยังอยู่ครบ"
          onClose={() => setRevising(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setRevising(null)}>ยกเลิก</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => {
                  const note = (document.getElementById('revision-note') as HTMLTextAreaElement | null)?.value ?? '';
                  void run(() => repository.requestRevision(work.id, revising.id, note, actorProfileId), 'ส่งคำขอแก้ไขแล้ว');
                }}
              >
                ส่งคำขอแก้ไข
              </Button>
            </>
          }
        >
          <Field label="สิ่งที่ต้องแก้ไข">
            <textarea id="revision-note" rows={3} placeholder="แก้ส่วนสรุปและส่งใหม่" />
          </Field>
        </Modal>
      )}

      {extending && (
        <Modal
          title={`ขยายเวลาให้ ${extending.displayName}`}
          description="กำหนดส่งของทั้งห้องไม่เปลี่ยน เฉพาะนักเรียนคนนี้เท่านั้น"
          onClose={() => setExtending(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setExtending(null)}>ยกเลิก</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => {
                  const value = (document.getElementById('extension-date') as HTMLInputElement | null)?.value;
                  const reason = (document.getElementById('extension-reason') as HTMLInputElement | null)?.value ?? '';
                  if (!value) { setError('เลือกกำหนดส่งใหม่ก่อน'); return; }
                  void run(
                    () => repository.grantExtension(work.id, extending.id, new Date(value).toISOString(), reason, actorProfileId),
                    `ขยายเวลาให้ ${extending.displayName} แล้ว`
                  );
                }}
              >
                บันทึกการขยายเวลา
              </Button>
            </>
          }
        >
          <Field label="กำหนดส่งเดิม">
            <input value={work.dueAt ? new Date(work.dueAt).toLocaleString('th-TH') : 'ไม่กำหนด'} readOnly />
          </Field>
          <Field label="กำหนดส่งใหม่">
            <input id="extension-date" type="datetime-local" />
          </Field>
          <Field label="เหตุผล" hint="บันทึกลงประวัติการตรวจสอบ">
            <input id="extension-reason" placeholder="ลาป่วย" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

interface GradePayload {
  score?: number | null;
  rubricEntries?: Array<{ criterionId: string; score: number | null; comment?: string }>;
  teacherNote: string;
  overrideGrade: string | null;
  overrideReason: string;
}

function GradeModal({ work, student, rubricTitle, criteria, existing, rubricScores, busy, onClose, onSubmit }: {
  work: Assignment;
  student: Student;
  rubricTitle: string | null;
  criteria: Array<{ id: string; label: string; maxScore: number; description: string }>;
  existing: { score: number | null; teacherNote: string; calculatedGrade: string | null; finalGrade: string | null } | undefined;
  rubricScores: Array<{ criterionId: string; score: number | null; comment: string }>;
  busy: boolean;
  onClose(): void;
  onSubmit(payload: GradePayload): void;
}) {
  const [entries, setEntries] = useState(() => criteria.map((criterion) => ({
    criterionId: criterion.id,
    score: rubricScores.find((item) => item.criterionId === criterion.id)?.score ?? null,
    comment: rubricScores.find((item) => item.criterionId === criterion.id)?.comment ?? ''
  })));
  const [score, setScore] = useState(existing?.score ?? null);
  const [note, setNote] = useState(existing?.teacherNote ?? '');
  const [override, setOverride] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const rubricTotal = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);
  const totalMax = criteria.length > 0 ? criteria.reduce((sum, item) => sum + item.maxScore, 0) : work.maxScore;

  return (
    <Modal
      wide
      title={`ให้คะแนน ${student.displayName}`}
      description={rubricTitle ? `ใช้เกณฑ์ ${rubricTitle} · เต็ม ${rubricMaxScore({ criteria })} คะแนน` : `คะแนนเต็ม ${work.maxScore}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onSubmit({
              ...(criteria.length > 0 ? { rubricEntries: entries } : { score }),
              teacherNote: note,
              overrideGrade: override || null,
              overrideReason
            })}
          >
            บันทึกคะแนน
          </Button>
        </>
      }
    >
      {criteria.length > 0 ? (
        <div className="rubric-grid">
          {criteria.map((criterion) => (
            <div key={criterion.id} className="rubric-row">
              <div>
                <strong>{criterion.label}</strong>
                <span>{criterion.description}</span>
              </div>
              <input
                type="number" min="0" max={criterion.maxScore}
                value={entries.find((entry) => entry.criterionId === criterion.id)?.score ?? ''}
                onChange={(event) => setEntries((current) => current.map((entry) => entry.criterionId === criterion.id
                  ? { ...entry, score: event.target.value === '' ? null : Number(event.target.value) }
                  : entry))}
              />
              <span className="rubric-max">/ {criterion.maxScore}</span>
            </div>
          ))}
          <div className="rubric-total">
            <strong>รวม</strong>
            <ProgressBar value={rubricTotal} max={totalMax} label={`${rubricTotal} / ${totalMax}`} />
          </div>
        </div>
      ) : (
        <Field label="คะแนน" hint={`0 ถึง ${work.maxScore}`}>
          <input
            type="number" min="0" max={work.maxScore} value={score ?? ''}
            onChange={(event) => setScore(event.target.value === '' ? null : Number(event.target.value))}
          />
        </Field>
      )}

      <Field label="ความเห็นถึงนักเรียน">
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      <details className="grade-override">
        <summary>ปรับเกรดจากที่ระบบคำนวณ</summary>
        <p className="ui-field-hint">
          เกรดที่คำนวณได้{existing?.calculatedGrade ? ` คือ ${existing.calculatedGrade}` : 'จะแสดงหลังบันทึกคะแนน'} ·
          ระบบเก็บทั้งเกรดที่คำนวณและเกรดสุดท้ายไว้เสมอ
        </p>
        <Field label="เกรดสุดท้าย">
          <input value={override} placeholder="A" onChange={(event) => setOverride(event.target.value)} />
        </Field>
        <Field label="เหตุผล (บังคับเมื่อปรับเกรด)">
          <input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
        </Field>
      </details>
    </Modal>
  );
}
