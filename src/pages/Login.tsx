import React, {useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {EduGuardLogo} from '../components/EduGuardLogo';
import {Eye, EyeOff, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Sparkles} from 'lucide-react';

interface LoginProps {
  onSwitchToSignup: () => void;
  signupNotice?: {email: string} | null;
}

export const Login: React.FC<LoginProps> = ({onSwitchToSignup, signupNotice}) => {
  const {login} = useAuth();
  const [email, setEmail] = useState(signupNotice?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(cleanEmail, password);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your email and password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('admin@sentrx.edu');
    setPassword('Admin@EduGuard2026!');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative z-10">
      <div className="w-full max-w-md">
        {/* Card Container with Translucent Cyber Glass */}
        <div className="rounded-2xl border border-slate-800/90 bg-[#0A1020]/80 backdrop-blur-xl p-8 shadow-2xl shadow-cyan-950/20">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <EduGuardLogo size="lg" showSubtitle={true} />
            <h1 className="mt-6 text-xl font-bold tracking-tight text-white font-sans">
              Sign In to Security Console
            </h1>
            <p className="mt-1.5 text-xs text-slate-400">
              Access educational data security monitoring and AI agent investigations
            </p>
          </div>

          {signupNotice && (
            <div className="mb-6 p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 flex items-start gap-3 text-emerald-300 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>Account created successfully. Please sign in with your new credentials.</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-3.5 rounded-lg border border-rose-500/30 bg-rose-950/40 flex items-start gap-3 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@school-district.edu"
                  required
                  autoComplete="email"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold rounded-lg shadow-md shadow-cyan-950/40 hover:shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Assistant */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <button
              type="button"
              onClick={handleFillDemo}
              className="w-full py-2 px-3 bg-slate-900/70 hover:bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs text-cyan-300 flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Autofill Default Administrator Account</span>
            </button>
            <p className="mt-1.5 text-[11px] text-slate-500 text-center font-mono">
              admin@sentrx.edu · Admin@EduGuard2026!
            </p>
          </div>

          {/* Link to Signup */}
          <div className="mt-6 text-center text-xs text-slate-400">
            Need an administrator account?{' '}
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-4"
            >
              Register here
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Protected educational cybersecurity enclave</span>
        </div>
      </div>
    </div>
  );
};
