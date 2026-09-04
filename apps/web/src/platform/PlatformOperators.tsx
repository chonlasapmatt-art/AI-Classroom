import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, FieldGroup,
  PageHeader, Skeleton
} from '../ui/components';
import { DangerousActionDialog } from './ReauthGate';
import { useDangerousAction } from './consoleHelpers';
import {
  listPlatformOperators, provisionPlatformOperator, revokePlatformAdminAccount,
  type PlatformOperator
} from './platformClient';

/**
 * Who can operate this platform, and whether any of them is also somebody's school administrator.
 *
 * `platform_admins` has always kept authority separate from membership. What it could not say, from
 * inside the console, was who held it — there was no screen for the table at all, so an operator
 * granted last year was invisible until somebody read the database. Revoking existed as an endpoint
 * with nothing to call it.
 *
 * The membership column is the point of the "แยกจากแอดมินโรงเรียน" work: an operator created here
 * belongs to no school, and one carried over from before might. Saying which is which is how the
 * separation gets finished rather than assumed.
 */
export function PlatformOperatorsPage() {
  const [operators, setOperators] = useState<PlatformOperator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { pending, request, dismiss } = useDangerousAction();

  const load = useCallback(async () => {
    setError(null);
    try { setOperators(await listPlatformOperators()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'โหลดรายชื่อผู้ดูแลไม่สำเร็จ'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const problem = displayName.trim().length < 2 ? 'กรอกชื่อผู้ดูแลอย่างน้อย 2 ตัวอักษร'
    : password.length < 12 ? 'รหัสผ่านอย่างน้อย 12 ตัวอักษร'
      : password !== confirm ? 'รหัสผ่านสองช่องยังไม่ตรงกัน' : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null); setError(null);
    if (problem) return;
    request({
      summary: `สร้างผู้ดูแลแพลตฟอร์ม ${displayName.trim()}`,
      consequence: 'บัญชีนี้จะเห็นข้อมูลของทุกโรงเรียนบนแพลตฟอร์ม และเข้าสู่ศูนย์ปฏิบัติการได้ทันที · การสร้างถูกบันทึกไว้ในประวัติความปลอดภัย',
      confirmLabel: 'สร้างผู้ดูแล',
      run: async () => {
        await provisionPlatformOperator({ displayName: displayName.trim(), password, notes: notes.trim() });
        setMessage(`สร้างผู้ดูแล ${displayName.trim()} แล้ว · บัญชีนี้ไม่สังกัดโรงเรียนใด`);
        setDisplayName(''); setPassword(''); setConfirm(''); setNotes('');
        await load();
      }
    });
  }

  function revoke(operator: PlatformOperator) {
    request({
      summary: `เพิกถอนสิทธิ์แพลตฟอร์มของ ${operator.displayName}`,
      consequence: 'บัญชีนี้จะเข้าศูนย์ปฏิบัติการไม่ได้อีก และ Support Session ที่เปิดค้างไว้จะถูกปิดทันที · บัญชีไม่ถูกลบ ประวัติยังอ่านได้',
      confirmLabel: 'เพิกถอนสิทธิ์',
      minimumReasonLength: 4,
      run: async (reason) => {
        await revokePlatformAdminAccount({ profileId: operator.profileId, reason });
        setMessage(`เพิกถอนสิทธิ์ของ ${operator.displayName} แล้ว`);
        await load();
      }
    });
  }

  const active = (operators ?? []).filter((item) => item.status === 'active' && !item.revokedAt);
  const mixed = active.filter((item) => item.schoolMemberships > 0);

  return (
    <>
      <PageHeader
        eyebrow="สิทธิ์ระดับแพลตฟอร์ม"
        title="ผู้ดูแลแพลตฟอร์ม"
        description="บัญชีที่เห็นทุกโรงเรียน · แยกจากแอดมินของโรงเรียนโดยสิ้นเชิง"
      />

      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {/* Not a failure, and not hidden either: an operator from before the accounts were separated
          still administers a school, and the console should say so rather than let it pass. */}
      {mixed.length > 0 && (
        <div className="inline-warning" role="status">
          <Badge tone="warning">ยังปนกันอยู่</Badge>
          <span>
            มีผู้ดูแลแพลตฟอร์ม {mixed.length} บัญชีที่ยังเป็นแอดมินของโรงเรียนด้วย ·
            สร้างบัญชีผู้ดูแลที่ไม่สังกัดโรงเรียนแล้วเพิกถอนบัญชีเดิมเพื่อแยกให้ขาด
          </span>
        </div>
      )}

      <Card>
        <CardHeader
          title={`ผู้ดูแลที่ใช้งานอยู่ ${active.length} คน`}
          description="เพิกถอนคนสุดท้ายไม่ได้ · แพลตฟอร์มที่ไม่มีผู้ดูแลเลยจะกู้จากข้างในไม่ได้"
        />
        {operators === null ? <Skeleton lines={4} /> : operators.length === 0 ? (
          <EmptyState
            title="ยังไม่มีผู้ดูแลแพลตฟอร์ม"
            description="สร้างคนแรกได้จากหน้าเข้าสู่ระบบด้วยรหัสสิทธิ์"
          />
        ) : (
          <DataTable
            caption="ผู้ดูแลแพลตฟอร์ม"
            head={
              <tr>
                <th>ชื่อผู้ดูแล</th><th>สถานะ</th><th>สังกัดโรงเรียน</th>
                <th>ยืนยันสองชั้น</th><th>ให้สิทธิ์เมื่อ</th><th>เข้าใช้ล่าสุด</th><th />
              </tr>
            }
          >
            {operators.map((operator) => (
              <tr key={operator.profileId}>
                <td><strong>{operator.displayName || '—'}</strong></td>
                <td>
                  <Badge tone={operator.status === 'active' && !operator.revokedAt ? 'success' : 'neutral'}>
                    {operator.status === 'active' && !operator.revokedAt ? 'ใช้งานอยู่' : 'ถูกเพิกถอน'}
                  </Badge>
                </td>
                <td>
                  {operator.schoolMemberships === 0
                    ? <Badge tone="success">ไม่สังกัด</Badge>
                    : <Badge tone="warning">{operator.schoolMemberships} โรงเรียน</Badge>}
                </td>
                <td>
                  {operator.mfaEnrolledAt
                    ? <Badge tone="success">เปิดแล้ว</Badge>
                    : <Badge tone="neutral">ยังไม่เปิด</Badge>}
                </td>
                <td>{operator.grantedAt ? new Date(operator.grantedAt).toLocaleDateString('th-TH') : '—'}</td>
                <td>{operator.lastSeenAt ? new Date(operator.lastSeenAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'ยังไม่เคยเข้า'}</td>
                <td>
                  {operator.status === 'active' && !operator.revokedAt && active.length > 1 && (
                    <Button variant="danger" size="sm" onClick={() => revoke(operator)}>เพิกถอน</Button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card as="section">
        <form onSubmit={submit}>
          <CardHeader
            title="สร้างผู้ดูแลแพลตฟอร์มคนใหม่"
            description="บัญชีที่สร้างที่นี่ไม่สังกัดโรงเรียนใด และเข้าใช้ได้เฉพาะศูนย์ปฏิบัติการ · เซิร์ฟเวอร์ปฏิเสธถ้าบัญชีมีสังกัดโรงเรียน"
          />
          <FieldGroup>
            <Field label="ชื่อผู้ดูแล" hint="ปรากฏในบันทึกความปลอดภัยทุกครั้งที่ทำรายการ">
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </Field>
            <Field label="บันทึกเหตุผล" hint="ไม่บังคับ · เก็บไว้กับสิทธิ์ที่ให้">
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="เช่น ทีมซัพพอร์ตกะกลางคืน" />
            </Field>
            <Field label="รหัสผ่าน" hint="อย่างน้อย 12 ตัวอักษร · บัญชีนี้เห็นทุกโรงเรียน">
              <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </Field>
            <Field label="พิมพ์รหัสผ่านอีกครั้ง">
              <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
            </Field>
          </FieldGroup>
          <div className="ui-page-actions">
            <Button variant="primary" type="submit" disabled={Boolean(problem)}>สร้างผู้ดูแล</Button>
            {problem && <span className="ui-field-hint">{problem}</span>}
          </div>
        </form>
      </Card>

      {pending && <DangerousActionDialog action={pending} onClose={dismiss} onDone={setMessage} />}
    </>
  );
}
