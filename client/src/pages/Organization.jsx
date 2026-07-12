import { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Button, Field, PageHeader, PageSpinner } from '../components/ui';

const EMPTY = {
  name: '', legalName: '', email: '', phone: '', address: '', city: '', country: '',
  timezone: 'Asia/Kolkata', currency: 'INR', assetTagPrefix: 'AST',
};

export default function Organization() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/organization')
      .then((r) => r.data.data && setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(r.data.data).filter(([, v]) => v !== null)) }))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Organization name is required';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.assetTagPrefix.trim()) errs.assetTagPrefix = 'Prefix is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await api.put('/organization', {
        ...form,
        name: form.name.trim(),
        legalName: form.legalName.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        assetTagPrefix: form.assetTagPrefix.trim(),
      });
      toast.success('Organization profile saved');
    } catch (err) {
      toast.error(err.message);
      setErrors(err.details ?? {});
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Organization Setup"
        subtitle="Company profile and system-wide defaults. New asset tags use the prefix below."
      />

      <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white">
            {form.name?.[0]?.toUpperCase() ?? <Building2 size={22} />}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{form.name || 'Your organization'}</p>
            <p className="text-xs text-slate-400">Visible across the application</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" error={errors.name} required>
            <input className={`input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Legal name">
            <input className="input" value={form.legalName} onChange={set('legalName')} />
          </Field>
          <Field label="Contact email" error={errors.email}>
            <input type="email" className={`input ${errors.email ? 'input-error' : ''}`} value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={set('phone')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <input className="input" value={form.address} onChange={set('address')} />
            </Field>
          </div>
          <Field label="City"><input className="input" value={form.city} onChange={set('city')} /></Field>
          <Field label="Country"><input className="input" value={form.country} onChange={set('country')} /></Field>
          <Field label="Timezone">
            <select className="input" value={form.timezone} onChange={set('timezone')}>
              {['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore', 'Australia/Sydney'].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
          <Field label="Currency">
            <select className="input" value={form.currency} onChange={set('currency')}>
              {['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AUD'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Asset tag prefix" error={errors.assetTagPrefix} hint="e.g. AST → AST-1042" required>
            <input className={`input uppercase ${errors.assetTagPrefix ? 'input-error' : ''}`} maxLength={10}
              value={form.assetTagPrefix} onChange={set('assetTagPrefix')} />
          </Field>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="submit" loading={saving} icon={Save}>Save profile</Button>
        </div>
      </form>
    </div>
  );
}
