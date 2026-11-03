-- Accounts left from the old version (Google sign-in) that never signed in with
-- the LMS: created before the switch-over, with no LMS account, no LMS profile,
-- no sync data and no admin role. Someone who signed out keeps their profile and
-- sync data, so they are not touched. Ratings hold no user id (pseudonyms).
DELETE FROM "users" u
WHERE u."created_at" < '2026-11-03T08:14:39Z'
  AND NOT EXISTS (SELECT 1 FROM "lms_accounts" a WHERE a."user_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "lms_cache" c WHERE c."user_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "user_state" s WHERE s."user_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "user_roles" r WHERE r."user_id" = u."id");
