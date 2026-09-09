import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { isRouteAllowed } from '../../src/layouts/navigation';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

describe('the highlight behind the current menu row', () => {
  it('is one travelling element rather than a background on each row', async () => {
    renderApp('/');
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'เมนูหลัก' })).toBeInTheDocument());
    const menu = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    // One marker for the whole menu: two would mean a row had started painting its own again.
    expect(menu.querySelectorAll('.sidebar-marker')).toHaveLength(1);
    // And it is scenery — nothing for a screen reader to read or a keyboard to land on.
    expect(menu.querySelector('.sidebar-marker')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('the school noticeboard', () => {
  it('belongs to the administrator and to nobody else', () => {
    // "ประกาศรวม" is every announcement in the school, for every class and every audience. What a
    // teacher, a student or a guardian should see is the news for their own rooms, which reaches
    // them on the dashboard, in the notification centre and on the class screens.
    expect(isRouteAllowed('admin', '/announcements')).toBe(true);
    for (const role of ['teacher', 'student', 'parent'] as const) {
      expect(isRouteAllowed(role, '/announcements')).toBe(false);
    }
  });
});

function renderApp(path = '/') {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

const mainMenu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
/** The page itself. Menu labels repeat the page names, so a query has to say which it means. */
const page = () => within(screen.getByRole('main'));

async function switchRole(membershipId: string) {
  fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: membershipId } });
}

/** Section headings are the top level of the menu; the entries live under them. */
function sectionNames(): string[] {
  return [...screen.getByRole('navigation', { name: 'เมนูหลัก' })
    .querySelectorAll('.sidebar-section-toggle span:first-child')]
    .map((node) => node.textContent ?? '');
}

/**
 * The menu, per role.
 *
 * What is held here is the shape rather than the exact wording: a small number of sections, named
 * for what that person came to do, with nothing they could reach before now unreachable. The
 * previous menu was one list filtered four ways, which gave a guardian section headings written for
 * an administrator.
 */
describe('the menu each role gets', () => {
  it('keeps a teacher inside a handful of sections named for their day', async () => {
    renderApp();
    await switchRole('preview-teacher');
    await waitFor(() => expect(sectionNames()).toContain('สอนวันนี้'));
    const sections = sectionNames();
    expect(sections.length).toBeLessThanOrEqual(9);
    // Taking the register is inside the lesson now, so the teacher's day is one section fewer.
    for (const label of ['วันนี้', 'สอนวันนี้', 'งานและคะแนน', 'นักเรียน', 'รายงาน']) {
      expect(sections).toContain(label);
    }
  });

  it('gives a student their own sections and none of the staff ones', async () => {
    renderApp();
    await switchRole('preview-student');
    await waitFor(() => expect(sectionNames()).toContain('งานของฉัน'));
    const sections = sectionNames();
    expect(sections.length).toBeLessThanOrEqual(8);
    expect(sections).toContain('ห้องเรียนของฉัน');
    // Lessons live under the subject now, so a student's menu has a way into them.
    expect(mainMenu().getByRole('link', { name: /รายวิชาและบทเรียน/ })).toBeInTheDocument();
    expect(sections).not.toContain('เช็กชื่อ');
    expect(mainMenu().queryByRole('link', { name: /แก้ไขคะแนน/ })).not.toBeInTheDocument();
  });

  it('gives a guardian sections about their child rather than about the school', async () => {
    renderApp();
    await switchRole('preview-parent');
    await waitFor(() => expect(sectionNames()).toContain('ลูกของฉัน'));
    expect(sectionNames()).toContain('การเข้าเรียน');
    expect(mainMenu().queryByRole('link', { name: /คลังข้อสอบ/ })).not.toBeInTheDocument();
  });

  it('lets somebody type the name of a screen instead of opening sections', async () => {
    renderApp();
    const search = await screen.findByLabelText('ค้นหาเมนู');
    fireEvent.change(search, { target: { value: 'เช็กชื่อ' } });
    await waitFor(() => expect(mainMenu().getByRole('link', { name: /เช็กชื่อ/ })).toBeInTheDocument());
    expect(mainMenu().queryByRole('link', { name: /คลังข้อสอบ/ })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'ไม่มีเมนูนี้' } });
    await waitFor(() => expect(screen.getByText(/ไม่พบเมนูที่ตรงกับ/)).toBeInTheDocument());
  });
});

/**
 * The inbox, and who it is for.
 *
 * It says what named children did in the last few hours, which makes it a staff-room noticeboard:
 * a teacher gets their own rooms, an administrator gets the school without being nudged about it,
 * and the two roles it is about are refused it by address as well as by menu.
 */
describe('the staff-room inbox behind /reports', () => {
  it('gives a teacher the last few hours of their own rooms', async () => {
    renderApp('/reports');
    await switchRole('preview-teacher');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายงานความเคลื่อนไหว'));
    expect(page().getByText(/เห็นเฉพาะห้องและรายวิชาที่คุณรับผิดชอบ/)).toBeInTheDocument();
  });

  it('lets an administrator read the same inbox, said to be without notifications', async () => {
    renderApp('/reports');
    await switchRole('preview-admin');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายงานความเคลื่อนไหว'));
    expect(page().getByText(/ไม่มีการแจ้งเตือนเด้งขึ้นมา/)).toBeInTheDocument();
  });

  // The inbox names children and says what they did, so it is staff-only by address as well as by
  // menu: a student or a guardian who types /reports is refused rather than shown an empty box.
  it.each(['preview-student', 'preview-parent'])('refuses %s by address, not only by menu', async (membershipId) => {
    renderApp('/reports');
    await switchRole(membershipId);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('หน้านี้ไม่ได้เปิดให้บทบาทของคุณ'));
  });
});

/**
 * Sync, for a teacher.
 *
 * "Did my register actually reach the server?" is a teacher's question, and sending them to find an
 * admin to ask it is how a school re-enters a register. The answer and a manual sync are theirs;
 * restoring a backup is not.
 */
describe('what a teacher sees under Sync', () => {
  it('shows the queue and a manual sync without the restore controls', async () => {
    renderApp('/operations');
    await switchRole('preview-teacher');
    await waitFor(() => expect(page().getByText('สถานะข้อมูลของคุณ')).toBeInTheDocument());
    expect(page().getByText('รอส่งขึ้นเซิร์ฟเวอร์')).toBeInTheDocument();
    expect(page().getByRole('button', { name: /ซิงก์ตอนนี้|ใช้ไม่ได้ในโหมดตัวอย่าง/ })).toBeInTheDocument();
    expect(screen.queryByText('กู้คืนจากไฟล์สำรอง')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ล้างแล้วกู้คืนทั้งหมด' })).not.toBeInTheDocument();
    // A teacher may read the queue; sealing or rewriting the school's local database is not theirs.
    expect(screen.queryByRole('button', { name: /สร้างไฟล์สำรอง/ })).not.toBeInTheDocument();
  });

  it('keeps the full panel for an admin', async () => {
    renderApp('/operations');
    await switchRole('preview-admin');
    await waitFor(() => expect(screen.getByText('กู้คืนจากไฟล์สำรอง')).toBeInTheDocument());
    expect(screen.getByText('สร้างไฟล์สำรองแบบเข้ารหัส')).toBeInTheDocument();
  });
});

/**
 * The overview page as a way in.
 *
 * The quick actions answer "what do I do most"; the hub answers "where is that one screen". Folded
 * away by default so the dashboard stays a dashboard, and built from the same list as the menu so a
 * destination cannot exist in one and not the other.
 */
describe('shortcuts on the overview page', () => {
  it('folds the whole menu into one line until it is opened', async () => {
    renderApp('/');
    const summary = await screen.findByText('ทางลัดทุกเมนู');
    const hub = summary.closest('details');
    expect(hub).not.toBeNull();
    expect(hub).not.toHaveAttribute('open');

    fireEvent.click(summary);
    await waitFor(() => expect(within(hub!).getByRole('link', { name: /เช็กชื่อ/ })).toBeInTheDocument());
    expect(within(hub!).getByRole('link', { name: /เปิดคาบเรียน/ })).toBeInTheDocument();
  });

  it('narrows two dozen destinations to the one being looked for', async () => {
    // Opened, a teacher's hub is twenty-five tiles under eight headings, which is a slower way to
    // reach a screen than the sidebar it shortcuts. Typing is the way through it.
    renderApp('/');
    const summary = await screen.findByText('ทางลัดทุกเมนู');
    const hub = summary.closest('details')!;
    fireEvent.click(summary);

    const search = await within(hub).findByLabelText('ค้นหาทางลัด');
    fireEvent.change(search, { target: { value: 'เช็กชื่อ' } });
    await waitFor(() => expect(within(hub).getByRole('link', { name: /เช็กชื่อ/ })).toBeInTheDocument());
    // Something that plainly does not match, so the assertion is about the narrowing rather than
    // about one destination's current name: the register entry now carries the word "เช็กชื่อ"
    // itself, which is the point of it.
    expect(within(hub).queryByRole('link', { name: /ปฏิทิน/ })).not.toBeInTheDocument();

    // A dead end says so and says what to do about it, rather than leaving an empty panel that
    // reads as the hub having broken.
    fireEvent.change(search, { target: { value: 'ไม่มีเมนูนี้' } });
    await waitFor(() => expect(within(hub).getByText(/ไม่พบทางลัดที่ตรงกับ/)).toBeInTheDocument());
  });

  it('gives a student their own destinations and not the staff ones', async () => {
    renderApp('/');
    await switchRole('preview-student');
    const summary = await screen.findByText('ทางลัดทุกเมนู');
    fireEvent.click(summary);
    const hub = summary.closest('details')!;
    await waitFor(() => expect(within(hub).getByRole('link', { name: /งานและกิจกรรม/ })).toBeInTheDocument());
    expect(within(hub).queryByRole('link', { name: /แก้ไขคะแนน/ })).not.toBeInTheDocument();
  });
});
