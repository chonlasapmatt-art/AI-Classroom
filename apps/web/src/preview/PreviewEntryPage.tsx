import { Link, Navigate, useNavigate } from 'react-router-dom';
import { isPreviewModeAvailable } from './previewMode';
import { Button } from '../ui/components';
import { BrandMark } from '../ui/BrandMark';

/**
 * A direct entrance; the existing environment gate still decides availability.
 *
 * ── Why this sends people away rather than refusing them ──
 * It used to render `ForbiddenPage`, which reads the signed-in role to say whose account this is.
 * But `/preview` is answered above every provider in `AppRoot` — before a session exists — so on a
 * deployment with preview mode switched off, `useSession` threw and the page rendered nothing at
 * all. A public URL that is a white screen.
 *
 * A redirect is also the truthful answer. Nobody is forbidden here: a school deployment simply does
 * not carry the demo data, and there is nothing at this address to be allowed into.
 */
export function PreviewEntryPage({ onEnter }: { onEnter: () => void }) {
  const navigate = useNavigate();
  if (!isPreviewModeAvailable) return <Navigate to="/welcome" replace />;
  return (
    <main className="admin-access-page">
      <section className="admin-access-card">
        <div className="brand-mark"><BrandMark size={44} /></div>
        <h1>โหมดตัวอย่าง</h1>
        <p>ข้อมูลในโหมดนี้เป็นข้อมูลสาธิตในหน่วยความจำ ไม่บันทึกลงโรงเรียนจริง และเริ่มใหม่เมื่อรีเฟรช</p>
        <Button onClick={() => { onEnter(); navigate('/', { replace: true }); }}>เข้าสู่โหมดตัวอย่าง</Button>
        <Link className="text-button" to="/welcome">กลับหน้า Home</Link>
      </section>
    </main>
  );
}
