import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { getFixtureRepository, resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';
import { ConfigurationScreen } from '../../src/features/auth/ConfigurationScreen';
import { disablePreviewMode, enablePreviewMode, isPreviewActive, isPreviewModeAvailable } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

describe('preview mode', () => {
  it('is available in a development build and stays off until requested', () => {
    expect(isPreviewModeAvailable).toBe(true);
    expect(isPreviewActive()).toBe(false);
  });

  it('offers the preview entry on the Supabase configuration screen', async () => {
    render(<ConfigurationScreen onEnterPreview={enablePreviewMode} />);
    expect(screen.getByText('เชื่อมต่อ Supabase')).toBeInTheDocument();
    expect(screen.getByText('สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่โหมดตัวอย่าง' }));
    expect(isPreviewActive()).toBe(true);
  });

  it('renders the dashboard from fixtures and switches roles', async () => {
    enablePreviewMode();
    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('สวัสดี'));
    expect(screen.getByText('นักเรียนทั้งหมด')).toBeInTheDocument();

    /*
     * Scoped to the menu. The dashboard's shortcut row mentions ครู in ordinary copy
     * ("คะแนนที่ครูเผยแพร่แล้ว"), so a document-wide search for the word no longer means "the teacher
     * entry". What this test is about is what the MENU offers each role.
     */
    const menu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    expect(menu().getByRole('link', { name: /ครู/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(menu().queryByRole('link', { name: /ครู/ })).not.toBeInTheDocument());
  });
});

/**
 * What Preview Mode is for: showing the product working, with nothing real behind it.
 *
 * So every screen has to accept input — a subject, a game, an award — and none of it may reach
 * Supabase or the device's own database. It lives in memory for as long as the tab does, which is
 * also why a reload is the reset button.
 */
/** The snapshot as a screen would see it: whatever the repository pushes to a subscriber. */
function snapshotOf(repository: ReturnType<typeof getFixtureRepository>) {
  let latest: SchoolSnapshot | null = null;
  const stop = repository.subscribe((next) => { latest = next; });
  stop();
  if (!latest) throw new Error('repository published no snapshot');
  return latest as SchoolSnapshot;
}

describe('preview mode does everything, and keeps none of it', () => {
  it('creates a subject through the same repository call the real screen uses', async () => {
    enablePreviewMode();
    const repository = getFixtureRepository();
    const before = snapshotOf(repository).subjects.length;
    await repository.saveSubject({ code: 'DEMO-01', name: 'วิชาสาธิต', colorIndex: 2, iconKey: 'star' });
    expect(snapshotOf(repository).subjects.some((item) => item.code === 'DEMO-01')).toBe(true);
    expect(snapshotOf(repository).subjects.length).toBe(before + 1);
  });

  it('awards points from the classroom board and keeps the reason with them', async () => {
    enablePreviewMode();
    const repository = getFixtureRepository();
    const student = snapshotOf(repository).students[0]!;
    await repository.awardScoreEvent({
      studentId: student.id, classId: null, subjectId: null, category: 'participation',
      points: 5, reason: 'ตอบคำถามหน้าชั้น', sourceType: 'board', awardedBy: 'preview-teacher'
    });
    const events = snapshotOf(repository).scoreEvents.filter((item) => item.studentId === student.id);
    expect(events.some((item) => item.reason === 'ตอบคำถามหน้าชั้น' && item.points === 5)).toBe(true);
  });

  it('starts over when the fixtures are reloaded, which is what a refresh does', async () => {
    enablePreviewMode();
    const repository = getFixtureRepository();
    await repository.saveSubject({ code: 'GONE-01', name: 'หายหลังรีเฟรช', colorIndex: 1, iconKey: 'star' });
    expect(snapshotOf(repository).subjects.some((item) => item.code === 'GONE-01')).toBe(true);

    resetFixtureRepository();
    expect(snapshotOf(getFixtureRepository()).subjects.some((item) => item.code === 'GONE-01')).toBe(false);
  });
});
