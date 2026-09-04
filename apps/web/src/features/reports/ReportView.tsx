import { useMemo, useState, type ReactNode } from 'react';
import {
  Badge, Button, Card, CardHeader, DataTable, Drawer, EmptyState, SearchInput, Stat
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { ReportChartView } from './ReportChartView';
import type { ReportChart } from './reportBuilders';

/**
 * A report, for either shape of report.
 *
 * The school-wide tables and a student's own were two screens that had drifted into asking the same
 * question differently: one had a class selector, both had a bare table and neither had a way to
 * find a row. They share this now, so a filter or a summary added for one is not missing from the
 * other a release later.
 */
export interface ReportViewProps {
  title: string;
  eyebrow: ReactNode;
  description?: ReactNode;
  columns: string[];
  rows: (string | number)[][];
  chart: ReportChart | null;
  /** Rendered above the table. The report picker, the class picker, whatever the caller owns. */
  controls: ReactNode;
  /** Given the rows currently on screen, so an export matches what was filtered to. */
  onExport(rows: (string | number)[][]): void;
  emptyTitle?: string;
  emptyDescription?: string;
}

type Sort = { column: number; direction: 'asc' | 'desc' } | null;

/** Numbers sort as numbers; everything else sorts the way Thai reads. */
function compare(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'th');
}

export function ReportView({
  title, eyebrow, description, columns, rows, chart, controls, onExport, emptyTitle, emptyDescription
}: ReportViewProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [inspecting, setInspecting] = useState<(string | number)[] | null>(null);

  /*
   * Search runs across the whole row rather than a chosen column.
   *
   * Which column holds a student's name changes from report to report, and asking somebody to pick
   * the column before they can search for a name is asking them to know the table's shape. Every
   * one of these tables is a few hundred rows at most, so scanning them all costs nothing a person
   * can perceive.
   */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? rows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(needle)))
      : rows;
    if (!sort) return matched;
    const sorted = [...matched].sort((left, right) => compare(left[sort.column] ?? '', right[sort.column] ?? ''));
    return sort.direction === 'desc' ? sorted.reverse() : sorted;
  }, [rows, query, sort]);

  function toggleSort(column: number) {
    setSort((current) => current?.column === column
      ? (current.direction === 'asc' ? { column, direction: 'desc' } : null)
      : { column, direction: 'asc' });
  }

  return (
    <>
      {controls}

      {/*
        * Two tiles reading the same number is not a summary.
        *
        * "แถวทั้งหมด 24" beside "แถวที่แสดงอยู่ 24" tells a reader nothing until a filter is on, so
        * the second appears only once the two can differ. The rest of the row is the largest few
        * categories the chart found — a fact about the data rather than about the table.
        */}
      <div className="ui-stat-grid">
        <Stat
          label="จำนวนแถวทั้งหมด" value={rows.length.toLocaleString('th-TH')}
          hint={title} tone="brand" icon={<Icon name="reports" size={18} />}
        />
        {filtered.length !== rows.length && (
          <Stat
            label="แถวที่แสดงอยู่" value={filtered.length.toLocaleString('th-TH')}
            hint={`กรองด้วย "${query.trim()}"`} tone="info" icon={<Icon name="filter" size={18} />}
          />
        )}
        {chart && [...chart.bars].sort((left, right) => right.value - left.value).slice(0, 3).map((bar) => (
          <Stat
            key={bar.label} label={bar.label} value={`${bar.value.toLocaleString('th-TH')} ${chart.unit}`}
            hint={chart.caption} tone="neutral" icon={<Icon name="star" size={18} />}
          />
        ))}
      </div>

      {chart && (
        <Card>
          <CardHeader title="ภาพรวมของรายงานนี้" description="คำนวณจากแถวทั้งหมดของรายงาน ไม่ใช่เฉพาะแถวที่กรองไว้" />
          <ReportChartView chart={chart} />
        </Card>
      )}

      <Card>
        <CardHeader
          title={title}
          {...(description ? { description } : {})}
          action={
            <div className="report-actions">
              <Badge tone="neutral">{eyebrow}</Badge>
              <Button
                variant="secondary" icon={<Icon name="download" size={16} />}
                disabled={filtered.length === 0}
                onClick={() => onExport(filtered)}
              >
                ส่งออก CSV
              </Button>
            </div>
          }
        />

        <div className="report-filter-row">
          <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาในตาราง เช่น ชื่อ รหัส หรือสถานะ" />
          {sort && (
            <Button variant="ghost" size="sm" onClick={() => setSort(null)}>
              ล้างการเรียง ({columns[sort.column]})
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="reports" size={28} />}
            title={emptyTitle ?? 'ไม่มีข้อมูลในรายงานนี้'}
            description={emptyDescription ?? 'ลองเลือกรายงานอื่นหรือช่วงเวลาอื่น'}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="search" size={28} />}
            title="ไม่พบแถวที่ตรงกับคำค้น"
            description={`ไม่มีแถวใดมีคำว่า "${query.trim()}"`}
            // Not "ล้างคำค้น": the search box's own clear button already carries that name, and two
            // controls answering to one name is a keyboard reader hearing the same option twice.
            action={<Button variant="secondary" onClick={() => setQuery('')}>แสดงทุกแถวอีกครั้ง</Button>}
          />
        ) : (
          <DataTable
            caption={title}
            head={
              <tr>
                {columns.map((column, index) => (
                  <th key={column} aria-sort={sort?.column === index ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {/* A header that sorts is a control, so it is a button — a clickable th gives a
                        keyboard reader no way to reach the sort and no way to hear that it exists. */}
                    <button type="button" className="report-sort" onClick={() => toggleSort(index)}>
                      {column}
                      <Icon name={sort?.column === index && sort.direction === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
                    </button>
                  </th>
                ))}
                <th><span className="ui-visually-hidden">รายละเอียด</span></th>
              </tr>
            }
          >
            {filtered.map((row, rowIndex) => (
              <tr key={`${String(row[0])}-${rowIndex}`}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                <td>
                  {/* Wide reports run off the side of a phone. Opening one row as a list is how the
                      columns that scrolled away stay readable without pinching. */}
                  <Button variant="ghost" size="sm" onClick={() => setInspecting(row)}>ดูรายละเอียด</Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      {inspecting && (
        <Drawer title="รายละเอียดของแถวนี้" onClose={() => setInspecting(null)}>
          <dl className="report-row-detail">
            {columns.map((column, index) => (
              <div key={column}>
                <dt>{column}</dt>
                <dd>{inspecting[index] ?? '-'}</dd>
              </div>
            ))}
          </dl>
        </Drawer>
      )}
    </>
  );
}
