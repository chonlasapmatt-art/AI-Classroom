import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, rosterFor, scorePolicyFrom, standingsFor, subjectById, subjectResultsFor } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';
import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { Subject } from '../../domain/types';
import { canManageAcademicItem, teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import { Segmented } from '../../ui/components';
import { useToast } from '../../ui/toastContext';

type Tab = 'activity' | 'test' | 'summary';

const detailKindLabels: Record<'assignment' | 'homework' | 'project' | 'activity' | 'test', string> = {
  assignment: 'งานที่มอบหมาย', homework: 'การบ้าน', project: 'โครงงาน', activity: 'กิจกรรม', test: 'สอบ'
};

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

  return (
    <>
      <section className="panel student-score-overview">
        <div className="panel-heading">
          <div>
            <h2>คะแนนของฉันแยกตามรายวิชา</h2>
            <p className="panel-description">แสดงเฉพาะคะแนนของบัญชีนี้ และเฉพาะรายการที่ครูประกาศแล้ว</p>
          </div>
          <span className="status-chip success">ข้อมูลส่วนตัว</span>
        </div>
        {!studentId || !classId ? (
          <div className="empty-state"><span>☆</span><h3>กำลังเตรียมข้อมูลคะแนน</h3><p>ระบบกำลังเชื่อมข้อมูลห้องเรียนของคุณ</p></div>
        ) : results.length === 0 ? (
          <div className="empty-state"><span>☆</span><h3>ยังไม่มีคะแนนแยกตามรายวิชา</h3><p>คะแนนจะแสดงเมื่อครูตรวจและประกาศผลแล้ว</p></div>
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
                  onClick={() => setDetailSubjectId((current) => current === result.subject.id ? null : result.subject.id)}
                  aria-label={`ดูรายละเอียดวิชา ${result.subject.name}`}
                >
                  <span className="student-subject-icon"><SubjectIcon iconKey={result.subject.iconKey} size={22} /></span>
                  <span className="student-subject-card-head"><strong>{result.subject.name}</strong><span>{result.itemCount} รายการที่มีคะแนน</span></span>
                  <span className="student-subject-total">{result.total.toFixed(2)}<small>/ 100</small></span>
                  <span className={`status-chip ${result.grade === 'F' ? 'danger' : 'success'}`}>เกรด {result.grade}</span>
                  <span className="student-subject-open">กดเพื่อดูรายละเอียด →</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedSubject && (
        <section className="panel data-panel student-score-detail">
          <div className="panel-heading">
            <div>
              <h2>รายละเอียดคะแนน · {selectedSubject.name}</h2>
              <p className="panel-description">ดูคะแนนที่ได้ คะแนนเต็ม และสถานะของแต่ละรายการ</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setDetailSubjectId(null)}>ปิดรายละเอียด</button>
          </div>
          {detailItems.length === 0 ? (
            <div className="empty-state"><span>☆</span><h3>ยังไม่มีรายการคะแนนที่ประกาศ</h3><p>ครูจะเปิดเผยคะแนนเมื่อพร้อม</p></div>
          ) : (
            <div className="table-scroll">
              <table className="grid-table">
                <thead><tr><th>รายการ</th><th>ประเภท</th><th>วันที่</th><th>คะแนนที่ได้</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {detailItems.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.title}</strong></td>
                      <td>{item.kind}</td>
                      <td>{item.date ? new Date(item.date).toLocaleDateString('th-TH') : '—'}</td>
                      <td className="student-score-value">{item.score === null ? '—' : `${item.score} / ${item.maxScore}`}</td>
                      <td><span className={`status-chip ${item.score === null ? 'warning' : 'success'}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
        <section className="page-heading">
          <div>
            <span className="eyebrow">คะแนนและเกรด · มุมมองนักเรียน</span>
            <h1>คะแนนของฉัน</h1>
            <p>สรุปคะแนนแยกตามรายวิชา กดที่วิชาเพื่อดูรายละเอียดงาน กิจกรรม และการสอบ</p>
          </div>
        </section>
        <StudentScoresView snapshot={snapshot} studentId={ownStudentId} classId={selectedClassId} subjects={subjects} policy={policy} />
      </>
    );
  }

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
      <section className="page-heading">
        <div>
          <span className="eyebrow">คะแนนและเกรด</span>
          <h1>คะแนน</h1>
          <p>
            น้ำหนัก งาน {policy.weights.assignment}% · กิจกรรม {policy.weights.activity}% · สอบ {policy.weights.test}%
            · หักงานส่งช้า {policy.latePenaltyPercent}%
          </p>
        </div>
      </section>

      <div className="toolbar">
        {!ownClassId && (
          <label>
            ห้องเรียน
            <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        <div className="subject-filter">
          <button className={`subject-pill ${subjectFilter === '' ? 'selected' : ''}`} onClick={() => setSubjectFilter('')}>ทุกวิชา</button>
          {subjects.map((subject) => {
            const color = subjectColor(subject.colorIndex);
            return (
              <button
                key={subject.id}
                className={`subject-pill ${subjectFilter === subject.id ? 'selected' : ''}`}
                style={{ borderColor: color.solid, color: subjectFilter === subject.id ? '#fff' : color.solid, background: subjectFilter === subject.id ? color.solid : color.soft }}
                onClick={() => setSubjectFilter(subject.id)}
              >
                <SubjectIcon iconKey={subject.iconKey} size={14} />{subject.name}
              </button>
            );
          })}
        </div>
        {/* Was a copy of the attendance marks, borrowing their "present" green for the selected tab
            — so a tab looked like a student had been marked in. It is the shared control now, which
            is a tablist rather than three buttons that happen to sit together. */}
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
      </div>

      {tab === 'summary' && (
        <section className="panel data-panel">
          <div className="panel-heading"><h2>คะแนนรวมและเกรด</h2><span className="status-chip success">เฉพาะคะแนนที่เผยแพร่แล้ว</span></div>
          <div className="table-scroll">
            <table className="grid-table">
              <thead><tr><th>อันดับ</th><th>นักเรียน</th><th>คะแนนรวม</th><th>เกรด</th><th>ค้างส่ง</th></tr></thead>
              <tbody>
                {standings
                  .filter((entry) => !ownStudentId || membership.role !== 'student' || entry.student.id === ownStudentId)
                  .map((entry) => (
                    <tr key={entry.student.id}>
                      <td>{entry.rank}</td>
                      <td>{entry.student.displayName}</td>
                      <td>{entry.total.toFixed(policy.decimals)}</td>
                      <td><span className={`status-chip ${entry.grade === 'F' ? 'danger' : 'success'}`}>{entry.grade}</span></td>
                      <td>{entry.missingWork}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'activity' && (
        <>
          {isTeacher && canManageSelectedClass && (
            <form className="panel inline-form" onSubmit={(event) => void createActivity(event)}>
              <div className="panel-heading"><h2>เพิ่มกิจกรรม</h2></div>
              <div className="form-grid">
                <label>ชื่อกิจกรรม<input name="title" required /></label>
                <label>
                  รายวิชา
                  <select name="subjectId" defaultValue={subjectFilter || subjects[0]?.id || ''}>
                    <option value="">ไม่ระบุวิชา</option>
                    {editableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <label>วันที่<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                <label>คะแนนเต็ม<input name="maxScore" type="number" min="1" defaultValue="10" /></label>
              </div>
              <button className="primary-button">บันทึก</button>
            </form>
          )}
          {activities.map((activity) => (
            <section className="panel data-panel" key={activity.id}>
              <div className="panel-heading">
                <h2>{activity.title}</h2>
                <span className="status-chip success">
                  {subjectById(snapshot, activity.subjectId)?.name ?? 'ไม่ระบุวิชา'} · เต็ม {activity.maxScore} · {activity.activityDate}
                </span>
              </div>
              <div className="table-scroll">
                <table className="grid-table">
                  <thead><tr><th>นักเรียน</th><th>คะแนน</th></tr></thead>
                  <tbody>
                    {roster.map((student) => {
                      const score = snapshot.activityScores.find((item) => item.activityId === activity.id && item.studentId === student.id);
                      return (
                        <tr key={student.id}>
                          <td>{student.displayName}</td>
                          <td>
                            {isTeacher && canManageAcademicItem(snapshot, membership.role, membership.profileId, activity.classId, activity.subjectId) ? (
                              <input
                                type="number" min="0" max={activity.maxScore} defaultValue={score?.score ?? ''}
                                onBlur={(event) => void repository.saveActivityScores(activity.id, [{
                                  studentId: student.id,
                                  score: event.target.value === '' ? null : Math.min(activity.maxScore, Math.max(0, Number(event.target.value)))
                                }])}
                              />
                            ) : (score?.score ?? '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}

      {tab === 'test' && (
        <>
          {isTeacher && canManageSelectedClass && (
            <form className="panel inline-form" onSubmit={(event) => void createTest(event)}>
              <div className="panel-heading"><h2>เพิ่มรายการสอบ</h2></div>
              <div className="form-grid">
                <label>ชื่อการสอบ<input name="title" required /></label>
                <label>
                  รายวิชา
                  <select name="subjectId" defaultValue={subjectFilter || subjects[0]?.id || ''}>
                    <option value="">ไม่ระบุวิชา</option>
                    {editableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <label>วันที่สอบ<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                <label>คะแนนเต็ม<input name="maxScore" type="number" min="1" defaultValue="100" /></label>
              </div>
              <button className="primary-button">บันทึก</button>
            </form>
          )}
          {tests.map((test) => {
            const published = snapshot.testScores.some((item) => item.testId === test.id && item.publishedAt);
            return (
              <section className="panel data-panel" key={test.id}>
                <div className="panel-heading">
                  <h2>{test.title}</h2>
                  <div className="record-actions">
                    <span className="status-chip">{subjectById(snapshot, test.subjectId)?.name ?? 'ไม่ระบุวิชา'}</span>
                    <span className={`status-chip ${published ? 'success' : 'warning'}`}>{published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่'}</span>
                    {isTeacher && canManageAcademicItem(snapshot, membership.role, membership.profileId, test.classId, test.subjectId) && !published && (
                      <button className="secondary-button" onClick={() => void repository.publishTestScores(test.id).then(() => toast('เผยแพร่คะแนนสอบแล้ว'))}>
                        เผยแพร่คะแนน
                      </button>
                    )}
                  </div>
                </div>
                {(isTeacher || published) ? (
                  <div className="table-scroll">
                    <table className="grid-table">
                      <thead><tr><th>นักเรียน</th><th>คะแนน (เต็ม {test.maxScore})</th></tr></thead>
                      <tbody>
                        {roster.map((student) => {
                          const score = snapshot.testScores.find((item) => item.testId === test.id && item.studentId === student.id);
                          return (
                            <tr key={student.id}>
                              <td>{student.displayName}</td>
                              <td>
                                {isTeacher && canManageAcademicItem(snapshot, membership.role, membership.profileId, test.classId, test.subjectId) ? (
                                  <input
                                    type="number" min="0" max={test.maxScore} defaultValue={score?.score ?? ''}
                                    onBlur={(event) => void repository.saveTestScores(test.id, [{
                                      studentId: student.id,
                                      score: event.target.value === '' ? null : Math.min(test.maxScore, Math.max(0, Number(event.target.value)))
                                    }])}
                                  />
                                ) : (score?.score ?? '—')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state"><span>☆</span><h3>คะแนนยังไม่เผยแพร่</h3><p>ครูจะเผยแพร่เมื่อตรวจครบแล้ว</p></div>
                )}
              </section>
            );
          })}
        </>
      )}

    </>
  );
}
