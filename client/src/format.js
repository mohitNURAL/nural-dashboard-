// ₹ Lakh formatting and India-locale dates (SRS §7 Currency/locale).

const lakhFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** Rupees → "₹12.5L" (matches the prototype's fmtLakh). */
export function fmtLakh(rupees) {
  if (!rupees || rupees <= 0) return '₹0';
  return `₹${lakhFmt.format(Math.round(rupees / 1000) / 100)}L`;
}

export const fmtPct = (ratio) => (ratio == null ? '—' : `${Math.round(ratio * 1000) / 10}%`.replace('.0%', '%'));

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function fmtDateTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function isoDate(d) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}
