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
    // Every change in this release is on screen — the banner truncates, this one does not.
    const shipped = releaseNotes[0]!;
    for (const change of shipped.changes) expect(screen.getByText(change.text)).toBeTruthy();
    expect(screen.getByText(new RegExp(APP_VERSION.replace(/\./g, '\\.')))).toBeTruthy();
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

  it('closes on Escape', async () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('does not block the screen behind it', () => {
    // Taking a register is more urgent than the news that the register got better, so the layer
    // over the app passes clicks through and only the card itself catches them.
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    const { container } = render(<WhatsNewNotice />);
    expect(container.querySelector('.whats-new-layer')).toBeTruthy();
    // A scrim would be a sibling element covering the page; there is none.
    expect(container.querySelectorAll('.whats-new-layer > *').length).toBe(1);
  });
});
