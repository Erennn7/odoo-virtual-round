import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MailCheck, ArrowLeft } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Button, Field } from '../../components/ui';
import { AuthShell } from './AuthShell';

/**
 * Two-step recovery: request a token, then set the new password.
 * Demo mode surfaces the token directly (no SMTP in this environment).
 */
export default function ForgotPassword() {
  const toast = useToast();
  const [step, setStep] = useState('request'); // request | reset | done
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const requestToken = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErrors({ email: 'Enter a valid email address' });
    setErrors({});
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      if (res.data.resetToken) setToken(res.data.resetToken);
      setStep('reset');
      toast.info(res.data.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!token.trim()) errs.token = 'Paste the reset token';
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      errs.password = 'Min. 8 chars with uppercase, lowercase and a digit';
    }
    if (confirm !== password) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: token.trim(), password });
      setStep('done');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back to sign in
      </Link>

      {step === 'request' && (
        <>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Reset your password</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your account email and we'll generate a secure reset token.</p>
          <form onSubmit={requestToken} className="mt-8 space-y-4" noValidate>
            <Field label="Work email" error={errors.email} required>
              <input type="email" className={`input ${errors.email ? 'input-error' : ''}`} placeholder="you@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" loading={loading} icon={KeyRound} className="w-full">
              Generate reset token
            </Button>
          </form>
        </>
      )}

      {step === 'reset' && (
        <>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Set a new password</h2>
          <p className="mt-1 text-sm text-slate-500">
            The token below was generated for <span className="font-medium text-slate-700">{email}</span> and expires in 30 minutes.
          </p>
          <form onSubmit={resetPassword} className="mt-8 space-y-4" noValidate>
            <Field label="Reset token" error={errors.token} hint="pre-filled in demo mode" required>
              <input className={`input font-mono text-xs ${errors.token ? 'input-error' : ''}`}
                value={token} onChange={(e) => setToken(e.target.value)} />
            </Field>
            <Field label="New password" error={errors.password} required>
              <input type="password" className={`input ${errors.password ? 'input-error' : ''}`} placeholder="Min. 8 characters"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm new password" error={errors.confirm} required>
              <input type="password" className={`input ${errors.confirm ? 'input-error' : ''}`} placeholder="Repeat password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" loading={loading} className="w-full">Update password</Button>
          </form>
        </>
      )}

      {step === 'done' && (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <MailCheck size={26} />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Password updated</h2>
          <p className="mt-1 text-sm text-slate-500">Your password has been changed. Sign in with your new credentials.</p>
          <Link to="/login">
            <Button size="lg" className="mt-6 w-full">Go to sign in</Button>
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
