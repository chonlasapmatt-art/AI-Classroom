import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { AuthProvider } from '../../src/app/AuthContext';
import { ThemeProvider } from '../../src/app/ThemeContext';

afterEach(() => { cleanup(); window.localStorage.clear(); });

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <ThemeProvider><AuthProvider><LoginPage /></AuthProvider></ThemeProvider>
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
  it('offers the three entrances and nothing to fill in yet', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'คุณคือใคร?' })).toBeInTheDocument());
    for (const label of ['ครู', 'นักเรียน', 'ผู้ปกครอง']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });

  it('says whether the device can reach the server', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByText(/ออนไลน์|ออฟไลน์/)).toBeInTheDocument());
  });

  it('names the school this device was last signed in to', async () => {
    window.localStorage.setItem('last-school-name', 'โรงเรียนบ้านไทเกอร์');
    renderLogin();
    await waitFor(() => expect(screen.getByText(/โรงเรียนบ้านไทเกอร์/)).toBeInTheDocument());
  });

  it('keeps both admin doors named but out of the way', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByRole('link', { name: 'เข้าสู่ระบบผู้ดูแลโรงเรียน' })).toBeInTheDocument());
    const platform = screen.getByRole('link', { name: /Platform Console/ });
    expect(platform).toHaveAttribute('href', '/platform/');
  });
});
