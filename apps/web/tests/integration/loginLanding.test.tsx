import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WelcomePage } from '../../src/features/auth/WelcomePage';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { AuthProvider } from '../../src/app/AuthContext';
import { ThemeProvider } from '../../src/app/ThemeContext';

afterEach(() => { cleanup(); window.localStorage.clear(); });

function renderLogin(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider><AuthProvider><Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
      </Routes></AuthProvider></ThemeProvider>
    </MemoryRouter>
  );
}

/**
 * The first screen, and the two things it now answers before anybody types.
 *
 * Which school this device belongs to, and whether it can reach the server. Both change what a
 * refused sign-in means: the wrong school explains a name the server has never heard of, and being
 * offline explains a correct password being refused. Neither is a secret — the school's name is on
 * the building, and the connection state is in the status bar of the phone already.
 */
describe('the sign-in landing', () => {
  it('redirects the bare login URL to the public home', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Smart Classroom' })).toBeInTheDocument());
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });

  it('says whether the device can reach the server', async () => {
    renderLogin('/login?as=teacher');
    await waitFor(() => expect(screen.getByText(/ออนไลน์|ออฟไลน์/)).toBeInTheDocument());
  });

  it('names the school this device was last signed in to', async () => {
    window.localStorage.setItem('last-school-name', 'โรงเรียนบ้านไทเกอร์');
    renderLogin('/login?as=teacher');
    await waitFor(() => expect(screen.getByText(/โรงเรียนบ้านไทเกอร์/)).toBeInTheDocument());
  });

  it('renders a role-specific form without a second role chooser', async () => {
    renderLogin('/login?as=teacher');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'เข้าสู่ระบบครู' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'คุณคือใคร?' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Platform Console|เข้าสู่ระบบผู้ดูแลโรงเรียน|พรีวิว/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ย้อนกลับไปยังหน้า Home' })).toHaveAttribute('href', '/welcome');
    expect(screen.queryByText(/ดูข้อมูลระบบก่อนเข้าสู่ระบบ|เข้าสู่ Platform Console/i)).not.toBeInTheDocument();
  });
});
