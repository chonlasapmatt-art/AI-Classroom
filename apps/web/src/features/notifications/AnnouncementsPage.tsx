import { useMemo } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { consentedStudents } from '../../data/selectors';
import { Badge, Card, EmptyState, PageHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';

/** Shared announcement inbox for the school. Parents only receive announcements for linked children. */
export function AnnouncementsPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const announcements = useMemo(() => {
    if (membership.role !== 'parent') return snapshot.announcements;
    const children = consentedStudents(snapshot);
    const childIds = new Set(children.map((child) => child.id));
    const classIds = new Set(snapshot.enrollments
      .filter((enrollment) => enrollment.status === 'active' && childIds.has(enrollment.studentId))
      .map((enrollment) => enrollment.classId));
    return snapshot.announcements.filter((announcement) =>
      classIds.has(announcement.classId)
      && (announcement.studentIds.length === 0 || announcement.studentIds.some((studentId) => childIds.has(studentId)))
    );
  }, [membership.role, snapshot]);
  const classes = useMemo(() => new Map(snapshot.classes.map((classroom) => [classroom.id, classroom.name])), [snapshot.classes]);

  return (
    <>
      <PageHeader
        eyebrow="การสื่อสาร"
        title="ประกาศรวม"
        description={membership.role === 'parent'
          ? 'ข่าวสารจากครูของห้องเรียนบุตรหลานที่เชื่อมบัญชีและได้รับความยินยอมแล้ว'
          : 'ประกาศจากครูและโรงเรียนในห้องเรียนที่คุณมีสิทธิ์ดู'}
      />
      {announcements.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="announcements" size={28} />}
            title="ยังไม่มีประกาศ"
            description="เมื่อครูส่งข่าวสาร ประกาศจะแสดงที่หน้านี้"
          />
        </Card>
      ) : (
        <div className="announcement-list">
          {announcements
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((announcement) => (
              <Card key={announcement.id} as="article" className="announcement-card">
                <div className="announcement-card-head">
                  <div>
                    <span className="ui-eyebrow">ประกาศจากครู</span>
                    <h2>{announcement.title}</h2>
                  </div>
                  <Badge tone="info">{classes.get(announcement.classId) ?? 'ห้องเรียน'}</Badge>
                </div>
                {announcement.body && <p>{announcement.body}</p>}
                <span className="notification-meta">
                  {new Date(announcement.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                  {announcement.studentIds.length > 0 ? ' · เฉพาะนักเรียนที่เลือก' : ' · ทั้งห้องเรียน'}
                </span>
              </Card>
            ))}
        </div>
      )}
    </>
  );
}
