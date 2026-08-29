import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, rosterFor, scorePolicyFrom, standingsFor, subjectById } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';

type Tab = 'activity' | 'test' | 'summary';

export function ScoresPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [classId, setClassId] = useState('');
  const [tab, setTab] = useState<Tab>('summary');
  const [message, setMessage] = useState<string | null>(null);

  const isTeacher = membership.role === 'admin' || membership.role === 'teacher';
  const ownStudentId = snapshot.students.find((item) => item.profileId === membership.profileId)?.id ?? null;
  const ownClassId = membership.role === 'student' && ownStudentId ? classIdOfStudent(snapshot, ownStudentId) : null;
  const effectiveClassId = ownClassId ?? classId ?? classes[0]?.id ?? '';
  const selectedClassId = effectiveClassId || classes[0]?.id || '';

  const roster = rosterFor(snapshot, selectedClassId);
  const policy = scorePolicyFrom(snapshot.settings);
  const standings = useMemo(() => standingsFor(snapshot, selectedClassId, policy), [snapshot, selectedClassId, policy]);
  const bySubject = <T extends { subjectId: string | null }>(items: T[]) => items.filter((item) => !subjectFilter || item.subjectId === subjectFilter);
  const activities = bySubject(snapshot.activities.filter((item) => item.classId === selectedClassId));
  const tests = bySubject(snapshot.tests.filter((item) => item.classId === selectedClassId));

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
    setMessage('สร้างกิจกรรมแล้ว');
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
    setMessage('สร้างรายการสอบเป็นฉบับร่างแล้ว (คะแนนยังไม่เผยแพร่)');
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
        <div className="segmented">
          <button className={tab === 'summary' ? 'active present' : ''} onClick={() => setTab('summary')}>สรุปเกรด</button>
          <button className={tab === 'activity' ? 'active present' : ''} onClick={() => setTab('activity')}>กิจกรรม</button>
          <button className={tab === 'test' ? 'active present' : ''} onClick={() => setTab('test')}>สอบ</button>
        </div>
      </div>

      {tab === 'summary' && (
        <section className="panel data-panel">
          <div className="panel-heading"><h2>คะแนนรวมและเกรด</h2><span className="status-chip success">เฉพาะคะแนนที่เผยแพร่แล้ว</span></div>
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
        </section>
      )}

      {tab === 'activity' && (
        <>
          {isTeacher && (
            <form className="panel inline-form" onSubmit={(event) => void createActivity(event)}>
              <div className="panel-heading"><h2>เพิ่มกิจกรรม</h2></div>
              <div className="form-grid">
                <label>ชื่อกิจกรรม<input name="title" required /></label>
                <label>
                  รายวิชา
                  <select name="subjectId" defaultValue={subjectFilter || subjects[0]?.id || ''}>
                    <option value="">ไม่ระบุวิชา</option>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
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
              <table className="grid-table">
                <thead><tr><th>นักเรียน</th><th>คะแนน</th></tr></thead>
                <tbody>
                  {roster.map((student) => {
                    const score = snapshot.activityScores.find((item) => item.activityId === activity.id && item.studentId === student.id);
                    return (
                      <tr key={student.id}>
                        <td>{student.displayName}</td>
                        <td>
                          {isTeacher ? (
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
            </section>
          ))}
        </>
      )}

      {tab === 'test' && (
        <>
          {isTeacher && (
            <form className="panel inline-form" onSubmit={(event) => void createTest(event)}>
              <div className="panel-heading"><h2>เพิ่มรายการสอบ</h2></div>
              <div className="form-grid">
                <label>ชื่อการสอบ<input name="title" required /></label>
                <label>
                  รายวิชา
                  <select name="subjectId" defaultValue={subjectFilter || subjects[0]?.id || ''}>
                    <option value="">ไม่ระบุวิชา</option>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
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
                    {isTeacher && !published && (
                      <button className="secondary-button" onClick={() => void repository.publishTestScores(test.id).then(() => setMessage('เผยแพร่คะแนนสอบแล้ว'))}>
                        เผยแพร่คะแนน
                      </button>
                    )}
                  </div>
                </div>
                {(isTeacher || published) ? (
                  <table className="grid-table">
                    <thead><tr><th>นักเรียน</th><th>คะแนน (เต็ม {test.maxScore})</th></tr></thead>
                    <tbody>
                      {roster.map((student) => {
                        const score = snapshot.testScores.find((item) => item.testId === test.id && item.studentId === student.id);
                        return (
                          <tr key={student.id}>
                            <td>{student.displayName}</td>
                            <td>
                              {isTeacher ? (
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
                ) : (
                  <div className="empty-state"><span>☆</span><h3>คะแนนยังไม่เผยแพร่</h3><p>ครูจะเผยแพร่เมื่อตรวจครบแล้ว</p></div>
                )}
              </section>
            );
          })}
        </>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
