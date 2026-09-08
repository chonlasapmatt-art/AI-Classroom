import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { recall, remember } from '../../app/deviceMemory';
import { Button, IconButton } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import {
  BROADCAST_VISIBLE_MS, broadcastIsLive, broadcastToneLabels, schoolBroadcastFrom,
  type BroadcastTone, type SchoolBroadcast
} from './schoolBroadcast';
import { subscribeToSchoolBroadcast } from './schoolBroadcastLive';

const dismissedKey = (schoolId: string) => `school-broadcast-seen:${schoolId}`;

/**
 * One icon per severity, not one icon for "not calm".
 *
 * Colour alone must never be what separates two meanings, and "ต้องระวัง" and "ระบบมีปัญหา" were
 * previously the same glyph in two shades — which is no distinction at all to somebody who cannot
 * tell those shades apart.
 */
const toneIcons: Record<BroadcastTone, IconName> = {
  info: 'info', warning: 'warning', danger: 'error'
};

/** The countdown redraws ten times a second: smooth enough to read as motion, cheap enough to ignore. */
const TICK_MS = 100;

function clockLabel(raisedAt: string): string {
  const at = new Date(raisedAt);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The school-wide notice, in the middle of the screen, for everybody.
 *
 * No role check and no class check on purpose. Every other surface in the product narrows its
 * audience, and each of those narrowings is a way for the one message that had to reach everybody to
 * reach only some of them. A teacher, a student and a guardian all see this identically.
 *
 * It arrives twice over: down a Realtime channel for whoever is looking at the app at that moment,
 * and in the settings row for whoever opens it next. Either way it holds the screen for ten seconds
 * and then takes itself down, because an interruption that stays is a thing to be dismissed rather
 * than a thing to be read. What stays is the entry in the announcement log.
 *
 * The countdown pauses while a pointer is over the card or the keyboard focus is in it: ten seconds
 * is enough to read a notice and not enough to read one twice, and a timed dismissal that cannot be
 * held is a timed dismissal that loses the reader who was still on the second line.
 */
export function SchoolBroadcastNotice({ schoolId }: { schoolId: string }) {
  const snapshot = useSchoolSnapshot();
  const stored = schoolBroadcastFrom(snapshot.settings);
  const [live, setLive] = useState<SchoolBroadcast | null>(null);
  const [dismissed, setDismissed] = useState(() => recall(dismissedKey(schoolId)));
  const [remaining, setRemaining] = useState(BROADCAST_VISIBLE_MS);
  const [held, setHeld] = useState(false);
  const panel = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  // The newer of the two arrivals wins: a device that hears the channel and then pulls the same
  // notice from sync must not be shown it twice, and one that pulls first must still be interrupted.
  const broadcast = useMemo(() => {
    if (!stored) return live;
    if (!live) return stored;
    return live.raisedAt.localeCompare(stored.raisedAt) >= 0 ? live : stored;
  }, [live, stored]);

  const showing = broadcast !== null
    && broadcast.id !== dismissed
    && broadcastIsLive(broadcast);

  useEffect(() => subscribeToSchoolBroadcast(schoolId, setLive), [schoolId]);

  const close = useCallback(() => {
    if (!broadcast) return;
    remember(dismissedKey(schoolId), broadcast.id);
    setDismissed(broadcast.id);
  }, [broadcast, schoolId]);

  // A new notice restarts the clock, including one that replaces a notice still on screen.
  useEffect(() => { setRemaining(BROADCAST_VISIBLE_MS); setHeld(false); }, [broadcast?.id]);

  useEffect(() => {
    if (!showing || held) return;
    const timer = window.setInterval(() => {
      setRemaining((left) => Math.max(0, left - TICK_MS));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [held, showing]);

  useEffect(() => { if (showing && remaining === 0) close(); }, [close, remaining, showing]);

  useEffect(() => {
    if (!showing) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [close, showing]);

  if (!showing || !broadcast) return null;

  const seconds = Math.ceil(remaining / 1000);
  const fraction = remaining / BROADCAST_VISIBLE_MS;
  const raisedAtLabel = clockLabel(broadcast.raisedAt);

  return (
    <div className="broadcast-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section
        className="broadcast-card"
        data-tone={broadcast.tone}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={broadcast.body ? bodyId : undefined}
        ref={panel}
        tabIndex={-1}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false); }}
      >
        <header className="broadcast-card-head">
          <span className="broadcast-medallion" aria-hidden="true">
            <Icon name={toneIcons[broadcast.tone]} size={26} />
          </span>
          <div className="broadcast-card-heading">
            <span className="broadcast-kicker">
              ประกาศทั้งโรงเรียน · {broadcastToneLabels[broadcast.tone]}
            </span>
            <h2 id={titleId}>{broadcast.title}</h2>
          </div>
          <IconButton label="ปิดประกาศ" onClick={close}><Icon name="close" size={16} /></IconButton>
        </header>

        {broadcast.body && <p className="broadcast-body" id={bodyId}>{broadcast.body}</p>}

        <p className="broadcast-meta">
          <Icon name="profile" size={14} />
          <span>{broadcast.raisedBy || 'ผู้ดูแลระบบของโรงเรียน'}</span>
          {raisedAtLabel && <span className="broadcast-meta-time">· {raisedAtLabel} น.</span>}
        </p>

        <footer className="broadcast-card-actions">
          <span className="broadcast-countdown" data-held={held ? 'true' : 'false'}>
            <span className="broadcast-countdown-ring" style={{ '--broadcast-left': fraction } as CSSProperties} aria-hidden="true">
              <b>{seconds}</b>
            </span>
            <span className="broadcast-countdown-copy" role="timer" aria-live="off">
              {held ? 'หยุดนับถอยหลังไว้ อ่านได้ตามสบาย' : `ประกาศนี้จะปิดเองใน ${seconds} วินาที`}
            </span>
          </span>
          <Button variant="primary" onClick={close}>รับทราบ</Button>
        </footer>
      </section>
    </div>
  );
}
