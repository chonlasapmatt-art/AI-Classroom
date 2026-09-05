import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { recall } from '../../app/deviceMemory';
import { useTheme } from '../../app/ThemeContext';
import { themeModes, themePresets, type ThemeMode, type ThemePreset } from '../../app/theme';
import { Icon, type IconName } from '../../ui/Icon';

/**
 * The page somebody lands on before they are anybody.
 *
 * The three public doors are deliberately separate because each role uses different credentials.
 * Admin and platform operations remain private direct URLs and are not exposed from this screen.
 *
 * So this is a signpost rather than a marketing page. Everything on it is either a door or a fact
 * about this device — what the school is called, whether the network is reachable — and both of
 * those change what a refused sign-in means.
 */

interface Door { to: string; label: string; detail: string; icon: IconName }

const doors: Door[] = [
  { to: '/login?as=teacher', label: 'ครู', detail: 'ใช้ชื่อและรหัสครูที่โรงเรียนออกให้', icon: 'teachers' },
  { to: '/login?as=student', label: 'นักเรียน', detail: 'ใช้ชื่อและเลขประจำตัวนักเรียน', icon: 'students' },
  { to: '/login?as=parent', label: 'ผู้ปกครอง', detail: 'ใช้ชื่อและรหัสผ่านที่โรงเรียนสร้างให้', icon: 'parents' }
];

const promises: Array<{ icon: IconName; title: string; detail: string }> = [
  {
    icon: 'attendance', title: 'ครูเช็กชื่อได้ไวขึ้น',
    detail: 'เลือกห้องและวิชาแล้วบันทึก มา สาย ขาด หรือลาได้ในหน้าเดียว พร้อมดูภาพรวมรายวัน'
  },
  {
    icon: 'assignments', title: 'นักเรียนตามงานได้ทัน',
    detail: 'เห็นงาน วันครบกำหนด และสถานะการส่งของตัวเอง พร้อมส่งงานและรู้ทันทีว่าส่งตรงเวลาหรือล่าช้า'
  },
  {
    icon: 'reports', title: 'ข้อมูลต่อเนื่องและเป็นระบบ',
    detail: 'ประวัติเช็กชื่อ คะแนน งาน และรายงานเชื่อมกันในที่เดียว ลดงานซ้ำและช่วยให้ติดตามนักเรียนได้ง่ายขึ้น'
  },
  {
    icon: 'parents', title: 'ผู้ปกครองรับรู้ได้พอดี',
    detail: 'ดูสรุปของบุตรหลานที่เชื่อมไว้เท่านั้น โดยไม่มีสิทธิ์แก้ไขข้อมูลของโรงเรียน'
  }
];

export function WelcomePage() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [showTheme, setShowTheme] = useState(false);
  const { mode, preset, motion, setMode, setPreset, setMotion } = useTheme();
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
      <header className="welcome-nav" aria-label="ส่วนหัว Smart Classroom">
        <div className="welcome-brand">
          <div className="brand-mark small">SC</div>
          <div>
            <strong>Smart Classroom</strong>
            <span>ระบบจัดการห้องเรียน</span>
          </div>
        </div>
        <div className="welcome-nav-actions">
          <span className="welcome-nav-label">SCHOOL SPACE</span>
          <div className={`welcome-theme-picker ${showTheme ? 'open' : ''}`}>
            <button
              type="button"
              className="welcome-theme-trigger"
              aria-expanded={showTheme}
              aria-controls="welcome-theme-panel"
              onClick={() => setShowTheme((value) => !value)}
            >
              <Icon name="settings" size={16} />
              <span>ปรับธีม</span>
              <span aria-hidden="true">{showTheme ? '⌃' : '⌄'}</span>
            </button>
            {showTheme && (
              <div className="welcome-theme-panel" id="welcome-theme-panel">
                <div className="welcome-theme-heading">
                  <div><strong>สไตล์ของคุณ</strong><span>เปลี่ยนแล้วบันทึกอัตโนมัติ</span></div>
                  <span className="auth-live-dot" aria-hidden="true" />
                </div>
                <div className="welcome-theme-presets" aria-label="เลือกโทนสี">
                  {themePresets.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`welcome-theme-preset ${preset === item.value ? 'selected' : ''}`}
                      onClick={() => setPreset(item.value as ThemePreset)}
                      aria-label={`ใช้โทนสี ${item.label}`}
                      aria-pressed={preset === item.value}
                    >
                      <span className="welcome-theme-swatch" style={{ background: item.swatch }} aria-hidden="true" />
                      <span>{item.label}</span>
                      {preset === item.value && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="welcome-theme-controls">
                  <label>
                    <span>โหมดหน้าจอ</span>
                    <select value={mode} onChange={(event) => setMode(event.target.value as ThemeMode)}>
                      {themeModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={`welcome-motion-toggle ${motion === 'full' ? 'active' : ''}`}
                    onClick={() => setMotion(motion === 'full' ? 'reduced' : 'full')}
                    aria-pressed={motion === 'full'}
                  >
                    {motion === 'full' ? '✦ Motion เปิด' : '◍ Motion ลด'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      <section className="welcome-hero">
        <div className="welcome-hero-glow" aria-hidden="true" />
        <span className="ui-eyebrow">ระบบห้องเรียนของโรงเรียน</span>
        <h1>Smart Classroom</h1>
        <p>
          เช็กชื่อ มอบหมายงาน บันทึกคะแนน และสื่อสารกับผู้ปกครอง
          รวมไว้ในพื้นที่เดียวที่ทุกคนใช้งานได้อย่างสบายใจ
        </p>
        <div className="welcome-feature-row" aria-label="จุดเด่นของระบบ">
          <span><i aria-hidden="true">✦</i> ใช้งานง่าย</span>
          <span><i aria-hidden="true">↗</i> เชื่อมต่อทุกคน</span>
          <span><i aria-hidden="true">✓</i> ข้อมูลเป็นระบบ</span>
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

      <section className="welcome-body" aria-label="เมนูเริ่มใช้งาน">
        <div id="welcome-doors" className="welcome-doors">
          <div className="welcome-section-heading">
            <span className="welcome-section-number">01</span>
            <div>
              <h2>เลือกพื้นที่ของคุณ</h2>
              <p className="welcome-doors-hint">
                เลือกประเภทผู้ใช้งานเพื่อไปยังพื้นที่ของคุณได้ทันที
              </p>
            </div>
          </div>
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
          <div className="welcome-section-heading">
            <span className="welcome-section-number">02</span>
            <div>
              <h2>ทุกอย่างอยู่ในที่เดียว</h2>
              <p className="welcome-doors-hint">เครื่องมือสำคัญสำหรับโรงเรียนยุคใหม่</p>
            </div>
          </div>
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

      <footer className="welcome-bottom-note">
        <span className="welcome-bottom-dot" aria-hidden="true" />
        บัญชีผู้ใช้งานสร้างโดยแอดมินโรงเรียน · ข้อมูลของแต่ละคนจะแสดงตามสิทธิ์ที่ได้รับ
      </footer>

    </main>
  );
}
