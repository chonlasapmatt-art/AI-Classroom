import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const migration = read('supabase/migrations/202608310030_notifications_dispatcher.sql');
const worker = read('supabase/functions/notification-dispatch/index.ts');

describe('transactional parent notification dispatcher', () => {
  it('enqueues real events with preferences and idempotency', () => {
    for (const trigger of ['public.assignments', 'public.attendance', 'public.submissions', 'public.test_scores']) {
      expect(migration).toContain(`after insert or update on ${trigger}`);
    }
    expect(migration).toContain('notification_preferences');
    expect(migration).toContain("on conflict (school_id,idempotency_key) do nothing");
  });

  it('keeps claiming and completion service-role-only', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toMatch(/revoke all on function public\.claim_notification_outbox\(integer\) from public,anon,authenticated/);
    expect(migration).toMatch(/grant execute on function public\.claim_notification_outbox\(integer\) to service_role/);
    expect(migration).toContain("next_status:='dead_letter'");
    expect(migration).toContain('platform_notification_queue');
    expect(migration).toContain('lastError');
  });

  it('uses a separate scheduler secret and classifies provider failures', () => {
    expect(worker).toContain('NOTIFICATION_DISPATCH_SECRET');
    expect(worker).toContain('x-notification-dispatch-secret');
    expect(worker).toContain('constantTimeEqual');
    expect(worker).toContain('LINE_NETWORK_ERROR');
    expect(worker).toContain('retryableStatus');
    expect(worker).toContain('complete_notification_outbox');
    expect(worker).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
