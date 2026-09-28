# Scamp Repo Migration Guide

Moving the Scamp repository from a **public personal GitHub repo** to a
**private organization repo**, without breaking auto-updates for users who
have already installed the app.

> **Status (2026-09-28).** This was written before any of it was built, and
> Phases 0–2 are now done: the R2 feed is live at
> `https://updates.scamp.club`, the bridge release was `v0.7.1`, and every
> install from then on reads R2 rather than GitHub Releases. So the
> inviolable rule below is already satisfied — which is what makes the org
> move safe to do now.
>
> For the steps actually being followed, use
> [`plans/org-transfer-manual-steps.md`](plans/org-transfer-manual-steps.md)
> (the transfer, with the repo staying public) and
> [`notes/update-feed-migration.md`](notes/update-feed-migration.md) (the
> measurement that gates going private). Keep this document for the
> reasoning; it is no longer the checklist.

---

## The one thing that can go wrong

Auto-updates currently come from **GitHub Releases**. On a public repo,
release asset URLs are unauthenticated, so every installed copy of the app
can fetch them freely. **The moment the repo goes private, GitHub locks those
release assets behind authentication, and every existing user's auto-updater
starts failing.** Their installed app keeps running but silently stops
updating, and you cannot fix it retroactively, because the broken updater is
already baked into the copies people are running.

**The rule that this whole guide is built around:**

> Never flip the repo to private while GitHub is still the update source.
> Move the update feed to R2 and get it into users' hands **first**. Only then
> is going private safe.

Because the update feed is moving to a stable URL you control (R2), where the
*source code* lives becomes irrelevant to updates. That is the permanent fix,
not a workaround.

---

## Prerequisites

Before starting, confirm you have:

- [ ] Admin access to the current personal repo
- [ ] Ability to create a GitHub organization (or one already created)
- [ ] Your Cloudflare R2 account and a bucket for release artifacts
- [ ] The **same code-signing certificates** you currently release with
      (macOS Developer ID + Apple notarization credentials; Windows signing
      cert). Signing continuity is critical — see the signing note below.
- [ ] Access to your analytics (PostHog `app_opened` / version events) so you
      can watch update adoption
- [ ] Your email tool (Loops) for the straggler notice at the end

---

## Signing continuity (read before you start)

electron-updater validates that an update is signed by the **same identity**
as the installed app. On macOS and Windows, an update signed by a different
identity is **rejected** even if it downloads perfectly.

- Use the **same certificates** throughout this migration.
- Do not let the org move change which machine or certificate signs releases
  without verifying updates still apply.
- If you must change the signing identity at some point, that is a separate,
  carefully tested change — never combine it with this migration.

---

# Phase 0 — Decide the update endpoint (on paper)

The decision that drives everything else: move auto-update delivery off GitHub
Releases and onto a **stable, auth-free URL you control** on R2.

- [ ] Choose the update host, e.g. `updates.scampdesign.app`, backed by your
      R2 bucket
- [ ] Decide the path layout in the bucket, e.g.:
  - `releases/latest/` — current version installers + update metadata
  - `releases/archive/[version]/` — historical versions
- [ ] Confirm the bucket is publicly readable for the update path (auto-free
      GET), since electron-updater fetches without authentication

No code changes yet. This phase is just locking the decision.

---

# Phase 1 — Repoint the updater to R2 (while still public)

This is the critical bridge. You ship one update **through the existing
GitHub-based updater** that reconfigures the app to check R2 from then on.

### 1.1 Reconfigure electron-updater / electron-builder

- [ ] Change the `publish` target in your electron-builder config from the
      GitHub provider to the **generic** or **S3** provider pointing at the R2
      URL. R2 speaks the S3 API, so electron-builder's `s3` publish provider
      works when you point its endpoint at your R2 account. Example shape
      (adapt to your setup):

  ```yaml
  # electron-builder config
  publish:
    provider: generic
    url: https://updates.scampdesign.app/releases/latest
  ```

  or, using the S3-compatible provider against R2:

  ```yaml
  publish:
    provider: s3
    endpoint: https://<accountid>.r2.cloudflarestorage.com
    bucket: scamp-releases
    path: releases/latest
  ```

- [ ] Ensure the build publishes the installers **and** the electron-updater
      metadata files: `latest.yml` (Windows), `latest-mac.yml` (macOS),
      `latest-linux.yml` (Linux). These are what the updater reads to detect a
      new version.

### 1.2 Set up publishing to R2

- [ ] Wire your release build to upload installers + `latest*.yml` to the R2
      path from Phase 0
- [ ] Confirm the files are publicly reachable at the update URL (open
      `https://updates.scampdesign.app/releases/latest/latest-mac.yml` in a
      browser)

### 1.3 Release this version WHILE THE REPO IS STILL PUBLIC

- [ ] Cut a normal release. The existing GitHub-based updater on users'
      machines delivers this update successfully (repo is still public).
- [ ] **After installing this version, clients now check R2, not GitHub.**
      This is the release that frees your users from GitHub. It must go out
      before the repo goes private.

### 1.4 Verify the repoint

- [ ] On a test machine running the *previous* (GitHub-based) version, confirm
      it successfully updates to the Phase 1 version
- [ ] On a machine now running the Phase 1 version, confirm it detects and
      installs a *subsequent* test update from R2 (cut a throwaway patch
      version to prove the R2 feed works end to end)

---

# Phase 2 — Let the new endpoint bake

Wait until the overwhelming majority of active users have taken the Phase 1
update and are now pulling from R2.

- [ ] Watch version adoption in analytics (the `app_opened` / version events).
      Track the percentage of active users on the Phase 1 version or later.
- [ ] Wait until pre–Phase 1 clients are a small tail. A few weeks is typical,
      depending on your update cadence and how often the app checks.
- [ ] Do not proceed to going private until this tail is negligible. Every
      user still below Phase 1 will be stranded when the repo goes private
      (they'll need a one-time manual re-download — see Phase 5).

---

# Phase 3 — Create the org and transfer the repo

Do this while the repo is **still public**. Transferring and going private are
separate steps; do not combine them.

### 3.1 Create the organization

- [ ] Create the GitHub organization
- [ ] Set up billing (see the CI minutes note in Phase 4)

### 3.2 Transfer the repo

- [ ] **Transfer** the existing repo into the org (Settings → Danger Zone →
      Transfer ownership). Transfer, do **not** recreate — transferring
      preserves history, issues, PRs, stars, and sets up automatic redirects
      from the old path.
- [ ] Keep the repo **public** through the transfer.

### 3.3 Add the team

- [ ] Add team members with appropriate roles
- [ ] Create teams/permissions as needed

### 3.4 Re-establish secrets and CI (they do not transfer)

Repo/org **secrets do not travel with a transfer.** Your release pipeline will
break until these are re-added at the org level.

- [ ] Re-add the CI token(s) used to publish releases, at the org level with
      correct scope
- [ ] Re-add the **R2 credentials** (access key / secret) as org secrets
- [ ] Re-add the **signing certs and passwords** (macOS Developer ID, Apple
      notarization credentials, Windows signing) as org secrets
- [ ] Run a test release through CI to confirm the pipeline still builds,
      signs, and publishes to R2 from the org repo

---

# Phase 4 — Flip to private

Only after Phase 2 confirms legacy clients are a negligible tail and Phase 3's
pipeline works from the org.

### 4.1 Final checks

- [ ] Analytics confirm pre–Phase 1 clients are a negligible tail
- [ ] A test release from the org repo builds, signs, and publishes to R2
- [ ] A test client updates successfully from R2

### 4.2 Go private

- [ ] Flip the repo to private (Settings → Danger Zone → Change visibility)
- [ ] The old GitHub Release assets become auth-gated — this no longer matters,
      because current clients update from R2

### 4.3 CI minutes note

Public repos get unlimited GitHub Actions minutes; **private repos draw from a
quota, and macOS runners bill at ~10x.** A three-OS release build on a private
repo consumes real quota.

- [ ] Check your plan's included Actions minutes before relying on CI for
      releases, so a release doesn't fail on a billing wall

### 4.4 Repoint anything that assumed a public repo

- [ ] Marketing site / docs links that pointed at public GitHub URLs (raw file
      links, release badges, "download latest" links pointing at GitHub
      Releases) — repoint to R2 / your domain
- [ ] README badges or links that break when private
- [ ] Any external service reading from the public repo

---

# Phase 5 — Clean up the stragglers

Some users on very old versions (below Phase 1) are still pointed at GitHub and
are now stranded. Plan for them explicitly.

- [ ] Send a one-time email (via Loops) to users, telling anyone on an old
      version to download once from `scampdesign.app`
- [ ] Add a website note / banner with the same message
- [ ] After a straggler manually re-downloads once, they are on the R2 feed and
      self-healing from then on

---

## Quick reference — the safe order

1. **Phase 0** — decide R2 update endpoint (paper)
2. **Phase 1** — repoint updater to R2, release it **while public**
3. **Phase 2** — wait for adoption; watch analytics
4. **Phase 3** — create org, **transfer** repo (still public), re-add secrets
5. **Phase 4** — flip to **private**; fix CI minutes + public-repo links
6. **Phase 5** — email stragglers to re-download once

**The single inviolable rule:** the R2-based updater must be in users' hands
(Phase 1, verified in Phase 2) **before** the repo goes private (Phase 4). Do
those out of order and you break auto-updates for your entire active user base
at once, with manual re-download as the only recovery.

---

## Notes specific to Scamp

- **This maps to the CI/CD pipeline work (Linear SCMP-85).** That issue —
  tag-triggered build, sign, and publish to R2 — is exactly the Phase 1
  mechanism. Building it and cutting one release through it while public *is*
  Phase 1.
- **Windows signing decision (SignPath vs Certum)** is a soft blocker on the
  Windows half of the pipeline. SignPath is CI-native, which helps here.
- **The BSL license consideration:** going fully private means the source is no
  longer visible, so the "source-available" benefit of the Business Source
  License (transparency, eventual AGPL conversion) goes dormant while private.
  Not a blocker, just a conscious trade to confirm — the private move should be
  deliberate, since it changes what the license is doing for you.