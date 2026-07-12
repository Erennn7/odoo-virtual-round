import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Layers, Pencil, Plus, Power } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { Button, ConfirmDialog, Field, Modal, PageHeader, PageSpinner } from '../components/ui';

function CategoryModal({ open, onClose, onDone, category }) {
  const toast = useToast();
  const editing = !!category;
  const [form, setForm] = useState({ name: '', code: '', description: '', expectedLifespanMonths: '', isBookableDefault: false });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(category ? {
      name: category.name, code: category.code, description: category.description ?? '',
      expectedLifespanMonths: category.expectedLifespanMonths ?? '', isBookableDefault: category.isBookableDefault,
    } : { name: '', code: '', description: '', expectedLifespanMonths: '', isBookableDefault: false });
  }, [open, category]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Name is required';
    if (!form.code.trim()) errs.code = 'Code is required';
    if (form.expectedLifespanMonths !== '' && Number(form.expectedLifespanMonths) <= 0) errs.expectedLifespanMonths = 'Must be positive';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = {
      name: form.name.trim(), code: form.code.trim(),
      description: form.description.trim() || null,
      expectedLifespanMonths: form.expectedLifespanMonths === '' ? null : Number(form.expectedLifespanMonths),
      isBookableDefault: form.isBookableDefault,
    };
    setLoading(true);
    try {
      if (editing) await api.patch(`/categories/${category.id}`, payload);
      else await api.post('/categories', payload);
      toast.success(editing ? 'Category updated' : 'Category created');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${category.name}` : 'New category'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Name" error={errors.name} required>
              <input className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. Laptops"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Code" error={errors.code} required>
            <input className={`input uppercase ${errors.code ? 'input-error' : ''}`} placeholder="LAP"
              value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
        </div>
        <Field label="Expected lifespan (months)" error={errors.expectedLifespanMonths} hint="drives retirement reports">
          <input type="number" min="1" className={`input ${errors.expectedLifespanMonths ? 'input-error' : ''}`}
            placeholder="e.g. 48" value={form.expectedLifespanMonths}
            onChange={(e) => setForm({ ...form, expectedLifespanMonths: e.target.value })} />
        </Field>
        <Field label="Description" hint="optional">
          <textarea className="input min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={form.isBookableDefault}
            onChange={(e) => setForm({ ...form, isBookableDefault: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Bookable by default</span>
            <span className="block text-xs text-slate-500">New assets in this category start as shared bookable resources</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{editing ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Categories() {
  const toast = useToast();
  const { data: categories, loading, refetch } = useFetch('/categories?includeInactive=true');
  const [modal, setModal] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggleActive = async () => {
    setBusy(true);
    try {
      await api.patch(`/categories/${toggling.id}`, { isActive: !toggling.isActive });
      toast.success(toggling.isActive ? 'Category deactivated' : 'Category reactivated');
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
        title="Asset Categories"
        subtitle="Classification, expected lifespan and default booking behavior."
        actions={<Button icon={Plus} onClick={() => setModal({})}>New category</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(categories ?? []).map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 ${!c.isActive ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
                <Layers size={18} />
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setModal({ category: c })} />
                <Button variant="ghost" size="sm" icon={Power}
                  className={c.isActive ? 'text-red-500 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}
                  onClick={() => setToggling(c)} />
              </div>
            </div>
            <h3 className="mt-3 font-semibold text-slate-800">
              {c.name} <span className="ml-1 text-xs font-normal text-slate-400">{c.code}</span>
              {!c.isActive && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Inactive</span>}
            </h3>
            {c.description && <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2">{c.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-50 pt-3 text-xs text-slate-500">
              <span><span className="font-semibold text-slate-700">{c.assetCount}</span> assets</span>
              <span><span className="font-semibold text-emerald-600">{c.availableCount}</span> available</span>
              {c.expectedLifespanMonths && (
                <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> {c.expectedLifespanMonths} mo lifespan</span>
              )}
              {c.isBookableDefault && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">Bookable</span>}
            </div>
          </motion.div>
        ))}
      </div>

      <CategoryModal open={!!modal} onClose={() => setModal(null)} onDone={refetch} category={modal?.category} />
      <ConfirmDialog
        open={!!toggling} onClose={() => setToggling(null)} onConfirm={toggleActive} loading={busy}
        variant={toggling?.isActive ? 'danger' : 'success'}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        message={toggling?.isActive
          ? 'New assets cannot be registered under an inactive category. Existing assets are unaffected.'
          : 'The category will accept new assets again.'}
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
      />
    </div>
  );
}
