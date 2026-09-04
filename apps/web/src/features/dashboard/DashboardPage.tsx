import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { recall } from '../../app/deviceMemory';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import {
  activeClasses, activeSubjects, attendanceDailySummary, classIdOfStudent, consentedStudents, rosterFor, subjectById
} from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { calendarItemsFor, unreadCount } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone } from '../../academic/workStatus';
import { buildGradebook, categoryWeightsFrom, gradeDistribution } from '../../academic/gradebook';
import { gradeSchemeFrom } from '../../academic/gradeScheme';
import { followUpInsights } from '../../academic/workload';
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, ProgressBar, Skeleton, Stat } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useSyncStatus } from '../../sync/SyncStatusContext';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { canManageAcademicItem, teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import { ActivityCard, AlertStack, AnnouncementCard, QuickActions, SyncLine } from './dashboardSignals';
import { dashboardAlerts, quickActionsFor, recentActivity, recentAnnouncements } from './dashboardData';
import { ShortcutHub } from './ShortcutHub';

const avatarStorageKey = (profileId: string) => 'smart-classroom.avatar.' + profileId;

/** Role-aware home screen: everyone lands on the few things that actually need them today. */
export function DashboardPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const sync = useSyncStatus();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);
  const scheme = gradeSchemeFrom(snapshot.settings);

  const student = snapshot.students.find((item) => item.profileId === membership.profileId);
  const [localAvatarId, setLocalAvatarId] = useState(() => recall(avatarStorageKey(membership.profileId)));
  useEffect(() => {
    const refreshAvatar = () => setLocalAvatarId(recall(avatarStorageKey(membership.profileId)));
    refreshAvatar();
    window.addEventListener('smart-classroom:avatar-changed', refreshAvatar);
    return () => window.removeEventListener('smart-classroom:avatar-changed', refreshAvatar);
  }, [membership.profileId]);
  const studentName = student?.displayName ?? membership.displayName;
  const studentAvatarId = student?.avatarId ?? localAvatarId;
  const classId = (membership.role === 'student' && student
    ? classIdOfStudent(snapshot, student.id)
    : classes[0]?.id) ?? '';
  const classroom = classes.find((item) => item.id === classId);
  const roster = rosterFor(snapshot, classId);
  const canCreateWork = canManageAcademicItem(
    snapshot, membership.role, membership.profileId, classId,
    [...teacherOwnedSubjectIds(snapshot, membership.profileId, classId)][0] ?? null
  );

  const items = useMemo(() => calendarItemsFor(snapshot, {
    classIds: membership.role === 'admin' ? classes.map((item) => item.id) : [classId],
    studentId: student?.id ?? null,
    includeDrafts: membership.role !== 'student'
  }), [snapshot, classes, classId, student?.id, membership.role]);

  const gradebook = useMemo(() => buildGradebook({
    students: roster,
    works: snapshot.assignments.filter((work) => work.classId === classId),
    submissions: snapshot.submissions,
    tests: snapshot.tests.filter((test) => test.classId === classId),
    testScores: snapshot.testScores,
    weights: categoryWeightsFrom(snapshot.settings),
    scheme
  }), [roster, snapshot, classId, scheme]);

  /*
   * The snapshot arrives asynchronously from IndexedDB. Before this the page rendered its real
   * layout against empty arrays, so on a slow device the first paint was a dashboard confidently
   * reporting zero of everything — which is a different claim from "not loaded yet", and the one a
   * teacher acts on.
   */
  if (!snapshot.ready) {
    return (
      <>
        <PageHeader eyebrow="กำลังโหลด" title="กำลังโหลดข้อมูล" description="ดึงข้อมูลของโรงเรียนจากเครื่องนี้" />
        <div className="ui-stat-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((slot) => <div key={slot} className="ui-stat ui-stat-loading"><Skeleton lines={2} /></div>)}
        </div>
        <div className="dashboard-columns">
          <Card><Skeleton lines={5} /></Card>
          <Card><Skeleton lines={5} /></Card>
        </div>
      </>
    );
  }

  if (membership.role === 'student') {
    const mine = items.filter((item) => item.work.status === 'published');
    const todo = mine.filter((item) => ['upcoming', 'soon', 'urgent', 'revision_requested'].includes(item.state));
    const dueSoon = mine.filter((item) => ['soon', 'urgent'].includes(item.state));
    const overdue = mine.filter((item) => item.state === 'overdue');
    const graded = mine.filter((item) => item.state === 'graded');
    const myRow = student ? gradebook.find((row) => row.student.id === student.id) : undefined;

    return (
      <>
        <section className="hero-card">
          <div>
            <span className="ui-eyebrow">{classroom ? `${classroom.name} · ${classroom.gradeLevel}` : 'ห้องเรียนของฉัน'}</span>
            <span className="student-self-label">ข้อมูลส่วนตัวของฉัน</span>
            <h1>สวัสดี {studentName.split(' ')[0]} 👋</h1>
            <p>วันนี้มีงานที่ต้องทำ {todo.length} ชิ้น · การแจ้งเตือนใหม่ {student ? unreadCount(snapshot, student.id) : 0} รายการ</p>
            <LinkButton to="/profile" size="sm" variant="ghost">ปรับแต่ง Avatar</LinkButton>
          </div>
          <ProfileAvatar
            displayName={studentName}
            avatarId={studentAvatarId}
            avatarPhotoId={student?.avatarPhotoId ?? null}
            avatarIndex={student?.avatarIndex ?? 0}
            avatarConfig={student?.avatarConfig ?? null}
            size={116}
            animation="wave"
          />
        </section>

        <AlertStack alerts={dashboardAlerts(snapshot, sync, { overdue: overdue.length, role: 'student' })} />
        <QuickActions actions={quickActionsFor('student', false)} />

        <div className="ui-stat-grid">
          <Stat
            label="งานที่ต้องทำ" value={todo.length} hint="รวมงานที่ครูขอให้แก้ไข" tone="brand"
            icon={<Icon name="assignments" size={18} />}
          />
          <Stat
            label="ใกล้ส่ง" value={dueSoon.length} hint="ภายใน 24 ชั่วโมง" tone="warning"
            icon={<Icon name="calendar" size={18} />}
            {...(dueSoon.length > 0 ? { status: 'ควรทำวันนี้' } : {})}
          />
          <Stat
            label="เลยกำหนด" value={overdue.length} hint="รีบส่งให้ครูตรวจ"
            tone={overdue.length > 0 ? 'danger' : 'neutral'}
            icon={<Icon name="warning" size={18} />}
            status={overdue.length > 0 ? 'ต้องจัดการ' : 'ไม่มีค้าง'}
          />
          <Stat
            label="ตรวจแล้ว" value={graded.length}
            hint={myRow?.grade ? `เกรดรวม ${myRow.grade}` : 'ยังไม่มีเกรดรวม'} tone="success"
            icon={<Icon name="check" size={18} />}
          />
        </div>
        <SyncLine sync={sync} pending={snapshot.pendingSync} />

        <div className="dashboard-columns">
          <Card>
            <CardHeader title="สิ่งที่ต้องทำต่อไป" action={<LinkButton to="/assignments" size="sm" variant="ghost">ดูทั้งหมด</LinkButton>} />
            {todo.length === 0 && overdue.length === 0 ? (
              <EmptyState icon="🎉" title="ไม่มีงานค้าง" description="ทุกงานเรียบร้อยแล้ว" />
            ) : (
              <ul className="timeline">
                {[...overdue, ...todo].slice(0, 6).map((item) => {
                  const subject = subjectById(snapshot, item.work.subjectId);
                  const color = subject ? subjectColor(subject.colorIndex) : null;
                  return (
                    <li key={item.work.id}>
                      <span className="timeline-dot" style={color ? { background: color.solid } : undefined} />
                      <div>
                        <strong>{item.work.title}</strong>
                        <span>{subject?.name ?? 'ไม่ระบุวิชา'} · {item.dueAt ? timeRemainingLabel(item.dueAt) : 'ไม่กำหนดส่ง'}</span>
                      </div>
                      <Badge tone={workStateTone[item.state]}>{workStateLabels[item.state]}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="ผลการเรียนล่าสุด" action={<LinkButton to="/gradebook" size="sm" variant="ghost">สมุดเกรด</LinkButton>} />
            {!myRow || myRow.percentage === null ? (
              <EmptyState title="ยังไม่มีคะแนนเผยแพร่" description="คะแนนจะปรากฏเมื่อครูตรวจงานแล้ว" />
            ) : (
              <div className="subject-progress">
                {myRow.categories.filter((category) => category.percentage !== null).map((category) => (
                  <div key={category.category} className="subject-progress-row">
                    <span>{category.category === 'homework' ? 'การบ้าน' : category.category === 'project' ? 'โครงงาน' : category.category === 'test' ? 'สอบ' : category.category === 'activity' ? 'กิจกรรม' : 'งานที่มอบหมาย'}</span>
                    <ProgressBar value={category.percentage ?? 0} max={100} label={`${category.percentage}%`} />
                  </div>
                ))}
                <div className="grade-summary">
                  <strong>{myRow.percentage}%</strong>
                  <Badge tone="success">{myRow.grade}</Badge>
                </div>
              </div>
            )}
          </Card>
        </div>

        <AnnouncementCard
          announcements={recentAnnouncements(snapshot, [classId], student?.id ?? null)}
          action={<LinkButton to="/announcements" size="sm" variant="ghost">ดูทั้งหมด</LinkButton>}
        />
        <ShortcutHub role={membership.role} />
      </>
    );
  }

  if (membership.role === 'parent') {
    const children = consentedStudents(snapshot);
    return (
      <>
        <PageHeader eyebrow="ผู้ปกครอง" title="สรุปของบุตรหลาน" description="สรุปรายสัปดาห์เฉพาะบุตรหลานที่เชื่อมบัญชีและให้ความยินยอมแล้ว" />
        <AlertStack alerts={dashboardAlerts(snapshot, sync, { overdue: 0, role: 'parent' })} />
        <QuickActions actions={quickActionsFor('parent', false)} />
        {children.length === 0 ? (
          <Card><EmptyState title="ยังไม่มีบุตรหลานที่เชื่อมบัญชี" description="ติดต่อครูประจำชั้นเพื่อขอรหัสผูกบัญชี" /></Card>
        ) : (
          <div className="dashboard-columns">
            {children.map((child) => {
              const childClassId = classIdOfStudent(snapshot, child.id) ?? '';
              const childItems = calendarItemsFor(snapshot, { classIds: [childClassId], studentId: child.id });
              const week = childItems.filter((item) => item.work.publishedAt
                && Date.now() - Date.parse(item.work.publishedAt) < 7 * 24 * 3_600_000);
              const submitted = childItems.filter((item) => ['submitted', 'late', 'graded'].includes(item.state));
              const pending = childItems.filter((item) => ['upcoming', 'soon', 'urgent'].includes(item.state));
              const overdue = childItems.filter((item) => item.state === 'overdue');
              const attendance = attendanceDailySummary(snapshot, { studentId: child.id });
              return (
                <Card key={child.id}>
                  <CardHeader
                    title={
                      <span className="cell-person">
                        <ProfileAvatar displayName={child.displayName} avatarId={child.avatarId} avatarIndex={child.avatarIndex} size={36} />
                        {child.displayName}
                      </span>
                    }
                    description={`เข้าเรียน ${attendance.presentRate}%`}
                  />
                  <div className="ui-stat-grid">
                    <Stat label="งานใหม่สัปดาห์นี้" value={week.length} tone="brand" />
                    <Stat label="ส่งแล้ว" value={submitted.length} tone="success" />
                    <Stat label="งานค้าง" value={pending.length} tone="warning" />
                    <Stat label="เลยกำหนด" value={overdue.length} tone={overdue.length > 0 ? 'danger' : 'neutral'} />
                  </div>
                  {pending[0] && (
                    <p className="ui-field-hint">
                      งานถัดไป: {pending[0].work.title} · {pending[0].dueAt ? new Date(pending[0].dueAt).toLocaleString('th-TH') : 'ไม่กำหนด'}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <AnnouncementCard
          announcements={recentAnnouncements(
            snapshot,
            children.map((child) => classIdOfStudent(snapshot, child.id) ?? ''),
            null
          )}
          action={<LinkButton to="/announcements" size="sm" variant="ghost">ดูทั้งหมด</LinkButton>}
        />
        <SyncLine sync={sync} pending={snapshot.pendingSync} />
        <ShortcutHub role={membership.role} />
      </>
    );
  }

  // Teacher and admin
  const pendingReview = items.filter((item) => item.work.status === 'published').filter((item) =>
    snapshot.submissions.some((submission) =>
      submission.assignmentId === item.work.id && ['submitted', 'late', 'resubmitted'].includes(submission.status)));
  const overdueWork = items.filter((item) => item.state === 'overdue');
  const insights = followUpInsights(roster, snapshot.assignments.filter((work) => work.classId === classId), snapshot.submissions);
  const distribution = gradeDistribution(gradebook, scheme);
  const gradedCount = gradebook.filter((row) => row.percentage !== null).length;
  /* The audit stores a profile id; a name is what a person recognises. Unknown ids stay honest
     rather than being guessed at — a wrong name on an audit line is worse than no name. */
  const resolveActorName = (profileId: string): string =>
    snapshot.teachers.find((teacher) => teacher.profileId === profileId)?.displayName
      ?? (profileId === membership.profileId ? membership.displayName : 'บุคลากรของโรงเรียน');
  const todayAttendance = attendanceDailySummary(snapshot, membership.role === 'admin' ? {} : { classId });
  const averagePercentage = gradebook.filter((row) => row.percentage !== null).length > 0
    ? Math.round(gradebook.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / gradebook.filter((row) => row.percentage !== null).length)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow={membership.role === 'admin' ? 'ภาพรวมโรงเรียน' : classroom ? `${classroom.name} · ${classroom.gradeLevel}` : 'ห้องเรียนของฉัน'}
        title={`สวัสดี ${membership.displayName}`}
        description={membership.role === 'admin'
          ? `${classes.length} ห้องเรียน · ${subjects.length} รายวิชา · นักเรียน ${snapshot.students.length} คน`
          : 'สิ่งที่ต้องตัดสินใจวันนี้ อยู่ด้านบนสุด'}
        action={canCreateWork && <LinkButton to="/assignments" variant="primary">+ สร้างงาน</LinkButton>}
      />

      <AlertStack alerts={dashboardAlerts(snapshot, sync, { overdue: overdueWork.length, role: membership.role })} />
      <QuickActions actions={quickActionsFor(membership.role, canCreateWork)} />

      <div className="ui-stat-grid">
        <Stat
          label="นักเรียนทั้งหมด" value={membership.role === 'admin' ? snapshot.students.length : roster.length}
          {...(classroom ? { hint: `ความจุ ${classroom.capacity} คน` } : {})} tone="brand"
          icon={<Icon name="students" size={18} />}
        />
        <Stat
          label="มาเรียนวันนี้" value={`${todayAttendance.presentRate}%`}
          hint={`ขาด ${todayAttendance.absent} · สาย ${todayAttendance.late}`}
          tone={todayAttendance.presentRate >= 90 ? 'success' : todayAttendance.presentRate >= 75 ? 'warning' : 'danger'}
          icon={<Icon name="attendance" size={18} />}
        />
        <Stat
          label="งานรอตรวจ" value={pendingReview.length} hint="มีนักเรียนส่งแล้ว" tone="info"
          icon={<Icon name="assignments" size={18} />}
          {...(pendingReview.length > 0 ? { status: 'รอคุณครู' } : {})}
        />
        <Stat
          label="งานเลยกำหนด" value={overdueWork.length} hint="ยังมีนักเรียนไม่ส่ง"
          tone={overdueWork.length > 0 ? 'warning' : 'neutral'}
          icon={<Icon name="warning" size={18} />}
          status={overdueWork.length > 0 ? 'ควรติดตาม' : 'ตามทัน'}
        />
        <Stat
          label="คะแนนเฉลี่ยห้อง" value={`${averagePercentage}%`} hint="เฉพาะคะแนนที่เผยแพร่" tone="success"
          icon={<Icon name="scores" size={18} />}
        />
      </div>
      <SyncLine sync={sync} pending={snapshot.pendingSync} />

      <div className="dashboard-columns">
        <Card>
          <CardHeader title="กำหนดส่งที่กำลังจะถึง" action={<LinkButton to="/calendar" size="sm" variant="ghost">ปฏิทิน</LinkButton>} />
          {items.filter((item) => ['soon', 'urgent', 'upcoming'].includes(item.state)).length === 0 ? (
            <EmptyState icon="🎉" title="ไม่มีงานใกล้ครบกำหนด" description="ห้องนี้กำลังตามทัน" />
          ) : (
            <ul className="timeline">
              {items.filter((item) => ['soon', 'urgent', 'upcoming'].includes(item.state)).slice(0, 6).map((item) => {
                const subject = subjectById(snapshot, item.work.subjectId);
                const color = subject ? subjectColor(subject.colorIndex) : null;
                return (
                  <li key={item.work.id}>
                    <span className="timeline-dot" style={color ? { background: color.solid } : undefined} />
                    <div>
                      <strong>{item.work.title}</strong>
                      <span>{subject?.name ?? 'ไม่ระบุวิชา'} · {item.dueAt ? new Date(item.dueAt).toLocaleString('th-TH') : 'ไม่กำหนด'}</span>
                    </div>
                    <Badge tone={workStateTone[item.state]}>{workStateLabels[item.state]}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="นักเรียนที่ควรติดตาม" description="ข้อมูลประกอบการตัดสินใจ ไม่ใช่การตัดสินนักเรียน" />
          {insights.length === 0 ? (
            <EmptyState icon="✓" title="ทุกคนตามทัน" description="ยังไม่มีสัญญาณที่ต้องติดตามเป็นพิเศษ" />
          ) : (
            <ul className="insight-list">
              {insights.map((insight) => (
                <li key={insight.student.id}>
                  <ProfileAvatar
                    displayName={insight.student.displayName}
                    avatarId={insight.student.avatarId}
                    avatarIndex={insight.student.avatarIndex}
                    size={36}
                  />
                  <div>
                    <strong>{insight.student.displayName}</strong>
                    <span>
                      งานค้าง {insight.missingWork} · ส่งช้า {insight.lateSubmissions} · ยังไม่เปิด {insight.unopenedWork}
                      {insight.averageChange !== null && insight.averageChange < 0 && ` · คะแนนเฉลี่ยลดลง ${Math.abs(insight.averageChange)}%`}
                    </span>
                  </div>
                  <Badge tone="warning">ควรติดตาม</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="dashboard-columns">
        <AnnouncementCard
          announcements={recentAnnouncements(
            snapshot,
            membership.role === 'admin' ? classes.map((item) => item.id) : [classId],
            null
          )}
          action={<LinkButton to="/announcements" size="sm" variant="ghost">ดูทั้งหมด</LinkButton>}
        />
        <ActivityCard
          entries={recentActivity(snapshot)}
          resolveName={resolveActorName}
        />
      </div>

      <Card>
        <CardHeader
          title="การกระจายเกรด"
          {...(classroom ? { description: `${classroom.name} · คิดจากคะแนนที่เผยแพร่แล้ว` } : {})}
        />
        {gradedCount === 0 ? (
          <EmptyState
            icon={<Icon name="gradebook" size={28} />}
            title="ยังไม่มีคะแนนที่เผยแพร่"
            description="กราฟจะขึ้นเมื่อมีคะแนนอย่างน้อยหนึ่งรายการถูกเผยแพร่แล้ว"
          />
        ) : (
          <>
            {/*
              A bar chart of nine grades is read by people who cannot separate two hues, so every
              slice carries its grade and its share as text inside it, and the whole thing is also
              published as a table below for a screen reader. Colour is the fastest way in, never
              the only one.
            */}
            <div className="distribution-bar" role="img" aria-label={`การกระจายเกรดของนักเรียน ${gradedCount} คน`}>
              {distribution.map((entry) => (
                <div
                  key={entry.grade}
                  className={`distribution-slice grade-${entry.grade.replace('+', 'plus')}`}
                  style={{ flexGrow: Math.max(entry.count, 0.04) }}
                  title={`${entry.grade}: ${entry.count} คน (${entry.share}%)`}
                >
                  <strong>{entry.grade}</strong>
                  <span>{entry.share}%</span>
                </div>
              ))}
            </div>
            <ul className="distribution-legend">
              {distribution.filter((entry) => entry.count > 0).map((entry) => (
                <li key={entry.grade}>
                  <span className={`distribution-key grade-${entry.grade.replace('+', 'plus')}`} aria-hidden="true" />
                  <strong>{entry.grade}</strong>
                  <span>{entry.count} คน · {entry.share}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
        <ShortcutHub role={membership.role} />
    </>
  );
}
