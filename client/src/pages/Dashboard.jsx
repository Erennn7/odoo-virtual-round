import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Boxes, Package, CalendarClock, ArrowLeftRight, Undo2, Wrench, AlertTriangle,
  ClipboardCheck, Plus, ScrollText, ChevronRight, Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { PageHeader, PageSpinner, Avatar, EmptyState } from '../components/ui';
import { fmtAgo, fmtDateTime, humanize, fmtNumber } from '../utils/format';
import { ASSET_STATUS } from '../utils/constants';

/* KPI card definitions per audience — icon, tone, route */
const LEADERSHIP_CARDS = [
  { key: 'assetsAvailable', label: 'Assets Available', icon: Boxes, tone: 'emerald', to: '/assets?status=AVAILABLE' },
  { key: 'assetsAllocated', label: 'Assets Allocated', icon: Package, tone: 'blue', to: '/assets?status=ALLOCATED' },
  { key: 'activeBookings', label: 'Active Bookings', icon: CalendarClock, tone: 'violet', to: '/bookings' },
  { key: 'pendingTransfers', label: 'Pending Transfers', icon: ArrowLeftRight, tone: 'amber', to: '/transfers' },
  { key: 'upcomingReturns', label: 'Upcoming Returns', icon: Undo2, tone: 'cyan', to: '/allocations' },
  { key: 'maintenanceToday', label: 'Maintenance Today', icon: Wrench, tone: 'orange', to: '/maintenance' },
  { key: 'overdueReturns', label: 'Overdue Returns', icon: AlertTriangle, tone: 'red', to: '/allocations?overdue=true' },
  { key: 'openAudits', label: 'Open Audits', icon: ClipboardCheck, tone: 'indigo', to: '/audits' },
];

const EMPLOYEE_CARDS = [
  { key: 'myAssets', label: 'My Assets', icon: Package, tone: 'blue', to: '/my-assets' },
  { key: 'activeBookings', label: 'My Bookings', icon: CalendarClock, tone: 'violet', to: '/bookings' },
  { key: 'openMaintenance', label: 'My Open Requests', icon: Wrench, tone: 'orange', to: '/maintenance' },
  { key: 'pendingTransfers', label: 'Pending Transfers', icon: ArrowLeftRight, tone: 'amber', to: '/transfers' },
  { key: 'upcomingReturns', label: 'Upcoming Returns', icon: Undo2, tone: 'cyan', to: '/my-assets' },
  { key: 'overdueReturns', label: 'Overdue Returns', icon: AlertTriangle, tone: 'red', to: '/my-assets' },
];

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  cyan: 'bg-cyan-50 text-cyan-600',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
  indigo: 'bg-indigo-50 text-indigo-600',
};

function KpiCard({ card, value, index, alert }) {
  const navigate = useNavigate();
  const Icon = card.icon;
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      onClick={() => navigate(card.to)}
      className={`group rounded-2xl bg-white p-5 text-left shadow-sm ring-1 transition-shadow hover:shadow-md ${
        alert ? 'ring-red-200' : 'ring-slate-900/5'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${TONES[card.tone]}`}><Icon size={19} /></div>
        <ChevronRight size={15} className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400" />
      </div>
      <p className={`mt-4 text-3xl font-bold tracking-tight ${alert ? 'text-red-600' : 'text-slate-900'}`}>
        {fmtNumber(value)}
      </p>
      <p className="mt-1 text-[13px] font-medium text-slate-500">{card.label}</p>
    </motion.button>
  );
}

/** Horizontal breakdown of the asset fleet by lifecycle status. */
function StatusBreakdown({ breakdown }) {
  const total = breakdown.reduce((s, r) => s + r.count, 0);
  if (!total) return null;
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <h3 className="text-sm font-semibold text-slate-800">Fleet by lifecycle status</h3>
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {breakdown.map((r) => (
          <motion.div
            key={r.status}
            initial={{ width: 0 }} animate={{ width: `${(r.count / total) * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`${ASSET_STATUS[r.status]?.dot ?? 'bg-slate-300'} border-r-2 border-white last:border-0`}
            title={`${humanize(r.status)}: ${r.count}`}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {breakdown.map((r) => (
          <div key={r.status} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${ASSET_STATUS[r.status]?.dot ?? 'bg-slate-300'}`} />
            <span className="text-slate-500">{humanize(r.status)}</span>
            <span className="ml-auto font-semibold text-slate-700">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isLeadership, isManager } = useAuth();
  const navigate = useNavigate();
  const { data, loading } = useFetch('/dashboard');

  if (loading) return <PageSpinner />;
  if (!data) return null;

  const cards = isLeadership ? LEADERSHIP_CARDS : EMPLOYEE_CARDS;
  const quickActions = [
    isManager && { label: 'Register asset', to: '/assets?new=true', icon: Plus },
    isManager && { label: 'Allocate asset', to: '/allocations?new=true', icon: Package },
    { label: 'Book a resource', to: '/bookings?new=true', icon: CalendarClock },
    { label: 'Report an issue', to: '/maintenance?new=true', icon: Wrench },
    isManager && { label: 'Start an audit', to: '/audits?new=true', icon: ClipboardCheck },
  ].filter(Boolean);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user.fullName.split(' ')[0]} 👋`}
        subtitle={
          isLeadership
            ? `Live overview across ${fmtNumber(data.kpis.totalAssets ?? 0)} assets.`
            : 'Here is what is on your plate today.'
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {cards.map((card, i) => (
          <KpiCard
            key={card.key} card={card} index={i}
            value={data.kpis[card.key] ?? 0}
            alert={card.key === 'overdueReturns' && Number(data.kpis[card.key]) > 0}
          />
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        {quickActions.map(({ label, to, icon: Icon }) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600 hover:shadow"
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Recent activity */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ScrollText size={15} className="text-slate-400" /> Recent activity
            </h3>
            {isLeadership && (
              <button onClick={() => navigate('/activity')} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                View all
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {data.recentActivity.length === 0 && (
              <EmptyState title="No activity yet" message="Actions across the system will appear here." />
            )}
            {data.recentActivity.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.04 }}
                className="flex items-center gap-3 px-5 py-3"
              >
                <Avatar name={a.actorName ?? 'System'} color={a.actorColor ?? '#94a3b8'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">{a.details ?? humanize(a.action)}</p>
                  <p className="text-[11px] text-slate-400">
                    {a.actorName ?? 'System'} · {humanize(a.action)} · {fmtAgo(a.createdAt)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {/* Pending requests */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-800">
                {isLeadership ? 'Awaiting your approval' : 'Your pending requests'}
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data.pendingRequests.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing pending 🎉</p>
              )}
              {data.pendingRequests.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  onClick={() => navigate(r.kind === 'transfer' ? '/transfers' : '/maintenance')}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <span className={`rounded-lg p-2 ${r.kind === 'transfer' ? 'bg-amber-50 text-amber-600' : 'bg-orange-50 text-orange-600'}`}>
                    {r.kind === 'transfer' ? <ArrowLeftRight size={14} /> : <Wrench size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">{r.title}</span>
                    <span className="block truncate text-xs text-slate-400">{r.subtitle}</span>
                  </span>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>

          {/* Upcoming bookings */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Clock size={14} className="text-slate-400" /> Upcoming bookings
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data.upcomingBookings.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">No upcoming bookings</p>
              )}
              {data.upcomingBookings.map((b) => (
                <button key={b.id} onClick={() => navigate('/bookings')}
                  className="flex w-full flex-col px-5 py-3 text-left transition-colors hover:bg-slate-50">
                  <span className="truncate text-sm font-medium text-slate-700">{b.assetName}</span>
                  <span className="truncate text-xs text-slate-400">
                    {fmtDateTime(b.startTime)} · {b.purpose}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {isLeadership && data.statusBreakdown.length > 0 && <StatusBreakdown breakdown={data.statusBreakdown} />}
        </div>
      </div>
    </div>
  );
}
