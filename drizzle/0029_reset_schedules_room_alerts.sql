-- Rooms gained their building ("306" → "MATH 306"), which the sync read as room
-- changes: drop those false "Room changed" notifications, and clear every
-- student's stored schedule so the next sync loads it from the LMS afresh.
DELETE FROM "feed_items" WHERE "id" LIKE 'room:%' AND "at" >= '2026-11-03T00:00:00Z';--> statement-breakpoint
UPDATE "user_state"
SET "snapshot" = jsonb_set(jsonb_set("snapshot", '{lms,schedule}', '[]'::jsonb), '{lms,scheduleWindow}', 'null'::jsonb)
WHERE "snapshot" ? 'lms';--> statement-breakpoint
-- The weekly pattern is rebuilt by the next sync (an old cache time forces it).
UPDATE "lms_cache"
SET "data" = jsonb_set("data", '{timetable}', '[]'::jsonb), "synced_at" = now() - interval '7 days';
