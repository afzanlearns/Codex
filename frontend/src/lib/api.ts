const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken(): string | null {
  return localStorage.getItem('codex_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    register: (body: { name: string; email: string; password: string }) =>
      request<{ token: string; user: unknown }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<{ token: string; user: unknown }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => request<unknown>('/auth/me'),
  },
  playground: {
    review: (body: { code: string; language: string; rules?: string[] }) =>
      request<import('../types').Review>('/playground/review', { method: 'POST', body: JSON.stringify(body) }),
  },
  developers: {
    get: (id: number) => request<import('../types').User>(`/developers/${id}`),
    analytics: (id: number) => request<import('../types').DeveloperAnalytics>(`/developers/${id}/analytics`),
    snapshots: (id: number) => request<unknown[]>(`/developers/${id}/snapshots`),
  },
  teams: {
    leaderboard: (id: number) => request<import('../types').LeaderboardEntry[]>(`/teams/${id}/leaderboard`),
    analytics: (id: number, start?: string, end?: string) =>
      request<unknown[]>(`/teams/${id}/analytics?${start ? `start=${start}&` : ''}${end ? `end=${end}` : ''}`),
    report: (id: number) => request<unknown>(`/teams/${id}/report`),
    digest: (id: number) => request<{ digest: string; report: unknown }>(`/teams/${id}/digest`),
    alerts: (id: number) => request<unknown[]>(`/teams/${id}/alerts`),
    create: (body: { name: string }) => request<unknown>('/teams', { method: 'POST', body: JSON.stringify(body) }),
  },
};
