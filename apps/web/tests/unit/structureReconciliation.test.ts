import { describe, expect, it } from 'vitest';
import { staleStructuralIds } from '../../src/sync/engine';

/*
 * Two administrators of one school have to be looking at one school.
 *
 * School structure never travels through the mutation journal — it is written by server functions
 * and mirrored on every pull. The mirror only ever wrote rows, so anything the server deleted stayed
 * on every other device: unassign a teacher from a room on one screen and the other screen went on
 * listing that teacher against the room until the browser was cleared.
 */

const at = (updatedAt: string, id: string) => ({ id, updatedAt });

describe('structure the server no longer has', () => {
  it('drops a row the server stopped returning', () => {
    const held = [at('2026-09-08T05:00:00.000Z', 'link-1'), at('2026-09-08T05:00:00.000Z', 'link-2')];
    expect(staleStructuralIds(held, new Set(['link-1']), '2026-09-08T06:00:00.000Z')).toEqual(['link-2']);
  });

  it('keeps every row the server still returns', () => {
    const held = [at('2026-09-08T05:00:00.000Z', 'link-1'), at('2026-09-08T05:00:00.000Z', 'link-2')];
    expect(staleStructuralIds(held, new Set(['link-1', 'link-2']), '2026-09-08T06:00:00.000Z')).toEqual([]);
  });

  it('keeps a row written while the read was in flight', () => {
    // Structural writes reach the server first and this projection second. A row stamped after the
    // snapshot was taken is one that landed too late to be in it, not one that was deleted.
    const held = [at('2026-09-08T06:00:01.000Z', 'class-new')];
    expect(staleStructuralIds(held, new Set(), '2026-09-08T06:00:00.000Z')).toEqual([]);
  });

  it('treats a server-stamped row as older than the read that just ran', () => {
    // Mirrored rows carry the database's own timestamp format. It has a space where an ISO stamp has
    // a T, and a space sorts below every character an ISO stamp can start a time with, so a mirrored
    // row is never mistaken for one written during the read.
    const held = [{ id: 'teacher-1', updatedAt: '2026-09-08 06:00:00.123456+00' }];
    expect(staleStructuralIds(held, new Set(), '2026-09-08T06:00:00.000Z')).toEqual(['teacher-1']);
  });

  it('drops a row that has no timestamp at all rather than keeping it for ever', () => {
    expect(staleStructuralIds([{ id: 'orphan' }], new Set(), '2026-09-08T06:00:00.000Z')).toEqual(['orphan']);
  });
});
