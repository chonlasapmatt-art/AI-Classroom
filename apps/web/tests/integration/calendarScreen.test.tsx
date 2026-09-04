// The academic calendar, and the thing it was leaving out.
//
// It drew assignments and nothing else, so an exam — which has a date, a class and a subject, and
// is the most important thing on a term's calendar — appeared nowhere. A teacher checking Friday's
// load before setting homework was reading half the picture. And what it did draw was coloured by
// subject, which the icon on each chip already says, leaving the one distinction people scan a
// month for indistinguishable: a test looked exactly like a piece of homework.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { buildFixtureData } from '../../src/data/fixtures/schoolFixture';
import { calendarEntriesFor } from '../../src/academic/views';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderCalendar() {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={['/calendar']}><App /></MemoryRouter>);
}

describe('what the calendar knows about', () => {
  const fixture = buildFixtureData();
  const classIds = fixture.classes.map((item) => item.id);

  it('carries exams beside work, not only work', () => {
    const entries = calendarEntriesFor(fixture, { classIds, includeDrafts: true });
    expect(entries.some((entry) => entry.kind === 'exam')).toBe(true);
    expect(entries.some((entry) => entry.kind !== 'exam')).toBe(true);
  });

  it('keeps a teacher\'s unpublished exam away from a student', () => {
    // A draft exam is a plan. Announcing one to a student names a test that may never happen, on a
    // date still being moved.
    const drafts = fixture.tests.filter((test) => test.status === 'draft');
    const forStudents = calendarEntriesFor(fixture, { classIds, includeDrafts: false });
    for (const draft of drafts) expect(forStudents.some((entry) => entry.id === draft.id)).toBe(false);

    const forStaff = calendarEntriesFor(fixture, { classIds, includeDrafts: true });
    for (const draft of drafts) expect(forStaff.some((entry) => entry.id === draft.id)).toBe(true);
  });

  it('orders everything by its date, whichever table it came from', () => {
    const dates = calendarEntriesFor(fixture, { classIds, includeDrafts: true })
      .map((entry) => entry.at ?? '9999');
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('the calendar on screen', () => {
  it('names each kind and says how many there are', async () => {
    renderCalendar();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ปฏิทิน'));
    const legend = screen.getByRole('group', { name: 'กรองตามประเภท' });
    for (const label of ['สอบ', 'การบ้าน', 'โครงงาน', 'กิจกรรม']) {
      expect(within(legend).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('filters the month down to one kind, and back', async () => {
    renderCalendar();
    await waitFor(() => expect(document.querySelectorAll('.calendar-chip').length).toBeGreaterThan(0));
    const before = document.querySelectorAll('.calendar-chip').length;

    const legend = screen.getByRole('group', { name: 'กรองตามประเภท' });
    const exams = within(legend).getByRole('button', { name: /^สอบ/ });
    fireEvent.click(exams);
    await waitFor(() => expect(exams).toHaveAttribute('aria-pressed', 'true'));
    // Every chip left is an exam, which the chip says in its title as well as in its colour — a
    // reader who cannot separate two hues gets nothing from the colour alone.
    for (const chip of document.querySelectorAll('.calendar-chip')) {
      expect(chip.getAttribute('title')).toMatch(/^สอบ ·/);
    }

    fireEvent.click(exams);
    await waitFor(() => expect(document.querySelectorAll('.calendar-chip').length).toBe(before));
  });

  it('lets a teacher look at the week they are planning, not only this one', async () => {
    renderCalendar();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'สัปดาห์' }));

    const heading = () => document.querySelector('.calendar-week-nav strong')!.textContent;
    const thisWeek = heading();
    fireEvent.click(screen.getByRole('button', { name: /สัปดาห์ถัดไป/ }));
    await waitFor(() => expect(heading()).not.toBe(thisWeek));

    fireEvent.click(screen.getByRole('button', { name: 'สัปดาห์นี้' }));
    await waitFor(() => expect(heading()).toBe(thisWeek));
  });

  it('says which filter emptied the list, and offers the way back', async () => {
    renderCalendar();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'กำลังจะถึง' }));

    const legend = screen.getByRole('group', { name: 'กรองตามประเภท' });
    for (const label of ['สอบ', 'การบ้าน', 'โครงงาน', 'กิจกรรม']) {
      fireEvent.click(within(legend).getByRole('button', { name: new RegExp(`^${label}`) }));
      await waitFor(() => expect(within(legend).getByRole('button', { name: new RegExp(`^${label}`) }))
        .toHaveAttribute('aria-pressed', 'true'));

      const rows = [...document.querySelectorAll('.calendar-upcoming .calendar-row')];
      if (rows.length === 0) {
        // An empty list under a filter has to name the filter, or it reads as "there is nothing"
        // rather than as "there is nothing of this kind".
        expect(screen.getByText(new RegExp(`ไม่มี"${label}"`))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ดูทุกประเภท' })).toBeInTheDocument();
      } else {
        for (const row of rows) expect(row.textContent).toContain(label);
      }
      fireEvent.click(within(legend).getByRole('button', { name: new RegExp(`^${label}`) }));
    }
  });
});
