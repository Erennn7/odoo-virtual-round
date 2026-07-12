import { motion } from 'framer-motion';
import { ScrollText, Search } from 'lucide-react';
import { usePagedList } from '../hooks/usePagedList';
import { Avatar, Badge, EmptyState, PageHeader, Pagination, SkeletonRows } from '../components/ui';
import { ROLES } from '../utils/constants';
import { fmtDateTime, humanize } from '../utils/format';

const ENTITY_TYPES = ['asset', 'allocation', 'transfer', 'booking', 'maintenance', 'audit', 'user', 'department', 'category', 'organization'];

function StateDiff({ log }) {
  if (!log.previousState && !log.newState) return null;
  const fmt = (s) => s && Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(', ');
  return (
    <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-slate-500">
      {log.previousState && <span className="text-red-500/80">− {fmt(log.previousState)}</span>}
      {log.previousState && log.newState && <br />}
      {log.newState && <span className="text-emerald-600/90">+ {fmt(log.newState)}</span>}
    </p>
  );
}

export default function ActivityLogs() {
  const list = usePagedList('/activity-logs', { initialFilters: { entityType: '' }, limit: 20 });

  return (
    <div>
      <PageHeader
        title="Activity Logs"
        subtitle="Immutable audit trail — who did what, with previous and new state. Records cannot be edited or deleted."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search actions or details…"
            value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={list.filters.entityType}
          onChange={(e) => list.setFilters((f) => ({ ...f, entityType: e.target.value }))}>
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
        {list.loading ? (
          <SkeletonRows rows={8} cols={3} />
        ) : list.rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No log entries" message="System activity will be recorded here." />
        ) : (
          <div className="divide-y divide-slate-50">
            {list.rows.map((log, i) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className="flex gap-3 px-5 py-3.5"
              >
                <Avatar name={log.actorName ?? 'System'} color={log.actorColor ?? '#94a3b8'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-slate-800">{log.actorName ?? 'System'}</span>
                    {log.actorRole && <Badge meta={ROLES[log.actorRole]} withDot={false} />}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500">
                      {log.action}
                    </span>
                    <span className="text-[11px] text-slate-400">on {log.entityType}</span>
                    <span className="ml-auto text-[11px] tabular-nums text-slate-400">{fmtDateTime(log.createdAt)}</span>
                  </div>
                  {log.details && <p className="mt-0.5 text-sm text-slate-600">{log.details}</p>}
                  <StateDiff log={log} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
        <Pagination pagination={list.pagination} onPage={list.setPage} />
      </div>
    </div>
  );
}
