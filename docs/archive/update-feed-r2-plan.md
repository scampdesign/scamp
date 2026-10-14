# Moving the update feed to R2 — implementation plan for phases 0 and 1

Status: **phase 0, 1.1, and 1.2 done; 1.3 tagged as `v0.7.1`, awaiting
push (2026-09-10).** Decided values: host `updates.scamp.club`, bucket
`scamp-releases`, feed at the bucket root with `archive/<version>/`
copies. Local proof passed: the packaged bundle's `app-update.yml` says
`provider: generic` with the R2 URL. This implements phases 0 and 1 of
`docs/scamp-repo-migration.md` (decide the endpoint; repoint the updater
to R2 while the repo is still public). It folds in the mechanics from
`docs/notes/update-feed-migration.md`, which found the one detail the
guide doesn't mention and that decides whether the migration works at
all. Linear: SCMP-85.

Every task is tagged:

- **[you]** — a manual step outside this repo: Cloudflare, GitHub
  settings, a test machine, a decision.
- **[claude]** — a change in this repo I can make and verify.

Read the two corrections first; the rest is the checklist.

## Two corrections to the guide

**1. `app-update.yml` takes only the first publish entry.** electron-builder
writes `publishConfigs[0]` into the bundle
(`app-builder-lib/out/publish/PublishManager.js`,
`getAppUpdatePublishConfiguration`), and electron-updater reads exactly
one provider, with no fallback. So the bridge release must publish to
**both** feeds with the R2 entry **first**: the GitHub copy is how
today's installs find the bridge, and the R2 entry is what the bridge
bakes into itself. Reverse the order and every build keeps pointing at
GitHub while looking fine. Verified against the installed
electron-builder 26.15.3 and electron-updater 6.8.9.

**2. There is no PostHog `app_opened` event to watch.** The app has no
analytics of that kind. The heartbeat (`src/main/auth/heartbeat.ts`) fires
only for signed-in users and sends no version. The adoption metric for
phase 2 is the one from the note: GitHub's download count on the newest
release's `latest*.yml`, which only un-migrated clients fetch. Phase 1
below sets that measurement up so phase 2 can start on day one.

A third, smaller one: the guide says `updates.scampdesign.app`, the note
says `updates.scamp.club`, and the app authenticates against
`www.scamp.club`. Pick one in phase 0. The plan assumes
`updates.scamp.club`.

## How the pieces fit

```
publish (electron-builder.yml)         release.yml, per OS
  1. generic  → baked into app-update.yml      build → publish to GitHub (2nd entry)
  2. github   → uploaded by electron-builder          → upload to R2 (new step; generic uploads nothing)
                                                      → verify the R2 feed (new script)
```

electron-builder uploads nothing for a `generic` provider (it returns
early in `scheduleUpload`), so R2 needs its own upload step. The AWS CLI
is preinstalled on all three runners and R2 speaks S3, so the step is
`aws s3 cp` against the R2 endpoint with two secrets.

---

## Phase 0 — decide the endpoint (on paper)

Nothing changes in the repo. These are decisions; I've put a
recommendation on each so this phase is a five-minute review.

- [ ] **[you] Update host.** Recommended `updates.scamp.club`, matching the
      auth domain. It must be a real custom domain on the bucket, not
      `r2.dev` (rate-limited, not for production). HTTPS is required on
      macOS.
- [ ] **[you] Bucket name.** Recommended `scamp-releases`.
- [ ] **[you] Path layout.** Recommended: the feed at the **bucket root**
      (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and the current
      installers and blockmaps), plus an `archive/<version>/` copy of every
      release for the website's download links and for rollback. The
      guide's `releases/latest/` works too, but the root keeps the
      `generic` URL bare and the note's file list already assumes it.
- [ ] **[you] Public read.** The feed is fetched with no credentials by
      Squirrel.Mac and NSIS, so the bucket (or the custom domain) must be
      publicly readable. Range requests must work for blockmap differential
      downloads; R2 supports them.
- [ ] **[you] Signing stays exactly as it is.** Same macOS Developer ID,
      same notarization credentials, and Windows stays **unsigned** through
      the bridge, as it is today (the `WIN_CERTS` step is skipped when the
      secret is absent). Do not combine the Windows signing decision with
      this migration; the guide's rule, and electron-updater rejects an
      update whose identity differs from the installed app.

Done when: the four values above are written at the top of this file.

---

## Phase 1 — repoint the updater to R2, while public

### 1.1 Stand up the bucket [you]

- [ ] Create the R2 bucket and attach the custom domain from phase 0.
- [ ] Enable public access on the domain. Confirm with a browser that a
      test object is reachable over HTTPS.
- [ ] Create an R2 API token scoped to **this bucket only**, with object
      read and write. Note the Access Key ID, Secret Access Key, and the
      account's S3 endpoint (`https://<accountid>.r2.cloudflarestorage.com`).
- [ ] Add four repository secrets on `angiehemans/scamp` (Settings →
      Secrets and variables → Actions):
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`,
      `R2_BUCKET`. Add a repository **variable** `UPDATE_FEED_URL` set to
      `https://updates.scamp.club`, so the verify step knows the public
      URL.

### 1.2 Repo changes [claude]

- [ ] **`electron-builder.yml`**: replace the single `github` publish
      entry with the two-entry array, `generic` first with the phase-0
      URL, `github` second unchanged. Rewrite the comment above it: it
      currently says the repo is public so no token is baked in, which
      stays true, but the reason the order matters needs to be there.
- [ ] **`.github/workflows/release.yml`**: after the build-and-publish
      step, add **Upload to R2**, one step that runs on every OS and
      uploads only that runner's artifacts (each OS produces its own
      `latest*.yml`, so there is no clash):
      - installers and blockmaps first, then `latest*.yml` last, so the
        feed never points at a file that isn't there yet;
      - the same files again under `archive/<version>/`;
      - `aws s3 cp` with `--endpoint-url "$R2_ENDPOINT"` and the two keys
        as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`;
      - **hard-fail when the R2 secrets are missing.** This is the
        opposite of the `WIN_CERTS` gate, on purpose: a release that
        reaches GitHub but not R2 would strand every migrated client on
        the old version with an update error, so the job must go red.
- [ ] **`scripts/verify-update-feed.mjs`**: fetch the three `latest*.yml`
      from `UPDATE_FEED_URL`, parse the `files:` list, and `HEAD` each
      listed URL, checking status 200, `content-length` equals the
      `size` in the yml, and `accept-ranges: bytes`. Prints a table and
      exits non-zero on any miss. Added as an `npm run verify:feed`
      script, and as the last step of the release job on the Linux
      runner (after all three OS uploads, using a job dependency).
      Pure Node, no new dependencies.
- [ ] **`docs/notes/auto-update.md`** and
      **`docs/notes/update-feed-migration.md`**: record the dual feed,
      the upload step, the verify script, and the phase the migration is
      in. The `electron-builder.yml` comment is updated in the same
      commit.
- [ ] **Optional, for phase 2's measurement:** send the app version on
      the heartbeat as an `x-scamp-version` header. Ten lines here; the
      server side is a change in `scamp-api` **[you]** to record it. This
      only counts signed-in users, so it supplements the GitHub download
      count rather than replacing it. Skip it if you'd rather keep the
      bridge release minimal.

I can't run the release workflow, but I can run the verify script
against the empty bucket (expecting a clean "no feed yet" failure) and
a `--publish never` local package to confirm `app-update.yml` in the
output bundle says `provider: generic` before anything is tagged. That
check is the one that matters, and it's local.

### 1.3 The bridge release, while the repo is still public

- [ ] **[claude]** Bump to `0.7.1`, write the changelog entry (one
      user-visible sentence: updates now come from Scamp's own server;
      nothing else changes), commit as `chore(release): v0.7.1`, and
      create the annotated tag.
- [ ] **[you]** Say "push it". I push `main` and the tag; the Release
      workflow runs. Watch it in Actions: three green builds, the R2
      upload steps, and the verify step.
- [ ] **[you]** Publish the GitHub release draft, as with every release.
      Today's installs pick the bridge up from GitHub on their next launch
      or four-hour check. **This is the release that frees users from
      GitHub, and it must go out before the repo goes private.**

Safety property worth knowing: the bridge itself doesn't depend on R2
working. Existing clients fetch it from GitHub. R2 first has to work for
the release *after* the bridge, which is why 1.4 sits between them.

### 1.4 Verify on real machines [you]

On a Mac (the platform where signing is strict), with the Windows check
if you have a machine:

- [ ] Install `v0.7.0` fresh from the GitHub release.
- [ ] Launch it; let it check. Confirm it downloads and installs `v0.7.1`.
- [ ] Open the installed bundle and read
      `Scamp.app/Contents/Resources/app-update.yml`. It must say
      `provider: generic` and the phase-0 URL. **If it says `github`, the
      publish order is wrong; stop and tell me.**
- [ ] Run `npm run verify:feed` locally: every file listed in the three
      `latest*.yml` is reachable with the right size and range support.
- [ ] Cut the next release (`v0.7.2`, real or throwaway) and confirm the
      `v0.7.1` machine updates from R2 with GitHub never involved:
      `gh release view v0.7.2` should show a `latest-mac.yml` download
      count that stays flat while your test machine updates.

Done when: a machine that started on `v0.7.0` is on `v0.7.2` having
taken one update from GitHub and one from R2.

### 1.5 Hand-off to phase 2 [you]

Phase 2 is waiting and measuring; it starts the day 1.4 passes.

- [ ] Record the baseline: `latest*.yml` download counts on `v0.7.1`,
      which is the last release un-migrated clients will fetch:

      ```bash
      gh release view v0.7.1 --json assets \
        -q '.assets[] | select(.name|startswith("latest")) | "\(.name) \(.downloadCount)"'
      ```

- [ ] Keep dual-publishing every release until phase 2's exit criterion
      holds (the count flattens across consecutive releases; weeks, not
      days). Nothing in this repo changes during that time.

---

## What this deliberately does not do

- **No Windows signing change.** Same identity throughout, per the guide.
- **No `s3` publish provider.** It would put the raw R2 endpoint in
  `app-update.yml` instead of the custom domain, and it needs the AWS
  SDK at build time. `generic` plus a copy step is smaller and keeps the
  URL yours.
- **No repo transfer, no going private.** Phases 3 and 4 of the guide,
  and gated on phase 2's measurement.
- **No website changes.** The website's code has no links to GitHub
  releases today (only `prd.md` mentions them), so there is nothing to
  repoint until phase 4.

## Order of operations, compressed

1. **[you]** Phase 0 decisions (five minutes).
2. **[you]** 1.1: bucket, domain, token, four secrets and one variable.
3. **[claude]** 1.2: builder config, workflow step, verify script, docs.
   Local proof that the packaged `app-update.yml` says `generic`.
4. **[claude]** 1.3: version, changelog, tag. **[you]** push and publish.
5. **[you]** 1.4: install 0.7.0 → 0.7.1 (GitHub) → 0.7.2 (R2) on a Mac.
6. **[you]** 1.5: baseline count; phase 2 begins.
