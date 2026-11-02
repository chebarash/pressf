/**
 * Press F core: the logic shared by the Telegram Mini App, the desktop site,
 * the bot and the admin. Pure functions only — no React, no database, no fetch —
 * so every front end computes the same thing the same way.
 */
export * as agenda from "./agenda";
export * as attendance from "./attendance";
export * as deadlines from "./deadlines";
export * as files from "./files";
export * as grades from "./grades";
export * as links from "./links";
export * as notifications from "./notifications";
export * as people from "./people";
export * as qr from "./qr";
export * as ratings from "./ratings";
export * as roles from "./roles";
export * as semester from "./semester";
export * as time from "./time";
export * as uploads from "./uploads";
