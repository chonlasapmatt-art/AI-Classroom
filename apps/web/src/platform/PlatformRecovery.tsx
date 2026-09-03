// The two things a customer can lose that only the platform operator can give back.
//
// A school administrator is the top of their own school. When they lose the product key that
// activates their server, or the password that opens their account, there is nobody inside the
// school to ask — which until now meant there was nobody at all. Both answers live here.
//
// The two are not the same kind of act, and the screen says so rather than pretending otherwise:
//
//   * A product key is *revealed*. The key was sealed when it was drawn and the seal opens, so the
//     customer gets back the exact key they were sold rather than a different one that also works.
//   * A password is *reset*. Nothing in this system can read a password back — GoTrue holds a bcrypt
//     hash, which is the right thing for it to hold — so the operator issues a new one and reads it
//     out. Saying "reveal" here would be a lie about what the button does.
//
// Both go through the same gate as suspending a school: a reason, a password proved in the last
// fifteen minutes, and a permanent record. The plaintext each one produces is shown once, is never
// written to storage, and is gone as soon as the panel is dismissed.

import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, Skeleton, Toolbar
} from '../ui/components';
import { formatMoment, useDangerousAction } from './consoleHelpers';
import { DangerousActionDialog } from './ReauthGate';
import {
  platformProductKeys, platformSchoolAccounts, platformSchools, resetMemberPassword, revealProductKey,
  type ProductKeyRow, type SchoolAccountRow, type SchoolSummary
} from './platformClient';

const keyStatusLabel: Record<ProductKeyRow['status'], string> = {
  issued: 'ยังไม่ได้ใช้', consumed: 'ใช้เปิดโรงเรียนแล้ว', replaced: 'ถูกแทนที่'
};
const keyStatusTone: Record<ProductKeyRow['status'], 'warning' | 'success' | 'neutral'> = {
  issued: 'warning', consumed: 'success', replaced: 'neutral'
};
const roleLabel: Record<SchoolAccountRow['role'], string> = {
  admin: 'ผู้ดูแลโรงเรียน', teacher: 'ครู', parent: 'ผู้ปกครอง'
};

/**
 * A secret on screen for as long as the operator needs to read it out, and no longer.
 *
 * There is no "show again". The value came from one response and was never stored, so a second look
 * is a second request with a second reason attached — which is the property that makes the record
 * of these actions worth keeping.
 */
function OneTimeSecret({ title, note, value, onDismiss }: {
  title: string; note: string; value: string; onDismiss(): void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="alert success one-time-secret" role="status">
      <strong>{title}</strong>
      <code className="one-time-secret-value">{value}</code>
      <p className="field-hint">{note}</p>
      <div className="one-time-secret-actions">
        <Button
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => undefined);
          }}
        >
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>ปิดและล้างออกจากหน้าจอ</Button>
      </div>
    </div>
  );
}

function ProductKeysSection({ onRequest }: { onRequest: ReturnType<typeof useDangerousAction>['request'] }) {
  const [rows, setRows] = useState<ProductKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ hint: string; productKey: string } | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    return platformProductKeys()
      .then(setRows)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'โหลดคีย์ไม่สำเร็จ'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  function askToReveal(row: ProductKeyRow) {
    onRequest({
      summary: `เปิดอ่านคีย์ ${row.hint} ของ ${row.actorName ?? 'บัญชีที่ออกคีย์'}`,
      consequence: 'คีย์จะแสดงเป็นข้อความเต็มหนึ่งครั้ง และการเปิดอ่านครั้งนี้จะถูกบันทึกถาวรพร้อมเหตุผล',
      confirmLabel: 'เปิดอ่านคีย์',
      run: async (reason) => {
        const result = await revealProductKey({ keyId: row.keyId, reason });
        setRevealed({ hint: row.hint, productKey: result.productKey });
        await refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="คีย์ผลิตภัณฑ์ของลูกค้า"
        description="คีย์ที่ลูกค้าใช้เปิดใช้งานเซิร์ฟเวอร์ของตัวเอง ระบบออกให้บัญชีละหนึ่งคีย์ และสุ่มใหม่ไม่ได้"
        action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
      />
      {revealed && (
        <OneTimeSecret
          title={`คีย์ของ ${revealed.hint}`}
          value={revealed.productKey}
          note="แสดงครั้งเดียว ไม่ถูกเก็บไว้ในหน้าจอนี้ หากต้องดูอีกครั้งต้องขอใหม่พร้อมเหตุผลใหม่"
          onDismiss={() => setRevealed(null)}
        />
      )}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {!rows ? <Skeleton lines={5} /> : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีคีย์ที่ออกให้" description="คีย์จะถูกสร้างตอนลูกค้าเปิดหน้าตั้งค่าโรงเรียนครั้งแรก" />
      ) : (
        <DataTable
          caption="คีย์ผลิตภัณฑ์ทั้งหมด"
          head={<tr><th>คีย์</th><th>บัญชีที่ออกคีย์</th><th>โรงเรียน</th><th>สถานะ</th><th>ออกเมื่อ</th><th>เปิดอ่านแล้ว</th><th /></tr>}
        >
          {rows.map((row) => (
            <tr key={row.keyId}>
              <td><code>{row.hint}</code></td>
              <td>{row.actorName ?? '—'}</td>
              <td>{row.schoolName ? `${row.schoolName} (${row.schoolCode})` : '—'}</td>
              <td><Badge tone={keyStatusTone[row.status]}>{keyStatusLabel[row.status]}</Badge></td>
              <td>{formatMoment(row.issuedAt)}</td>
              <td>{row.revealCount > 0 ? `${row.revealCount} ครั้ง · ${formatMoment(row.lastRevealedAt)}` : '—'}</td>
              <td>
                {row.recoverable
                  ? <Button onClick={() => askToReveal(row)}>เปิดอ่านคีย์</Button>
                  // Sealed copies arrived after the first keys did. Those have a digest and nothing
                  // else, so nobody can recover them — saying so beats a button that always fails.
                  : <span className="field-hint">ออกก่อนระบบเก็บสำเนา · กู้ไม่ได้</span>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}

function PasswordRecoverySection({ onRequest }: { onRequest: ReturnType<typeof useDangerousAction>['request'] }) {
  const [schools, setSchools] = useState<SchoolSummary[] | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [accounts, setAccounts] = useState<SchoolAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ displayName: string; password: string } | null>(null);

  useEffect(() => {
    void platformSchools()
      .then(setSchools)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'โหลดรายชื่อโรงเรียนไม่สำเร็จ'));
  }, []);

  const loadAccounts = useCallback((id: string) => {
    if (!id) { setAccounts(null); return Promise.resolve(); }
    setError(null);
    return platformSchoolAccounts(id)
      .then(setAccounts)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'โหลดบัญชีไม่สำเร็จ'));
  }, []);
  useEffect(() => { void loadAccounts(schoolId); }, [schoolId, loadAccounts]);

  function askToReset(row: SchoolAccountRow) {
    onRequest({
      summary: `ตั้งรหัสผ่านใหม่ให้ ${row.displayName} (${roleLabel[row.role]})`,
      consequence: 'ระบบจะสุ่มรหัสผ่านใหม่และรหัสเดิมจะใช้ไม่ได้ทันที · รหัสใหม่แสดงครั้งเดียวให้คุณอ่านให้เจ้าของบัญชี',
      confirmLabel: 'ตั้งรหัสผ่านใหม่',
      run: async (reason) => {
        const result = await resetMemberPassword({ profileId: row.profileId, schoolId, reason });
        setIssued({ displayName: result.displayName || row.displayName, password: result.password });
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="กู้บัญชีที่โรงเรียนแก้เองไม่ได้"
        description="ผู้ดูแลโรงเรียนไม่มีใครอยู่เหนือกว่าในโรงเรียนของตัวเอง เมื่อลืมรหัสผ่านจึงต้องให้ผู้ดูแลแพลตฟอร์มตั้งใหม่ให้"
      />
      <div className="alert info" role="note">
        ระบบอ่านรหัสผ่านเดิมไม่ได้ ไม่ว่าใครก็ตาม เพราะเก็บเป็น bcrypt hash · สิ่งที่ทำได้คือตั้งรหัสใหม่แล้วอ่านให้เจ้าของบัญชี
      </div>
      {issued && (
        <OneTimeSecret
          title={`รหัสผ่านใหม่ของ ${issued.displayName}`}
          value={issued.password}
          note="แสดงครั้งเดียว · แจ้งเจ้าของบัญชีแล้วให้เปลี่ยนเป็นรหัสของตัวเองทันทีที่เข้าระบบได้"
          onDismiss={() => setIssued(null)}
        />
      )}
      <Toolbar>
        <Field label="โรงเรียน">
          <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
            <option value="">เลือกโรงเรียน</option>
            {(schools ?? []).map((school) => (
              <option key={school.schoolId} value={school.schoolId}>{school.name} ({school.code})</option>
            ))}
          </select>
        </Field>
      </Toolbar>
      {error && <ErrorState message={error} />}
      {!schoolId ? (
        <EmptyState title="เลือกโรงเรียนก่อน" description="เลือกโรงเรียนที่ผู้ใช้แจ้งปัญหาเข้ามา แล้วจึงเลือกบัญชี" />
      ) : !accounts ? <Skeleton lines={4} /> : accounts.length === 0 ? (
        <EmptyState title="โรงเรียนนี้ยังไม่มีบัญชีบุคลากร" description="บัญชีนักเรียนใช้ชื่อกับเลขประจำตัว ไม่มีรหัสผ่านให้ตั้งใหม่" />
      ) : (
        <DataTable
          caption="บัญชีในโรงเรียนที่เลือก"
          head={<tr><th>ชื่อ</th><th>บทบาท</th><th>สถานะบัญชี</th><th /></tr>}
        >
          {accounts.map((row) => (
            <tr key={row.profileId}>
              <td>{row.displayName}</td>
              <td>{roleLabel[row.role]}</td>
              <td>
                <Badge tone={row.accountStatus === 'active' ? 'success' : 'warning'}>
                  {row.accountStatus === 'active' ? 'ใช้งานได้' : 'ถูกระงับ'}
                </Badge>
              </td>
              <td>
                {row.isPlatformAdmin
                  // One operator resetting another's password would be taking the account with a
                  // reason field for cover. A platform operator recovers through the enrolment code.
                  ? <span className="field-hint">ผู้ดูแลแพลตฟอร์ม · ตั้งรหัสให้กันไม่ได้</span>
                  : <Button onClick={() => askToReset(row)}>ตั้งรหัสผ่านใหม่</Button>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}

export function RecoveryPage() {
  const { pending, request, dismiss } = useDangerousAction();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      {notice && <div className="alert success" role="status">{notice}</div>}
      <ProductKeysSection onRequest={request} />
      <PasswordRecoverySection onRequest={request} />
      {pending && (
        <DangerousActionDialog action={pending} onClose={dismiss} onDone={setNotice} />
      )}
    </>
  );
}
