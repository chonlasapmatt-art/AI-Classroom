import { patch } from './patchlib.mjs';

/*
 * The register is reached from the room now rather than from the menu, so the menu is no longer
 * where these two assertions should look. What still matters is the part they were really about:
 * a student must not reach the board, by menu or by address.
 */
patch('apps/web/tests/integration/classroomLive.test.tsx', [[
  `  it('keeps the board in the teacher menu and out of a student session', async () => {
    renderApp('/');
    const menu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    await waitFor(() => expect(menu().getByRole('link', { name: /เปิดคาบเรียน/ })).toBeInTheDocument());

    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(menu().queryByRole('link', { name: /เปิดคาบเรียน/ })).not.toBeInTheDocument());
  });`,
  `  it('reaches the board from the room a teacher teaches, never from the menu', async () => {
    renderApp('/classes');
    const menu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    // The room card carries the two jobs as two buttons; the menu offers neither, because it would
    // be a third door into a screen that then has to ask which room it is standing in.
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'เช็กชื่อ' }).length).toBeGreaterThan(0));
    expect(screen.getAllByRole('button', { name: /ดูรายชื่อนักเรียน/ }).length).toBeGreaterThan(0);
    expect(menu().queryByRole('link', { name: /เปิดคาบเรียน/ })).not.toBeInTheDocument();
  });

  it('keeps the room list, and with it the board, out of a student session', async () => {
    renderApp('/');
    const menu = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
    await waitFor(() => expect(menu().getByRole('link', { name: /ห้องเรียน/ })).toBeInTheDocument());

    fireEvent.change(await screen.findByLabelText('เลือกบทบาท'), { target: { value: 'preview-student' } });
    await waitFor(() => expect(menu().queryByRole('link', { name: /ห้องเรียน/ })).not.toBeInTheDocument());
  });`
]]);

patch('apps/web/tests/integration/roleNavigation.test.tsx', [[
  `    await waitFor(() => expect(within(hub!).getByRole('link', { name: /เช็กชื่อ/ })).toBeInTheDocument());
    expect(within(hub!).getByRole('link', { name: /เปิดคาบเรียน/ })).toBeInTheDocument();`,
  `    // The register is reached from the room now, so the hub shortcuts the room rather than the board.
    await waitFor(() => expect(within(hub!).getByRole('link', { name: /ห้องเรียน/ })).toBeInTheDocument());
    expect(within(hub!).queryByRole('link', { name: /เปิดคาบเรียน/ })).not.toBeInTheDocument();`
]]);
console.log('menu tests follow the register into the room');
