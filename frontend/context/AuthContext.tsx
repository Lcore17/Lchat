import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiService } from "@/services/apiService";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

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
  setUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

const tokenStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') {
      try {
        window.localStorage.removeItem(key);
      } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const extractUserFromResponse = (response: any): User | null => {
    if (response?.user) return response.user as User;
    if (response?.data?.user) return response.data.user as User;
    return null;
  };

  const fetchCurrentUser = async (): Promise<User | null> => {
    const response = await apiService.get("/auth/me");
    return extractUserFromResponse(response);
  };

  const clearAuthState = async () => {
    await Promise.all([
      tokenStorage.removeItem(TOKEN_KEY),
      tokenStorage.removeItem(USER_KEY),
    ]);
    apiService.setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  const persistAuthState = async (nextToken: string, nextUser: User) => {
    await Promise.all([
      tokenStorage.setItem(TOKEN_KEY, nextToken),
      tokenStorage.setItem(USER_KEY, JSON.stringify(nextUser)),
    ]);
    apiService.setAuthToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
  };

  const isUnauthorizedError = (error: unknown) => {
    if (typeof error === 'object' && error !== null) {
      const maybeError = error as { status?: number };
      return maybeError.status === 401 || maybeError.status === 403;
    }
    return false;
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      let storedToken: string | null = null;
      try {
        storedToken = await tokenStorage.getItem(TOKEN_KEY);
        if (storedToken) {
          apiService.setAuthToken(storedToken);
          setToken(storedToken);

          const storedUserJson = await tokenStorage.getItem(USER_KEY);
          if (storedUserJson) {
            try {
              const parsedUser = JSON.parse(storedUserJson) as User;
              setUser(parsedUser);
            } catch {
              await tokenStorage.removeItem(USER_KEY);
            }
          }

          const currentUser = await fetchCurrentUser();
          if (currentUser) {
            await tokenStorage.setItem(USER_KEY, JSON.stringify(currentUser));
            setUser(currentUser);
          } else {
            const fallbackUserJson = await tokenStorage.getItem(USER_KEY);
            if (fallbackUserJson) {
              try {
                setUser(JSON.parse(fallbackUserJson) as User);
              } catch {
                await tokenStorage.removeItem(USER_KEY);
              }
            }
          }
        }
      } catch (error) {
        if (isUnauthorizedError(error)) {
          await clearAuthState();
        } else if (!storedToken) {
          setToken(null);
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  const login = async (loginValue: string, password: string) => {
    const response = await apiService.post("/auth/login", { login: loginValue.trim(), password });
    const { token: newToken, user: userData } = response;
    await persistAuthState(newToken, userData);
  };
  
  const register = async (userData: any) => {
    const response = await apiService.post("/auth/register", userData);
    const { token: newToken, user: newUser } = response;
    await persistAuthState(newToken, newUser);
  };

  const logout = async () => {
    try {
      await apiService.post("/auth/logout");
    } catch {}
    await clearAuthState();
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
    await tokenStorage.setItem(USER_KEY, JSON.stringify(response.user));
  };

  const refreshUser = async () => {
    try {
      const nextUser = await fetchCurrentUser();
      if (!nextUser) return;
      await tokenStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      setUser((prev) => {
        if (!prev) return nextUser;
        if (prev.id === nextUser.id) {
          return { ...prev, ...nextUser };
        }
        return nextUser;
      });
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
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