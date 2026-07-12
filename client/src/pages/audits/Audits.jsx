import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClipboardCheck, Plus } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageHeader, PageSpinner } from '../../components/ui';
import { AUDIT_STATUS } from '../../utils/constants';
import { fmtDate } from '../../utils/format';

function CreateAuditModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', departmentId: '', categoryId: '', assignedTo: '', dueDate: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', description: '', departmentId: '', categoryId: '', assignedTo: '', dueDate: '' });
    setErrors({});
    Promise.all([api.get('/departments'), api.get('/categories'), api.get('/users/options')])
      .then(([d, c, u]) => { setDepartments(d.data.data); setCategories(c.data.data); setUsers(u.data.data); })
      .catch(() => {});
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 3) errs.name = 'Give the audit a name';
    if (!form.assignedTo) errs.assignedTo = 'Assign an auditor';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const res = await api.post('/audits', {
        name: form.name.trim(), description: form.description.trim() || null,
        departmentId: form.departmentId || null, categoryId: form.categoryId || null,
        assignedTo: form.assignedTo, dueDate: form.dueDate || null,
      });
      toast.success(`Audit started with ${res.data.data.totalItems} assets in scope`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Start an audit cycle"
      subtitle="A snapshot of all in-scope assets becomes the verification checklist.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Audit name" error={errors.name} required>
          <input className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. H2 2026 IT Equipment Audit"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department scope" hint="optional">
            <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Category scope" hint="optional">
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Auditor" error={errors.assignedTo} required>
            <select className={`input ${errors.assignedTo ? 'input-error' : ''}`} value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">Select auditor…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </Field>
          <Field label="Due date" hint="optional">
            <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" hint="optional">
          <textarea className="input min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} icon={ClipboardCheck}>Start audit</Button>
        </div>
      </form>
    </Modal>
  );
}

function ProgressBar({ audit }) {
  const total = Number(audit.totalItems) || 1;
  const seg = (n, cls) => Number(n) > 0 && (
    <div className={`${cls} h-full`} style={{ width: `${(Number(n) / total) * 100}%` }} />
  );
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      {seg(audit.verifiedCount, 'bg-emerald-500')}
      {seg(audit.damagedCount, 'bg-amber-500')}
      {seg(audit.missingCount, 'bg-red-500')}
    </div>
  );
}

export default function Audits() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(params.get('new') === 'true');
  const { data: audits, loading, refetch } = useFetch('/audits');

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="Audit Management"
        subtitle="Physical verification cycles with automatic discrepancy handling on close."
        actions={isManager && <Button icon={Plus} onClick={() => setCreateOpen(true)}>Start audit</Button>}
      />

      {(!audits || audits.length === 0) ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
          <EmptyState icon={ClipboardCheck} title="No audits yet"
            message="Start an audit cycle to verify assets department by department."
            action={isManager && <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Start audit</Button>} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {audits.map((a, i) => (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              onClick={() => navigate(`/audits/${a.id}`)}
              className="rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-900/5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{a.name}</h3>
                <Badge meta={AUDIT_STATUS[a.status]} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Scope: {a.departmentName ?? 'All departments'}{a.categoryName ? ` · ${a.categoryName}` : ''}
                {a.dueDate && <> · due {fmtDate(a.dueDate)}</>}
              </p>

              <div className="mt-4">
                <ProgressBar audit={a} />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span><span className="font-semibold text-emerald-600">{a.verifiedCount}</span> verified</span>
                  <span><span className="font-semibold text-amber-600">{a.damagedCount}</span> damaged</span>
                  <span><span className="font-semibold text-red-600">{a.missingCount}</span> missing</span>
                  <span><span className="font-semibold text-slate-600">{a.pendingCount}</span> pending</span>
                  <span className="ml-auto text-slate-400">{a.totalItems} assets</span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-slate-50 pt-3">
                <Avatar name={a.assignedToName ?? '?'} color={a.assignedToColor} size="sm" />
                <span className="text-xs text-slate-500">Auditor: {a.assignedToName ?? 'Unassigned'}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <CreateAuditModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={refetch} />
    </div>
  );
}
