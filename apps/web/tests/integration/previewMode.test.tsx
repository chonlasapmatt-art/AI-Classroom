import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode, isPreviewActive, isPreviewModeAvailable } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

describe('preview mode', () => {
  it('is available in a development build and stays off until requested', () => {
    expect(isPreviewModeAvailable).toBe(true);
    expect(isPreviewActive()).toBe(false);
  });

  it('offers the preview entry on the Supabase configuration screen', async () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByText('เชื่อมต่อ Supabase')).toBeInTheDocument();
    expect(screen.getByText('สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่โหมด Preview' }));
    expect(isPreviewActive()).toBe(true);
    await waitFor(() => expect(screen.getByText(/Preview \/ Development Only/)).toBeInTheDocument());
  });

  it('renders the dashboard from fixtures and switches roles', async () => {
    enablePreviewMode();
    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('สวัสดี'));
    expect(screen.getByText('นักเรียนทั้งหมด')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ครู/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(screen.queryByRole('link', { name: /ครู/ })).not.toBeInTheDocument());
  });
});
