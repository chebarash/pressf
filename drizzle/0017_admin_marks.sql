CREATE TABLE "admin_marks" (
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"until" timestamp with time zone,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_marks_kind_target_pk" PRIMARY KEY("kind","target")
);
--> statement-breakpoint
CREATE TABLE "file_overrides" (
	"file_id" text PRIMARY KEY NOT NULL,
	"title" text,
	"type" text,
	"week" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_marks" ADD CONSTRAINT "admin_marks_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_overrides" ADD CONSTRAINT "file_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;