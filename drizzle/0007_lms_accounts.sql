CREATE TYPE "public"."lms_account_status" AS ENUM('active', 'invalid');--> statement-breakpoint
CREATE TABLE "lms_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lms_user_id" text,
	"sealed_password" text NOT NULL,
	"token" text,
	"token_expires_at" timestamp with time zone,
	"status" "lms_account_status" DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lms_accounts" ADD CONSTRAINT "lms_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;