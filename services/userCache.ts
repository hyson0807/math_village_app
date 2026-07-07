import AsyncStorage from "@react-native-async-storage/async-storage";

const USER_CACHE_KEY = "auth-user-cache";

// 마지막으로 확인된 사용자 스냅샷. 오프라인/서버 장애로 부팅 시 refresh 가
// 실패해도 로그아웃시키지 않고 이 스냅샷으로 진입하기 위한 용도.
// 민감정보(토큰)는 절대 저장하지 않는다 — 토큰은 expo-secure-store 전용.
export const userCache = {
  get: async <T>(): Promise<T | null> => {
    try {
      const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  set: async (user: unknown): Promise<void> => {
    try {
      await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } catch {
      // 스냅샷 저장 실패는 치명적이지 않음 — 다음 성공 시 갱신됨
    }
  },

  clear: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(USER_CACHE_KEY);
    } catch {
      // noop
    }
  },
};
