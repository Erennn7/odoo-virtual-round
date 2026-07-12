import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, Field } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function Signup() {
  const { signup } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '', departmentId: '', designation: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Public-ish department options are still behind auth; fall back to empty gracefully.
    api.get('/departments').then((r) => setDepartments(r.data.data)).catch(() => setDepartments([]));
  }, []);

  const validate = () => {
    const errs = {};
    if (form.fullName.trim().length < 2) errs.fullName = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email address';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    else if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      errs.password = 'Include uppercase, lowercase and a digit';
    }
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await signup({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        departmentId: form.departmentId || null,
        designation: form.designation.trim() || null,
      });
      toast.success('Account created — welcome to AssetFlow!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.message);
      setErrors(err.details ?? {});
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h2>
      <p className="mt-1 text-sm text-slate-500">
        All signups start as <span className="font-medium text-slate-700">Employee</span> accounts.
        An administrator can grant additional roles later.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="Full name" error={errors.fullName} required>
          <input className={`input ${errors.fullName ? 'input-error' : ''}`} placeholder="Jane Doe"
            value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <Field label="Work email" error={errors.email} required>
          <input type="email" className={`input ${errors.email ? 'input-error' : ''}`} placeholder="you@company.com"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Password" error={errors.password} required>
            <input type="password" className={`input ${errors.password ? 'input-error' : ''}`} placeholder="Min. 8 characters"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Confirm password" error={errors.confirm} required>
            <input type="password" className={`input ${errors.confirm ? 'input-error' : ''}`} placeholder="Repeat password"
              value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
        </div>
        {departments.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Department" hint="optional">
              <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">Select later…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Designation" hint="optional">
              <input className="input" placeholder="e.g. Software Engineer"
                value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </Field>
          </div>
        )}
        <Button type="submit" size="lg" loading={loading} icon={UserPlus} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">Sign in</Link>
      </p>
    </AuthShell>
  );
}
