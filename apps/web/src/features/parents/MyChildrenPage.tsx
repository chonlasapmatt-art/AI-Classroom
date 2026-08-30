import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { consentedStudents } from '../../data/selectors';
import { ChildLinkPanel } from './ChildLinkPanel';

/**
 * The parent's home for account management: which children are connected, which are still waiting
 * for a teacher, and the one field that adds another. Everything a connected child brings with them
 * — attendance, work, scores, calendar — appears on the ordinary screens once the link is active,
 * so this page deliberately does not duplicate any of it.
 */
export function MyChildrenPage() {
  const { mode } = useSession();
  const snapshot = useSchoolSnapshot();
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

      {connected.length > 0 && (
        <section className="panel data-panel">
          <div className="panel-heading"><h2>ข้อมูลที่เปิดให้แล้ว</h2></div>
          <ul className="record-list">
            {connected.map((student) => (
              <li key={student.id}>
                <div className="record-main">
                  <div>
                    <strong>{student.displayName}</strong>
                    <span>ดูงาน คะแนน การเข้าเรียน และปฏิทินได้จากเมนูด้านซ้าย</span>
                  </div>
                  <span className="status-chip success">เปิดข้อมูลแล้ว</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
