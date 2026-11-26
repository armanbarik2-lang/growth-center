export function inr(v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const a = Math.abs(v);
  if (a >= 10000000) return `₹${(v / 10000000).toFixed(digits ?? 2)} Cr`;
  if (a >= 100000) return `₹${(v / 100000).toFixed(digits ?? (a >= 1000000 ? 1 : 2))}L`;
  if (a >= 1000) return `₹${(v / 1000).toFixed(digits ?? 0)}K`;
  return `₹${Math.round(v)}`;
}
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(d)}%`);
export const fdate = (s: string | null | undefined) => {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
};
export const fdt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export async function api<T = unknown>(url: string, opts?: RequestInit & { body?: string }): Promise<T> {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}

export const istDay = (iso: string) => new Date(Date.parse(iso) + 19800000).toISOString().slice(0, 10);
