import { Link } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { attendanceDailySummary, classIdOfStudent, consentedStudents, privacyPolicyFrom, standingsFor } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { ChildLinkPanel } from './ChildLinkPanel';

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
      <section className="page-heading">
        <div>
          <span className="eyebrow">Parent Portal</span>
          <h1>ลูกของฉัน</h1>
          <p>เพิ่มลูกด้วยชื่อจริงเท่านั้น ระบบจะเชื่อมข้อมูลให้เมื่อโรงเรียนยืนยันความสัมพันธ์</p>
        </div>
      </section>

      {mode === 'preview' ? (
        <section className="panel data-panel">
          <div className="empty-state">
            <span>♧</span>
            <h3>โหมด Preview ไม่ต่อกับเซิร์ฟเวอร์</h3>
            <p>การค้นหาและเชื่อมบัญชีลูกทำงานกับข้อมูลจริงเท่านั้น</p>
          </div>
        </section>
      ) : (
        <ChildLinkPanel />
      )}

      <section className="panel data-panel">
        <div className="panel-heading">
          <h2>ข้อมูลที่เปิดให้แล้ว</h2>
          <p>แสดงเฉพาะข้อมูลที่ได้รับความยินยอมตามนโยบายเวอร์ชัน {privacy.policyVersion}</p>
        </div>
        {connected.length === 0 ? (
          <div className="empty-state">
            <span>♧</span>
            <h3>ยังไม่มีการเชื่อมบัญชีที่ยินยอมแล้ว</h3>
            <p>เพิ่มลูกด้านบน แล้วรอคุณครูยืนยันความสัมพันธ์</p>
          </div>
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
      </section>
    </>
  );
}
