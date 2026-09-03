// What a guardian's screen is allowed to start from.
//
// The parent portal gained attendance, outstanding work, per-subject results and the calendar. Every
// one of those is a class-shaped question in the teacher's screens, and the tempting shortcut was to
// let a parent open those screens with a class selector. That shortcut is one filter bug away from
// showing a guardian another family's child, so the parent screen is child-shaped instead and can
// only ever read from the consented list.
//
// This is a static assertion because the property is about which selector the screen reaches for.
// The database refuses the same request independently; this pins the screen agreeing with it rather
// than the screen being the only thing that decides.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const childDetail = read('apps/web/src/features/parents/ChildDetailPage.tsx');
const myChildren = read('apps/web/src/features/parents/MyChildrenPage.tsx');
const routes = read('apps/web/src/app/App.tsx');

describe('the guardian view of one child', () => {
  it('resolves the child from the consented list and from nothing else', () => {
    expect(childDetail).toContain('consentedStudents(snapshot).find');
    // `snapshot.students` is every child in the school. A parent screen that reached for it would
    // render whichever id was typed into the address bar.
    expect(childDetail).not.toContain('snapshot.students.find');
    expect(childDetail).not.toContain('rosterFor(');
  });

  it('answers an unknown id the same way it answers a deleted child', () => {
    expect(childDetail).toContain('if (!child)');
    expect(childDetail).toContain('ไม่อยู่ในขอบเขตของคุณ');
  });

  it('leaves whether marks are shared to the school rather than to the screen', () => {
    expect(childDetail).toContain('privacy.shareScoresWithParents');
    // Off means absent, not blurred: a screen that fetched the marks and hid them has still put a
    // child's marks in a guardian's browser.
    const results = childDetail.slice(childDetail.indexOf('const subjectResults'));
    expect(results.slice(0, 250)).toContain('!privacy.shareScoresWithParents) return []');
  });

  it('shows published work only, never a teacher draft', () => {
    expect(childDetail).toContain('includeDrafts: false');
    expect(childDetail).toContain("item.work.status === 'published' || item.work.status === 'closed'");
  });

  it('is reachable from the portal and is its own route', () => {
    expect(routes).toContain('<Route path="my-children/:studentId" element={<ChildDetailPage />} />');
    expect(myChildren).toContain('to={`/my-children/${student.id}`}');
  });
});
