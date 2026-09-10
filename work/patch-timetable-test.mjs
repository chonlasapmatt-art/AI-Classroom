import { patch } from './patchlib.mjs';
const file = 'apps/web/tests/integration/appNavigation.test.tsx';

const old = `  it('lays the week out a day per column, with the periods and their times down the side', async () => {
    // The week grid is the shape a wide screen gets; a narrow one reads the same week a day at a time.
    setViewportWidth(1440);
    renderApp('/timetable');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ตารางสอน'));
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers[0]).toContain('คาบ');
    expect(headers.some((text) => text.includes('จันทร์'))).toBe(true);
    expect(headers.some((text) => text.includes('ศุกร์'))).toBe(true);
    // The period is the row now, and it carries its clock.
    expect(screen.getByRole('rowheader', { name: /คาบ 1/ }).textContent).toContain('08:30');
  });

  it('needs nothing pinned, because nothing scrolls sideways', () => {
    const css = readFileSync(join(repositoryRoot, 'apps/web/src/design-system/screens.css'), 'utf8');
    // The apparatus that existed only to cover a horizontal scroll is gone with the scroll itself.
    expect(css).not.toContain('.timetable-scroll');
    expect(css).not.toContain('scroll-snap-type: x mandatory');
    expect(css).toContain('.timetable-week');
  });`;

const neu = `  it('lays the week out a day per row, with the periods and their times across the top', async () => {
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
  });`;

patch(file, [[old, neu]]);
console.log('timetable orientation test updated');
