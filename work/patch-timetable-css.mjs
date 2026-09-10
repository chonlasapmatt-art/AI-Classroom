import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/screens.css';

const old = `.timetable-week {
  width: 100%; margin-top: var(--space-3);
  border-collapse: separate; border-spacing: 7px;
  table-layout: fixed;
}`;

const neu = `/*
 * Days down the left, periods across the top, read left to right -- the shape of the timetable
 * pinned to a staffroom wall, and the one everybody in the school already knows how to read.
 *
 * Eight period columns plus a day rail is wider than the content column on a laptop, so the table
 * scrolls inside this frame. The frame scrolls, never the page: a body that slides sideways takes
 * the menu and the header with it. The day rail is sticky against that scroll, which is safe here
 * in a way it was not before -- the rail is the row header, so the cells passing under it belong to
 * other periods of the same day rather than to the day itself.
 */
.timetable-week-frame {
  margin-top: var(--space-3);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.timetable-week {
  width: 100%; margin-top: var(--space-3);
  border-collapse: separate; border-spacing: 7px;
  table-layout: fixed;
}

.timetable-week--days-down { margin-top: 0; min-width: 860px; }
.timetable-week--days-down thead th { min-width: 92px; }

/* The day rail: the row header, and the one column that must stay readable while the week moves. */
.timetable-week-day {
  position: sticky; left: 0; z-index: 1;
  width: 104px; padding: var(--space-2);
  color: var(--ink-700); font-weight: var(--weight-strong); text-align: center;
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--surface-muted), var(--surface));
  box-shadow: 6px 0 12px -10px color-mix(in srgb, var(--ink-900) 40%, transparent);
}
.timetable-week-day span { display: block; font-size: 10px; color: var(--ink-400); font-weight: var(--weight-regular); }
.timetable-week-day.is-today { color: var(--brand-700); }
.timetable-week-day.is-today span { color: var(--brand-600); font-weight: var(--weight-strong); }

.timetable-week--days-down .timetable-week-corner {
  position: sticky; left: 0; z-index: 2;
  width: 104px;
  background: var(--surface);
}`;

patch(file, [[old, neu]]);
console.log('week frame styled');
