import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayKeyOf, localDateKey } from '../../src/domain/dates';
import { blockedAttachmentReason } from '../../src/data/attachmentKind';

describe('the day a person is in', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('is the local calendar day, not the UTC one', () => {
    // 23:30 local on the 1st is still the 1st, whatever UTC says about it.
    const evening = new Date(2026, 5, 1, 23, 30);
    expect(localDateKey(evening)).toBe('2026-06-01');
    const morning = new Date(2026, 5, 2, 0, 15);
    expect(localDateKey(morning)).toBe('2026-06-02');
  });

  it('keeps a date-only value as it is and reads a timestamp in local time', () => {
    expect(dayKeyOf('2026-06-01')).toBe('2026-06-01');
    const stamp = new Date(2026, 5, 1, 23, 30).toISOString();
    expect(dayKeyOf(stamp)).toBe('2026-06-01');
    expect(dayKeyOf('not a date')).toBe('not a date');
  });
});

describe('what may be attached', () => {
  it('refuses programs and scripts by extension or type', () => {
    expect(blockedAttachmentReason('setup.exe', 'application/x-msdownload')).not.toBeNull();
    expect(blockedAttachmentReason('run.BAT', '')).not.toBeNull();
    expect(blockedAttachmentReason('quiz.js', 'text/javascript')).not.toBeNull();
    expect(blockedAttachmentReason('app.apk', 'application/vnd.android.package-archive')).not.toBeNull();
  });

  it('accepts the material a lesson uses', () => {
    for (const [name, type] of [['worksheet.pdf', 'application/pdf'], ['photo.jpg', 'image/jpeg'], ['lesson.pptx', ''], ['clip.mp4', 'video/mp4'], ['notes.txt', 'text/plain'], ['bundle.zip', 'application/zip']]) {
      expect(blockedAttachmentReason(name!, type!)).toBeNull();
    }
  });
});
