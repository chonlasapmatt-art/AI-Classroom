import { useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useTheme } from '../../app/ThemeContext';
import { isCompleteMemberLogin, memberLogin, type MemberAccountChoice } from './memberAccess';
import { Button, PasswordInput } from '../../ui/components';

/** A separate, deliberately quiet entrance for the school administrator. */
export function AdminLoginPage() {
  const auth = useAuth();
  const { motion } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [accounts, setAccounts] = useState<MemberAccountChoice[]>([]);
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await memberLogin({ role: 'admin', displayName, password, ...(profileId ? { profileId } : {}) });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      if (result.outcome === 'account-required') {
        setAccounts(result.accounts);
        setError('มีบัญชีผู้ดูแลชื่อนี้มากกว่าหนึ่งโรงเรียน กรุณาเลือกโรงเรียน');
      } else setError(result.message);
    } finally { setBusy(false); }
  }

  return (
    <main className={`admin-access-page ${motion === 'reduced' ? 'reduced-motion' : ''}`}>
      <div className="admin-access-orbit admin-access-orbit-one" aria-hidden="true" />
      <div className="admin-access-orbit admin-access-orbit-two" aria-hidden="true" />
      <section className="admin-access-card" aria-labelledby="admin-access-title">
        <div className="admin-access-heading">
          <div className="brand-mark">SC</div>
          <span className="eyebrow">PRIVATE CONTROL ROOM</span>
          <h1 id="admin-access-title">เข้าสู่ศูนย์ควบคุม</h1>
          <p>พื้นที่เฉพาะสำหรับผู้ดูแลโรงเรียน จัดการห้องเรียน บุคลากร นักเรียน และระบบทั้งหมด</p>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            ชื่อผู้ดูแล
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="ชื่อที่แอดมินกำหนดไว้" autoComplete="username" required />
          </label>
          <label>
            รหัสผ่าน
            <PasswordInput value={password} onChange={setPassword} placeholder="รหัสผ่านศูนย์ควบคุม" autoComplete="current-password" required />
          </label>
          {accounts.length > 0 && (
            <label>
              โรงเรียน
              <select value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
                <option value="">เลือกโรงเรียน</option>
                {accounts.map((account) => <option key={account.profileId} value={account.profileId}>{account.schoolName}</option>)}
              </select>
            </label>
          )}
          {error && <div className="alert error" role="alert">{error}</div>}
          <Button variant="primary" size="lg" className="big-button" loading={busy} disabled={!isCompleteMemberLogin(displayName, password)}>
            เข้าสู่ศูนย์ควบคุม
          </Button>
          <p className="admin-access-security"><span aria-hidden="true">◆</span> ตรวจสอบสิทธิ์จากระบบจริง · ผู้ใช้ทั่วไปไม่มีสิทธิ์เข้าพื้นที่นี้</p>
          <Link className="text-button admin-access-back" to="/login">กลับไปหน้าเข้าสู่ระบบทั่วไป</Link>
        </form>
      </section>
    </main>
  );
}
