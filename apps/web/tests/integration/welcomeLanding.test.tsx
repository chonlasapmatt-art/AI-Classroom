// The page before anybody is anybody.
//
// This product has five doors and they are not interchangeable: a teacher signs in with a code the
// school issued, a student with their number, a guardian with a password, a school administrator
// through a separate entrance, and a platform operator through a different application. Sending all
// of them at one form and letting them work it out is how a parent types a student number and is
// told, correctly and unhelpfully, that their password is wrong.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { AuthProvider } from '../../src/app/AuthContext';
import { PublicHome } from '../../src/app/App';
import { ThemeProvider } from '../../src/app/ThemeContext';

afterEach(() => { cleanup(); window.localStorage.clear(); });

/*
 * `/welcome` is mounted the way the application mounts it, through `PublicHome` rather than as the
 * page directly. The guard in front of it sends anybody who is already signed in on to their work,
 * and every assertion below is about the visitor who is not — so routing them through it is what
 * keeps the guard from one day answering "signed in" for somebody who is not.
 */
function renderFrom(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider><AuthProvider>
        <Routes>
          <Route path="/welcome" element={<PublicHome />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </AuthProvider></ThemeProvider>
    </MemoryRouter>
  );
}

describe('the welcome page', () => {
  it('names the three public doors, and says what each one asks for', async () => {
    renderFrom('/welcome');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Smart Classroom'));

    for (const [label, asks] of [
      ['ครู', /รหัสครู/],
      ['นักเรียน', /เลขประจำตัว/],
      ['ผู้ปกครอง', /รหัสผ่าน/]
    ] as const) {
      const door = screen.getByRole('link', { name: new RegExp(label) });
      // The label alone does not tell a guardian they need a password rather than a student number,
      // which is the mistake the single form produced.
      expect(door.textContent).toMatch(asks);
    }
  });

  it('says whether this device can reach the server, and which school it belongs to', async () => {
    window.localStorage.setItem('last-school-name', 'โรงเรียนบ้านไทเกอร์');
    renderFrom('/welcome');
    // Both change what a refused sign-in means: the wrong school explains a name the server has
    // never heard of, and being offline explains a correct password being refused.
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/ออนไลน์|ออฟไลน์/));
    expect(screen.getByText(/โรงเรียนบ้านไทเกอร์/)).toBeInTheDocument();
  });

  it('does not expose private operations from the public home', async () => {
    renderFrom('/welcome');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Smart Classroom'));
    // The platform console and Preview stay off the public signpost. A school's own administrator
    // is a different case: they are one of the school's people and their sign-in screen is reachable
    // by address anyway, so Home names the way in rather than making them remember a URL.
    expect(screen.queryByText(/Platform Console|พรีวิว|Super Admin/i)).not.toBeInTheDocument();
  });

  it('offers the administrator their own way in, quieter than the three role doors', async () => {
    renderFrom('/welcome');
    const entry = await screen.findByRole('link', { name: /เข้าสู่ระบบด้วยผู้ดูแล/ });
    expect(entry).toHaveAttribute('href', '/admin-access');
    // It sits outside the door grid, so it cannot be mistaken for a fourth role.
    expect(entry.closest('.welcome-door-grid')).toBeNull();
  });

  it('lets somebody change the Home theme and remembers the choice', async () => {
    renderFrom('/welcome');
    fireEvent.click(await screen.findByRole('button', { name: /ปรับธีม/ }));
    expect(screen.getByText('สไตล์ของคุณ')).toBeInTheDocument();
    // Queried by the label a person actually reads on the swatch: the button no longer carries a
    // separate aria-label, so its accessible name is its visible name.
    fireEvent.click(screen.getByRole('button', { name: 'Ocean Focus' }));
    expect(window.localStorage.getItem('theme-preset')).toBe('ocean');
    expect(document.documentElement).toHaveAttribute('data-preset', 'ocean');
  });

  it('carries the answer through, so the form does not ask again', async () => {
    renderFrom('/welcome');
    fireEvent.click(await screen.findByRole('link', { name: /ผู้ปกครอง/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'เข้าสู่ระบบผู้ปกครอง' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'คุณคือใคร?' })).not.toBeInTheDocument();
  });

  it('returns an unknown login role to Home', async () => {
    renderFrom('/login?as=headmaster');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Smart Classroom' })).toBeInTheDocument());
  });
});
