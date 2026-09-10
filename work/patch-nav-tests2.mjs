import { patch } from './patchlib.mjs';

// "ห้องเรียน" also appears inside other menu labels, so the assertion names the row exactly.
patch('apps/web/tests/integration/classroomLive.test.tsx', [[
  `  it('keeps the room list, and with it the board, out of a student session', async () => {
    renderApp('/');
    const menu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    await waitFor(() => expect(menu().getByRole('link', { name: /ห้องเรียน/ })).toBeInTheDocument());

    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(menu().queryByRole('link', { name: /ห้องเรียน/ })).not.toBeInTheDocument());
  });`,
  `  it('keeps the room list, and with it the board, out of a student session', async () => {
    renderApp('/');
    const menu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    await waitFor(() => expect(menu().getByRole('link', { name: 'ห้องเรียน' })).toBeInTheDocument());

    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(menu().queryByRole('link', { name: 'ห้องเรียน' })).not.toBeInTheDocument());
  });`
]]);

patch('apps/web/tests/integration/roleNavigation.test.tsx', [[
  `    // The register is reached from the room now, so the hub shortcuts the room rather than the board.
    await waitFor(() => expect(within(hub!).getByRole('link', { name: /ห้องเรียน/ })).toBeInTheDocument());
    expect(within(hub!).queryByRole('link', { name: /เปิดคาบเรียน/ })).not.toBeInTheDocument();`,
  `    // The register is reached from the room now, so the hub shortcuts the room rather than the board.
    await waitFor(() => expect(within(hub!).getByRole('link', { name: 'ห้องเรียน' })).toBeInTheDocument());
    expect(within(hub!).queryByRole('link', { name: /เปิดคาบเรียน/ })).not.toBeInTheDocument();`
]]);
console.log('menu assertions tightened');
