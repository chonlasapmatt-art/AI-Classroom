import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

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
    await waitFor(() => expect(sectionNames()).toContain('เช็กชื่อ'));
    const sections = sectionNames();
    expect(sections.length).toBeLessThanOrEqual(9);
    for (const label of ['วันนี้', 'เช็กชื่อ', 'กิจกรรม', 'งานและคะแนน', 'นักเรียน', 'รายงาน']) {
      expect(sections).toContain(label);
    }
  });

  it('gives a student their own sections and none of the staff ones', async () => {
    renderApp();
    await switchRole('preview-student');
    await waitFor(() => expect(sectionNames()).toContain('งานของฉัน'));
    const sections = sectionNames();
    expect(sections.length).toBeLessThanOrEqual(8);
    expect(sections).toContain('เพื่อนร่วมชั้น');
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
 * Reports, for the two roles that used not to have any.
 *
 * A student and a guardian were told the school had reports and given no way to read one about
 * themselves. These are the same four questions the staff reports answer, asked about one person.
 */
describe('reports a student and a guardian can read', () => {
  it('answers a student about their own attendance, work, points and badges', async () => {
    renderApp('/reports');
    await switchRole('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('การเข้าเรียน'));
    expect(page().getByText('รายงานของฉัน')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('รายงาน'), { target: { value: 'awards' } });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เหรียญรางวัล'));
  });

  it('lets a guardian pick which child the report is about, and says it is read-only', async () => {
    renderApp('/reports');
    await switchRole('preview-parent');
    await waitFor(() => expect(page().getByText(/รายงานของลูก/)).toBeInTheDocument());
    expect(screen.getByLabelText('นักเรียน')).toBeInTheDocument();
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
    expect(page().getByText('รอซิงก์')).toBeInTheDocument();
    expect(page().getByRole('button', { name: /Sync Now|ปิดใช้งานในโหมด Preview/ })).toBeInTheDocument();
    expect(screen.queryByText('กู้คืนจากไฟล์สำรอง')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ล้างแล้วกู้คืนทั้งหมด' })).not.toBeInTheDocument();
  });

  it('keeps the full panel for an admin', async () => {
    renderApp('/operations');
    await switchRole('preview-admin');
    await waitFor(() => expect(screen.getByText('กู้คืนจากไฟล์สำรอง')).toBeInTheDocument());
    expect(screen.getByText('สำรองข้อมูลแบบเข้ารหัส')).toBeInTheDocument();
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
    expect(within(hub!).getByRole('link', { name: /กิจกรรมหน้าชั้น/ })).toBeInTheDocument();
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
