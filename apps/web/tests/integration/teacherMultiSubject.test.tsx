import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { getFixtureRepository, resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderApp(path: string) {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

/*
 * One teacher, one room, as many subjects as they teach in it.
 *
 * The staff list has always held this — a responsibility is one row per class and subject, and the
 * server refuses only a second advisor or a second owner of the same subject. The form could not
 * express it: one subject select, one save, and no sight of what was already there, so giving
 * somebody three subjects meant three passes and remembering which of them had gone through.
 */
describe('assigning a teacher to several subjects at once', () => {
  async function openTheForm() {
    renderApp('/teachers');
    await screen.findByRole('heading', { level: 1, name: 'ครู' });
    const responsibility = screen.getByLabelText('หน้าที่');
    fireEvent.change(screen.getByLabelText('ครู'), { target: { value: 'fixture-teacher-2' } });
    fireEvent.change(screen.getByLabelText('ห้องเรียน'), { target: { value: 'fixture-class-3' } });
    fireEvent.change(responsibility, { target: { value: 'SUBJECT_OWNER' } });
    return await screen.findByRole('group', { name: 'วิชาที่รับผิดชอบ' });
  }

  it('offers the subjects as a set of ticks rather than as one choice', async () => {
    const group = await openTheForm();
    const chips = within(group).getAllByRole('checkbox');
    expect(chips.length).toBeGreaterThan(1);
    // Nothing is chosen until somebody chooses it, and each says so where a reader will hear it.
    for (const chip of chips) expect(chip).toHaveAttribute('aria-checked', 'false');
  });

  it('writes one responsibility per subject from a single press', async () => {
    const group = await openTheForm();
    const maths = within(group).getByRole('checkbox', { name: /คณิตศาสตร์/ });
    const art = within(group).getByRole('checkbox', { name: /ศิลปะ/ });
    fireEvent.click(maths);
    fireEvent.click(art);
    expect(maths).toHaveAttribute('aria-checked', 'true');
    expect(art).toHaveAttribute('aria-checked', 'true');

    // The button counts what it is about to do, because a silent partial save is the thing this
    // screen has to avoid.
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึก 2 วิชา' }));

    // Read the room's staff list through the repository's own subscription, which is what the
    // screens read too: it publishes the current snapshot the moment a listener attaches.
    const staffList = () => {
      let latest: SchoolSnapshot | null = null;
      const stop = getFixtureRepository().subscribe((next) => { latest = next; });
      stop();
      return latest!;
    };
    await waitFor(() => {
      const links = staffList().classTeachers.filter((link) =>
        link.teacherId === 'fixture-teacher-2' && link.classId === 'fixture-class-3' && link.subjectId);
      expect(links.map((link) => link.subjectId).sort()).toEqual(
        ['fixture-subject-AR', 'fixture-subject-MA'].sort()
      );
    });
  });

  it('shows what the teacher already holds in the room being edited', async () => {
    renderApp('/teachers');
    await screen.findByRole('heading', { level: 1, name: 'ครู' });
    fireEvent.change(screen.getByLabelText('ครู'), { target: { value: 'fixture-teacher-1' } });
    fireEvent.change(screen.getByLabelText('ห้องเรียน'), { target: { value: 'fixture-class-1' } });
    // The preview teacher advises ป.5/1 and owns its science: an administrator adding a third
    // responsibility should be able to see both without leaving the form.
    const heading = await screen.findByText('หน้าที่ปัจจุบันในห้องนี้');
    const panel = heading.parentElement!;
    expect(within(panel).getByText(/ครูที่ปรึกษา/)).toBeInTheDocument();
    expect(within(panel).getByText(/วิทยาศาสตร์และเทคโนโลยี · ครูเจ้าของวิชา/)).toBeInTheDocument();
  });
});
