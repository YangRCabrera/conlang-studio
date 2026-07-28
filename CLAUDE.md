@AGENTS.md

# Project rules

## Commands

- `npm run dev` — dev server at http://localhost:3000
- `npm run test:run` — vitest, single pass (`npm test` is watch mode; don't use it from an agent)
- `npm run test:e2e` — Playwright, against a running dev server. Runs in CI on `pull_request` (advisory — `continue-on-error`, not yet a required check) against an ephemeral Neon branch forked from production, per `.github/workflows/ci.yml`; run it manually via the `verify` skill for local iteration.
- `npm run lint` — ESLint
- `npm run build` — production build
- `npm run typecheck` — `next typegen && tsc --noEmit`, the strictest whole-project type check. `build`'s TypeScript pass only checks files reachable from routes/pages despite `tsconfig.json` including the whole project — `typecheck` is what CI runs and what actually catches errors in files like tests.
- `npm run db:generate` — after editing `app/db/schema.ts`, generate a migration file into `drizzle/`.
- `npm run db:migrate` — apply pending migrations in `drizzle/` to the Neon database. This is the only schema-sync workflow; `db:push` has been retired now that migrations are committed.
- Requires `DATABASE_URL` (Neon) and Clerk keys in `.env`.

## Next.js version notes

This project uses **Next.js 16+**. Key breaking changes from earlier versions:

- **Middleware is now called Proxy.** The file is `proxy.ts` at the project root, not `middleware.ts`. The API is otherwise identical. Proxy is **not** a security boundary — it is for routing/redirects only; real authorization happens per-handler (see Security requirements).
- **`params` in dynamic routes is a `Promise`.** Always `await params` before destructuring: `const { id } = await params`.
- **`PageProps<'/path/[id]'>` and `LayoutProps<'/path'>` are global helpers** — no import needed. Use them for typed page and layout props.
- **Cache invalidation after mutations** — two distinct mechanisms; do not conflate them:
  - Server-side: `revalidatePath('/path')` or `revalidateTag(tag, 'max')` (from `next/cache`) inside a Server Action. The single-argument `revalidateTag(tag)` form is deprecated — always pass the second argument.
  - Client-side: `router.refresh()` from `useRouter()` (`next/navigation`) in a client component re-fetches the current route. It is a client API, not exported from `next/cache`.

---

## Architecture: thin adapters over a shared service layer

The most important rule in this file. Route handlers, Server Actions, and Server Components are **thin entry points**. The real work for each operation lives once, in a feature service module, and every entry point calls it. This keeps parallel paths from drifting and makes a future mobile client cheap.

### `app/lib/<feature>.ts` — the service layer (single home for an operation)

One exported function per operation, named `<verb><Entity>Svc` (`createLanguageSvc`, `deletePhonemeSvc`). A service function receives an **already-resolved DB user** (auth is the adapter's job) and **raw, untrusted input**, validates, enforces ownership, performs the DB operation, and returns a `Result` — never throwing for expected failures. It is **framework-agnostic**: no `revalidatePath`, no `Response.json`, no `auth()`/cookies. That is what lets a browser action, an HTTP route handler, and a future mobile handler reuse it unchanged.

The standard shape, built from the shared helpers — use these, don't hand-roll `safeParse` or ownership checks:

```ts
export async function createThingSvc(
  user: DbUser,
  rawLanguageId: unknown,
  rawInput: unknown,
): Promise<Result<Thing>> {
  const lang = await parseAndRequireOwnedLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const input = parseInput(createThingInputSchema, rawInput);
  if (!input.ok) return input;

  // ...DB operation scoped to lang.data.id...
  return { ok: true, data: row };
}
```

Helper modules (read their JSDoc before writing a new service function):

- `app/lib/result.ts` — the `Result` type and constructors: `notFound()`, `invalidId()`, `conflict()`, `validationIssues(zodError)`, `validationMessage(issues)` for non-Zod checks (uniqueness conflicts, cross-field rules).
- `app/lib/parse.ts` — `parseUuid(raw)` for bare ID params; `parseInput(schema, raw)` for body/form input. Both return `Result`-compatible failures for direct early return.
- `app/lib/ownership.ts` — `parseAndRequireOwnedLanguage(user, rawId)` (the common preamble), `requireOwnedLanguage`, `ownedLanguageIds(user)` (subquery for tables that carry `language_id` but no `user_id`), `isUniqueViolation(err)` (Postgres 23505 duck-type). For read-only paths that must also serve an anonymous visitor: `parseAndRequireVisibleLanguage(user, rawId)` / `requireVisibleLanguage` take `user: DbUser | null` and additionally allow a language with `is_public = true` through — see the public demo language note in Security requirements.

### `app/<feature>/actions.ts` — Server Action adapters

- Resolve auth via `getOrCreateDbUser()`; if `null`, return `{ ok: false, kind: 'unauthorized' }` without calling the service.
- Gather raw input from arguments/`FormData` into a plain object; call the service.
- On success, `revalidatePath(...)` for affected paths; return the `Result` for `useActionState`. Never translate results into thrown errors.
- `useActionState` compatibility: the signature is `(prevState, formData)`; extra args like `id` go **first** so callers can `.bind(null, id)`.

### `app/api/.../route.ts` — Route handler adapters

- Same shape: resolve auth (`401` if null), `await params`, parse the body, call the **same** service function the corresponding action uses. Sharing only the schema is not enough — duplicated orchestration drifts.
- Map the `Result` to HTTP with the helpers in `app/lib/http.ts` — never hand-roll the mapping in a handler:
  - `resultResponse(result, successStatus?)` — the whole return statement for a standard handler: `200` by default, `201` for creates, `204` for deletes (empty body). Failures become the shared error shape.
  - `errorResponse(result)` — just the failure branch, for handlers whose success body isn't the raw `result.data` (e.g. the wordgen route reshapes its payload).
  - The kind → status table (`not_found` → `404`, `unauthorized` → `401`, `validation`/`invalid_id`/`conflict` → `400`, body `{ error: result.kind, issues? }`) lives once in `STATUS_BY_KIND` there.

> **Mobile-auth caveat:** a mobile client authenticates with bearer tokens, not Clerk's cookie session, so route handlers will need a token-based resolver when a mobile client becomes real. The service layer is unaffected — it receives an already-resolved user. Until then the parallel route handlers are kept deliberately.

---

## Separation of concerns

- **`app/db/schema.ts`** — Drizzle tables and relations only; no business logic. Conventions: snake_case table/column names, `uuid('id').defaultRandom().primaryKey()`, child tables reference `languages.id` with `onDelete: 'cascade'`, real invariants get DB-level `unique()`/`check()` constraints. Define `relations(...)` for any table read via `db.query.*` relational queries. Row types are derived at the use site via `typeof <table>.$inferSelect` / `$inferInsert`.
- **`app/db/validation.ts`** — single home for all Zod schemas; never define schemas inline in adapters or services. Input schemas (client-supplied fields only) are `create<Entity>InputSchema` / `update<Entity>InputSchema` — prefer the general update schema over operation-specific names. Full insert schemas (including server-injected fields) are `create<Entity>Schema`. `uuidSchema` validates bare UUID params. Document what is intentionally absent (e.g. `user_id` is injected server-side, never client-supplied).
- **`app/db/json-shapes.ts`** — Zod schemas and TS types for `jsonb` column payloads (syllable templates, rule contexts) and shared enums (`LEXEME_ORIGINS`). Referenced from `schema.ts` via `.$type<...>()`.
- **`app/lib/current-user.ts`** — auth boundary. `getOrCreateDbUser()` is the only way adapters resolve a Clerk session to a DB user; never call `auth()`/`currentUser()` elsewhere. Surprise worth knowing: it **writes** — it lazily provisions the user row on first need, so an otherwise read-only path can insert.

---

## Result shape (return, don't throw, for expected failures)

Defined in `app/lib/result.ts`:

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'validation'; issues: unknown } // z.treeifyError output, or a hand-written message shape
  | { ok: false; kind: 'not_found' } // row absent OR present but not owned
  | { ok: false; kind: 'unauthorized' }
  | { ok: false; kind: 'invalid_id' }
  | { ok: false; kind: 'conflict' }; // exists but can't be mutated now (e.g. still referenced by a syllable template)
```

Expected failures (bad input, not owned, unauthenticated) are **values, not exceptions**: actions feed them straight into `useActionState`, route handlers map them to status codes, and production Next.js redacts thrown error messages anyway. Reserve `throw` for genuinely unexpected failures (violated invariant, DB connection error) and let those bubble to `error.tsx`.

---

## Security requirements

Every operation satisfies all three before touching the database:

1. **Authentication** — in the **adapter**: `getOrCreateDbUser()`; on `null`, return `401` / unauthorized result and do not call the service.
2. **Input validation** — in the **service**: `parseInput` with a schema from `validation.ts`; `parseUuid` for bare IDs. Never use raw `FormData.get(...)` or request-body values directly in queries. Bare UUIDs are validated even though ownership would ultimately reject a bad value — a clean, predictable failure beats a DB error.
3. **Ownership enforcement** — in the **service**, inside the query itself. Two patterns:
   - `languages` (carries `user_id`): `eq(languages.user_id, user.id)` in every `WHERE`.
   - Child tables (`phonemes`, `phoneme_groups`, `syllable_structures`, `lexemes`, … — `language_id` only, no `user_id`): verify the language first with `parseAndRequireOwnedLanguage` and scope the query to it, or filter with `inArray(<table>.language_id, ownedLanguageIds(user))` so enforcement stays inside the single statement.

A missing ownership check silently allows cross-user data access (IDOR).

**Deliberate exception — the public demo language:** a language with
`is_public = true` can be read anonymously. Read-only service functions for
such paths take `user: DbUser | null` and call
`parseAndRequireVisibleLanguage`/`requireVisibleLanguage` instead of the
owned-only variants; `user` stays required (non-null) for every mutation.
This is the only carve-out from strict per-user ownership, and it's
read-only by construction — do not widen a mutation service to accept a
null user.

---

## Frontend: server-first, service layer is the only data source

Components are adapters too, not a second home for logic.

- **Default to Server Components; push `'use client'` to the leaves.** Add the directive only for interactivity (state, effects, handlers, browser APIs), as far down the tree as possible. Marking a whole page `'use client'` to fix one button is the frontend version of putting logic in the adapter.
- **Server-only imports stay on the server.** Client Components must not import `app/lib/*`, `app/db/index.ts`, `app/db/schema.ts`, or call `auth()`/`getOrCreateDbUser()`. Exception by design: `app/db/validation.ts` and `app/db/json-shapes.ts` are shared — client forms import input schemas from there. Client files get data via props from a Server Component or via a Server Action's return value.
- **Reads: a Server Component is the third adapter.** Resolve the user with `getOrCreateDbUser()`, call a service read function (`listLanguagesSvc(user)`) — never query the DB inline. The `Result` contract applies: `{ ok: false }` renders the empty/error state.
- **Mutations: client form → `useActionState` → Server Action → service.** Render from the returned `Result`; use `issues` (the `z.treeifyError` shape) to place field-level errors next to the right inputs. Never throw from an action for expected failures.
- **Visibility-gated pages: a `canEdit` prop, not a second data source.** On pages a `parseAndRequireVisibleLanguage` read can serve to an anonymous visitor (currently the public demo language), the Server Component computes `canEdit = user !== null && lang.user_id === user.id` and passes it down; client components hide their mutation controls entirely for `canEdit === false` rather than disabling them or re-deriving ownership client-side.
- **Client-side validation is UX, not enforcement.** Reuse the same `create<Entity>InputSchema` / `update<Entity>InputSchema` in the form for fast feedback; the service re-validates regardless. One schema, two consumers — never a second hand-rolled set of checks.
- **Loading and error UI**: `loading.tsx` (or `<Suspense>`) for every route that fetches; `error.tsx` (a Client Component) is the boundary where genuinely-unexpected throws land — expected failures never reach it; `not-found.tsx` for the not-found path.
- **Styling: Tailwind, tokens over literals.** Design tokens (`--background`, `--card`, `--primary`, `--muted-foreground`, `--destructive`, `--border`, `--edit`, …) live in `app/globals.css` and drive semantic Tailwind classes (`bg-card`, `text-muted-foreground`, `bg-primary`) — never hardcode a literal Tailwind palette color (`bg-gray-800`, `text-teal-500`) for anything brand or interactive. Exception: status text (validation errors, phonotactics warnings) uses plain semantic red/amber, deliberately kept outside the accent system so it reads as state, not brand.
- **Shared primitives live in `app/components/ui/`** (Button, Input, Label, Badge, Card, `FormError` — via shadcn/ui for the first five; `cn()` helper in `app/components/utils.ts`). Reach for these instead of hand-rolling a `<button>`/`<input>`. The `edit` Button variant is a project-specific addition (not a shadcn default) backing the violet/plum "Edit" action color, themed via the `--edit`/`--edit-foreground` tokens. `app/components/action-state.ts` (`ActionState` type, `fieldError`/`anyFieldError`/`failureMessage`) is the client-safe, structurally-typed mirror of `Result` that pairs with `FormError` — it lives outside `app/lib/` specifically so Client Components can import it.
- **Theming**: `app/components/theme/theme-provider.tsx` wraps the tree with `next-themes` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`); `app/components/theme/theme-toggle.tsx` is the header sun/moon button. `<html>` no longer hardcodes `className="dark"` — it carries `suppressHydrationWarning` instead, since next-themes sets the class client-side before hydration. Any new literal color (the header/sidebar chrome mistake this caught: `bg-[#0a0d08] text-white`) breaks light mode silently — tokens aren't optional here, they're what makes the toggle work.
- Learn each utility class you use; don't paste an opaque class string you can't read back.
- **Accessibility baseline**: target conformance is WCAG 2.0/2.1 A and AA. Every input has a `<label>` (use `Label`'s `required` prop for a visual asterisk — it's `aria-hidden`, since the semantic cue for assistive tech is the input's own native `required` attribute, not the asterisk); every button is a real `<button>`; keyboard operable with visible focus; semantic elements over `<div>` soup; meaningful `alt` text; one `<main>` landmark per route (skip link in `app/layout.tsx` targets `#main-content`) and a sane heading hierarchy (one `<h1>` per page). Validation errors wire `aria-invalid`/`aria-describedby` on the input to a `FormError` with a matching `id` (its `role="alert"` announces the message on mount). `useFocusOnError` and `useReturnFocusOnExit` (`app/components/`) move focus to an invalid field on a failed submit and back to the triggering button when an inline edit closes, respectively — reach for these instead of a one-off `.focus()` call. `eslint-plugin-jsx-a11y`'s `recommended` rules run on top of `eslint-config-next`'s baseline 6; `npm run lint` catches most violations, `e2e/a11y.spec.ts` (axe-core, see Testing below) catches what static analysis can't.

---

## Testing

Vitest. Unit tests live in `app/lib/__tests__/` and target **pure, framework-free domain logic** (`phonotactics.ts`, `wordgen.ts`). Adapters and DB-touching service functions are not unit-tested — keep new domain logic pure (no DB, no framework imports) so it stays testable this way. Run with `npm run test:run`.

End-to-end coverage of adapters/DB-touching flows lives separately in `e2e/` (Playwright): an authenticated golden-path spec (create a language through generating a word), an anonymous-visitor spec against the public demo language, a sign-in spec, and an accessibility spec (`a11y.spec.ts`, `@axe-core/playwright` scanning public and authenticated pages against the WCAG 2.0/2.1 A/AA tags, on a dedicated `chromium-a11y` Playwright project), plus shared fixtures and a Clerk auth setup. Run with `npm run test:e2e` against a running dev server (`workers: 1` — one shared Clerk test account, so specs never run concurrently within a run).

In CI (`.github/workflows/ci.yml`), the `e2e` job runs on `pull_request` only, after the `ci` job passes. It forks an ephemeral Neon branch from production (schema + the seeded public demo language come along for free), applies any pending migration the PR introduces, then runs the suite against that branch — the shared *dev* database is never touched by CI. The single shared Clerk test account is still a bottleneck across concurrent PRs, so the job holds a repo-wide `concurrency` group (`e2e-clerk-shared-account`) to serialize runs instead of racing logins. The job is advisory (`continue-on-error: true`) while it proves out — promote it to a required check once it's been stable for a while. For local iteration, it's still run manually as part of the `verify` skill before pushing.

`@clerk/testing` (`e2e/global-setup.ts`, plus `setupClerkTestingToken` calls in `e2e/support/clerk-sign-in.ts` and the auto-fixture in `e2e/fixtures.ts`) fetches and applies a Clerk Testing Token so automated runs bypass Clerk's bot detection, which can otherwise silently stall the Frontend API calls an authenticated session makes from a CI runner's IP.

---

## Documentation

- Every exported function and schema gets a JSDoc comment.
- JSDoc documents **what is intentionally absent or non-obvious** — why `user_id` isn't in an input schema, why `getOrCreateDbUser` writes, why an ownership check is structured a certain way. Not what the code already says.
- Inline comments are for invariants, constraints, and surprises — not narration.

---

## Not yet, but on the radar

Intentionally out of scope now — listed so they aren't forgotten, not so they are done now:

- **Rate limiting** on sensitive operations, especially now that anonymous visitors can hit the public demo language without an account.
- **DB transactions** for any mutation touching more than one table.
- **Token-based auth resolver** for route handlers, when a mobile client becomes real.
- **`conflict` → `409`** in route handlers (currently `400`); now a one-line change in `STATUS_BY_KIND` in `app/lib/http.ts`.
- **Optimistic UI** (`useOptimistic`) where the round-trip feels slow.
