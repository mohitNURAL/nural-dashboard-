import { BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip);
Chart.defaults.font.family = "'Work Sans', sans-serif";
Chart.defaults.color = '#383334';

export const BRAND = { p500: '#32499f', p700: '#18244e', s500: '#05cfd3', r500: '#e63639', n200: '#dfddde' };

export const axisTicks = { font: { size: 11 }, color: '#383334', precision: 0 };
export const tooltip = { titleFont: { family: 'Manrope', weight: 700 }, backgroundColor: BRAND.p700, padding: 10, cornerRadius: 8 };
