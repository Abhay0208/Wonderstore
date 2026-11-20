import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  auth,
  onAuthStateChanged,
  getLocalActiveUser,
  signOutUser,
  CustomUser,
} from '../lib/firebase';

interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomUser | null>(() => {
    return auth.currentUser || getLocalActiveUser();
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (resolvedUser) => {
      setUser(resolvedUser);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    await signOutUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
