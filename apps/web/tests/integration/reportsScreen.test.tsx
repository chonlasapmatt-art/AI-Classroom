// Reading a report, as opposed to exporting one.
//
// The screen was a picker and a table. There was no way to find a row without scrolling, no way to
// order one, no way to read a wide row on a phone, and no shape to the numbers at all — a hundred
// attendance percentages in a column is data a person has to do arithmetic on before it says
// anything. The chart is built from the report's own rows rather than from a second query, so the
// picture and the table cannot disagree about what is on screen.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { resetFixtureRepository } from '../../src/data/fixtureSchoolRepository';
import { disablePreviewMode, enablePreviewMode } from '../../src/preview/previewMode';
import { buildFixtureData } from '../../src/data/fixtures/schoolFixture';
import { buildReport, reportChart, toCsv } from '../../src/features/reports/reportBuilders';

afterEach(() => { cleanup(); disablePreviewMode(); resetFixtureRepository(); });

function renderReports() {
  enablePreviewMode();
  return render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>);
}

const bodyRows = () => document.querySelectorAll('.ui-table tbody tr');

describe('a report on screen', () => {
  it('draws no chart for a report with one category', async () => {
    renderReports();
    // The roster opens first and every student in it is กำลังศึกษา. One full-width bar says nothing
    // the number beside it did not, and reads as a broken chart rather than a complete one.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายชื่อนักเรียน'));
    expect(document.querySelector('.report-chart')).toBeNull();
  });

  it('draws one bar per category with the value beside it', async () => {
    renderReports();
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    const picker = screen.getByLabelText('รายงาน') as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: 'attendance' } });

    await waitFor(() => expect(document.querySelector('.report-chart')).not.toBeNull());
    const chart = document.querySelector('.report-chart')!;
    // Printed values, not a hover-only tooltip: a chart that needs a pointer is unreadable on a
    // phone and in print, which is where these reports are most often looked at.
    expect(chart.querySelectorAll('.report-chart-value').length).toBe(chart.querySelectorAll('.report-chart-bar').length);
    expect(chart.querySelectorAll('.report-chart-bar').length).toBeGreaterThan(1);
  });

  it('finds a row without asking which column to look in', async () => {
    renderReports();
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(1));
    const total = bodyRows().length;
    const name = bodyRows()[0]!.querySelectorAll('td')[1]!.textContent!;

    fireEvent.change(screen.getByPlaceholderText(/ค้นหาในตาราง/), { target: { value: name } });
    await waitFor(() => expect(bodyRows().length).toBeLessThan(total));
    expect(bodyRows()[0]!.textContent).toContain(name);
  });

  it('says nothing matched instead of showing an empty table', async () => {
    renderReports();
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาในตาราง/), { target: { value: 'ไม่มีแถวนี้แน่นอน' } });
    await waitFor(() => expect(screen.getByText('ไม่พบแถวที่ตรงกับคำค้น')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'แสดงทุกแถวอีกครั้ง' }));
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
  });

  it('orders by a column, and says which way round it is', async () => {
    renderReports();
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(1));
    const header = screen.getByRole('button', { name: /ชื่อ-สกุล/ });

    fireEvent.click(header);
    await waitFor(() => expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending'));
    const ascending = [...bodyRows()].map((row) => row.querySelectorAll('td')[1]!.textContent!);

    fireEvent.click(header);
    await waitFor(() => expect(header.closest('th')).toHaveAttribute('aria-sort', 'descending'));
    expect([...bodyRows()].map((row) => row.querySelectorAll('td')[1]!.textContent!)).toEqual([...ascending].reverse());
  });

  it('opens one row as a list, for the columns a phone scrolled away', async () => {
    renderReports();
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    fireEvent.click(within(bodyRows()[0] as HTMLElement).getByRole('button', { name: 'ดูรายละเอียด' }));

    const drawer = await screen.findByRole('dialog', { name: 'รายละเอียดของแถวนี้' });
    // Every column, named — the point is the ones the table could not fit.
    expect(within(drawer).getByText('รหัสนักเรียน')).toBeInTheDocument();
    expect(within(drawer).getByText('สถานะ')).toBeInTheDocument();
  });
});

describe('what the chart is counting', () => {
  it('is nothing at all when the report has no rows', () => {
    expect(reportChart({ id: 'grade', title: 'x', columns: [], rows: [] })).toBeNull();
  });

  it('counts a student once per reason they are at risk, and says so', () => {
    const chart = reportChart({
      id: 'at-risk', title: 'x', columns: [],
      rows: [['1', 'ก', 50, 3, 10, 'เข้าเรียนน้อย / งานค้างส่ง']]
    })!;
    // One student, two bars of one: the caption has to name the unit as occurrences rather than
    // people, or the chart reads as twice as many children in trouble as there are.
    expect(chart.bars).toEqual([
      { label: 'เข้าเรียนน้อย', value: 1 },
      { label: 'งานค้างส่ง', value: 1 }
    ]);
    expect(chart.caption).toContain('จำนวนครั้ง');
  });

  it('keeps a band for a range nobody is in, rather than dropping the row', () => {
    const chart = reportChart({
      id: 'attendance', title: 'x', columns: [],
      rows: [['1', 'ก', 0, 0, 0, 0, 95], ['2', 'ข', 0, 0, 0, 0, 92]]
    })!;
    // A distribution that hides its empty bands claims the scale stops where the data does.
    expect(chart.bars).toHaveLength(5);
    expect(chart.bars[0]).toEqual({ label: '90–100%', value: 2 });
    expect(chart.bars[4]).toEqual({ label: 'ต่ำกว่า 60%', value: 0 });
  });
});

describe('the export', () => {
  it('is built from the rows the reader filtered to, not from the whole report', async () => {
    // The property is held on the builder rather than on a download, which jsdom cannot perform:
    // the page passes the filtered rows into the same CSV function, so this is what it produces.
    const fixture = buildFixtureData();
    const report = buildReport('student', fixture, fixture.primaryClassId);
    expect(report.rows.length).toBeGreaterThan(1);

    const oneRow = toCsv({ ...report, rows: report.rows.slice(0, 1) });
    expect(oneRow.trim().split('\r\n')).toHaveLength(2);
  });
});
