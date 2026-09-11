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
import {
  teacherCanEditSubject, teacherCanViewScore, teacherClassIds, teacherIsAdvisorAnywhere,
  teacherOwnedSubjectIds
} from '../../data/teacherResponsibilities';
import { useToast } from '../../ui/toastContext';
import { Icon } from '../../ui/Icon';

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
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  // The rooms this account may mark in. A teacher is offered the ones they were put in charge of,
  // never the whole school — landing on somebody else's room and being told "no permission" is how
  // a teacher concludes the subject they were assigned did not take.
  const visibleClasses = useMemo(() => {
    if (membership.role !== 'teacher') return classes;
    const mine = teacherClassIds(snapshot, membership.profileId);
    return classes.filter((item) => mine.has(item.id));
  }, [classes, membership.profileId, membership.role, snapshot]);

  const selectedClassId = visibleClasses.some((item) => item.id === classId)
    ? classId
    : visibleClasses[0]?.id ?? '';
  const roster = rosterFor(snapshot, selectedClassId);

  /*
   * What may be read here, which is not the same list as what may be written.
   *
   * This used to be filtered by the right to *mark*, so a room's advisor — whose job is the child
   * rather than one of their subjects — opened the screen and saw nothing at all, or was refused it
   * outright. They are entitled to read the marks of every subject in their own room: a guardian
   * rings the advisor, and an advisor who can only see the one subject they happen to teach cannot
   * answer. `teacherCanViewScore` is the rule that says so, and it is the same rule the database
   * enforces in `teacher_can_view_score` — a room-wide link reads the room, a subject link reads its
   * subject, and a teacher on neither reads nothing.
   *
   * Writing is untouched: see `editableWorkIds` below.
   */
  const works = useMemo(() => snapshot.assignments
    .filter((item) => item.classId === selectedClassId && item.status !== 'draft' && item.status !== 'cancelled')
    .filter((item) => membership.role !== 'teacher' || teacherCanViewScore(snapshot, membership.profileId, item.classId, item.subjectId))
    .sort((a, b) => (b.dueAt ?? b.assignedAt).localeCompare(a.dueAt ?? a.assignedAt)),
    [membership.profileId, membership.role, snapshot, selectedClassId]);

  /**
   * Which of those may actually be marked.
   *
   * Only the subject's owner, exactly as before and exactly as `teacher_can_edit_subject_score`
   * decides on the server. A set rather than a call per render because the answer is asked once per
   * row of a class list and the underlying lookup walks the whole staff table.
   */
  const editableWorkIds = useMemo(() => new Set(works
    .filter((item) => membership.role === 'admin'
      || (membership.role === 'teacher'
        && teacherCanEditSubject(snapshot, membership.profileId, item.classId, item.subjectId)))
    .map((item) => item.id)),
    [membership.profileId, membership.role, snapshot, works]);

  /**
   * What each piece of work looks like before it is opened.
   *
   * Choosing what to mark was a dropdown of titles, so the one question a teacher sits down with --
   * which of these still needs marking -- could only be answered by opening each in turn. Every
   * piece of work now carries its own subject and its own two counts, which is the same shape the
   * work list already uses on the assignments screen, so the two read alike.
   */
  const workCards = useMemo(() => works.map((item) => {
    const handedIn = snapshot.submissions.filter((row) =>
      row.assignmentId === item.id && row.submittedAt && !row.deletedAt);
    const unmarked = handedIn.filter((row) => row.score === null).length;
    return {
      work: item,
      subject: subjectById(snapshot, item.subjectId),
      handedIn: handedIn.length,
      unmarked,
      editable: editableWorkIds.has(item.id)
    };
  }), [editableWorkIds, snapshot, works]);

  /*
   * The right to mark comes from the staff list, not from whether there is anything to mark yet.
   *
   * This was read off the filtered work list, so a teacher who had just been made owner of a
   * subject — and whose only piece of work was still a draft — was told the screen was for people
   * with permission to give marks. They had the permission. What they did not have was a published
   * piece of work, which is a different sentence and a different thing to do about it.
   */
  const ownedSubjects = useMemo(
    () => teacherOwnedSubjectIds(snapshot, membership.profileId),
    [membership.profileId, snapshot]
  );
  const canEdit = membership.role === 'admin' || (membership.role === 'teacher' && ownedSubjects.size > 0);
  /*
   * Opening the screen and marking on it are two different rights.
   *
   * They were one, and the one was "do you own a subject" — so an advisor who teaches nothing was
   * turned away from the only screen in the product that lays a room's marks out child by child.
   * An advisor may open it; what they may do inside is decided per piece of work, below.
   */
  const advisesAnywhere = membership.role === 'teacher'
    && teacherIsAdvisorAnywhere(snapshot, membership.profileId);
  const canOpen = canEdit || advisesAnywhere;

  const work: Assignment | undefined = works.find((item) => item.id === workId) ?? works[0];
  /** Whether the piece of work on screen is one this account may write to. */
  const canMarkThisWork = work ? editableWorkIds.has(work.id) : false;
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
    // Belt as well as braces. The inputs are not rendered on a piece of work this account may only
    // read, and the server refuses the write regardless; this stops a stale draft left over from a
    // subject the teacher *could* mark being flushed into one they cannot when the selection moves.
    if (!work || !canMarkThisWork) return;
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
      toast('บันทึกคะแนนแล้ว');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกคะแนนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    if (!work || !canMarkThisWork) return;
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
      toast(`บันทึกคะแนน ${saved} คนแล้ว`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกคะแนนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (!canOpen) {
    return (
      <>
        <PageHeader eyebrow="คะแนน" title="แก้ไขคะแนนและเกรด" />
        <Card>
          <EmptyState
            title="ยังไม่ได้รับมอบหมายห้องเรียนหรือรายวิชา"
            description="การให้คะแนนเปิดให้เฉพาะครูเจ้าของรายวิชาในห้องนั้น ส่วนครูที่ปรึกษาของห้องเปิดดูคะแนนทุกรายวิชาของห้องตัวเองได้แต่แก้ไขไม่ได้ ให้ผู้ดูแลระบบกำหนดคุณเข้าห้องเรียนที่หน้าห้องเรียนก่อน"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="คะแนนและเกรด"
        title="แก้ไขคะแนนและเกรด"
        description={canEdit
          ? 'กรอกคะแนนทั้งห้องในหน้าเดียว ระบบคำนวณเปอร์เซ็นต์และเกรดให้ทันที และปรับเกรดได้พร้อมเหตุผล'
          : 'ดูคะแนนทุกรายวิชาของห้องที่คุณเป็นครูที่ปรึกษา · แก้ไขได้เฉพาะครูเจ้าของรายวิชา'}
        action={dirtyCount > 0 && canMarkThisWork && (
          <Button variant="primary" loading={busy} onClick={() => void saveAll()}>
            บันทึกทั้งหมด ({dirtyCount})
          </Button>
        )}
      />

      <Toolbar>
        <Field label="ห้องเรียน">
          <select value={selectedClassId} onChange={(event) => { setClassId(event.target.value); setWorkId(''); setDrafts({}); }}>
            {visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
      </Toolbar>

      {workCards.length > 0 && (
        <div className="assignment-work-picker" role="tablist" aria-label="เลือกงานที่จะให้คะแนน">
          {workCards.map((card) => (
            <button
              key={card.work.id}
              type="button"
              role="tab"
              aria-selected={card.work.id === work?.id}
              className={card.work.id === work?.id ? 'is-active' : ''}
              onClick={() => { setWorkId(card.work.id); setDrafts({}); }}
            >
              <span>{card.work.title}</span>
              <small>
                {card.subject ? `${card.subject.name} · ` : ''}เต็ม {card.work.maxScore} คะแนน
              </small>
              {/*
                * Said on the card rather than after it is opened.
                *
                * An advisor's list holds their own subject beside half a dozen they may only read,
                * and the difference decides what they can do when they get there — so it is on the
                * thing they are choosing between, not on the screen that follows the choice.
                */}
              <small className={card.editable ? 'grade-picker-todo' : 'grade-picker-done'}>
                {!card.editable
                  ? 'ดูอย่างเดียว'
                  : card.handedIn === 0
                    ? 'ยังไม่มีใครส่ง'
                    : card.unmarked > 0
                      ? `รอตรวจ ${card.unmarked} จาก ${card.handedIn} ที่ส่งแล้ว`
                      : `ตรวจครบแล้ว ${card.handedIn} คน`}
              </small>
            </button>
          ))}
        </div>
      )}

      {!work ? (
        <Card>
          <EmptyState
            icon={<Icon name="star" size={28} />}
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
              description={!canMarkThisWork
                ? `คะแนนเต็ม ${work.maxScore} · ดูอย่างเดียว เพราะคุณเป็นครูที่ปรึกษาของห้องนี้ ไม่ใช่ครูเจ้าของรายวิชา`
                : rubric
                  ? `ให้คะแนนด้วยเกณฑ์ ${rubric.title} · เต็ม ${work.maxScore} คะแนน · เปิดหน้ารายละเอียดงานเพื่อกรอกรายหัวข้อ`
                  : `คะแนนเต็ม ${work.maxScore} · เกรดคำนวณจากเกณฑ์ของโรงเรียน`}
              action={!canMarkThisWork && <Badge tone="neutral">ดูอย่างเดียว</Badge>}
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
                    {/* A number rather than a disabled box. A greyed-out input at every row reads as
                        a screen that is broken or still loading; a plain figure reads as a record. */}
                    {canMarkThisWork ? (
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
                    ) : (
                      <div className="score-cell readonly">
                        <strong>{stored === null ? '—' : stored}</strong>
                        <span className="muted">/ {work.maxScore}</span>
                      </div>
                    )}
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
                      {canMarkThisWork
                        ? <Button size="sm" variant="ghost" onClick={() => setOverriding(row.student)}>ปรับเกรด</Button>
                        : <span className="muted">—</span>}
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
              toast(grade ? `ปรับเกรดของ ${overriding.displayName} เป็น ${grade}` : 'ยกเลิกการปรับเกรดแล้ว');
              setOverriding(null);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'ปรับเกรดไม่สำเร็จ');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

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
