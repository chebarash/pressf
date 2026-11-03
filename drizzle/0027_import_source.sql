ALTER TABLE "uploads" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "source_label" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_source_key" ON "uploads" USING btree ("source_key");