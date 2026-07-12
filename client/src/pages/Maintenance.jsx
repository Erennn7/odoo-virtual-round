import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Play, Plus, Search, UserCog, Wrench, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePagedList } from '../hooks/usePagedList';
import { Avatar, Badge, Button, DataTable, EmptyState, Field, Modal, PageHeader, Pagination } from '../components/ui';
import { CONDITIONS, MAINTENANCE_STATUS, PRIORITY } from '../utils/constants';
import { fmtDate, humanize } from '../utils/format';

/** Raise a maintenance request (any role). */
export function MaintenanceRequestModal({ open, onClose, onDone, presetAsset = null }) {
  const toast = useToast();
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState({ assetId: '', title: '', description: '', type: 'CORRECTIVE', priority: 'MEDIUM' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ assetId: presetAsset?.id ?? '', title: '', description: '', type: 'CORRECTIVE', priority: 'MEDIUM' });
    setErrors({});
    if (!presetAsset) {
      api.get('/assets', { params: { limit: 100 } })
        .then((r) => setAssets(r.data.data.filter((a) => !['RETIRED', 'DISPOSED', 'LOST'].includes(a.status))))
        .catch(() => {});
    }
  }, [open, presetAsset]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.assetId) errs.assetId = 'Select an asset';
    if (form.title.trim().length < 3) errs.title = 'Give the issue a short title';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await api.post('/maintenance', {
        assetId: form.assetId, title: form.title.trim(),
        description: form.description.trim() || null, type: form.type, priority: form.priority,
      });
      toast.success('Request submitted — managers have been notified');
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Report an issue" subtitle="Raise a maintenance request for any asset.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Asset" error={errors.assetId} required>
          {presetAsset ? (
            <input className="input" value={presetAsset.label} disabled />
          ) : (
            <select className={`input ${errors.assetId ? 'input-error' : ''}`} value={form.assetId}
              onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
              <option value="">Select an asset…</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.assetTag})</option>)}
            </select>
          )}
        </Field>
        <Field label="Issue title" error={errors.title} required>
          <input className={`input ${errors.title ? 'input-error' : ''}`} placeholder="e.g. Screen flickers on boot"
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="CORRECTIVE">Corrective</option>
              <option value="PREVENTIVE">Preventive</option>
              <option value="INSPECTION">Inspection</option>
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description" hint="optional">
          <textarea className="input min-h-20" placeholder="What happened? When did it start?"
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} icon={Wrench}>Submit request</Button>
        </div>
      </form>
    </Modal>
  );
}

function DecideModal({ open, onClose, request, decision, onDone }) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);
  const approving = decision === 'APPROVED';

  useEffect(() => { if (open) { setNotes(''); setTechnicianName(''); setScheduledDate(''); } }, [open]);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/maintenance/${request.id}/decide`, {
        decision, notes: notes.trim() || null,
        technicianName: approving && technicianName.trim() ? technicianName.trim() : null,
        scheduledDate: approving && scheduledDate ? scheduledDate : null,
      });
      toast.success(approving ? 'Approved — asset moved under maintenance' : 'Request rejected');
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
      title={approving ? 'Approve maintenance' : 'Reject maintenance'}
      subtitle={request ? `"${request.title}" on ${request.assetName} (${request.assetTag})` : ''}>
      <div className="space-y-4">
        {approving && (
          <>
            <Field label="Assign technician" hint="optional — can be assigned later">
              <input className="input" placeholder="e.g. Rakesh (CoolTech AV Services)"
                value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} />
            </Field>
            <Field label="Scheduled date" hint="optional">
              <input type="date" className="input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Notes" hint="optional">
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={approving ? 'success' : 'danger'} onClick={submit} loading={loading}>
            {approving ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AssignModal({ open, onClose, request, onDone }) {
  const toast = useToast();
  const [technicianName, setTechnicianName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (technicianName.trim().length < 2) return toast.error('Technician name is required');
    setLoading(true);
    try {
      await api.post(`/maintenance/${request.id}/assign`, {
        technicianName: technicianName.trim(), scheduledDate: scheduledDate || null,
      });
      toast.success('Technician assigned');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Assign technician" subtitle={request ? `"${request.title}"` : ''}>
      <div className="space-y-4">
        <Field label="Technician" required>
          <input className="input" placeholder="Name / vendor" value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} />
        </Field>
        <Field label="Scheduled date" hint="optional">
          <input type="date" className="input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} icon={UserCog}>Assign</Button>
        </div>
      </div>
    </Modal>
  );
}

function ResolveModal({ open, onClose, request, onDone }) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [condition, setCondition] = useState('GOOD');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (notes.trim().length < 3) return toast.error('Describe what was done');
    setLoading(true);
    try {
      await api.post(`/maintenance/${request.id}/resolve`, {
        resolutionNotes: notes.trim(), cost: cost === '' ? null : Number(cost), condition,
      });
      toast.success('Resolved — asset restored');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Resolve maintenance" subtitle={request ? `"${request.title}"` : ''}>
      <div className="space-y-4">
        <Field label="Resolution notes" required>
          <textarea className="input min-h-20" placeholder="What was repaired / replaced?"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost" hint="optional">
            <input type="number" min="0" className="input" placeholder="0.00" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Condition after service">
            <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={submit} loading={loading} icon={Check}>Mark resolved</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Maintenance() {
  const { isManager } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [requestOpen, setRequestOpen] = useState(params.get('new') === 'true');
  const [deciding, setDeciding] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [startingId, setStartingId] = useState(null);

  const list = usePagedList('/maintenance', { initialFilters: { status: '', priority: '' }, limit: 12 });

  const start = async (m) => {
    setStartingId(m.id);
    try {
      await api.post(`/maintenance/${m.id}/start`);
      toast.success('Work started');
      list.refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStartingId(null);
    }
  };

  const columns = [
    {
      key: 'request', header: 'Request',
      render: (m) => (
        <div>
          <p className="font-medium text-slate-800">{m.title}</p>
          <p className="text-xs text-slate-400">{m.assetName} · {m.assetTag} · {humanize(m.type)}</p>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', render: (m) => <Badge meta={PRIORITY[m.priority]} withDot={false} /> },
    {
      key: 'requestedBy', header: 'Raised by',
      render: (m) => (
        <div className="flex items-center gap-2">
          <Avatar name={m.requestedByName ?? '?'} color={m.requestedByColor} size="sm" />
          <div>
            <p className="text-slate-600">{m.requestedByName ?? '—'}</p>
            <p className="text-xs text-slate-400">{fmtDate(m.createdAt)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'technician', header: 'Technician',
      render: (m) => m.technicianName
        ? <div><p className="text-slate-600">{m.technicianName}</p>{m.scheduledDate && <p className="text-xs text-slate-400">scheduled {fmtDate(m.scheduledDate)}</p>}</div>
        : <span className="text-slate-400">—</span>,
    },
    { key: 'status', header: 'Status', render: (m) => <Badge meta={MAINTENANCE_STATUS[m.status]} /> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (m) => isManager && (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {m.status === 'PENDING' && (
            <>
              <Button size="sm" variant="success" icon={Check} onClick={() => setDeciding({ request: m, decision: 'APPROVED' })}>Approve</Button>
              <Button size="sm" variant="secondary" icon={X} onClick={() => setDeciding({ request: m, decision: 'REJECTED' })}>Reject</Button>
            </>
          )}
          {m.status === 'APPROVED' && <Button size="sm" icon={UserCog} onClick={() => setAssigning(m)}>Assign</Button>}
          {m.status === 'ASSIGNED' && <Button size="sm" icon={Play} loading={startingId === m.id} onClick={() => start(m)}>Start</Button>}
          {['IN_PROGRESS', 'ASSIGNED'].includes(m.status) && (
            <Button size="sm" variant="success" icon={Check} onClick={() => setResolving(m)}>Resolve</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Maintenance Management"
        subtitle="Pending → Approved → Assigned → In progress → Resolved. Approvals park the asset under maintenance automatically."
        actions={<Button icon={Plus} onClick={() => setRequestOpen(true)}>Report an issue</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search title or asset…" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={list.filters.status}
          onChange={(e) => list.setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {Object.entries(MAINTENANCE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input w-auto" value={list.filters.priority}
          onChange={(e) => list.setFilters((f) => ({ ...f, priority: e.target.value }))}>
          <option value="">All priorities</option>
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        empty={<EmptyState icon={Wrench} title="No maintenance requests" message="Issues reported on assets will appear here." />}
        footer={<Pagination pagination={list.pagination} onPage={list.setPage} />}
      />

      <MaintenanceRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} onDone={list.refetch} />
      <DecideModal open={!!deciding} onClose={() => setDeciding(null)} request={deciding?.request} decision={deciding?.decision} onDone={list.refetch} />
      <AssignModal open={!!assigning} onClose={() => setAssigning(null)} request={assigning} onDone={list.refetch} />
      <ResolveModal open={!!resolving} onClose={() => setResolving(null)} request={resolving} onDone={list.refetch} />
    </div>
  );
}
