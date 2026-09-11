/**
 * How this product puts names and rooms in order.
 *
 * ── Why `localeCompare` on its own is not enough ──
 * Three separate things were wrong with sorting a Thai school's lists by the default comparison, and
 * each of them is visible on the first screen somebody opens:
 *
 *   * **Numbers inside names sort as text.** `ป.10/1` came before `ป.2/1`, because "1" sorts before
 *     "2" and the comparison never gets as far as the 0. A room list that jumps from ป.1 to ป.10 and
 *     back to ป.2 is a list a teacher reads twice.
 *   * **Thai needs to be told it is Thai.** Without a locale the runtime compares code points, which
 *     puts every Thai name after every Latin one and orders vowels by their byte value rather than
 *     by the alphabet — ก-ฮ is not the same order as U+0E01..U+0E2E once the leading vowels
 *     เ แ โ ใ ไ are in play, and those start a great many Thai words.
 *   * **Honorifics bunch everybody together.** A staff list stored as "ครูสมฤทัย", "ครูอนันต์",
 *     "ครูกมล" sorts under ค for all of them, so the list is in no order at all. A Thai school sorts
 *     by the given name, which is what the title is in front of.
 *
 * One comparator, used by every list, so two screens can never disagree about where a child is.
 */

/**
 * `numeric` is what makes ป.2 come before ป.10, and `sensitivity: 'base'` is what stops a stray
 * tone mark or a capital letter deciding the order of two otherwise identical names.
 *
 * Built once: a collator is expensive to construct and cheap to reuse, and these run inside sorts
 * over a school's whole roster.
 */
const collator = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' });

/**
 * The titles a Thai name is stored with, longest first.
 *
 * Longest first matters: "เด็กชาย" starts with nothing that would match a shorter entry, but
 * "นางสาว" contains "นาง", and stripping the shorter one would leave "สาว" at the front of the sort
 * key and file every young woman under ส.
 */
const honorifics = [
  'เด็กหญิง', 'เด็กชาย', 'นางสาว', 'อาจารย์', 'ด.ญ.', 'ด.ช.', 'นาง', 'นาย', 'ครู',
  'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'
];

/**
 * The part of a name that decides where it sits in a list.
 *
 * The title is removed rather than ignored in the comparison, because a comparison that skipped it
 * would still have to decide what to do with "ครู" versus "อาจารย์" on two otherwise identical
 * names. Stripping makes the question disappear.
 */
export function sortKeyFor(name: string): string {
  const trimmed = name.trim();
  for (const title of honorifics) {
    if (trimmed.startsWith(title)) return trimmed.slice(title.length).trim() || trimmed;
  }
  return trimmed;
}

/** Two names, in the order a Thai list puts them. Numbers inside them count as numbers. */
export function compareNames(left: string, right: string): number {
  return collator.compare(sortKeyFor(left), sortKeyFor(right)) || collator.compare(left, right);
}

/**
 * Two labels that are not names — a room, a subject code, a period.
 *
 * The same collation without the honorific strip: a room called "ครูสมฤทัย" is not a thing, and a
 * subject that legitimately begins with one of those syllables should keep it.
 */
export function compareLabels(left: string, right: string): number {
  return collator.compare(left, right);
}

/**
 * Rooms, in the order a school reads them: ป.1/1, ป.1/2, ป.1/3, ป.2/1 … ป.6/4, ม.1/1 …
 *
 * Nothing here parses a room name, and nothing needs to. A numeric collation already compares the
 * digit runs inside a string as numbers and everything else alphabetically, which for "ป.1/1" is
 * exactly "level, then room, each counted" — so ป.10/1 lands after ป.9/1 rather than between ป.1/2
 * and ป.2/1, and ม follows ป because the Thai alphabet says so. A school that names its rooms
 * something else entirely gets the same treatment rather than a special case that does not fit it.
 */
export function compareClassNames(left: string, right: string): number {
  return collator.compare(left, right);
}

/** Sorts a list of things that have a name, without mutating the original. */
export function byName<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((left, right) => compareNames(nameOf(left), nameOf(right)));
}
