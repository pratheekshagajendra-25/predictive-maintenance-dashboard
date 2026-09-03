import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('pm_auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('pm_auth_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verifyToken() {
      if (token) {
        try {
          const res = await api.getMe();
          if (res.success && res.user) {
            setUser(res.user);
            localStorage.setItem('pm_auth_user', JSON.stringify(res.user));
          }
        } catch (e) {
          console.warn('Session verification failed, logging out:', e);
          logout();
        }
      }
      setLoading(false);
    }
    verifyToken();

    const handleExpired = () => logout();
    window.addEventListener('pm_auth_expired', handleExpired);
    return () => window.removeEventListener('pm_auth_expired', handleExpired);
  }, [token]);

  const login = async (username, password) => {
    const res = await api.login(username, password);
    if (res.success && res.token) {
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem('pm_auth_token', res.token);
      localStorage.setItem('pm_auth_user', JSON.stringify(res.user));
      return res.user;
    }
    throw new Error(res.error || 'Login failed');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('pm_auth_token');
    localStorage.removeItem('pm_auth_user');
  };

  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';

  return (
    <AuthContext.Provider value={{ user, token, isAdmin, isCustomer, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
