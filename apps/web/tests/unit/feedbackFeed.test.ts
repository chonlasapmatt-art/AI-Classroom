import { describe, expect, it } from 'vitest';
import { requestsAsFeedback, FEEDBACK_WINDOW_MS } from '../../src/features/reports/feedbackFeed';

const now = new Date('2026-09-09T06:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

const request = (over: Partial<Parameters<typeof requestsAsFeedback>[0]['requests'][number]> = {}) => ({
  id: 'request-1',
  subjectId: 'subject-1',
  studentId: 'student-1',
  raisedByName: 'คุณแม่ของสมชาย',
  body: 'ขอสื่อการสอนย้อนหลังของสัปดาห์ที่แล้ว',
  status: 'open' as const,
  createdAt: ago(60_000),
  ...over
});

const names = {
  subjectName: (id: string) => (id === 'subject-1' ? 'คอมพิวเตอร์' : null),
  studentName: (id: string) => (id === 'student-1' ? 'สมชาย ใจดี' : null)
};

describe("a guardian's question in the staff-room inbox", () => {
  it('names who asked and which subject it is about', () => {
    const [item] = requestsAsFeedback({ requests: [request()], ...names, now });
    expect(item?.title).toBe('คำร้องจาก คุณแม่ของสมชาย');
    expect(item?.subjectName).toBe('คอมพิวเตอร์');
    expect(item?.studentName).toBe('สมชาย ใจดี');
    expect(item?.tone).toBe('warning');
  });

  it('keeps an unanswered question however old it is', () => {
    // Everything else in the box is news that goes stale. A question nobody has answered is not.
    const old = request({ createdAt: ago(FEEDBACK_WINDOW_MS * 4) });
    expect(requestsAsFeedback({ requests: [old], ...names, now })).toHaveLength(1);
  });

  it('lets a handled question age out like the rest of the feed', () => {
    const handled = request({ status: 'handled', createdAt: ago(FEEDBACK_WINDOW_MS + 60_000) });
    expect(requestsAsFeedback({ requests: [handled], ...names, now })).toHaveLength(0);
  });

  it('still shows a recently handled question, so the reader sees it was dealt with', () => {
    const handled = request({ status: 'handled', createdAt: ago(60_000) });
    const [item] = requestsAsFeedback({ requests: [handled], ...names, now });
    expect(item?.tone).toBe('info');
  });

  it('stays hidden once somebody on this device has deleted it', () => {
    const dismissed = new Set(['request:request-1']);
    expect(requestsAsFeedback({ requests: [request()], ...names, now, dismissed })).toHaveLength(0);
  });
});
