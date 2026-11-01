DROP INDEX "ratings_user_teacher";--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_user_teacher_course" ON "ratings" USING btree ("user_id","teacher_id","course_code");