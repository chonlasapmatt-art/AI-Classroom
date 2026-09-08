import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The screen an account sees when it has signed in and belongs to no school.
 *
 * It used to ask for an eight-digit invitation code that nothing in this product could issue, and
 * its way out looped back to itself. These tests hold the replacement to the one thing that matters:
 * whoever lands here is told the steps that actually put them in a school, for the role they are.
 */

const auth = vi.hoisted(() => ({
  requestedRole: 'teacher' as string | undefined,
  displayName: 'ทดสอบ ระบบ',
  signOut: vi.fn(async () => {}),
  refreshMemberships: vi.fn(async () => {})
}));

vi.mock('../../src/app/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { user_metadata: { requested_role: auth.requestedRole, display_name: auth.displayName } } },
    memberships: [], loading: false, error: null, active: null,
    signOut: auth.signOut, refreshMemberships: auth.refreshMemberships, selectMembership: vi.fn()
  })
}));

const { AwaitingMembershipPage } = await import('../../src/features/auth/AccountPages');

const assign = vi.fn();
// Replacing window.location has to be undone: jsdom hands the same window to whatever runs next,
// and a stub left behind takes routing away from every test after this one.
const realLocation = Object.getOwnPropertyDescriptor(window, 'location');

beforeEach(() => {
  auth.requestedRole = 'teacher';
  auth.displayName = 'ทดสอบ ระบบ';
  auth.signOut.mockClear();
  auth.refreshMemberships.mockClear();
  assign.mockClear();
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '/', assign } });
});

afterEach(() => {
  cleanup();
  if (realLocation) Object.defineProperty(window, 'location', realLocation);
});

describe('an account that belongs to no school', () => {
  it('never asks for a code nobody can issue', () => {
    render(<AwaitingMembershipPage />);
    expect(screen.queryByText(/รหัสคำเชิญ/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('tells a teacher the entrance that binds their account, and names their account', () => {
    render(<AwaitingMembershipPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('บัญชีนี้ยังไม่ได้อยู่ในโรงเรียนใด');
    expect(screen.getByText(/รายชื่อครู/)).toBeInTheDocument();
    expect(screen.getByText(/รหัสครูของโรงเรียน/)).toBeInTheDocument();
    // The name is on screen because the fix is a conversation with an administrator.
    expect(screen.getByText(/ทดสอบ ระบบ · ประเภทบัญชี ครู/)).toBeInTheDocument();
  });

  it('signs the session out before opening the sign-in door, rather than looping back here', async () => {
    render(<AwaitingMembershipPage />);
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบแล้วไปหน้าเข้าสู่ระบบครู' }));
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login?as=teacher'));
  });

  it('sends a student to the student entrance instead', () => {
    auth.requestedRole = 'student';
    render(<AwaitingMembershipPage />);
    expect(screen.getByText(/เลขประจำตัวนักเรียน/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ออกจากระบบแล้วไปหน้าเข้าสู่ระบบนักเรียน' })).toBeInTheDocument();
  });

  it('tells an account of no stated role to give its name to the administrator', () => {
    auth.requestedRole = undefined;
    render(<AwaitingMembershipPage />);
    expect(screen.getByText(/ไม่มีการสมัครสมาชิกด้วยตัวเอง/)).toBeInTheDocument();
    // No door to send them through: nobody knows which one is theirs, including this screen.
    expect(screen.queryByRole('button', { name: /ไปหน้าเข้าสู่ระบบ/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตรวจสอบสถานะอีกครั้ง' })).toBeInTheDocument();
  });
});
