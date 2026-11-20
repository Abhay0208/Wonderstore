import React, { useState, useEffect } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { signInWithGoogle, registerWithEmail, loginWithEmail } from '../lib/firebase';
import { getFriendlyAuthError, isExpectedAuthError, validateAuthInputs } from '../utils/authHelpers';
import { useToast } from '../context/ToastContext';

interface UserLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  message?: string;
}

export const UserLoginModal: React.FC<UserLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  message,
}) => {
  const { success, error } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setIsSubmitting(false);
    setFormError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setIsSubmitting(false);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setFormError(null);
  };

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      success('Signed in with Google successfully!');
      if (onSuccess) onSuccess();
      handleClose();
    } catch (err: any) {
      if (err?.code === 'auth/cancelled-popup-request') {
        setIsSubmitting(false);
        return;
      }
      if (!isExpectedAuthError(err)) {
        console.warn('[Google Auth]', err);
      }
      const friendly = getFriendlyAuthError(err, 'google');
      setFormError(friendly);
      error(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const validationMsg = validateAuthInputs({
      mode,
      email: cleanEmail,
      password: cleanPassword,
      displayName: name,
    });

    if (validationMsg) {
      setFormError(validationMsg);
      error(validationMsg);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'register') {
        await registerWithEmail(cleanEmail, cleanPassword, name.trim() || undefined);
        success('Account created successfully! Welcome aboard.');
      } else {
        await loginWithEmail(cleanEmail, cleanPassword);
        success('Logged in successfully!');
      }
      if (onSuccess) onSuccess();
      handleClose();
    } catch (err: any) {
      if (!isExpectedAuthError(err)) {
        console.warn('[Auth Error]', err);
      }
      const friendly = getFriendlyAuthError(err, mode);
      setFormError(friendly);
      error(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Clickable Backdrop */}
      <div className="fixed inset-0" onClick={handleClose} aria-hidden="true" />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative z-10 w-full max-w-md rounded-3xl border-2 border-sky-500/30 bg-[#071326] p-6 sm:p-8 shadow-2xl shadow-sky-950/80 my-auto text-foreground font-sans overflow-hidden"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close auth modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-3 shadow-inner">
            {mode === 'login' ? <LogIn className="w-7 h-7" /> : <UserPlus className="w-7 h-7" />}
          </div>
          <h2 id="auth-modal-title" className="text-2xl font-black uppercase tracking-tight text-foreground font-display">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {message ||
              (mode === 'login'
                ? 'Sign in to view your order history and support tickets.'
                : 'Register a new account to save your orders and track support tickets.')}
          </p>
        </div>

        {/* Mode Selector Tabs (Log In vs Register) */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="flex rounded-2xl bg-surface-deep/80 p-1 border border-sky-500/20 mb-5 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            data-active={mode === 'login' ? 'true' : 'false'}
            onClick={() => switchMode('login')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer min-h-[44px] ${
              mode === 'login'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25 border border-sky-300/40'
                : 'bg-transparent text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            data-active={mode === 'register' ? 'true' : 'false'}
            onClick={() => switchMode('register')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer min-h-[44px] ${
              mode === 'register'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25 border border-sky-300/40'
                : 'bg-transparent text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            Register
          </button>
        </div>

        {/* Inline Error Alert */}
        {formError && (
          <div
            role="alert"
            data-testid="auth-error-banner"
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{formError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Name Field (Register Mode Only) */}
          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                Full Name / Display Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. Alex Smith"
                  className="w-full rounded-xl border border-sky-500/20 bg-surface px-3.5 pl-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-400 transition-colors min-h-[44px]"
                />
              </div>
            </div>
          )}

          {/* Email Field */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-1">
              Email Address <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="user@example.com"
                className="w-full rounded-xl border border-sky-500/20 bg-surface px-3.5 pl-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-400 transition-colors min-h-[44px]"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-1">
              Password <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
                className="w-full rounded-xl border border-sky-500/20 bg-surface px-3.5 pl-10 pr-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-400 transition-colors min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-2 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:brightness-110 py-3 text-xs font-black uppercase tracking-wider text-white transition-all shadow-lg shadow-sky-500/25 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </span>
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In with Email' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-sky-500/20" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-[#071326] px-3 text-muted-foreground font-black tracking-widest">
              OR CONTINUE WITH
            </span>
          </div>
        </div>

        {/* Google Sign In Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isSubmitting}
          className="flex items-center justify-center gap-3 w-full rounded-xl bg-white hover:bg-slate-100 px-4 py-3 text-xs font-black text-slate-950 transition-all active:scale-[0.98] shadow-md cursor-pointer disabled:opacity-50 min-h-[44px]"
        >
          <img
            src="https://www.google.com/favicon.ico"
            alt="Google"
            referrerPolicy="no-referrer"
            className="w-4 h-4"
          />
          <span>Continue with Google</span>
        </button>

        {/* Switch Mode Footer Text */}
        <div className="mt-5 text-center text-xs text-muted-foreground">
          {mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-sky-400 font-bold hover:underline cursor-pointer ml-1"
              >
                Register Now
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-sky-400 font-bold hover:underline cursor-pointer ml-1"
              >
                Log In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
