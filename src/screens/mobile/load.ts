import * as views from "@/server/views";
import { courseDemo, coursesDemo, fileDemo, nextDemo, rateDemo, timetableDemo, uploadsDemo } from "./demo-b";
import type { RateScreen } from "./views";

/**
 * Route helpers for the Mobile B pages. Each page loads one view model from
 * src/server/views. Outside production, `?demo=<state>` swaps in a demo view
 * model of the same shape so every Figma state can be previewed and compared.
 */

type Query = Record<string, string | string[] | undefined>;

export function demoOf(q: Query) {
  if (process.env.NODE_ENV === "production") return undefined;
  const d = q.demo;
  return typeof d === "string" && /^[a-z]{1,16}$/.test(d) ? d : undefined;
}

export const demo = {
  timetable: timetableDemo,
  courses: coursesDemo,
  course: courseDemo,
  file: fileDemo,
  rate: rateDemo,
  next: nextDemo,
  uploads: uploadsDemo,
};

/**
 * The rate screen: the queue, plus the sheet for /rate/[courseId]. Only a
 * course from the student's own queue (waiting or rated) can be opened, so the
 * same lookup guards the server action.
 */
export function rateScreen(queue: views.RateQueueView, courseId?: string, from?: string): RateScreen {
  if (!courseId) return { ...queue, open: null };
  const waiting = queue.waiting.find((w) => w.courseId === courseId);
  const rated = queue.rated.find((r) => r.courseId === courseId && r.canEdit);
  const item = waiting ?? rated;
  if (!item) return { ...queue, open: null };
  const course = from && /^\/c\/[A-Za-z0-9]{1,16}$/.test(from) ? from : null;
  return { ...queue, open: { item, draft: null, mode: waiting && !course ? "queue" : "single", returnHref: course ?? "/rate" } };
}

export const loadRate = async (userId: string, courseId?: string, from?: string) => {
  const queue = await views.rateQueue(userId);
  return queue ? rateScreen(queue, courseId, from) : null;
};
