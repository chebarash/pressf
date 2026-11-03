-- The site reads only the LMS now: the old bot catalog and its tables go.
DROP TABLE IF EXISTS "catalog_cache" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "materials" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "ratings" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "respects" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "term_courses" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."material_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."material_status";--> statement-breakpoint
-- Faces that belong to no LMS professor (old catalog ids nobody matched).
DELETE FROM "faces" WHERE "teacher_id" NOT IN (SELECT "id" FROM "lms_teachers") AND EXISTS (SELECT 1 FROM "lms_teachers");
