import type { HostState, PublicState } from './types';

const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function freshPath(path: string, method: string): string {
  if (method !== 'GET') return path;
  const stamp = `_=${Date.now()}`;
  return path.includes('?') ? `${path}&${stamp}` : `${path}?${stamp}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const method = (options.method ?? 'GET').toUpperCase();
  const timeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(20000)
    : undefined;
  const response = await fetch(`${base}${freshPath(path, method)}`, {
    ...options,
    headers,
    cache: 'no-store',
    signal: options.signal ?? timeout,
  });
  const data = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) {
    throw new ApiError(response.status, typeof data.error === 'string' ? data.error : 'Не вышло.');
  }
  return data as T;
}

export function fetchState(playerId?: string) {
  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
  return request<PublicState>(`/api/state${query}`);
}

export function readyCard(body: { id: string; name: string }) {
  return request<{ ok: true; state: PublicState }>('/api/ready', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function saveCard(body: { id: string; name: string; cells: string[] }) {
  return request<{ ok: true; state: PublicState }>('/api/card', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function hostHeaders(pin: string): HeadersInit {
  return { 'x-host-pin': encodeURIComponent(pin) };
}

export function fetchHost(pin: string) {
  return request<HostState>('/api/host', { headers: hostHeaders(pin) });
}

export function hostAction(pin: string, path: string, body?: unknown) {
  return request<{ ok: true; state: HostState; message?: string; count?: number }>(path, {
    method: 'POST',
    headers: hostHeaders(pin),
    body: body === undefined ? '{}' : JSON.stringify(body),
  });
}
