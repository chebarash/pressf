CREATE TABLE "lms_curricula" (
	"work_education_plan_id" text PRIMARY KEY NOT NULL,
	"program_id" text,
	"data" jsonb NOT NULL,
	"learner_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
