import { format, formatDistanceToNow, parseISO } from 'date-fns';

const toDate = (value) => (typeof value === 'string' ? parseISO(value) : value);

export const fmtDate = (value) => (value ? format(toDate(value), 'dd MMM yyyy') : '—');
export const fmtDateTime = (value) => (value ? format(toDate(value), 'dd MMM yyyy, h:mm a') : '—');
export const fmtTime = (value) => (value ? format(toDate(value), 'h:mm a') : '—');
export const fmtAgo = (value) => (value ? formatDistanceToNow(toDate(value), { addSuffix: true }) : '—');

export const fmtCurrency = (value, currency = 'INR') =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export const fmtNumber = (value) => new Intl.NumberFormat('en-IN').format(value ?? 0);

/** "UNDER_MAINTENANCE" → "Under maintenance" */
export const humanize = (value) =>
  value ? value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ') : '';

/** Local datetime string (for <input type="datetime-local">) → ISO */
export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
