// Setting work, and the three things the form used to do to the person filling it in.
//
// It read the instructions field back out of the DOM by id at save time, so the paragraph a teacher
// wrote was never state the form owned — it could not be previewed, restored or validated, only
// harvested. It was one long column inside a panel that scrolled as a block, so the save and
// publish buttons left the screen the moment anybody started typing. And nothing survived the tab
// closing: a bell, a question, a browser reloading for an update, and the assignment was gone.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => {
  cleanup();
  disablePreviewMode();
  resetFixtureRepository();
  window.localStorage.clear();
});

function renderAssignments() {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={['/assignments']}><App /></MemoryRouter>);
}

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: '+ สร้างงานใหม่' }));
  return within(await screen.findByRole('dialog'));
}

describe('the work form', () => {
  it('names its parts and marks off the ones that are filled in', async () => {
    renderAssignments();
    const dialog = await openForm();
    for (const label of ['ข้อมูลพื้นฐาน', 'รายละเอียด', 'กำหนดส่ง', 'คะแนน', 'ไฟล์แนบ', 'การแจ้งเตือน']) {
      expect(dialog.getAllByText(label).length).toBeGreaterThan(0);
    }

    const rail = document.querySelector('.work-form-rail')!;
    const basics = within(rail as HTMLElement).getByRole('button', { name: /ข้อมูลพื้นฐาน/ });
    // Nothing is typed yet, so the section holding the required name is not marked done.
    expect(basics.className).not.toContain('done');

    fireEvent.change(dialog.getByPlaceholderText(/ใบงานบทที่ 3/), { target: { value: 'ใบงานเรื่องแรง' } });
    await waitFor(() => expect(basics.className).toContain('done'));
  });

  it('says which field is missing where the field is, on leaving it', async () => {
    renderAssignments();
    const dialog = await openForm();
    const title = dialog.getByPlaceholderText(/ใบงานบทที่ 3/);
    fireEvent.focus(title);
    fireEvent.blur(title);
    // Beside the input rather than only at the top: an error summary alone leaves somebody hunting
    // for which of eight fields it meant.
    await waitFor(() => expect(dialog.getByText(/ตั้งชื่องานก่อน/)).toBeInTheDocument());
  });

  it('shows the student\'s copy built from what will actually be written', async () => {
    renderAssignments();
    const dialog = await openForm();
    fireEvent.change(dialog.getByPlaceholderText(/ใบงานบทที่ 3/), { target: { value: 'โครงงานระบบสุริยะ' } });

    fireEvent.click(dialog.getByRole('button', { name: /ดูตัวอย่างที่นักเรียนเห็น/ }));
    const preview = await screen.findByLabelText('ตัวอย่างงานที่นักเรียนจะเห็น');
    expect(within(preview).getByRole('heading', { name: 'โครงงานระบบสุริยะ' })).toBeInTheDocument();
    expect(within(preview).getByText('คะแนนเต็ม')).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'กลับไปแก้ไข' }));
    // Going back is not a reset: the preview is a view of the form, not a step away from it.
    await waitFor(() => expect(dialog.getByPlaceholderText(/ใบงานบทที่ 3/)).toHaveValue('โครงงานระบบสุริยะ'));
  });

  it('keeps a deadline preset to the end of the school day', async () => {
    renderAssignments();
    const dialog = await openForm();
    fireEvent.click(dialog.getByRole('button', { name: 'พรุ่งนี้' }));

    const due = dialog.getByLabelText(/วันและเวลาที่ต้องส่ง/) as HTMLInputElement;
    await waitFor(() => expect(due.value).not.toBe(''));
    expect(due.value.endsWith('16:00')).toBe(true);
  });

  it('gives back what was typed when the form is opened again', async () => {
    renderAssignments();
    const first = await openForm();
    fireEvent.change(first.getByPlaceholderText(/ใบงานบทที่ 3/), { target: { value: 'งานที่พิมพ์ค้างไว้' } });
    // The autosave is debounced, so the wait is the point rather than an accident of the test.
    await waitFor(
      () => expect(window.localStorage.getItem(
        Object.keys(window.localStorage).find((key) => key.startsWith('smart-classroom.work-draft.')) ?? ''
      )).toContain('งานที่พิมพ์ค้างไว้'),
      { timeout: 2000 }
    );

    fireEvent.click(first.getByRole('button', { name: 'ยกเลิก' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const second = await openForm();
    expect(second.getByPlaceholderText(/ใบงานบทที่ 3/)).toHaveValue('งานที่พิมพ์ค้างไว้');
    expect(second.getByText(/กู้คืนสิ่งที่พิมพ์ค้างไว้/)).toBeInTheDocument();

    // And it can be thrown away, or a restored draft becomes something to work around every time.
    fireEvent.click(second.getByRole('button', { name: 'เริ่มใหม่' }));
    await waitFor(() => expect(second.getByPlaceholderText(/ใบงานบทที่ 3/)).toHaveValue(''));
  });

  it('does not offer to attach files to a work that does not exist yet', async () => {
    renderAssignments();
    const dialog = await openForm();
    // An upload against an unsaved record either orphans the file or holds it in a tab this form is
    // otherwise built to survive losing.
    expect(dialog.getByText(/บันทึกงานก่อนหนึ่งครั้ง/)).toBeInTheDocument();
  });
});
