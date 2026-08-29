import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, rosterFor, subjectById } from '../../data/selectors';
import { gradeSchemeFrom, resolveGrade } from '../../academic/gradeScheme';
import { rosterRowsFor } from '../../academic/views';
import { workStateLabels, workStateTone } from '../../academic/workStatus';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, Modal, PageHeader, Toolbar
} from '../../ui/components';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { SubjectIcon } from '../subjects/SubjectIcon';
import type { Assignment, Student } from '../../domain/types';

interface DraftScore { value: string; dirty: boolean }

/**
 * Score and grade editing for teachers.
 *
 * One piece of work at a time, the whole roster on screen: type a mark, see the percentage and the
 * grade the scheme produces, then save. Adjusting a grade away from the calculated one is a separate,
 * deliberate action that always records a reason — the calculated grade is never overwritten.
 */
export function GradeEditorPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const scheme = gradeSchemeFrom(snapshot.settings);

  const [classId, setClassId] = useState('');
  const [workId, setWorkId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DraftScore>>({});
  const [overriding, setOverriding] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = membership.role === 'admin' || membership.role === 'teacher';
  const selectedClassId = classId || classes[0]?.id || '';
  const roster = rosterFor(snapshot, selectedClassId);

  const works = useMemo(() => snapshot.assignments
    .filter((item) => item.classId === selectedClassId && item.status !== 'draft' && item.status !== 'cancelled')
    .sort((a, b) => (b.dueAt ?? b.assignedAt).localeCompare(a.dueAt ?? a.assignedAt)),
    [snapshot.assignments, selectedClassId]);

  const work: Assignment | undefined = works.find((item) => item.id === workId) ?? works[0];
  const rows = useMemo(() => (work ? rosterRowsFor(snapshot, work, roster) : []), [snapshot, work, roster]);
  const rubric = work?.rubricId ? snapshot.rubrics.find((item) => item.id === work.rubricId) ?? null : null;
  const subject = work ? subjectById(snapshot, work.subjectId) : null;

  const dirtyCount = Object.values(drafts).filter((draft) => draft.dirty).length;

  function draftFor(studentId: string, stored: number | null): DraftScore {
    return drafts[studentId] ?? { value: stored === null ? '' : String(stored), dirty: false };
  }

  function setDraft(studentId: string, value: string) {
    setDrafts((current) => ({ ...current, [studentId]: { value, dirty: true } }));
  }

  function previewFor(value: string): { percentage: number | null; grade: string | null } {
    if (!work || value.trim() === '') return { percentage: null, grade: null };
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return { percentage: null, grade: null };
    const result = resolveGrade(numeric, work.maxScore, { scheme });
    return { percentage: result.percentage, grade: result.calculatedGrade };
  }

  async function saveOne(studentId: string) {
    if (!work) return;
    const draft = drafts[studentId];
    if (!draft?.dirty) return;
    setBusy(true);
    setError(null);
    try {
      await repository.scoreSubmission({
        assignmentId: work.id,
        studentId,
        score: draft.value.trim() === '' ? null : Number(draft.value),
        gradedBy: membership.profileId
      });
      setDrafts((current) => ({ ...current, [studentId]: { value: draft.value, dirty: false } }));
      setMessage('บันทึกคะแนนแล้ว');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกคะแนนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    if (!work) return;
    setBusy(true);
    setError(null);
    let saved = 0;
    try {
      for (const [studentId, draft] of Object.entries(drafts)) {
        if (!draft.dirty) continue;
        await repository.scoreSubmission({
          assignmentId: work.id,
          studentId,
          score: draft.value.trim() === '' ? null : Number(draft.value),
          gradedBy: membership.profileId
        });
        saved += 1;
      }
      setDrafts({});
      setMessage(`บันทึกคะแนน ${saved} คนแล้ว`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกคะแนนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <>
        <PageHeader eyebrow="คะแนน" title="แก้ไขคะแนนและเกรด" />
        <Card><EmptyState title="เฉพาะครูและผู้ดูแลระบบ" description="หน้านี้ใช้สำหรับผู้ที่มีสิทธิ์ให้คะแนนเท่านั้น" /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="คะแนนและเกรด"
        title="แก้ไขคะแนนและเกรด"
        description="กรอกคะแนนทั้งห้องในหน้าเดียว ระบบคำนวณเปอร์เซ็นต์และเกรดให้ทันที และปรับเกรดได้พร้อมเหตุผล"
        action={dirtyCount > 0 && (
          <Button variant="primary" loading={busy} onClick={() => void saveAll()}>
            บันทึกทั้งหมด ({dirtyCount})
          </Button>
        )}
      />

      <Toolbar>
        <Field label="ห้องเรียน">
          <select value={selectedClassId} onChange={(event) => { setClassId(event.target.value); setWorkId(''); setDrafts({}); }}>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="งานที่ต้องการให้คะแนน">
          <select value={work?.id ?? ''} onChange={(event) => { setWorkId(event.target.value); setDrafts({}); }}>
            {works.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · เต็ม {item.maxScore}
              </option>
            ))}
          </select>
        </Field>
      </Toolbar>

      {!work ? (
        <Card>
          <EmptyState
            icon="☆"
            title="ยังไม่มีงานที่เผยแพร่ในห้องนี้"
            description="เผยแพร่งานก่อน จึงจะให้คะแนนได้"
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="gradebook-head">
            <CardHeader
              title={
                <span className="editor-title">
                  {subject && (
                    <span className="subject-tag">
                      <SubjectIcon iconKey={subject.iconKey} size={14} />{subject.name}
                    </span>
                  )}
                  {work.title}
                </span>
              }
              description={rubric
                ? `ให้คะแนนด้วยเกณฑ์ ${rubric.title} · เต็ม ${work.maxScore} คะแนน · เปิดหน้ารายละเอียดงานเพื่อกรอกรายหัวข้อ`
                : `คะแนนเต็ม ${work.maxScore} · เกรดคำนวณจากเกณฑ์ของโรงเรียน`}
            />
          </div>

          <DataTable
            caption={`ให้คะแนน ${work.title}`}
            head={
              <tr>
                <th>นักเรียน</th><th>สถานะ</th><th>คะแนน</th><th>เปอร์เซ็นต์</th>
                <th>เกรดที่คำนวณ</th><th>เกรดสุดท้าย</th><th>จัดการ</th>
              </tr>
            }
          >
            {rows.map((row) => {
              const stored = row.submission?.score ?? null;
              const draft = draftFor(row.student.id, stored);
              const preview = previewFor(draft.value);
              const finalGrade = row.submission?.finalGrade ?? preview.grade;
              const overridden = Boolean(row.submission?.gradeOverrideReason);
              return (
                <tr key={row.student.id} className={draft.dirty ? 'row-dirty' : undefined}>
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
                        <span>{row.student.studentCode}</span>
                      </div>
                    </div>
                  </td>
                  <td><Badge tone={workStateTone[row.state]}>{workStateLabels[row.state]}</Badge></td>
                  <td>
                    <div className="score-cell">
                      <input
                        type="number" min="0" max={work.maxScore} step="0.5"
                        value={draft.value}
                        aria-label={`คะแนนของ ${row.student.displayName}`}
                        onChange={(event) => setDraft(row.student.id, event.target.value)}
                        onBlur={() => void saveOne(row.student.id)}
                      />
                      <span className="muted">/ {work.maxScore}</span>
                    </div>
                  </td>
                  <td>{preview.percentage === null ? <span className="muted">—</span> : `${preview.percentage}%`}</td>
                  <td>
                    {preview.grade
                      ? <Badge tone={preview.grade === scheme.belowGrade ? 'warning' : 'neutral'}>{preview.grade}</Badge>
                      : <span className="muted">—</span>}
                  </td>
                  <td>
                    {finalGrade
                      ? <Badge tone={overridden ? 'info' : 'success'}>{finalGrade}{overridden ? ' · ปรับแล้ว' : ''}</Badge>
                      : <span className="muted">—</span>}
                  </td>
                  <td>
                    <div className="cell-actions">
                      <Button size="sm" variant="ghost" onClick={() => setOverriding(row.student)}>ปรับเกรด</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Card>
      )}

      {error && <p className="ui-field-message" role="alert">{error}</p>}

      {overriding && work && (
        <OverrideModal
          student={overriding}
          calculated={(() => {
            const submission = snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === overriding.id);
            return submission?.calculatedGrade
              ?? previewFor(draftFor(overriding.id, submission?.score ?? null).value).grade;
          })()}
          current={snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === overriding.id)?.finalGrade ?? null}
          reason={snapshot.submissions.find((item) => item.assignmentId === work.id && item.studentId === overriding.id)?.gradeOverrideReason ?? ''}
          options={[...scheme.bands.map((band) => band.grade), scheme.belowGrade]}
          busy={busy}
          onClose={() => setOverriding(null)}
          onSubmit={async (grade, why) => {
            setBusy(true);
            setError(null);
            try {
              await repository.overrideGrade(work.id, overriding.id, grade, why, membership.profileId);
              setMessage(grade ? `ปรับเกรดของ ${overriding.displayName} เป็น ${grade}` : 'ยกเลิกการปรับเกรดแล้ว');
              setOverriding(null);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'ปรับเกรดไม่สำเร็จ');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
function OverrideModal({ student, calculated, current, reason, options, busy, onClose, onSubmit }: {
  student: Student;
  calculated: string | null;
  current: string | null;
  reason: string;
  options: string[];
  busy: boolean;
  onClose(): void;
  onSubmit(grade: string | null, reason: string): Promise<void> | void;
}) {
  const [grade, setGrade] = useState(current ?? calculated ?? '');
  const [why, setWhy] = useState(reason);

  return (
    <Modal
      title={`ปรับเกรดของ ${student.displayName}`}
      description="เกรดที่ระบบคำนวณจะถูกเก็บไว้เสมอ การปรับเกรดต้องมีเหตุผลและถูกบันทึกลงประวัติ"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          {current && (
            <Button variant="secondary" loading={busy} onClick={() => void onSubmit(null, '')}>
              ใช้เกรดที่คำนวณ
            </Button>
          )}
          <Button variant="primary" loading={busy} onClick={() => void onSubmit(grade || null, why)}>
            บันทึกการปรับเกรด
          </Button>
        </>
      }
    >
      <div className="override-summary">
        <div>
          <span className="muted">เกรดที่คำนวณ</span>
          <strong>{calculated ?? '—'}</strong>
        </div>
        <div>
          <span className="muted">เกรดสุดท้ายปัจจุบัน</span>
          <strong>{current ?? calculated ?? '—'}</strong>
        </div>
      </div>
      <Field label="เกรดสุดท้าย">
        <select value={grade} onChange={(event) => setGrade(event.target.value)}>
          <option value="">ใช้เกรดที่คำนวณ</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
      <Field label="เหตุผล" hint="บังคับเมื่อปรับเกรด เช่น ส่งผลงานเพิ่มเติมและผ่านเกณฑ์">
        <textarea rows={2} value={why} onChange={(event) => setWhy(event.target.value)} />
      </Field>
    </Modal>
  );
}
