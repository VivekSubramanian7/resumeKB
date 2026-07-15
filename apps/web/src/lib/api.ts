let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function headers(): HeadersInit {
  const h: HeadersInit = {};
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

export async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { headers: headers() });
  if (res.status === 204) throw new Error("204");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function upload<T = unknown>(path: string, file: File, fieldName = "audio"): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  const res = await fetch(path, {
    method: "POST",
    headers: headers(),
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
