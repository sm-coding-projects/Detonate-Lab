import type { Analysis, AnalysisSummary, AuthConfig, User } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)dl_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const headers = new Headers(opts.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("x-csrf-token", csrfToken());
  }
  const res = await fetch(`/api${path}`, {
    ...opts,
    method,
    headers,
    credentials: "include",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const detail = (data && (data.detail ?? data.message)) || res.statusText;
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Request failed");
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const api = {
  // Auth
  authConfig: () => request<AuthConfig>("/auth/config"),
  me: () => request<User>("/auth/me"),
  login: (email: string, password: string) => postJson<User>("/auth/login", { email, password }),
  register: (email: string, password: string) => postJson<User>("/auth/register", { email, password }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // Analyses
  list: () => request<AnalysisSummary[]>("/analyses"),
  get: (id: string) => request<Analysis>(`/analyses/${id}`),
  submitUrl: (url: string) => postJson<Analysis>("/analyses/url", { url }),
  submitFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Analysis>("/analyses/file", { method: "POST", body: form });
  },
  remove: (id: string) => request<void>(`/analyses/${id}`, { method: "DELETE" }),
};
