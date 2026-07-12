import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Boxes, Plus, Search } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePagedList } from '../../hooks/usePagedList';
import { Badge, Button, DataTable, EmptyState, PageHeader, Pagination } from '../../components/ui';
import { ASSET_STATUS } from '../../utils/constants';
import { fmtCurrency, fmtDate, humanize } from '../../utils/format';
import { AssetForm } from './AssetForm';

export default function AssetDirectory() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(params.get('new') === 'true');
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);

  const list = usePagedList('/assets', {
    initialFilters: { status: params.get('status') ?? '', categoryId: '', departmentId: '' },
    limit: 12,
  });

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data.data)).catch(() => {});
    api.get('/departments').then((r) => setDepartments(r.data.data)).catch(() => {});
  }, []);

  const setFilter = (key) => (e) =>
    list.setFilters((f) => ({ ...f, [key]: e.target.value }));

  const columns = [
    {
      key: 'name', header: 'Asset', sortable: true,
      render: (a) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
            <Boxes size={16} />
          </div>
          <div>
            <p className="font-medium text-slate-800">{a.name}</p>
            <p className="text-xs text-slate-400">{a.assetTag}{a.serialNumber ? ` · ${a.serialNumber}` : ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortable: true, render: (a) => <span className="text-slate-600">{a.categoryName}</span> },
    { key: 'status', header: 'Status', sortable: true, render: (a) => <Badge meta={ASSET_STATUS[a.status]} /> },
    {
      key: 'holder', header: 'Current holder',
      render: (a) => a.currentHolder
        ? <span className="text-slate-700">{a.currentHolder}</span>
        : <span className="text-slate-400">—</span>,
    },
    { key: 'departmentName', header: 'Department', render: (a) => <span className="text-slate-500">{a.departmentName ?? '—'}</span> },
    { key: 'condition', header: 'Condition', render: (a) => <span className="text-slate-500">{humanize(a.condition)}</span> },
    { key: 'cost', header: 'Cost', sortable: true, className: 'text-right', render: (a) => <span className="tabular-nums text-slate-600">{fmtCurrency(a.purchaseCost)}</span> },
    { key: 'purchased', header: 'Purchased', sortable: true, render: (a) => <span className="text-slate-500">{fmtDate(a.purchaseDate)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Asset Directory"
        subtitle="Every asset in the organization with its live status and holder."
        actions={isManager && <Button icon={Plus} onClick={() => setFormOpen(true)}>Register asset</Button>}
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search name, tag, serial…"
            value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={list.filters.status} onChange={setFilter('status')}>
          <option value="">All statuses</option>
          {Object.entries(ASSET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input w-auto" value={list.filters.categoryId} onChange={setFilter('categoryId')}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" value={list.filters.departmentId} onChange={setFilter('departmentId')}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        sort={list.sort}
        onSort={list.toggleSort}
        onRowClick={(a) => navigate(`/assets/${a.id}`)}
        empty={
          <EmptyState
            title="No assets found"
            message="Try adjusting the filters, or register the first asset."
            action={isManager && <Button size="sm" icon={Plus} onClick={() => setFormOpen(true)}>Register asset</Button>}
          />
        }
        footer={<Pagination pagination={list.pagination} onPage={list.setPage} />}
      />

      <AssetForm
        open={formOpen}
        onClose={() => { setFormOpen(false); params.delete('new'); setParams(params, { replace: true }); }}
        onSaved={list.refetch}
      />
    </div>
  );
}
