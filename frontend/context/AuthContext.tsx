import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiService } from "@/services/apiService";
import * as SecureStore from "expo-secure-store";

interface User {
  id: string;
  email: string;
  username: string;
  nickname: string;
  profilePictureUrl: string | null;
  bio: string;
  preferences: {
    theme: "light" | "dark" | "system";
    defaultTranslateLanguage: "en" | "mr" | "te" | "ta" | "hi";
    autoTranslate: boolean;
    notifications: {
      messages: boolean;
      friendRequests: boolean;
      mentions: boolean;
    };
  };
  isOnline: boolean;
  lastSeen: string;
  isVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (userData: any) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void; // Add setUser to update context
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_KEY = "auth_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (storedToken) {
          apiService.setAuthToken(storedToken);
          setToken(storedToken);
          const response = await apiService.get("/auth/me");
          setUser(response.user || response.data?.user || null);
        }
      } catch (error) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        apiService.setAuthToken(null);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  const login = async (loginValue: string, password: string) => {
    const response = await apiService.post("/auth/login", { login: loginValue, password });
    const { token: newToken, user: userData } = response;
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    apiService.setAuthToken(newToken);
    setToken(newToken);
    setUser(userData);
  };
  
  const register = async (userData: any) => {
    const response = await apiService.post("/auth/register", userData);
    const { token: newToken, user: newUser } = response;
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    apiService.setAuthToken(newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      await apiService.post("/auth/logout");
    } catch {}
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    apiService.setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    const response = await apiService.put(`/users/profile/${user.id}`, updates);
    // Only update fields that changed, keep reference if user ID is unchanged
    setUser((prev) => {
      if (!prev) return response.user;
      if (prev.id === response.user.id) {
        return { ...prev, ...response.user };
      }
      return response.user;
    });
  };

  const refreshUser = async () => {
    try {
      const response = await apiService.get("/auth/me");
      setUser((prev) => {
        if (!prev) return response.user;
        if (prev.id === response.user.id) {
          return { ...prev, ...response.user };
        }
        return response.user;
      });
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        loading,
        login,
        register,
        logout,
        updateProfile,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}