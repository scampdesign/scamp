# Update feed on R2 — step-by-step guide for the manual tasks

This walks through every **[you]** task in `update-feed-r2-plan.md`, in
order, with the exact clicks and commands. Do them top to bottom; each
section says what to hand back to me when it's done.

The plan assumes these values. If you change one in phase 0, use your
value everywhere below.

| Value | Assumed |
|---|---|
| Update host | `updates.scamp.club` |
| Bucket | `scamp-releases` |
| Feed location | Bucket root, with `archive/<version>/` copies |

**Before you start:** the custom domain step needs `scamp.club` to be a
zone on your Cloudflare account, because R2 custom domains are created
as DNS records in a Cloudflare zone. If the site's DNS is hosted
elsewhere, either move the zone to Cloudflare first or pick a domain
that already is. Check under **Websites** in the Cloudflare dashboard.

---

## Phase 0 — write down the four decisions

1. Open `docs/plans/update-feed-r2-plan.md`.
2. Under **Phase 0**, tick each box and, if you're not taking the
   recommendation, write your value next to it.
3. Tell me the final host, bucket name, and layout. I'll put them at the
   top of the plan and use them in the config.

---

## 1.1 Create the bucket

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. In the left sidebar, click **R2 Object Storage**.
3. Click **Create bucket**.
4. For **Bucket name**, enter `scamp-releases`.
5. Leave **Location** on **Automatic** and the storage class on
   **Standard**.
6. Click **Create bucket**.

Write down your **Account ID**. It's shown in the right column of the
R2 overview page, and it's also the first segment of the S3 endpoint you
need in the next steps: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

## 1.1 Attach the custom domain and make it public

1. Open the `scamp-releases` bucket and click the **Settings** tab.
2. Under **Public access**, find **Custom Domains** and click
   **Connect Domain**.
3. Enter `updates.scamp.club` and click **Continue**.
4. Cloudflare shows the DNS record it will create. Click
   **Connect Domain**.
5. Wait for the domain's status to read **Active**. This usually takes a
   minute or two.

6. Turn edge caching off for the feed. Open the `scamp.club` zone under
   **Websites**, then **Caching** → **Cache Rules** → **Create rule**.
   Name it `updates feed - bypass`, set the match to **Hostname equals
   `updates.scamp.club`**, set **Cache eligibility** to **Bypass cache**,
   and deploy it. Without this, Cloudflare caches installers for four
   hours, and electron-updater doesn't cache-bust installer downloads,
   so a release re-run that re-uploads a file under the same name serves
   stale bytes from the edge and fails the updater's checksum. R2 egress
   is free, so caching buys nothing here.

Leave **R2.dev subdomain** disabled. It's rate-limited and not meant for
production traffic, and the updater must never see that URL.

**Check it works.**

1. Back on the bucket's **Objects** tab, click **Upload** and upload any
   small file, for example a text file named `hello.txt`.
2. In a browser, open `https://updates.scamp.club/hello.txt`. You should
   see its contents over HTTPS with no login.
3. Delete `hello.txt` from the bucket.

## 1.1 Create the API token

1. In the R2 overview page, in the right column, click
   **Manage R2 API Tokens** (on some accounts this is under
   **API** → **Manage API tokens**).
2. Click **Create API token**.
3. Name it `scamp-releases-ci`.
4. Under **Permissions**, select **Object Read & Write**.
5. Under **Specify bucket(s)**, select **Apply to specific buckets
   only** and select `scamp-releases`.
6. Leave **TTL** on **Forever**. Leave **Client IP Address Filtering**
   empty.
7. Click **Create API Token**.

The next page shows the credentials **once**. Copy all three:

- **Access Key ID**
- **Secret Access Key**
- The endpoint under **Use jurisdiction-specific endpoints for S3
  clients**, which looks like
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Use the default one,
  not an EU or FedRAMP variant.

Keep them in your password manager. If you close the page without
copying the secret, delete the token and create a new one.

## 1.1 Add the secrets and the variable to GitHub

1. Open `https://github.com/angiehemans/scamp/settings/secrets/actions`.
2. Click **New repository secret** and add each of these, one at a
   time:

   | Name | Value |
   |---|---|
   | `R2_ACCESS_KEY_ID` | The Access Key ID from the token page |
   | `R2_SECRET_ACCESS_KEY` | The Secret Access Key |
   | `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `R2_BUCKET` | `scamp-releases` |

3. Click the **Variables** tab, then **New repository variable**:

   | Name | Value |
   |---|---|
   | `UPDATE_FEED_URL` | `https://updates.scamp.club` |

Secrets are hidden after you save them; variables stay readable. Check
the four secret names and the variable name against the table
character for character, because the workflow fails hard when one is
missing.

**Hand back:** tell me the bucket is public, the domain is active, and
the five entries are in GitHub. I then do 1.2 (the config, the workflow
step, the verify script, and the docs) and 1.3 (the version bump and
tag), and stop before pushing.

---

## 1.3 Push the bridge release and publish it

1. When I say the tag is ready, reply **push it**. I push `main` and the
   `v0.7.1` tag.
2. Open `https://github.com/angiehemans/scamp/actions` and click the
   **Release** run for `v0.7.1`.
3. Wait for all three jobs to go green. Open each job and confirm you see
   the **Upload to R2** step and, on the Linux job, the **Verify update
   feed** step, both green. If any step is red, copy the step's log into
   the chat and stop here; don't publish the draft.
4. Open `https://github.com/angiehemans/scamp/releases`. The `v0.7.1`
   draft is at the top.
5. Click **Edit** on the draft, check that the assets list includes the
   three `latest*.yml` files and all installers, and click
   **Publish release**.

Existing installs now pick up 0.7.1 from GitHub on their next launch or
four-hour check.

---

## 1.4 Verify on a Mac

Use a Mac that has 0.7.0 installed from the GitHub release, the way
any user's machine is. Updating from what's already installed is the
real test.

**Take the bridge update from GitHub.**

1. Launch Scamp. The updater checks on launch and downloads in the
   background. Within a minute or two, the update banner offers
   **Restart and install**. Click it.

   If no update appears, check `~/Library/Logs/Scamp/main.log` for
   `[updater]` lines. A local dev build, a version other than 0.7.0, or
   a half-downloaded update in the cache are the usual reasons. To reset:
   quit Scamp, run
   `rm -rf ~/Library/Caches/scamp-updater ~/Library/Application\ Support/Caches/scamp-updater`,
   install `Scamp-0.7.0-arm64.dmg` from the v0.7.0 GitHub release over
   the existing app, and launch again.
2. After the restart, open **Settings** and confirm the version reads
   **0.7.1**.

**Confirm the bridge points at R2.** This is the check that matters.

3. In Terminal:

   ```bash
   cat /Applications/Scamp.app/Contents/Resources/app-update.yml
   ```

   You want to see:

   ```yaml
   provider: generic
   url: https://updates.scamp.club
   ```

   If it says `provider: github`, stop and tell me. The publish order
   is wrong, and nothing else in this section is worth doing until it's
   fixed.

**Confirm the feed is complete.**

4. In the repo folder on your machine:

   ```bash
   npm run verify:feed
   ```

   It prints a table of every file the three `latest*.yml` files list,
   with a check per file. It exits with an error and names the file if
   anything is missing, the wrong size, or not range-capable.

**Take the next update from R2.**

5. Ask me for `v0.7.2`. It can be a real release or a throwaway with a
   one-line changelog entry; I bump, tag, and you push and publish as in
   1.3.
6. On the test Mac, quit and relaunch Scamp (or wait up to four hours).
   Accept the update when the banner appears. Confirm **Settings** reads
   **0.7.2**.
7. Prove GitHub wasn't involved:

    ```bash
    gh release view v0.7.2 --json assets \
      -q '.assets[] | select(.name|startswith("latest")) | "\(.name) \(.downloadCount)"'
    ```

    `latest-mac.yml` should show a download count of `0`, or whatever it
    was before your test machine updated. A migrated client never
    touches GitHub.

If an update fails at any step, the updater log has the reason:

```bash
tail -50 ~/Library/Logs/Scamp/main.log
```

Paste the `[updater]` lines into the chat.

**Optional: the same on Windows.** Install `Scamp-Setup-0.7.0.exe`,
launch, take the update, then check
`%LOCALAPPDATA%\Programs\Scamp\resources\app-update.yml` and the log at
`%APPDATA%\Scamp\logs\main.log`. Windows builds are unsigned today, so
SmartScreen shows "unknown publisher" on the fresh install; that's
expected and unchanged by this work.

---

## 1.5 Record the baseline and start phase 2

1. Run:

   ```bash
   gh release view v0.7.1 --json assets \
     -q '.assets[] | select(.name|startswith("latest")) | "\(.name) \(.downloadCount)"'
   ```

2. Paste the three numbers and the date into a comment on Linear
   SCMP-85, or into `docs/notes/update-feed-migration.md` under a
   **Phase 3 log** heading. Repeat after each release.

Phase 2 is waiting: keep releasing normally, and the counts on the
newest release's `latest*.yml` tell you how many clients are still on
GitHub. When they flatten across a couple of consecutive releases,
phase 2 is done and the guide's phase 3 (create the org, transfer the
repo) can start.

---

## If something goes wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| `https://updates.scamp.club/hello.txt` doesn't load | Domain not active yet, or `scamp.club` isn't a Cloudflare zone | Wait a few minutes; check the domain status in the bucket's Settings; confirm the zone is on Cloudflare |
| The **Upload to R2** step fails with `InvalidAccessKeyId` or `SignatureDoesNotMatch` | A secret is wrong or misnamed | Re-create the token and re-enter all four secrets |
| The **Upload to R2** step fails with `NoSuchBucket` | `R2_BUCKET` or `R2_ENDPOINT` is wrong | Compare with the bucket name and the endpoint on the token page |
| `app-update.yml` says `github` | Publish order is wrong | Tell me; it's a one-line fix and a new release |
| The 0.7.1 machine shows an update error banner | The feed is incomplete or unreachable | Run `npm run verify:feed` and paste the output |
| `verify:feed` reports **stale edge cache** | A file was re-uploaded under the same name and Cloudflare still serves the old copy | Purge those URLs: zone → **Caching** → **Configuration** → **Purge Cache** → **Custom purge** → paste the URLs. Then add the bypass Cache Rule from 1.1 if it's missing |
| The update downloads but won't install on macOS | Signing identity changed | Stop. Confirm the same Developer ID cert and notarization secrets are in CI |
