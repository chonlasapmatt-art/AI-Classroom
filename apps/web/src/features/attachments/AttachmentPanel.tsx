import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { attachmentIcons, attachmentLabels, formatBytes } from '../../data/attachmentKind';
import type { AttachmentOwner } from '../../domain/types';

interface Props {
  ownerType: AttachmentOwner;
  ownerId: string;
  uploadedBy: string;
  canUpload: boolean;
  canDelete?: boolean;
  title?: string;
  /** Tells these students that a new file is waiting (used when a teacher hands out material). */
  notify?: { classId: string; studentIds: string[]; assignmentId: string | null; title: string };
}

// Teachers may use any file format in a lesson. The server/storage layer still enforces the
// per-file size limit and classroom permissions.
const acceptedTypes = '*/*';

/** Upload, open and remove the files attached to teaching material or to turned-in work. */
export function AttachmentPanel({ ownerType, ownerId, uploadedBy, canUpload, canDelete = canUpload, title = 'ไฟล์แนบ', notify }: Props) {
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    repository.refreshAttachments(ownerType, ownerId).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'ดึงรายการไฟล์ไม่สำเร็จ');
    });
    return () => { active = false; };
  }, [repository, ownerType, ownerId]);

  const files = snapshot.attachments
    .filter((item) => item.ownerType === ownerType && item.ownerId === ownerId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setError(null);
    setBusy(true);
    for (const file of picked) {
      try {
        await repository.addAttachment({ ownerType, ownerId, file, uploadedBy, ...(notify ? { notify } : {}) });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'อัปโหลดไม่สำเร็จ');
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function open(attachmentId: string, fileName: string) {
    setError(null);
    try {
      const blob = await repository.openAttachment(attachmentId);
      if (!blob) { setError('ไฟล์นี้ยังไม่ถูกแชร์ออนไลน์ จึงเปิดได้เฉพาะเครื่องที่อัปโหลด'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เปิดไฟล์ไม่สำเร็จ');
    }
  }

  return (
    <div className="attachment-panel">
      <div className="attachment-head">
        <strong>{title}</strong>
        {canUpload && (
          <label className={`upload-button ${busy ? 'busy' : ''}`}>
            {busy ? 'กำลังอัปโหลด...' : '+ แนบไฟล์งานทุกประเภท (สูงสุด 15 MB/ไฟล์)'}
            <input ref={inputRef} type="file" multiple accept={acceptedTypes} disabled={busy} onChange={(event) => void upload(event)} />
          </label>
        )}
      </div>

      {files.length === 0 ? (
        <p className="attachment-empty">ยังไม่มีไฟล์แนบ</p>
      ) : (
        <ul className="attachment-list">
          {files.map((file) => (
            <li key={file.id}>
              <span className="attachment-icon" aria-hidden="true">{attachmentIcons[file.kind]}</span>
              <div>
                <button className="link-button" onClick={() => void open(file.id, file.fileName)}>{file.fileName}</button>
                <span>
                  {attachmentLabels[file.kind]} · {formatBytes(file.byteSize)} ·{' '}
                  {file.storagePath ? 'แชร์กับห้องเรียนแล้ว' : 'อยู่เฉพาะเครื่องนี้'}
                </span>
              </div>
              {canDelete && (
                <button
                  className="text-button danger"
                  onClick={() => void repository.removeAttachment(file.id).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'ลบไม่สำเร็จ'))}
                >
                  ลบ
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="attachment-error">{error}</p>}
    </div>
  );
}
