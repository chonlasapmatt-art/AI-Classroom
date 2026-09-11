import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { buildFixtureData } from '../../src/data/fixtures/schoolFixture';
import { emptySnapshot, type SchoolSnapshot } from '../../src/data/schoolRepository';
import { handInTiming, subjectHandInsFor, subjectsAssessedIn } from '../../src/data/selectors';
import { teacherAdvisedClassIds, teacherClassIds } from '../../src/data/teacherResponsibilities';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';
import type { ClassTeacher } from '../../src/domain/types';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderApp(path: string) {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

/** Preview opens on the administrator; every teacher assertion here is about the teacher. */
async function beTheTeacher() {
  fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-teacher' } });
}

/** The fixture school as a snapshot, for the pure helpers that take one. */
function fixtureSnapshot(): SchoolSnapshot {
  return { ...emptySnapshot, ...buildFixtureData(), ready: true } as SchoolSnapshot;
}

/*
 * What a room's advisor may see, and what they may still not do.
 *
 * The rules themselves were already right and are covered by the permission matrix: a room-wide
 * responsibility reads every subject in that room, a subject responsibility reads its own subject,
 * and only the subject's owner writes a mark. The screens did not follow them. The marks screen
 * filtered its work list by the right to *write*, so an advisor opened the one screen that lays a
 * room's marks out child by child and was either shown nothing or refused the screen outright —
 * which is the wrong answer for the person a guardian rings about a child's whole report.
 *
 * The fixture's teacher is deliberately both things at once: advisor of their room, and owner of one
 * subject inside it. That is the case the two rules have to be told apart in.
 */
describe('a room advisor on the marks screen', () => {
  async function openMarks() {
    renderApp('/grade-editor');
    await beTheTeacher();
    await screen.findByRole('heading', { level: 1, name: 'แก้ไขคะแนนและเกรด' });
    return await screen.findByRole('tablist', { name: 'เลือกงานที่จะให้คะแนน' });
  }

  it('lists the room’s other subjects, not only the one it owns', async () => {
    const picker = await openMarks();
    const cards = within(picker).getAllByRole('tab');
    expect(cards.length).toBeGreaterThan(1);

    // The work this teacher owns is markable; the rest of the room's is not, and says so on the card
    // rather than after it has been opened.
    const readOnly = cards.filter((card) => card.textContent?.includes('ดูอย่างเดียว'));
    const markable = cards.filter((card) => !card.textContent?.includes('ดูอย่างเดียว'));
    expect(readOnly.length, 'an advisor sees no subject but their own').toBeGreaterThan(0);
    expect(markable.length, 'a subject owner cannot mark their own subject').toBeGreaterThan(0);
  });

  it('gives the marks of a subject it does not own as a record rather than as a form', async () => {
    const picker = await openMarks();
    const readOnly = within(picker).getAllByRole('tab')
      .find((card) => card.textContent?.includes('ดูอย่างเดียว'))!;
    fireEvent.click(readOnly);

    /*
     * No inputs, no grade override, and no save. Each of those is a different way to send a write
     * the server would refuse — `teacher_can_edit_subject_score` answers false for anybody who is
     * not the subject's owner — and a control that only fails when pressed is worse than no control.
     */
    await waitFor(() =>
      expect(screen.queryByRole('spinbutton', { name: /^คะแนนของ / })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'ปรับเกรด' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /บันทึกทั้งหมด/ })).not.toBeInTheDocument();
  });

  it('still hands the subject it owns the full marking form', async () => {
    const picker = await openMarks();
    const markable = within(picker).getAllByRole('tab')
      .find((card) => !card.textContent?.includes('ดูอย่างเดียว'))!;
    fireEvent.click(markable);

    await waitFor(() =>
      expect(screen.getAllByRole('spinbutton', { name: /^คะแนนของ / }).length).toBeGreaterThan(0));
    expect(screen.getAllByRole('button', { name: 'ปรับเกรด' }).length).toBeGreaterThan(0);
  });
});

/*
 * The room book, which belongs to the form teacher and to nobody else.
 *
 * Teaching one subject in six rooms makes somebody responsible for six columns of marks; being a
 * room's advisor makes them responsible for twenty-eight children's whole reports. Those are
 * different jobs, and this screen is the second one's.
 */
describe('whose rooms the room book offers', () => {
  const now = '2026-09-01T00:00:00.000Z';
  const row = (id: string) => ({ id, schoolId: 'school', version: 1, createdAt: now, updatedAt: now, deletedAt: null });
  const link = (id: string, classId: string, subjectId: string | null): ClassTeacher =>
    ({ ...row(id), classId, teacherId: 'teacher', role: 'primary', subjectId });

  it('offers the rooms a teacher advises, not the rooms they teach in', () => {
    /*
     * The distinction this screen exists to draw, stated on a school built for it: one teacher who
     * advises one room and teaches a subject in two others. The room book is the advised room; the
     * marks screen is all three.
     */
    const snapshot: SchoolSnapshot = {
      ...emptySnapshot,
      ready: true,
      teachers: [{
        ...row('teacher'), profileId: 'somebody', avatarId: null, avatarPhotoId: null,
        teacherCode: 'T-1', displayName: 'ครู', email: 'teacher@example.ac.th', subject: '',
        verificationStatus: 'verified_teacher', status: 'active'
      }],
      classTeachers: [
        link('advises', 'room-a', null),
        link('teaches-b', 'room-b', 'subject-ma'),
        link('teaches-c', 'room-c', 'subject-ma')
      ]
    };

    expect([...teacherAdvisedClassIds(snapshot, 'somebody')]).toEqual(['room-a']);
    expect(teacherClassIds(snapshot, 'somebody').size).toBe(3);
  });

  it('offers only the advised rooms on the screen itself', async () => {
    renderApp('/gradebook');
    await beTheTeacher();
    await screen.findByRole('heading', { level: 1, name: 'สมุดรายวิชา' });

    const advised = teacherAdvisedClassIds(fixtureSnapshot(), 'preview-teacher');
    expect(advised.size).toBeGreaterThan(0);
    const picker = await screen.findByLabelText('ห้องเรียน');
    expect(within(picker).getAllByRole('option').length).toBe(advised.size);
  });

  it('opens on the room total and holds the subject detail behind a switch', async () => {
    renderApp('/gradebook');
    await beTheTeacher();
    await screen.findByRole('heading', { level: 1, name: 'สมุดรายวิชา' });

    // The first question is "how is this room doing", which is every subject combined.
    const views = screen.getByRole('tablist', { name: 'มุมมองสมุดรายวิชา' });
    expect(within(views).getByRole('tab', { name: 'เกรดรวมของห้อง' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('รายวิชา')).not.toBeInTheDocument();

    fireEvent.click(within(views).getByRole('tab', { name: 'รายละเอียดรายวิชา' }));
    // The second is "why", and it is asked one subject at a time.
    await waitFor(() => expect(screen.getByLabelText('รายวิชา')).toBeInTheDocument());
  });

  it('lays the whole room out against one subject, late and missing counted', async () => {
    renderApp('/gradebook');
    await beTheTeacher();
    await screen.findByRole('heading', { level: 1, name: 'สมุดรายวิชา' });
    fireEvent.click(within(screen.getByRole('tablist', { name: 'มุมมองสมุดรายวิชา' }))
      .getByRole('tab', { name: 'รายละเอียดรายวิชา' }));

    const table = await screen.findByRole('table', { name: /การส่งงานรายวิชา/ });
    const headings = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headings).toEqual(['นักเรียน', 'ส่งไว', 'ตรงเวลา', 'ส่งช้า', 'ยังไม่ส่ง', 'คะแนนรวม', 'รายชิ้น']);

    // Every child in the room, not only the ones with something wrong: a form teacher reads the
    // room, and a table that hides the children who are fine cannot be read as one.
    const snapshot = fixtureSnapshot();
    const roomId = [...teacherAdvisedClassIds(snapshot, 'preview-teacher')][0]!;
    const enrolled = snapshot.enrollments
      .filter((item) => item.classId === roomId && item.status === 'active').length;
    expect(within(table).getAllByRole('button', { name: 'ดูรายชิ้น' }).length).toBe(enrolled);
  });

  it('opens a count into the pieces of work behind it', async () => {
    renderApp('/gradebook');
    await beTheTeacher();
    await screen.findByRole('heading', { level: 1, name: 'สมุดรายวิชา' });
    fireEvent.click(within(screen.getByRole('tablist', { name: 'มุมมองสมุดรายวิชา' }))
      .getByRole('tab', { name: 'รายละเอียดรายวิชา' }));

    const table = await screen.findByRole('table', { name: /การส่งงานรายวิชา/ });
    fireEvent.click(within(table).getAllByRole('button', { name: 'ดูรายชิ้น' })[0]!);
    // "ส่งช้า 3" that cannot be opened is a number the teacher has to go and check somewhere else.
    await waitFor(() => expect(within(table).getByRole('button', { name: 'ซ่อน' })).toBeInTheDocument());
  });
});

/*
 * Where the four outcomes come from.
 *
 * `isLate` is the record the server stamped and is believed over any arithmetic done here — a
 * deadline can move after the fact, and the flag is what the child was told. Early and on time are
 * the split the flag does not make, and it is the one a form teacher acts on: a room where half the
 * work lands in the last hour is not the same room as one that is ahead of its deadlines.
 */
describe('when a piece of work arrived', () => {
  const due = '2026-09-10T16:00:00.000Z';

  it('separates early from merely not late', () => {
    expect(handInTiming({ submittedAt: '2026-09-08T09:00:00.000Z', isLate: false }, due)).toBe('early');
    expect(handInTiming({ submittedAt: '2026-09-10T15:30:00.000Z', isLate: false }, due)).toBe('onTime');
  });

  it('believes the stamp over the clock', () => {
    // Handed in a week early and still marked late by the server: the deadline moved, and what the
    // child was told is what the register should say.
    expect(handInTiming({ submittedAt: '2026-09-03T09:00:00.000Z', isLate: true }, due)).toBe('late');
  });

  it('calls nothing at all missing, rather than late', () => {
    expect(handInTiming(undefined, due)).toBe('missing');
    expect(handInTiming({ submittedAt: null, isLate: true }, due)).toBe('missing');
  });

  it('counts a whole room without losing anybody', () => {
    const snapshot = fixtureSnapshot();
    const roomId = [...teacherAdvisedClassIds(snapshot, 'preview-teacher')][0]!;
    const subject = subjectsAssessedIn(snapshot, roomId)[0]!;
    const rows = subjectHandInsFor(snapshot, roomId, subject.id);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // The four outcomes are exhaustive and exclusive: every piece of work is in exactly one.
      expect(row.early + row.onTime + row.late + row.missing).toBe(row.rows.length);
    }
  });
});

/*
 * And the screen is not a student's.
 *
 * A room book holds every child in the room. It is not refused politely to a child or a guardian —
 * they are never given its address, which is the refusal that matters.
 */
describe('who cannot open the room book at all', () => {
  it.each(['preview-student', 'preview-parent'])('refuses %s by address', async (membershipId) => {
    renderApp('/gradebook');
    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: membershipId } });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('หน้านี้ไม่ได้เปิดให้บทบาทของคุณ'));
  });
});
