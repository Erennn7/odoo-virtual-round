import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Backpack, Wrench, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { usePagedList } from '../hooks/usePagedList';
import { Badge, Button, EmptyState, PageHeader, PageSpinner } from '../components/ui';
import { ASSET_STATUS } from '../utils/constants';
import { fmtDate } from '../utils/format';
import { MaintenanceRequestModal } from './Maintenance';
import { TransferRequestModal } from './Transfers';

/** Personal holdings view for every role. */
export default function MyAssets() {
  const navigate = useNavigate();
  const list = usePagedList('/allocations', { initialFilters: { mine: 'true', status: 'ACTIVE' }, limit: 30 });
  const [maintenanceFor, setMaintenanceFor] = useState(null);
  const [transferFor, setTransferFor] = useState(null);

  if (list.loading && !list.rows.length) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="My Assets"
        subtitle="Assets currently allocated to you. Report issues or request a transfer from here."
      />

      {list.rows.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
          <EmptyState
            icon={Backpack}
            title="Nothing allocated to you yet"
            message="When an asset manager allocates equipment to you, it will show up here."
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.rows.map((al, i) => (
            <motion.div
              key={al.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition-shadow hover:shadow-md ${
                al.isOverdue ? 'ring-red-200' : 'ring-slate-900/5'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => navigate(`/assets/${al.assetId}`)} className="text-left">
                  <p className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors">{al.assetName}</p>
                  <p className="text-xs text-slate-400">{al.assetTag} · {al.categoryName}</p>
                </button>
                <Badge meta={ASSET_STATUS[al.assetStatus]} withDot={false} />
              </div>

              <div className="mt-4 space-y-1 text-xs text-slate-500">
                <p>Allocated {fmtDate(al.allocatedAt)}</p>
                {al.isOverdue ? (
                  <p className="inline-flex items-center gap-1 font-semibold text-red-600">
                    <AlertTriangle size={12} /> Return was due {fmtDate(al.dueDate)}
                  </p>
                ) : (
                  <p>{al.dueDate ? `Due back ${fmtDate(al.dueDate)}` : 'No return date set'}</p>
                )}
                {al.purpose && <p className="text-slate-400">{al.purpose}</p>}
              </div>

              <div className="mt-4 flex gap-2 border-t border-slate-50 pt-3">
                <Button size="sm" variant="secondary" icon={Wrench} onClick={() => setMaintenanceFor(al)}>
                  Report issue
                </Button>
                <Button size="sm" variant="ghost" icon={ArrowLeftRight} onClick={() => setTransferFor(al)}>
                  Transfer
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <MaintenanceRequestModal
        open={!!maintenanceFor}
        onClose={() => setMaintenanceFor(null)}
        presetAsset={maintenanceFor ? { id: maintenanceFor.assetId, label: `${maintenanceFor.assetName} (${maintenanceFor.assetTag})` } : null}
        onDone={list.refetch}
      />
      <TransferRequestModal
        open={!!transferFor}
        onClose={() => setTransferFor(null)}
        presetAsset={transferFor ? { id: transferFor.assetId, label: `${transferFor.assetName} (${transferFor.assetTag})` } : null}
        onDone={list.refetch}
      />
    </div>
  );
}
