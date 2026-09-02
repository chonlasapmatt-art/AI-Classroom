import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, rosterFor } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';
import {
  buildGradebook, categoryLabels, categoryWeightsFrom, gradeCategories, gradeDistribution, totalWeight, weightsAreValid
} from '../../academic/gradebook';
import { gradePointFor, gradeSchemeFrom } from '../../academic/gradeScheme';
import { Badge, Card, CardHeader, DataTable, EmptyState, Field, PageHeader, ProgressBar, Stat, Toolbar } from '../../ui/components';
import { ProfileAvatar } from '../avatars/ProfileAvatar';

/** The gradebook: category columns, weighted average and the grade each student currently holds. */
export function GradebookPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);
  const scheme = gradeSchemeFrom(snapshot.settings);
  const weights = categoryWeightsFrom(snapshot.settings);

  const student = snapshot.students.find((item) => item.profileId === membership.profileId);
  const ownClassId = membership.role === 'student' ? classIdOfStudent(snapshot, student?.id ?? '') : null;

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [termId, setTermId] = useState('');

  const effectiveClassId = ownClassId ?? classId ?? classes[0]?.id ?? '';
  const selectedClassId = effectiveClassId || classes[0]?.id || '';
  const classroom = classes.find((item) => item.id === selectedClassId);
  const term = snapshot.terms.find((item) => item.id === termId)
    ?? snapshot.terms.find((item) => item.status === 'active')
    ?? snapshot.terms[0];

  const roster = rosterFor(snapshot, selectedClassId);
  const visibleRoster = membership.role === 'student' && student
    ? roster.filter((item) => item.id === student.id)
    : roster;

  const rows = useMemo(() => buildGradebook({
    students: visibleRoster,
    works: snapshot.assignments.filter((work) => work.classId === selectedClassId),
    submissions: snapshot.submissions,
    tests: snapshot.tests.filter((test) => test.classId === selectedClassId),
    testScores: snapshot.testScores,
    weights,
    scheme,
    subjectId: subjectId || null
  }), [visibleRoster, snapshot, selectedClassId, weights, scheme, subjectId]);

  const distribution = gradeDistribution(rows, scheme);
  const weightTotal = totalWeight(weights);
  const gradedRows = rows.filter((row) => row.percentage !== null);
  const averagePercentage = gradedRows.length > 0
    ? Math.round((gradedRows.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / gradedRows.length) * 10) / 10
    : null;
  const highestRow = gradedRows.reduce<(typeof rows)[number] | null>((highest, row) =>
    !highest || (row.percentage ?? 0) > (highest.percentage ?? 0) ? row : highest, null);
  const publishedWorkCount = snapshot.assignments.filter((work) =>
    work.classId === selectedClassId && work.status !== 'draft' && work.status !== 'cancelled').length
    + snapshot.tests.filter((test) => test.classId === selectedClassId && test.status !== 'draft').length;

  return (
    <>
      <PageHeader
        eyebrow="ผลการเรียน"
        title="สมุดเกรด"
        description={`${classroom?.name ?? 'ทุกห้อง'} · ${subjects.find((item) => item.id === subjectId)?.name ?? 'ทุกวิชา'} · ภาคเรียนที่ ${term?.term ?? '-'} ปีการศึกษา ${term?.academicYear ?? '-'}`}
        action={<Badge tone="brand">อัปเดตจากข้อมูลล่าสุด</Badge>}
      />

      <section className="gradebook-overview" aria-label="ภาพรวมสมุดเกรด">
        <div>
          <span className="ui-eyebrow">GRADEBOOK OVERVIEW</span>
          <h2>ภาพรวมผลการเรียน</h2>
          <p>ติดตามคะแนนของนักเรียนในห้องนี้ได้ในมุมมองเดียว</p>
        </div>
        <div className="gradebook-period">
          <span>ช่วงเวลาที่กำลังดู</span>
          <strong>{term ? `ภาคเรียนที่ ${term.term} / ${term.academicYear}` : 'ยังไม่เลือกภาคเรียน'}</strong>
        </div>
      </section>

      <div className="ui-stat-grid gradebook-stats">
        <Stat label="นักเรียนในห้อง" value={visibleRoster.length} hint="คนในห้องที่เลือก" tone="brand" />
        <Stat label="คะแนนเฉลี่ย" value={averagePercentage === null ? '—' : `${averagePercentage}%`} hint={`${gradedRows.length} คนมีคะแนนแล้ว`} tone="info" />
        <Stat label="งานและการสอบ" value={publishedWorkCount} hint="รายการที่นำมาคำนวณ" tone="success" />
        <Stat label="คะแนนสูงสุด" value={highestRow?.percentage === null || highestRow?.percentage === undefined ? '—' : `${highestRow.percentage}%`} hint={highestRow?.student.displayName ?? 'ยังไม่มีคะแนน'} tone="warning" />
      </div>

      <Card className="gradebook-filter-card">
        <div className="gradebook-filter-heading">
          <div>
            <span className="ui-eyebrow">FILTER VIEW</span>
            <h2>เลือกมุมมองข้อมูล</h2>
          </div>
          <span className="gradebook-filter-hint">ข้อมูลจะปรับทันทีเมื่อเลือกตัวกรอง</span>
        </div>
        <Toolbar>
          {!ownClassId && (
            <Field label="ห้องเรียน">
              <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="รายวิชา">
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">ทุกวิชา</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </Field>
          <Field label="ภาคเรียน">
            <select value={term?.id ?? ''} onChange={(event) => setTermId(event.target.value)}>
              {snapshot.terms.map((item) => (
                <option key={item.id} value={item.id}>ภาคเรียนที่ {item.term} / {item.academicYear}</option>
              ))}
            </select>
          </Field>
        </Toolbar>
      </Card>

      {!weightsAreValid(weights) && (
        <div className="inline-warning" role="status">
          <Badge tone="warning">น้ำหนักคะแนนรวม {weightTotal}%</Badge>
          <span>ควรตั้งให้รวมเป็น 100% ที่หน้าตั้งค่า ระบบจะเฉลี่ยตามสัดส่วนที่มีอยู่ไปก่อน</span>
        </div>
      )}

      <Card padded={false} className="gradebook-card">
        <div className="gradebook-head">
          <CardHeader
            title="ตารางคะแนน"
            description={gradeCategories.map((category) => `${categoryLabels[category]} ${weights[category]}%`).join(' · ')}
            action={<Badge tone={weightsAreValid(weights) ? 'success' : 'warning'}>{weightTotal}% ของน้ำหนักคะแนน</Badge>}
          />
        </div>
        {rows.length === 0 ? (
          <EmptyState title="ยังไม่มีข้อมูลคะแนน" description="เมื่อครูตรวจงานแล้ว คะแนนจะปรากฏที่นี่" />
        ) : (
          <div className="gradebook-table">
            <DataTable
              caption="สมุดเกรด"
              head={
                <tr>
                  <th>นักเรียน</th>
                  {gradeCategories.map((category) => <th key={category}>{categoryLabels[category]}</th>)}
                  <th>เฉลี่ย</th><th>เกรด</th><th>GPA</th>
                </tr>
              }
            >
              {rows.map((row) => (
                <tr key={row.student.id}>
                  <td className="gradebook-student-cell">
                    <div className="cell-person">
                      <ProfileAvatar
                        displayName={row.student.displayName}
                        avatarId={row.student.avatarId}
                        avatarIndex={row.student.avatarIndex}
                        avatarConfig={row.student.avatarConfig}
                        size={38}
                      />
                      <div>
                        <strong>{row.student.displayName}</strong>
                        <span>{row.student.studentCode}</span>
                      </div>
                    </div>
                  </td>
                  {gradeCategories.map((category) => {
                    const result = row.categories.find((item) => item.category === category);
                    return (
                      <td key={category} className="gradebook-score-cell">
                        {result?.percentage === null || result === undefined
                          ? <span className="muted">—</span>
                          : <><strong>{result.earned}/{result.possible}</strong><small>{result.percentage}%</small></>}
                      </td>
                    );
                  })}
                  <td className="gradebook-average">{row.percentage === null ? <span className="muted">—</span> : <strong>{row.percentage}%</strong>}</td>
                  <td>{row.grade ? <Badge tone={row.grade === scheme.belowGrade ? 'danger' : 'success'}>{row.grade}</Badge> : <span className="muted">—</span>}</td>
                  <td><span className="gradebook-gpa">{gradePointFor(row.percentage).toFixed(1)}</span></td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </Card>

      <div className="dashboard-columns">
        <Card className="gradebook-insight-card">
          <CardHeader title="การกระจายเกรด" description="เฉพาะนักเรียนที่มีคะแนนเผยแพร่แล้ว" />
          <div className="distribution-bar" aria-label="การกระจายเกรด">
            {distribution.map((entry) => <div key={entry.grade} className={`distribution-slice grade-${entry.grade.replace('+', 'plus')}`} style={{ flexGrow: Math.max(entry.count, 0.04) }} title={`${entry.grade}: ${entry.count} คน`}><strong>{entry.grade}</strong><span>{entry.share}%</span><small>{entry.count} คน</small></div>)}
          </div>
          <p className="gradebook-insight-note">เกรดจะสะท้อนเฉพาะรายการที่มีการเผยแพร่คะแนนแล้ว</p>
        </Card>

        <Card className="gradebook-insight-card">
          <CardHeader title="สัดส่วนคะแนนตามหมวด" description={`รวม ${weightTotal}%`} />
          <div className="subject-progress">
            {gradeCategories.map((category) => (
              <div key={category} className="subject-progress-row">
                <span>{categoryLabels[category]}</span>
                <ProgressBar value={weights[category]} max={100} label={`${weights[category]}%`} />
              </div>
            ))}
          </div>
          {subjectId && (
            <p className="ui-field-hint">
              <SubjectIcon iconKey={subjects.find((item) => item.id === subjectId)?.iconKey ?? 'default'} size={14} />{' '}
              กรองเฉพาะวิชา {subjects.find((item) => item.id === subjectId)?.name}
              <span
                className="subject-dot"
                style={{ background: subjectColor(subjects.find((item) => item.id === subjectId)?.colorIndex ?? 0).solid }}
              />
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
