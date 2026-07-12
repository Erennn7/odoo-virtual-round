import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Download } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, TOKEN_KEY } from '../api/client';
import { useToast } from '../context/ToastContext';
import { PageHeader, PageSpinner, Button } from '../components/ui';
import { CHART } from '../utils/constants';
import { fmtCurrency, fmtNumber } from '../utils/format';

/**
 * Report registry: one definition per report — tab label, columns for the
 * table view, and (optionally) which chart renders above it.
 */
const REPORTS = [
  {
    id: 'utilization', label: 'Utilization', chart: 'utilization',
    columns: [
      { key: 'category', header: 'Category' },
      { key: 'total', header: 'Total' },
      { key: 'allocated', header: 'Allocated' },
      { key: 'available', header: 'Available' },
      { key: 'underMaintenance', header: 'In maintenance' },
      { key: 'utilizationPct', header: 'Utilization %', render: (r) => `${r.utilizationPct ?? 0}%` },
    ],
  },
  {
    id: 'department-summary', label: 'Departments', chart: 'departments',
    columns: [
      { key: 'department', header: 'Department' },
      { key: 'totalAssets', header: 'Assets' },
      { key: 'allocated', header: 'Allocated' },
      { key: 'available', header: 'Available' },
      { key: 'employees', header: 'Employees' },
      { key: 'totalValue', header: 'Total value', render: (r) => fmtCurrency(r.totalValue) },
    ],
  },
  {
    id: 'booking-heatmap', label: 'Booking heatmap', chart: 'heatmap',
    columns: [
      { key: 'weekday', header: 'Weekday', render: (r) => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][r.weekday] },
      { key: 'hour', header: 'Hour', render: (r) => `${String(r.hour).padStart(2, '0')}:00` },
      { key: 'bookings', header: 'Bookings' },
    ],
  },
  {
    id: 'most-used', label: 'Most used',
    columns: [
      { key: 'name', header: 'Asset' },
      { key: 'assetTag', header: 'Tag' },
      { key: 'category', header: 'Category' },
      { key: 'allocationCount', header: 'Allocations' },
      { key: 'bookingCount', header: 'Bookings' },
      { key: 'totalUsage', header: 'Total usage' },
    ],
  },
  {
    id: 'idle', label: 'Idle assets',
    columns: [
      { key: 'name', header: 'Asset' },
      { key: 'assetTag', header: 'Tag' },
      { key: 'category', header: 'Category' },
      { key: 'location', header: 'Location' },
      { key: 'idleDays', header: 'Idle days' },
    ],
  },
  {
    id: 'maintenance-frequency', label: 'Maintenance frequency',
    columns: [
      { key: 'name', header: 'Asset' },
      { key: 'assetTag', header: 'Tag' },
      { key: 'requestCount', header: 'Requests' },
      { key: 'resolved', header: 'Resolved' },
      { key: 'totalCost', header: 'Total cost', render: (r) => fmtCurrency(r.totalCost) },
    ],
  },
  {
    id: 'maintenance-due', label: 'Due for maintenance',
    columns: [
      { key: 'name', header: 'Asset' },
      { key: 'assetTag', header: 'Tag' },
      { key: 'title', header: 'Issue' },
      { key: 'priority', header: 'Priority' },
      { key: 'status', header: 'Status' },
      { key: 'technicianName', header: 'Technician' },
    ],
  },
  {
    id: 'nearing-retirement', label: 'Nearing retirement',
    columns: [
      { key: 'name', header: 'Asset' },
      { key: 'assetTag', header: 'Tag' },
      { key: 'category', header: 'Category' },
      { key: 'ageMonths', header: 'Age (months)' },
      { key: 'lifespanMonths', header: 'Lifespan (months)' },
      { key: 'lifeUsedPct', header: 'Life used', render: (r) => `${r.lifeUsedPct}%` },
    ],
  },
  {
    id: 'overdue-returns', label: 'Overdue returns',
    columns: [
      { key: 'asset', header: 'Asset' },
      { key: 'assetTag', header: 'Tag' },
      { key: 'holder', header: 'Holder' },
      { key: 'department', header: 'Department' },
      { key: 'daysOverdue', header: 'Days overdue' },
    ],
  },
  {
    id: 'audit-summary', label: 'Audit summary',
    columns: [
      { key: 'name', header: 'Audit' },
      { key: 'status', header: 'Status' },
      { key: 'totalItems', header: 'Assets' },
      { key: 'verified', header: 'Verified' },
      { key: 'missing', header: 'Missing' },
      { key: 'damaged', header: 'Damaged' },
      { key: 'verifiedPct', header: 'Verified %', render: (r) => r.verifiedPct === null ? '—' : `${r.verifiedPct}%` },
    ],
  },
];

const tooltipStyle = {
  borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12,
  boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
};

/** Utilization: one measure across categories → single-hue bars. */
function UtilizationChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="0" vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="category" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} interval={0} angle={-12} dy={6} />
        <YAxis unit="%" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Utilization']} cursor={{ fill: 'rgb(15 23 42 / 0.03)' }} />
        <Bar dataKey="utilizationPct" name="Utilization" fill={CHART.categorical[0]} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Departments: allocated vs available (two fixed categorical slots + legend). */
function DepartmentChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="department" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} interval={0} angle={-12} dy={6} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(15 23 42 / 0.03)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar dataKey="allocated" name="Allocated" stackId="a" fill={CHART.categorical[0]} stroke="#ffffff" strokeWidth={2} maxBarSize={44} />
        <Bar dataKey="available" name="Available" stackId="a" fill={CHART.categorical[1]} stroke="#ffffff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Booking heatmap: weekday × hour grid on a single-hue sequential ramp. */
function BookingHeatmap({ rows }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00–19:00
  const max = Math.max(1, ...rows.map((r) => r.bookings));
  const valueAt = (d, h) => rows.find((r) => r.weekday === d + 1 && r.hour === h)?.bookings ?? 0;
  const colorFor = (v) => {
    if (v === 0) return '#f1f5f9';
    const idx = Math.min(CHART.sequential.length - 1, Math.round((v / max) * (CHART.sequential.length - 1)));
    return CHART.sequential[Math.max(2, idx)];
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid gap-1" style={{ gridTemplateColumns: `44px repeat(${hours.length}, 1fr)` }}>
          <div />
          {hours.map((h) => (
            <div key={h} className="text-center text-[10px] text-slate-400">{String(h).padStart(2, '0')}</div>
          ))}
          {days.map((day, d) => (
            <div key={day} className="contents">
              <div className="flex items-center text-[11px] font-medium text-slate-500">{day}</div>
              {hours.map((h) => {
                const v = valueAt(d, h);
                return (
                  <div key={h}
                    className="aspect-square min-h-6 rounded transition-transform hover:scale-110 hover:ring-2 hover:ring-white"
                    style={{ backgroundColor: colorFor(v) }}
                    title={`${day} ${String(h).padStart(2, '0')}:00 — ${v} booking${v === 1 ? '' : 's'}`} />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-slate-400">
          Fewer
          {[0, 3, 6, 9, 12].map((i) => (
            <span key={i} className="h-3 w-3 rounded-sm" style={{ backgroundColor: i === 0 ? '#f1f5f9' : CHART.sequential[i] }} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const toast = useToast();
  const [active, setActive] = useState(REPORTS[0]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/${active.id}`)
      .then((r) => setRows(r.data.data))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = async () => {
    try {
      const res = await fetch(`/api/reports/${active.id}?format=csv`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url, download: `${active.id}-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report exported as CSV');
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Utilization, usage patterns, lifecycle risk and audit outcomes — exportable as CSV."
        actions={<Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>}
      />

      {/* Report tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => setActive(r)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
              active.id === r.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageSpinner />
      ) : (
        <motion.div key={active.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* Chart layer */}
          {active.chart && rows.length > 0 && (
            <div className="mb-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
              {active.chart === 'utilization' && <UtilizationChart rows={rows} />}
              {active.chart === 'departments' && <DepartmentChart rows={rows} />}
              {active.chart === 'heatmap' && <BookingHeatmap rows={rows} />}
            </div>
          )}

          {/* Table view (always present — also the accessibility fallback) */}
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {active.columns.map((c) => <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={active.columns.length} className="px-4 py-12 text-center text-sm text-slate-400">
                      <BarChart3 size={20} className="mx-auto mb-2 text-slate-300" />
                      No data for this report yet.
                    </td></tr>
                  )}
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      {active.columns.map((c) => (
                        <td key={c.key} className="px-4 py-3 tabular-nums text-slate-600">
                          {c.render ? c.render(row) : typeof row[c.key] === 'number' ? fmtNumber(row[c.key]) : row[c.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
