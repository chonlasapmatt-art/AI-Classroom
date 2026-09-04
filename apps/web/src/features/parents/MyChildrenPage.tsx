import { Link } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { attendanceDailySummary, classIdOfStudent, consentedStudents, privacyPolicyFrom, standingsFor } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { ChildLinkPanel } from './ChildLinkPanel';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';

/**
 * The parent's home: which children are connected, which are still waiting for a teacher, the one
 * field that adds another, and how each connected child is doing at a glance.
 *
 * There used to be two of these — `/parents` rendered its own copy of the same panel with its own
 * summary cards — so a guardian had two menu entries for one thing and a change had to be made
 * twice. `/parents` now sends a guardian here, and the summary that only lived there lives here.
 * Everything past the summary — attendance, work, scores, calendar — is on the ordinary screens.
 */
export function MyChildrenPage() {
  const { mode } = useSession();
  const snapshot = useSchoolSnapshot();
  const privacy = privacyPolicyFrom(snapshot.settings);
  const connected = consentedStudents(snapshot);

  return (
    <>
      <PageHeader
        eyebrow="สำหรับผู้ปกครอง"
        title="ลูกของฉัน"
        description="เพิ่มลูกด้วยชื่อจริงเท่านั้น ระบบจะเชื่อมข้อมูลให้เมื่อโรงเรียนยืนยันความสัมพันธ์"
      />

      {mode === 'preview' ? (
        <Card>
          <EmptyState
            icon={<Icon name="sync" size={28} />}
            title="โหมดตัวอย่างไม่ต่อกับเซิร์ฟเวอร์"
            description="การค้นหาและเชื่อมบัญชีลูกทำงานกับข้อมูลจริงเท่านั้น · เข้าสู่ระบบด้วยบัญชีผู้ปกครองจริงเพื่อใช้งาน"
          />
        </Card>
      ) : (
        <ChildLinkPanel />
      )}

      <Card>
        <CardHeader
          title="ข้อมูลที่เปิดให้แล้ว"
          description={`แสดงเฉพาะข้อมูลที่ได้รับความยินยอมตามนโยบายเวอร์ชัน ${privacy.policyVersion}`}
          action={<Badge tone={connected.length > 0 ? 'success' : 'neutral'}>{connected.length} คน</Badge>}
        />
        {connected.length === 0 ? (
          <EmptyState
            icon={<Icon name="children" size={28} />}
            title="ยังไม่มีการเชื่อมบัญชีที่ยินยอมแล้ว"
            description="เพิ่มลูกด้านบน แล้วรอคุณครูยืนยันความสัมพันธ์ · เมื่อยืนยันแล้วจะเห็นการเข้าเรียน งาน และคะแนนที่นี่"
          />
        ) : (
          <div className="student-grid">
            {connected.map((student) => {
              const classId = classIdOfStudent(snapshot, student.id) ?? '';
              const summary = attendanceDailySummary(snapshot, { studentId: student.id });
              const standing = standingsFor(snapshot, classId).find((entry) => entry.student.id === student.id);
              return (
                <Link key={student.id} to={`/my-children/${student.id}`} className="student-card child-card-link">
                  <ProfileAvatar displayName={student.displayName} avatarId={student.avatarId} avatarIndex={student.avatarIndex} avatarConfig={student.avatarConfig} size={64} />
                  <div>
                    <strong>{student.displayName}</strong>
                    <span>เข้าเรียน {summary.presentRate}% · ขาด {summary.absent} วัน</span>
                    <span>
                      {privacy.shareScoresWithParents && standing
                        ? `คะแนนรวม ${standing.total.toFixed(2)} · เกรด ${standing.grade}`
                        : 'โรงเรียนปิดการแชร์คะแนนกับผู้ปกครอง'}
                    </span>
                    <span className="child-card-more">ดูรายละเอียด</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
