export function localHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = process.env.OOMOL_CONNECT_RUNTIME_TOKEN;
  if (!token) {
    return headers;
  }

  return {
    ...headers,
    authorization: `Bearer ${token}`,
  };
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} failed with HTTP ${response.status}: ${text}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}
