import { env } from "@/lib/env";
import type {
  LmsDepartment,
  LmsEmployeeDetail,
  LmsGradebookData,
  LmsGradebookSemester,
  LmsHomework,
  LmsIepRow,
  LmsNotificationsPayload,
  LmsScheduleDay,
  LmsLessonFull,
  LmsMyList,
  LmsProgram,
  LmsSubject,
  LmsTranscript,
  LmsUser,
} from "@/lib/lms/types";

/**
 * Thin client for the NewUU hero.study LMS. Every data call needs a Bearer
 * token from `login`; the token lasts ~72h, after which the server logs in
 * again from the stored password (see lms/crypto and the credentials store).
 */

export const LMS_API_URL = () => env().LMS_API_URL ?? "https://api.newuzbekistan.hero.study";

/** The LMS wraps errors in `{ error: [...] }` and returns 401 when the token is dead. */
export class LmsError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = "LmsError";
  }
  get expired() {
    return this.status === 401;
  }
}

export type LmsSession = { token: string };

const TIMEOUT_MS = 20_000;

/**
 * The LMS answers in the language the request asks for: without `lang=en` it
 * sends Russian semester names ("Осенний (2023-2024)"), course names and
 * statuses. English is asked for on every call; where the LMS has no English
 * text it still falls back to Russian, so readers keep their own fallbacks.
 */
export function withLang(path: string) {
  if (/[?&]lang=/.test(path)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}lang=en`;
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${LMS_API_URL()}/v1${!rest.method || rest.method === "GET" ? withLang(path) : path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (cause) {
    throw new LmsError(`LMS request failed: ${String(cause)}`, 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) throw new LmsError(`LMS ${res.status} on ${path}`, res.status, body);
  return body as T;
}

/** Sign in with email + password; returns the Bearer token. */
export async function login(email: string, password: string): Promise<LmsSession> {
  const body = await request<{ token?: string; error?: unknown }>("/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The LMS login form names the password field `pass` (not `password`) and
    // keeps a `remember` flag; sending `password` logs no one in.
    body: JSON.stringify({ email, pass: password, remember: true }),
  });
  if (!body?.token) throw new LmsError("LMS login returned no token", 401, body);
  return { token: body.token };
}

export const currentUser = (s: LmsSession) =>
  request<LmsUser>("/users/current", { token: s.token });

export const myList = (s: LmsSession) =>
  request<LmsMyList>("/subject/my-list", { token: s.token });

/** All departments (the school/faculty hierarchy, via parent_id). */
export const departments = (s: LmsSession) =>
  request<LmsDepartment[]>("/education-program/department", { token: s.token });

/** All education programs. */
export const programs = (s: LmsSession) =>
  request<{ educationPrograms?: LmsProgram[] }>("/education-program/list", { token: s.token })
    .then((b) => b.educationPrograms ?? []);

/** The signed-in student's individual education plan, one row per semester. */
export const individualPlan = (s: LmsSession) =>
  request<LmsIepRow[]>("/individual-education-plan/my", { token: s.token });

/** The student's schedule between two unix timestamps, grouped by day. */
export const scheduleList = (s: LmsSession, beginTime: number, endTime: number) =>
  request<LmsScheduleDay[]>(`/schedule/list?beginTime=${beginTime}&endTime=${endTime}`, { token: s.token });

/** `/subject/get-by-id` returns an array of one; any university course id works. */
export async function subject(s: LmsSession, subjectId: string | number): Promise<LmsSubject | null> {
  const rows = await request<LmsSubject[]>(`/subject/get-by-id?id=${subjectId}`, { token: s.token });
  return rows?.[0] ?? null;
}

/** `/employee/get-by-id` returns a rich teacher profile, directly or as an array of one. */
export async function employee(s: LmsSession, id: string | number): Promise<LmsEmployeeDetail | null> {
  const body = await request<LmsEmployeeDetail | LmsEmployeeDetail[]>(`/employee/get-by-id?id=${id}`, { token: s.token });
  return (Array.isArray(body) ? body[0] : body) ?? null;
}

export const lesson = (s: LmsSession, lessonId: string | number) =>
  request<LmsLessonFull>(`/lesson/get-by-id?id=${lessonId}`, { token: s.token });

/** Transcript header: GPA and ECTS totals (no per-subject grades; those come from the gradebook). */
export const transcript = (s: LmsSession) =>
  request<{ transcript?: LmsTranscript } & Partial<LmsTranscript>>("/transcript/learner", { token: s.token });

/** The student's gradebook, one row per semester enrolled. */
export const gradebookSemesters = (s: LmsSession) =>
  request<LmsGradebookSemester[]>("/gradebook/semesters-list", { token: s.token });

/** Per-semester grades, keyed by subject id, including the final mark. */
export const gradebookData = (s: LmsSession, semesterId: string | number) =>
  request<LmsGradebookData>(`/gradebook/gradebook-data?semester_id=${semesterId}`, { token: s.token });

/** LMS bell: announcements, informers and system notes in one payload. */
export const notifications = (s: LmsSession) =>
  request<LmsNotificationsPayload>("/notification/get-notification", { token: s.token });

export const notificationCount = (s: LmsSession) =>
  request<{ count?: number | string } | number>("/notification/count", { token: s.token });

/** Mark read in the LMS too, so the student never sees it twice. */
export const markNotificationRead = (s: LmsSession, id: string | number) =>
  request<unknown>("/notification/change-read", {
    token: s.token, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
  });

/** "Got it" on announcements the LMS asks the student to acknowledge. */
export const acknowledgeNotification = (s: LmsSession, id: string | number) =>
  request<unknown>("/notification/change-acquainted", {
    token: s.token, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
  });

/** Assignments with deadline and status. */
export const homework = (s: LmsSession, page = 1, limit = 50) =>
  request<{ data?: LmsHomework[] }>(`/homework/list?page=${page}&limit=${limit}`, { token: s.token }).then((b) => b.data ?? []);

/** Semester phases (cohort selection, schedule builder, studies, add/drop) with dates. */
export const semesterCalendar = (s: LmsSession, semesterId: string | number) =>
  request<unknown>(`/semester/calendar?semester_id=${semesterId}`, { token: s.token });

/** Every semester the LMS knows, with its name ("Fall 2023"). */
export const semesterList = (s: LmsSession) =>
  request<unknown>("/semester/semester-list", { token: s.token });

/**
 * Activate a classroom QR code for the signed-in student. Returns the HTTP
 * status with the body, because 404 (unknown code) is an answer, not a failure.
 */
export async function activateQr(s: LmsSession, token: string): Promise<{ status: number; body: unknown }> {
  try {
    const body = await request<unknown>(`/q-r/code-active?url=${encodeURIComponent(token)}`, { token: s.token });
    return { status: 200, body };
  } catch (e) {
    if (e instanceof LmsError && e.status > 0 && e.status !== 401) return { status: e.status, body: e.body };
    throw e;
  }
}

/** Download a lesson material's bytes. `fileFullUrl` already starts with `/v1`. */
export async function downloadFile(s: LmsSession, fileFullUrl: string): Promise<{ bytes: Buffer; contentType: string }> {
  const url = fileFullUrl.startsWith("http") ? fileFullUrl : `${LMS_API_URL()}${fileFullUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 3);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (!res.ok) throw new LmsError(`LMS file ${res.status}`, res.status);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  } finally {
    clearTimeout(timer);
  }
}
