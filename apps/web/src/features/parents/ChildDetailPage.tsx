// One child, as their guardian is entitled to see them.
//
// A parent could reach the portal, the timetable, achievements and announcements, and could not
// reach the four things they actually ask about: whether their child is at school, what is due,
// what is late, and how each subject is going. The screens that answer those were written for a
// teacher looking at a class, and the honest way to give a parent the answer was not to open those
// screens to a role they were not designed for — a class-shaped screen with a parent in it is one
// mistake away from showing somebody else's child.
//
// So this is a child-shaped screen. It starts from `consentedStudents`, which is the list of
// children this guardian has a confirmed, consented link to, and it can render nothing else: a
// student id typed into the address bar that is not on that list gets the same "not found" a
// deleted child would. The database refuses the same request for the same reason; this is the
// screen agreeing with it rather than the screen deciding it.
//
// What is shown is still gated by the school's own policy. `shareScoresWithParents` is the school's
// decision, not this component's, and when it is off the marks are absent rather than blurred.

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import {
  attendanceDailySummary, classIdOfStudent, consentedStudents, privacyPolicyFrom,
  scorePolicyFrom, subjectById, subjectResultsFor
} from '../../data/selectors';
import { calendarItemsFor } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone, type WorkState } from '../../academic/workStatus';
import {
  Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, ProgressBar, Segmented, Stat
} from '../../ui/components';
import { ProfileAvatar } from '../avatars/ProfileAvatar';

type ChildFilter = 'pending' | 'overdue' | 'done' | 'all';

const filters: Array<{ value: ChildFilter; label: string }> = [
  { value: 'pending', label: 'ยังไม่ส่ง' },
  { value: 'overdue', label: 'เลยกำหนด' },
  { value: 'done', label: 'ส่งแล้ว' },
  { value: 'all', label: 'ทั้งหมด' }
];

const doneStates = new Set<WorkState>(['submitted', 'late', 'graded']);
const pendingStates = new Set<WorkState>(['upcoming', 'soon', 'urgent', 'overdue', 'revision_requested']);

function dayLabel(value: string | null): string {
  return value
    ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : 'ไม่กำหนดส่ง';
}

export function ChildDetailPage() {
  const snapshot = useSchoolSnapshot();
  const { studentId = '' } = useParams<{ studentId: string }>();
  const [filter, setFilter] = useState<ChildFilter>('pending');

  const privacy = privacyPolicyFrom(snapshot.settings);
  // The only list this screen will render from. A child not on it does not exist here.
  const child = consentedStudents(snapshot).find((student) => student.id === studentId);
  const classId = child ? classIdOfStudent(snapshot, child.id) ?? '' : '';

  const items = useMemo(() => {
    if (!child || !classId) return [];
    // Drafts are the teacher's working copy and are not a parent's business until published.
    return calendarItemsFor(snapshot, { classIds: [classId], studentId: child.id, includeDrafts: false })
      .filter((item) => item.work.status === 'published' || item.work.status === 'closed');
  }, [snapshot, child, classId]);

  const attendance = useMemo(
    () => (child ? attendanceDailySummary(snapshot, { studentId: child.id }) : null),
    [snapshot, child]
  );

  const subjectResults = useMemo(() => {
    if (!child || !classId || !privacy.shareScoresWithParents) return [];
    return subjectResultsFor(snapshot, child.id, classId, scorePolicyFrom(snapshot.settings));
  }, [snapshot, child, classId, privacy.shareScoresWithParents]);

  const counts = useMemo(() => ({
    pending: items.filter((item) => pendingStates.has(item.state)).length,
    overdue: items.filter((item) => item.state === 'overdue').length,
    done: items.filter((item) => doneStates.has(item.state)).length
  }), [items]);

  const visible = useMemo(() => items.filter((item) => (
    filter === 'all'
    || (filter === 'pending' && pendingStates.has(item.state))
    || (filter === 'overdue' && item.state === 'overdue')
    || (filter === 'done' && doneStates.has(item.state))
  )), [items, filter]);

  if (!child) {
    return (
      <>
        <PageHeader
          eyebrow="Parent Portal"
          title="ไม่พบข้อมูลนักเรียนคนนี้"
          description="ผู้ปกครองเห็นได้เฉพาะลูกที่โรงเรียนยืนยันความสัมพันธ์และให้ความยินยอมแล้ว"
          action={<LinkButton to="/my-children" variant="ghost">กลับไปหน้าลูกของฉัน</LinkButton>}
        />
        <Card>
          <EmptyState
            title="ไม่อยู่ในขอบเขตของคุณ"
            description="ถ้าเพิ่งเพิ่มลูกไว้ ให้รอคุณครูยืนยันก่อน แล้วข้อมูลจะขึ้นที่นี่เอง"
          />
        </Card>
      </>
    );
  }

  const completion = items.length === 0 ? 0 : Math.round((counts.done / items.length) * 100);

  return (
    <>
      <PageHeader
        eyebrow="Parent Portal"
        title={child.displayName}
        description="สรุปการมาเรียน งานที่ต้องส่ง และผลรายวิชาของลูกในที่เดียว"
        action={<LinkButton to="/my-children" variant="ghost">ลูกคนอื่น</LinkButton>}
      />

      <Card>
        <div className="attendance-parent-hero">
          <div className="attendance-parent-profile">
            <ProfileAvatar
              displayName={child.displayName} avatarId={child.avatarId}
              avatarIndex={child.avatarIndex} avatarConfig={child.avatarConfig} size={72}
            />
            <div>
              <h2>{child.displayName}</h2>
              <p>เลขประจำตัว {child.studentCode}</p>
            </div>
          </div>
          {attendance && (
            <div className="attendance-day-summary">
              <strong>{attendance.presentRate}%</strong>
              <span>มาเรียน · ขาด {attendance.absent} วัน · สาย {attendance.late} วัน</span>
            </div>
          )}
        </div>
      </Card>

      <section className="ui-stat-grid" aria-label="สรุปงานของลูก">
        <Stat label="งานที่ยังไม่ส่ง" value={counts.pending} hint="รวมงานที่ยังไม่ถึงกำหนด" tone="warning" />
        <Stat label="เลยกำหนดแล้ว" value={counts.overdue} hint="ควรคุยกับลูกวันนี้" tone={counts.overdue > 0 ? 'danger' : 'success'} />
        <Stat label="ส่งแล้ว" value={counts.done} hint={`จากทั้งหมด ${items.length} งาน`} tone="success" />
        <Stat label="ความคืบหน้า" value={`${completion}%`} hint="สัดส่วนงานที่ส่งแล้ว" tone="brand" />
      </section>

      <Card>
        <CardHeader
          title="งานและกำหนดส่ง"
          description="เฉพาะงานที่คุณครูเผยแพร่แล้ว · งานร่างของครูจะไม่แสดงที่นี่"
          action={<Segmented options={filters} value={filter} onChange={setFilter} ariaLabel="กรองงาน" />}
        />
        {visible.length === 0 ? (
          <EmptyState
            title={filter === 'overdue' ? 'ไม่มีงานเลยกำหนด' : 'ไม่มีงานในหมวดนี้'}
            description={filter === 'overdue' ? 'ตอนนี้ลูกของคุณส่งงานทันทุกชิ้น' : 'ลองเปลี่ยนตัวกรองด้านบน'}
          />
        ) : (
          <ul className="attendance-readonly-list">
            {visible.map((item) => {
              const subject = subjectById(snapshot, item.work.subjectId);
              return (
                <li key={item.work.id}>
                  <article>
                    <div>
                      <strong>{item.work.title}</strong>
                      <span>
                        {subject?.name ?? 'ไม่ระบุวิชา'} · กำหนดส่ง {dayLabel(item.dueAt)}
                        {item.dueAt && ` · ${timeRemainingLabel(item.dueAt)}`}
                      </span>
                    </div>
                    <Badge tone={workStateTone[item.state]}>{workStateLabels[item.state]}</Badge>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="ผลรายวิชา"
          description={privacy.shareScoresWithParents
            ? 'คะแนนสะสมและเกรดของแต่ละวิชาตามที่โรงเรียนบันทึกไว้'
            : 'โรงเรียนตั้งค่าไม่แชร์คะแนนกับผู้ปกครอง'}
        />
        {!privacy.shareScoresWithParents ? (
          <EmptyState
            title="โรงเรียนปิดการแชร์คะแนน"
            description={`นโยบายความเป็นส่วนตัวเวอร์ชัน ${privacy.policyVersion} · ติดต่อคุณครูประจำชั้นหากต้องการทราบผล`}
          />
        ) : subjectResults.length === 0 ? (
          <EmptyState title="ยังไม่มีคะแนนในเทอมนี้" description="เมื่อคุณครูบันทึกคะแนน ผลจะขึ้นที่นี่" />
        ) : (
          <ul className="attendance-readonly-list">
            {subjectResults.map((result) => (
              <li key={result.subject.id}>
                <article>
                  <div>
                    <strong>{result.subject.name}</strong>
                    <span>บันทึกคะแนนแล้ว {result.itemCount} รายการ</span>
                    <ProgressBar value={result.total} max={100} tone="brand" label={`${result.total.toFixed(2)} / 100`} />
                  </div>
                  <Badge tone={result.total >= 50 ? 'success' : 'warning'}>เกรด {result.grade}</Badge>
                </article>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="ปฏิทินของลูก" description="กำหนดส่งงานเรียงตามวัน เพื่อวางแผนที่บ้านได้ล่วงหน้า" />
        {items.length === 0 ? (
          <EmptyState title="ยังไม่มีรายการในปฏิทิน" description="เมื่อคุณครูเผยแพร่งาน กำหนดส่งจะขึ้นที่นี่" />
        ) : (
          <ul className="attendance-readonly-list">
            {[...items]
              .filter((item) => item.dueAt !== null)
              .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
              .slice(0, 12)
              .map((item) => (
                <li key={`calendar-${item.work.id}`}>
                  <article>
                    <div>
                      <strong>{dayLabel(item.dueAt)}</strong>
                      <span>{item.work.title} · {subjectById(snapshot, item.work.subjectId)?.name ?? 'ไม่ระบุวิชา'}</span>
                    </div>
                    <Badge tone={workStateTone[item.state]}>{workStateLabels[item.state]}</Badge>
                  </article>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <p className="fine-print">
        ข้อมูลทั้งหมดในหน้านี้จำกัดอยู่ที่ลูกที่โรงเรียนยืนยันความสัมพันธ์แล้ว ตามนโยบายความเป็นส่วนตัวเวอร์ชัน {privacy.policyVersion}
        {' · '}<Link to="/settings">ดูการตั้งค่าความเป็นส่วนตัว</Link>
      </p>
    </>
  );
}
