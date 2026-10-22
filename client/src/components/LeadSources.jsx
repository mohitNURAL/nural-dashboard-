import { Bar } from 'react-chartjs-2';
import { axisTicks, BRAND, tooltip } from './chartSetup.js';
import { fmtPct } from '../format.js';

/** FR-5 — Top 6 acquisition sources, computed server-side from live sources. */
export default function LeadSources({ sources }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Lead Source Performance</h2>
          <div className="panel-sub">Top {sources.length || 6} acquisition sources by lead volume · “Call” and “Website” merged as Website Enquiry · Existing Client excluded</div>
        </div>
        <span className="badge badge-live">Live sources</span>
      </div>
      {sources.length === 0 ? (
        <div className="empty">No leads with an acquisition source in this period.</div>
      ) : (
        <>
          <div className="chart-box">
            <Bar
              data={{
                labels: sources.map((s) => s.source),
                datasets: [{ label: 'Leads', data: sources.map((s) => s.leads), backgroundColor: BRAND.p500, borderRadius: 6, maxBarThickness: 26 }],
              }}
              options={{
                indexAxis: 'y',
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip },
                scales: {
                  x: { beginAtZero: true, grid: { color: BRAND.n200 }, ticks: axisTicks },
                  y: { grid: { display: false }, ticks: axisTicks },
                },
              }}
            />
          </div>
          <div className="table-scroll">
            <table className="source-table">
              <thead><tr><th>Source</th><th className="num">Leads</th><th className="num">Converted to Deal</th><th>Conversion</th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source}>
                    <td>{s.source}</td>
                    <td className="num">{s.leads}</td>
                    <td className="num">{s.converted}</td>
                    <td>
                      <div className="source-rate">
                        <div className="source-bar"><span style={{ width: `${(s.conversion || 0) * 100}%` }} /></div>
                        {fmtPct(s.conversion)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
