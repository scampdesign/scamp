# Migrating the update feed off GitHub

Goal: make `scampdesign/scamp` **fully private** without stranding installed
copies. Runtime wiring this modifies is described in
[`auto-update.md`](./auto-update.md). The step-by-step version of phases 1–2,
split into manual and in-repo tasks, is `docs/plans/update-feed-r2-plan.md`
and `docs/plans/update-feed-r2-manual-steps.md`.

**Where this stands (2026-09-28):** Phases 1 and 2 are done — the bucket is
public at `https://updates.scamp.club`, and the bridge release was `v0.7.1`:
`electron-builder.yml` publishes `generic` first and `github` second, and
`release.yml` copies artifacts to R2 and verifies the feed. Verified on a
real machine, and every release since has gone out this way through
`v0.8.5`.

Phase 3 (measure) is where this sits. The un-migrated count is falling and
has not flattened: `latest-mac.yml` drew 111 fetches on `v0.7.2` and 41 on
`v0.8.0`. **Do not drop the `github` entry yet.**

The repo is also moving to an organization, which is independent of all of
this — R2 does not care who owns the source. The steps for that, and the
one macOS-signing trap in them, are in
[`../plans/org-transfer-manual-steps.md`](../plans/org-transfer-manual-steps.md).

**One live gotcha:** electron-builder leaves the GitHub release as a
**draft**, and `releases.atom` does not list drafts — so until the draft is
published, un-migrated clients cannot see that version at all, and the
count above stops moving for a reason that has nothing to do with
adoption. Publish the draft as part of every release.

## Why it needs a migration at all

`app-update.yml` is written **into the app bundle at build time**, so every
installed copy has its feed baked in and cannot be repointed remotely.
electron-updater 6.8.9 hits exactly two unauthenticated URLs
(`GitHubProvider.js`):

```
https://github.com/angiehemans/scamp/releases.atom               ← version discovery
https://github.com/angiehemans/scamp/releases/download/<tag>/…   ← latest*.yml, then the installer
```

The **old** owner, deliberately: those URLs were baked into those installs
before the repo moved to `scampdesign` on 2026-09-28, and a build cannot be
repointed after the fact. GitHub redirects the old path to the new one and
electron-updater follows redirects, so they still resolve — but that
redirect is now load-bearing for every un-migrated client, and it is one
more thing that disappears when the repo goes private.

Both 404 the moment the repo is private. So a version pointing at the new feed
has to be **installed** before the old feed disappears.

Accepted trade-off: anyone who never launches the app during the window stays on
their current version forever and has to reinstall by hand. That is the price of
nothing staying public.

---

## The one gotcha that will silently break this

`app-update.yml` gets **`publishConfigs[0]`** — the first entry only
(`app-builder-lib/out/publish/PublishManager.js`, `getAppUpdatePublishConfiguration`).
electron-updater's `createClient` then takes a single provider object; there is
no array, no fallback, no second chance.

So during the window, publish to both, **generic first**:

```yaml
publish:
  - provider: generic          # ← must be first: this is what ships in app-update.yml
    url: https://updates.scamp.club
  - provider: github           # ← still receives artifacts, for un-migrated clients
    owner: scampdesign
    repo: scamp
```

Reversed, every build keeps pointing at GitHub and the migration quietly never
happens — while looking completely fine.

---

## Phase 1 — stand up the new feed

Cloudflare R2 bucket on a **real custom domain**, not `r2.dev` (rate-limited,
not for production). Must be public and unauthenticated: Squirrel.Mac and NSIS
fetch with no credentials, so the feed cannot sit behind a login.

Needs to serve, at the bucket root:

```
latest.yml  latest-mac.yml  latest-linux.yml
Scamp-<v>-arm64-mac.zip     (+ .blockmap)
Scamp-<v>-arm64.dmg         (+ .blockmap)
Scamp-Setup-<v>.exe         (+ .blockmap)
Scamp-<v>.AppImage
scamp_<v>_amd64.deb
```

HTTPS is mandatory on macOS. Range requests must work for blockmap differential
downloads — R2 supports them.

**How the upload works:** electron-builder uploads nothing for a `generic`
provider (`PublishManager.scheduleUpload` returns early), so `release.yml`
copies each runner's artifacts with the AWS CLI against the R2 S3 endpoint —
installers and blockmaps first, `latest*.yml` last, plus a copy under
`archive/<version>/`. The AWS CLI needs
`AWS_REQUEST_CHECKSUM_CALCULATION=when_required` (2.23+ sends CRC headers R2
rejects). A `verify-feed` job then runs `scripts/verify-update-feed.mjs`,
which fetches the three yml files, checks the version against the tag, and
does a ranged GET on every listed file (206, size matches, ranges work).

**Edge caching is a trap.** Cloudflare caches objects served through the R2
custom domain (`cache-control: max-age=14400`), and electron-updater adds its
`?noCache=` query only to the `latest*.yml` fetch — installer and blockmap URLs
are requested bare (`Provider.resolveFiles` doesn't pass the flag). Re-upload a
file under the same name, as a release re-run does, and any edge that already
served it keeps handing out the old bytes until the TTL expires, which fails
the updater's sha512 check. The fix is a zone Cache Rule that bypasses cache
for the feed hostname; `verify-update-feed.mjs` compares the bare URL against
a cache-busted one and reports "stale edge cache" when they differ.

**Verify before anyone depends on it:** the bridge release doesn't need R2 to
work — existing installs fetch it from GitHub. R2 has to work for the release
*after* the bridge, so the real-machine check (install the previous release,
take the bridge from GitHub, read the bundle's `app-update.yml`, then take the
next release from R2) sits between them.

## Phase 2 — the bridge release

Cut a release with the dual-publish block above. It must land on **GitHub too** —
that copy is how existing installs find it.

Verify on a real machine, not just CI:

1. Install the current public release fresh.
2. Let it check (launch, or wait 4h).
3. Confirm it downloads and installs the bridge.
4. Confirm the installed bundle's `app-update.yml` now says `generic`.
5. Confirm *that* build then updates again from R2 alone.

Step 4 is the one that matters. If it still says `github`, the publish order is
wrong.

## Phase 3 — wait, and measure

Keep dual-publishing every release. Don't guess at the window — measure it.

**The metric:** GitHub's download count on the newest release's `latest*.yml` is
an un-migrated-client counter. Migrated clients stop hitting GitHub entirely, so
that number only moves for clients still on the old feed.

```bash
gh release view <newest-tag> --json assets \
  -q '.assets[] | select(.name|startswith("latest")) | "\(.name) \(.downloadCount)"'
```

For reference, v0.5.7 drew 139 `latest-mac.yml` fetches against 5 real installer
downloads — nearly all GitHub release traffic is update polling, which is exactly
why this number is a usable signal.

Exit criterion: that count flattens across a couple of consecutive releases while
R2 feed requests hold steady. Weeks, not days — someone who opens Scamp monthly
needs a month.

## Phase 4 — privatise

1. Drop the `github` entry from `publish`; R2 becomes the only target.
2. Ship one release on R2 only. Confirm migrated clients still update.
3. Flip the repo to private.
4. Rotate `secrets.GH_TOKEN` if its scope was broader than this repo.
5. Update `auto-update.md` and the `publish:` comment in
   `electron-builder.yml`, which both currently say "the repo is public, so no
   token is baked into the binary."

Timing note: **0 forks today.** Nobody holds a persistent GitHub-side copy, so
privatising is unusually clean right now. Off-platform clones can't be recalled
either way — this protects future source, not what is already out.

---

## Consequences worth knowing

- **The feed stays public even after the repo is private.** electron-updater
  sends no credentials, so installers remain fetchable by anyone who finds the
  URL. Privatising hides *source*, not binaries. If the website's
  pay-what-you-want flow assumes otherwise, it is assuming wrong.
- **You become your own CDN.** GitHub was absorbing installer bandwidth. R2 has
  zero egress fees, so cost is a non-issue, but availability is now yours.
- **No rollback once GitHub is gone.** Un-migrated clients can't be reached by
  any later change. Hence Phase 3 being measured rather than scheduled.

## If this stalls

Alternative considered and rejected here: keep `scampdesign/scamp` public as a
**releases-only shell** — source moved to a private repo, public repo gutted to a
README with its tags force-moved to an empty commit. Release assets survive that
(they attach to the release, not the tag tree), so old installs keep updating
forever and no bridge is needed. Rejected because it leaves a public repo
standing, which was the thing being avoided. Worth revisiting if the un-migrated
count refuses to flatten.
