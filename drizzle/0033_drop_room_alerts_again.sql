-- 0030 ran while the previous deployment was still syncing with the old room
-- comparison, so the false "Room changed" alerts came back. Remove them again
-- (and any still queued for the bot), and clear stored schedules once more; the
-- running code no longer treats "306" → "MATH 306" as a move.
DELETE FROM "feed_items" WHERE "id" LIKE 'room:%' AND "at" >= '2026-11-01T00:00:00Z';--> statement-breakpoint
UPDATE "user_state"
SET "snapshot" = jsonb_set("snapshot", '{pending}', coalesce((SELECT jsonb_agg(p) FROM jsonb_array_elements("snapshot"->'pending') p WHERE NOT (p->>'id' LIKE 'room:%')), '[]'::jsonb))
WHERE jsonb_typeof("snapshot"->'pending') = 'array';--> statement-breakpoint
UPDATE "user_state"
SET "snapshot" = jsonb_set(jsonb_set("snapshot", '{lms,schedule}', '[]'::jsonb), '{lms,scheduleWindow}', 'null'::jsonb)
WHERE "snapshot" ? 'lms';
