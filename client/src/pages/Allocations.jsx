import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Package, Plus, Search, Undo2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePagedList } from '../hooks/usePagedList';
import { Avatar, Badge, Button, DataTable, EmptyState, Field, Modal, PageHeader, Pagination } from '../components/ui';
import { CONDITIONS } from '../utils/constants';
import { fmtDate, humanize } from '../utils/format';

/** Allocate an available asset to an employee. */
function AllocateModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ assetId: '', allocatedTo: '', dueDate: '', purpose: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ assetId: '', allocatedTo: '', dueDate: '', purpose: '' });
    setErrors({});
    api.get('/assets', { params: { status: 'AVAILABLE', limit: 100 } })
      .then((r) => setAssets(r.data.data)).catch((e) => toast.error(e.message));
    api.get('/users/options').then((r) => setUsers(r.data.data)).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.assetId) errs.assetId = 'Select an asset';
    if (!form.allocatedTo) errs.allocatedTo = 'Select an employee';
    if (form.dueDate && form.dueDate < new Date().toISOString().slice(0, 10)) errs.dueDate = 'Due date cannot be in the past';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await api.post('/allocations', {
        assetId: form.assetId,
        allocatedTo: form.allocatedTo,
        dueDate: form.dueDate || null,
        purpose: form.purpose.trim() || null,
      });
      toast.success('Asset allocated — the employee has been notified');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Allocate an asset" subtitle="Only available assets can be allocated. Allocated assets require a transfer.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Asset" error={errors.assetId} required>
          <select className={`input ${errors.assetId ? 'input-error' : ''}`} value={form.assetId}
            onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
            <option value="">Select an available asset…</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.assetTag})</option>)}
          </select>
        </Field>
        <Field label="Allocate to" error={errors.allocatedTo} required>
          <select className={`input ${errors.allocatedTo ? 'input-error' : ''}`} value={form.allocatedTo}
            onChange={(e) => setForm({ ...form, allocatedTo: e.target.value })}>
            <option value="">Select an employee…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}{u.departmentName ? ` — ${u.departmentName}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Return due date" error={errors.dueDate} hint="optional">
          <input type="date" className={`input ${errors.dueDate ? 'input-error' : ''}`} value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
        <Field label="Purpose" hint="optional">
          <input className="input" placeholder="e.g. Primary work laptop" value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} icon={Package}>Allocate</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Record a return with condition capture. */
export function ReturnModal({ open, onClose, allocation, onDone }) {
  const toast = useToast();
  const [condition, setCondition] = useState('GOOD');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/allocations/${allocation.id}/return`, { returnCondition: condition, returnNotes: notes.trim() || null });
      toast.success('Return recorded — asset is available again');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record return"
      subtitle={allocation ? `${allocation.assetName} (${allocation.assetTag}) from ${allocation.allocatedToName}` : ''}>
      <div className="space-y-4">
        <Field label="Condition on return" required>
          <div className="grid grid-cols-5 gap-1.5">
            {CONDITIONS.map((c) => (
              <button key={c} type="button" onClick={() => setCondition(c)}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                  condition === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                {humanize(c)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes" hint="optional">
          <textarea className="input min-h-20" placeholder="Scratches, missing accessories…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} icon={Undo2}>Record return</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Allocations() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [allocateOpen, setAllocateOpen] = useState(params.get('new') === 'true');
  const [returning, setReturning] = useState(null);

  const list = usePagedList('/allocations', {
    initialFilters: { status: '', overdue: params.get('overdue') ?? '' },
    limit: 12,
  });

  const columns = [
    {
      key: 'asset', header: 'Asset',
      render: (al) => (
        <div>
          <p className="font-medium text-slate-800">{al.assetName}</p>
          <p className="text-xs text-slate-400">{al.assetTag} · {al.categoryName}</p>
        </div>
      ),
    },
    {
      key: 'holder', header: 'Holder',
      render: (al) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={al.allocatedToName} color={al.allocatedToColor} size="sm" />
          <div>
            <p className="text-slate-700">{al.allocatedToName}</p>
            <p className="text-xs text-slate-400">{al.allocatedToDepartment ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'allocatedAt', header: 'Allocated', render: (al) => <span className="text-slate-500">{fmtDate(al.allocatedAt)}</span> },
    {
      key: 'due', header: 'Due back',
      render: (al) => al.isOverdue
        ? <span className="font-semibold text-red-600">{fmtDate(al.dueDate)} · overdue</span>
        : <span className="text-slate-500">{al.dueDate ? fmtDate(al.dueDate) : 'open-ended'}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (al) => (
        <Badge meta={{
          ACTIVE: { label: 'Active', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
          RETURNED: { label: 'Returned', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
          TRANSFERRED: { label: 'Transferred', badge: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500' },
        }[al.status]} />
      ),
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (al) => al.status === 'ACTIVE' && isManager && (
        <Button size="sm" variant="secondary" icon={Undo2}
          onClick={(e) => { e.stopPropagation(); setReturning(al); }}>
          Return
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Asset Allocations"
        subtitle="Who holds what, since when, and when it is due back."
        actions={isManager && <Button icon={Plus} onClick={() => setAllocateOpen(true)}>Allocate asset</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search asset or holder…"
            value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={list.filters.status}
          onChange={(e) => list.setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="RETURNED">Returned</option>
          <option value="TRANSFERRED">Transferred</option>
        </select>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            checked={list.filters.overdue === 'true'}
            onChange={(e) => list.setFilters((f) => ({ ...f, overdue: e.target.checked ? 'true' : '' }))} />
          Overdue only
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        onRowClick={(al) => navigate(`/assets/${al.assetId}`)}
        empty={<EmptyState title="No allocations" message="Allocated assets will appear here with their holders." />}
        footer={<Pagination pagination={list.pagination} onPage={list.setPage} />}
      />

      <AllocateModal open={allocateOpen} onClose={() => setAllocateOpen(false)} onDone={list.refetch} />
      <ReturnModal open={!!returning} onClose={() => setReturning(null)} allocation={returning} onDone={list.refetch} />
    </div>
  );
}
