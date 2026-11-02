-- One-off reset before relaunch: wipe test ratings and all files so the site
-- starts clean on LMS data. Runs once (tracked by the migration journal).
-- Faces are kept. Bucket objects are left orphaned (invisible to users).
TRUNCATE "ratings", "respects", "materials", "lms_files" CASCADE;
