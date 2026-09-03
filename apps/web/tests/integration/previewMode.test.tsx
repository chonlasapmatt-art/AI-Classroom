import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
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

    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่โหมด Preview' }));
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
