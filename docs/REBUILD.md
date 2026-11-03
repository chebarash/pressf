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
- Base library components (Button, Keycap, Chip, Score… on page 02) keep their own Figma values: Button cap 2px border + `0 5px` shadow, Chip 2px + `0 3px`, Score M 2px + `0 5px`. Redesign-built cards and containers (CourseCard, FileRow, FeedItem, RatingSummary, sheets, panels) use 1.5px `var(--border-strong)` + `0 3px 0 var(--shadow-key)`. When unsure, measure the instance in Figma.

## Shared code — use, don't duplicate
- `src/core/*` pure logic (agenda, semester, attendance, qr, files, ratings, notifications, links, uploads, roles, people, deadlines, grades, time).
- `src/server/*` DB services (ratings, uploads, feed, link tokens, reports, identity/roles, audit).
- `src/lib/lms/*` LMS client, sessions, cache; `src/lib/auth.ts` LMS sign-in; `src/lib/telegram/*` bot and Mini App auth.

## Privacy rules (non-negotiable)
- Professors are never shown with real photos; drawn faces only. Names: given name + surname.
- Drawn faces come from the face constructor (`src/core/face-parts.ts`: a FaceSpec of parts → SVG) or an uploaded line drawing. The constructor follows the Notion Faces look and assembly (layered parts on anchors measured from the head shape: back hair → ears → head → details → beard → nose, mouth → eyes, brows → front hair → glasses → accessories), but every part is original artwork authored in code, not taken from Notion. Saved specs stay valid: renamed options are mapped in `LEGACY_OPTIONS` and parts added later take defaults. An admin may pick a professor's photo once, in "From a photo", to choose the constructor parts: the photo is read in memory for that request only and is **never stored** (not in the bucket, the DB, logs or caches), and it is only described by a vision model (parts only: hair, facial hair, glasses, head covering, face shape, expression; never identity, ethnicity or age), never sent to an image-generation service. Only the resulting drawing (and its FaceSpec) is saved.
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

## Speed rules (every agent)
Goal: every screen opens instantly. Budgets: server response ≤ 150 ms from cache, LCP ≤ 1.2 s on 4G in the Mini App, client JS ≤ 120 kB gzip per route.
1. **Never call the LMS while rendering.** Pages read Postgres only (`lms_cache`, harvested `lms_*` tables, our tables). The LMS is called by the sync jobs, at sign-in (preload), and by explicit user actions (QR, mark read). Stale data shows immediately with a quiet "updated 5 min ago"; refresh runs in the background (`after()`), and the page updates on the next navigation.
2. **One query per screen.** Each screen has one view-model function in `src/server/views/*` that returns everything the screen needs (no waterfalls; parallel `Promise.all` inside). Add DB indexes for every lookup it does.
3. **Cache public data.** Course, professor, catalog, curriculum, rating summaries, OG images: Next cache (`'use cache'` + `cacheTag`/`cacheLife`, see node_modules/next/dist/docs), invalidated with `revalidateTag`/`updateTag` when a rating, upload or harvest changes them. Per-user data is never cached across users.
4. **Server Components by default.** `'use client'` only for interactive leaves (sheets, buttons, the Telegram bridge). No heavy client libraries; no client-side data fetching for first paint.
5. **Stream.** Wrap slow sections in `<Suspense>` with skeletons that match the Figma loading states (3.7, 4.17), so the frame and header paint first.
6. **Instant navigation.** `next/link` with prefetch for every in-app link; the shell (header/sidebar) stays mounted; mutations are optimistic (rating sent, mark read, dismiss) with `useOptimistic`, server actions confirm.
7. **Files never stream through the LMS on request.** Files are harvested ahead into the bucket and served by signed URL / redirect; branded copies are generated once and stored.
8. **Assets.** Fonts via `next/font` (subset latin + latin-ext), icons as inline SVG, images via `next/image`, OG images cached.
9. **Telegram Mini App.** Render the shell before Telegram SDK init finishes; never block first paint on `initData` validation (validate in parallel, swap to signed-in data via the session cookie). Keep the last snapshot so reopening the app shows content instantly.

## Screens contract (wave 2)
- The same URL serves mobile (Telegram or narrow browser) and desktop. `getPlatform()` from `src/platform/server.ts` says which; the route `page.tsx` loads ONE view model and renders `src/screens/mobile/<Name>.tsx` or `src/screens/desktop/<Name>.tsx` with the same `data` prop.
- Mobile screen agents own the `page.tsx` files of their routes and `src/screens/mobile/**` for their screens. The desktop agent owns `src/screens/desktop/**` (stubs exist; replace them). The admin agent owns `src/app/admin/**` and `src/screens/admin/**`.
- Props of a screen component = the return type of its view-model function (`Awaited<ReturnType<typeof views.today>>`). If the view function is not on `rebuild` yet, write the screen against a local fixture of the shape you need, then rebase and wire the real one before finishing; list anything still on fixtures in your report.
- Route ownership: **Mobile A** `/`, `/notifications`, `/qr`; **Mobile B** `/timetable`, `/courses`, `/c/**`, `/f/**`, `/rate/**`, `/next/**`, `/me/uploads`; **Mobile C** `/progress/**`, `/calendar`, `/search`, `/p/**`, `/professors`, `/schools/**`, `/programs/**`, `/me` (profile, alerts, my ratings, delete data).
