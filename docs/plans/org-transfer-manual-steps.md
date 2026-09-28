# Moving the repo to an organization — step-by-step

Transferring `angiehemans/scamp` into a GitHub **organization** without
breaking auto-updates or macOS signing.

Every click and command is here. Do the phases top to bottom; each one
says what to hand back to me. Phases A–D keep the repo **public** and
are safe to do this week. Phase E (going private) is deliberately
separate and gated on a measurement — see
[`update-feed-migration.md`](../notes/update-feed-migration.md).

| Value | Assumed |
|---|---|
| New owner | `scampdesign` — the org already holds `scampdesign/scampjs` |
| Repo name | `scamp` (unchanged), so `scampdesign/scamp` |
| Update feed | `https://updates.scamp.club` — **unchanged, and unaffected by all of this** |

---

## Why this is safe now, and what the real risks are

The thing that used to make this dangerous is already fixed. The feed
baked into every recent install is the R2 bucket, not GitHub: the
`generic` provider is first in `electron-builder.yml`, so
`app-update.yml` inside the app says `updates.scamp.club`. R2 doesn't
know or care who owns the source repo. **Moving the repo cannot break a
migrated client**, because a migrated client never contacts GitHub.

Three things genuinely need attention, and one thing that sounds
frightening does not:

**1. The un-migrated tail still reads GitHub.** `electron-builder.yml`
still publishes to GitHub second, and that copy is the only way installs
from before `v0.7.1` find a new version. Those clients poll
`github.com/angiehemans/scamp/releases.atom`. A transfer leaves a
redirect at the old path and electron-updater follows redirects, so they
should keep working — but "should" is doing real work in that sentence,
so Phase C verifies it instead of assuming.

**2. CI credentials.** Ten secrets and one variable drive the release.
Treat them as not surviving the transfer and check, rather than find out
on a tag push.

**3. Four hardcoded strings** name the personal account: the `owner:`
in the publish block, `homepage` in `package.json`, `REPO_URL` in the
app menu (**Help → Report a bug**), and a line in `LICENSE`. I change
these; the menu one has a user-visible consequence in Phase E.

**What is NOT at risk: macOS signing.** The Developer ID certificate,
the Team ID, and the notarization credentials are **Apple** things. They
live in your Apple Developer account and in the `MAC_CERTS` /
`MAC_CERTS_PASSWORD` / `APPLE_ID` / `APPLE_ID_PASSWORD` /
`APPLE_TEAM_ID` secrets. GitHub ownership has no bearing on any of them.
Copy those five secrets across unchanged and macOS signing continues
exactly as it does today.

**Caution:** The one way to break macOS updates is to change the Apple
signing identity, and a GitHub org can tempt you into also converting
the *Apple* account to an organization. Don't — not in the same change.
Squirrel.Mac validates that an update's code signature matches the
installed app's, so a new Team ID makes every existing macOS install
reject the update with a validation error, and no later fix reaches
them. Keep the same Developer ID throughout. If the Apple account ever
moves, that is its own migration with its own bridge release.

---

## Step 0 — publish the v0.8.5 release draft — DONE 2026-09-28

`0.8.5` is published and shows as **Latest**, and `releases.atom` names it,
so un-migrated clients can see it. Left here because it has to be repeated
for every release: electron-builder always leaves the GitHub release a
draft.

electron-builder leaves the GitHub release as a **draft**, and GitHub
doesn't list drafts in `releases.atom`. So un-migrated clients cannot
see `0.8.5` at all — they're pinned at `0.8.0`. That also makes the
Phase E measurement meaningless, because the count stops moving for the
wrong reason.

1. Open the [releases page](https://github.com/angiehemans/scamp/releases).
2. `0.8.5` shows as **Draft**. Click it, then click **Edit**.
3. Check that all 12 assets are attached.
4. Click **Publish release**.

Or ask me and I'll run `gh release edit v0.8.5 --draft=false`, and set
the body from the `docs/CHANGELOG.md` entry at the same time.

Then confirm an un-migrated client can see it:

```bash
curl -s https://github.com/angiehemans/scamp/releases.atom | grep -m1 '<title>'
```

It should name `0.8.5`.

---

## Phase A — before you touch anything

### A.1 Create the organization

1. Go to [github.com/organizations/new](https://github.com/organizations/new).
2. Pick a plan. **Free** is fine for now; note the Actions quota in E.4
   before you rely on it for private releases.
3. Enter the organization name and your email, and choose **My personal
   account** for who it belongs to.
4. Skip adding members for now — you can add them after the transfer.

Tell me the final organization name.

### A.2 Record what the release needs

Run this and keep the output. It's your checklist for Phase C:

```bash
gh secret list && gh variable list
```

As of 2026-09-28 that is ten secrets and one variable:

| Name | What it does | Where the value comes from |
|---|---|---|
| `MAC_CERTS` | Developer ID cert, base64 `.p12` | Your keychain export — **keep identical** |
| `MAC_CERTS_PASSWORD` | Password for that `.p12` | Same |
| `APPLE_ID` | Notarization account | Apple Developer |
| `APPLE_ID_PASSWORD` | App-specific password | appleid.apple.com |
| `APPLE_TEAM_ID` | Signing team | Apple Developer — **keep identical** |
| `R2_ACCESS_KEY_ID` | R2 API token | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret | Cloudflare R2 |
| `R2_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | Cloudflare R2 |
| `R2_BUCKET` | `scamp-releases` | Cloudflare R2 |
| `GH_TOKEN` | Publishes the GitHub release | A PAT — see A.3 |
| `UPDATE_FEED_URL` (variable) | `https://updates.scamp.club` | The feed host |

`WIN_CERTS` / `WIN_CERTS_PASSWORD` are absent, which is why Windows
builds ship unsigned today. Nothing about this migration changes that.

**You cannot read a secret's value back out of GitHub.** If the `.p12`
and the passwords aren't in a backup you can still open, see
[A.4](#a4-if-youve-lost-the-values) — most of the list is a lookup, and
the certificate has two cases.

### A.3 Check what kind of token `GH_TOKEN` is

This is the one credential that can quietly stop working in an org.

1. Go to
   [Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens).
2. Find the token used for releases. Note whether it's under **Tokens
   (classic)** or **Fine-grained tokens**.

- **Classic**, with `repo` scope: keeps working against an org repo as
  long as you have write access — unless the org turns on the personal
  access token policy that blocks classic tokens.
- **Fine-grained**: scoped to a single resource owner. A token owned by
  your personal account **cannot reach an org repo at all** until the
  org opts in, under **Organization settings → Personal access tokens →
  Settings**, and you then grant the token access to the new repo.

Either way the fix is cheap: after the transfer, mint a fresh token
whose resource owner is the org and give it write access to `scamp`
only. Tell me if you'd rather do that than debug the existing one.

### A.4 If you've lost the values

The live secrets still work — `v0.8.5` built, signed, and notarized on
2026-09-28 — so nothing is broken. GitHub just won't show you a secret's
value again, which only matters when you have to type it somewhere new.
Recover what's missing before Phase C, not before Phase B.

Most of the list is a lookup rather than a loss:

| Secret | How to get it back |
|---|---|
| `APPLE_ID` | Your Apple ID email |
| `APPLE_TEAM_ID` | developer.apple.com → **Membership details**. Or, with no login at all, `codesign -dv --verbose=4 /Applications/Scamp.app` on any Mac with Scamp installed — it prints `TeamIdentifier=` |
| `APPLE_ID_PASSWORD` | Not readable, but disposable: appleid.apple.com → **Sign-In and Security** → **App-Specific Passwords** → generate a new one. Revoke the old if you can identify it |
| `MAC_CERTS_PASSWORD` | You chose it on export. Forgotten is fine — re-export the `.p12` with a new password |
| `R2_SECRET_ACCESS_KEY` | Shown once at creation. Create a **new** R2 API token (Cloudflare → R2 → **Manage API tokens**), with Object Read & Write on `scamp-releases`, and delete the old one after the first green release |
| `R2_ACCESS_KEY_ID` | Comes with that new token |
| `R2_ENDPOINT`, `R2_BUCKET` | Cloudflare R2 dashboard — the account ID is on the R2 overview page |
| `GH_TOKEN` | Mint a new one. You need an org-scoped token anyway — see A.3 |
| `UPDATE_FEED_URL` | `https://updates.scamp.club` |

`MAC_CERTS` is the only one with a real question behind it.

**Apple does not have your private key.** It was generated on the Mac
that made the certificate request and has only ever lived in that Mac's
keychain; Apple stores the certificate, which is the public half. So
there is no re-download that gives you a usable signing identity. What
happens next depends on whether that key is still there.

**Case A — the key is still in a keychain.** The common case, if you
still have the Mac you set this up on.

1. On that Mac, open **Keychain Access**.
2. Select the **login** keychain, then the **My Certificates** category.
3. Find **Developer ID Application: … (TEAMID)**.
4. Click its disclosure triangle. **A private key must be listed under
   it.** No triangle, or no key, means the key is gone — go to case B.
5. Right-click the **certificate** row, not the key, and choose
   **Export**. Saving from the certificate row is what puts both halves
   in the file.
6. Save as **Personal Information Exchange (.p12)** and set a password.
   That password is `MAC_CERTS_PASSWORD`.
7. Turn it into the secret:

   ```bash
   base64 -i certificate.p12 | pbcopy
   ```

   macOS `base64` emits one unwrapped line, which is what a GitHub secret
   needs. Paste it as `MAC_CERTS`.

Nothing about the identity changes in this case. Same certificate, same
team, same everything.

**Case B — the key is gone.** Then the old certificate is dead weight and
you make a new one. This is routine: Developer ID certificates expire
every five years and get replaced without stranding anyone.

1. On a Mac, open **Keychain Access** → **Certificate Assistant** →
   **Request a Certificate From a Certificate Authority**. Enter your
   email, leave the CA field alone, choose **Saved to disk**, and save the
   `.certSigningRequest`. This generates the new private key **on that
   Mac** — so do this on the machine that will hold it.
2. Go to
   [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
   and click **+**.
3. Choose **Developer ID Application**, and where it asks, select
   **Developer ID Application (Xcode 11 or later)** if offered.
4. Upload the `.certSigningRequest`, then download the `.cer`.
5. Double-click the `.cer` to install it into the login keychain, then
   export the `.p12` exactly as in case A steps 2–7.

**Caution:** Don't revoke the old certificate unless you have to. Creating
a new one doesn't require it, and revocation is not the same as letting a
certificate expire — a signature whose certificate was revoked can stop
validating on machines that have already downloaded the build, while an
expired one keeps working because of the secure timestamp. Apple caps
Developer ID Application certificates per account (five, historically),
so revoke only if you're at the cap and the creation button is disabled.

**Why case B does not break auto-updates.** A new certificate on the
**same team** is safe. Squirrel.Mac checks an update against the installed
app's *designated requirement*, which pins the signing identity by team —
the leaf certificate's common name, `Developer ID Application: Name
(TEAMID)` — not by that specific certificate's serial number. That is why
a five-year renewal doesn't strand installed apps. The thing that does
break them is a different **Team ID**, which is the trap in the caution at
the top of this document, and it is not what losing a `.p12` causes.

Don't take that on trust. On a Mac with the current Scamp installed:

```bash
codesign -d --requirements - /Applications/Scamp.app
```

The requirement it prints should name the identity by common name or team,
with no serial number in it. If it somehow pins a serial, say so before
you release with a new certificate, because then the rule above doesn't
hold and the next release needs its own bridge.

The full original procedure, for reference, is
`docs/archive/auto-update-prd.md` section 1.1 — steps 2 through 6 are what
you are redoing.

---

## Phase B — the transfer, with the repo still public

Transfer and going private are separate steps. Don't combine them.

1. Open
   [repo settings](https://github.com/angiehemans/scamp/settings) and
   scroll to **Danger Zone**.
2. Click **Transfer** next to **Transfer ownership**.
3. For the new owner, enter the organization name.
4. Type `angiehemans/scamp` to confirm, and click **I understand, transfer
   this repository**.

The transfer keeps history, tags, releases and their assets, issues, PRs,
and the 11 stars, and leaves a redirect at the old path. There are **0
forks**, so nobody holds a GitHub-side copy that could go stale.

Then, on your machine:

```bash
cd ~/Documents/github/scamp
git remote set-url origin git@github.com:scampdesign/scamp.git
git remote -v
git fetch origin && git status
```

The redirect means the old URL keeps working, but leaving it pointing at
a redirect is the kind of thing that confuses someone in six months.

Hand back: the new `nameWithOwner`, from `gh repo view --json nameWithOwner`.

---

## Phase C — put CI back together and prove it works

### C.1 Check what survived

```bash
gh secret list && gh variable list
```

Compare against A.2. Re-add anything missing under **Settings → Secrets
and variables → Actions** in the new repo — **Secrets** tab for the ten,
**Variables** tab for `UPDATE_FEED_URL`.

The org already holds a second repo (`scampjs`), so the **organization
level** is probably the better home for these: add them under
**Organization settings → Secrets and variables → Actions**, and set each
one's repository access to include `scamp`. Repo-level secrets win over
org-level ones with the same name, so don't keep both — pick one place.

Keep the five Apple secrets together wherever they go. They are the
signing identity, and splitting them across two scopes is how one of them
gets rotated alone.

### C.2 Check Actions is allowed to run

New organizations can default to restricting workflows.

1. Go to **Organization settings → Actions → General**.
2. Under **Actions permissions**, confirm **Allow all actions and reusable
   workflows** is selected. The release uses `actions/checkout@v5` and
   `actions/setup-node@v5`; if you'd rather be strict, the narrower
   **Allow enterprise, and select non-enterprise, actions** setting with
   *Allow actions created by GitHub* ticked covers both.
3. Under **Workflow permissions**, **Read repository contents** is enough
   — the release publishes with `GH_TOKEN`, not the built-in token.

### C.3 Prove it end to end with a real release

A throwaway patch version is the only honest test. Ask me for `v0.8.6`
and I'll bump, write the changelog entry, run the suite, and tag; you
push the tag as we did for `0.8.5`.

What has to be true when it finishes:

1. All six jobs green — `check`, three platform builds, `verify-feed`.
2. The macOS build is **signed and notarized**. The build log's
   `notarize` step succeeds, and on a Mac:

   ```bash
   codesign -dv --verbose=4 /Applications/Scamp.app 2>&1 | grep -i 'authority\|teamid'
   spctl -a -vvv /Applications/Scamp.app
   ```

   The Team ID must match the one in the `0.8.5` build. A different one
   means the wrong cert went into the new secrets — stop and fix it
   before any user sees that build.
3. The feed is complete:

   ```bash
   npm run verify:feed
   ```

4. A real Mac running `0.8.5` takes the update from R2.
5. The un-migrated path still works through the redirect:

   ```bash
   curl -sI https://github.com/angiehemans/scamp/releases.atom | head -3
   curl -s https://github.com/angiehemans/scamp/releases.atom | grep -m1 '<title>'
   ```

   Expect a `301` and, after the redirect, `0.8.6`. If the feed does
   **not** resolve, un-migrated clients are stranded early — tell me and
   I'll keep the old path alive rather than let them find out silently.

---

## Phase D — the in-repo strings (I do these)

Once you give me the org name, in one commit:

| File | Change | Why it matters |
|---|---|---|
| `electron-builder.yml` | `publish[1].owner` → `scampdesign` | The GitHub half of dual-publish; wrong owner fails the release upload |
| `package.json` | `homepage` | Cosmetic, but it's what npm and tooling show |
| `src/main/menu.ts` | `REPO_URL` | **Help → Report a bug** and the repo menu item |
| `LICENSE` | `Source repository:` | The BSL names the repo it applies to |

Plus the note updates: `auto-update.md`, `update-feed-migration.md`, and
this file's assumptions table.

The `owner:` change is the only one that affects a build. Note that it
lands in the same release as C.3 — which is why C.3 is a real release and
not a dry run.

---

## Phase E — going private (later, and gated)

Not part of the move. The transfer above works fine with the repo public,
and public is what keeps the un-migrated tail alive.

### E.1 The gate

Drop GitHub only when the tail has flattened. The metric is GitHub's
download count on the newest release's `latest*.yml`, which only
un-migrated clients fetch:

```bash
gh release view <newest-tag> --json assets \
  -q '.assets[] | select(.name|startswith("latest")) | "\(.name) \(.downloadCount)"'
```

Where it stood on 2026-09-28, before `0.8.5` was published:

| Release | `latest-mac.yml` | `latest.yml` |
|---|---|---|
| v0.7.1 (bridge) | 63 | 4 |
| v0.7.2 | 111 | 9 |
| v0.8.0 | 41 | 0 |

Falling, and not yet flat. At roughly six checks a day per client, 41
fetches over two days is a handful of installs still on the old feed —
small, but not zero. Watch `0.8.5` and `0.8.6` before deciding.

### E.2 The order

1. I drop the `github` entry from `publish` in `electron-builder.yml`.
2. Ship one release on R2 only. Confirm migrated clients still update.
3. You flip the repo private: **Settings → Danger Zone → Change
   visibility**.
4. Rotate `GH_TOKEN` if its scope was ever broader than this repo.

### E.3 What breaks for users the moment it's private

**Help → Report a bug** opens
`github.com/scampdesign/scamp/issues/new`, and a private repo returns 404 for
anyone outside the org. Every user who clicks it sees a dead page. Decide
before flipping where bug reports should go — a form on the site, an
email address, or a small public issues-only repo — and ask me to
repoint `REPO_URL`. This is the only user-facing regression on the list,
and it's easy to forget because it isn't the updater.

Also repoint anything that assumed a public repo: README badges, and any
"download latest" link pointing at GitHub Releases rather than the site.

### E.4 Actions minutes

Public repos get unlimited Actions minutes. Private repos draw from a
quota, and **macOS runners bill at 10x, Windows at 2x**. A three-platform
release is the expensive part; `ci.yml` is Linux-only at 1x, and the e2e
suite stays local, which is why it isn't in CI. Check the org plan's
included minutes before the first private release, so a release doesn't
fail on a billing wall.

---

## What this does not touch

Worth stating plainly, because it's most of the anxiety:

- **Cloudflare, R2, the bucket, and `updates.scamp.club`.** Not GitHub
  resources. Nothing about them changes.
- **The Apple Developer account, the Developer ID cert, and the Team
  ID.** See the caution at the top.
- **Every installed copy of Scamp from `v0.7.1` on.** Its feed is R2 and
  it will not notice any of this happened.
