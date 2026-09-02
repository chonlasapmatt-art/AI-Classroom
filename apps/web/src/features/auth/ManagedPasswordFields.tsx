import { useState, type MouseEvent } from 'react';
import { generateManagedPassword } from './managedPassword';

/**
 * The password half of every managed-account dialog: student, teacher and parent.
 *
 * All three asked for the same two fields and were written out three times, which is how they drift.
 * They share one implementation here, and with it the thing all three were missing: a way to draw a
 * password and read it back. Resetting a password an administrator cannot then see is only half the
 * job — the account is open again and nobody can tell the person whose account it is how to get in.
 *
 * The fields stay uncontrolled and keep their names, so the surrounding form still reads them with
 * `FormData` exactly as before.
 */
export function ManagedPasswordFields() {
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function draw(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const value = generateManagedPassword();
    const password = form.elements.namedItem('password');
    const confirm = form.elements.namedItem('confirm');
    if (password instanceof HTMLInputElement) password.value = value;
    if (confirm instanceof HTMLInputElement) confirm.value = value;
    setGenerated(value);
    setCopied(false);
  }

  async function copy() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
    } catch {
      // Clipboard access is refused over plain HTTP and inside some packaged shells. The password is
      // on screen either way, so say nothing rather than claim a copy that did not happen.
      setCopied(false);
    }
  }

  return (
    <>
      <label>รหัสผ่านใหม่<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label>ยืนยันรหัสผ่าน<input name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
      <div className="managed-password-tools">
        <button type="button" className="text-button" onClick={draw}>สุ่มรหัสผ่านให้</button>
        {generated && (
          <>
            <code className="managed-password-value">{generated}</code>
            <button type="button" className="text-button" onClick={() => void copy()}>
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </button>
          </>
        )}
      </div>
      {generated && (
        <p className="field-hint">จดหรือคัดลอกรหัสนี้ไว้ก่อนกดบันทึก · ปิดหน้าต่างแล้วจะดูอีกไม่ได้ ต้องสุ่มใหม่</p>
      )}
    </>
  );
}
