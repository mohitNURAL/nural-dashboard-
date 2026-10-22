// Export the current dashboard view (all panels' aggregates) as one CSV.

const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ratio = (r) => (r == null ? '' : (r * 100).toFixed(1));

export function exportCsv(data) {
  const { filters: f, kpis: k } = data;
  const lines = [];
  const add = (...cols) => lines.push(cols.map(cell).join(','));

  add('Nural CRM Performance Dashboard');
  add('Pipeline', f.pipelineLabel);
  add('Period', f.periodLabel);
  add('Data as of', data.sync?.lastSuccessAt ? new Date(data.sync.lastSuccessAt).toISOString() : '');
  add();
  add('KPI', 'Value');
  add('Open Deals', k.openDeals);
  add('Open Pipeline Value (INR)', Math.round(k.openPipelineValue));
  add('Weighted Forecast (INR)', Math.round(k.weightedForecast));
  add('Win Rate (%)', ratio(k.winRate));
  add('Won', k.won);
  add('Lost', k.lost);
  add('Avg Deal Size (INR)', k.avgDealSize == null ? '' : Math.round(k.avgDealSize));
  add('Deals at Risk', k.dealsAtRisk);
  add('New Leads', k.newLeads);
  add('Total Leads', k.totalLeads);
  add('Follow-ups due today (customers)', k.followUps.today);
  add('Follow-ups due this week', k.followUps.week);
  add('Follow-ups due this month', k.followUps.month);
  add(`Follow-ups due this quarter (${k.followUps.quarterLabel})`, k.followUps.quarter);
  add(`Follow-ups due next quarter (${k.followUps.nextQuarterLabel})`, k.followUps.nextQuarter);
  add('Follow-ups overdue', k.followUps.overdue);
  add('Follow-ups with no deadline', k.followUps.noDeadline);
  add('Error List — records', k.missingValue);
  add('Error List — no value', k.errorsNoValue);
  add('Error List — no customer name', k.errorsNoCustomer);
  add();
  add('Pipeline', 'Level', 'Open Deals', 'Open Value (INR)', 'Lost Value (INR)');
  for (const r of data.pipelineBreakdown.rows) {
    add(r.label, 'Flagship', r.openDeals, Math.round(r.openValue), Math.round(r.lostValue));
    for (const v of r.variants) add(v.label, 'Variant', v.openDeals, Math.round(v.openValue), Math.round(v.lostValue));
  }
  add();
  add('Lead Source', 'Leads', 'Converted', 'Conversion (%)');
  for (const s of data.leadSources) add(s.source, s.leads, s.converted, ratio(s.conversion));
  add();
  add('Month', 'Won', 'Lost');
  for (const t of data.trend) add(t.month, t.won, t.lost);
  add();
  add('Deal at Risk', 'Value (INR)', 'Stage', 'Days in Stage', 'Owner', 'Severity');
  for (const d of data.dealsAtRisk.rows) add(d.title, d.value, d.stage, d.daysInStage, d.owner, d.severity);

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nural-crm-${f.pipeline}-${f.period}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
