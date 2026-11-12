const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export const getToken = () => localStorage.getItem("linkflow_token");
export const setToken = (token) => localStorage.setItem("linkflow_token", token);
export const removeToken = () => localStorage.removeItem("linkflow_token");

export const getUser = () => {
  try {
    const u = localStorage.getItem("linkflow_user");
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
};
export const setUser = (user) => localStorage.setItem("linkflow_user", JSON.stringify(user));
export const removeUser = () => localStorage.removeItem("linkflow_user");

const request = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }
  return data;
};

export const api = {
  // Auth
  login: async (email, password) => {
    const res = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.accessToken) setToken(res.accessToken);
    if (res.user) setUser(res.user);
    return res;
  },

  register: async (name, email, password) => {
    const res = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    if (res.accessToken) setToken(res.accessToken);
    if (res.user) setUser(res.user);
    return res;
  },

  getMe: async () => {
    return request("/auth/me");
  },

  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    removeToken();
    removeUser();
  },

  // URL Service
  createUrl: async (payload) => {
    return request("/url/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getMyUrls: async () => {
    return request("/url/my-urls");
  },

  getUrlDetails: async (shortCode) => {
    return request(`/url/${shortCode}`);
  },

  deleteUrl: async (shortCode) => {
    return request(`/url/${shortCode}`, { method: "DELETE" });
  },

  // Redirect & Cache Status
  getCacheStatus: async (shortCode) => {
    return request(`/redirect/cache-status/${shortCode}`);
  },

  // Analytics Service
  getAnalytics: async (shortCode) => {
    return request(`/analytics/${shortCode}`);
  },

  getAnalyticsSummary: async () => {
    return request("/analytics/summary");
  },

  // Gateway & Services Health
  getSystemStatus: async () => {
    try {
      const [gw, auth, url, redir, analytics] = await Promise.allSettled([
        fetch(`${API_BASE}/`),
        fetch(`${API_BASE}/auth`),
        fetch(`${API_BASE}/url`),
        fetch(`${API_BASE}/redirect`),
        fetch(`${API_BASE}/analytics`),
      ]);
      return {
        gateway: gw.status === "fulfilled" && gw.value.ok,
        auth: auth.status === "fulfilled" && auth.value.ok,
        url: url.status === "fulfilled" && url.value.ok,
        redirect: redir.status === "fulfilled" && redir.value.ok,
        analytics: analytics.status === "fulfilled" && analytics.value.ok,
      };
    } catch {
      return { gateway: false, auth: false, url: false, redirect: false, analytics: false };
    }
  },
};
