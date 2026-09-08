import { useEffect, useState } from 'react';
import { useRepository } from '../../data/RepositoryContext';
import type { Attachment } from '../../domain/types';
import { Button, Modal } from '../../ui/components';

/**
 * Reading the file without leaving the lesson.
 *
 * Every attachment in the product opened the same way: fetch it, make an object URL, click a hidden
 * link, and the browser downloads it. That is the right answer for a spreadsheet and the wrong one
 * for the three things this school actually attaches — a photo of a worksheet, a lesson video, a
 * PDF — because downloading them means leaving the app, finding the file, opening another program,
 * and coming back. On a school tablet with a locked-down file manager it often means not reading it
 * at all.
 *
 * So the ones a browser can render are rendered here, and everything else still downloads, said
 * plainly rather than silently. The blob is fetched through the repository, which means the same
 * permission check as before — nothing here reaches storage on its own — and the object URL is
 * revoked when the viewer closes, so a long lesson does not accumulate copies of every video in it.
 */
function viewerKindOf(file: Attachment): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'download' {
  const type = file.mimeType.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('text/')) return 'text';
  // A file uploaded from a device that reported no type at all is judged by its name instead.
  const name = file.fileName.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(name)) return 'video';
  if (/\.(mp3|wav|ogg|m4a)$/.test(name)) return 'audio';
  if (name.endsWith('.pdf')) return 'pdf';
  if (/\.(txt|md|csv)$/.test(name)) return 'text';
  return 'download';
}

export function AttachmentViewer({ file, onClose }: { file: Attachment; onClose(): void }) {
  const repository = useRepository();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = viewerKindOf(file);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    void repository.openAttachment(file.id)
      .then((blob) => {
        if (!active) return;
        if (!blob) { setError('ไฟล์นี้ยังไม่ถูกแชร์ออนไลน์ จึงเปิดได้เฉพาะเครื่องที่อัปโหลด'); return; }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'เปิดไฟล์ไม่สำเร็จ');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, repository]);

  function download() {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
  }

  return (
    <Modal
      title={file.fileName}
      description={error ? undefined : kind === 'download' ? 'ไฟล์ประเภทนี้เปิดในเบราว์เซอร์ไม่ได้ · ดาวน์โหลดเพื่อเปิดด้วยโปรแกรมในเครื่อง' : 'เปิดดูได้ในหน้านี้'}
      onClose={onClose}
      wide
      actions={(
        <>
          <Button variant="ghost" onClick={onClose}>ปิด</Button>
          <Button variant="primary" onClick={download} disabled={!url}>ดาวน์โหลด</Button>
        </>
      )}
    >
      {error ? (
        <p className="attachment-error">{error}</p>
      ) : !url ? (
        <p className="ui-field-hint">กำลังเปิดไฟล์…</p>
      ) : kind === 'image' ? (
        <img className="attachment-view-image" src={url} alt={file.fileName} />
      ) : kind === 'video' ? (
        <video className="attachment-view-media" src={url} controls playsInline />
      ) : kind === 'audio' ? (
        <audio className="attachment-view-audio" src={url} controls />
      ) : kind === 'pdf' || kind === 'text' ? (
        <iframe className="attachment-view-frame" src={url} title={file.fileName} />
      ) : (
        <p className="ui-field-hint">
          ไฟล์นี้เปิดในเบราว์เซอร์ไม่ได้ · กดดาวน์โหลดเพื่อเปิดด้วยโปรแกรมในเครื่อง
        </p>
      )}
    </Modal>
  );
}
