# Release 0.14.0 checklist

`main` holds `feat/embedded-scamp` (PR #9, merged as `c01d85b9`):
Edit React Project, behind the early-access flag from the website.

**Test run on merged `main` (2026-11-05):** typecheck clean; 4,883 unit
and integration tests pass; the build succeeds. e2e: the specs this
branch touched (`embedded-edit`, `embedded-modes`, `embedded-states`,
`auth/sign-in-ui`) passed on the branch; the full suite wasn't run for
this release. PR #9's CI check passed.

## What ships

- **Edit React Project** (Embedded Scamp), for Vite + React and Next.js.
  see `docs/plans/embedded-scamp-plan.md`
- **It's behind a flag.** The app shows it only to accounts the website
  says have it: admins, and accounts an admin adds on `/admin`. The
  website side (scamp-website PR #2) is deployed, and its migration is
  applied to production.

## Manual testing

- [x] Embedded Scamp, by Angie, on real Vite and Next.js projects, before
  the merge (checklist: <https://claude.ai/artifact/4bbZG2XQXVhr5dZU5ZJ6U1>).

## Release

- [x] `npm version 0.14.0 --no-git-tag-version`.
- [x] In `docs/CHANGELOG.md`, rename `### Unreleased` to
  `### 0.14.0 (2026-11-05)`.
- [x] Commit as `release: 0.14.0`.
- [ ] Push `main`, then tag `v0.14.0` and push the tag. The tag starts
  `.github/workflows/release.yml`.
- [ ] Watch the workflow through the `verify-feed` job.
- [ ] On an installed 0.13.0, confirm the app offers the update and
  installs it.
- [ ] Signed in as an admin on 0.14.0, **Edit React Project** shows on
  the start screen; as an account without access, it doesn't.

## After the release

- The website's public changelog and docs leave Edit React Project out
  until it leaves early access.
