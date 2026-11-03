CREATE TABLE "exam_seats" (
	"source_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"course_id" text,
	"name" text,
	"day" text NOT NULL,
	"start" text NOT NULL,
	"minutes" integer NOT NULL,
	"room" text,
	"was" text,
	CONSTRAINT "exam_seats_source_id_user_id_code_day_start_pk" PRIMARY KEY("source_id","user_id","code","day","start")
);
--> statement-breakpoint
CREATE TABLE "exam_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"code" text NOT NULL,
	"course_id" text,
	"name" text,
	"day" text NOT NULL,
	"start" text NOT NULL,
	"minutes" integer NOT NULL,
	"rooms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seats" integer
);
--> statement-breakpoint
CREATE TABLE "exam_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"url" text,
	"origin" text NOT NULL,
	"window_key" text NOT NULL,
	"window_name" text NOT NULL,
	"kind" text NOT NULL,
	"starts" text NOT NULL,
	"ends" text NOT NULL,
	"mapping" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"error" text,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text,
	"fetched_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "exam_windows" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"starts" text NOT NULL,
	"ends" text NOT NULL,
	"classes" text DEFAULT 'hide' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_seats" ADD CONSTRAINT "exam_seats_source_id_exam_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."exam_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_seats" ADD CONSTRAINT "exam_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_slots" ADD CONSTRAINT "exam_slots_source_id_exam_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."exam_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sources" ADD CONSTRAINT "exam_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_windows" ADD CONSTRAINT "exam_windows_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_seats_user_idx" ON "exam_seats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exam_slots_day_idx" ON "exam_slots" USING btree ("day");--> statement-breakpoint
CREATE INDEX "exam_slots_code_idx" ON "exam_slots" USING btree ("code");--> statement-breakpoint
CREATE INDEX "exam_slots_source_idx" ON "exam_slots" USING btree ("source_id");