import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WhatsNewNotice } from '../../src/app/WhatsNewNotice';
import { APP_VERSION, readSeenVersion } from '../../src/app/appUpdate';
import { releaseNotes } from '../../src/app/releaseNotes';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

/*
 * The report that follows the reload.
 *
 * A person pressed "อัปเดตตอนนี้", the screen went away and came back, and something is different.
 * Everything here is about that moment: it is shown to whoever is holding the device with no role
 * consulted, it is shown once, and it never blocks the app while it is up.
 */
describe('the notice after an update', () => {
  it('lists what changed for a device that was running an older version', () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    expect(screen.getByRole('status', { name: 'สิ่งที่เปลี่ยนไปในเวอร์ชันนี้' })).toBeTruthy();
    // The newest release leads, because it is the one the reader has just taken.
    const shipped = releaseNotes[0]!;
    expect(screen.getByText(shipped.changes[0]!.text)).toBeTruthy();
    expect(screen.getByText(new RegExp(APP_VERSION.replace(/\./g, '\\.')))).toBeTruthy();
  });

  /*
   * Four lines, then the rest on request.
   *
   * This used to require every change on screen at once. For one release that is a handful; for a
   * device several versions behind it is everything from every release in between — coming from
   * 3.3.0 to 3.4.0 produced a seventeen-item wall under a ten-second clock, which is a length
   * nobody reads on a timer nobody can beat.
   */
  it('shows a readable few and keeps the rest one press away', () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);

    const atFirst = screen.getAllByRole('listitem').length;
    expect(atFirst).toBeLessThanOrEqual(4);

    fireEvent.click(screen.getByRole('button', { name: /ดูอีก \d+ รายการ/ }));

    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(atFirst);
    // Opened, there is nothing left to offer.
    expect(screen.queryByRole('button', { name: /ดูอีก/ })).toBeNull();
  });

  it('stops promising a countdown once somebody has opened the list', () => {
    // A panel that goes on saying "closing in 3 seconds" while sitting there is a small lie, and it
    // teaches people not to read the rest of what it says.
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    const { container } = render(<WhatsNewNotice />);
    /*
     * Asked of the footer, not of the document.
     *
     * One of the release notes describes this very countdown — "ปิดเองใน 10 วินาที หรือกดปิดได้" —
     * so a document-wide search for those words finds the changelog talking about the feature and
     * reports it as the feature itself.
     */
    const foot = () => container.querySelector('.whats-new-foot')?.textContent ?? '';
    expect(foot()).toMatch(/ปิดเองใน \d+ วินาที/);

    fireEvent.click(screen.getByRole('button', { name: /ดูอีก \d+ รายการ/ }));

    expect(foot()).not.toMatch(/ปิดเองใน/);
    expect(foot()).toMatch(/อ่านจบแล้วกดปิดได้เลย/);
  });

  it('tells a fix from a new thing in words, not only in colour', () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    const kinds = new Set(releaseNotes[0]!.changes.map((change) => change.kind));
    if (kinds.has('feature')) expect(screen.getAllByText('ของใหม่').length).toBeGreaterThan(0);
    if (kinds.has('fix')) expect(screen.getAllByText('แก้ไข').length).toBeGreaterThan(0);
  });

  it('says nothing on a device that has never run the app', () => {
    const { container } = render(<WhatsNewNotice />);
    expect(container.innerHTML).toBe('');
    // And remembers this version, so the next update is measured from here rather than from nothing.
    expect(readSeenVersion()).toBe(APP_VERSION);
  });

  it('says nothing twice', () => {
    window.localStorage.setItem('smart-classroom-seen-version', APP_VERSION);
    const { container } = render(<WhatsNewNotice />);
    expect(container.innerHTML).toBe('');
  });

  it('records the version as soon as it is shown, not when it is closed', () => {
    // A tab closed without dismissing it was still told; showing the same list again next week
    // would teach a school to ignore the notice.
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    expect(readSeenVersion()).toBe(APP_VERSION);
  });

  it('closes on the button', async () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('plays itself out rather than vanishing under the press', async () => {
    // An unmount on the press itself gave the stylesheet no frame to animate in, so the notice
    // disappeared instead of leaving. It is marked as closing first and removed after.
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    const { container } = render(<WhatsNewNotice />);

    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    expect(container.querySelector('.whats-new-layer')?.getAttribute('data-state')).toBe('closing');

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('closes on Escape', async () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('dims the room around itself', () => {
    // The one account anybody gets of what changed under them was reading as a toast in a corner —
    // something that will go away on its own and can therefore be ignored. It is the thing in the
    // middle of the screen now, with the app dimmed behind it.
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    const { container } = render(<WhatsNewNotice />);
    expect(container.querySelector('.whats-new-layer')).toBeTruthy();
    expect(container.querySelector('.whats-new-scrim')).toBeTruthy();
  });

  it('closes when the dimmed area is pressed', async () => {
    // Dimming the room is not the same as locking the door: what is behind stays where it was and
    // is one press away, which is what keeps a ten-second notice from interrupting a register.
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'ปิดรายละเอียดการอัปเดต' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
