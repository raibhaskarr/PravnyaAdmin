// Same request()/ApiError shape as the admin frontend's own api/client.ts (same repo, same
// backend's error format: {error: {message, code}}) -- not shared code, this app is built from
// scratch, but there's no reason to invent a different convention for talking to the same API.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:4011" : "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: { token?: string; method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message ?? "Something went wrong");
  }
  return data as T;
}

export type ParentProfile = {
  id: string;
  email: string;
  name: string | null;
  kids?: { id: string; firstName: string; lastName: string; dob: string | null; gender: string | null }[];
};

export const api = {
  sendVerificationCode(email: string) {
    return request<{ sent: boolean }>("/parent-auth/send-verification-code", { method: "POST", body: { email } });
  },
  register(input: { email: string; password: string; name: string; verificationCode: string; consent: true }) {
    return request<{ token: string; parent: ParentProfile }>("/parent-auth/register", { method: "POST", body: input });
  },
  login(email: string, password: string) {
    return request<{ token: string; parent: ParentProfile }>("/parent-auth/login", { method: "POST", body: { email, password } });
  },
  me(token: string) {
    return request<ParentProfile>("/parent-auth/me", { token });
  },
  createFirstKid(token: string, input: { name: string; dob: string; gender?: string }) {
    return request<{ id: string; firstName: string; lastName: string; dob: string | null; gender: string | null }>("/parent-kids", {
      token,
      method: "POST",
      body: input
    });
  }
};
