import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { requireSupabase } from '../../services/supabase';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Skeleton } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import {
  conflictEntityLabels, differingFields, displayValue, type SyncConflict
} from './conflicts';

/**
 * The conflicts a school has to decide.
 *
 * The schema has recorded these since the beginning and nothing could close one, so a mark edited on
 * two devices left a row nobody ever saw and a change stuck in a queue. This is the screen that asks
 * the question the database refused to answer for itself: which of these two is right.
 *
 * Both versions are shown field by field, and only the fields that differ, because the decision is
 * about the difference and everything else is noise. Neither choice is offered as a default: a
 * screen that pre-selects one is a screen that gets clicked through.
 */
export function ConflictPanel() {
  const { membership, mode } = useSession();
  const [conflicts, setConflicts] = useState<SyncConflict[] | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (mode !== 'cloud') return;
    setError(null);
    try {
      const { data, error: rpcError } = await requireSupabase()
        .rpc('open_sync_conflicts', { p_school_id: membership.schoolId, p_limit: 50 });
      if (rpcError) throw rpcError;
      setConflicts((data ?? []) as SyncConflict[]);
    } catch (reason2) {
      setError(reason2 instanceof Error ? reason2.message : 'โหลดรายการข้อมูลขัดแย้งไม่สำเร็จ');
    }
  }, [membership.schoolId, mode]);

  useEffect(() => { void load(); }, [load]);

  async function resolve(conflict: SyncConflict, choice: 'server' | 'mine') {
    setBusy(conflict.conflictId); setError(null);
    try {
      const { error: rpcError } = await requireSupabase().rpc('resolve_sync_conflict', {
        p_conflict_id: conflict.conflictId, p_choice: choice,
        p_reason: reason[conflict.conflictId] ?? ''
      });
      if (rpcError) throw rpcError;
      setMessage(choice === 'server'
        ? 'ใช้ข้อมูลล่าสุดจากระบบแล้ว การแก้ไขจากเครื่องนั้นถูกยกเลิก'
        : 'นำการแก้ไขจากเครื่องนั้นมาใช้แล้ว เครื่องอื่นจะได้รับข้อมูลใหม่ในการซิงก์ครั้งถัดไป');
      await load();
    } catch (reason2) {
      setError(reason2 instanceof Error ? reason2.message : 'บันทึกการตัดสินใจไม่สำเร็จ');
    } finally { setBusy(null); }
  }

  if (mode !== 'cloud') return null;

  return (
    <Card>
      <CardHeader
        title="ข้อมูลที่ต้องตรวจสอบ"
        description="เกิดขึ้นเมื่อข้อมูลเดียวกันถูกแก้จากสองเครื่องพร้อมกัน · ระบบไม่เลือกให้เอง"
        action={<Button onClick={() => void load()}>รีเฟรช</Button>}
      />
      {message && <div className="alert success" role="status">{message}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}

      {!conflicts ? <Skeleton lines={3} /> : (conflicts.length === 0 ? (
        <EmptyState icon={<Icon name="check" size={28} />} title="ไม่มีข้อมูลขัดแย้ง" description="ทุกอย่างซิงก์ตรงกันหมด" />
      ) : (
        <ul className="conflict-list">
          {conflicts.map((conflict) => {
            const fields = differingFields(conflict.clientPayload, conflict.serverPayload);
            return (
              <li key={conflict.conflictId}>
                <div className="question-head">
                  <Badge tone="warning">{conflictEntityLabels[conflict.entityType] ?? conflict.entityType}</Badge>
                  <span className="fine-print">
                    จากเครื่อง {conflict.deviceName ?? 'ไม่ทราบชื่อ'} ·{' '}
                    {new Date(conflict.createdAt).toLocaleString('th-TH', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>

                {fields.length > 0 ? (
                  <table className="conflict-table">
                    <thead>
                      <tr><th>ข้อมูล</th><th>การแก้ไขจากเครื่องนั้น</th><th>ข้อมูลล่าสุดในระบบ</th></tr>
                    </thead>
                    <tbody>
                      {fields.map((field) => (
                        <tr key={field.key}>
                          <td>{field.key}</td>
                          <td className="conflict-mine">{displayValue(field.mine)}</td>
                          <td className="conflict-theirs">{displayValue(field.theirs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="field-hint">ทั้งสองฝั่งมีค่าเหมือนกัน เลือกฝั่งใดก็ได้เพื่อปิดรายการนี้</p>
                )}

                <Field label="เหตุผล" hint="บันทึกไว้ในบันทึกตรวจสอบ เพื่อให้ตอบได้ทีหลังว่าทำไมเลือกแบบนี้">
                  <input
                    value={reason[conflict.conflictId] ?? ''}
                    placeholder="เช่น ครูประจำชั้นยืนยันคะแนนจากสมุดจริง"
                    onChange={(event) => setReason((value) => ({
                      ...value, [conflict.conflictId]: event.target.value
                    }))}
                  />
                </Field>

                <div className="record-actions">
                  <Button
                    size="sm" loading={busy === conflict.conflictId}
                    onClick={() => void resolve(conflict, 'server')}
                  >
                    ใช้ข้อมูลล่าสุดจากระบบ
                  </Button>
                  <Button
                    size="sm" variant="primary" loading={busy === conflict.conflictId}
                    onClick={() => void resolve(conflict, 'mine')}
                  >
                    นำการแก้ไขจากเครื่องนั้นมาใช้
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ))}
    </Card>
  );
}
