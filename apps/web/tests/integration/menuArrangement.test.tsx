import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { navigationByRole } from '../../src/layouts/navigation';
import {
  applyArrangement, arrangementOf, arrangementStorageKey, moveGroup, moveItem, publishedArrangement,
  readArrangement
} from '../../src/layouts/navigationOrder';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';
import { ThemeProvider } from '../../src/app/ThemeContext';

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); window.localStorage.clear(); });

function renderApp(path = '/') {
  enablePreviewMode();
  // The settings screen reads the theme, so the shell needs its provider the way the entry point
  // gives it one.
  return render(<ThemeProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ThemeProvider>);
}

const mainMenu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
const sectionNames = () => mainMenu().getAllByRole('button', { name: /^ย้ายหมวด .* ขึ้น$/ })
  .map((button) => button.getAttribute('aria-label')!.replace(/^ย้ายหมวด /, '').replace(/ ขึ้น$/, ''));

/*
 * The order of the menu, as data rather than as source code.
 *
 * It was a fact about the file the menu is written in, so "can we put คะแนน above เช็กชื่อ" was a
 * code change, a build and a deployment — for a preference two teachers in the same staff room
 * disagree about. These hold the two halves of the answer: the arithmetic that reorders a list
 * without losing anything, and the rule about whose arrangement it is.
 */
describe('reordering a menu', () => {
  const groups = navigationByRole.admin;

  it('moves a section one step, and refuses to move it off either end', () => {
    const first = groups[0]!.key;
    const last = groups[groups.length - 1]!.key;
    expect(moveGroup(groups, first, 1).groups[1]).toBe(first);
    // Nothing to do at the ends, and the answer is the current order rather than a shorter one.
    expect(moveGroup(groups, first, -1).groups).toEqual(arrangementOf(groups).groups);
    expect(moveGroup(groups, last, 1).groups).toEqual(arrangementOf(groups).groups);
  });

  it('moves an entry inside its own section and never out of it', () => {
    const group = groups.find((item) => item.items.length > 1)!;
    const moved = moveItem(groups, group.key, group.items[0]!.to, 1);
    expect(moved.items[group.key]![1]).toBe(group.items[0]!.to);
    // Every other section is left exactly as it was: a move is a move, not a rewrite.
    for (const other of groups) {
      if (other.key === group.key) continue;
      expect(moved.items[other.key]).toEqual(other.items.map((item) => item.to));
    }
  });

  it('keeps entries the stored arrangement has never heard of', () => {
    /*
     * A stored arrangement is a list of keys written by some earlier build. Adding a menu entry
     * afterwards must not make it invisible to exactly the people who cared enough to rearrange —
     * so what the arrangement does not name keeps the code's own order, at the end.
     */
    const partial = { groups: [groups[1]!.key], items: {} };
    const applied = applyArrangement(groups, partial);
    expect(applied[0]!.key).toBe(groups[1]!.key);
    expect(applied.length).toBe(groups.length);
    expect(new Set(applied.map((group) => group.key))).toEqual(new Set(groups.map((group) => group.key)));
  });

  it('drops keys for sections that no longer exist', () => {
    // The other direction: deleting a menu entry must not break every device that had rearranged.
    const stale = { groups: ['a-section-from-a-previous-release', ...groups.map((group) => group.key)], items: {} };
    expect(applyArrangement(groups, stale).map((group) => group.key))
      .toEqual(groups.map((group) => group.key));
  });

  it('refuses a stored value that is not an arrangement at all', () => {
    // `localStorage` and a settings row are both places a value can arrive from a hand edit or an
    // older build. The alternative to dropping them is a menu that renders as nothing.
    expect(readArrangement(null)).toBeNull();
    expect(readArrangement('เมนู')).toBeNull();
    expect(readArrangement({ groups: 'overview' })).toBeNull();
    expect(readArrangement({ groups: ['overview', 7] })).toEqual({ groups: ['overview'], items: {} });
  });

  it('reads the school arrangement for one role without touching the others', () => {
    const value = { admin: { groups: ['people'], items: {} }, teacher: { groups: ['work'], items: {} } };
    expect(publishedArrangement(value, 'admin')?.groups).toEqual(['people']);
    expect(publishedArrangement(value, 'teacher')?.groups).toEqual(['work']);
    expect(publishedArrangement(value, 'student')).toBeNull();
  });
});

/*
 * And whose arrangement it is.
 *
 * The device comes first because the arrangement belongs to the screen somebody is standing at
 * rather than to their account: a shared tablet in a staff room is ordinary, and an arrangement that
 * followed the login would rearrange a colleague's menu the moment they borrowed it.
 */
describe('the menu arrangement on screen', () => {
  /** Opens settings and turns the move controls on, which is the whole of the entry point. */
  async function openArrangeMode() {
    renderApp('/settings?section=display');
    return await turnOnArrangeMode();
  }

  async function turnOnArrangeMode() {
    const toggle = await screen.findByRole('checkbox', { name: /โหมดสลับช่องเมนูและหมวดหมู่/ });
    fireEvent.click(toggle);
    return toggle;
  }

  it('shows no move controls until somebody turns the mode on', async () => {
    renderApp('/settings?section=display');
    await screen.findByRole('heading', { level: 1, name: 'การตั้งค่าโรงเรียน' });
    // A menu that always carried them would be a menu with two buttons beside every row, for a
    // thing most people do once.
    expect(mainMenu().queryByRole('button', { name: /^ย้ายหมวด/ })).not.toBeInTheDocument();

    await turnOnArrangeMode();
    await waitFor(() => expect(mainMenu().getAllByRole('button', { name: /^ย้ายหมวด/ }).length).toBeGreaterThan(0));
  });

  it('moves a section down and keeps it there', async () => {
    await openArrangeMode();
    await waitFor(() => expect(sectionNames().length).toBeGreaterThan(1));
    const before = sectionNames();

    fireEvent.click(mainMenu().getByRole('button', { name: `ย้ายหมวด ${before[0]} ลง` }));
    await waitFor(() => expect(sectionNames()[1]).toBe(before[0]));
    expect(sectionNames()[0]).toBe(before[1]);
  });

  it('writes the new order to this device and to nothing else', async () => {
    await openArrangeMode();
    await waitFor(() => expect(sectionNames().length).toBeGreaterThan(1));
    const first = sectionNames()[0]!;
    fireEvent.click(mainMenu().getByRole('button', { name: `ย้ายหมวด ${first} ลง` }));

    await waitFor(() => expect(window.localStorage.getItem(arrangementStorageKey('admin'))).not.toBeNull());
    /*
     * The whole point of the device layer: nothing about this reaches the account or the school.
     * A colleague who borrows the login on their own machine reads the settings row, which is
     * untouched until somebody deliberately publishes.
     */
    const stored = readArrangement(JSON.parse(window.localStorage.getItem(arrangementStorageKey('admin'))!));
    expect(stored?.groups[1]).toBe(navigationByRole.admin[0]!.key);
  });

  it('puts the arrangement back where it started', async () => {
    await openArrangeMode();
    await waitFor(() => expect(sectionNames().length).toBeGreaterThan(1));
    const before = sectionNames();
    fireEvent.click(mainMenu().getByRole('button', { name: `ย้ายหมวด ${before[0]} ลง` }));
    await waitFor(() => expect(sectionNames()[0]).toBe(before[1]));

    fireEvent.click(screen.getByRole('button', { name: 'คืนค่าเริ่มต้นของเครื่องนี้' }));
    await waitFor(() => expect(sectionNames()).toEqual(before));
    expect(window.localStorage.getItem(arrangementStorageKey('admin'))).toBeNull();
  });

  it('offers publishing to an administrator and only once there is something to publish', async () => {
    await openArrangeMode();
    const publishName = /^บันทึกให้ทั้งโรงเรียน/;
    expect(screen.getByRole('button', { name: publishName })).toBeDisabled();

    await waitFor(() => expect(sectionNames().length).toBeGreaterThan(1));
    fireEvent.click(mainMenu().getByRole('button', { name: `ย้ายหมวด ${sectionNames()[0]} ลง` }));
    await waitFor(() => expect(screen.getByRole('button', { name: publishName })).toBeEnabled());
  });

  it('keeps publishing away from a teacher, and leaves them the device half', async () => {
    renderApp('/settings?section=display');
    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-teacher' } });
    await screen.findByRole('heading', { level: 1, name: 'การตั้งค่าโรงเรียน' });

    // Publishing changes what other people see, so it is the administrator's.
    expect(screen.queryByRole('button', { name: /^บันทึกให้ทั้งโรงเรียน/ })).not.toBeInTheDocument();
    // The rearranging itself is theirs, which is the part that was worth asking for.
    expect(screen.getByRole('checkbox', { name: /โหมดสลับช่องเมนูและหมวดหมู่/ })).toBeInTheDocument();
  });
});
