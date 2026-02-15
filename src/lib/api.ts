type FetchJsonOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

type RefreshResponse = {
  status?: {
    code?: string;
    message?: string;
  };
  data?: {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
  };
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const refreshTokenMaxAgeSeconds = 60 * 60 * 24 * 30;

const createCorrelationId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const isHttps = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.protocol === "https:";
};

const cookieAttributes = (maxAgeSeconds?: number) => {
  const maxAge =
    typeof maxAgeSeconds === "number" ? `; Max-Age=${maxAgeSeconds}` : "";
  const secure = isHttps() ? "; Secure" : "";
  return `Path=/${maxAge}; SameSite=Lax${secure}`;
};

const getCookie = (name: string) => {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const setCookie = (
  name: string,
  value: string,
  maxAgeSeconds?: number
) => {
  if (typeof document === "undefined") {
    return;
  }
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; ${cookieAttributes(maxAgeSeconds)}`;
};

export const clearCookie = (name: string) => {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${name}=; ${cookieAttributes(0)}`;
};

let refreshPromise: Promise<RefreshResponse | null> | null = null;

const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getCookie("refresh_token");
  if (!refreshToken) {
    return null;
  }

  refreshPromise = fetch(`${apiBaseUrl}/v1/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": createCorrelationId(),
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (response) => {
      const data = (await response.json().catch(() => ({}))) as RefreshResponse;
      if (!response.ok) {
        throw new Error(data.status?.message ?? "Refresh failed");
      }

      const accessToken = data.data?.access_token;
      const newRefreshToken = data.data?.refresh_token;
      if (accessToken) {
        setCookie("access_token", accessToken, data.data?.expires_in);
      }
      if (newRefreshToken) {
        setCookie("refresh_token", newRefreshToken, refreshTokenMaxAgeSeconds);
      }

      return data;
    })
    .catch(() => {
      clearCookie("access_token");
      clearCookie("refresh_token");
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

export const fetchJson = async <T>(
  path: string,
  options: FetchJsonOptions = {}
) => {
  const correlationId = createCorrelationId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Correlation-Id": correlationId,
    ...options.headers,
  };

  if (!("Authorization" in headers)) {
    const accessToken = getCookie("access_token");
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 4001) {
    const refreshed = await refreshAccessToken();
    if (refreshed?.data?.access_token) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${refreshed.data.access_token}`,
        "X-Correlation-Id": createCorrelationId(),
      };
      const retryResponse = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers: retryHeaders,
      });
      const retryData = (await retryResponse
        .json()
        .catch(() => ({}))) as T;
      if (!retryResponse.ok) {
        const message =
          typeof retryData === "object" && retryData && "message" in retryData
            ? String(
                (retryData as { message?: string }).message ?? "Request failed"
              )
            : "Request failed";
        throw new Error(message);
      }
      return retryData;
    }
  }

  const data = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: string }).message ?? "Request failed")
        : "Request failed";
    throw new Error(message);
  }

  return data;
};
