// Taking a register, and the two ways it used to go wrong.
//
// Finding one student in a class meant scrolling the whole roster, because the screen had no filter
// of any kind — not by name, and not by the question a teacher actually asks near the end of a
// period, which is "who have I not marked yet". And the one bulk control wrote a mark for every
// unmarked student the instant it was pressed: dozens of records from one tap, with no way back
// except finding each student it touched.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderAttendance() {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={['/attendance']}><App /></MemoryRouter>);
}

const roster = () => document.querySelectorAll('.attendance-list article');

describe('the register', () => {
  it('opens on the class roster with the counts above it', async () => {
    renderAttendance();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เช็กชื่อ'));
    // Every status is named, not only coloured, and "ยังไม่เช็ก" is one of them — the absence of a
    // mark is a state a teacher acts on, so it is counted rather than inferred from a subtraction.
    for (const label of ['มาเรียน', 'สาย', 'ขาด', 'ลา', 'ยังไม่เช็ก']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(roster().length).toBeGreaterThan(0);
  });

  it('narrows the roster to a typed name', async () => {
    renderAttendance();
    await waitFor(() => expect(roster().length).toBeGreaterThan(1));
    const total = roster().length;

    const first = roster()[0]!.querySelector('.student-name strong')!.textContent!;
    fireEvent.change(screen.getByPlaceholderText('ค้นหาชื่อหรือเลขประจำตัว'), { target: { value: first } });
    await waitFor(() => expect(roster().length).toBeLessThan(total));
    expect(roster()[0]!.textContent).toContain(first);
  });

  it('says so rather than showing an empty list when nothing matches', async () => {
    renderAttendance();
    await waitFor(() => expect(roster().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByPlaceholderText('ค้นหาชื่อหรือเลขประจำตัว'), { target: { value: 'ไม่มีนักเรียนชื่อนี้' } });
    await waitFor(() => expect(screen.getByText('ไม่พบนักเรียนที่ตรงกับตัวกรอง')).toBeInTheDocument());
    // A dead end with no way back is how somebody concludes the class has been emptied.
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    await waitFor(() => expect(roster().length).toBeGreaterThan(0));
  });

  it('filters by the status a student was given', async () => {
    renderAttendance();
    await waitFor(() => expect(roster().length).toBeGreaterThan(0));
    const marks = within(roster()[0] as HTMLElement);
    fireEvent.click(marks.getByRole('button', { name: 'มาเรียน' }));
    // The mark is state, so it is announced as pressed rather than left to the colour.
    await waitFor(() => expect(marks.getByRole('button', { name: 'มาเรียน' })).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(screen.getByRole('button', { name: 'ยังไม่เช็ก' }));
    await waitFor(() => expect(roster().length).toBeGreaterThan(0));
    for (const row of roster()) {
      expect(within(row as HTMLElement).getByRole('button', { name: 'มาเรียน' })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('asks before writing a mark for everybody who is still unmarked', async () => {
    renderAttendance();
    await waitFor(() => expect(roster().length).toBeGreaterThan(0));
    const before = roster().length;

    fireEvent.click(screen.getByRole('button', { name: 'มาเรียนทั้งหมด' }));
    const dialog = await screen.findByRole('dialog');
    // The count is in the question, because "are you sure" without a number is a question nobody
    // can answer — thirty students and one are the same prompt.
    expect(within(dialog).getByText(new RegExp(`บันทึก "มาเรียน" ให้ ${before} คน`))).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'ยังไม่เช็ก' }));
    // Cancelling wrote nothing: everybody is still unmarked.
    await waitFor(() => expect(roster().length).toBe(before));
  });

  it('closing the period spells out that the rest are recorded absent', async () => {
    renderAttendance();
    await waitFor(() => expect(roster().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'ปิดคาบนี้' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ปิดคาบโดยบันทึก "ขาด"/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'ปิดคาบและบันทึกขาด' })).toBeInTheDocument();
  });
});
