import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';
import { setViewportWidth } from '../setup';

const repositoryRoot = resolve(process.cwd(), '../..');

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

/*
 * The full menu, as opposed to the phone's shortcut bar.
 *
 * Both are real navigation and both link to the same routes, so a document-wide query for a
 * destination now legitimately finds two. These tests are about what the MENU offers a role, which
 * is the sidebar; scoping says so instead of relying on there having been only one nav.
 */
const mainMenu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));

/**
 * The way onto the profile screen, which is now the card rather than a menu row.
 *
 * There were two doors: a row in the menu called "โปรไฟล์ของฉัน", and — a few centimetres below it —
 * a card showing the person's avatar, their name and their role, which did nothing when pressed.
 * People pressed the card. The card is the control now and the row is gone, so these tests press
 * what a person presses.
 */
const profileCards = () => screen.getAllByRole('button', { name: /^เปิดโปรไฟล์ของ / });
const openOwnProfile = () => fireEvent.click(profileCards()[0]!);

function renderApp(path = '/') {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function switchRole(membershipId: string) {
  fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: membershipId } });
}

describe('application shell and routes', () => {
  it('renders the teacher dashboard with the action-first layout', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('สวัสดี'));
    expect(screen.getByText('งานรอตรวจ')).toBeInTheDocument();
    expect(screen.getByText('การกระจายเกรด')).toBeInTheDocument();
    expect(screen.getByText('นักเรียนที่ควรติดตาม')).toBeInTheDocument();
  });

  it('shows the work list with badges and the create action for a teacher', async () => {
    renderApp('/assignments');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('งานและโปรเจกต์'));
    expect(screen.getByRole('button', { name: '+ สร้างงานใหม่' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ประกาศถึงห้องเรียน' })).toBeInTheDocument();
  });

  it('opens the work form with reminder presets and rubric selection', async () => {
    renderApp('/assignments');
    fireEvent.click(await screen.findByRole('button', { name: '+ สร้างงานใหม่' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('สร้างงานใหม่')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'โครงงาน' })).toBeInTheDocument();
    expect(within(dialog).getByText('ก่อนกำหนด 1 วัน')).toBeInTheDocument();
    expect(within(dialog).getByText('เกณฑ์ (rubric)')).toBeInTheDocument();
  });

  it('renders the academic calendar with month, week and upcoming views', async () => {
    renderApp('/calendar');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ปฏิทิน'));
    fireEvent.click(screen.getByRole('tab', { name: 'สัปดาห์' }));
    expect(screen.getAllByText(/งาน$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'กำลังจะถึง' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ปฏิทิน');
  });

  it('gives a student the notification centre and hides teacher-only navigation', async () => {
    renderApp();
    await switchRole('preview-student');
    await waitFor(() => expect(mainMenu().queryByRole('link', { name: /ครู/ })).not.toBeInTheDocument());
    expect(mainMenu().getByRole('link', { name: /การแจ้งเตือน/ })).toBeInTheDocument();

    fireEvent.click(mainMenu().getByRole('link', { name: /การแจ้งเตือน/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('การแจ้งเตือน'));
  });

  it.each(['preview-student', 'preview-parent'])('hides work creation controls for %s', async (membershipId) => {
    renderApp('/');
    await switchRole(membershipId);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /สร้างงาน/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /สร้างงาน/ })).not.toBeInTheDocument();
  });

  /*
   * The work list, for the two roles that are told about work rather than setting it.
   *
   * They are separated because the answer is genuinely different now. A student has the list and
   * must not have the button; a guardian is not given the list at all, and typing its address gets
   * a refusal that names the role instead of the screen with its controls quietly removed.
   */
  it('gives a student the work list without the create control', async () => {
    renderApp('/assignments');
    await switchRole('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('งานและโปรเจกต์'));
    expect(screen.queryByRole('button', { name: /สร้างงาน/ })).not.toBeInTheDocument();
  });

  it('refuses the work list to a guardian by address, not only by menu', async () => {
    renderApp('/assignments');
    await switchRole('preview-parent');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('หน้านี้ไม่ได้เปิดให้บทบาทของคุณ'));
    expect(screen.queryByRole('button', { name: /สร้างงาน/ })).not.toBeInTheDocument();
  });

  it('lets a student open the avatar picker from their own profile', async () => {
    renderApp();
    await switchRole('preview-student');
    openOwnProfile();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('โปรไฟล์'));

    fireEvent.click(screen.getByRole('button', { name: 'เปลี่ยน Avatar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('เลือก Avatar ขั้นสูง')).toBeInTheDocument();
    /*
     * The picker opens on whole characters.
     *
     * It used to open on the thousand portraits, which are busts: pick one and there are no slots
     * to take apart afterwards. The figures are the front door now, and the portraits are one row
     * down — still there, because a thousand saved ids still point at them.
     */
    expect(within(dialog).getByRole('listbox', { name: 'ตัวละครเต็มตัว' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(50);

    // The search waits for the typing to stop, so the assertion waits with it. Searching a kind of
    // character narrows the figures; every result is one of them.
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'มังกร' } });
    await waitFor(() => {
      const found = within(dialog).getAllByRole('option');
      expect(found.length).toBeGreaterThan(0);
      for (const option of found) expect(option.getAttribute('title')).toContain('มังกร');
    });

    // And the portrait catalogue still answers to an id, which is what a saved record holds.
    fireEvent.click(within(dialog).getByRole('button', { name: /รายการทั้งหมด/ }));
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'avatar_007' } });
    await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(1));
  });

  it('lets somebody try a pose before they commit to an avatar', async () => {
    renderApp();
    await switchRole('preview-student');
    openOwnProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'เปลี่ยน Avatar' }));
    const dialog = await screen.findByRole('dialog');

    // The drawings already knew how to wave; the picker never let anybody see it.
    const cast = within(dialog).getByRole('button', { name: 'ร่ายเวทย์' });
    expect(within(dialog).getByRole('button', { name: 'ยืน' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(cast);
    expect(cast).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'ยืน' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('walks the avatar gallery with the arrow keys instead of a tab stop per avatar', async () => {
    renderApp();
    await switchRole('preview-student');
    openOwnProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'เปลี่ยน Avatar' }));
    const dialog = await screen.findByRole('dialog');
    // The figures grid, which is what the picker now opens on.
    const gallery = within(dialog).getByRole('listbox', { name: 'ตัวละครเต็มตัว' });
    const options = within(gallery).getAllByRole('option');

    // One tab stop for the whole gallery: everything else is reachable, none of it is in the way.
    expect(options.filter((option) => option.getAttribute('tabindex') === '0')).toHaveLength(1);
    fireEvent.click(options[0]!);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    /*
     * End walks to the last tile; whether it can be *worn* is a different question.
     *
     * The far end of this grid is where the premium characters are — a dragon in full armour is
     * several bought pieces — and a child who has not bought them gets the price rather than the
     * costume. So the keyboard is checked for what it is for: it moves, and the tile it lands on is
     * the one the grid then acts on.
     */
    fireEvent.keyDown(gallery, { key: 'End' });
    const last = options[options.length - 1]!;
    expect(last).toHaveFocus();
    const wearable = last.querySelector('.designer-tile-price') === null;
    if (wearable) {
      expect(last).toHaveAttribute('aria-selected', 'true');
    } else {
      // Priced, and this child has 22 points: the refusal says what it costs and what they have.
      expect(within(dialog).getByRole('alert').textContent).toMatch(/แต้ม/);
    }
  });

  it('offers to buy a premium character rather than refusing it at the save button', async () => {
    /*
     * The dead end this replaces: the tile said 510 แต้ม, pressing it loaded the build anyway, and
     * the refusal arrived at "บันทึกและใช้" as "ไอเทมนี้ยังไม่ได้แลก" — no name, no price, nothing
     * to press. A locked character now buys what is missing, or says how far short they are.
     */
    renderApp();
    await switchRole('preview-student');
    openOwnProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'เปลี่ยน Avatar' }));
    const dialog = await screen.findByRole('dialog');

    // The category chips, not the body chips beside the stage — both say "มังกร".
    const chips = within(dialog).getByRole('group', { name: 'ประเภทตัวละคร' });
    fireEvent.click(within(chips).getByRole('button', { name: 'มังกร' }));
    const dragons = await waitFor(() => {
      const found = within(dialog).getAllByRole('option');
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    const priced = dragons.find((option) => option.querySelector('.designer-tile-price'))!;
    expect(priced, 'no premium dragon in the grid').toBeTruthy();
    expect(priced.className).toContain('locked');

    fireEvent.click(priced);
    // The fixture student has 22 points, so this is the shortfall rather than a purchase.
    expect(within(dialog).getByRole('alert').textContent).toMatch(/ต้องใช้ \d+ แต้ม · มีอยู่ \d+ แต้ม/);
  });

  it('keeps the student dashboard personal and shows their avatar beside their name', async () => {
    renderApp('/');
    await switchRole('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดี'));
    expect(screen.getByText('ข้อมูลส่วนตัวของฉัน')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ปรับแต่ง Avatar' })).toBeInTheDocument();
    expect(screen.getByText('งานที่ต้องทำ')).toBeInTheDocument();
    expect(screen.queryByText('นักเรียนทั้งหมด')).not.toBeInTheDocument();
    expect(screen.queryByText('งานรอตรวจ')).not.toBeInTheDocument();
  });

  it('shows only the student score summary by subject and opens score details', async () => {
    renderApp('/scores');
    await switchRole('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('คะแนนของฉัน'));
    expect(screen.getByText('คะแนนแยกตามรายวิชา')).toBeInTheDocument();
    expect(screen.queryByText('นักเรียนรวม')).not.toBeInTheDocument();
    const subjectCard = screen.getAllByRole('button', { name: /ดูรายละเอียดวิชา/ })[0]!;
    fireEvent.click(subjectCard);
    // The breakdown opens as a drawer over the page: below the fold on a phone, an inline panel
    // looked like the tap had done nothing at all.
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText('คะแนนที่ได้')).toBeInTheDocument();
  });

  it('provides a Preview Demo Center with quick links for the current role', async () => {
    renderApp('/preview-demo');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ศูนย์เดโมระบบ'));
    expect(screen.getByText(/ข้อมูลเดโมถูกเตรียมไว้ให้เห็นภาพจริง/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'เปิดเดโม →' })).toHaveLength(13);
    expect(screen.getByRole('heading', { name: 'คลังข้อสอบ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quiz Challenge' })).toBeInTheDocument();
  });

  it('loads question bank and exam demo data inside Preview', async () => {
    renderApp('/question-bank');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('คลังข้อสอบ'));
    expect(await screen.findByText('ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด')).toBeInTheDocument();

    cleanup();
    renderApp('/exams');
    await waitFor(() => expect(screen.getByText('เดโมสอบกลางภาค วิทยาศาสตร์')).toBeInTheDocument());
    expect(screen.getByText('เปิดสอบอยู่')).toBeInTheDocument();
  });

  it.each(['preview-admin', 'preview-teacher', 'preview-parent'])('lets %s customise an avatar', async (membershipId) => {
    renderApp();
    await switchRole(membershipId);
    openOwnProfile();
    await waitFor(() => expect(screen.getByRole('button', { name: 'เปลี่ยน Avatar' })).toBeInTheDocument());
  });

  it('shows the class capacity presets and the occupancy meter', async () => {
    renderApp('/classes');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ห้องเรียน'));
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'เพิ่มห้องเรียน' })[0]!);
    // The form opens over the list rather than unfolding above it, so the rooms an administrator was
    // reading do not move down the page the moment they press the button.
    const form = await screen.findByRole('dialog');
    expect(within(form).getByRole('button', { name: 'กำหนดเอง' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: '100 คน' })).toBeInTheDocument();
  });

  it('gives a teacher their rooms read-only, with the roster and the way on to registering', async () => {
    renderApp('/classes');
    await switchRole('preview-teacher');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ห้องเรียน'));
    // Rooms are school structure: a teacher reads the ones they hold and changes none of them.
    expect(screen.queryByRole('button', { name: 'เพิ่มห้องเรียน' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ลบ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'แก้ไข' })).not.toBeInTheDocument();
    // One row per teacher, carrying both the part they play and the subject they own in the room.
    expect(screen.getByText('ครูประจำชั้น · วิทยาศาสตร์และเทคโนโลยี')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'ดูรายชื่อนักเรียน' })[0]!);
    const roster = await screen.findByRole('dialog');
    expect(within(roster).getAllByText(/เลขประจำตัว/).length).toBeGreaterThan(0);
    expect(within(roster).getByRole('link', { name: 'ไปเช็กชื่อห้องนี้' }))
      .toHaveAttribute('href', expect.stringContaining('/classroom?class='));
  });

  it('opens the attendance screen on the room the classes screen linked to', async () => {
    renderApp('/attendance?class=fixture-class-2');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เช็กชื่อ'));
    expect(screen.getByLabelText('ห้องเรียน')).toHaveValue('fixture-class-2');
  });

  /*
   * A day per column, a period per row -- the orientation that fits.
   *
   * The other way round made the table 1180px wide in a content column under 900px, so it was
   * scrolled sideways with the day names pinned over the scroll, and a lesson could sit entirely
   * underneath the day it belonged to. Five columns fit; eight do not.
   */
  it('lays the week out a day per row, with the periods and their times across the top', async () => {
    // The week grid is the shape a wide screen gets; a narrow one reads the same week a day at a time.
    setViewportWidth(1440);
    renderApp('/timetable');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ตารางสอน'));
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    // The periods are the columns, in order, each carrying its clock.
    expect(headers[0]).toContain('วัน');
    expect(headers[1]).toContain('คาบ 1');
    expect(headers[1]).toContain('08:30');
    expect(headers.some((text) => text.includes('คาบ 8'))).toBe(true);
    // The day is the row, so a reader finds their day at the left and runs across it.
    const days = screen.getAllByRole('rowheader').map((cell) => cell.textContent ?? '');
    expect(days[0]).toContain('จันทร์');
    expect(days.some((text) => text.includes('ศุกร์'))).toBe(true);
  });

  it('scrolls the week inside its own frame, never the page', () => {
    const css = readFileSync(join(repositoryRoot, 'apps/web/src/design-system/screens.css'), 'utf8');
    // Eight period columns are wider than the content column, so the frame takes the scroll and the
    // day rail stays put against it. What must never come back is a page that slides sideways.
    expect(css).not.toContain('scroll-snap-type: x mandatory');
    expect(css).toContain('.timetable-week-frame');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('.timetable-week-day');
  });

  it('offers a way to move a period that does not need a drag', async () => {
    setViewportWidth(1440);
    renderApp('/timetable');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ตารางสอน'));
    const filled = screen.getAllByRole('button', { name: /คาบ \d/ })
      .find((button) => !/ว่าง/.test(button.getAttribute('aria-label') ?? ''));
    expect(filled).toBeTruthy();
    fireEvent.click(filled!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'ย้ายคาบนี้' }));
    // The table now answers as a set of destinations, and says so where a screen reader will read it.
    expect(await screen.findByText(/เลือกช่องปลายทางในตาราง/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^ย้าย .* มาที่ .* ซึ่งว่างอยู่$/ }).length).toBeGreaterThan(0);
  });

  // The marks and the grade summary are one screen with two views now, so reaching the category
  // columns means asking for the summary — which is what a teacher does when they want the grade
  // rather than the individual marks.
  it('renders the gradebook with category columns', async () => {
    renderApp('/gradebook');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สมุดเกรดรายวิชา'));
    fireEvent.click(screen.getByRole('tab', { name: 'เกรดรวมของห้อง' }));
    expect(await screen.findByRole('columnheader', { name: 'การบ้าน' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'GPA' })).toBeInTheDocument();
  });
});
