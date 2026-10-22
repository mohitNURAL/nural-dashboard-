import { Bar } from 'react-chartjs-2';
import { axisTicks, BRAND, tooltip } from './chartSetup.js';

const SUBTITLE = { month: 'This month', quarter: 'Last 3 months', custom: 'Selected range, by month' };

/** FR-8 — Won vs Lost deal counts by close month. */
export default function TrendChart({ trend, period }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Won vs Lost Trend</h2>
          <div className="panel-sub">{SUBTITLE[period]} · deals moved to Closed Won / Closed Lost, by close date</div>
        </div>
        <span className="badge badge-live">Live totals</span>
      </div>
      <div className="chart-box tall">
        <Bar
          data={{
            labels: trend.map((t) => t.label),
            datasets: [
              { label: 'Won', data: trend.map((t) => t.won), backgroundColor: BRAND.s500, borderRadius: 6, maxBarThickness: 40 },
              { label: 'Lost', data: trend.map((t) => t.lost), backgroundColor: BRAND.r500, borderRadius: 6, maxBarThickness: 40 },
            ],
          }}
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { font: { family: 'Manrope', weight: 700, size: 11 }, color: BRAND.p700, boxWidth: 12, boxHeight: 12 } },
              tooltip,
            },
            scales: {
              x: { grid: { display: false }, ticks: axisTicks },
              y: { beginAtZero: true, grid: { color: BRAND.n200 }, ticks: axisTicks },
            },
          }}
        />
      </div>
    </section>
  );
}
