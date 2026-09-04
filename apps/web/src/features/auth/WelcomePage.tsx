import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { recall } from '../../app/deviceMemory';
import { Icon, type IconName } from '../../ui/Icon';
import { isPreviewModeAvailable, enablePreviewMode } from '../../preview/previewMode';

/**
 * The page somebody lands on before they are anybody.
 *
 * This product has five doors and they are not interchangeable: a teacher signs in with a code the
 * school issued, a student with their number, a guardian with a password, a school administrator
 * through a separate entrance, and a platform operator through a different application entirely.
 * Sending all of them at one form and letting them work it out is how a parent ends up typing a
 * student number and being told, correctly and unhelpfully, that their password is wrong.
 *
 * So this is a signpost rather than a marketing page. Everything on it is either a door or a fact
 * about this device — what the school is called, whether the network is reachable — and both of
 * those change what a refused sign-in means.
 */

interface Door { to: string; label: string; detail: string; icon: IconName }

const doors: Door[] = [
  { to: '/login?as=teacher', label: 'ครู', detail: 'ใช้ชื่อและรหัสครูที่โรงเรียนออกให้', icon: 'teachers' },
  { to: '/login?as=student', label: 'นักเรียน', detail: 'ใช้ชื่อและเลขประจำตัวนักเรียน', icon: 'students' },
  { to: '/login?as=parent', label: 'ผู้ปกครอง', detail: 'ใช้ชื่อและรหัสผ่านที่แอดมินสร้างให้', icon: 'parents' },
  { to: '/admin-access', label: 'ผู้ดูแลโรงเรียน', detail: 'ทางเข้าสำหรับผู้ดูแลของโรงเรียน', icon: 'settings' }
];

const promises: Array<{ icon: IconName; title: string; detail: string }> = [
  {
    icon: 'sync', title: 'ใช้งานต่อได้แม้เน็ตหลุด',
    detail: 'เช็กชื่อและบันทึกคะแนนได้ทันที ข้อมูลเก็บไว้ในเครื่องและซิงก์ให้เองเมื่อกลับมาออนไลน์'
  },
  {
    icon: 'eye', title: 'เห็นเฉพาะสิ่งที่เป็นของตัวเอง',
    detail: 'นักเรียนเห็นงานของตัวเอง ผู้ปกครองเห็นเฉพาะบุตรหลานที่เชื่อมกับบัญชี สิทธิ์ตรวจจากเซิร์ฟเวอร์เสมอ'
  },
  {
    icon: 'dashboard', title: 'ทำงานได้ทั้งบนมือถือและกระดานหน้าชั้น',
    detail: 'ปุ่มและตัวอักษรปรับตามขนาดจอ ใช้นิ้วกดได้สะดวกบนแท็บเล็ตและจอสัมผัสขนาดใหญ่'
  }
];

export function WelcomePage() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const lastSchool = recall('last-school-name');

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <main className="welcome-page">
      <section className="welcome-hero">
        <div className="brand-mark small">SC</div>
        <span className="ui-eyebrow">ระบบห้องเรียนของโรงเรียน</span>
        <h1>Smart Classroom</h1>
        <p>
          เช็กชื่อ มอบหมายงาน บันทึกคะแนน และสื่อสารกับผู้ปกครอง ในที่เดียว
          ใช้งานได้ต่อเนื่องแม้อินเทอร์เน็ตในโรงเรียนสะดุด
        </p>
        <div className="welcome-hero-actions">
          <Link className="ui-button ui-button-primary ui-size-lg" to="/login">เข้าสู่ระบบ</Link>
          <a className="ui-button ui-button-ghost ui-size-lg" href="#welcome-doors">ฉันเป็นใคร?</a>
        </div>
        {/* What this device is pointed at, before anybody types anything. The school's name is on
            the building and the connection state is already in the phone's status bar; neither is a
            secret, and both explain a sign-in that is about to be refused. */}
        <div className="welcome-status" role="status">
          <span className={`sync-pill ${online ? 'online' : 'offline'}`}>
            <span />{online ? 'ออนไลน์' : 'ออฟไลน์ — เข้าสู่ระบบครั้งแรกต้องออนไลน์'}
          </span>
          {lastSchool && <span className="welcome-school">โรงเรียนล่าสุดบนเครื่องนี้ · {lastSchool}</span>}
        </div>
      </section>

      <section className="welcome-body">
        <div id="welcome-doors" className="welcome-doors">
          <h2>เลือกประเภทผู้ใช้งาน</h2>
          <p className="welcome-doors-hint">
            แต่ละกลุ่มใช้ข้อมูลเข้าสู่ระบบคนละแบบ เลือกให้ตรงกับบัญชีที่โรงเรียนสร้างให้คุณ
          </p>
          <div className="welcome-door-grid">
            {doors.map((door) => (
              <Link key={door.to} className="welcome-door" to={door.to}>
                <span className="welcome-door-icon" aria-hidden="true"><Icon name={door.icon} size={22} /></span>
                <span className="welcome-door-copy">
                  <strong>{door.label}</strong>
                  <span>{door.detail}</span>
                </span>
                <Icon name="chevron-right" size={18} />
              </Link>
            ))}
          </div>
          <p className="welcome-fine">
            ทุกบัญชีสร้างและกำหนดรหัสผ่านโดยแอดมินของโรงเรียน · ระบบนี้ไม่มีการสมัครสมาชิกด้วยตัวเอง
          </p>
        </div>

        <div className="welcome-promises">
          <h2>ระบบนี้ทำอะไรให้บ้าง</h2>
          <ul>
            {promises.map((promise) => (
              <li key={promise.title}>
                <span className="welcome-promise-icon" aria-hidden="true"><Icon name={promise.icon} size={20} /></span>
                <div>
                  <strong>{promise.title}</strong>
                  <span>{promise.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="welcome-footer">
        {/* The operations console is a different application with a different door. It is named
            rather than hidden — hiding it only means the operator types the URL from memory — and it
            sits last so nobody arriving here mistakes it for one of their choices. */}
        <a className="text-button" href="/platform/">เข้าสู่ Platform Console (ผู้ดูแลระบบส่วนกลาง)</a>
        {isPreviewModeAvailable && (
          <button
            type="button" className="text-button"
            onClick={() => { enablePreviewMode(); window.location.reload(); }}
          >
            เข้าสู่โหมด Preview (สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง)
          </button>
        )}
      </footer>
    </main>
  );
}
