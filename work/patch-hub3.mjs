import { patch } from './patchlib.mjs';
patch('apps/web/tests/integration/roleNavigation.test.tsx', [[
  `    const search = await screen.findByLabelText('ค้นหาเมนู');
    fireEvent.change(search, { target: { value: 'เช็กชื่อ' } });
    await waitFor(() => expect(mainMenu().getByRole('link', { name: /เช็กชื่อ/ })).toBeInTheDocument());
    expect(mainMenu().queryByRole('link', { name: /คลังข้อสอบ/ })).not.toBeInTheDocument();`,
  `    const search = await screen.findByLabelText('ค้นหาเมนู');
    // The register is not typed for here any more: it is reached from the room card, so the menu
    // neither lists it nor finds it. A destination the menu does still hold stands in its place.
    fireEvent.change(search, { target: { value: 'ห้องเรียน' } });
    await waitFor(() => expect(mainMenu().getByRole('link', { name: 'ห้องเรียน' })).toBeInTheDocument());
    expect(mainMenu().queryByRole('link', { name: /คลังข้อสอบ/ })).not.toBeInTheDocument();`
]]);
console.log('menu search test updated');
