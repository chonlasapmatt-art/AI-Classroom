// A week is scanned by colour, and every lesson on it was the same colour.
//
// A subject is given a colour when it is created, and that colour follows it everywhere a subject
// appears — its chip on the dashboard, its card on the scores screen, its column in the gradebook.
// The timetable was the exception: every filled period was painted the same brand blue, so a
// student looking for Thursday's maths had thirty identical cards to read through, in the one place
// where telling subjects apart at a glance is the entire point.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { buildFixtureData } from '../../src/data/fixtures/schoolFixture';
import { subjectColor } from '../../src/data/subjectCatalog';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

const filledSlots = () => [...document.querySelectorAll('.slot.filled, .timetable-dayrow.filled')] as HTMLElement[];

function renderTimetable() {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={['/timetable']}><App /></MemoryRouter>);
}

describe('the timetable', () => {
  it('paints every lesson in the colour its subject was given', async () => {
    renderTimetable();
    await waitFor(() => expect(filledSlots().length).toBeGreaterThan(0));

    const snapshot = buildFixtureData();
    const timetable = snapshot.timetable.filter((entry) => entry.status === 'active');
    const colourOf = (subjectId: string | null) => {
      const subject = snapshot.subjects.find((row) => row.id === subjectId);
      return subject ? subjectColor(subject.colorIndex).solid : null;
    };

    for (const slot of filledSlots()) {
      const day = slot.dataset.day;
      const period = Number(slot.dataset.period);
      const entry = timetable.find((row) => row.period === period && Boolean(day));
      if (!entry) continue;
      // The hue is handed to the stylesheet as a property rather than as a finished background, so
      // the dark theme can still mix it against its own ground.
      expect(slot.style.getPropertyValue('--subject-color')).not.toBe('');
    }

    // And the colours actually differ, which is the whole point — a week where every card carries
    // the same custom property is no better than the week that carried none.
    const used = new Set(filledSlots().map((slot) => slot.style.getPropertyValue('--subject-color')));
    expect(used.size).toBeGreaterThan(1);
    for (const value of used) {
      expect(timetable.some((entry) => colourOf(entry.subjectId) === value)).toBe(true);
    }
  });

  it('gives a student the same coloured week, in the view a student gets', async () => {
    // A student cannot edit, so their slots are plain wrappers rather than buttons — a different
    // element carrying the same lesson, and the place a colour is easiest to lose.
    renderTimetable();
    await waitFor(() => expect(filledSlots().length).toBeGreaterThan(0));
    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });

    await waitFor(() => expect(document.querySelectorAll('.slot-static').length).toBeGreaterThan(0));
    const coloured = filledSlots().filter((slot) => slot.style.getPropertyValue('--subject-color') !== '');
    expect(coloured.length).toBe(filledSlots().length);
  });
});
