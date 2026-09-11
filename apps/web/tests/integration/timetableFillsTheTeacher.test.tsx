// The teacher field of a timetable slot, answered by the subject above it.
//
// Who takes which subject in which room is decided once, on the class screen. The timetable builder
// then asked for it again — a list of every member of staff, forty times a week, with nothing saying
// which of those names has anything to do with the subject just chosen. The register a teacher is
// offered comes from the timetable entry, so a mismatch here hands the lesson to somebody who cannot
// mark it.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderTimetable() {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={['/timetable']}><App /></MemoryRouter>);
}

/** Any slot an administrator can open — a free period is the case the auto-fill exists for. */
async function openASlot() {
  await waitFor(() => expect(document.querySelectorAll('.slot-button').length).toBeGreaterThan(0));
  const empty = [...document.querySelectorAll('.slot-button')]
    .find((button) => button.textContent?.includes('เพิ่มคาบเรียน')) as HTMLElement | undefined;
  fireEvent.click(empty ?? (document.querySelector('.slot-button') as HTMLElement));
  return screen.findByRole('dialog');
}

const subjectField = () => screen.getByLabelText('รายวิชา') as HTMLSelectElement;
const teacherField = () => screen.getByLabelText(/^ครูผู้สอน/) as HTMLSelectElement;

describe('the slot form', () => {
  it('fills in the teacher who already owns the subject', async () => {
    renderTimetable();
    await openASlot();
    expect(teacherField().value).toBe('');

    // Science in this room belongs to a named teacher, decided on the class screen.
    const science = [...subjectField().options].find((option) => option.text.includes('วิทยาศาสตร์'))!;
    fireEvent.change(subjectField(), { target: { value: science.value } });

    await waitFor(() => expect(teacherField().value).not.toBe(''));
    const chosen = [...teacherField().options].find((option) => option.value === teacherField().value)!;
    expect(chosen.text).toContain('สมฤทัย');
    // And it says where the name came from, so nobody has to wonder whether they typed it.
    expect(screen.getByText(/ระบบเติมจากครูที่ดูแลรายวิชานี้ให้แล้ว/)).toBeInTheDocument();
  });

  it('never overwrites a teacher somebody chose themselves', async () => {
    renderTimetable();
    await openASlot();

    const other = [...teacherField().options].find((option) => option.value && !option.text.includes('สมฤทัย'))!;
    fireEvent.change(teacherField(), { target: { value: other.value } });

    const science = [...subjectField().options].find((option) => option.text.includes('วิทยาศาสตร์'))!;
    fireEvent.change(subjectField(), { target: { value: science.value } });

    expect(teacherField().value).toBe(other.value);
  });

  it('leaves the field empty for a subject nobody is assigned to', async () => {
    renderTimetable();
    await openASlot();

    const unassigned = [...subjectField().options]
      .find((option) => option.value && !option.text.includes('วิทยาศาสตร์'))!;
    fireEvent.change(subjectField(), { target: { value: unassigned.value } });

    // Guessing at a name is worse than asking for one: the register follows this field.
    await waitFor(() => expect(subjectField().value).toBe(unassigned.value));
    expect(teacherField().value).toBe('');
  });
});
