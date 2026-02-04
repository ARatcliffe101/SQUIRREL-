import axios from 'axios';

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8787') as string;
const KEY = 'pv_api_base';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function getApiBase(): string {
  return localStorage.getItem(KEY) || DEFAULT_BASE;
}

export function setApiBase(base: string) {
  localStorage.setItem(KEY, base);
}

export function setTokens(a: string, r: string) {
  accessToken = a;
  refreshToken = r;
  localStorage.setItem('pv_access', a);
  localStorage.setItem('pv_refresh', r);
}

export function loadTokens() {
  accessToken = localStorage.getItem('pv_access');
  refreshToken = localStorage.getItem('pv_refresh');
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('pv_access');
  localStorage.removeItem('pv_refresh');
}

const client = axios.create();

client.interceptors.request.use((config) => {
  config.baseURL = getApiBase();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

client.interceptors.response.use(undefined, async (error) => {
  if (error?.response?.status === 401 && refreshToken) {
    try {
      const res = await axios.post(`${getApiBase()}/auth/refresh`, { refreshToken });
      accessToken = res.data.accessToken;
      localStorage.setItem('pv_access', accessToken!);
      error.config.headers.Authorization = `Bearer ${accessToken}`;
      return axios.request(error.config);
    } catch {
      clearTokens();
    }
  }
  return Promise.reject(error);
});

export const api = {
  async health() {
    const res = await axios.get(`${getApiBase()}/health`);
    return res.data as any;
  },
  async config() {
    const res = await axios.get(`${getApiBase()}/config`);
    return res.data as any;
  },
  async login(email: string, password: string) {
    const res = await client.post('/auth/login', { email, password });
    return res.data as { accessToken: string; refreshToken: string; user: any };
  },
  async me() {
    const res = await client.get('/me');
    return res.data.user as any;
  },
  async categories() {
    const res = await client.get('/categories');
    return res.data.categories as any[];
  },
  async entries(params: any) {
    const res = await client.get('/entries', { params });
    return res.data.entries as any[];
  },
  async createEntry(payload: any) {
    const res = await client.post('/entries', payload);
    return res.data as { id: string };
  },
  async updateEntry(id: string, payload: any) {
    const res = await client.patch(`/entries/${id}`, payload);
    return res.data;
  },
  async deleteEntry(id: string) {
    const res = await client.delete(`/entries/${id}`);
    return res.data;
  },
  async restoreEntry(id: string) {
    const res = await client.post(`/entries/${id}/restore`);
    return res.data;
  },
  async hardDeleteEntry(id: string) {
    const res = await client.delete(`/entries/${id}/hard`);
    return res.data;
  },
};
