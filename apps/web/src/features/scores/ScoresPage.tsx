import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, rosterFor, scorePolicyFrom, standingsFor, subjectById, subjectResultsFor } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';
import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { Subject } from '../../domain/types';
import { canManageAcademicItem, teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, Drawer, EmptyState, Field, FieldGroup,
  PageHeader, ProgressBar, SearchInput, Segmented, Stat, Toolbar
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

type Tab = 'activity' | 'test' | 'summary';

const detailKindLabels: Record<'assignment' | 'homework' | 'project' | 'activity' | 'test', string> = {
  assignment: 'งานที่มอบหมาย', homework: 'การบ้าน', project: 'โครงงาน', activity: 'กิจกรรม', test: 'สอบ'
};

/** Marks are read far more often than they are typed, so the scale is spelled out beside the number. */
function GradeBadge({ grade }: { grade: string }) {
  return <Badge tone={grade === 'F' ? 'danger' : grade.startsWith('4') || grade.startsWith('3') ? 'success' : 'info'}>เกรด {grade}</Badge>;
}

const thaiDate = (value: string | null) => value ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '—';

/**
 * One editable mark.
 *
 * The number field carried no accessible name: forty of them down a column, announced as forty
 * identical spin buttons. It also saved on blur with nothing said, so the only way to know a mark
 * had been written was to reload the page.
 *
 * Declared here rather than inside the screen on purpose — a component defined during render is a
 * new type on every render, and React would unmount the input mid-edit and take the caret with it.
 */
function ScoreCell({ cellKey, studentName, maxScore, value, editable, saved, onSave }: {
  cellKey: string; studentName: string; maxScore: number; value: number | null; editable: boolean;
  saved: boolean; onSave: (next: number | null) => Promise<void>;
}) {
  if (!editable) return <span className="score-readonly">{value ?? '—'}</span>;
  return (
    <span className="score-cell">
      <input
        type="number" min="0" max={maxScore} defaultValue={value ?? ''}
        aria-label={`คะแนนของ ${studentName} เต็ม ${maxScore}`}
        onBlur={(event) => {
          const next = event.target.value === '' ? null : Math.min(maxScore, Math.max(0, Number(event.target.value)));
          void onSave(next);
        }}
      />
      {saved && <span className="score-saved" role="status" data-cell={cellKey}><Icon name="check" size={14} />บันทึกแล้ว</span>}
    </span>
  );
}

function StudentScoresView({ snapshot, studentId, classId, subjects, policy }: {
  snapshot: SchoolSnapshot;
  studentId: string | null;
  classId: string;
  subjects: Subject[];
  policy: ReturnType<typeof scorePolicyFrom>;
}) {
  const [detailSubjectId, setDetailSubjectId] = useState<string | null>(null);
  const results = studentId && classId ? subjectResultsFor(snapshot, studentId, classId, policy) : [];
  const selectedSubject = subjects.find((subject) => subject.id === detailSubjectId) ?? null;
  const detailItems = selectedSubject && studentId
    ? [
      ...snapshot.assignments
        .filter((item) => item.classId === classId && item.subjectId === selectedSubject.id && !['draft', 'cancelled'].includes(item.status))
        .map((item) => {
          const submission = snapshot.submissions.find((row) => row.assignmentId === item.id && row.studentId === studentId);
          return {
            id: item.id, title: item.title, kind: detailKindLabels[item.workType], date: item.dueAt,
            score: submission?.score ?? null, maxScore: item.maxScore,
            status: submission?.score === null || submission?.score === undefined ? 'รอตรวจ' : 'ประกาศแล้ว'
          };
        }),
      ...snapshot.activities
        .filter((item) => item.classId === classId && item.subjectId === selectedSubject.id && item.status === 'published')
        .map((item) => {
          const score = snapshot.activityScores.find((row) => row.activityId === item.id && row.studentId === studentId);
          return {
            id: item.id, title: item.title, kind: 'กิจกรรม', date: item.activityDate,
            score: score?.score ?? null, maxScore: item.maxScore,
            status: score?.score === null || score?.score === undefined ? 'รอตรวจ' : 'ประกาศแล้ว'
          };
        }),
      ...snapshot.tests
        .filter((item) => item.classId === classId && item.subjectId === selectedSubject.id)
        .map((item) => {
          const score = snapshot.testScores.find((row) => row.testId === item.id && row.studentId === studentId);
          if (!score?.publishedAt) return null;
          return {
            id: item.id, title: item.title, kind: 'สอบ', date: item.testDate,
            score: score.score ?? null, maxScore: item.maxScore,
            status: 'ประกาศแล้ว'
          };
        })
    ].filter((item): item is { id: string; title: string; kind: string; date: string | null; score: number | null; maxScore: number; status: string } => item !== null)
    : [];

  const average = results.length === 0 ? 0 : results.reduce((sum, item) => sum + item.total, 0) / results.length;
  const failing = results.filter((item) => item.grade === 'F').length;

  return (
    <>
      {results.length > 0 && (
        <div className="ui-stat-grid">
          <Stat label="วิชาที่มีคะแนนแล้ว" value={results.length} hint={`จาก ${subjects.length} วิชา`} tone="brand" icon={<Icon name="subjects" size={18} />} />
          <Stat label="คะแนนเฉลี่ย" value={average.toFixed(1)} hint="เต็ม 100 ต่อวิชา" tone="info" icon={<Icon name="scores" size={18} />} />
          <Stat
            label="ต้องปรับปรุง"
            value={failing}
            hint={failing === 0 ? 'ผ่านเกณฑ์ทุกวิชา' : 'วิชาที่ได้เกรด F'}
            tone={failing === 0 ? 'success' : 'danger'}
            icon={<Icon name={failing === 0 ? 'check' : 'warning'} size={18} />}
          />
        </div>
      )}

      <Card>
        <CardHeader
          title="คะแนนแยกตามรายวิชา"
          description="แสดงเฉพาะคะแนนของบัญชีนี้ และเฉพาะรายการที่ครูประกาศแล้ว"
          action={<Badge tone="success">ข้อมูลส่วนตัว</Badge>}
        />
        {!studentId || !classId ? (
          <EmptyState
            icon={<Icon name="refresh" size={28} />}
            title="กำลังเตรียมข้อมูลคะแนน"
            description="ระบบกำลังเชื่อมข้อมูลห้องเรียนของคุณ"
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<Icon name="scores" size={28} />}
            title="ยังไม่มีคะแนนแยกตามรายวิชา"
            description="คะแนนจะแสดงเมื่อครูตรวจและประกาศผลแล้ว"
          />
        ) : (
          <div className="student-subject-grid">
            {results.map((result) => {
              const color = subjectColor(result.subject.colorIndex);
              return (
                <button
                  type="button"
                  key={result.subject.id}
                  className={`student-subject-card ${detailSubjectId === result.subject.id ? 'selected' : ''}`}
                  style={{ '--subject-color': color.solid, '--subject-soft': color.soft } as CSSProperties}
                  onClick={() => setDetailSubjectId(result.subject.id)}
                  aria-label={`ดูรายละเอียดวิชา ${result.subject.name}`}
                >
                  <span className="student-subject-icon"><SubjectIcon iconKey={result.subject.iconKey} size={22} /></span>
                  <span className="student-subject-card-head"><strong>{result.subject.name}</strong><span>{result.itemCount} รายการที่มีคะแนน</span></span>
                  <span className="student-subject-total">{result.total.toFixed(policy.decimals)}<small>/ 100</small></span>
                  <ProgressBar value={result.total} max={100} tone={result.grade === 'F' ? 'danger' : 'brand'} />
                  <span className="student-subject-foot">
                    <GradeBadge grade={result.grade} />
                    <span className="student-subject-open">ดูรายละเอียด<Icon name="more" size={14} /></span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/*
        The breakdown opens over the page rather than below it. On a phone the old inline panel put
        the detail off the bottom of the screen, so tapping a subject looked like nothing happened.
      */}
      {selectedSubject && (
        <Drawer title={`คะแนนวิชา ${selectedSubject.name}`} onClose={() => setDetailSubjectId(null)}>
          {detailItems.length === 0 ? (
            <EmptyState
              icon={<Icon name="scores" size={28} />}
              title="ยังไม่มีรายการคะแนนที่ประกาศ"
              description="ครูจะเปิดเผยคะแนนเมื่อพร้อม"
            />
          ) : (
            <DataTable
              caption={`รายการคะแนนวิชา ${selectedSubject.name}`}
              head={<tr><th>รายการ</th><th>ประเภท</th><th>วันที่</th><th>คะแนนที่ได้</th><th>สถานะ</th></tr>}
            >
              {detailItems.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.title}</strong></td>
                  <td>{item.kind}</td>
                  <td>{thaiDate(item.date)}</td>
                  <td className="student-score-value">{item.score === null ? '—' : `${item.score} / ${item.maxScore}`}</td>
                  <td><Badge tone={item.score === null ? 'warning' : 'success'}>{item.status}</Badge></td>
                </tr>
              ))}
            </DataTable>
          )}
        </Drawer>
      )}
    </>
  );
}

export function ScoresPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [classId, setClassId] = useState('');
  const [tab, setTab] = useState<Tab>('summary');
  const [query, setQuery] = useState('');
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [savedCell, setSavedCell] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<{ id: string; title: string } | null>(null);
  const { toast } = useToast();

  const isTeacher = membership.role === 'admin' || membership.role === 'teacher';
  const ownStudentId = snapshot.students.find((item) => item.profileId === membership.profileId)?.id ?? null;
  const ownClassId = membership.role === 'student' && ownStudentId ? classIdOfStudent(snapshot, ownStudentId) : null;
  const selectedClassId = membership.role === 'student'
    ? (ownClassId ?? '')
    : (classId || classes[0]?.id || '');

  const roster = rosterFor(snapshot, selectedClassId);
  const policy = scorePolicyFrom(snapshot.settings);
  const standings = useMemo(() => standingsFor(snapshot, selectedClassId, policy), [snapshot, selectedClassId, policy]);
  const bySubject = <T extends { subjectId: string | null }>(items: T[]) => items.filter((item) => !subjectFilter || item.subjectId === subjectFilter);
  const activities = bySubject(snapshot.activities.filter((item) => item.classId === selectedClassId));
  const tests = bySubject(snapshot.tests.filter((item) => item.classId === selectedClassId));
  const ownedSubjectIds = teacherOwnedSubjectIds(snapshot, membership.profileId, selectedClassId);
  const canManageSelectedClass = membership.role === 'admin' || ownedSubjectIds.size > 0;
  const editableSubjects = membership.role === 'teacher'
    ? subjects.filter((subject) => ownedSubjectIds.has(subject.id))
    : subjects;

  if (membership.role === 'student') {
    return (
      <>
        <PageHeader
          eyebrow="คะแนนและเกรด · มุมมองนักเรียน"
          title="คะแนนของฉัน"
          description="สรุปคะแนนแยกตามรายวิชา กดที่วิชาเพื่อดูรายละเอียดงาน กิจกรรม และการสอบ"
        />
        <StudentScoresView snapshot={snapshot} studentId={ownStudentId} classId={selectedClassId} subjects={subjects} policy={policy} />
      </>
    );
  }

  const matchesQuery = (name: string) => !query.trim() || name.toLowerCase().includes(query.trim().toLowerCase());
  const visibleStanding = standings.filter((entry) => matchesQuery(entry.student.displayName));
  const visibleRoster = roster.filter((student) => matchesQuery(student.displayName));

  const classAverage = standings.length === 0 ? 0 : standings.reduce((sum, entry) => sum + entry.total, 0) / standings.length;
  const passing = standings.filter((entry) => entry.grade !== 'F').length;
  const missingTotal = standings.reduce((sum, entry) => sum + entry.missingWork, 0);

  /** How many of the class already have a mark for one activity or test — the thing a teacher is deciding by. */
  const gradedCount = (rows: ReadonlyArray<{ studentId: string; score: number | null }>) =>
    roster.filter((student) => rows.some((row) => row.studentId === student.id && row.score !== null)).length;

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await repository.saveActivity({
      classId: selectedClassId,
      title: String(data.get('title') ?? '').trim(),
      subjectId: String(data.get('subjectId') ?? '') || null,
      activityDate: String(data.get('date') ?? new Date().toISOString().slice(0, 10)),
      maxScore: Number(data.get('maxScore') ?? 10),
      status: 'published'
    });
    form.reset();
    toast('สร้างกิจกรรมแล้ว');
  }

  async function createTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await repository.saveTest({
      classId: selectedClassId,
      title: String(data.get('title') ?? '').trim(),
      subjectId: String(data.get('subjectId') ?? '') || null,
      testDate: String(data.get('date') ?? new Date().toISOString().slice(0, 10)),
      maxScore: Number(data.get('maxScore') ?? 100),
      status: 'draft'
    });
    form.reset();
    toast('สร้างรายการสอบเป็นฉบับร่างแล้ว (คะแนนยังไม่เผยแพร่)');
  }

  return (
    <>
      <PageHeader
        eyebrow="คะแนนและเกรด"
        title="คะแนน"
        description={`น้ำหนัก งาน ${policy.weights.assignment}% · กิจกรรม ${policy.weights.activity}% · สอบ ${policy.weights.test}% · หักงานส่งช้า ${policy.latePenaltyPercent}%`}
      />

      <Toolbar>
        {!ownClassId && (
          <Field label="ห้องเรียน">
            <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
        <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อนักเรียน" label="ค้นหานักเรียน" />
        <Segmented
          ariaLabel="มุมมองคะแนน"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'summary' as const, label: 'สรุปเกรด' },
            { value: 'activity' as const, label: 'กิจกรรม' },
            { value: 'test' as const, label: 'สอบ' }
          ]}
        />
      </Toolbar>

      {/*
        The subject filter is its own row. Squeezed into the toolbar it wrapped onto three lines on a
        phone and pushed the tabs off the first screen, which is the control a teacher reaches for
        first.
      */}
      <div className="subject-filter" role="group" aria-label="กรองตามรายวิชา">
        <button
          type="button"
          className={`subject-pill ${subjectFilter === '' ? 'selected' : ''}`}
          aria-pressed={subjectFilter === ''}
          onClick={() => setSubjectFilter('')}
        >
          ทุกวิชา
        </button>
        {subjects.map((subject) => {
          const color = subjectColor(subject.colorIndex);
          const selected = subjectFilter === subject.id;
          return (
            <button
              type="button"
              key={subject.id}
              className={`subject-pill ${selected ? 'selected' : ''}`}
              aria-pressed={selected}
              style={{ borderColor: color.solid, color: selected ? '#fff' : color.solid, background: selected ? color.solid : color.soft }}
              onClick={() => setSubjectFilter(selected ? '' : subject.id)}
            >
              <SubjectIcon iconKey={subject.iconKey} size={14} />{subject.name}
            </button>
          );
        })}
      </div>

      <div className="ui-stat-grid">
        <Stat label="นักเรียนในห้อง" value={roster.length} hint="ที่ยังเรียนอยู่" tone="brand" icon={<Icon name="students" size={18} />} />
        <Stat label="คะแนนเฉลี่ยห้อง" value={classAverage.toFixed(policy.decimals)} hint="เต็ม 100" tone="info" icon={<Icon name="scores" size={18} />} />
        <Stat
          label="ผ่านเกณฑ์"
          value={`${passing}/${standings.length}`}
          hint={standings.length === passing ? 'ผ่านทุกคน' : 'ที่เหลือได้เกรด F'}
          tone={standings.length === passing ? 'success' : 'warning'}
          icon={<Icon name="check" size={18} />}
        />
        <Stat
          label="งานค้างส่งรวม"
          value={missingTotal}
          hint="ทั้งห้อง"
          tone={missingTotal === 0 ? 'success' : 'danger'}
          icon={<Icon name="warning" size={18} />}
        />
      </div>

      {tab === 'summary' && (
        <Card>
          <CardHeader
            title="คะแนนรวมและเกรด"
            description="เรียงตามอันดับในห้อง นับเฉพาะคะแนนที่เผยแพร่แล้ว"
            action={<Badge tone="neutral">{visibleStanding.length} คน</Badge>}
          />
          {visibleStanding.length === 0 ? (
            <EmptyState
              icon={<Icon name="search" size={28} />}
              title={query ? 'ไม่พบนักเรียนที่ค้นหา' : 'ยังไม่มีคะแนนในห้องนี้'}
              description={query ? `ไม่มีชื่อที่ตรงกับ "${query}"` : 'คะแนนจะปรากฏเมื่อมีการบันทึกงาน กิจกรรม หรือการสอบ'}
              {...(query ? { action: <Button variant="secondary" onClick={() => setQuery('')}>ล้างการค้นหา</Button> } : {})}
            />
          ) : (
            <DataTable
              caption="คะแนนรวมและเกรดของนักเรียนทั้งห้อง"
              head={<tr><th>อันดับ</th><th>นักเรียน</th><th>คะแนนรวม</th><th>เกรด</th><th>ค้างส่ง</th></tr>}
            >
              {visibleStanding.map((entry) => (
                <tr key={entry.student.id}>
                  <td className="score-rank">{entry.rank}</td>
                  <td><strong>{entry.student.displayName}</strong></td>
                  <td>
                    <div className="score-total">
                      <span>{entry.total.toFixed(policy.decimals)}</span>
                      <ProgressBar value={entry.total} max={100} tone={entry.grade === 'F' ? 'danger' : 'brand'} />
                    </div>
                  </td>
                  <td><GradeBadge grade={entry.grade} /></td>
                  <td>{entry.missingWork === 0 ? <Badge tone="success">ครบ</Badge> : <Badge tone="warning">{entry.missingWork} ชิ้น</Badge>}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <>
          {isTeacher && canManageSelectedClass && (
            <Card>
              <CardHeader title="เพิ่มกิจกรรม" description="กิจกรรมจะเผยแพร่ให้นักเรียนเห็นทันทีที่บันทึก" />
              <form onSubmit={(event) => void createActivity(event)}>
                <FieldGroup columns={2}>
                  <Field label="ชื่อกิจกรรม"><input name="title" required placeholder="เช่น กิจกรรมกลุ่มหน้าชั้น" /></Field>
                  <Field label="รายวิชา">
                    <select name="subjectId" defaultValue={subjectFilter || subjects[0]?.id || ''}>
                      <option value="">ไม่ระบุวิชา</option>
                      {editableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                    </select>
                  </Field>
                  <Field label="วันที่"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                  <Field label="คะแนนเต็ม" hint="ใช้เป็นตัวหารตอนคิดคะแนนรวม"><input name="maxScore" type="number" min="1" defaultValue="10" /></Field>
                </FieldGroup>
                <div className="ui-form-actions">
                  <Button variant="primary" icon={<Icon name="plus" size={16} />}>บันทึกกิจกรรม</Button>
                </div>
              </form>
            </Card>
          )}

          {activities.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon name="achievements" size={28} />}
                title={subjectFilter ? 'ไม่มีกิจกรรมในวิชานี้' : 'ยังไม่มีกิจกรรมในห้องนี้'}
                description={subjectFilter ? 'ลองเลือกวิชาอื่น หรือกด "ทุกวิชา"' : 'เพิ่มกิจกรรมแล้วกรอกคะแนนได้ทันที'}
                {...(subjectFilter ? { action: <Button variant="secondary" onClick={() => setSubjectFilter('')}>ดูทุกวิชา</Button> } : {})}
              />
            </Card>
          ) : activities.map((activity) => {
            const rows = snapshot.activityScores.filter((item) => item.activityId === activity.id);
            const graded = gradedCount(rows);
            const editable = isTeacher && canManageAcademicItem(snapshot, membership.role, membership.profileId, activity.classId, activity.subjectId);
            const open = openItemId === activity.id;
            return (
              <Card key={activity.id} className="score-item-card">
                <CardHeader
                  title={activity.title}
                  description={`${subjectById(snapshot, activity.subjectId)?.name ?? 'ไม่ระบุวิชา'} · เต็ม ${activity.maxScore} คะแนน · ${thaiDate(activity.activityDate)}`}
                  action={(
                    <div className="score-item-actions">
                      <Badge tone={graded === roster.length && roster.length > 0 ? 'success' : 'warning'}>
                        กรอกแล้ว {graded}/{roster.length}
                      </Badge>
                      <Button
                        variant="secondary"
                        onClick={() => setOpenItemId(open ? null : activity.id)}
                        aria-expanded={open}
                        icon={<Icon name={open ? 'close' : 'edit'} size={16} />}
                      >
                        {open ? 'ปิด' : editable ? 'กรอกคะแนน' : 'ดูคะแนน'}
                      </Button>
                    </div>
                  )}
                />
                <ProgressBar value={graded} max={Math.max(roster.length, 1)} tone={graded === roster.length ? 'success' : 'brand'} />
                {open && (
                  visibleRoster.length === 0 ? (
                    <EmptyState icon={<Icon name="search" size={28} />} title="ไม่พบนักเรียนที่ค้นหา" description={`ไม่มีชื่อที่ตรงกับ "${query}"`} />
                  ) : (
                    <DataTable caption={`คะแนนกิจกรรม ${activity.title}`} head={<tr><th>นักเรียน</th><th>คะแนน (เต็ม {activity.maxScore})</th></tr>}>
                      {visibleRoster.map((student) => {
                        const score = rows.find((item) => item.studentId === student.id);
                        return (
                          <tr key={student.id}>
                            <td>{student.displayName}</td>
                            <td>
                              <ScoreCell
                                cellKey={`${activity.id}:${student.id}`}
                                studentName={student.displayName}
                                maxScore={activity.maxScore}
                                value={score?.score ?? null}
                                editable={editable}
                                saved={savedCell === `${activity.id}:${student.id}`}
                                onSave={async (next) => {
                                  await repository.saveActivityScores(activity.id, [{ studentId: student.id, score: next }]);
                                  setSavedCell(`${activity.id}:${student.id}`);
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </DataTable>
                  )
                )}
              </Card>
            );
          })}
        </>
      )}

      {tab === 'test' && (
        <>
          {isTeacher && canManageSelectedClass && (
            <Card>
              <CardHeader title="เพิ่มรายการสอบ" description="บันทึกเป็นฉบับร่างก่อน คะแนนจะยังไม่ถึงนักเรียนจนกว่าจะกดเผยแพร่" />
              <form onSubmit={(event) => void createTest(event)}>
                <FieldGroup columns={2}>
                  <Field label="ชื่อการสอบ"><input name="title" required placeholder="เช่น สอบกลางภาค" /></Field>
                  <Field label="รายวิชา">
                    <select name="subjectId" defaultValue={subjectFilter || subjects[0]?.id || ''}>
                      <option value="">ไม่ระบุวิชา</option>
                      {editableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                    </select>
                  </Field>
                  <Field label="วันที่สอบ"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                  <Field label="คะแนนเต็ม" hint="ใช้เป็นตัวหารตอนคิดคะแนนรวม"><input name="maxScore" type="number" min="1" defaultValue="100" /></Field>
                </FieldGroup>
                <div className="ui-form-actions">
                  <Button variant="primary" icon={<Icon name="plus" size={16} />}>บันทึกฉบับร่าง</Button>
                </div>
              </form>
            </Card>
          )}

          {tests.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon name="exams" size={28} />}
                title={subjectFilter ? 'ไม่มีรายการสอบในวิชานี้' : 'ยังไม่มีรายการสอบในห้องนี้'}
                description={subjectFilter ? 'ลองเลือกวิชาอื่น หรือกด "ทุกวิชา"' : 'สร้างรายการสอบเพื่อเริ่มกรอกคะแนน'}
                {...(subjectFilter ? { action: <Button variant="secondary" onClick={() => setSubjectFilter('')}>ดูทุกวิชา</Button> } : {})}
              />
            </Card>
          ) : tests.map((test) => {
            const rows = snapshot.testScores.filter((item) => item.testId === test.id);
            const published = rows.some((item) => item.publishedAt);
            const graded = gradedCount(rows);
            const editable = isTeacher && canManageAcademicItem(snapshot, membership.role, membership.profileId, test.classId, test.subjectId);
            const open = openItemId === test.id;
            return (
              <Card key={test.id} className="score-item-card">
                <CardHeader
                  title={test.title}
                  description={`${subjectById(snapshot, test.subjectId)?.name ?? 'ไม่ระบุวิชา'} · เต็ม ${test.maxScore} คะแนน · ${thaiDate(test.testDate)}`}
                  action={(
                    <div className="score-item-actions">
                      <Badge tone={published ? 'success' : 'warning'}>{published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่'}</Badge>
                      {(isTeacher || published) && (
                        <Button
                          variant="secondary"
                          onClick={() => setOpenItemId(open ? null : test.id)}
                          aria-expanded={open}
                          icon={<Icon name={open ? 'close' : editable ? 'edit' : 'eye'} size={16} />}
                        >
                          {open ? 'ปิด' : editable ? 'กรอกคะแนน' : 'ดูคะแนน'}
                        </Button>
                      )}
                      {editable && !published && (
                        <Button variant="primary" icon={<Icon name="send" size={16} />} onClick={() => setPublishing({ id: test.id, title: test.title })}>
                          เผยแพร่คะแนน
                        </Button>
                      )}
                    </div>
                  )}
                />
                {isTeacher && <ProgressBar value={graded} max={Math.max(roster.length, 1)} tone={graded === roster.length ? 'success' : 'brand'} label={`กรอกแล้ว ${graded}/${roster.length}`} />}
                {!isTeacher && !published ? (
                  <EmptyState
                    icon={<Icon name="exams" size={28} />}
                    title="คะแนนยังไม่เผยแพร่"
                    description="ครูจะเผยแพร่เมื่อตรวจครบแล้ว"
                  />
                ) : open && (
                  visibleRoster.length === 0 ? (
                    <EmptyState icon={<Icon name="search" size={28} />} title="ไม่พบนักเรียนที่ค้นหา" description={`ไม่มีชื่อที่ตรงกับ "${query}"`} />
                  ) : (
                    <DataTable caption={`คะแนนสอบ ${test.title}`} head={<tr><th>นักเรียน</th><th>คะแนน (เต็ม {test.maxScore})</th></tr>}>
                      {visibleRoster.map((student) => {
                        const score = rows.find((item) => item.studentId === student.id);
                        return (
                          <tr key={student.id}>
                            <td>{student.displayName}</td>
                            <td>
                              <ScoreCell
                                cellKey={`${test.id}:${student.id}`}
                                studentName={student.displayName}
                                maxScore={test.maxScore}
                                value={score?.score ?? null}
                                editable={editable}
                                saved={savedCell === `${test.id}:${student.id}`}
                                onSave={async (next) => {
                                  await repository.saveTestScores(test.id, [{ studentId: student.id, score: next }]);
                                  setSavedCell(`${test.id}:${student.id}`);
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </DataTable>
                  )
                )}
              </Card>
            );
          })}
        </>
      )}

      {/*
        Publishing marks is the one action on this page a student and a parent see immediately, and
        there is no unpublish. It used to fire straight off a button in a row of three.
      */}
      {publishing && (
        <ConfirmDialog
          title={`เผยแพร่คะแนน "${publishing.title}"`}
          description="นักเรียนและผู้ปกครองจะเห็นคะแนนนี้ทันที และยกเลิกการเผยแพร่ไม่ได้"
          confirmLabel="เผยแพร่คะแนน"
          tone="warning"
          onCancel={() => setPublishing(null)}
          onConfirm={() => {
            const target = publishing;
            setPublishing(null);
            void repository.publishTestScores(target.id).then(() => toast('เผยแพร่คะแนนสอบแล้ว'));
          }}
        />
      )}
    </>
  );
}
