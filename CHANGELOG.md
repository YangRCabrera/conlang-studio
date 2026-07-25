# Changelog

All notable user-facing changes to this project are documented here. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning
follows [Semantic Versioning](https://semver.org/), scoped to this app's own
users and data rather than a public API (see `CLAUDE.md` for the exact rule).

## [1.1.1] - 2026-07-25

### Added

- Skip-to-content link and a `<main>` landmark on every route.
- Automated accessibility linting (`eslint-plugin-jsx-a11y`) and an
  automated accessibility scan (`@axe-core/playwright`) covering public and
  authenticated pages, run as part of `test:e2e`.

### Changed

- Validation errors now move keyboard focus to the offending field, and
  inline edit rows return focus to their trigger button on close, instead of
  silently dropping focus to the page body.
- Required fields are marked with a visible indicator next to their label.
- Heading order corrected on the phonemes, dictionary, and word generator
  pages.

### Fixed

- Form error messages are now announced to assistive tech and tied to their
  input via `aria-describedby`, instead of being visually-only.

## [1.1.0] - 2026-07-20

### Added

- Public, read-only demo language: an `is_public` language can now be viewed
  by signed-out visitors, so a first-time visitor sees the app instead of a
  Clerk sign-in wall.
- Light/dark theme, with a header toggle.
- Empty-state hints on the phonemes page pointing new users toward groups,
  syllable structures, and rules.
- A new app icon.
- Playwright end-to-end tests, run as part of `verify`.

### Changed

- Landing page copy, including the Dictionary feature description.
- Languages list page layout.
- Rules editor now surfaces that rule application is non-recursive.

### Fixed

- Misaligned inputs on the word generator form.

## [1.0.0] - 2026-07-18

Initial public release.
