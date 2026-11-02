CREATE INDEX "course_ratings_code" ON "course_ratings" USING btree ("course_code");--> statement-breakpoint
CREATE INDEX "lms_files_course" ON "lms_files" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "lms_files_lesson" ON "lms_files" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "uploads_course_code" ON "uploads" USING btree ("course_code","status");