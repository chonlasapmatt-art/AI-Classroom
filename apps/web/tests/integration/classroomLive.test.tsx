import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderApp(path = '/classroom') {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

/**
 * The live-classroom board.
 *
 * What these hold is the part a teacher stands in front of a class to use: the tools are there, the
 * team split is real, and the screen is closed to the roles that would only be refused by the
 * server anyway.
 */
describe('classroom live tools', () => {
  it('opens on the picker with every tool one tap away', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('กิจกรรมหน้าชั้น'));
    const tabs = within(screen.getByRole('tablist', { name: 'เครื่องมือหน้าชั้น' }));
    for (const label of ['สุ่มชื่อ', 'สุ่มทีม', 'สุ่มคำถาม', 'จับเวลา']) {
      expect(tabs.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'สุ่มชื่อ' })).toBeInTheDocument();
  });

  it('splits the room into teams that hold every student once', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('tab', { name: 'สุ่มทีม' }));
    fireEvent.click(screen.getByRole('button', { name: 'แบ่งทีมใหม่' }));
    await waitFor(() => expect(screen.getByText('ทีมแดง')).toBeInTheDocument());
    expect(screen.getByText('ทีมน้ำเงิน')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /ให้ทั้งทีม/ }).length).toBeGreaterThan(0);
  });

  it('runs a countdown a room can read from the back', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('tab', { name: 'จับเวลา' }));
    // The clock and the preset that sets it both read '05:00', so the assertion names the clock.
    const clock = () => document.querySelector('.classroom-timer strong')?.textContent;
    expect(clock()).toBe('01:00');
    fireEvent.click(screen.getByRole('button', { name: '05:00' }));
    await waitFor(() => expect(clock()).toBe('05:00'));
    expect(screen.getByRole('button', { name: 'เริ่มจับเวลา' })).toBeInTheDocument();
  });

  it('keeps the board in the teacher menu and out of a student session', async () => {
    renderApp('/');
    const menu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    await waitFor(() => expect(menu().getByRole('link', { name: /กิจกรรมหน้าชั้น/ })).toBeInTheDocument());

    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(menu().queryByRole('link', { name: /กิจกรรมหน้าชั้น/ })).not.toBeInTheDocument());
  });

  it('refuses the screen itself to a student, not only the menu entry', async () => {
    renderApp('/');
    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    cleanup();
    renderApp('/classroom');
    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(screen.getByText('กิจกรรมหน้าชั้นเปิดให้ครูและผู้ดูแล')).toBeInTheDocument());
  });
});
