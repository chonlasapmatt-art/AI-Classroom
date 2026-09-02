import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, attendanceDailySummary, subjectById } from '../../data/selectors';
import { calendarItemsFor } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone, type WorkState } from '../../academic/workStatus';
import { Badge, Card, CardHeader, EmptyState, Field, LinkButton, PageHeader, ProgressBar, Segmented, Stat, Toolbar } from '../../ui/components';
import { ProfileAvatar } from '../avatars/ProfileAvatar';

type DetailFilter = 'all' | 'pending' | 'overdue' | 'done';

const detailFilters: Array<{ value: DetailFilter; label: string }> = [
  { value: 'all', label: 'ทุกงาน' },
  { value: 'pending', label: 'ต้องติดตาม' },
  { value: 'overdue', label: 'เลยกำหนด' },
  { value: 'done', label: 'ส่งแล้ว' }
];

const doneStates = new Set<WorkState>(['submitted', 'late', 'graded']);
const pendingStates = new Set<WorkState>(['upcoming', 'soon', 'urgent', 'overdue', 'revision_requested']);

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่กำหนดส่ง';
}

/** A privacy-safe, cross-subject follow-up view for one student. */
export function StudentDetailPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const { studentId = '' } = useParams<{ studentId: string }>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DetailFilter>('all');

  const canView = membership.role === 'admin' || membership.role === 'teacher';
  const student = canView
    ? snapshot.students.find((item) => item.id === studentId && item.status === 'active')
    : undefined;

  const classMap = useMemo(() => new Map(activeClasses(snapshot).map((item) => [item.id, item])), [snapshot]);
  const studentClassIds = useMemo(() => {
    if (!student) return [];
    return [...new Set(snapshot.enrollments
      .filter((item) => item.studentId === student.id && item.status === 'active' && classMap.has(item.classId))
      .map((item) => item.classId))];
  }, [snapshot, student, classMap]);

  const items = useMemo(() => {
    if (!student) return [];
    return calendarItemsFor(snapshot, { classIds: studentClassIds, studentId: student.id, includeDrafts: false })
      .filter((item) => item.work.status === 'published' || item.work.status === 'closed');
  }, [snapshot, student, studentClassIds]);

  const summary = useMemo(() => {
    const pending = items.filter((item) => pendingStates.has(item.state));
    const overdue = items.filter((item) => item.state === 'overdue');
    const submitted = items.filter((item) => doneStates.has(item.state));
    const subjectIds = new Set(pending.map((item) => item.work.subjectId ?? 'unassigned'));
    return {
      total: items.length,
      pending: pending.length,
      overdue: overdue.length,
      submitted: submitted.length,
      pendingSubjects: subjectIds.size,
      completionRate: items.length === 0 ? 0 : Math.round((submitted.length / items.length) * 100)
    };
  }, [items]);

  const subjectSummary = useMemo(() => {
    const groups = new Map<string, { name: string; total: number; pending: number; done: number; overdue: number }>();
    for (const item of items) {
      const subject = subjectById(snapshot, item.work.subjectId);
      const key = item.work.subjectId ?? 'unassigned';
      const current = groups.get(key) ?? { name: subject?.name ?? 'ไม่ระบุวิชา', total: 0, pending: 0, done: 0, overdue: 0 };
      current.total += 1;
      if (pendingStates.has(item.state)) current.pending += 1;
      if (doneStates.has(item.state)) current.done += 1;
      if (item.state === 'overdue') current.overdue += 1;
      groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, 'th'));
  }, [items, snapshot]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('th-TH');
    return items.filter((item) => {
      const subject = subjectById(snapshot, item.work.subjectId);
      const matchesQuery = !normalized || `${item.work.title} ${subject?.name ?? 'ไม่ระบุวิชา'} ${classMap.get(item.work.classId)?.name ?? ''}`
        .toLocaleLowerCase('th-TH').includes(normalized);
      const matchesFilter = filter === 'all'
        || (filter === 'pending' && pendingStates.has(item.state))
        || (filter === 'overdue' && item.state === 'overdue')
        || (filter === 'done' && doneStates.has(item.state));
      return matchesQuery && matchesFilter;
    });
  }, [classMap, filter, items, query, snapshot]);

  if (!canView) {
    return (
      <>
        <PageHeader eyebrow="ข้อมูลตามสิทธิ์" title="ไม่สามารถเปิดข้อมูลนี้ได้" description="หน้านี้สำหรับแอดมินและครูที่ได้รับมอบหมายห้องเรียนเท่านั้น" />
        <Card><EmptyState icon="🔒" title="ไม่มีสิทธิ์เข้าถึง" description="บัญชีของคุณเห็นได้เฉพาะข้อมูลของตนเองตามบทบาทที่กำหนด" /></Card>
      </>
    );
  }

  if (!student) {
    return (
      <>
        <PageHeader eyebrow="ติดตามรายบุคคล" title="ไม่พบข้อมูลนักเรียน" description="ข้อมูลนี้อาจอยู่นอกห้องที่คุณรับผิดชอบ หรือถูกปิดการใช้งานแล้ว" action={<LinkButton to="/assignments" variant="ghost">กลับไปติดตามงาน</LinkButton>} />
        <Card><EmptyState icon="🔎" title="ไม่พบข้อมูลในขอบเขตของคุณ" description="ระบบจะไม่แสดงข้อมูลของนักเรียนที่อยู่นอกสิทธิ์ แม้จะเปิดลิงก์โดยตรง" /></Card>
      </>
    );
  }

  const attendance = attendanceDailySummary(snapshot, { studentId: student.id });
  const classNames = studentClassIds.map((id) => classMap.get(id)?.name).filter((name): name is string => Boolean(name));

  return (
    <>
      <PageHeader
        eyebrow="ติดตามรายบุคคล"
        title={student.displayName}
        description={`${student.studentCode} · เจาะลึกงาน คะแนนการส่ง และการเข้าเรียนในทุกห้องที่คุณมีสิทธิ์ดู`}
        action={<LinkButton to="/assignments" variant="ghost">กลับไปติดตามงาน</LinkButton>}
      />

      <div className="student-detail-hero">
        <Card className="student-detail-profile">
          <ProfileAvatar displayName={student.displayName} avatarId={student.avatarId} avatarPhotoId={student.avatarPhotoId} avatarIndex={student.avatarIndex} avatarConfig={student.avatarConfig} size={88} animation="wave" />
          <div>
            <span className="ui-eyebrow">ข้อมูลนักเรียน</span>
            <h2>{student.displayName}</h2>
            <p>รหัสนักเรียน {student.studentCode}</p>
            <div className="student-detail-chips">
              {classNames.map((name) => <Badge key={name} tone="info">{name}</Badge>)}
              {classNames.length === 0 && <Badge tone="warning">ยังไม่มีห้องเรียน</Badge>}
            </div>
          </div>
        </Card>
        <Card className="student-detail-focus">
          <CardHeader title="จุดที่ควรติดตาม" description="สรุปจากงานที่เผยแพร่แล้วทุกวิชาที่อยู่ในสิทธิ์ของคุณ" />
          {summary.pending > 0 ? (
            <div className="student-detail-focus-copy">
              <strong>{summary.pending} งาน</strong>
              <span>ค้างอยู่ใน {summary.pendingSubjects} วิชา{summary.overdue > 0 ? ` · เลยกำหนด ${summary.overdue} งาน` : ''}</span>
            </div>
          ) : (
            <div className="student-detail-focus-copy success"><strong>ไม่มีงานค้าง</strong><span>นักเรียนคนนี้ตามงานที่เผยแพร่ไว้ทันทั้งหมด</span></div>
          )}
        </Card>
      </div>

      <div className="ui-stat-grid student-detail-stats">
        <Stat label="งานทั้งหมด" value={summary.total} hint="ทุกห้องที่มองเห็นได้" tone="brand" />
        <Stat label="ต้องติดตาม" value={summary.pending} hint="ยังไม่ส่งหรือขอแก้ไข" tone={summary.pending > 0 ? 'warning' : 'success'} />
        <Stat label="เลยกำหนด" value={summary.overdue} hint="ควรติดต่อก่อน" tone={summary.overdue > 0 ? 'danger' : 'neutral'} />
        <Stat label="ส่งแล้ว" value={`${summary.completionRate}%`} hint={`${summary.submitted}/${summary.total || 0} งาน`} tone="success" />
      </div>

      <Card>
        <CardHeader title="ภาพรวมแยกตามวิชา" description="เห็นทันทีว่าวิชาไหนมีงานค้าง แม้นักเรียนจะเรียนหลายห้อง" />
        {subjectSummary.length === 0 ? <EmptyState icon="✓" title="ยังไม่มีงานที่เผยแพร่" description="เมื่องานถูกเผยแพร่ รายละเอียดจะแยกตามวิชาให้อัตโนมัติ" /> : (
          <div className="student-detail-subject-grid">
            {subjectSummary.map((subject) => (
              <article key={subject.name} className={`student-detail-subject-card ${subject.pending > 0 ? 'has-pending' : ''}`}>
                <div><strong>{subject.name}</strong><span>{subject.total} งาน · ส่งแล้ว {subject.done}</span></div>
                <div className="student-detail-subject-meta">
                  <Badge tone={subject.pending > 0 ? 'warning' : 'success'}>{subject.pending > 0 ? `ค้าง ${subject.pending}` : 'ครบแล้ว'}</Badge>
                  {subject.overdue > 0 && <Badge tone="danger">เลยกำหนด {subject.overdue}</Badge>}
                </div>
                <ProgressBar value={subject.done} max={subject.total} label={`${Math.round((subject.done / subject.total) * 100)}%`} tone={subject.pending > 0 ? 'warning' : 'success'} />
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card className="student-detail-attendance-card">
        <CardHeader title="ภาพรวมการเข้าเรียน" description="รวมผลจากทุกวิชาและโฮมรูม แยกตามวัน ไม่ทับข้อมูลระหว่างคาบ" action={<Badge tone={attendance.presentRate >= 80 ? 'success' : 'warning'}>{attendance.presentRate}% มาเรียน</Badge>} />
        <div className="student-detail-attendance-grid">
          <div><strong>{attendance.present}</strong><span>มาเรียน</span></div>
          <div><strong>{attendance.late}</strong><span>สาย</span></div>
          <div><strong>{attendance.absent}</strong><span>ขาด</span></div>
          <div><strong>{attendance.leave}</strong><span>ลา</span></div>
          <div><strong>{attendance.totalDays}</strong><span>วันที่บันทึก</span></div>
        </div>
      </Card>

      <Card className="student-detail-work-card">
        <CardHeader title="รายละเอียดงานทั้งหมด" description="ค้นหาชื่องานหรือวิชา แล้วกรองเฉพาะรายการที่ต้องติดตามได้ทันที" action={<Badge tone={attendance.presentRate >= 80 ? 'success' : 'warning'}>เข้าเรียน {attendance.presentRate}%</Badge>} />
        <Toolbar>
          <Field label="ค้นหางานหรือวิชา"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="เช่น คณิตศาสตร์ หรือใบงานบทที่ 1" /></Field>
          <Segmented ariaLabel="กรองรายละเอียดงาน" value={filter} onChange={setFilter} options={detailFilters} />
        </Toolbar>
        {visibleItems.length === 0 ? (
          <EmptyState icon={filter === 'done' ? '✓' : '⌕'} title="ไม่พบงานที่ตรงกับตัวกรอง" description="ลองเปลี่ยนคำค้นหาหรือเลือกดูทุกงาน" />
        ) : (
          <div className="student-work-list">
            {visibleItems.map((item) => {
              const subject = subjectById(snapshot, item.work.subjectId);
              return (
                <article key={item.work.id} className="student-work-row">
                  <div className="student-work-main">
                    <div className="student-work-title"><strong>{item.work.title}</strong><Badge tone={workStateTone[item.state]}>{workStateLabels[item.state]}</Badge></div>
                    <span>{subject?.name ?? 'ไม่ระบุวิชา'} · {classMap.get(item.work.classId)?.name ?? 'ไม่ระบุห้อง'}</span>
                  </div>
                  <div className="student-work-due"><strong>{dateLabel(item.dueAt)}</strong><span>{timeRemainingLabel(item.dueAt)}</span></div>
                  <div className="student-work-submission">
                    <span>{item.submission?.submittedAt ? `ส่งเมื่อ ${dateLabel(item.submission.submittedAt)}` : 'ยังไม่มีการส่ง'}</span>
                    {item.submission?.score !== null && item.submission?.score !== undefined && <strong>{item.submission.score}/{item.work.maxScore} คะแนน</strong>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
