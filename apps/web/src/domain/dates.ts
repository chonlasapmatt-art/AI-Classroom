/**
 * Calendar days, in the day the person is actually in.
 *
 * `toISOString().slice(0, 10)` is the UTC day. In Bangkok that is yesterday's date until 07:00
 * every morning, so an attendance sheet opened at 08:00 defaulted to the day before, a due date
 * of 23:30 was grouped under the wrong day on the calendar, and a notice sent in the evening was
 * not "today" the next morning. Every day key in the app comes from here.
 */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day key of a stored value. A date-only string (an activity date, a test date) already is a
 * day and is kept as it is; a timestamp is read in local time.
 */
export function dayKeyOf(value: string): string {
  if (DATE_ONLY.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : localDateKey(parsed);
}
