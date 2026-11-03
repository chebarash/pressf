CREATE TABLE "faculty_people" (
	"site_id" integer PRIMARY KEY NOT NULL,
	"site_department_id" integer,
	"name" text NOT NULL,
	"position" text,
	"department" text,
	"school" text,
	"office" text,
	"email" text,
	"teacher_id" text,
	"match" text DEFAULT 'none' NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_overrides" (
	"teacher_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"position" text,
	"department" text,
	"school" text,
	"office" text,
	"email" text,
	"hours" text,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teacher_overrides" ADD CONSTRAINT "teacher_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faculty_people_teacher" ON "faculty_people" USING btree ("teacher_id");