import axios from "axios";
import { tokenService } from "./token";
import { userCache } from "./userCache";

const envUrl = process.env.EXPO_PUBLIC_API_URL;
if (!envUrl && !__DEV__) {
  throw new Error(
    "EXPO_PUBLIC_API_URL is required in production builds. Configure it in eas.json.",
  );
}
export const API_BASE_URL = envUrl ?? "http://localhost:3000";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Request: access token 자동 첨부
api.interceptors.request.use((config) => {
  const token = tokenService.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}

// 세션이 실제로 무효한 경우(401/403)인지 판별. 네트워크 오류·타임아웃·5xx 와
// 구분해서, 전자에서만 토큰을 폐기해야 일시 장애로 로그아웃되지 않는다.
export const isAuthError = (error: unknown): boolean =>
  axios.isAxiosError(error) &&
  (error.response?.status === 401 || error.response?.status === 403);

// 앱 전체에서 유일한 refresh 경로 (single-flight).
// initialize() 와 응답 인터셉터가 동시에 refresh 하면 서버의 토큰 회전과
// 경합해 한쪽이 무효화되므로, 진행 중인 요청 하나를 모두가 공유한다.
let refreshPromise: Promise<RefreshResult> | null = null;

export const refreshTokens = (): Promise<RefreshResult> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await tokenService.getRefreshToken();
      if (!refreshToken) throw new Error("No refresh token");

      // 인터셉터를 우회한 raw axios — refresh 실패가 다시 refresh 를 부르는 재귀 방지
      const { data } = await axios.post<RefreshResult>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { timeout: 10_000 },
      );

      tokenService.setAccessToken(data.accessToken);
      await tokenService.setRefreshToken(data.refreshToken);
      await userCache.set(data.user);
      return data;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

// Response: 401 시 refresh 자동 시도.
// 동시에 여러 요청이 401 을 받아도 refreshTokens() 의 single-flight 가
// 실제 refresh 를 한 번으로 합쳐 주므로 별도 큐가 필요 없다.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    try {
      const { accessToken } = await refreshTokens();
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      // 세션 만료(401/403)일 때만 토큰 폐기. 네트워크 오류·타임아웃·서버
      // 장애는 토큰을 유지해 다음 시도에서 세션이 복구되도록 한다.
      if (isAuthError(refreshError)) {
        await tokenService.clearAll();
        await userCache.clear();
      }
      return Promise.reject(refreshError);
    }
  },
);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}

export default api;
