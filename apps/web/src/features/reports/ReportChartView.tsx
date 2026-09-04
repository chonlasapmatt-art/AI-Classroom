import type { ReportChart } from './reportBuilders';

/**
 * One series, drawn in HTML rather than in SVG.
 *
 * The categories here are Thai phrases — "ต่ำกว่า 60%", "นักเรียนกลุ่มเสี่ยง" — and SVG text does
 * not wrap. In an SVG chart those labels are either clipped at a fixed width or the plot has to be
 * measured before it can be laid out. Rows of HTML wrap, reflow at any width and inherit the
 * product's type tokens, and the reader gets the same picture.
 *
 * Every bar is the same hue. Shading them by length would spend a channel restating the length, and
 * it would imply the categories are ordered when several of these are not.
 *
 * The value is printed beside every bar, so the chart never depends on hover to be readable — which
 * is the only way it can be read on a phone or in print.
 */
export function ReportChartView({ chart }: { chart: ReportChart }) {
  const max = Math.max(...chart.bars.map((bar) => bar.value), 1);

  return (
    <figure className="report-chart">
      <figcaption>{chart.caption}</figcaption>
      <div className="report-chart-rows">
        {chart.bars.map((bar) => (
          <div className="report-chart-row" key={bar.label}>
            <span className="report-chart-label" title={bar.label}>{bar.label}</span>
            <span className="report-chart-track">
              <span
                className="report-chart-bar"
                // A zero-length bar is still a category with a value of zero, so it keeps a sliver
                // of width — a row that vanishes reads as a category that does not exist.
                style={{ width: `${Math.max((bar.value / max) * 100, bar.value > 0 ? 2 : 0)}%` }}
              />
            </span>
            <span className="report-chart-value">{bar.value.toLocaleString('th-TH')} {chart.unit}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
