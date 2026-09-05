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
import { WelcomePage } from '../../src/features/auth/WelcomePage';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { AuthProvider } from '../../src/app/AuthContext';
import { ThemeProvider } from '../../src/app/ThemeContext';

afterEach(() => { cleanup(); window.localStorage.clear(); });

function renderFrom(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider><AuthProvider>
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
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
    expect(screen.queryByText(/Platform Console|พรีวิว|ผู้ดูแลโรงเรียน|Super Admin/i)).not.toBeInTheDocument();
  });

  it('lets somebody change the Home theme and remembers the choice', async () => {
    renderFrom('/welcome');
    fireEvent.click(await screen.findByRole('button', { name: /ปรับธีม/ }));
    expect(screen.getByText('สไตล์ของคุณ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ใช้โทนสี Ocean Focus' }));
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
