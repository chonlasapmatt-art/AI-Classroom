import { Link, useNavigate } from 'react-router-dom';
import { isPreviewModeAvailable } from './previewMode';
import { Button } from '../ui/components';
import { ForbiddenPage } from '../features/errors/ForbiddenPage';

/** A direct entrance; the existing environment gate still decides availability. */
export function PreviewEntryPage({ onEnter }: { onEnter: () => void }) {
  const navigate = useNavigate();
  if (!isPreviewModeAvailable) return <ForbiddenPage />;
  return (
    <main className="admin-access-page">
      <section className="admin-access-card">
        <div className="brand-mark">SC</div>
        <h1>โหมดตัวอย่าง</h1>
        <p>ข้อมูลในโหมดนี้เป็นข้อมูลสาธิตในหน่วยความจำ ไม่บันทึกลงโรงเรียนจริง และเริ่มใหม่เมื่อรีเฟรช</p>
        <Button onClick={() => { onEnter(); navigate('/', { replace: true }); }}>เข้าสู่โหมดตัวอย่าง</Button>
        <Link className="text-button" to="/welcome">กลับหน้า Home</Link>
      </section>
    </main>
  );
}
