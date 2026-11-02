# Rebuild — working rules

The new app is built on the `rebuild` branch and merged to `main` in one cutover.

## Branches and PRs
- Branch from `rebuild`, open the PR **against `rebuild`**, wait for CI (`gh pr checks <n> --watch`), then `gh pr merge <n> --squash --delete-branch`.
- Never commit to `main`. Never mention any AI assistant anywhere (commits, PR text, code, comments): no co-author trailers, no "generated with" lines.
- `npm run typecheck`, `npm run lint`, `npm test` must pass (test Postgres at 127.0.0.1:5544).

## Design is the spec
- Figma file `FmLDCU6LOFiYBhkwelL1B5`, page **10 Redesign** (`4136:1000`). Every screen is a component with a node id (see table below); library components live in the **Redesign components** section and on page **02 Components**.
- Before coding a screen or component, pull its design context and a screenshot from Figma. Match layout, spacing, type, radii, borders and keycap shadows exactly. After coding, screenshot the running page (light and dark) and compare with Figma; fix differences.
- Colours, spacing, radii and type only through `src/ui/tokens.css` (generated from `data/design-tokens.json`): `var(--bg-page)`, `.t-mobile-title`, etc. No raw hex in components.
- Fonts: Instrument Serif (display) and Geologica (body/labels) via `next/font/google`.
- Strong border 1.5px `var(--border-strong)`; keycap shadow `0 3px 0 var(--shadow-key)` (`--shadow-key-md`).

## Shared code — use, don't duplicate
- `src/core/*` pure logic (agenda, semester, attendance, qr, files, ratings, notifications, links, uploads, roles, people, deadlines, grades, time).
- `src/server/*` DB services (ratings, uploads, feed, link tokens, reports, identity/roles, audit).
- `src/lib/lms/*` LMS client, sessions, cache; `src/lib/auth.ts` LMS sign-in; `src/lib/telegram/*` bot and Mini App auth.

## Privacy rules (non-negotiable)
- Professors are never shown with real photos; drawn faces only. Names: given name + surname.
- LMS passwords are never logged or returned. Ratings and reports are pseudonymous (HMAC), admins can't see who rated what or who wrote an Anonymous post.
- LMS files and course details only for signed-in users, enforced on the server.

## Folder ownership (parallel work)
| Area | Owns |
| --- | --- |
| UI kit | `src/ui/components/**`, `src/ui/icons/**`, `src/app/(dev)/kit/**` |
| Shell & platform | `src/app/layout.tsx`, `src/app/(auth)/**`, `src/app/link/**`, `src/platform/**`, `src/ui/shell/**`, removal of the old UI |
| Views & sync | `src/server/views/**`, `src/server/sync/**`, `src/app/api/cron/**` |
| Share & covers | `src/server/covers/**`, `src/app/og/**`, `src/server/og.ts` |
| Bot | `src/lib/telegram/**`, `src/app/api/telegram/**` |
| Screens (later) | `src/app/(app)/**`, `src/app/admin/**` |
