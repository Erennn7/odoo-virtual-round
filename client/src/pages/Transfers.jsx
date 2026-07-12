import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Check, Plus, Search, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePagedList } from '../hooks/usePagedList';
import { Avatar, Badge, Button, DataTable, EmptyState, Field, Modal, PageHeader, Pagination } from '../components/ui';
import { TRANSFER_STATUS } from '../utils/constants';
import { fmtDate } from '../utils/format';

/** Request moving an allocated asset to another employee. */
export function TransferRequestModal({ open, onClose, onDone, presetAsset = null }) {
  const toast = useToast();
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ assetId: '', toUserId: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ assetId: presetAsset?.id ?? '', toUserId: '', reason: '' });
    setErrors({});
    if (!presetAsset) {
      api.get('/assets', { params: { status: 'ALLOCATED', limit: 100 } })
        .then((r) => setAssets(r.data.data)).catch(() => {});
    }
    api.get('/users/options').then((r) => setUsers(r.data.data)).catch(() => {});
  }, [open, presetAsset]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.assetId) errs.assetId = 'Select an allocated asset';
    if (!form.toUserId) errs.toUserId = 'Select the receiving employee';
    if (form.reason.trim().length < 5) errs.reason = 'Explain why this transfer is needed';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await api.post('/transfers', { assetId: form.assetId, toUserId: form.toUserId, reason: form.reason.trim() });
      toast.success('Transfer requested — managers have been notified');
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request a transfer"
      subtitle="Allocated assets can only change hands through an approved transfer.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Asset" error={errors.assetId} required>
          {presetAsset ? (
            <input className="input" value={presetAsset.label} disabled />
          ) : (
            <select className={`input ${errors.assetId ? 'input-error' : ''}`} value={form.assetId}
              onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
              <option value="">Select an allocated asset…</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.assetTag}) — held by {a.currentHolder ?? '?'}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Transfer to" error={errors.toUserId} required>
          <select className={`input ${errors.toUserId ? 'input-error' : ''}`} value={form.toUserId}
            onChange={(e) => setForm({ ...form, toUserId: e.target.value })}>
            <option value="">Select an employee…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}{u.departmentName ? ` — ${u.departmentName}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Reason" error={errors.reason} required>
          <textarea className={`input min-h-20 ${errors.reason ? 'input-error' : ''}`}
            placeholder="Why should this asset move?" value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} icon={ArrowLeftRight}>Request transfer</Button>
        </div>
      </form>
    </Modal>
  );
}

function DecideModal({ open, onClose, transfer, decision, onDone }) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/transfers/${transfer.id}/decide`, { decision, notes: notes.trim() || null });
      toast.success(`Transfer ${decision.toLowerCase()}`);
      setNotes('');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={decision === 'APPROVED' ? 'Approve transfer' : 'Reject transfer'}
      subtitle={transfer ? `${transfer.assetName} (${transfer.assetTag}): ${transfer.fromUserName ?? '—'} → ${transfer.toUserName}` : ''}>
      <Field label="Notes" hint="optional">
        <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={decision === 'APPROVED' ? 'success' : 'danger'} onClick={submit} loading={loading}>
          {decision === 'APPROVED' ? 'Approve' : 'Reject'}
        </Button>
      </div>
    </Modal>
  );
}

export default function Transfers() {
  const { user, isManager } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [requestOpen, setRequestOpen] = useState(params.get('new') === 'true');
  const [deciding, setDeciding] = useState(null); // { transfer, decision }
  const [completingId, setCompletingId] = useState(null);

  const list = usePagedList('/transfers', { initialFilters: { status: '' }, limit: 12 });

  const complete = async (t) => {
    setCompletingId(t.id);
    try {
      await api.post(`/transfers/${t.id}/complete`);
      toast.success('Asset reallocated to the new holder');
      list.refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCompletingId(null);
    }
  };

  const cancel = async (t) => {
    try {
      await api.post(`/transfers/${t.id}/cancel`);
      toast.info('Transfer request withdrawn');
      list.refetch();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    {
      key: 'asset', header: 'Asset',
      render: (t) => (
        <div>
          <p className="font-medium text-slate-800">{t.assetName}</p>
          <p className="text-xs text-slate-400">{t.assetTag}</p>
        </div>
      ),
    },
    {
      key: 'route', header: 'From → To',
      render: (t) => (
        <div className="flex items-center gap-2">
          {t.fromUserName ? <Avatar name={t.fromUserName} color={t.fromUserColor} size="sm" /> : <span className="text-xs text-slate-400">Pool</span>}
          <ArrowRight size={13} className="text-slate-300" />
          <Avatar name={t.toUserName} color={t.toUserColor} size="sm" />
          <span className="text-sm text-slate-600">{t.toUserName}</span>
        </div>
      ),
    },
    { key: 'reason', header: 'Reason', render: (t) => <span className="block max-w-56 truncate text-slate-500" title={t.reason}>{t.reason}</span> },
    { key: 'requested', header: 'Requested', render: (t) => (
      <div>
        <p className="text-slate-600">{fmtDate(t.createdAt)}</p>
        <p className="text-xs text-slate-400">by {t.requestedByName ?? '—'}</p>
      </div>
    )},
    { key: 'status', header: 'Status', render: (t) => <Badge meta={TRANSFER_STATUS[t.status]} /> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (t) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {isManager && t.status === 'REQUESTED' && (
            <>
              <Button size="sm" variant="success" icon={Check} onClick={() => setDeciding({ transfer: t, decision: 'APPROVED' })}>Approve</Button>
              <Button size="sm" variant="secondary" icon={X} onClick={() => setDeciding({ transfer: t, decision: 'REJECTED' })}>Reject</Button>
            </>
          )}
          {isManager && t.status === 'APPROVED' && (
            <Button size="sm" icon={ArrowLeftRight} loading={completingId === t.id} onClick={() => complete(t)}>
              Reallocate
            </Button>
          )}
          {!isManager && t.status === 'REQUESTED' && t.requestedByName === user.fullName && (
            <Button size="sm" variant="ghost" onClick={() => cancel(t)}>Withdraw</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Asset Transfers"
        subtitle="Requested → Approved → Reallocated, with full chain of custody."
        actions={<Button icon={Plus} onClick={() => setRequestOpen(true)}>Request transfer</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search asset…" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={list.filters.status}
          onChange={(e) => list.setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {Object.entries(TRANSFER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        empty={<EmptyState title="No transfers" message="Transfer requests between employees will appear here." />}
        footer={<Pagination pagination={list.pagination} onPage={list.setPage} />}
      />

      <TransferRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} onDone={list.refetch} />
      <DecideModal
        open={!!deciding} onClose={() => setDeciding(null)}
        transfer={deciding?.transfer} decision={deciding?.decision} onDone={list.refetch}
      />
    </div>
  );
}
