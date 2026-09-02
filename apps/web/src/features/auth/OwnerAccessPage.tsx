import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { isCompleteMemberRegistration, registerOwner } from './memberAccess';
import { AdminSchoolSetupPage } from './AdminSchoolSetupPage';

/**
 * Private owner-only entry. No public screen links to this route.
 *
 * It carries the account step only. Creating the account here grants nothing: the school, and with
 * it the administrator membership, comes from the same first-run wizard a customer sees, which is
 * reused below rather than duplicated. One activation screen means one place where the product key
 * is drawn and checked, and no second copy to drift out of step with the gateway.
 */
export function OwnerAccessPage() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await registerOwner({ firstName, lastName, password });
      if (result.outcome === 'session') { await auth.applySession(result.session); return; }
      setError(result.outcome === 'error' ? result.message : 'สร้างบัญชีไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  if (!auth.session) {
    return (
      <main className="setup-page">
        <form className="configuration-card" onSubmit={(event) => void createAccount(event)}>
          <span className="eyebrow">PRIVATE OWNER ENTRY</span>
          <h1>สร้างบัญชีเจ้าของระบบ</h1>
          <p>ใช้ชื่อกับรหัสผ่านเหมือนผู้ใช้ทั่วไป บัญชีนี้ยังไม่มีสิทธิ์ใด ๆ จนกว่าจะยืนยันรหัสเจ้าของในขั้นถัดไป</p>
          <div className="form-grid">
            <label>ชื่อจริง<input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="เช่น สมชาย" required /></label>
            <label>นามสกุล<input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="เช่น ใจดี" required /></label>
          </div>
          <label>รหัสผ่าน<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" required /></label>
          <label>ยืนยันรหัสผ่าน<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="พิมพ์รหัสผ่านเดิมอีกครั้ง" required /></label>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="primary-button" disabled={busy || !isCompleteMemberRegistration({ firstName, lastName, password, confirmPassword })}>
            {busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชีและไปขั้นถัดไป'}
          </button>
          <div className="owner-access-existing">
            <p className="fine-print">มีบัญชีแอดมินอยู่แล้ว?</p>
            <Link className="text-button" to="/admin-access">เข้าสู่ระบบแอดมิน</Link>
          </div>
        </form>
      </main>
    );
  }

  // The same mobile-friendly wizard used by the normal no-membership gate. It navigates away on its
  // own once the school exists, so nothing here has to track completion a second time.
  return <AdminSchoolSetupPage />;
}
