/**
 * Classroom QR codes. A code is a link to the LMS:
 *   https://api.newuzbekistan.hero.study/v1/q-r/code-active?url=<base64>
 * The base64 decodes to <digits><~32-char key><10-digit unix time of creation>.
 * We accept only that host and path, and call it with the student's session.
 */

export const QR_HOST = "api.newuzbekistan.hero.study";
export const QR_PATH = "/v1/q-r/code-active";

export type QrPayload = { id: string; key: string; createdAt: Date; raw: string };
export type QrParse = { ok: true; url: string; token: string; payload: QrPayload | null } | { ok: false; reason: "not-a-link" | "wrong-site" | "no-code" };

const b64 = (s: string) => {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  // atob works in browsers (the Mini App parses scans locally) and in Node.
  return atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
};

/** Splits the decoded code: leading digits (id), the random key, a 10-digit creation time. */
export function decodePayload(token: string): QrPayload | null {
  let raw: string;
  try {
    raw = b64(token);
  } catch {
    return null;
  }
  // The key is 31–32 random characters; the id is the leading digits.
  const m = raw.match(/^(\d+)([A-Za-z_-][A-Za-z0-9_-]{15,63})(\d{10})$/);
  if (!m) return null;
  return { id: m[1], key: m[2], createdAt: new Date(Number(m[3]) * 1000), raw };
}

export function parseQr(text: string): QrParse {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { ok: false, reason: "not-a-link" };
  }
  if (url.protocol !== "https:" || url.hostname !== QR_HOST || url.pathname !== QR_PATH) return { ok: false, reason: "wrong-site" };
  const token = url.searchParams.get("url");
  if (!token) return { ok: false, reason: "no-code" };
  return { ok: true, url: url.toString(), token, payload: decodePayload(token) };
}

export type QrOutcome =
  | { kind: "marked"; subject?: string; time?: string }
  | { kind: "expired" }
  | { kind: "not-your-class"; subject?: string }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

type LmsQrResponse = { result?: string; data?: { subject?: string; time?: string; begin_time?: string; status?: string | number }; error?: unknown };

/** Interprets the LMS reply. `status` 404 means an unknown code. */
export function qrOutcome(status: number, body: LmsQrResponse | null | undefined): QrOutcome {
  if (status === 404) return { kind: "not-found" };
  if (status >= 400 || !body) return { kind: "error", message: `LMS ${status}` };
  if (body.result === "success") return { kind: "marked", subject: body.data?.subject, time: body.data?.time ?? body.data?.begin_time };
  // A failed answer with class data means the code belongs to a class the student is not in.
  if (body.data?.subject) return { kind: "not-your-class", subject: body.data.subject };
  return { kind: "expired" };
}

/** Offline scans are kept and retried while the code is plausibly still valid. */
export const QR_RETRY_WINDOW_MS = 2 * 60_000;
export const shouldRetry = (scannedAt: Date, now: Date) => now.getTime() - scannedAt.getTime() < QR_RETRY_WINDOW_MS;
