-- calendar_feeds.layers is now the Google Calendar feed's own setting ("In Google Calendar"), no longer the
-- site calendar's chips. Those chips started with Classes off, so a stored choice without "classes" was not
-- a decision about the feed: add it back (the feed's default is every layer, classes included).
UPDATE "calendar_feeds" SET "layers" = "layers" || '["classes"]'::jsonb, "updated_at" = now()
WHERE "layers" IS NOT NULL AND jsonb_typeof("layers") = 'array' AND NOT ("layers" ? 'classes');
