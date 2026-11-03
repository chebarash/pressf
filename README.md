# Press F

Student app for New Uzbekistan University, in Telegram and on desktop: timetable,
courses, files, grades, ratings and professors. It wraps the university LMS
(hero.study). Next.js on Railway with Postgres and S3-compatible storage.

## Data

- Students sign in with their LMS email and password (`src/lib/auth.ts`). The password
  is sealed with `CREDENTIAL_KEY` so background sync keeps working; it is never logged.
- Courses, teachers, departments, programs and lesson files are harvested from the LMS
  into the `lms_*` tables (`src/lib/lms`). Pages read Postgres only, never the LMS.
- Ratings live in `course_ratings` and `teacher_ratings`; student files in `uploads`.
- Posts from the Anonymous channel that mention a course or professor come from the
  channel bot's API (`docs/BOT_API_REQUEST.md`, `src/lib/mentions.ts`).
- Syllabi found in LMS files or channel imports are queued (admin System page) and
  parsed by the operator: `railway run npx tsx scripts/syllabus-queue.ts <dir> --download`
  saves the queue and files, `railway run npx tsx scripts/syllabus-submit.ts <json-file>`
  sends the parsed fields (`SyllabusSubmitSchema` in `src/lib/syllabus.ts`). The site
  calls no hosted model.
- `data/academic-calendar-2026-2027.json` feeds `/calendar.ics`. Replace it yearly.

## Scheduled jobs (GitHub Actions)

| Workflow | Calls | When |
| --- | --- | --- |
| `harvest.yml` | `POST /api/cron/harvest` | Mondays 03:00 UTC |
| `students.yml` | `POST /api/cron/reminders`, `POST /api/cron/students` | every 5 minutes |
| `sync.yml` | `POST /api/cron/sync` (Anonymous posts, while `MENTIONS_SYNC=on`) | 02:30 UTC |

Each sends `Authorization: Bearer $CRON_SECRET`; set the `CRON_SECRET` secret and the
`SITE_URL` variable on GitHub.

## Run

    cp .env.example .env
    npm install
    npm run db:migrate
    npm run dev

`DEV_LOGIN_EMAIL` signs every local request in as that student. The UI kit (`/kit`) and
screen previews (`/screens/*`) exist only in development.

Tests need a Postgres at `127.0.0.1:5544` (or `TEST_DATABASE_URL`): `npm test`.

Scripts: `scripts/lms-harvest.ts` (harvest by hand), `scripts/lms-seed.ts` (save the
harvest account), `scripts/sync.ts` (the nightly sync by hand), `scripts/faces-export.ts`,
`npm run tokens` (design tokens to CSS).

## Deploy on Railway

1. Add Postgres and a bucket, set the variables from `.env.example`.
2. Point the bot's webhook at the site:
   `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://pressf.chebarash.uz/api/telegram/files&secret_token=<TELEGRAM_WEBHOOK_SECRET>`
