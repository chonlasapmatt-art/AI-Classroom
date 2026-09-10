import { patch } from './patchlib.mjs';
const file = 'apps/web/tests/unit/whatsNewNotice.test.tsx';

patch(file, [[
  `  it('lists what changed for a device that was running an older version', () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    expect(screen.getByRole('status', { name: 'สิ่งที่เปลี่ยนไปในเวอร์ชันนี้' })).toBeTruthy();
    // Every change in this release is on screen — the banner truncates, this one does not.
    const shipped = releaseNotes[0]!;
    for (const change of shipped.changes) expect(screen.getByText(change.text)).toBeTruthy();
    expect(screen.getByText(new RegExp(APP_VERSION.replace(/\./g, '\\.')))).toBeTruthy();
  });`,
  `  it('lists what changed for a device that was running an older version', () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    expect(screen.getByRole('status', { name: 'สิ่งที่เปลี่ยนไปในเวอร์ชันนี้' })).toBeTruthy();
    // The newest release leads, because it is the one the reader just took.
    const shipped = releaseNotes[0]!;
    expect(screen.getByText(shipped.changes[0]!.text)).toBeTruthy();
    expect(screen.getByText(new RegExp(APP_VERSION.replace(/\./g, '\\.')))).toBeTruthy();
  });

  /*
   * Four lines, then the rest on request.
   *
   * This used to require every change on screen at once. For one release that was a handful; for a
   * device several versions behind it was everything from every release in between — coming from
   * 3.3.0 to 3.4.0 produced a seventeen-item wall under a ten-second clock, which is a length
   * nobody reads on a timer nobody can beat.
   */
  it('shows a readable few and keeps the rest one press away', () => {
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);

    const shownAtFirst = screen.getAllByRole('listitem').length;
    expect(shownAtFirst).toBeLessThanOrEqual(4);

    const more = screen.getByRole('button', { name: /ดูอีก \d+ รายการ/ });
    fireEvent.click(more);

    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(shownAtFirst);
    // Opened, there is nothing left to offer.
    expect(screen.queryByRole('button', { name: /ดูอีก/ })).toBeNull();
  });

  it('stops promising a countdown once somebody has opened the list', () => {
    // A panel that goes on saying "closing in 3 seconds" while sitting there is a small lie that
    // teaches people not to read the rest of it.
    window.localStorage.setItem('smart-classroom-seen-version', '0.0.1');
    render(<WhatsNewNotice />);
    expect(screen.getByText(/ปิดเองใน \d+ วินาที/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ดูอีก \d+ รายการ/ }));

    expect(screen.queryByText(/ปิดเองใน/)).toBeNull();
    expect(screen.getByText(/อ่านจบแล้วกดปิดได้เลย/)).toBeTruthy();
  });`
]]);
console.log('notice test follows the disclosure');
