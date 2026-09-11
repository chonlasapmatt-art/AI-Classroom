import { useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { forget, recall, recallRecord, remember } from '../../app/deviceMemory';
import {
  ARRANGE_MODE_KEY, arrangementStorageKey, NAV_ORDER_EVENT, NAV_ORDER_SETTING,
  publishedArrangement, readArrangement
} from '../../layouts/navigationOrder';
import { Badge, Button, Card, CardHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

/**
 * Moving the menu about, and deciding who that is for.
 *
 * ── The two questions this answers ──
 * "Can I put คะแนน above เช็กชื่อ" used to be a code change, a build and a deployment, for a
 * preference two teachers in the same staff room disagree about. And the answer could only ever be
 * one arrangement for the whole product, which is why it was never worth doing.
 *
 * So there are two separate things here, and keeping them separate is the whole design:
 *
 *   * **Turning the move controls on** puts a pair of up and down buttons beside every section and
 *     every entry in the menu. Rearranging from there writes to *this device only*.
 *   * **Publishing** takes what this device is showing and makes it the arrangement everybody with
 *     this role starts from. It is an administrator's button, because it changes what other people
 *     see.
 *
 * ── Why the default is the device ──
 * An arrangement belongs to the screen somebody is standing at rather than to their account. A
 * shared tablet in a staff room and a class computer everyone signs into are ordinary in a Thai
 * school, and an arrangement that followed the login would rearrange a colleague's menu the moment
 * they borrowed it. Read the other way it is the honest half: this does not follow you to another
 * machine either, and publishing is how you say "this one is for everybody".
 */
export function MenuArrangementCard() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const repository = useRepository();
  const { toast } = useToast();
  const [arranging, setArranging] = useState(() => recall(ARRANGE_MODE_KEY) === 'true');
  const [saving, setSaving] = useState(false);
  const isAdmin = membership.role === 'admin';

  /*
   * The menu writes the arrangement while somebody is moving rows; this card reads it back to say
   * whether there is anything to publish. It is held in state rather than read during render because
   * it lives in `localStorage` — a read during render is a value that never changes as far as React
   * is concerned, so the card would still be saying "nothing has been rearranged" after somebody had.
   */
  const [local, setLocal] = useState(() =>
    readArrangement(recallRecord<Record<string, unknown>>(arrangementStorageKey(membership.role), {})));

  useEffect(() => {
    const refresh = () => {
      setLocal(readArrangement(recallRecord<Record<string, unknown>>(arrangementStorageKey(membership.role), {})));
      setArranging(recall(ARRANGE_MODE_KEY) === 'true');
    };
    refresh();
    window.addEventListener(NAV_ORDER_EVENT, refresh);
    return () => window.removeEventListener(NAV_ORDER_EVENT, refresh);
  }, [membership.role]);

  const publishedValue = snapshot.settings.find((item) => item.key === NAV_ORDER_SETTING)?.valueJson;
  const published = publishedArrangement(publishedValue, membership.role);

  function setMode(next: boolean) {
    remember(ARRANGE_MODE_KEY, String(next));
    setArranging(next);
    window.dispatchEvent(new Event(NAV_ORDER_EVENT));
  }

  function resetThisDevice() {
    forget(arrangementStorageKey(membership.role));
    window.dispatchEvent(new Event(NAV_ORDER_EVENT));
    toast(published ? 'กลับไปใช้การจัดเรียงของโรงเรียนแล้ว' : 'กลับไปใช้การจัดเรียงเริ่มต้นแล้ว');
  }

  async function publish() {
    if (!local || saving) return;
    setSaving(true);
    try {
      /*
       * Per role, and the other roles are carried through untouched.
       *
       * A menu is a different menu for each role, so publishing one must not blank the others —
       * which is what writing `{ [role]: … }` on its own would do, silently, the first time a
       * second administrator published theirs.
       */
      const existing = publishedValue && typeof publishedValue === 'object'
        ? publishedValue as Record<string, unknown>
        : {};
      await repository.saveSetting(NAV_ORDER_SETTING, { ...existing, [membership.role]: local });
      /*
       * And the device override goes, now that it is the school's.
       *
       * Left in place it would be identical today and stale tomorrow: the next person to publish a
       * change for this role would find this one device still showing the old arrangement, with
       * nothing on screen to explain why.
       */
      forget(arrangementStorageKey(membership.role));
      window.dispatchEvent(new Event(NAV_ORDER_EVENT));
      toast('บันทึกการจัดเรียงเมนูให้ทั้งโรงเรียนแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="menu-arrange-card">
      <CardHeader
        title="จัดเรียงเมนู"
        description="เปิดโหมดสลับ แล้วกดลูกศรขึ้นลงข้างหมวดหมู่หรือเมนูในแถบซ้าย · ค่านี้จำเฉพาะเครื่องนี้ ไม่ตามบัญชีไปเครื่องอื่น"
        action={<Badge tone={arranging ? 'brand' : 'neutral'}>{arranging ? 'กำลังจัดเรียง' : 'ปิดอยู่'}</Badge>}
      />

      <label className="menu-arrange-toggle">
        <input
          type="checkbox"
          checked={arranging}
          onChange={(event) => setMode(event.target.checked)}
        />
        <span>
          <strong>โหมดสลับช่องเมนูและหมวดหมู่</strong>
          <small>
            เปิดแล้วจะมีปุ่มลูกศรขึ้นลงข้างทุกหมวดและทุกเมนูในแถบซ้าย · เมนูย้ายได้เฉพาะภายในหมวดของตัวเอง
          </small>
        </span>
      </label>

      <div className="menu-arrange-state" role="status">
        <Icon name={local ? 'check' : 'eye'} size={16} />
        <span>
          <strong>
            {local
              ? 'เครื่องนี้ใช้การจัดเรียงของคุณเอง'
              : published
                ? 'เครื่องนี้ใช้การจัดเรียงที่โรงเรียนบันทึกไว้'
                : 'เครื่องนี้ใช้การจัดเรียงเริ่มต้น'}
          </strong>
          <small>
            {local
              ? 'คนอื่นที่เข้าด้วยบัญชีนี้บนเครื่องอื่นยังเห็นแบบเดิม'
              : 'ยังไม่ได้ปรับอะไรบนเครื่องนี้'}
          </small>
        </span>
      </div>

      <div className="menu-arrange-actions">
        <Button variant="ghost" disabled={!local} onClick={resetThisDevice}>
          คืนค่าเริ่มต้นของเครื่องนี้
        </Button>
        {/* Publishing changes what other people see, so it is the administrator's. A teacher keeps
            the whole of the device half — the part that was the point of asking. */}
        {isAdmin && (
          <Button variant="primary" loading={saving} disabled={!local} onClick={() => void publish()}>
            บันทึกให้ทั้งโรงเรียน ({membership.role === 'admin' ? 'ผู้ดูแลระบบ' : membership.role})
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="menu-arrange-note">
          การบันทึกให้ทุกคนเห็นเป็นสิทธิ์ของผู้ดูแลระบบ · การจัดเรียงของคุณยังอยู่บนเครื่องนี้ตามปกติ
        </p>
      )}
    </Card>
  );
}
