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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The console renders no door at all until it has a connection to talk to: with no Supabase URL and
// key it shows "ยังไม่ได้ตั้งค่าการเชื่อมต่อ" instead, because an operations tool with nothing behind
// it is worse than an honest notice. That check reads `import.meta.env` when the module first loads,
// so it has to be answered before the import rather than inside a test — which is why PlatformApp is
// imported dynamically below.
//
// Without this the file passed on any machine holding an .env.local and failed on every machine
// without one, which is every CI runner. The values are deliberately unreachable: these tests render
// the signed-out gate and never let a request leave.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-used-by-tests-only');

let PlatformApp: (typeof import('../../src/platform/PlatformApp'))['PlatformApp'];
beforeAll(async () => { ({ PlatformApp } = await import('../../src/platform/PlatformApp')); });
afterAll(() => { vi.unstubAllEnvs(); });
afterEach(cleanup);

// Each case mounts the whole console — router, auth context, and the Supabase client's own startup.
// That settles in well under a second here and takes longer on a shared runner, so the cases are
// given room rather than left on the five-second default.
vi.setConfig({ testTimeout: 20000 });

/** The gate appears once the auth check settles; there is no session in a test environment. */
async function openGate() {
  render(<PlatformApp />);
  await waitFor(() => expect(document.querySelector('.platform-gate-card')).not.toBeNull(), { timeout: 15000 });
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
