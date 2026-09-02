import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderApp(path = '/') {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function switchRole(membershipId: string) {
  fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: membershipId } });
}

describe('application shell and routes', () => {
  it('renders the teacher dashboard with the action-first layout', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('สวัสดี'));
    expect(screen.getByText('งานรอตรวจ')).toBeInTheDocument();
    expect(screen.getByText('การกระจายเกรด')).toBeInTheDocument();
    expect(screen.getByText('นักเรียนที่ควรติดตาม')).toBeInTheDocument();
  });

  it('shows the work list with badges and the create action for a teacher', async () => {
    renderApp('/assignments');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('งานและโปรเจกต์'));
    expect(screen.getByRole('button', { name: '+ สร้างงานใหม่' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ประกาศถึงห้องเรียน' })).toBeInTheDocument();
  });

  it('opens the work form with reminder presets and rubric selection', async () => {
    renderApp('/assignments');
    fireEvent.click(await screen.findByRole('button', { name: '+ สร้างงานใหม่' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('สร้างงานใหม่')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'โครงงาน' })).toBeInTheDocument();
    expect(within(dialog).getByText('ก่อนกำหนด 1 วัน')).toBeInTheDocument();
    expect(within(dialog).getByText('เกณฑ์ (rubric)')).toBeInTheDocument();
  });

  it('renders the academic calendar with month, week and upcoming views', async () => {
    renderApp('/calendar');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ปฏิทิน'));
    fireEvent.click(screen.getByRole('tab', { name: 'สัปดาห์' }));
    expect(screen.getAllByText(/งาน$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'กำลังจะถึง' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ปฏิทิน');
  });

  it('gives a student the notification centre and hides teacher-only navigation', async () => {
    renderApp();
    await switchRole('preview-student');
    await waitFor(() => expect(screen.queryByRole('link', { name: /ครู/ })).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: /การแจ้งเตือน/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /การแจ้งเตือน/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('การแจ้งเตือน'));
  });

  it.each([
    ['preview-student', 'นักเรียน'],
    ['preview-parent', 'ผู้ปกครอง']
  ])('hides work creation controls for %s', async (membershipId) => {
    renderApp('/');
    await switchRole(membershipId);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /สร้างงาน/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /สร้างงาน/ })).not.toBeInTheDocument();

    cleanup();
    renderApp('/assignments');
    await switchRole(membershipId);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('งานและโปรเจกต์'));
    expect(screen.queryByRole('button', { name: /สร้างงาน/ })).not.toBeInTheDocument();
  });

  it('lets a student open the avatar picker from their own profile', async () => {
    renderApp();
    await switchRole('preview-student');
    fireEvent.click(await screen.findByRole('link', { name: /โปรไฟล์ของฉัน/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('โปรไฟล์'));

    fireEvent.click(screen.getByRole('button', { name: 'เปลี่ยน Avatar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('เลือก Avatar')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('option', { name: /อวตาร/ }).length).toBeGreaterThan(50);

    fireEvent.change(within(dialog).getByPlaceholderText(/avatar_012/), { target: { value: 'avatar_007' } });
    await waitFor(() => expect(within(dialog).getAllByRole('option', { name: /อวตาร/ })).toHaveLength(1));
  });

  it('keeps the student dashboard personal and shows their avatar beside their name', async () => {
    renderApp('/');
    await switchRole('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดี'));
    expect(screen.getByText('ข้อมูลส่วนตัวของฉัน')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ปรับแต่ง Avatar' })).toBeInTheDocument();
    expect(screen.getByText('งานที่ต้องทำ')).toBeInTheDocument();
    expect(screen.queryByText('นักเรียนทั้งหมด')).not.toBeInTheDocument();
    expect(screen.queryByText('งานรอตรวจ')).not.toBeInTheDocument();
  });

  it('shows only the student score summary by subject and opens score details', async () => {
    renderApp('/scores');
    await switchRole('preview-student');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('คะแนนของฉัน'));
    expect(screen.getByText('คะแนนของฉันแยกตามรายวิชา')).toBeInTheDocument();
    expect(screen.queryByText('นักเรียนรวม')).not.toBeInTheDocument();
    const subjectCard = screen.getAllByRole('button', { name: /ดูรายละเอียดวิชา/ })[0]!;
    fireEvent.click(subjectCard);
    expect(await screen.findByText(/รายละเอียดคะแนน ·/)).toBeInTheDocument();
    expect(screen.getByText('คะแนนที่ได้')).toBeInTheDocument();
  });

  it('provides a Preview Demo Center with quick links for the current role', async () => {
    renderApp('/preview-demo');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ศูนย์เดโมระบบ'));
    expect(screen.getByText(/ข้อมูลเดโมถูกเตรียมไว้ให้เห็นภาพจริง/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'เปิดเดโม →' })).toHaveLength(13);
    expect(screen.getByRole('heading', { name: 'คลังข้อสอบ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quiz Challenge' })).toBeInTheDocument();
  });

  it('loads question bank and exam demo data inside Preview', async () => {
    renderApp('/question-bank');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('คลังข้อสอบ'));
    expect(await screen.findByText('ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด')).toBeInTheDocument();

    cleanup();
    renderApp('/exams');
    await waitFor(() => expect(screen.getByText('เดโมสอบกลางภาค วิทยาศาสตร์')).toBeInTheDocument());
    expect(screen.getByText('เปิดสอบอยู่')).toBeInTheDocument();
  });

  it.each(['preview-admin', 'preview-teacher', 'preview-parent'])('lets %s customise an avatar', async (membershipId) => {
    renderApp();
    await switchRole(membershipId);
    fireEvent.click(await screen.findByRole('link', { name: /โปรไฟล์ของฉัน/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'เปลี่ยน Avatar' })).toBeInTheDocument());
  });

  it('shows the class capacity presets and the occupancy meter', async () => {
    renderApp('/classes');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ห้องเรียน'));
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มห้องเรียน' }));
    expect(await screen.findByRole('button', { name: 'กำหนดเอง' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '100' })).toBeInTheDocument();
  });

  it('renders the gradebook with category columns', async () => {
    renderApp('/gradebook');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สมุดเกรด'));
    expect(screen.getByRole('columnheader', { name: 'การบ้าน' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'GPA' })).toBeInTheDocument();
  });
});
