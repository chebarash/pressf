-- Hours a week outside class now has four buckets ("0-2", "2-5", "5-10", "10+").
-- Earlier five-bucket answers are moved to the bucket holding their midpoint.
UPDATE "course_ratings" SET "hours" = '2-5' WHERE "hours" IN ('2-4', '4-6');--> statement-breakpoint
UPDATE "course_ratings" SET "hours" = '5-10' WHERE "hours" = '6-10';--> statement-breakpoint
UPDATE "course_ratings" SET "hours" = NULL WHERE "hours" IS NOT NULL AND "hours" NOT IN ('0-2', '2-5', '5-10', '10+');
