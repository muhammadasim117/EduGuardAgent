/**
 * EduGuard Agent - Main Application Root
 * Developed by Team SentrX
 */

import React, {useState} from 'react';
import {AuthProvider, useAuth} from './context/AuthContext';
import {CloudyAtmosphere} from './components/CloudyAtmosphere';
import {Navbar} from './components/Navbar';
import {Footer} from './components/Footer';
import {Dashboard} from './pages/Dashboard';
import {AboutUs} from './pages/AboutUs';
import {Login} from './pages/Login';
import {Signup} from './pages/Signup';
import {EduGuardLogo} from './components/EduGuardLogo';

const AppContent: React.FC = () => {
  const {isAuthenticated, isLoading} = useAuth();
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'about'>('dashboard');
  const [authScreen, setAuthScreen] = useState<'login' | 'signup'>('login');
  const [signupNotice, setSignupNotice] = useState<{email: string} | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative z-10 text-slate-300">
        <EduGuardLogo size="lg" />
        <div className="mt-6 flex items-center gap-3 text-xs font-mono text-cyan-400">
          <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <span>Initializing secure security enclave…</span>
        </div>
      </div>
    );
  }

  // Unauthenticated screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        {authScreen === 'login' ? (
          <Login
            onSwitchToSignup={() => {
              setSignupNotice(null);
              setAuthScreen('signup');
            }}
            signupNotice={signupNotice}
          />
        ) : (
          <Signup
            onSwitchToLogin={() => setAuthScreen('login')}
            onSignupSuccess={(email) => {
              setSignupNotice({email});
              setAuthScreen('login');
            }}
          />
        )}
        <Footer />
      </div>
    );
  }

  // Authenticated application with exact two main pages
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        currentPage={currentPage}
        onNavigate={(page) => {
          setCurrentPage(page);
          window.scrollTo({top: 0, behavior: 'smooth'});
        }}
      />

      <main className="flex-1 pb-16">
        {currentPage === 'dashboard' ? <Dashboard /> : <AboutUs />}
      </main>

      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <div className="relative min-h-screen bg-[#060913] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
        <CloudyAtmosphere />
        <AppContent />
      </div>
    </AuthProvider>
  );
}
