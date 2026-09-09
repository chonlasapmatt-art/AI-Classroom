import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { recall, remember } from '../../app/deviceMemory';
import { subjectById } from '../../data/selectors';
import { Button, IconButton } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { broadcastIsLive, schoolBroadcastFrom } from './schoolBroadcast';

const seenKey = (profileId: string) => `class-announcement-seen:${profileId}`;

/**
 * How recent an announcement has to be to interrupt rather than wait in the list.
 *
 * A day, because a teacher's announcement is about the next lesson or tomorrow's kit, not about the
 * next five minutes. Past that it is still in the class announcements — it simply stops jumping in
 * front of somebody who has already started their day.
 */
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The teacher's announcement, in the middle of the screen.
 *
 * A class announcement used to be a row on a list, which means it was read by whoever thought to go
 * and look. The one the school-wide notice already proved works is a card in the middle of the
 * screen — so this is that, deliberately in a quieter register:
 *
 *   * the administrator's notice is the school's emergency channel. It carries a severity, a
 *     countdown, and takes itself down after ten seconds because it is about the next few minutes;
 *   * a teacher's is about a room. It has no severity to choose, no countdown, and stays until the
 *     child closes it, because "bring your recorder tomorrow" is not urgent and should not be
 *     snatched away mid-sentence.
 *
 * The two never compete: while a school-wide notice is up, this waits. Whose announcement it is and
 * which room it belongs to are on the card, because a child in four subjects needs to know which of
 * their teachers is talking.
 *
 * Only a child the announcement was addressed to sees it: the snapshot is already scoped to the
 * rooms they are enrolled in, and a message sent to named students is filtered to those students
 * here as well.
 */
export function ClassAnnouncementNotice() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const [dismissed, setDismissed] = useState(() => recall(seenKey(membership.profileId)));

  const student = snapshot.students.find((item) => item.profileId === membership.profileId);

  const announcement = useMemo(() => {
    if (membership.role !== 'student' || !student) return null;
    const now = Date.now();
    return [...snapshot.announcements]
      .filter((item) => !item.deletedAt)
      .filter((item) => item.studentIds.length === 0 || item.studentIds.includes(student.id))
      .filter((item) => {
        const at = Date.parse(item.createdAt);
        return Number.isFinite(at) && now - at < FRESH_WINDOW_MS;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }, [membership.role, snapshot.announcements, student]);

  // The school-wide notice is the emergency channel; a class announcement waits behind it rather
  // than stacking two cards over each other.
  const broadcast = schoolBroadcastFrom(snapshot.settings);
  const broadcastShowing = broadcast !== null && broadcastIsLive(broadcast);

  const close = useCallback(() => {
    if (!announcement) return;
    remember(seenKey(membership.profileId), announcement.id);
    setDismissed(announcement.id);
  }, [announcement, membership.profileId]);

  useEffect(() => {
    if (!announcement || dismissed === announcement.id || broadcastShowing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [announcement, broadcastShowing, close, dismissed]);

  if (!announcement || broadcastShowing) return null;
  if (dismissed === announcement.id) return null;

  const classroom = snapshot.classes.find((item) => item.id === announcement.classId);
  const subject = subjectById(snapshot, announcement.subjectId);
  const when = new Date(announcement.createdAt);
  const clock = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="class-notice-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      {/* An alert dialog, like the school-wide notice: it interrupts to be read, and the pair are
            told apart by what they say rather than by their roles. */}
      <section className="class-notice" role="alertdialog" aria-modal="true" aria-label={`ประกาศจากครู · ${announcement.title}`}>
        <header className="class-notice-head">
          <span className="class-notice-mark" aria-hidden="true"><Icon name="announcements" size={22} /></span>
          <div className="class-notice-heading">
            <span className="class-notice-kicker">
              ประกาศจากครู{subject ? ` · ${subject.name}` : ''}{classroom ? ` · ${classroom.name}` : ''}
            </span>
            <h2>{announcement.title}</h2>
          </div>
          <IconButton label="ปิดประกาศ" onClick={close}><Icon name="close" size={16} /></IconButton>
        </header>

        {announcement.body && <p className="class-notice-body">{announcement.body}</p>}

        <footer className="class-notice-actions">
          {clock && <span className="class-notice-meta">ประกาศเมื่อ {clock}</span>}
          <Button variant="primary" onClick={close}>รับทราบ</Button>
        </footer>
      </section>
    </div>
  );
}
