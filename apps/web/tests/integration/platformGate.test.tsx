// The one door into the operations console.
//
// The console watches every school on the platform, and this is the only entrance it renders — the
// password form beside it is dead code kept for older fixtures. So the screen has one job beyond
// taking a code: to say what it is, and to say why the button is not ready yet. It used to be an
// amber "development only" card, styled the way the product styles something going wrong, with a
// primary button greyed to 45% and nothing beside it to explain the wait.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlatformApp } from '../../src/platform/PlatformApp';

afterEach(cleanup);

/** The gate appears once the auth check settles; there is no session in a test environment. */
async function openGate() {
  render(<PlatformApp />);
  await waitFor(() => expect(document.querySelector('.platform-gate-card')).not.toBeNull(), { timeout: 5000 });
}

describe('the operations console door', () => {
  it('names the console and says the code is not an account password', async () => {
    await openGate();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เข้าสู่ศูนย์ปฏิบัติการ');
    // Somebody arriving here with their school administrator password needs to be told, once, that
    // it is not the thing being asked for.
    expect(screen.getByText(/ไม่ใช่รหัสผ่านของบัญชีใด/)).toBeInTheDocument();
  });

  it('explains why the button is waiting rather than only greying it out', async () => {
    await openGate();
    const submit = screen.getByRole('button', { name: 'เข้าใช้งาน' });
    expect(submit).toBeDisabled();
    // A disabled primary button with nothing beside it reads as broken, and this is the only
    // control on the only way in.
    expect(screen.getByText('กรอกชื่อผู้ดูแลก่อน')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ชื่อผู้ดูแล/), { target: { value: 'ทีมปฏิบัติการ' } });
    await waitFor(() => expect(screen.getByText('กรอกรหัสสิทธิ์ก่อน')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/รหัสสิทธิ์/), { target: { value: 'abcdef' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'เข้าใช้งาน' })).toBeEnabled());
  });

  it('warns that this door is a development one without dressing the card as an error', async () => {
    await openGate();
    const badge = screen.getByText('DEVELOPMENT ONLY');
    // The warning is a badge on an ordinary surface, not the surface itself: the only way in should
    // not look like something that has gone wrong.
    expect(badge.className).toContain('ui-badge');
    expect(document.querySelector('.platform-gate-card')).not.toBeNull();
  });

  it('says the attempts are limited, since the lockout is otherwise a surprise', async () => {
    await openGate();
    expect(screen.getByText(/5 ครั้งต่อ 15 นาที/)).toBeInTheDocument();
  });
});
