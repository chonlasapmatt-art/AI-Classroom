// Taking a subject off the catalogue, and refusing to when that would orphan a child's marks.
//
// The only way out of the subject list was "เก็บถาวร", which flips the status and leaves the card
// sitting there wearing a badge. That is right for a subject the school has records for and wrong
// for the one somebody created by mistake, which could not be got rid of at all — so the list fills
// with typos nobody can clear.
//
// The delete is an administrator's, and it is refused whenever work, marks or registers name the
// subject: the subject is the label on those records, and a mark whose subject has been deleted
// reads as nothing. The refusal offers archiving instead rather than leaving a dead end, because a
// dead end is how somebody deletes the records to get their way.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { getFixtureRepository, resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderSubjects() {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={['/subjects']}><App /></MemoryRouter>);
}

const cards = () => [...document.querySelectorAll('.subject-card')] as HTMLElement[];
const cardNamed = (name: string) => cards().find((card) => card.querySelector('strong')?.textContent === name);

describe('removing a subject', () => {
  it('offers the delete to an administrator on every subject card', async () => {
    renderSubjects();
    await waitFor(() => expect(cards().length).toBeGreaterThan(0));
    for (const card of cards()) {
      expect(within(card).getByRole('button', { name: 'ลบ' })).toBeInTheDocument();
    }
  });

  it('refuses a subject that carries marks, and offers archiving instead', async () => {
    renderSubjects();
    await waitFor(() => expect(cards().length).toBeGreaterThan(0));

    // A subject the fixture school has actually taught: work, activities and tests sit under it.
    const taught = cards().find((card) => /[1-9]\d* งาน\/กิจกรรม\/การสอบ/.test(card.textContent ?? ''));
    expect(taught).toBeDefined();
    const before = cards().length;

    fireEvent.click(within(taught!).getByRole('button', { name: 'ลบ' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/มีข้อมูลการเรียนอยู่/)).toBeInTheDocument();
    // The second door, named: archiving keeps the history and clears the list.
    expect(within(dialog).getByRole('button', { name: 'เก็บถาวรแทน' })).toBeInTheDocument();

    // The dialog's own dismiss in the corner is also called "ปิด"; the one in the action row is last.
    const dismiss = within(dialog).getAllByRole('button', { name: 'ปิด' });
    fireEvent.click(dismiss[dismiss.length - 1]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cards().length).toBe(before);
  });

  it('removes a subject nothing depends on, along with its periods', async () => {
    renderSubjects();
    await waitFor(() => expect(cards().length).toBeGreaterThan(0));

    // A subject created and never used, which is exactly the case the delete exists for.
    await getFixtureRepository().saveSubject({
      id: 'subject-typo', code: 'ZZ', name: 'วิชาที่พิมพ์ผิด', colorIndex: 3, iconKey: 'default'
    });
    await waitFor(() => expect(cardNamed('วิชาที่พิมพ์ผิด')).toBeDefined());
    const before = cards().length;

    fireEvent.click(within(cardNamed('วิชาที่พิมพ์ผิด')!).getByRole('button', { name: 'ลบ' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ยังไม่มีงาน คะแนน หรือการเช็กชื่อผูกอยู่/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ลบรายวิชา' }));

    await waitFor(() => expect(cardNamed('วิชาที่พิมพ์ผิด')).toBeUndefined());
    expect(cards().length).toBe(before - 1);
  });
});
