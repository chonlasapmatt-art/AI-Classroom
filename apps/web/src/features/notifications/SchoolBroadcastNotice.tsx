import { useState } from 'react';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { recall, remember } from '../../app/deviceMemory';
import { Button, Modal } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import { broadcastToneLabels, schoolBroadcastFrom, type BroadcastTone } from './schoolBroadcast';

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

/**
 * The school-wide notice, in the middle of the screen, for everybody.
 *
 * No role check and no class check on purpose. Every other surface in the product narrows its
 * audience, and each of those narrowings is a way for the one message that had to reach everybody to
 * reach only some of them. A teacher, a student and a guardian all see this identically.
 *
 * Closing it is remembered per device against the moment the notice was raised, so it interrupts
 * once rather than on every navigation — and a notice that is edited or replaced counts as new and
 * comes back, which is what makes it safe to use for something that is still unfolding.
 */
export function SchoolBroadcastNotice({ schoolId }: { schoolId: string }) {
  const snapshot = useSchoolSnapshot();
  const broadcast = schoolBroadcastFrom(snapshot.settings);
  const [dismissed, setDismissed] = useState(() => recall(dismissedKey(schoolId)));

  if (!broadcast) return null;
  if (dismissed === broadcast.raisedAt) return null;

  function close() {
    if (!broadcast) return;
    remember(dismissedKey(schoolId), broadcast.raisedAt);
    setDismissed(broadcast.raisedAt);
  }

  return (
    <Modal
      title={
        <span className={`broadcast-title ${broadcast.tone}`}>
          <Icon name={toneIcons[broadcast.tone]} size={20} />
          <span className="broadcast-title-text">{broadcast.title}</span>
        </span>
      }
      description={broadcastToneLabels[broadcast.tone]}
      onClose={close}
      actions={<Button variant="primary" onClick={close}>รับทราบ</Button>}
    >
      {broadcast.body && <p className="broadcast-body">{broadcast.body}</p>}
      <p className="fine-print">ประกาศจากผู้ดูแลระบบของโรงเรียน · ทุกคนในโรงเรียนเห็นข้อความนี้</p>
    </Modal>
  );
}
