import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../lib/api';

export type UserRole = 'ADMIN' | 'MANAGER' | 'WORKER' | 'TECHNICIAN';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  employeeCode: string;
  role: UserRole;
  departmentId: string | null;
  departmentName: string | null;
  phone: string | null;
  workerId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (params: {
    email: string;
    password: string;
    selectedRole?: UserRole;
    rememberMe?: boolean;
  }) => Promise<{ redirectTo: string; user: AuthUser }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function getRoleDashboardPath(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'MANAGER':
      return '/manager/dashboard';
    case 'WORKER':
      return '/worker/dashboard';
    case 'TECHNICIAN':
      return '/technician/dashboard';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (params: {
    email: string;
    password: string;
    selectedRole?: UserRole;
    rememberMe?: boolean;
  }) => {
    const res = await apiFetch<{ token: string; redirectTo: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setStoredToken(res.token);
    setUser(res.user);
    return { redirectTo: res.redirectTo, user: res.user };
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore if session already expired
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
