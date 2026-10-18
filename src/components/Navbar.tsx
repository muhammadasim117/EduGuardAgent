import React, {useState} from 'react';
import {EduGuardLogo} from './EduGuardLogo';
import {useAuth} from '../context/AuthContext';
import {LayoutDashboard, Info, LogOut, User, Menu, X, ShieldCheck} from 'lucide-react';

interface NavbarProps {
  currentPage: 'dashboard' | 'about';
  onNavigate: (page: 'dashboard' | 'about') => void;
}

export const Navbar: React.FC<NavbarProps> = ({currentPage, onNavigate}) => {
  const {currentUser, logout} = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#060913]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Original EduGuard Agent Logo (Fixed Position) */}
        <div className="flex items-center shrink-0 cursor-pointer" onClick={() => onNavigate('dashboard')}>
          <EduGuardLogo size="md" />
        </div>

        {/* Center / Right: Desktop Navigation links & User actions */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all ${
              currentPage === 'dashboard'
                ? 'text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => onNavigate('about')}
            className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all ${
              currentPage === 'about'
                ? 'text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>About Us</span>
          </button>
        </nav>

        {/* Right: Authenticated User badge and Logout button */}
        <div className="hidden md:flex items-center gap-3">
          {currentUser && (
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-inner">
                {currentUser.first_name?.[0] || 'A'}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-medium text-slate-200 leading-tight">
                  {currentUser.name || currentUser.email}
                </span>
                <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  {currentUser.role || 'Administrator'}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            title="Log out of EduGuard Agent"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 border border-transparent hover:border-rose-800/40 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isLoggingOut ? 'Logging out…' : 'Logout'}</span>
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-[#090E1C] px-4 pt-2 pb-4 space-y-2">
          {currentUser && (
            <div className="py-2 px-3 mb-2 rounded border border-slate-800 bg-slate-900/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center font-bold text-white text-xs">
                {currentUser.first_name?.[0] || 'A'}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-200">{currentUser.name}</div>
                <div className="text-xs text-slate-400">{currentUser.email}</div>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              onNavigate('dashboard');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-left ${
              currentPage === 'dashboard' ? 'text-cyan-400 bg-cyan-950/50' : 'text-slate-300'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => {
              onNavigate('about');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-left ${
              currentPage === 'about' ? 'text-cyan-400 bg-cyan-950/50' : 'text-slate-300'
            }`}
          >
            <Info className="w-4 h-4" />
            About Us
          </button>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-400 rounded-lg hover:bg-rose-950/30 text-left"
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      )}
    </header>
  );
};
