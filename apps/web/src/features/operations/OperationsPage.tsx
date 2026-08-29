import { useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { createEncryptedBackup, downloadBackup } from '../backup/backup';
import { registerAndSync } from '../../sync/engine';

export function OperationsPage() {
  const { membership, mode } = useSession();
  const snapshot = useSchoolSnapshot();
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const cloudDisabled = mode === 'preview';

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

      <section className="dashboard-grid">
        <article className="panel action-panel">
          <h2>Two-way Synchronization</h2>
          <p>ลงทะเบียนอุปกรณ์ ส่ง queue แบบ batch แล้ว pull ด้วย server revision</p>
          <button className="primary-button" onClick={() => void sync()} disabled={cloudDisabled}>
            {cloudDisabled ? 'ปิดใช้งานในโหมด Preview' : 'Sync Now'}
          </button>
        </article>
        <article className="panel action-panel">
          <h2>Encrypted Local Backup</h2>
          <p>AES-GCM + PBKDF2, checksum และตรวจ school scope</p>
          <button className="secondary-button" onClick={() => void backup()} disabled={cloudDisabled}>
            {cloudDisabled ? 'ปิดใช้งานในโหมด Preview' : 'สร้าง Backup'}
          </button>
        </article>
      </section>

      {message && <div className="toast" role="status" onClick={() => setMessage('')}>{message}</div>}
    </>
  );
}
