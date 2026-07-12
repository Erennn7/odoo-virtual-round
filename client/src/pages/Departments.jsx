import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FolderTree, Pencil, Plus, Users, Boxes, Power } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { Avatar, Badge, Button, ConfirmDialog, Field, Modal, PageHeader, PageSpinner } from '../components/ui';

function DepartmentModal({ open, onClose, onDone, department, departments }) {
  const toast = useToast();
  const editing = !!department;
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', code: '', description: '', parentId: '', headId: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(department ? {
      name: department.name, code: department.code, description: department.description ?? '',
      parentId: department.parentId ?? '', headId: department.headId ?? '',
    } : { name: '', code: '', description: '', parentId: '', headId: '' });
    api.get('/users/options').then((r) => setUsers(r.data.data)).catch(() => {});
  }, [open, department]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Name is required';
    if (!form.code.trim()) errs.code = 'Code is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = {
      name: form.name.trim(), code: form.code.trim(),
      description: form.description.trim() || null,
      parentId: form.parentId || null, headId: form.headId || null,
    };
    setLoading(true);
    try {
      if (editing) await api.patch(`/departments/${department.id}`, payload);
      else await api.post('/departments', payload);
      toast.success(editing ? 'Department updated' : 'Department created');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const parentOptions = departments.filter((d) => d.id !== department?.id);

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${department.name}` : 'New department'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Name" error={errors.name} required>
              <input className={`input ${errors.name ? 'input-error' : ''}`} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Code" error={errors.code} required>
            <input className={`input uppercase ${errors.code ? 'input-error' : ''}`} placeholder="ENG" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parent department" hint="for hierarchy">
            <select className="input" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">Top level</option>
              {parentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Department head">
            <select className="input" value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description" hint="optional">
          <textarea className="input min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{editing ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DepartmentCard({ dept, depth, onEdit, onToggle }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      className={`flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 ${!dept.isActive ? 'opacity-60' : ''}`}
      style={{ marginLeft: depth * 28 }}
    >
      {depth > 0 && <span className="text-slate-300">└</span>}
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
        <FolderTree size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800">
          {dept.name} <span className="ml-1 text-xs font-normal text-slate-400">{dept.code}</span>
          {!dept.isActive && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Inactive</span>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1"><Users size={11} /> {dept.memberCount} members</span>
          <span className="inline-flex items-center gap-1"><Boxes size={11} /> {dept.assetCount} assets</span>
        </p>
      </div>
      {dept.headName && (
        <div className="flex items-center gap-2">
          <Avatar name={dept.headName} color={dept.headAvatarColor} size="sm" />
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-slate-600">{dept.headName}</p>
            <p className="text-[10px] text-slate-400">Department Head</p>
          </div>
        </div>
      )}
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(dept)} />
        <Button variant="ghost" size="sm" icon={Power}
          className={dept.isActive ? 'text-red-500 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}
          onClick={() => onToggle(dept)} />
      </div>
    </motion.div>
  );
}

export default function Departments() {
  const toast = useToast();
  const { data: departments, loading, refetch } = useFetch('/departments?includeInactive=true');
  const [modal, setModal] = useState(null); // null | { department? }
  const [toggling, setToggling] = useState(null);
  const [busy, setBusy] = useState(false);

  const tree = useMemo(() => {
    if (!departments) return [];
    const roots = departments.filter((d) => !d.parentId || !departments.some((x) => x.id === d.parentId));
    const childrenOf = (id) => departments.filter((d) => d.parentId === id);
    const flatten = (nodes, depth) =>
      nodes.flatMap((n) => [{ ...n, depth }, ...flatten(childrenOf(n.id), depth + 1)]);
    return flatten(roots, 0);
  }, [departments]);

  const toggleActive = async () => {
    setBusy(true);
    try {
      await api.patch(`/departments/${toggling.id}`, { isActive: !toggling.isActive });
      toast.success(toggling.isActive ? 'Department deactivated' : 'Department reactivated');
      setToggling(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="Department Management"
        subtitle="Organizational hierarchy with heads, members and activation status."
        actions={<Button icon={Plus} onClick={() => setModal({})}>New department</Button>}
      />

      <div className="space-y-2.5">
        {tree.map((d) => (
          <DepartmentCard key={d.id} dept={d} depth={d.depth}
            onEdit={(dept) => setModal({ department: dept })}
            onToggle={setToggling} />
        ))}
      </div>

      <DepartmentModal
        open={!!modal} onClose={() => setModal(null)} onDone={refetch}
        department={modal?.department} departments={departments ?? []}
      />
      <ConfirmDialog
        open={!!toggling} onClose={() => setToggling(null)} onConfirm={toggleActive} loading={busy}
        variant={toggling?.isActive ? 'danger' : 'success'}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        message={toggling?.isActive
          ? 'Inactive departments cannot receive new employees or assets. Existing records are preserved.'
          : 'The department will be available for assignments again.'}
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
      />
    </div>
  );
}
