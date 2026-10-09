# Accounts

You can sign in to a Scamp account from the start screen. Signing in is
optional: Scamp is a local-first tool, and every feature except the
[Scamp Agent](scamp-agent.md) works the same whether you're signed in or
not. Nothing prompts you on launch, and there's nothing to dismiss.

## Sign in

The account panel sits at the bottom of the sidebar on the start
screen, below your projects. Signing in is an account-level action
rather than a per-project one, which is why it lives here rather than
inside an open project.

1. At the bottom of the start-screen sidebar, click **Sign in**.
2. Your browser opens at scamp.club. Sign in there, or create an account.
3. The browser hands the result back to Scamp automatically. The panel
   fills in with your name and email address.

While Scamp waits, the button reads **Waiting for browser…**, with
"Finish signing in in your browser." and a **Cancel** link below it.
**Cancel** stops the wait immediately; you don't have to close the
browser tab.

If you never finish in the browser, the attempt gives up after 15
minutes, and the panel returns to signed out.

## After you sign in

The panel shows an avatar with your initial, your name, your email
address, and a **Sign out** link. Long email addresses are shortened so
they can't widen the sidebar.

Signing in or out updates every open Scamp window, not only the one you
used.

### What an account does today

Being signed in doesn't change how you design. Scamp still stores every
project as ordinary files on your machine, still works offline, and
still never uploads your work. Today an account exists so that:

- Your installation is counted as active while the app is open.
- Cloud features can be added later without asking you to sign in again.

Your projects, page contents, images, and project names are never sent
anywhere as part of this.

## How long a session lasts

Sessions last 30 days and renew every time you use them, so they expire
from disuse rather than on a fixed date. In practice, using Scamp
regularly means you stay signed in.

If your session expires, Scamp signs you out locally rather than leaving
the panel claiming you're signed in until you restart.

## Where Scamp stores your sign-in

Scamp stores the session token encrypted by your operating system's own
secure storage: Keychain on macOS, DPAPI on Windows, and your keyring on
Linux. The app's main process holds it, and it never reaches the part of
Scamp that renders your designs.

Some systems can't provide secure storage, most commonly a Linux machine
without a keyring. When that happens, Scamp signs you in for the current
session only and tells you so:

> This device can't store your sign-in securely, so you'll need to sign
> in again next time you open Scamp.

You stay signed in until you quit. Nothing is written to disk
unencrypted.

## Sign out

In the account panel, click **Sign out**. Scamp deletes the stored token
from your machine immediately, and every open window updates.

## One window at a time

Scamp runs as a single instance. Launching it again focuses the window
you already have rather than opening a second copy. This is what lets
the browser hand a completed sign-in back to a known place.

## Troubleshooting

**The browser opened, but nothing happened when I signed in.**
Check that you completed sign-in in the browser window Scamp opened,
rather than in an existing tab that's already signed in elsewhere. If
the panel is still waiting, click **Cancel** and try again.

**Sign-in says it failed with no obvious reason.**
The panel shows the reason under the button. A network error and an
unreachable server both appear here. Trying again is safe.

**I signed in, but I'm signed out again after a restart.**
Your OS couldn't store the token securely; the panel says so while
you're signed in. See
[Where Scamp stores your sign-in](#where-scamp-stores-your-sign-in).

## Related pages

- [Get started](getting-started.md): The start screen.
- [Settings](settings.md): Privacy and anonymous usage counting, which is
  separate from your account and controlled independently.
