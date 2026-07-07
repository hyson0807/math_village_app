import { create } from "zustand";
import { authApi, User } from "@/services/auth";
import { tokenService } from "@/services/token";
import { getApiErrorMessage, isAuthError } from "@/services/api";
import { userCache } from "@/services/userCache";
import { queryClient } from "@/services/queryClient";
import { queryPersister } from "@/services/queryPersister";

interface AuthState {
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  user: User | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  googleSignIn: (idToken: string) => Promise<void>;
  appleSignIn: (params: {
    identityToken: string;
    fullName?: string;
    email?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (data: {
    name?: string;
    grade?: number;
  }) => Promise<User>;
  syncUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,
  user: null,

  initialize: async () => {
    try {
      const refreshToken = await tokenService.getRefreshToken();
      if (!refreshToken) {
        set({ isInitialized: true });
        return;
      }

      const { user } = await authApi.refresh();
      set({ isAuthenticated: true, user, isInitialized: true });
    } catch (e) {
      if (isAuthError(e)) {
        // 세션이 실제로 무효 (refresh token 만료/폐기) — 토큰 삭제 후 로그인 화면
        await tokenService.clearAll();
        await userCache.clear();
        set({ isAuthenticated: false, user: null, isInitialized: true });
        return;
      }

      // 네트워크 오류·타임아웃·서버 장애: 토큰을 절대 지우지 않는다.
      // 마지막 사용자 스냅샷이 있으면 그대로 진입 — 네트워크 복구 후 첫 401 에서
      // 인터셉터가 자동으로 refresh 해 세션이 이어진다.
      const cachedUser = await userCache.get<User>();
      set({
        isAuthenticated: cachedUser != null,
        user: cachedUser,
        isInitialized: true,
      });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await authApi.login(email, password);
      // 이전 세션의 사용자별 캐시(worm/room/shop/진단 등) 잔여 제거
      queryClient.clear();
      set({ isAuthenticated: true, user, isLoading: false });
    } catch (e: unknown) {
      set({ isLoading: false, error: getApiErrorMessage(e, "로그인에 실패했습니다.") });
      throw e;
    }
  },

  googleSignIn: async (idToken) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await authApi.googleSignIn(idToken);
      queryClient.clear();
      set({ isAuthenticated: true, user, isLoading: false });
    } catch (e: unknown) {
      set({
        isLoading: false,
        error: getApiErrorMessage(e, "Google 로그인에 실패했습니다."),
      });
      throw e;
    }
  },

  appleSignIn: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await authApi.appleSignIn(params);
      queryClient.clear();
      set({ isAuthenticated: true, user, isLoading: false });
    } catch (e: unknown) {
      set({
        isLoading: false,
        error: getApiErrorMessage(e, "Apple 로그인에 실패했습니다."),
      });
      throw e;
    }
  },

  register: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await authApi.register(email, password);
      queryClient.clear();
      set({ isAuthenticated: true, user, isLoading: false });
    } catch (e: unknown) {
      set({ isLoading: false, error: getApiErrorMessage(e, "회원가입에 실패했습니다.") });
      throw e;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      // 디스크 영속 캐시도 즉시 폐기 (앱이 throttle flush 전에 종료돼도 누수 방지)
      await queryPersister.removeClient();
      set({ isAuthenticated: false, user: null, error: null });
    }
  },

  deleteAccount: async () => {
    try {
      await authApi.deleteAccount();
      queryClient.clear();
      await queryPersister.removeClient();
      set({ isAuthenticated: false, user: null, error: null });
    } catch (e: unknown) {
      set({ error: getApiErrorMessage(e, "계정 삭제에 실패했습니다.") });
      throw e;
    }
  },

  updateProfile: async (data) => {
    const user = await authApi.updateProfile(data);
    await userCache.set(user);
    set({ user });
    return user;
  },

  syncUser: (user) => {
    void userCache.set(user);
    set({ user });
  },

  clearError: () => set({ error: null }),
}));
