import { useEffect, useMemo, type CSSProperties } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { subjectById } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';
import { notificationBucketLabels, notificationEntries, type NotificationBucket } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone } from '../../academic/workStatus';
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader } from '../../ui/components';
import { useToast } from '../../ui/toastContext';
import { Icon } from '../../ui/Icon';

const order: NotificationBucket[] = ['today', 'due-soon', 'upcoming', 'overdue', 'done'];

/** The student's notification centre: what needs attention now, then what is coming. */
export function NotificationCenterPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();

  const student = snapshot.students.find((item) => item.profileId === membership.profileId);

  // Reminders whose time has come move into the centre as soon as the page is open.
  useEffect(() => { void repository.deliverDueReminders(); }, [repository, snapshot.notifications.length]);

  const entries = useMemo(
    () => (student ? notificationEntries(snapshot, student.id) : []),
    [snapshot, student]
  );
  const unread = entries.filter((entry) => !entry.notification.readAt).length;

  if (!student) {
    return (
      <>
        <PageHeader eyebrow="การแจ้งเตือน" title="การแจ้งเตือน" />
        <Card>
          <EmptyState title="บัญชีนี้ไม่มีการแจ้งเตือนของนักเรียน" description="ศูนย์การแจ้งเตือนใช้กับบัญชีนักเรียน" />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="การแจ้งเตือน"
        title={unread > 0 ? `การแจ้งเตือน (${unread} ใหม่)` : 'การแจ้งเตือน'}
        description="งานใหม่ การเตือนใกล้กำหนด การเปลี่ยนกำหนดส่ง และผลการตรวจงาน"
        action={unread > 0 && (
          <Button
            variant="secondary"
            onClick={() => void repository.markAllNotificationsRead(student.id).then(() => toast('ทำเครื่องหมายอ่านทั้งหมดแล้ว'))}
          >
            อ่านทั้งหมด
          </Button>
        )}
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={<Icon name="achievements" size={28} />} title="ไม่มีการแจ้งเตือน" description="เมื่อครูมอบหมายงานหรือส่งงานคืน จะแจ้งที่นี่" />
        </Card>
      ) : (
        <div className="notification-sections">
          {order.map((bucket) => {
            const group = entries.filter((entry) => entry.bucket === bucket);
            if (group.length === 0) return null;
            return (
              <section key={bucket} className="notification-section">
                <header className="notification-section-head">
                  <h2>{notificationBucketLabels[bucket]}</h2>
                  <Badge tone={bucket === 'overdue' ? 'danger' : bucket === 'due-soon' ? 'warning' : 'neutral'}>
                    {group.length}
                  </Badge>
                </header>

                {group.map((entry) => {
                  const subject = entry.work ? subjectById(snapshot, entry.work.subjectId) : null;
                  const color = subject ? subjectColor(subject.colorIndex) : null;
                  return (
                    <Card
                      key={entry.notification.id}
                      as="article"
                      className={`notification-card ${entry.notification.readAt ? '' : 'unread'}`.trim()}
                    >
                      <div className="notification-body">
                        <div
                          className={`notification-icon ${color ? 'subject-tint' : ''}`.trim()}
                          style={color ? ({ '--subject-color': color.solid } as CSSProperties) : undefined}
                        >
                          {subject ? <SubjectIcon iconKey={subject.iconKey} size={20} /> : <Icon name="bell" size={20} />}
                        </div>
                        <div>
                          <div className="notification-title">
                            <strong>{entry.notification.title}</strong>
                            {entry.state && <Badge tone={workStateTone[entry.state]}>{workStateLabels[entry.state]}</Badge>}
                          </div>
                          <p>{entry.notification.body}</p>
                          <span className="notification-meta">
                            {subject?.name ?? 'ประกาศห้องเรียน'}
                            {entry.dueAt && ` · ${timeRemainingLabel(entry.dueAt)}`}
                            {entry.notification.sentAt && ` · ${new Date(entry.notification.sentAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`}
                          </span>
                        </div>
                      </div>
                      <div className="notification-actions">
                        {entry.work && <LinkButton to="/assignments" size="sm" variant="secondary">ดูงาน</LinkButton>}
                        {!entry.notification.readAt && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => void repository.markNotificationRead(entry.notification.id)}
                          >
                            อ่านแล้ว
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

    </>
  );
}
