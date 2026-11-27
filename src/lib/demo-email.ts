/** Demo sign-in emails, derived from each person's name: ishita.rao@gef.demo, riya.kapoor@campusfest.demo. */
export const DEMO_DOMAIN: Record<string, string> = { gef: "gef.demo", campusfest: "campusfest.demo" };

export function demoEmail(name: string, ds: string): string {
  const local = name.toLowerCase().replace(/\(.*?\)/g, "").trim().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${local}@${DEMO_DOMAIN[ds] || `${ds}.demo`}`;
}

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}
