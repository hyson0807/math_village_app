import api, { refreshTokens } from "./api";
import { tokenService } from "./token";
import { userCache } from "./userCache";

export interface User {
  id: string;
  email: string;
  name: string | null;
  grade: number | null;
  level: number;
  coins: number;
  stars: number;
  wormStage: number;
  wormProgress: number;
  feed: number;
  feedConsumed: number;
  wormLevel: number;
  equippedHatId: string | null;
  equippedBodyId: string | null;
  equippedAccessoryId: string | null;
  createdAt: string;
  diagnosticCompletedAt: string | null;
  diagnosticScore: number | null;
  diagnosticGrade: number | null;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const saveTokens = async (data: AuthResponse) => {
  tokenService.setAccessToken(data.accessToken);
  await tokenService.setRefreshToken(data.refreshToken);
  await userCache.set(data.user);
};

export const authApi = {
  register: async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>("/auth/register", {
      email,
      password,
    });
    await saveTokens(data);
    return data;
  },

  login: async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    await saveTokens(data);
    return data;
  },

  googleSignIn: async (idToken: string) => {
    const { data } = await api.post<AuthResponse>("/auth/google", { idToken });
    await saveTokens(data);
    return data;
  },

  appleSignIn: async (params: {
    identityToken: string;
    fullName?: string;
    email?: string;
  }) => {
    const { data } = await api.post<AuthResponse>("/auth/apple", params);
    await saveTokens(data);
    return data;
  },

  refresh: async () => {
    // api.ts 의 single-flight 경로로 위임 — 인터셉터와 동시 실행 시에도
    // 실제 refresh 요청은 하나만 나간다. 토큰/스냅샷 저장도 그쪽에서 처리.
    const data = await refreshTokens();
    return data as AuthResponse;
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      await tokenService.clearAll();
      await userCache.clear();
    }
  },

  getMe: async () => {
    const { data } = await api.get<User>("/users/me");
    return data;
  },

  updateProfile: async (body: {
    name?: string;
    grade?: number;
  }) => {
    const { data } = await api.patch<User>("/users/me", body);
    return data;
  },

  deleteAccount: async () => {
    await api.delete("/users/me");
    await tokenService.clearAll();
    await userCache.clear();
  },
};
