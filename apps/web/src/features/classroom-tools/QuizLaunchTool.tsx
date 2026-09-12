import { Link } from 'react-router-dom';
import { Badge, Card, CardHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import styles from './classroomTools.module.css';

/**
 * The two doors of a question round, which is the whole of this screen.
 *
 * A teacher arriving here wants one of exactly two things: to write the questions, or to run them.
 * Everything else about the round — the lobby, the countdown, the leaderboard — already exists
 * behind those two doors, so this does not rebuild any of it. What it fixes is that the two were in
 * different parts of the menu and neither said it was half of the same activity.
 *
 * The sets themselves live in the question bank, which is where every other question in the product
 * lives. A second store of saved rounds would be a second place to look for a question a teacher
 * wrote last term.
 */
export function QuizLaunchTool({ className }: { className: string }) {
  return (
    <div className={className}>
      <div className={styles.choiceGrid}>
        <Card>
          <CardHeader
            title="1 · สร้างชุดคำถาม"
            description="เขียนคำถามและตัวเลือก เก็บไว้ในคลังของวิชา ใช้ซ้ำได้ทุกห้องทุกเทอม"
          />
          <p className={styles.tileText}>
            คำถามที่สร้างไว้จะอยู่ในคลังข้อสอบ หยิบมาเปิดรอบเมื่อไรก็ได้ และใช้กับการสุ่มคำถามหน้าชั้นได้ด้วย
          </p>
          <Link className="ui-button ui-button-secondary ui-size-md" to="/question-bank">
            <Icon name="question-bank" size={16} />ไปที่คลังข้อสอบ
          </Link>
        </Card>

        <Card>
          <CardHeader
            title="2 · เริ่มเกมตอบคำถาม"
            description="เปิดรอบให้ทั้งห้องเข้าร่วมจากเครื่องของตัวเอง แล้วคุมจังหวะทีละข้อจากหน้าครู"
          />
          <p className={styles.tileText}>
            นักเรียนเข้าร่วมด้วยรหัสรอบ ตอบพร้อมกัน และเห็นอันดับหลังจบแต่ละข้อ
          </p>
          <Link className="ui-button ui-button-primary ui-size-md" to="/quiz">
            <Icon name="buzzer" size={16} />เปิดรอบตอบคำถาม
          </Link>
        </Card>
      </div>
      <p className={styles.tileText} style={{ marginTop: 'var(--space-3)' }}>
        <Badge tone="info">ทิป</Badge>{' '}
        เตรียมชุดคำถามไว้ก่อนคาบ แล้วคาบนั้นเหลือแค่กดเปิดรอบ — รอบที่เปิดค้างไว้จะปิดเองเมื่อจบคาบ
      </p>
    </div>
  );
}
