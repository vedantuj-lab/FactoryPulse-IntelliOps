import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import { FactoryPulseLogo, ResilientImage } from '../components/BrandLogo';
import { INDUSTRIAL_ASSETS } from '../lib/assets';
import { useAuth, UserRole, getRoleDashboardPath } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/api';

const ROLE_OPTIONS: { role: UserRole; label: string; demoEmail: string; desc: string }[] = [
  {
    role: 'ADMIN',
    label: 'Administrator',
    demoEmail: 'admin@factorypulse.demo',
    desc: 'Factory configuration, users, departments & audit logs',
  },
  {
    role: 'MANAGER',
    label: 'Factory Manager',
    demoEmail: 'manager@factorypulse.demo',
    desc: 'Operations, shifts, production, recovery & simulator',
  },
  {
    role: 'WORKER',
    label: 'Worker',
    demoEmail: 'worker@factorypulse.demo',
    desc: 'Attendance, shifts, assigned tasks & fault/safety reports',
  },
  {
    role: 'TECHNICIAN',
    label: 'Technician',
    demoEmail: 'technician@factorypulse.demo',
    desc: 'Assigned faults, diagnostics, repairs & service history',
  },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const { notify } = useToast();

  const [selectedRole, setSelectedRole] = useState<UserRole>('MANAGER');
  const [email, setEmail] = useState('manager@factorypulse.demo');
  const [password, setPassword] = useState('');
  const [demoHintPassword, setDemoHintPassword] = useState('DemoPulse!2026');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forgot password modal state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(getRoleDashboardPath(user.role), { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    apiFetch<{ demoPasswordHint: string }>('/api/public/pulse-summary')
      .then((d) => {
        if (d.demoPasswordHint) {
          setDemoHintPassword(d.demoPasswordHint);
          setPassword(d.demoPasswordHint);
        }
      })
      .catch(() => {
        setPassword('DemoPulse!2026');
      });
  }, []);

  const handleSelectDemoAccount = (opt: typeof ROLE_OPTIONS[0]) => {
    setSelectedRole(opt.role);
    setEmail(opt.demoEmail);
    setPassword(demoHintPassword);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid work email address.');
      return;
    }
    if (!password || password.length < 4) {
      setErrorMsg('Please enter your account password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await login({
        email: email.trim(),
        password,
        selectedRole,
        rememberMe,
      });
      notify('success', `Welcome back, ${res.user.fullName}`, `Verified role: ${res.user.role}`);
      navigate(res.redirectTo, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Check your credentials and assigned role.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: resetEmail,
          newPassword: resetNewPassword,
        }),
      });
      notify('success', 'Password Reset Complete', res.message);
      setResetOpen(false);
      setResetNewPassword('');
    } catch (err: any) {
      notify('error', 'Reset Failed', err.message);
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#171A21] text-[#F5F6F8] grid grid-cols-1 lg:grid-cols-12">
      {/* LEFT COLUMN: Industrial Background + Brand Statement */}
      <div className="hidden lg:flex lg:col-span-6 relative overflow-hidden border-r border-neutral-800 flex-col justify-between p-10">
        <ResilientImage
          src={INDUSTRIAL_ASSETS.controlCenter}
          alt="FactoryPulse IntelliOps plant operations control room"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#171A21]/90 via-[#171A21]/75 to-[#171A21]/95" />

        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="focus:outline-none">
            <FactoryPulseLogo size="md" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Platform Overview
          </Link>
        </div>

        <div className="relative z-10 max-w-lg my-auto">
          <p className="text-xs font-medium text-[#FF8A32] mb-2">Role-Verified Operational Access</p>
          <h1 className="text-3xl font-bold text-[#F5F6F8] leading-tight">
            One Connected Database Across Every Shift and Department.
          </h1>
          <p className="text-sm text-neutral-300 mt-4 leading-relaxed">
            Every role portal connects to the same operational state. Role selection on sign-in is strictly verified against your backend database record before granting route permissions.
          </p>

          <div className="mt-8 bg-[#171A21]/85 border border-neutral-700/80 rounded-lg p-4 space-y-2 text-xs text-neutral-300">
            <p className="font-semibold text-[#F5F6F8] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#19C6B4]" />
              Backend Role Enforcement Active
            </p>
            <p className="text-neutral-400 leading-relaxed">
              Selecting a different role tab than the account&apos;s assigned database role will trigger an immediate backend authorization rejection (HTTP 403).
            </p>
          </div>
        </div>

        <div className="relative z-10 text-xs text-neutral-400 flex items-center justify-between">
          <span>Northstar Manufacturing Works · Demonstration Environment</span>
          <span className="font-mono">RBAC v2.6</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Authentication Form & Role Verification Selector */}
      <div className="lg:col-span-6 flex flex-col justify-center px-4 sm:px-10 py-10 bg-[#1B1F27]">
        <div className="max-w-md w-full mx-auto">
          <div className="lg:hidden flex items-center justify-between mb-8">
            <Link to="/">
              <FactoryPulseLogo size="sm" />
            </Link>
            <Link to="/" className="text-xs text-neutral-400 hover:text-white">
              ← Home
            </Link>
          </div>

          <h2 className="text-2xl font-bold text-[#F5F6F8]">Sign In to FactoryPulse</h2>
          <p className="text-xs text-neutral-400 mt-1.5">
            Select your operational role and authenticate with your plant credentials.
          </p>

          {/* Role Verification Selector */}
          <div className="mt-6">
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              1. Operational Role (Verified on Backend)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((opt) => {
                const active = selectedRole === opt.role;
                return (
                  <button
                    key={opt.role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(opt.role);
                      setErrorMsg(null);
                    }}
                    className={`text-left p-2.5 rounded-md border transition-colors ${
                      active
                        ? 'bg-[#242A33] border-[#FF8A32] text-[#F5F6F8]'
                        : 'bg-[#171A21] border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <p className="text-xs font-semibold whitespace-nowrap">{opt.label}</p>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {errorMsg && (
            <div className="mt-5 p-3.5 rounded-md bg-[#EF4444]/15 border border-[#EF4444]/50 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Work Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@factorypulse.demo"
                  className="w-full pl-9 pr-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-neutral-300">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setResetOpen(true);
                  }}
                  className="text-xs text-[#19C6B4] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-2 text-neutral-400 hover:text-white p-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex items-center gap-2 text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-neutral-600 bg-[#171A21]"
                />
                <span>Remember session (7 days)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] transition-colors disabled:opacity-60"
            >
              {submitting ? 'Verifying Role & Credentials...' : 'Sign In to Portal'}
            </button>
          </form>

          {/* Seeded Demonstration Accounts Quick Fill */}
          <div className="mt-7 pt-5 border-t border-neutral-800">
            <div className="flex items-center justify-between text-xs text-neutral-400 mb-2.5">
              <span className="font-medium text-neutral-300">Seeded Demonstration Accounts</span>
              <span className="font-mono text-[11px]">Seed Password: {demoHintPassword}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.demoEmail}
                  type="button"
                  onClick={() => handleSelectDemoAccount(opt)}
                  className="text-left px-3 py-2 rounded bg-[#171A21] border border-neutral-800 hover:border-neutral-600 transition-colors"
                >
                  <p className="text-xs font-semibold text-[#F5F6F8]">{opt.label}</p>
                  <p className="text-[11px] font-mono text-neutral-400 truncate">{opt.demoEmail}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-[#F5F6F8]">Reset Account Password</h3>
            <p className="text-xs text-neutral-400 mt-1">
              Enter your registered FactoryPulse email and a new password (minimum 8 characters).
            </p>
            <form onSubmit={handlePasswordReset} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs text-neutral-300 mb-1">Registered Email</label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-300 mb-1">New Password (min 8 characters)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="px-4 py-2 text-xs font-medium bg-[#171A21] border border-neutral-700 rounded-md text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetBusy}
                  className="px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md"
                >
                  {resetBusy ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
