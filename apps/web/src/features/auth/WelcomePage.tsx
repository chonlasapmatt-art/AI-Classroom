import {
  useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type MouseEvent, type PointerEvent
} from 'react';
import { Link } from 'react-router-dom';
import { recall } from '../../app/deviceMemory';
import { useAnimationAllowed, usePageTransition } from '../../app/motion';
import { Icon, type IconName } from '../../ui/Icon';
import { ThemePicker } from '../../ui/ThemePicker';

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

interface Door { to: string; label: string; detail: string; icon: IconName; role: string }

/*
 * Each door carries its own accent, and the order here is the order they are read in.
 *
 * Three identically coloured rows made the choice look like a list to work through rather than
 * three separate places, and a parent scanning for their own row had nothing to aim at but the
 * word. A colour per role gives the eye something to find before it reads anything, and the label
 * beside it still says which is which for anybody who cannot tell the accents apart.
 */
const doors: Door[] = [
  { to: '/login?as=teacher', label: 'ครู', detail: 'ใช้ชื่อและรหัสครูที่โรงเรียนออกให้', icon: 'teachers', role: 'teacher' },
  { to: '/login?as=student', label: 'นักเรียน', detail: 'ใช้ชื่อและเลขประจำตัวนักเรียน', icon: 'students', role: 'student' },
  { to: '/login?as=parent', label: 'ผู้ปกครอง', detail: 'ใช้ชื่อและรหัสผ่านที่โรงเรียนสร้างให้', icon: 'parents', role: 'parent' }
];

/* The glyphs here are drawn from the same SVG set as the rest of the product rather than typed as
   characters. A "✦" is whatever the device's font decides it is — a different weight on Android, a
   colour emoji on some phones, a missing box on a school desktop — and it cannot take the brand
   colour the way a stroked icon can. */
const highlights: Array<{ icon: IconName; label: string }> = [
  { icon: 'star', label: 'ใช้งานง่าย' },
  { icon: 'sync', label: 'เชื่อมต่อทุกคน' },
  { icon: 'check', label: 'ข้อมูลเป็นระบบ' }
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

/*
 * Where a piece starts before it travels to where it belongs.
 *
 * The index feeds the stagger and the offsets feed the direction, both as custom properties rather
 * than a class per position — a class per position is a near-identical rule to write again every
 * time a tile is added, and it puts the choreography in the stylesheet where the reading order
 * that motivates it is invisible.
 */
interface Entrance { x?: number; y?: number; rotate?: number; scale?: number }

const from = (index: number, { x = 0, y = 24, rotate = 0, scale = 0.94 }: Entrance = {}) => ({
  '--i': index, '--from-x': `${x}px`, '--from-y': `${y}px`,
  '--from-rotate': `${rotate}deg`, '--from-scale': scale
}) as CSSProperties;

/*
 * Doors converge: the outer two come in from their own side of the screen and the middle one rises
 * between them, with a tilt that straightens as they land. Three tiles sliding up in parallel are
 * three tiles; three tiles closing on a row are an arrangement.
 */
const doorEntrance = (index: number) => from(index, {
  x: (index - 1) * 76, y: index === 1 ? 64 : 24, rotate: (index - 1) * 3
});

/* The four promises drop in from the four corners they will occupy. */
const promiseEntrance = (index: number) => from(index, {
  x: index % 2 === 0 ? -58 : 58, y: index < 2 ? -30 : 44, rotate: index % 2 === 0 ? -2.5 : 2.5
});

/*
 * How long the page waits before it starts moving.
 *
 * On the first load the boot splash is still covering the screen, and a performance nobody can see
 * is a performance that has already finished by the time they can. Coming back to Home later —
 * from a sign-in form, say — there is nothing covering anything, and making somebody watch the
 * furniture arrive a second time is just a delay.
 */
let booted = false;

function useEntranceDelay() {
  const [delay] = useState(() => (booted ? 0 : 820));
  useEffect(() => { booted = true; }, []);
  return delay;
}

/**
 * Reveals each marked element as it comes into view, once.
 *
 * The hidden starting state lives behind the data-animate flag this sets, and the flag is only set
 * once the observer is actually watching. A browser without IntersectionObserver, a page whose
 * script failed, a person who asked for less motion: in every one of those the attribute is absent,
 * the hidden state never applies, and the page is simply the page. Content that can be hidden by a
 * script that did not run is content that can be lost.
 *
 * It is a layout effect so the flag lands before the first paint; in an ordinary effect the tiles
 * would be painted, hidden, then animated back in, which reads as a flicker.
 */
function useReveal(enabled: boolean) {
  const scope = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = scope.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!enabled || typeof IntersectionObserver === 'undefined') {
      for (const target of targets) target.classList.add('is-revealed');
      return;
    }

    root.dataset.animate = 'on';
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        // Once revealed it stays revealed. A tile that fades out again on the way back up turns a
        // scroll into a slideshow nobody asked for.
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    for (const target of targets) observer.observe(target);
    return () => {
      observer.disconnect();
      delete root.dataset.animate;
    };
  }, [enabled]);

  return scope;
}

export function WelcomePage() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const lastSchool = recall('last-school-name');
  const animated = useAnimationAllowed();
  const page = useReveal(animated);
  const transitionTo = usePageTransition(animated);
  const startDelay = useEntranceDelay();

  /*
   * The light under the cursor on a door tile.
   *
   * Bounded to the tile the pointer is actually over, and to pointers that have a position at all —
   * a finger does not hover, and on a touch screen this would only fire on the way to a tap that is
   * about to leave the page anyway. Two custom properties, no layout read per frame beyond the one
   * rect, and nothing keeps running once the pointer leaves.
   */
  function trackPointer(event: PointerEvent<HTMLElement>) {
    if (!animated || event.pointerType !== 'mouse') return;
    const tile = event.currentTarget;
    const bounds = tile.getBoundingClientRect();
    tile.style.setProperty('--px', `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
    tile.style.setProperty('--py', `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
  }

  function releasePointer(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.removeProperty('--px');
    event.currentTarget.style.removeProperty('--py');
  }

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
    <main className="welcome-page" ref={page} style={{ '--start': `${startDelay}ms` } as CSSProperties}>
      {/* The header parts come in from the edges they sit against. */}
      <header className="welcome-nav" aria-label="ส่วนหัว Smart Classroom">
        <div className="welcome-brand" data-reveal style={from(0, { x: -40, y: -14, scale: 0.96 })}>
          <div className="brand-mark small">SC</div>
          <div>
            <strong>Smart Classroom</strong>
            <span>ระบบจัดการห้องเรียน</span>
          </div>
        </div>
        <div className="welcome-nav-actions" data-reveal style={from(0, { x: 40, y: -14, scale: 0.96 })}>
          <span className="welcome-nav-label">SCHOOL SPACE</span>
          <ThemePicker />
        </div>
      </header>

      <section className="welcome-hero">
        <div className="welcome-hero-glow" aria-hidden="true" />
        <span className="welcome-eyebrow" data-reveal style={from(0, { y: -26, scale: 0.9 })}>
          <span className="welcome-eyebrow-dot" aria-hidden="true" />
          ระบบห้องเรียนของโรงเรียน
        </span>
        {/* The heading stays exactly the product's name. It is the one thing on this page somebody
            can check against the letter the school sent home, and a cleverer line costs that. */}
        <h1 data-reveal style={from(1, { y: 34 })}><span className="welcome-wordmark">Smart Classroom</span></h1>
        <p data-reveal style={from(2, { y: 28 })}>
          เช็กชื่อ มอบหมายงาน บันทึกคะแนน และสื่อสารกับผู้ปกครอง
          รวมไว้ในพื้นที่เดียวที่ทุกคนใช้งานได้อย่างสบายใจ
        </p>
        <div className="welcome-feature-row" aria-label="จุดเด่นของระบบ" data-reveal style={from(3, { y: 26 })}>
          {highlights.map((item, index) => (
            <span key={item.label} style={from(index)}><Icon name={item.icon} size={14} /> {item.label}</span>
          ))}
        </div>
        {/* What this device is pointed at, before anybody types anything. The school's name is on
            the building and the connection state is already in the phone's status bar; neither is a
            secret, and both explain a sign-in that is about to be refused. */}
        <div className="welcome-status" role="status" data-reveal style={from(4, { y: 30 })}>
          <span className={`sync-pill ${online ? 'online' : 'offline'}`}>
            <span />{online ? 'ออนไลน์' : 'ออฟไลน์ — เข้าสู่ระบบครั้งแรกต้องออนไลน์'}
          </span>
          {lastSchool && <span className="welcome-school">โรงเรียนล่าสุดบนเครื่องนี้ · {lastSchool}</span>}
        </div>
      </section>

      <section className="welcome-body" aria-label="เมนูเริ่มใช้งาน">
        <div id="welcome-doors" className="welcome-doors">
          <div className="welcome-section-heading" data-reveal>
            <span className="welcome-section-number">01</span>
            <div>
              <h2>เลือกพื้นที่ของคุณ</h2>
              <p className="welcome-doors-hint">
                เลือกประเภทผู้ใช้งานเพื่อไปยังพื้นที่ของคุณได้ทันที
              </p>
            </div>
          </div>
          <div className="welcome-door-grid">
            {doors.map((door, index) => (
              <Link
                key={door.to}
                className="welcome-door"
                data-role={door.role}
                data-reveal
                style={doorEntrance(index)}
                to={door.to}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => transitionTo(event, door.to)}
                onPointerMove={trackPointer}
                onPointerLeave={releasePointer}
              >
                <span className="welcome-door-icon" aria-hidden="true"><Icon name={door.icon} size={22} /></span>
                <span className="welcome-door-copy">
                  <strong>{door.label}</strong>
                  <span>{door.detail}</span>
                </span>
                <span className="welcome-door-go">
                  เข้าสู่ระบบ
                  <Icon name="chevron-right" size={16} />
                </span>
              </Link>
            ))}
          </div>
          <p className="welcome-fine">
            ทุกบัญชีสร้างและกำหนดรหัสผ่านโดยแอดมินของโรงเรียน · ระบบนี้ไม่มีการสมัครสมาชิกด้วยตัวเอง
          </p>
        </div>

        <div className="welcome-promises">
          <div className="welcome-section-heading" data-reveal>
            <span className="welcome-section-number">02</span>
            <div>
              <h2>ทุกอย่างอยู่ในที่เดียว</h2>
              <p className="welcome-doors-hint">เครื่องมือสำคัญสำหรับโรงเรียนยุคใหม่</p>
            </div>
          </div>
          <ul>
            {promises.map((promise, index) => (
              <li key={promise.title} data-reveal style={promiseEntrance(index)}>
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

      <footer className="welcome-bottom-note" data-reveal>
        <span className="welcome-bottom-dot" aria-hidden="true" />
        บัญชีผู้ใช้งานสร้างโดยแอดมินโรงเรียน · ข้อมูลของแต่ละคนจะแสดงตามสิทธิ์ที่ได้รับ
      </footer>

    </main>
  );
}
