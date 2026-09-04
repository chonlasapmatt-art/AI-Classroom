import { useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { recall } from '../../app/deviceMemory';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { useSyncStatus } from '../../sync/SyncStatusContext';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, ForbiddenState, Modal,
  PageHeader, PasswordInput, Stat
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { createEncryptedBackup, downloadBackup, inspectBackup, readBackupFile, restoreBackup, type BackupEnvelope, type BackupSummary } from '../backup/backup';
import { BlockedMutationsPanel } from './BlockedMutationsPanel';
import { ConflictPanel } from './ConflictPanel';
import { useToast } from '../../ui/toastContext';

/** The shortest password the backup is allowed to be sealed with. */
const MIN_BACKUP_PASSWORD = 12;

const phaseTone = (phase: string | undefined) =>
  phase === 'synced' ? 'success' : phase === 'error' ? 'danger' : phase === 'offline' ? 'warning' : 'info';

export function OperationsPage() {
  const { membership, mode } = useSession();
  const snapshot = useSchoolSnapshot();
  const syncStatus = useSyncStatus();
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [pending, setPending] = useState<{ envelope: BackupEnvelope; password: string } | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupRepeat, setBackupRepeat] = useState('');
  const [askBackupPassword, setAskBackupPassword] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const cloudDisabled = mode === 'preview';

  useEffect(() => {
    // Not every browser has the Storage API — an older WebView and the test environment both lack
    // it — and reading it unguarded threw before the page rendered anything, so the whole screen
    // went blank over a number that is only ever shown as a hint.
    const storageApi = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storageApi?.estimate) { setStorage(null); return; }
    void Promise.all([
      storageApi.estimate(),
      storageApi.persisted?.() ?? Promise.resolve(false),
      storageApi.persist?.() ?? Promise.resolve(false)
    ])
      .then(([estimate, persisted, requested]) => setStorage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted: persisted || requested }))
      .catch(() => setStorage(null));
  }, []);

  async function sync() {
    if (busy) return;
    setBusy(true);
    toast('กำลังซิงก์...');
    try {
      const result = await syncStatus?.syncNow();
      toast(result ? `ซิงก์แล้ว · ส่ง ${result.accepted} · รับ ${result.pulled} · ตรวจสอบ ${result.blocked}` : (syncStatus?.detail || 'ยังไม่สามารถเริ่มซิงก์ได้'));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ซิงก์ไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  /*
    The password was collected with window.prompt, which shows what is being typed, cannot be
    confirmed against a second field, and could not enforce the twelve characters its own message
    asked for. Both passwords are now typed into the product's own field.
  */
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restoreFile || !restorePassword) return;
    setBusy(true);
    try {
      const envelope = await readBackupFile(restoreFile);
      const result = await inspectBackup(envelope, restorePassword, membership.schoolId);
      setPending({ envelope, password: restorePassword });
      setSummary(result);
      setRestoreFile(null);
      setRestorePassword('');
      toast('ตรวจไฟล์สำรองเรียบร้อย ตรวจจำนวนรายการก่อนกู้คืน');
    } catch (reason) {
      setSummary(null); setPending(null);
      toast(reason instanceof Error ? reason.message : 'อ่านไฟล์สำรองไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  async function restore(target: 'merge' | 'replace') {
    if (!pending) return;
    setConfirmReplace(false);
    setBusy(true);
    try {
      const result = await restoreBackup(pending.envelope, pending.password, membership.schoolId, target);
      toast(`กู้คืนแล้ว ${result.written} รายการ · ข้าม ${result.skipped} · ${result.tables} ตาราง`);
      setSummary(null); setPending(null);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'กู้คืนไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  async function backup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (backupPassword.length < MIN_BACKUP_PASSWORD || backupPassword !== backupRepeat) return;
    setBusy(true);
    try {
      const deviceId = recall('device-id') ?? crypto.randomUUID();
      const envelope = await createEncryptedBackup(membership.schoolId, deviceId, backupPassword);
      downloadBackup(envelope);
      setAskBackupPassword(false);
      setBackupPassword('');
      setBackupRepeat('');
      toast('สร้างไฟล์สำรองเข้ารหัสแล้ว เก็บรหัสไว้ให้ดี ไม่มีใครกู้คืนรหัสนี้ได้');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'สำรองข้อมูลไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  const syncBadge = (
    <Badge tone={phaseTone(syncStatus?.phase)}>{syncStatus?.label ?? 'พร้อมใช้งาน'}</Badge>
  );
  const lastSyncText = syncStatus?.lastSyncedAt
    ? `ซิงก์ล่าสุด ${new Date(syncStatus.lastSyncedAt).toLocaleString('th-TH')}`
    : 'ยังไม่เคยซิงก์จากเครื่องนี้';

  /*
   * A teacher gets the answer, not the controls.
   *
   * "Is my attendance actually on the server?" is a teacher's question as much as an admin's, and
   * sending them to find an admin to ask it is how a school ends up re-entering a register. So the
   * status, the queue depth and a manual sync are open to them. Creating and restoring a backup is
   * not: a restore rewrites the whole school's local database, and that is an admin's decision.
   */
  if (membership.role === 'teacher') {
    return (
      <>
        <PageHeader
          eyebrow="สถานะข้อมูลของคุณ"
          title="การซิงก์ข้อมูล"
          description="ดูว่าข้อมูลที่บันทึกไว้ถึงเซิร์ฟเวอร์แล้วหรือยัง และสั่งซิงก์ได้เอง"
        />

        <div className="ui-stat-grid">
          <Stat
            label="รอส่งขึ้นเซิร์ฟเวอร์"
            value={snapshot.pendingSync}
            hint={snapshot.pendingSync === 0 ? 'ส่งครบแล้ว' : 'บันทึกไว้ในเครื่องแล้ว ไม่หาย'}
            tone={snapshot.pendingSync === 0 ? 'success' : 'info'}
            icon={<Icon name="upload" size={18} />}
          />
          <Stat
            label="ต้องให้แอดมินตรวจ"
            value={snapshot.blockedSync}
            hint={snapshot.blockedSync === 0 ? 'ไม่มีรายการค้าง' : 'แจ้งแอดมินหากค้างนาน'}
            tone={snapshot.blockedSync === 0 ? 'success' : 'warning'}
            icon={<Icon name="warning" size={18} />}
          />
          <Stat
            label="สถานะการเชื่อมต่อ"
            value={syncStatus?.label ?? 'พร้อมใช้งาน'}
            hint={lastSyncText}
            tone={phaseTone(syncStatus?.phase)}
            icon={<Icon name="sync" size={18} />}
          />
        </div>

        <Card>
          <CardHeader
            title="ซิงก์ข้อมูลตอนนี้"
            description="งานที่บันทึกตอนออฟไลน์จะถูกส่งตามลำดับเดิม และไม่มีอะไรถูกเขียนทับ"
            action={syncBadge}
          />
          {syncStatus?.detail && <p className="sync-detail">{syncStatus.detail}</p>}
          <div className="ui-form-actions">
            <Button variant="primary" onClick={() => void sync()} loading={busy} disabled={cloudDisabled} icon={<Icon name="refresh" size={16} />}>
              {cloudDisabled ? 'ใช้ไม่ได้ในโหมดตัวอย่าง' : 'ซิงก์ตอนนี้'}
            </Button>
          </div>
          <p className="field-hint">
            การสร้างและกู้คืนไฟล์สำรองเป็นสิทธิ์ของแอดมินโรงเรียน เพราะการกู้คืนเขียนทับฐานข้อมูลในเครื่องทั้งโรงเรียน
          </p>
        </Card>
      </>
    );
  }

  if (membership.role !== 'admin') {
    return (
      <>
        <PageHeader
          eyebrow="เฉพาะผู้ดูแลระบบ"
          title="การซิงก์และสำรองข้อมูล"
          description="พื้นที่ควบคุมข้อมูลและกู้คืนระบบของผู้ดูแลระบบ"
        />
        {/* Not an empty state: nothing is missing, the reader is simply not the person this screen
            is for. The two read very differently to somebody deciding whether to call support. */}
        <Card>
          <ForbiddenState
            message="หน้าควบคุมการซิงก์และสำรองข้อมูลเปิดเฉพาะแอดมินของโรงเรียน"
            hint="ทุกบทบาทยังกดปุ่มซิงก์บนแถบด้านบนได้ตามปกติ · หน้านี้ใช้ตั้งค่าและกู้คืนข้อมูลทั้งโรงเรียน จึงจำกัดไว้ที่แอดมิน"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="ตรวจสอบและกู้คืน"
        title="การซิงก์และสำรองข้อมูล"
        description="ตรวจข้อมูลที่รอส่ง พื้นที่จัดเก็บบนเครื่องนี้ และสร้างไฟล์สำรองที่เข้ารหัสไว้"
      />

      {/* Conflicts come first: a queue that will not drain is usually a decision nobody has been
          asked to make, and every other number on this page is a symptom of it. */}
      <ConflictPanel />

      {/* And immediately after, the changes the server refused outright. The count below used to be
          the only thing anybody was told about them. */}
      <BlockedMutationsPanel />

      <div className="ui-stat-grid">
        <Stat
          label="รอส่งขึ้นเซิร์ฟเวอร์"
          value={snapshot.pendingSync}
          hint={snapshot.pendingSync === 0 ? 'ส่งครบแล้ว' : 'ไม่ถูกลบอัตโนมัติ'}
          tone={snapshot.pendingSync === 0 ? 'success' : 'info'}
          icon={<Icon name="upload" size={18} />}
        />
        <Stat
          label="ต้องตรวจสอบ"
          value={snapshot.blockedSync}
          hint={snapshot.blockedSync === 0 ? 'ไม่มีรายการค้าง' : 'ดูรายการและเหตุผลด้านบน'}
          tone={snapshot.blockedSync === 0 ? 'success' : 'warning'}
          icon={<Icon name="warning" size={18} />}
        />
        <Stat
          label="ที่เก็บข้อมูลบนเครื่อง"
          value={storage?.persisted ? 'ถาวร' : 'ยังไม่ถาวร'}
          hint={storage?.persisted ? 'เบราว์เซอร์จะไม่ลบทิ้งเอง' : 'เบราว์เซอร์อาจล้างเมื่อพื้นที่ไม่พอ'}
          tone={storage?.persisted ? 'success' : 'warning'}
          icon={<Icon name="settings" size={18} />}
        />
        <Stat
          label="พื้นที่ที่ใช้ไป"
          value={storage ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB` : '—'}
          hint={storage ? `จากที่ใช้ได้ ${(storage.quota / 1024 / 1024).toFixed(0)} MB` : 'เบราว์เซอร์นี้ไม่บอกขนาดพื้นที่'}
          tone="neutral"
          icon={<Icon name="download" size={18} />}
        />
      </div>

      <Card>
        <CardHeader
          title="ซิงก์สองทางกับเซิร์ฟเวอร์"
          description="ส่งงานที่ค้างอยู่ในเครื่องขึ้นไปตามลำดับเดิม แล้วดึงการเปลี่ยนแปลงจากเครื่องอื่นลงมา"
          action={syncBadge}
        />
        <p className="sync-detail">{syncStatus?.detail ?? lastSyncText}</p>
        <div className="ui-form-actions">
          <Button variant="primary" onClick={() => void sync()} loading={busy} disabled={cloudDisabled} icon={<Icon name="refresh" size={16} />}>
            {cloudDisabled ? 'ใช้ไม่ได้ในโหมดตัวอย่าง' : 'ซิงก์ตอนนี้'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="สร้างไฟล์สำรองแบบเข้ารหัส"
          description="ครอบคลุมข้อมูลทุกตารางของโรงเรียนนี้ รวมไฟล์แนบที่ยังอยู่ในเครื่อง · ไฟล์ถูกเข้ารหัสด้วยรหัสที่คุณตั้งเอง และไม่มีใครกู้รหัสนั้นคืนได้"
        />
        <div className="ui-form-actions">
          <Button variant="secondary" onClick={() => setAskBackupPassword(true)} disabled={cloudDisabled || busy} icon={<Icon name="download" size={16} />}>
            {cloudDisabled ? 'ใช้ไม่ได้ในโหมดตัวอย่าง' : 'สร้างไฟล์สำรอง'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="กู้คืนจากไฟล์สำรอง"
          description="ระบบจะตรวจไฟล์และบอกจำนวนรายการให้ดูก่อนเสมอ แล้วคุณจึงเลือกว่าจะรวมข้อมูลหรือเขียนทับ"
        />
        {!summary ? (
          <form onSubmit={(event) => void inspect(event)}>
            <Field label="ไฟล์สำรอง (.scbackup)" hint={restoreFile ? `เลือกแล้ว: ${restoreFile.name}` : 'เลือกไฟล์ที่สร้างจากหน้านี้'}>
              <input
                type="file" accept=".scbackup,application/json" disabled={cloudDisabled || busy}
                onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
              />
            </Field>
            <Field label="รหัสของไฟล์สำรอง" hint="รหัสเดียวกับตอนที่สร้างไฟล์นี้">
              <PasswordInput
                value={restorePassword}
                onChange={setRestorePassword}
                placeholder="รหัสที่ตั้งไว้ตอนสร้างไฟล์"
                autoComplete="off"
                disabled={cloudDisabled || busy}
              />
            </Field>
            <div className="ui-form-actions">
              <Button variant="secondary" loading={busy} disabled={!restoreFile || !restorePassword || cloudDisabled} icon={<Icon name="eye" size={16} />}>
                ตรวจไฟล์ก่อนกู้คืน
              </Button>
            </div>
          </form>
        ) : (
          <div className="restore-preview">
            <p>
              ไฟล์จากวันที่ {summary.exportedAt.slice(0, 10)} · โครงสร้างข้อมูลรุ่นที่ {summary.schemaVersion} · รวม {summary.totalRows} รายการ
            </p>
            {summary.totalRows === 0 ? (
              <EmptyState
                icon={<Icon name="warning" size={28} />}
                title="ไฟล์นี้ไม่มีข้อมูล"
                description="ตรวจว่าเลือกไฟล์ถูกใบหรือไม่ · การกู้คืนไฟล์เปล่าจะไม่เขียนอะไรเลย"
              />
            ) : (
              <ul>
                {summary.counts.filter((entry) => entry.rows > 0).map((entry) => (
                  <li key={entry.table}>{entry.table}<strong>{entry.rows}</strong></li>
                ))}
              </ul>
            )}
            <div className="ui-form-actions">
              <Button variant="ghost" onClick={() => { setSummary(null); setPending(null); }}>ยกเลิก</Button>
              <Button variant="danger" onClick={() => setConfirmReplace(true)} disabled={busy} icon={<Icon name="warning" size={16} />}>
                ล้างแล้วกู้คืนทั้งหมด
              </Button>
              <Button variant="primary" onClick={() => void restore('merge')} loading={busy} icon={<Icon name="check" size={16} />}>
                กู้คืนแบบรวมข้อมูล
              </Button>
            </div>
          </div>
        )}
      </Card>

      {askBackupPassword && (
        <Modal
          title="ตั้งรหัสสำหรับไฟล์สำรอง"
          description="ไฟล์สำรองถูกเข้ารหัสด้วยรหัสนี้ · ถ้าลืม จะไม่มีใครเปิดไฟล์ได้อีกเลย รวมถึงทีมผู้ดูแลระบบ"
          onClose={() => setAskBackupPassword(false)}
        >
          <form onSubmit={(event) => void backup(event)}>
            <Field
              label="รหัสไฟล์สำรอง"
              hint={`อย่างน้อย ${MIN_BACKUP_PASSWORD} ตัวอักษร`}
              {...(backupPassword && backupPassword.length < MIN_BACKUP_PASSWORD
                ? { error: `สั้นไป ${MIN_BACKUP_PASSWORD - backupPassword.length} ตัวอักษร` }
                : {})}
            >
              <PasswordInput value={backupPassword} onChange={setBackupPassword} autoComplete="new-password" placeholder="ตั้งรหัสที่จำได้และเดายาก" />
            </Field>
            <Field
              label="พิมพ์รหัสอีกครั้ง"
              {...(backupRepeat && backupRepeat !== backupPassword ? { error: 'รหัสสองช่องยังไม่ตรงกัน' } : {})}
            >
              <PasswordInput value={backupRepeat} onChange={setBackupRepeat} autoComplete="new-password" placeholder="พิมพ์ซ้ำเพื่อยืนยัน" />
            </Field>
            <div className="ui-form-actions">
              <Button type="button" variant="ghost" onClick={() => setAskBackupPassword(false)}>ยกเลิก</Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={backupPassword.length < MIN_BACKUP_PASSWORD || backupPassword !== backupRepeat}
                icon={<Icon name="download" size={16} />}
              >
                สร้างและดาวน์โหลด
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/*
        Was window.confirm on the one action here that deletes a school's local data outright. The
        browser box could not be styled, could not be reached by the page's own focus handling, and
        put the two consequences on one line separated by "\n".
      */}
      {confirmReplace && (
        <ConfirmDialog
          title="ล้างข้อมูลในเครื่องแล้วกู้คืนทั้งหมด"
          description={
            'ข้อมูลของโรงเรียนนี้ที่อยู่ในเครื่องจะถูกลบก่อน แล้วเขียนข้อมูลจากไฟล์สำรองแทน · '
            + 'สิ่งที่ยังไม่ได้ซิงก์และไม่มีในไฟล์สำรองจะหายไปและเรียกกลับไม่ได้ · '
            + 'ถ้าไม่แน่ใจ ให้เลือก “กู้คืนแบบรวมข้อมูล” แทน ซึ่งเก็บของที่ใหม่กว่าในเครื่องไว้'
          }
          confirmLabel="ล้างแล้วกู้คืนทั้งหมด"
          onCancel={() => setConfirmReplace(false)}
          onConfirm={() => void restore('replace')}
        />
      )}
    </>
  );
}
