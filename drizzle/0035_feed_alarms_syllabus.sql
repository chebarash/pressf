ALTER TABLE "calendar_feeds" ADD COLUMN "alarms" jsonb;--> statement-breakpoint
-- The feed's new "Syllabus quizzes" layer is on by default: a stored choice made before it existed was not a
-- decision about it, so add it (as 0032 did for "classes").
UPDATE "calendar_feeds" SET "layers" = "layers" || '["syllabus"]'::jsonb, "updated_at" = now()
WHERE "layers" IS NOT NULL AND jsonb_typeof("layers") = 'array' AND NOT ("layers" ? 'syllabus');
