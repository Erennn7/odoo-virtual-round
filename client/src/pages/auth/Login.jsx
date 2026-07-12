import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, Field } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email address';
    if (!form.password) errs.password = 'Password is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const user = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`);
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
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h2>
      <p className="mt-1 text-sm text-slate-500">Welcome back — sign in to manage your assets.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="Work email" error={errors.email} required>
          <input
            type="email" autoComplete="email" placeholder="you@company.com"
            className={`input ${errors.email ? 'input-error' : ''}`}
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password" error={errors.password} required>
          <input
            type="password" autoComplete="current-password" placeholder="••••••••"
            className={`input ${errors.password ? 'input-error' : ''}`}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" loading={loading} icon={LogIn} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{' '}
        <Link to="/signup" className="font-semibold text-indigo-600 hover:text-indigo-700">Create an account</Link>
      </p>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500">
        <p className="mb-1 font-semibold text-slate-600">Demo accounts</p>
        <p>Admin — admin@assetflow.io / Admin@123</p>
        <p>Asset Manager — manager@assetflow.io / Password@123</p>
        <p>Dept Head — rohan.mehta@assetflow.io / Password@123</p>
        <p>Employee — ishaan.gupta@assetflow.io / Password@123</p>
      </div>
    </AuthShell>
  );
}
