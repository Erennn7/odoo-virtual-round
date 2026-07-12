import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Modal } from '../../components/ui';
import { CONDITIONS } from '../../utils/constants';
import { humanize } from '../../utils/format';

const EMPTY = {
  name: '', categoryId: '', departmentId: '', serialNumber: '', model: '', manufacturer: '',
  purchaseDate: '', purchaseCost: '', warrantyExpiry: '', condition: 'GOOD', location: '',
  imageUrl: '', notes: '', isBookable: false,
};

/** Register / edit an asset. Shared by the directory and detail pages. */
export function AssetForm({ open, onClose, onSaved, asset }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const editing = !!asset;

  useEffect(() => {
    if (!open) return;
    Promise.all([api.get('/categories'), api.get('/departments')])
      .then(([c, d]) => { setCategories(c.data.data); setDepartments(d.data.data); })
      .catch((e) => toast.error(e.message));
    setErrors({});
    setForm(asset ? {
      name: asset.name ?? '', categoryId: asset.categoryId ?? '', departmentId: asset.departmentId ?? '',
      serialNumber: asset.serialNumber ?? '', model: asset.model ?? '', manufacturer: asset.manufacturer ?? '',
      purchaseDate: asset.purchaseDate?.slice(0, 10) ?? '', purchaseCost: asset.purchaseCost ?? '',
      warrantyExpiry: asset.warrantyExpiry?.slice(0, 10) ?? '', condition: asset.condition ?? 'GOOD',
      location: asset.location ?? '', imageUrl: asset.imageUrl ?? '', notes: asset.notes ?? '',
      isBookable: asset.isBookable ?? false,
    } : EMPTY);
  }, [open, asset]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const validate = () => {
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Asset name is required';
    if (!form.categoryId) errs.categoryId = 'Select a category';
    if (form.purchaseCost !== '' && Number(form.purchaseCost) < 0) errs.purchaseCost = 'Cost cannot be negative';
    if (form.purchaseDate && form.warrantyExpiry && form.warrantyExpiry < form.purchaseDate) {
      errs.warrantyExpiry = 'Warranty cannot end before purchase';
    }
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      departmentId: form.departmentId || null,
      serialNumber: form.serialNumber.trim() || null,
      model: form.model.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      purchaseDate: form.purchaseDate || null,
      purchaseCost: form.purchaseCost === '' ? null : Number(form.purchaseCost),
      warrantyExpiry: form.warrantyExpiry || null,
      condition: form.condition,
      location: form.location.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      notes: form.notes.trim() || null,
      isBookable: form.isBookable,
    };

    setLoading(true);
    try {
      if (editing) await api.patch(`/assets/${asset.id}`, payload);
      else await api.post('/assets', payload);
      toast.success(editing ? 'Asset updated' : 'Asset registered — tag assigned automatically');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
      setErrors(err.details ?? {});
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} wide
      title={editing ? `Edit ${asset?.assetTag}` : 'Register new asset'}
      subtitle={editing ? undefined : 'The asset tag is generated automatically on save.'}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asset name" error={errors.name} required>
            <input className={`input ${errors.name ? 'input-error' : ''}`} placeholder={'e.g. MacBook Pro 14"'}
              value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Category" error={errors.categoryId} required>
            <select className={`input ${errors.categoryId ? 'input-error' : ''}`} value={form.categoryId} onChange={set('categoryId')}>
              <option value="">Select category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Department" hint="optional">
            <select className="input" value={form.departmentId} onChange={set('departmentId')}>
              <option value="">Unassigned</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Serial number" error={errors.serialNumber} hint="must be unique">
            <input className={`input ${errors.serialNumber ? 'input-error' : ''}`} placeholder="Manufacturer serial"
              value={form.serialNumber} onChange={set('serialNumber')} />
          </Field>
          <Field label="Model"><input className="input" value={form.model} onChange={set('model')} /></Field>
          <Field label="Manufacturer"><input className="input" value={form.manufacturer} onChange={set('manufacturer')} /></Field>
          <Field label="Purchase date">
            <input type="date" className="input" value={form.purchaseDate} onChange={set('purchaseDate')} />
          </Field>
          <Field label="Purchase cost" error={errors.purchaseCost}>
            <input type="number" min="0" step="0.01" className={`input ${errors.purchaseCost ? 'input-error' : ''}`}
              placeholder="0.00" value={form.purchaseCost} onChange={set('purchaseCost')} />
          </Field>
          <Field label="Warranty expiry" error={errors.warrantyExpiry}>
            <input type="date" className={`input ${errors.warrantyExpiry ? 'input-error' : ''}`}
              value={form.warrantyExpiry} onChange={set('warrantyExpiry')} />
          </Field>
          <Field label="Condition">
            <select className="input" value={form.condition} onChange={set('condition')}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <input className="input" placeholder="e.g. 3rd Floor, East Wing" value={form.location} onChange={set('location')} />
          </Field>
          <Field label="Photo URL" hint="optional">
            <input className="input" placeholder="https://…" value={form.imageUrl} onChange={set('imageUrl')} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-20 resize-y" value={form.notes} onChange={set('notes')} />
        </Field>
        <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={form.isBookable} onChange={set('isBookable')}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Bookable shared resource</span>
            <span className="block text-xs text-slate-500">Rooms, vehicles and equipment reserved via the booking calendar</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{editing ? 'Save changes' : 'Register asset'}</Button>
        </div>
      </form>
    </Modal>
  );
}
