CREATE TYPE "public"."recommend" AS ENUM('yes', 'unsure', 'no');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'hidden', 'kept');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('waiting', 'live', 'rejected', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."upload_trust" AS ENUM('normal', 'trusted', 'paused');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text NOT NULL,
	"button" jsonb,
	"banner_until" timestamp with time zone,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rater" text NOT NULL,
	"course_id" text NOT NULL,
	"course_code" text,
	"term" text NOT NULL,
	"recommend" "recommend" NOT NULL,
	"hours" text,
	"difficulty" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"course_id" text,
	"href" text,
	"at" timestamp with time zone NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"needs_ack" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "feed_items_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "link_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rating_asks" (
	"user_id" uuid NOT NULL,
	"term" text NOT NULL,
	"dismissals" integer DEFAULT 0 NOT NULL,
	"last_dismissed_at" timestamp with time zone,
	CONSTRAINT "rating_asks_user_id_term_pk" PRIMARY KEY("user_id","term")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"reporter" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_ratings" (
	"rating_id" uuid NOT NULL,
	"teacher_id" text NOT NULL,
	"role" text NOT NULL,
	"press_f" boolean,
	"tags" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "teacher_ratings_rating_id_teacher_id_role_pk" PRIMARY KEY("rating_id","teacher_id","role")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploader_id" uuid,
	"course_id" text NOT NULL,
	"course_code" text,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"exam" text,
	"term" text,
	"week" integer,
	"show_name" boolean DEFAULT false NOT NULL,
	"status" "upload_status" DEFAULT 'waiting' NOT NULL,
	"reject_reason" text,
	"reject_note" text,
	"checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text,
	"telegram_file_id" text,
	"opens" integer DEFAULT 0 NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "role" DEFAULT 'student' NOT NULL,
	"manual_trust" "upload_trust",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"alerts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_tokens" ADD CONSTRAINT "link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_asks" ADD CONSTRAINT "rating_asks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_ratings" ADD CONSTRAINT "teacher_ratings_rating_id_course_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."course_ratings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_state" ADD CONSTRAINT "user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_recent" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_ratings_once" ON "course_ratings" USING btree ("rater","course_id","term");--> statement-breakpoint
CREATE INDEX "course_ratings_course" ON "course_ratings" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "feed_items_recent" ON "feed_items" USING btree ("user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_once" ON "reports" USING btree ("target_kind","target_id","reporter");--> statement-breakpoint
CREATE INDEX "reports_open" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "teacher_ratings_teacher" ON "teacher_ratings" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "uploads_queue" ON "uploads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "uploads_course" ON "uploads" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "uploads_uploader" ON "uploads" USING btree ("uploader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_sha" ON "uploads" USING btree ("sha256","course_id");