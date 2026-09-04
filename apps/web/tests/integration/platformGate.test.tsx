// The doors into the operations console.
//
// There was no production entrance at all: the gate rendered the development door — which signs a
// person in as an operator without asking who they are, and works only because a small deployment
// has exactly one — or a notice telling you to enable it. The production door asks, with the same
// name and password every other person in this product uses.
//
// The code door stays where a deployment enables it, because it is how the first operator of a new
// platform is created and the only way back into one whose operators have all lost their passwords.
// It is offered underneath rather than instead, and it says which of the two it is.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformApp } from '../../src/platform/PlatformApp';

afterEach(cleanup);

// Each case mounts the whole console — router, auth context and the Supabase client's own startup —
// before a single assertion runs. On a developer's machine that settles in about a second; on a
// shared CI runner it does not, and the default five-second budget expired while `waitFor` was
// still polling, which failed every case here for a reason that had nothing to do with the door.
// The assertions are unchanged; only the time they are given is.
vi.setConfig({ testTimeout: 30000 });

/** The gate appears once the auth check settles; there is no session in a test environment. */
async function openGate() {
  render(<PlatformApp />);
  await waitFor(() => expect(document.querySelector('.platform-gate-card')).not.toBeNull(), { timeout: 20000 });
}

const productionDoor = () => within(document.querySelectorAll('.platform-gate-card')[0] as HTMLElement);
const codeDoor = () => {
  const card = [...document.querySelectorAll('.platform-gate-card')]
    .find((node) => node.textContent?.includes('DEVELOPMENT ONLY'));
  return within(card as HTMLElement);
};

describe('the production door', () => {
  it('asks for an operator\'s own name and password, and never for an email address', async () => {
    await openGate();
    const door = productionDoor();
    expect(door.getByRole('heading', { level: 1 })).toHaveTextContent('เข้าสู่ศูนย์ปฏิบัติการ');
    expect(door.getByLabelText(/ชื่อผู้ดูแล/)).toBeInTheDocument();
    expect(door.getByLabelText('รหัสผ่าน')).toBeInTheDocument();
    // No entrance in this product asks for an email address; the addresses these accounts carry are
    // generated and nobody is ever shown one.
    expect(document.querySelector('input[type="email"]')).toBeNull();
  });

  it('says that a school administrator\'s password is not the one being asked for', async () => {
    await openGate();
    // The mistake somebody arriving from the school application is about to make.
    expect(productionDoor().getByText(/ไม่ใช่บัญชีแอดมินของโรงเรียน/)).toBeInTheDocument();
  });

  it('waits for both halves before it will submit', async () => {
    await openGate();
    const door = productionDoor();
    const submit = door.getByRole('button', { name: 'เข้าใช้งาน' });
    expect(submit).toBeDisabled();

    fireEvent.change(door.getByLabelText(/ชื่อผู้ดูแล/), { target: { value: 'ทีมปฏิบัติการ' } });
    expect(submit).toBeDisabled();
    fireEvent.change(door.getByLabelText('รหัสผ่าน'), { target: { value: 'a-password' } });
    await waitFor(() => expect(submit).toBeEnabled());
  });
});

describe('the code door beside it', () => {
  it('has a heading of its own rather than repeating the first', async () => {
    await openGate();
    // Two headings reading "เข้าสู่ศูนย์ปฏิบัติการ" would leave a screen reader with two identical
    // landmarks and no way to tell which form it had landed in.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(codeDoor().getByRole('heading', { level: 2 })).toHaveTextContent('เข้าด้วยรหัสสิทธิ์');
  });

  it('says what it is for instead of only warning that it exists', async () => {
    await openGate();
    const door = codeDoor();
    expect(door.getByText('DEVELOPMENT ONLY').className).toContain('ui-badge');
    expect(door.getByText(/ตั้งค่าครั้งแรก/)).toBeInTheDocument();
    expect(door.getByText(/5 ครั้งต่อ 15 นาที/)).toBeInTheDocument();
  });

  it('explains why its button is waiting rather than only greying it out', async () => {
    await openGate();
    const door = codeDoor();
    expect(door.getByRole('button', { name: 'เข้าใช้งาน' })).toBeDisabled();
    // A disabled primary button with nothing beside it reads as broken.
    expect(door.getByText('กรอกชื่อผู้ดูแลก่อน')).toBeInTheDocument();

    fireEvent.change(door.getByLabelText(/ชื่อผู้ดูแล/), { target: { value: 'ทีมปฏิบัติการ' } });
    await waitFor(() => expect(door.getByText('กรอกรหัสสิทธิ์ก่อน')).toBeInTheDocument());
  });
});
