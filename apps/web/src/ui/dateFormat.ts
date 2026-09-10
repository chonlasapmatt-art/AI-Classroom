/**
 * How a date is written for a reader.
 *
 * Every screen used to call `toLocaleString('th-TH')` directly, and the default that comes back is
 * `6/9/2569 16:00:00` — a numeric day, a numeric month, and a seconds field on a deadline that was
 * never recorded to the second. Three things go wrong with that. The seconds are noise nobody can
 * act on. The numeric month is ambiguous next to the calendar, which writes its months as words.
 * And because each screen passed its own options, one due date read three different ways between
 * the dashboard, the assignment list and the exam table.
 *
 * So the formatting lives here instead, and screens ask for a meaning — a day, a moment, a time —
 * rather than assembling one. The shapes below are the whole vocabulary; anything needing a fourth
 * should be added here rather than inlined at the call site, or the drift starts again.
 */

/** Formatters are expensive to build and are asked for on every row, so each shape is built once. */
const dayFormat = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
const dayLongFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' });
const momentFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const clockFormat = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' });

/**
 * A stamp that cannot be read is worse than a blank one.
 *
 * These take whatever the record happens to hold — an ISO string, a millisecond number, a Date —
 * because that is what the callers have, and a row whose timestamp failed to parse should show the
 * placeholder rather than the words "Invalid Date" in the middle of a Thai sentence.
 */
type When = string | number | Date | null | undefined;

/*
 * A bare `2026-09-10` is parsed by the language as UTC midnight, not as that morning where the
 * reader is standing. Anywhere west of Greenwich that prints the day before, so a date-only string
 * is given an explicit local midnight before it becomes a Date. Timestamps carrying a time already
 * say which instant they mean and are left alone.
 */
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: When): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && dateOnly.test(value)) {
    const local = new Date(`${value}T00:00:00`);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `6 ก.ย. 2569` — a day, with no time attached to it. */
export function formatDay(value: When, fallback = '—'): string {
  const date = parse(value);
  return date ? dayFormat.format(date) : fallback;
}

/** `6 กันยายน 2569` — the same day spelled out, for headings with room for it. */
export function formatDayLong(value: When, fallback = '—'): string {
  const date = parse(value);
  return date ? dayLongFormat.format(date) : fallback;
}

/** `6 ก.ย. 2569 16:00` — a moment: how a deadline, a submission or an edit is written. */
export function formatMoment(value: When, fallback = '—'): string {
  const date = parse(value);
  return date ? momentFormat.format(date) : fallback;
}

/** `16:00` — a time on a day the surrounding text has already named. */
export function formatClock(value: When, fallback = '—'): string {
  const date = parse(value);
  return date ? clockFormat.format(date) : fallback;
}
