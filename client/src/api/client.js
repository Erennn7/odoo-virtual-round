import axios from 'axios';

/**
 * Central API client. Attaches the JWT, normalizes errors into
 * { message, details } so every caller handles failures the same way,
 * and force-logs-out on 401.
 */
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

export const TOKEN_KEY = 'assetflow_token';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/')) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    }
    const normalized = new Error(err.response?.data?.message || 'Network error. Please try again.');
    normalized.details = err.response?.data?.details;
    normalized.status = err.response?.status;
    return Promise.reject(normalized);
  }
);
