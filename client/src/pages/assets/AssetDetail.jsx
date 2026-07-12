import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Pencil, AlertTriangle, Archive, Trash2, RotateCcw, Boxes,
  History, Wrench, Package, MapPin, Tag, Calendar, IndianRupee, ShieldCheck,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { Badge, Button, Field, Modal, PageSpinner, Avatar } from '../../components/ui';
import { ASSET_STATUS, MAINTENANCE_STATUS } from '../../utils/constants';
import { fmtCurrency, fmtDate, fmtDateTime, humanize } from '../../utils/format';
import { AssetForm } from './AssetForm';

/** Manual lifecycle actions available per current status. */
const LIFECYCLE_ACTIONS = {
  AVAILABLE: [
    { status: 'LOST', label: 'Mark as lost', icon: AlertTriangle, variant: 'danger' },
    { status: 'RETIRED', label: 'Retire', icon: Archive, variant: 'secondary' },
  ],
  ALLOCATED: [{ status: 'LOST', label: 'Mark as lost', icon: AlertTriangle, variant: 'danger' }],
  LOST: [
    { status: 'AVAILABLE', label: 'Mark as found', icon: RotateCcw, variant: 'success' },
    { status: 'DISPOSED', label: 'Dispose', icon: Trash2, variant: 'danger' },
  ],
  RETIRED: [{ status: 'DISPOSED', label: 'Dispose', icon: Trash2, variant: 'danger' }],
  UNDER_MAINTENANCE: [],
  RESERVED: [],
  DISPOSED: [],
};

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon size={15} className="shrink-0 text-slate-400" />
      <span className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-700">{value ?? '—'}</span>
    </div>
  );
}

function StatusChangeModal({ open, onClose, action, asset, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) return toast.error('A reason is required');
    setLoading(true);
    try {
      await api.post(`/assets/${asset.id}/status`, { status: action.status, reason: reason.trim() });
      toast.success(`Asset marked ${humanize(action.status).toLowerCase()}`);
      setReason('');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={action?.label} subtitle={`${asset?.name} (${asset?.assetTag})`}>
      <Field label="Reason" required>
        <textarea className="input min-h-24" placeholder="Why is this status changing?"
          value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={action?.variant ?? 'primary'} onClick={submit} loading={loading}>{action?.label}</Button>
      </div>
    </Modal>
  );
}

const TABS = [
  { id: 'allocations', label: 'Allocation history', icon: Package },
  { id: 'maintenance', label: 'Maintenance history', icon: Wrench },
  { id: 'lifecycle', label: 'Lifecycle trail', icon: History },
];

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const { data: asset, loading, refetch } = useFetch(`/assets/${id}`);
  const [tab, setTab] = useState('allocations');
  const [editOpen, setEditOpen] = useState(false);
  const [statusAction, setStatusAction] = useState(null);

  if (loading) return <PageSpinner />;
  if (!asset) return (
    <div className="py-20 text-center">
      <p className="text-slate-500">Asset not found.</p>
      <Link to="/assets" className="mt-2 inline-block text-sm font-medium text-indigo-600">Back to directory</Link>
    </div>
  );

  const actions = isManager ? LIFECYCLE_ACTIONS[asset.status] ?? [] : [];

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back
      </button>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Overview card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 lg:col-span-1"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-500 ring-1 ring-indigo-100">
              <Boxes size={24} />
            </div>
            <Badge meta={ASSET_STATUS[asset.status]} />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">{asset.name}</h1>
          <p className="text-sm text-slate-400">{asset.assetTag}</p>

          {asset.currentHolder && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50/60 px-4 py-3 ring-1 ring-blue-100">
              <span className="text-xs font-medium text-blue-700">
                Currently held by <span className="font-semibold">{asset.currentHolder}</span>
                {asset.currentDueDate && <> · due back {fmtDate(asset.currentDueDate)}</>}
              </span>
            </div>
          )}

          <div className="mt-4 divide-y divide-slate-50">
            <InfoRow icon={Tag} label="Category" value={asset.categoryName} />
            <InfoRow icon={Boxes} label="Model" value={asset.model} />
            <InfoRow icon={ShieldCheck} label="Serial no." value={asset.serialNumber} />
            <InfoRow icon={Boxes} label="Manufacturer" value={asset.manufacturer} />
            <InfoRow icon={MapPin} label="Location" value={asset.location} />
            <InfoRow icon={Boxes} label="Department" value={asset.departmentName} />
            <InfoRow icon={Calendar} label="Purchased" value={fmtDate(asset.purchaseDate)} />
            <InfoRow icon={IndianRupee} label="Cost" value={fmtCurrency(asset.purchaseCost)} />
            <InfoRow icon={ShieldCheck} label="Warranty" value={fmtDate(asset.warrantyExpiry)} />
            <InfoRow icon={Boxes} label="Condition" value={humanize(asset.condition)} />
          </div>

          {asset.notes && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">{asset.notes}</p>
          )}

          {isManager && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>
              {actions.map((a) => (
                <Button key={a.status} variant={a.variant} size="sm" icon={a.icon} onClick={() => setStatusAction(a)}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </motion.div>

        {/* History tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 lg:col-span-2"
        >
          <div className="flex gap-1 border-b border-slate-100 px-4 pt-3 overflow-x-auto">
            {TABS.map(({ id: tid, label, icon: Icon }) => (
              <button
                key={tid}
                onClick={() => setTab(tid)}
                className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  tab === tid ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={14} /> {label}
                {tab === tid && <motion.span layoutId="asset-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-500" />}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === 'allocations' && (
              asset.allocationHistory.length === 0
                ? <p className="py-10 text-center text-sm text-slate-400">Never allocated.</p>
                : <ul className="space-y-3">
                    {asset.allocationHistory.map((al) => (
                      <li key={al.id} className="rise-in flex items-start gap-3 rounded-xl border border-slate-100 p-4">
                        <Avatar name={al.allocatedToName} color={al.allocatedToColor} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">
                            {al.allocatedToName}
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${al.status === 'ACTIVE' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                              {al.status === 'ACTIVE' ? 'Current' : humanize(al.status)}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {fmtDate(al.allocatedAt)} → {al.returnedAt ? fmtDate(al.returnedAt) : al.dueDate ? `due ${fmtDate(al.dueDate)}` : 'open-ended'}
                            {al.allocatedByName && <> · by {al.allocatedByName}</>}
                          </p>
                          {al.returnCondition && (
                            <p className="mt-1 text-xs text-slate-500">
                              Returned in <span className="font-medium">{humanize(al.returnCondition)}</span> condition
                              {al.returnNotes && <> — {al.returnNotes}</>}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
            )}

            {tab === 'maintenance' && (
              asset.maintenanceHistory.length === 0
                ? <p className="py-10 text-center text-sm text-slate-400">No maintenance recorded.</p>
                : <ul className="space-y-3">
                    {asset.maintenanceHistory.map((m) => (
                      <li key={m.id} className="rise-in rounded-xl border border-slate-100 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">{m.title}</p>
                          <Badge meta={MAINTENANCE_STATUS[m.status]} />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {humanize(m.type)} · {humanize(m.priority)} priority · raised {fmtDate(m.createdAt)}
                          {m.requestedByName && <> by {m.requestedByName}</>}
                          {m.technicianName && <> · technician: {m.technicianName}</>}
                          {m.cost && <> · {fmtCurrency(m.cost)}</>}
                        </p>
                      </li>
                    ))}
                  </ul>
            )}

            {tab === 'lifecycle' && (
              <ol className="relative ml-2 space-y-5 border-l border-slate-200 pl-6">
                {asset.statusHistory.map((h, i) => (
                  <li key={i} className="rise-in relative">
                    <span className={`absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${ASSET_STATUS[h.toStatus]?.dot ?? 'bg-slate-300'}`} />
                    <p className="text-sm text-slate-700">
                      {h.fromStatus ? <>{humanize(h.fromStatus)} <span className="text-slate-400">→</span> </> : null}
                      <span className="font-semibold">{humanize(h.toStatus)}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {fmtDateTime(h.createdAt)}{h.changedByName && <> · {h.changedByName}</>}{h.reason && <> · {h.reason}</>}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </motion.div>
      </div>

      <AssetForm open={editOpen} onClose={() => setEditOpen(false)} onSaved={refetch} asset={asset} />
      <StatusChangeModal open={!!statusAction} onClose={() => setStatusAction(null)} action={statusAction} asset={asset} onDone={refetch} />
    </div>
  );
}
