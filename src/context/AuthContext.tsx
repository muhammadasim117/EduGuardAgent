import React, {createContext, useContext, useEffect, useState} from 'react';
import {AuthUser} from '../types';
import {api, setStoredToken} from '../services/api';

interface AuthContextType {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: {first_name: string; last_name: string; email: string; password: string}) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initAuth() {
      try {
        const user = await api.getMe();
        setCurrentUser(user);
      } catch {
        setStoredToken(null);
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const res = await api.login({email, password});
      setCurrentUser(res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
      throw err;
    }
  };

  const signup = async (payload: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  }) => {
    setError(null);
    try {
      // Creating an account does not sign the user in; they continue to the login screen.
      await api.signup(payload);
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please check the provided information.');
      throw err;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isLoading,
        error,
        login,
        signup,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
