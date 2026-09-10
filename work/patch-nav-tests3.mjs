import { patch } from './patchlib.mjs';
patch('apps/web/tests/integration/roleNavigation.test.tsx', [[
  `    const search = await within(hub).findByLabelText('ค้นหาทางลัด');
    fireEvent.change(search, { target: { value: 'เช็กชื่อ' } });
    await waitFor(() => expect(within(hub).getByRole('link', { name: /เช็กชื่อ/ })).toBeInTheDocument());
    // Something that plainly does not match, so the assertion is about the narrowing rather than
    // about one destination's current name: the register entry now carries the word "เช็กชื่อ"
    // itself, which is the point of it.
    expect(within(hub).queryByRole('link', { name: /ปฏิทิน/ })).not.toBeInTheDocument();`,
  `    const search = await within(hub).findByLabelText('ค้นหาทางลัด');
    fireEvent.change(search, { target: { value: 'ห้องเรียน' } });
    await waitFor(() => expect(within(hub).getByRole('link', { name: 'ห้องเรียน' })).toBeInTheDocument());
    // Something that plainly does not match, so the assertion is about the narrowing rather than
    // about one destination's current name.
    expect(within(hub).queryByRole('link', { name: /ปฏิทิน/ })).not.toBeInTheDocument();`
]]);
console.log('search test uses a destination the menu still offers');
