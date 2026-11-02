CREATE TABLE "bot_chats" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"draft" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_files" (
	"key" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_chats" ADD CONSTRAINT "bot_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_chats_updated" ON "bot_chats" USING btree ("updated_at");