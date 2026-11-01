CREATE TABLE "term_courses" (
	"program" text NOT NULL,
	"year" integer NOT NULL,
	"term" text NOT NULL,
	"courses" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_courses_program_year_term_pk" PRIMARY KEY("program","year","term")
);
