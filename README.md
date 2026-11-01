# Press F

Student guide to New Uzbekistan University: courses, teachers, files, timetables.
Next.js on Railway with Postgres and S3-compatible storage.

## Data

- Teachers, courses, timetable, groups, schools and curricula come from the
  `anonymous` bot API (`docs/BOT_API_REQUEST.md`) and are never edited here.
- `POST /api/cron/sync` copies them into `catalog_cache` daily. The site reads only
  its own database, so it opens when the bot is down.
- Ratings hang on teacher ids. Sync moves them when `previous_ids` changes an id, and
  old `/professors/{id}` links redirect through `teacher_aliases`.
- Syllabi are read automatically (`src/lib/syllabus.ts`). A syllabus shows only when both
  code and title match the catalog; the rest waits in `/admin`.
- `data/academic-calendar-2026-2027.json` drives week numbers and hints. Replace it yearly.

## Run

    cp .env.example .env
    npm install
    npm run db:migrate
    npx tsx scripts/sync.ts
    npx tsx scripts/seed-syllabi.ts
    npm run dev

## Deploy on Railway

1. Add Postgres and a bucket, set the variables from `.env.example`.
2. Add a cron service that calls `/api/cron/sync` with `Authorization: Bearer $CRON_SECRET`.
3. Run `npx tsx scripts/files-bot-setup.ts https://pressf.chebarash.uz`.
