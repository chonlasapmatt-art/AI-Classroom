import { useEffect, useRef, useState } from 'react';
import { APP_VERSION, readSeenVersion, writeSeenVersion } from './appUpdate';
import { changesIn, notesBetween, type ReleaseNote } from './releaseNotes';

/**
 * What just changed, said once, to whoever is holding the device.
 *
 * The reload is the moment the app is least explicable: a person pressed a button called
 * "อัปเดตตอนนี้", the screen went away and came back, and something is different with no account of
 * what. The banner before the reload can only promise; this is the part that reports.
 *
 * ── Who sees it ──
 * Everybody. A release that moves the timetable is news for the student whose timetable moved, and
 * routing that through an administrator to relay is how a change becomes a rumour. There is no role
 * check anywhere in this file, and it is mounted beside the update banner in the shell rather than
 * inside any page, so no route or permission can withhold it.
 *
 * ── Once ──
 * The version last shown is remembered per device. A first run stores the version and shows nothing:
 * somebody who has never used the app has no "since" to be told about, and greeting them with a list
 * of repairs to screens they have not seen is noise. The version is stored the moment the notice is
 * shown rather than when it is closed, because a tab closed without dismissing it was still told.
 *
 * ── Ten seconds ──
 * Long enough to read four lines, short enough that it is not another thing to clear. It is not a
 * modal: there is no scrim and nothing behind it is blocked, because taking a register is more
 * urgent than the news that the register got better. Hovering, or focusing anything inside, stops
 * the clock — a countdown that expires mid-sentence is worse than no countdown at all.
 */
const NOTICE_SECONDS = 10;
/** How many changes fit under a ten-second clock. The rest are one press away. */
const PREVIEW_CHANGES = 4;

export function WhatsNewNotice() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [remaining, setRemaining] = useState(NOTICE_SECONDS);
  const paused = useRef(false);

  useEffect(() => {
    const since = readSeenVersion();
    const fresh = notesBetween(since, APP_VERSION);
    writeSeenVersion();
    if (fresh.length === 0) return;
    setNotes(fresh);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open || expanded) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      setRemaining((value) => {
        if (value <= 1) { setOpen(false); return 0; }
        return value - 1;
      });
    }, 1000);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { window.clearInterval(timer); document.removeEventListener('keydown', onKey); };
  }, [open, expanded]);

  if (!open || notes.length === 0) return null;

  /*
   * Four lines, then the rest on request.
   *
   * The comment at the top of this file says "long enough to read four lines", and for a single
   * release that was true. A device that has been switched off for a fortnight is several versions
   * behind, and `changesIn` flattens every one of them: coming from 3.3.0 to 3.4.0 produced a
   * seventeen-item wall under a ten-second clock — a length nobody reads, on a timer nobody can
   * beat, which is the same as saying nothing at all.
   *
   * So the notice shows the newest release's first few changes and offers the rest. Opening them
   * also stops the clock, because somebody who asked to read more has said they are reading.
   */
  const headline = notes[0]?.headline ?? 'อัปเดตเรียบร้อย';
  const changes = changesIn(notes);
  const shown = expanded ? changes : changes.slice(0, PREVIEW_CHANGES);
  const hidden = changes.length - shown.length;

  return (
    <div className="whats-new-layer">
      {/*
        * The room dims, and the notice is the thing in the middle of it.
        *
        * A panel in a corner over a busy screen is read as a toast — something that will go away on
        * its own and can therefore be ignored — and this is the one account anybody gets of what
        * changed under them. The scrim is soft rather than opaque, and pressing it closes the
        * notice: what is behind stays visible, stays where it was, and is one press away.
        */}
      <button
        type="button"
        className="whats-new-scrim"
        aria-label="ปิดรายละเอียดการอัปเดต"
        onClick={() => setOpen(false)}
      />
      <section
        className="whats-new"
        role="status"
        aria-live="polite"
        aria-label="สิ่งที่เปลี่ยนไปในเวอร์ชันนี้"
        onMouseEnter={() => { paused.current = true; }}
        onMouseLeave={() => { paused.current = false; }}
        onFocusCapture={() => { paused.current = true; }}
        onBlurCapture={() => { paused.current = false; }}
      >
        <header className="whats-new-head">
          <div>
            <span className="whats-new-eyebrow">อัปเดตเป็นเวอร์ชัน {APP_VERSION} แล้ว</span>
            <strong>{headline}</strong>
          </div>
          <button type="button" className="whats-new-close" onClick={() => setOpen(false)} aria-label="ปิด">
            ปิด
          </button>
        </header>

        <ul className="whats-new-list">
          {shown.map((change) => (
            <li key={change.text} data-kind={change.kind}>
              <span className="whats-new-tag">{change.kind === 'fix' ? 'แก้ไข' : 'ของใหม่'}</span>
              <span>{change.text}</span>
            </li>
          ))}
        </ul>

        {hidden > 0 && (
          <button type="button" className="whats-new-more" onClick={() => setExpanded(true)}>
            ดูอีก {hidden} รายการ
          </button>
        )}

        <footer className="whats-new-foot">
          {/*
            The sentence has to match what the clock is doing. Once the list is open the countdown
            has stopped, and a panel that goes on saying "closing in 3 seconds" while sitting there
            is a small lie that teaches people not to read the rest of it.
          */}
          <span>
            {expanded
              ? 'อ่านจบแล้วกดปิดได้เลย · ดูย้อนหลังได้ที่ ตั้งค่า · ระบบและเวอร์ชัน'
              : `ปิดเองใน ${remaining} วินาที · ดูย้อนหลังได้ที่ ตั้งค่า · ระบบและเวอร์ชัน`}
          </span>
          {!expanded && (
            <span
              className="whats-new-meter"
              aria-hidden="true"
              style={{ '--whats-new-left': `${(remaining / NOTICE_SECONDS) * 100}%` } as React.CSSProperties}
            />
          )}
        </footer>
      </section>
    </div>
  );
}
