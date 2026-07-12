import { useEffect, useState } from 'react';
import { Search, ShieldCheck, UserCog } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePagedList } from '../hooks/usePagedList';
import { Avatar, Badge, Button, DataTable, EmptyState, Field, Modal, PageHeader, Pagination } from '../components/ui';
import { ROLES } from '../utils/constants';
import { fmtAgo } from '../utils/format';

/** Admin-only: promote/demote roles and manage account status. */
function ManageUserModal({ open, onClose, employee, onDone }) {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [role, setRole] = useState('EMPLOYEE');
  const [departmentId, setDepartmentId] = useState('');
  const [designation, setDesignation] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !employee) return;
    setRole(employee.role);
    setDepartmentId(employee.departmentId ?? '');
    setDesignation(employee.designation ?? '');
    setIsActive(employee.isActive);
    api.get('/departments').then((r) => setDepartments(r.data.data)).catch(() => {});
  }, [open, employee]);

  const submit = async () => {
    setLoading(true);
    try {
      if (role !== employee.role) {
        await api.patch(`/users/${employee.id}/role`, { role });
      }
      const detailChanged = departmentId !== (employee.departmentId ?? '')
        || designation !== (employee.designation ?? '') || isActive !== employee.isActive;
      if (detailChanged) {
        await api.patch(`/users/${employee.id}`, {
          departmentId: departmentId || null,
          designation: designation.trim() || null,
          isActive,
        });
      }
      toast.success(`${employee.fullName} updated`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Manage ${employee?.fullName ?? ''}`}
      subtitle={employee ? `${employee.employeeCode} · ${employee.email}` : ''}>
      <div className="space-y-4">
        <Field label="Role" hint="only admins can change roles">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(ROLES).map(([value, meta]) => (
              <button key={value} type="button" onClick={() => setRole(value)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all ${
                  role === value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>
                <ShieldCheck size={14} className={role === value ? 'text-indigo-500' : 'text-slate-300'} />
                {meta.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Unassigned</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Designation">
            <input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Account active</span>
            <span className="block text-xs text-slate-500">Inactive accounts cannot sign in or receive allocations</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Save changes</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Employees() {
  const { isAdmin } = useAuth();
  const [managing, setManaging] = useState(null);
  const [departments, setDepartments] = useState([]);

  const list = usePagedList('/users', { initialFilters: { role: '', departmentId: '', status: '' }, limit: 12 });

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.data)).catch(() => {});
  }, []);

  const columns = [
    {
      key: 'name', header: 'Employee', sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.fullName} color={u.avatarColor} />
          <div>
            <p className={`font-medium ${u.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{u.fullName}</p>
            <p className="text-xs text-slate-400">{u.employeeCode} · {u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', sortable: true, render: (u) => <Badge meta={ROLES[u.role]} withDot={false} /> },
    { key: 'departmentName', header: 'Department', render: (u) => <span className="text-slate-600">{u.departmentName ?? '—'}</span> },
    { key: 'designation', header: 'Designation', render: (u) => <span className="text-slate-500">{u.designation ?? '—'}</span> },
    { key: 'activeAssets', header: 'Assets held', className: 'text-center', render: (u) => (
      <span className={`font-semibold ${Number(u.activeAssets) > 0 ? 'text-slate-700' : 'text-slate-300'}`}>{u.activeAssets}</span>
    )},
    { key: 'lastLoginAt', header: 'Last active', render: (u) => <span className="text-xs text-slate-400">{u.lastLoginAt ? fmtAgo(u.lastLoginAt) : 'never'}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (u) => isAdmin && (
        <Button size="sm" variant="secondary" icon={UserCog}
          onClick={(e) => { e.stopPropagation(); setManaging(u); }}>
          Manage
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        subtitle={isAdmin
          ? 'All accounts. Promote employees to Department Head or Asset Manager from here — signup never grants roles.'
          : 'All employees across the organization.'}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search name, email, code…"
            value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={list.filters.role}
          onChange={(e) => list.setFilters((f) => ({ ...f, role: e.target.value }))}>
          <option value="">All roles</option>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input w-auto" value={list.filters.departmentId}
          onChange={(e) => list.setFilters((f) => ({ ...f, departmentId: e.target.value }))}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="input w-auto" value={list.filters.status}
          onChange={(e) => list.setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All accounts</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        sort={list.sort}
        onSort={list.toggleSort}
        empty={<EmptyState title="No employees found" message="Try different filters." />}
        footer={<Pagination pagination={list.pagination} onPage={list.setPage} />}
      />

      <ManageUserModal open={!!managing} onClose={() => setManaging(null)} employee={managing} onDone={list.refetch} />
    </div>
  );
}
