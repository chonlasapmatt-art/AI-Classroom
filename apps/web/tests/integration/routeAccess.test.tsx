// What the product does with an address, as opposed to with a menu click.
//
// Every screen used to be mounted for every role, so the menu was the only thing keeping anybody out
// of anybody else's job: a student who typed `/teachers` got the staff roster, rendered against
// whatever the snapshot happened to hold. And an address that named nothing was redirected to the
// dashboard in silence, which made a stale bookmark, a typo and a link meant for another role all
// look like the app ignoring where you meant to go.
//
// These hold the two answers apart. Neither is the refusal that matters — the database decides what
// an account can read — but a product that offers a door it will not open teaches people to distrust
// the menu.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { isRouteAllowed, navigationByRole } from '../../src/layouts/navigation';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';
import type { Role } from '../../src/domain/types';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderApp(path: string) {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function switchRole(membershipId: string) {
  fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: membershipId } });
}

const roles: Role[] = ['admin', 'teacher', 'student', 'parent'];

describe('who may open which address', () => {
  it('lets every role open every screen its own menu offers', () => {
    for (const role of roles) {
      for (const group of navigationByRole[role]) {
        for (const item of group.items) {
          expect(isRouteAllowed(role, item.to), `${role} → ${item.to}`).toBe(true);
        }
      }
    }
  });

  it('gives a detail screen the authority of the list it belongs to', () => {
    // Named once, in the list. A detail route that had to be listed separately is a detail route
    // somebody will forget, and the forgotten case fails open.
    expect(isRouteAllowed('teacher', '/students/abc')).toBe(true);
    expect(isRouteAllowed('parent', '/students/abc')).toBe(false);
    expect(isRouteAllowed('parent', '/my-children/abc')).toBe(true);
  });

  it('does not let a prefix leak into a screen that merely starts with the same letters', () => {
    // `/students` must not open `/students-import`, which is a different word rather than a child.
    expect(isRouteAllowed('teacher', '/students-import')).toBe(false);
  });

  it('closes the staff roster to a student who types its address', async () => {
    renderApp('/teachers');
    await switchRole('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('หน้านี้ไม่ได้เปิดให้บทบาทของคุณ'));
    // The role is stated, because "you cannot see this" without saying who you are signed in as is
    // the message that produces a support call rather than resolving one.
    expect(screen.getByText(/เข้าใช้งานในฐานะ นักเรียน/)).toBeInTheDocument();
  });

  it('answers an address that names nothing with a not-found, not with the dashboard', async () => {
    renderApp('/a-screen-that-was-never-built');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('ไม่พบหน้าที่คุณเปิด'));
    expect(screen.getByText(/\/a-screen-that-was-never-built/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับหน้าภาพรวม' })).toBeInTheDocument();
  });
});
