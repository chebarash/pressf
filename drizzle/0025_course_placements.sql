CREATE TABLE "course_placements" (
	"course_code" text PRIMARY KEY NOT NULL,
	"school" text NOT NULL,
	"department" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_placements" ADD CONSTRAINT "course_placements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;