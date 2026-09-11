import type { Role } from '../domain/types';
import type { NavGroup } from './navigation';

/**
 * The order a menu is in, as data rather than as source code.
 *
 * ── Why this exists ──
 * The menu's order was a fact about the file it is written in, so every "can we put คะแนน above
 * เช็กชื่อ" was a code change, a build and a deployment — for a preference that differs between two
 * teachers in the same staff room. It is a stored list of keys now, and the list is resolved in
 * three layers.
 *
 * ── The three layers, and why the first one is the device ──
 *   1. **this device**, which is where a rearrangement lands by default;
 *   2. **the school**, which is what an administrator has deliberately published;
 *   3. **the code**, which is what everybody starts from.
 *
 * The device comes first because the arrangement belongs to the screen somebody is standing at
 * rather than to their account. Two people share a login in a Thai school more often than anybody
 * plans for — a spare tablet in the staff room, a class computer everyone signs into — and an
 * arrangement that followed the account would rearrange a colleague's menu the moment they borrowed
 * it. The same rule read the other way is the honest part: your own arrangement does not follow you
 * to another machine either, and the Save button in settings is the way to say "this one is for
 * everybody".
 *
 * ── Unknown keys, in both directions ──
 * A stored arrangement is a list of keys written by some earlier version of this app. Keys it names
 * that no longer exist are dropped, and keys the code has that it does not name are kept and
 * appended in their own order. Both halves matter: without the first, deleting a menu entry breaks
 * every device that had rearranged its menu; without the second, adding one makes it invisible to
 * exactly the people who cared enough to rearrange.
 */
export interface NavArrangement {
  /** Group keys, in the order the sections are drawn. */
  groups: string[];
  /** Group key to the item paths inside it, in order. */
  items: Record<string, string[]>;
}

/** Where one device remembers its own arrangement. Per role: the menus are different menus. */
export const arrangementStorageKey = (role: Role) => `smart-classroom.nav-order.${role}`;

/** Where the device remembers whether the move controls are showing. */
export const ARRANGE_MODE_KEY = 'smart-classroom.nav-arrange';

/** The settings row an administrator publishes into, keyed by role. */
export const NAV_ORDER_SETTING = 'nav_order';

/** The event the shell listens for, so settings and the menu never disagree about the order. */
export const NAV_ORDER_EVENT = 'smart-classroom:nav-order-changed';

/** The arrangement a set of groups is currently in — the starting point for any move. */
export function arrangementOf(groups: NavGroup[]): NavArrangement {
  return {
    groups: groups.map((group) => group.key),
    items: Object.fromEntries(groups.map((group) => [group.key, group.items.map((item) => item.to)]))
  };
}

/**
 * Reorders one list by a list of keys, keeping anything the keys do not mention.
 *
 * The tail is what makes a stored arrangement survive a release: entries added since it was written
 * are unknown to it, and they stay in the order the code puts them in rather than disappearing.
 */
function ordered<T>(values: T[], keyOf: (value: T) => string, order: string[] | undefined): T[] {
  if (!order || order.length === 0) return values;
  const byKey = new Map(values.map((value) => [keyOf(value), value]));
  const named: T[] = [];
  for (const key of order) {
    const value = byKey.get(key);
    if (value === undefined) continue;
    byKey.delete(key);
    named.push(value);
  }
  return [...named, ...values.filter((value) => byKey.has(keyOf(value)))];
}

/** The groups, in the arrangement's order. A null arrangement is the code's own order. */
export function applyArrangement(groups: NavGroup[], arrangement: NavArrangement | null): NavGroup[] {
  if (!arrangement) return groups;
  return ordered(groups, (group) => group.key, arrangement.groups)
    .map((group) => ({ ...group, items: ordered(group.items, (item) => item.to, arrangement.items[group.key]) }));
}

/** One step up or down, clamped at the ends. Returns the same array when there is nowhere to go. */
function swapped(values: string[], key: string, direction: -1 | 1): string[] {
  const from = values.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= values.length) return values;
  const next = [...values];
  next[from] = next[to]!;
  next[to] = key;
  return next;
}

/**
 * Moves a section, from whatever order the menu is in right now.
 *
 * The current groups are passed in rather than read from the arrangement, because an arrangement
 * written before a release may not mention every section that exists — and a move that operated on
 * the stored list alone would silently reorder around the ones it had never heard of.
 */
export function moveGroup(groups: NavGroup[], key: string, direction: -1 | 1): NavArrangement {
  const current = arrangementOf(groups);
  return { ...current, groups: swapped(current.groups, key, direction) };
}

/** Moves one entry inside its own section. An entry never crosses into another section. */
export function moveItem(
  groups: NavGroup[], groupKey: string, to: string, direction: -1 | 1
): NavArrangement {
  const current = arrangementOf(groups);
  const inside = current.items[groupKey];
  if (!inside) return current;
  return { ...current, items: { ...current.items, [groupKey]: swapped(inside, to, direction) } };
}

/**
 * An arrangement out of something this app did not write.
 *
 * `localStorage` and a settings row are both places a value can arrive from an older build, a hand
 * edit, or a sync from a device running different code. Anything that is not a list of strings is
 * dropped rather than trusted, because the alternative is a menu that renders as nothing.
 */
export function readArrangement(value: unknown): NavArrangement | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<NavArrangement>;
  const groups = Array.isArray(candidate.groups)
    ? candidate.groups.filter((key): key is string => typeof key === 'string')
    : [];
  const items: Record<string, string[]> = {};
  if (candidate.items && typeof candidate.items === 'object') {
    for (const [key, list] of Object.entries(candidate.items)) {
      if (!Array.isArray(list)) continue;
      items[key] = list.filter((entry): entry is string => typeof entry === 'string');
    }
  }
  if (groups.length === 0 && Object.keys(items).length === 0) return null;
  return { groups, items };
}

/** The arrangement a school has published for one role, out of the settings row. */
export function publishedArrangement(value: unknown, role: Role): NavArrangement | null {
  if (!value || typeof value !== 'object') return null;
  return readArrangement((value as Record<string, unknown>)[role]);
}
