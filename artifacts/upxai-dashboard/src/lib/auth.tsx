import { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getCurrentUser,
  getGetCurrentUserQueryKey,
  logout as apiLogout,
} from "@workspace/api-client-react";

export interface AuthUser {
  username: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ME_QUERY_KEY = getGetCurrentUserQueryKey();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        const r = await getCurrentUser();
        return r.user as AuthUser;
      } catch (err) {
        // 401 simply means "not authenticated" — surface as null instead of an error.
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [qc]);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Clear all cached queries — they were scoped to the previous session.
      qc.clear();
      await qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    }
  }, [qc]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      signOut,
      refresh,
    }),
    [data, isLoading, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
