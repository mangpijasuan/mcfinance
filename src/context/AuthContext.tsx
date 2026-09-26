import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthUser, UserRole } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoginModalOpen: boolean;
  initialModalTab: 'admin' | 'member';
  openLoginModal: (defaultTab?: 'admin' | 'member') => void;
  closeLoginModal: () => void;
  loginAsAdmin: (email?: string, name?: string, title?: string) => void;
  loginAsMember: (memberId: string, memberName: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'millionaires_club_auth_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to Admin logged in for smooth preview, but allow instant switching or logging out
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {
      id: 'admin-1',
      name: 'Mangpi',
      email: 'mangpi.treasurer@millionairesclub.org',
      role: 'admin',
      title: 'Executive Board',
    };
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [initialModalTab, setInitialModalTab] = useState<'admin' | 'member'>('admin');

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  const openLoginModal = (defaultTab?: 'admin' | 'member') => {
    if (defaultTab) {
      setInitialModalTab(defaultTab);
    }
    setIsLoginModalOpen(true);
  };
  const closeLoginModal = () => setIsLoginModalOpen(false);

  const loginAsAdmin = (email = 'admin@millionairesclub.org', name = 'Mangpi', title = 'Board Executive') => {
    setUser({
      id: 'admin-1',
      name,
      email,
      role: 'admin',
      title,
    });
    setIsLoginModalOpen(false);
  };

  const loginAsMember = (memberId: string, memberName: string) => {
    setUser({
      id: `user-${memberId}`,
      name: memberName,
      role: 'member',
      memberId,
      title: 'Club Member',
    });
    setIsLoginModalOpen(false);
  };

  const logout = () => {
    setUser(null);
    setIsLoginModalOpen(true);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : null,
        isAuthenticated: !!user,
        isLoginModalOpen,
        initialModalTab,
        openLoginModal,
        closeLoginModal,
        loginAsAdmin,
        loginAsMember,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
