-- Syllabi pulled from a course's own LMS page belong to that course: show the ones
-- earlier kept hidden because their printed code or title did not match exactly.
UPDATE "syllabi" SET "matched" = true WHERE "matched" = false AND "material_id" IS NULL;
