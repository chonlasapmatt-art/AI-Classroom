import { useMemo } from 'react';
import { useSession } from '../app/SessionContext';
import { useSchoolSnapshot } from '../data/RepositoryContext';
import { activeClasses, activeSubjects } from '../data/selectors';
import { Badge, Card, CardHeader, LinkButton, PageHeader, Stat } from '../ui/components';

interface DemoRoute {
  path: string;
  label: string;
  description: string;
  roles: Array<'admin' | 'teacher' | 'student' | 'parent'>;
  tone: 'brand' | 'success' | 'warning' | 'info';
}

const demoRoutes: DemoRoute[] = [
  { path: '/', label: 'ภาพรวมและติดตามงาน', description: 'แดชบอร์ดตาม role, งานใกล้ส่ง, นักเรียนที่ควรติดตาม และสรุปผล', roles: ['admin', 'teacher', 'student', 'parent'], tone: 'brand' },
  { path: '/assignments', label: 'งานและกิจกรรม', description: 'สร้างงาน ส่งงาน ดูสถานะล่าช้า ขอแก้ไข และไฟล์แนบ', roles: ['admin', 'teacher', 'student'], tone: 'info' },
  { path: '/scores', label: 'คะแนนของฉัน / สมุดเกรด', description: 'นักเรียนเห็นเฉพาะคะแนนตัวเองและกดดูรายละเอียดรายวิชาได้', roles: ['admin', 'teacher', 'student'], tone: 'success' },
  { path: '/attendance', label: 'เช็กชื่อและติดตามนักเรียน', description: 'บันทึกมาเรียน สาย ขาด ลา และดูสัญญาณติดตาม', roles: ['admin', 'teacher'], tone: 'warning' },
  { path: '/question-bank', label: 'คลังข้อสอบ', description: 'เดโมจริงใน Preview: ชั้นปี → รายวิชา → Topic ย่อย → คำถามและเฉลย', roles: ['admin', 'teacher'], tone: 'brand' },
  { path: '/quiz', label: 'Quiz Challenge', description: 'ครูเปิดรอบ → สลับเป็นนักเรียนเข้าร่วม → ตอบ → กลับมาดูผล', roles: ['admin', 'teacher'], tone: 'info' },
  { path: '/exams', label: 'ข้อสอบและการตั้งเวลา', description: 'จัดชุดข้อสอบจากคลัง เปิดสอบ และดูการเข้าสอบ', roles: ['admin', 'teacher'], tone: 'warning' },
  { path: '/sit-exam', label: 'หน้าสอบของนักเรียน', description: 'ทดสอบตัวจับเวลา การบันทึกคำตอบ และการส่งข้อสอบ', roles: ['student'], tone: 'success' },
  { path: '/avatar-gallery', label: 'Avatar Gallery', description: 'ดูธีม avatar เสื้อผ้า สีผิว ทรงผม สัตว์ และ animation', roles: ['admin', 'teacher', 'student', 'parent'], tone: 'brand' },
  { path: '/profile', label: 'โปรไฟล์และ Avatar ของฉัน', description: 'ทุก role ปรับแต่ง Avatar และบันทึกข้ามหน้าได้', roles: ['admin', 'teacher', 'student', 'parent'], tone: 'success' },
  { path: '/parents', label: 'ผู้ปกครองและการเชื่อมบัญชี', description: 'ดูการเชื่อมบุตรหลานและสถานะ consent', roles: ['admin', 'teacher', 'parent'], tone: 'info' },
  { path: '/notifications', label: 'การแจ้งเตือน', description: 'นักเรียนดูการแจ้งเตือนงานและเปลี่ยนสถานะอ่านแล้ว', roles: ['student'], tone: 'warning' },
  { path: '/timetable', label: 'ตารางสอนและปฏิทิน', description: 'ข้อมูลห้องเรียน รายวิชา ครู และช่วงเวลาในเดโม', roles: ['admin', 'teacher', 'student', 'parent'], tone: 'brand' },
  { path: '/operations', label: 'Sync & Backup', description: 'ดูสุขภาพ local-first, พื้นที่จัดเก็บ และสถานะ Preview แบบปลอดภัย', roles: ['admin', 'teacher'], tone: 'warning' },
  { path: '/settings', label: 'ธีมและการตั้งค่า', description: 'สลับธีม ปรับการแสดงผล และตรวจสถานะระบบ', roles: ['admin', 'teacher'], tone: 'success' }
];

export function PreviewDemoPage() {
  const { membership, mode } = useSession();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);
  const routes = useMemo(
    () => demoRoutes.filter((route) => route.roles.includes(membership.role)),
    [membership.role]
  );

  return (
    <>
      <PageHeader
        eyebrow="Preview / Development Only"
        title="ศูนย์เดโมระบบ"
        description="รวมทางลัดสำหรับดูผลการพัฒนาทั้งหมดในข้อมูลจำลอง · ไม่เชื่อม Supabase และไม่ใช่ข้อมูลจริง"
        action={<Badge tone="warning" subtle={false}>กำลังดู: {membership.displayName}</Badge>}
      />

      <div className="preview-demo-banner">
        <div>
          <span className="ui-eyebrow">เริ่มทดสอบใน 3 ขั้นตอน</span>
          <h2>สลับบทบาทจากแถบด้านบน แล้วกดการ์ดที่ต้องการ</h2>
          <p>ข้อมูลเดโมถูกเตรียมไว้ให้เห็นภาพจริง และการแก้ไขใน Preview จะอยู่เฉพาะในแท็บนี้เท่านั้น</p>
        </div>
        <div className="preview-demo-steps" aria-label="ขั้นตอนทดสอบ">
          <span><b>1</b> เลือก role</span><span><b>2</b> เปิดเมนู</span><span><b>3</b> ทดลอง flow</span>
        </div>
      </div>

      <div className="ui-stat-grid">
        <Stat label="ห้องเรียนเดโม" value={classes.length} hint="พร้อมข้อมูลหลายห้อง" tone="brand" />
        <Stat label="รายวิชาเดโม" value={subjects.length} hint="ใช้ร่วมกับงานและคะแนน" tone="info" />
        <Stat label="นักเรียนเดโม" value={snapshot.students.length} hint="มีข้อมูลติดตามและ avatar" tone="success" />
        <Stat label="เส้นทางสำหรับ role นี้" value={routes.length} hint="กดเข้าไปทดสอบได้ทันที" tone="warning" />
      </div>

      <section className="preview-demo-grid" aria-label="ระบบที่พร้อมทดสอบ">
        {routes.map((route, index) => (
          <Card key={route.path} className="preview-demo-card">
            <div className="preview-demo-card-top">
              <span className={`preview-demo-index preview-demo-${route.tone}`}>{String(index + 1).padStart(2, '0')}</span>
              <Badge tone={route.tone}>เดโมพร้อมใช้</Badge>
            </div>
            <CardHeader title={route.label} description={route.description} />
            <LinkButton to={route.path} variant="primary" size="sm">เปิดเดโม →</LinkButton>
          </Card>
        ))}
      </section>

      <Card className="preview-demo-note">
        <CardHeader title="Flow ที่แนะนำให้ลอง" description="ทดสอบตามลำดับนี้จะเห็นการเชื่อมโยงของระบบชัดที่สุด" />
        <ol className="preview-demo-flow">
          <li><strong>ครู</strong> เปิด <LinkButton to="/assignments" size="sm" variant="ghost">งานและกิจกรรม</LinkButton> แล้วดูสถานะส่งงาน</li>
          <li><strong>ครู</strong> เปิด <LinkButton to="/quiz" size="sm" variant="ghost">Quiz Challenge</LinkButton> จากนั้นสลับ role เป็นนักเรียนเพื่อเข้าร่วมและตอบ</li>
          <li><strong>นักเรียน</strong> เปิด <LinkButton to="/scores" size="sm" variant="ghost">คะแนนของฉัน</LinkButton> แล้วกดรายวิชาเพื่อดูรายละเอียด</li>
          <li><strong>ทุก role</strong> เปิด <LinkButton to="/profile" size="sm" variant="ghost">โปรไฟล์</LinkButton> เพื่อเปลี่ยน Avatar และตรวจว่าบันทึกแล้ว</li>
        </ol>
        {mode !== 'preview' && <p className="field-hint">หน้านี้มีไว้สำหรับโหมดตัวอย่างเท่านั้น</p>}
      </Card>
    </>
  );
}
