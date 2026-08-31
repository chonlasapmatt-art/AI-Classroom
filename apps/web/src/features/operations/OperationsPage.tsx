import { useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { createEncryptedBackup, downloadBackup, inspectBackup, readBackupFile, restoreBackup, type BackupEnvelope, type BackupSummary } from '../backup/backup';
import { registerAndSync } from '../../sync/engine';
import { ConflictPanel } from './ConflictPanel';

export function OperationsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState({ classCount: 2, studentsPerClass: 10, teacherCount: 2, includeActivity: true });
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [pending, setPending] = useState<{ envelope: BackupEnvelope; password: string } | null>(null);
  const cloudDisabled = mode === 'preview';
  // Seeding writes real records, so it is offered only where that is appropriate: a cloud-backed
  // school, to somebody who may manage structure.
  const showSeeding = !cloudDisabled && repository.canManageStructure && membership.role === 'admin';

  useEffect(() => {
    void Promise.all([navigator.storage.estimate(), navigator.storage.persisted()])
      .then(([estimate, persisted]) => setStorage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted }))
      .catch(() => setStorage(null));
  }, []);

  async function sync() {
    setMessage('กำลังซิงก์...');
    try {
      const deviceId = localStorage.getItem('device-id') ?? crypto.randomUUID();
      localStorage.setItem('device-id', deviceId);
      const type = /Android|iPad/i.test(navigator.userAgent) ? 'tablet' : 'desktop';
      const result = await registerAndSync(membership.schoolId, deviceId, navigator.userAgent.slice(0, 80), type);
      setMessage(`ส่ง ${result.accepted} · รับ ${result.pulled} · ต้องตรวจสอบ ${result.blocked}`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ซิงก์ไม่สำเร็จ');
    }
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
      setMessage('ตรวจไฟล์สำรองเรียบร้อย ตรวจจำนวนรายการก่อนกู้คืน');
    } catch (reason) {
      setSummary(null); setPending(null);
      setMessage(reason instanceof Error ? reason.message : 'อ่านไฟล์สำรองไม่สำเร็จ');
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
      setMessage(`กู้คืนแล้ว ${result.written} รายการ · ข้าม ${result.skipped} · ${result.tables} ตาราง`);
      setSummary(null); setPending(null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'กู้คืนไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function seedData() {
    const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];
    if (!term) { setMessage('ยังไม่มีปีการศึกษา สร้างที่หน้า “ปีการศึกษาและการเลื่อนชั้น” ก่อน'); return; }
    setBusy(true);
    try {
      const result = await repository.seedDevelopmentData({ ...seed, academicTermId: term.id });
      setMessage(`สร้างแล้ว: ${result.classes} ห้อง · ${result.students} นักเรียน · ${result.teachers} ครู · ${result.assignments} งาน`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'สร้างข้อมูลตัวอย่างไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function clearData() {
    if (!window.confirm('ลบเฉพาะข้อมูลที่ระบบสร้างเป็นตัวอย่าง ข้อมูลที่กรอกเองจะไม่ถูกแตะต้อง\n\nยืนยันลบ?')) return;
    setBusy(true);
    try {
      const result = await repository.clearDevelopmentData();
      setMessage(`ลบข้อมูลตัวอย่างแล้ว ${result.removed} รายการ`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ลบข้อมูลตัวอย่างไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function backup() {
    const password = prompt('ตั้งรหัสเข้ารหัสไฟล์สำรอง (อย่างน้อย 12 ตัวอักษร)');
    if (!password) return;
    try {
      const deviceId = localStorage.getItem('device-id') ?? crypto.randomUUID();
      const envelope = await createEncryptedBackup(membership.schoolId, deviceId, password);
      downloadBackup(envelope);
      setMessage('สร้างไฟล์สำรองเข้ารหัสแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'สำรองข้อมูลไม่สำเร็จ');
    }
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

      <section className="metric-grid">
        <article className="metric-card violet"><span>รอซิงก์</span><strong>{snapshot.pendingSync}</strong><small>ไม่ถูกลบอัตโนมัติ</small></article>
        <article className="metric-card amber"><span>ต้องตรวจสอบ</span><strong>{snapshot.blockedSync}</strong><small>conflict / authorization</small></article>
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

      {showSeeding && (
        <section className="panel data-panel">
          <div className="panel-heading">
            <h2>ข้อมูลตัวอย่างสำหรับทดสอบ</h2>
            <p>เขียนผ่านเส้นทางจริงทุกขั้น (ตรวจสอบ → Dexie transaction → sync queue) และลบได้เฉพาะสิ่งที่สร้างไว้</p>
          </div>
          <div className="form-grid">
            <label>จำนวนห้อง<input type="number" min={1} max={10} value={seed.classCount}
              onChange={(event) => setSeed({ ...seed, classCount: Number(event.target.value) })} /></label>
            <label>นักเรียนต่อห้อง<input type="number" min={1} max={60} value={seed.studentsPerClass}
              onChange={(event) => setSeed({ ...seed, studentsPerClass: Number(event.target.value) })} /></label>
            <label>จำนวนครู<input type="number" min={0} max={20} value={seed.teacherCount}
              onChange={(event) => setSeed({ ...seed, teacherCount: Number(event.target.value) })} /></label>
            <label className="checkbox-field">
              <input type="checkbox" checked={seed.includeActivity}
                onChange={(event) => setSeed({ ...seed, includeActivity: event.target.checked })} />
              สร้างงาน การเช็กชื่อ และผู้ปกครองตัวอย่างด้วย
            </label>
          </div>
          <div className="record-actions">
            <button className="secondary-button" onClick={() => void seedData()} disabled={busy}>สร้างข้อมูลตัวอย่าง</button>
            <button className="danger-button" onClick={() => void clearData()} disabled={busy}>ลบข้อมูลตัวอย่าง</button>
          </div>
          <p className="hint">ห้ามใช้กับโรงเรียนจริงที่มีข้อมูลผู้ใช้จริงแล้ว — ปุ่มนี้มีไว้สำหรับรอบทดสอบเท่านั้น</p>
        </section>
      )}

      <section className="dashboard-grid">
        <article className="panel action-panel">
          <h2>Two-way Synchronization</h2>
          <p>ลงทะเบียนอุปกรณ์ ส่ง queue แบบ batch แล้ว pull ด้วย server revision</p>
          <button className="primary-button" onClick={() => void sync()} disabled={cloudDisabled}>
            {cloudDisabled ? 'ปิดใช้งานในโหมด Preview' : 'Sync Now'}
          </button>
        </article>
        <article className="panel action-panel">
          <h2>สำรองข้อมูลแบบเข้ารหัส</h2>
          <p>AES-GCM + PBKDF2 พร้อม checksum ครอบคลุมทุกตารางของโรงเรียนนี้ ยกเว้นไฟล์แนบซึ่งดึงกลับได้จาก Storage</p>
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

      {message && <div className="toast" role="status" onClick={() => setMessage('')}>{message}</div>}
    </>
  );
}
