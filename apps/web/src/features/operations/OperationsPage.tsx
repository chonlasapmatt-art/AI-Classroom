import { useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { recall } from '../../app/deviceMemory';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { useSyncStatus } from '../../sync/SyncStatusContext';
import { Badge, Card, ForbiddenState } from '../../ui/components';
import { createEncryptedBackup, downloadBackup, inspectBackup, readBackupFile, restoreBackup, type BackupEnvelope, type BackupSummary } from '../backup/backup';
import { BlockedMutationsPanel } from './BlockedMutationsPanel';
import { ConflictPanel } from './ConflictPanel';
import { useToast } from '../../ui/toastContext';

export function OperationsPage() {
  const { membership, mode } = useSession();
  const snapshot = useSchoolSnapshot();
  const syncStatus = useSyncStatus();
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [pending, setPending] = useState<{ envelope: BackupEnvelope; password: string } | null>(null);
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

  async function inspect(file: File) {
    setBusy(true);
    try {
      const envelope = await readBackupFile(file);
      const password = window.prompt('ใส่รหัสที่ใช้ตอนสร้างไฟล์สำรอง');
      if (!password) { setBusy(false); return; }
      const result = await inspectBackup(envelope, password, membership.schoolId);
      setPending({ envelope, password });
      setSummary(result);
      toast('ตรวจไฟล์สำรองเรียบร้อย ตรวจจำนวนรายการก่อนกู้คืน');
    } catch (reason) {
      setSummary(null); setPending(null);
      toast(reason instanceof Error ? reason.message : 'อ่านไฟล์สำรองไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  async function restore(mode: 'merge' | 'replace') {
    if (!pending) return;
    if (mode === 'replace' && !window.confirm(
      'จะลบข้อมูลของโรงเรียนนี้ในเครื่องทั้งหมดก่อน แล้วเขียนข้อมูลจากไฟล์สำรองแทน\n' +
      'ข้อมูลที่ยังไม่ได้ซิงก์และไม่มีในไฟล์สำรองจะหายไป\n\nยืนยันดำเนินการ?'
    )) return;
    setBusy(true);
    try {
      const result = await restoreBackup(pending.envelope, pending.password, membership.schoolId, mode);
      toast(`กู้คืนแล้ว ${result.written} รายการ · ข้าม ${result.skipped} · ${result.tables} ตาราง`);
      setSummary(null); setPending(null);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'กู้คืนไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  async function backup() {
    const password = prompt('ตั้งรหัสเข้ารหัสไฟล์สำรอง (อย่างน้อย 12 ตัวอักษร)');
    if (!password) return;
    try {
      const deviceId = recall('device-id') ?? crypto.randomUUID();
      const envelope = await createEncryptedBackup(membership.schoolId, deviceId, password);
      downloadBackup(envelope);
      toast('สร้างไฟล์สำรองเข้ารหัสแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'สำรองข้อมูลไม่สำเร็จ', { tone: 'error' });
    }
  }

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
        <section className="page-heading">
          <div>
            <span className="eyebrow">สถานะข้อมูลของคุณ</span>
            <h1>Sync</h1>
            <p>ดูว่าข้อมูลที่บันทึกไว้ถึงเซิร์ฟเวอร์แล้วหรือยัง และสั่งซิงก์ได้เอง</p>
          </div>
        </section>

        <section className="metric-grid">
          <article className="metric-card violet"><span>รอซิงก์</span><strong>{snapshot.pendingSync}</strong><small>บันทึกไว้ในเครื่องแล้ว</small></article>
          <article className="metric-card amber"><span>ต้องตรวจสอบ</span><strong>{snapshot.blockedSync}</strong><small>แจ้งแอดมินหากค้างนาน</small></article>
          <article className="metric-card teal">
            <span>สถานะ</span>
            <strong className="metric-word">{syncStatus?.label ?? 'พร้อมใช้งาน'}</strong>
            <small>{syncStatus?.lastSyncedAt ? `ล่าสุด ${new Date(syncStatus.lastSyncedAt).toLocaleString('th-TH')}` : 'ยังไม่เคยซิงก์จากเครื่องนี้'}</small>
          </article>
        </section>

        <Card>
          <div className="panel-heading">
            <div><h2>ซิงก์ข้อมูลตอนนี้</h2><p>งานที่บันทึกตอนออฟไลน์จะถูกส่งตามลำดับเดิม และไม่มีอะไรถูกเขียนทับ</p></div>
            <Badge tone={syncStatus?.phase === 'synced' ? 'success' : syncStatus?.phase === 'error' ? 'danger' : syncStatus?.phase === 'offline' ? 'warning' : 'info'}>
              {syncStatus?.label ?? 'พร้อมใช้งาน'}
            </Badge>
          </div>
          {syncStatus?.detail && <p className="sync-detail">{syncStatus.detail}</p>}
          <button className="primary-button" onClick={() => void sync()} disabled={cloudDisabled || busy}>
            {cloudDisabled ? 'ปิดใช้งานในโหมด Preview' : busy ? 'กำลังซิงก์...' : 'Sync Now'}
          </button>
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
        <section className="page-heading">
          <div><span className="eyebrow">Administrator only</span><h1>Sync และ Backup</h1><p>พื้นที่ควบคุมข้อมูลและกู้คืนระบบของผู้ดูแลระบบ</p></div>
        </section>
        {/* Not an empty state: nothing is missing, the reader is simply not the person this screen
            is for. The two read very differently to somebody deciding whether to call support. */}
        <Card>
          <ForbiddenState
            message="หน้าควบคุม Sync และ Backup เปิดเฉพาะแอดมินของโรงเรียน"
            hint="ทุกบทบาทยังกดปุ่มซิงก์บนแถบด้านบนได้ตามปกติ · หน้านี้ใช้ตั้งค่าและกู้คืนข้อมูลทั้งโรงเรียน จึงจำกัดไว้ที่แอดมิน"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Diagnostics &amp; Recovery</span>
          <h1>Sync และ Backup</h1>
          <p>ตรวจสอบข้อมูลที่รอส่ง พื้นที่จัดเก็บ และสร้างไฟล์สำรองเข้ารหัส</p>
        </div>
      </section>

      {/* Conflicts come first: a queue that will not drain is usually a decision nobody has been
          asked to make, and every other number on this page is a symptom of it. */}
      <ConflictPanel />

      {/* And immediately after, the changes the server refused outright. The count below used to be
          the only thing anybody was told about them. */}
      <BlockedMutationsPanel />

      <section className="metric-grid">
        <article className="metric-card violet"><span>รอซิงก์</span><strong>{snapshot.pendingSync}</strong><small>ไม่ถูกลบอัตโนมัติ</small></article>
        <article className="metric-card amber"><span>ต้องตรวจสอบ</span><strong>{snapshot.blockedSync}</strong><small>ดูรายการและเหตุผลด้านบน</small></article>
        <article className="metric-card teal">
          <span>Persistence</span>
          <strong className="metric-word">{storage?.persisted ? 'ถาวร' : 'ยังไม่ถาวร'}</strong>
          <small>Browser storage</small>
        </article>
        <article className="metric-card blue">
          <span>พื้นที่ใช้แล้ว</span>
          <strong className="metric-word">{storage ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB` : '—'}</strong>
          <small>จาก {storage ? `${(storage.quota / 1024 / 1024).toFixed(0)} MB` : '—'}</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel action-panel">
          <h2>Two-way Synchronization</h2>
          <p>ลงทะเบียนอุปกรณ์ ส่ง queue แบบ batch แล้ว pull ด้วย server revision</p>
          <div className="sync-health-line"><Badge tone={syncStatus?.phase === 'synced' ? 'success' : syncStatus?.phase === 'error' ? 'danger' : syncStatus?.phase === 'offline' ? 'warning' : 'info'}>{syncStatus?.label ?? 'พร้อมใช้งาน'}</Badge><span>{syncStatus?.lastSyncedAt ? `ล่าสุด ${new Date(syncStatus.lastSyncedAt).toLocaleString('th-TH')}` : 'ยังไม่เคยซิงก์จากเครื่องนี้'}</span></div>
          {syncStatus?.detail && <p className="sync-detail">{syncStatus.detail}</p>}
          <button className="primary-button" onClick={() => void sync()} disabled={cloudDisabled || busy}>
            {cloudDisabled ? 'ปิดใช้งานในโหมด Preview' : busy ? 'กำลังซิงก์...' : 'Sync Now'}
          </button>
        </article>
        <article className="panel action-panel">
          <h2>สำรองข้อมูลแบบเข้ารหัส</h2>
          <p>AES-GCM + PBKDF2 พร้อม checksum ครอบคลุมข้อมูลทุกตาราง รวม byte ของไฟล์แนบที่ยังอยู่ในเครื่อง</p>
          <button className="secondary-button" onClick={() => void backup()} disabled={cloudDisabled || busy}>
            {cloudDisabled ? 'ปิดใช้งานในโหมด Preview' : 'สร้างไฟล์สำรอง'}
          </button>
        </article>
        <article className="panel action-panel">
          <h2>กู้คืนจากไฟล์สำรอง</h2>
          <p>ตรวจไฟล์และแสดงจำนวนรายการก่อน แล้วค่อยเขียนกลับ ค่าเริ่มต้นจะเก็บข้อมูลที่ใหม่กว่าในเครื่องไว้</p>
          <label className="file-field">
            เลือกไฟล์ .scbackup
            <input type="file" accept=".scbackup,application/json" disabled={cloudDisabled || busy}
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspect(file); event.target.value = ''; }} />
          </label>
          {summary && (
            <div className="restore-preview">
              <p>
                ไฟล์จากวันที่ {summary.exportedAt.slice(0, 10)} · schema v{summary.schemaVersion} · รวม {summary.totalRows} รายการ
              </p>
              <ul>
                {summary.counts.filter((entry) => entry.rows > 0).map((entry) => (
                  <li key={entry.table}>{entry.table}<strong>{entry.rows}</strong></li>
                ))}
              </ul>
              <div className="record-actions">
                <button className="primary-button" onClick={() => void restore('merge')} disabled={busy}>กู้คืนแบบรวมข้อมูล</button>
                <button className="danger-button" onClick={() => void restore('replace')} disabled={busy}>ล้างแล้วกู้คืนทั้งหมด</button>
                <button className="text-button" onClick={() => { setSummary(null); setPending(null); }}>ยกเลิก</button>
              </div>
            </div>
          )}
        </article>
      </section>

    </>
  );
}
