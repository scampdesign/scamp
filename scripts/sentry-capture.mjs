/**
 * A local stand-in for Sentry's ingest endpoint, for checking what Scamp
 * actually sends without waiting on (or polluting) the real project.
 *
 * Usage:
 *   1. node scripts/sentry-capture.mjs
 *   2. In `.env.local`, temporarily set:
 *        SENTRY_DSN=http://anykey@127.0.0.1:9999/1
 *   3. npm run dev, and opt in when prompted.
 *
 * It prints one line per session and per error event. The two things worth
 * watching, both from docs/archive/2026-08-11-dau-tracking-plan.md:
 *
 *   - SESSION lines must show `did=<uuid>`. A `did=(none)` means the install
 *     id isn't reaching the session, and Sentry can't count unique users.
 *   - Exactly ONE session per launch. Two means the renderer is opening its
 *     own as well as main, and every user would be counted twice.
 *   - EVENT lines must show `user=null`. Anything else means a crash report
 *     became linkable to an install.
 *
 * Put the real DSN back in `.env.local` when you're done.
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 9999);

let sessions = 0;

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    // Sentry doesn't care what we return, only that it's a 200.
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');

    // An envelope is newline-delimited JSON: an envelope header, then
    // alternating item-header / item-payload lines.
    const lines = body.split('\n').filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      let header;
      try {
        header = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      let payload;
      try {
        payload = JSON.parse(lines[i + 1] ?? '{}');
      } catch {
        continue;
      }

      if (header.type === 'session') {
        sessions += 1;
        const did = payload.did ?? '(none)';
        const flag = did === '(none)' ? '  ← NO INSTALL ID' : '';
        console.log(
          `SESSION #${sessions}  did=${did}  status=${payload.status}${flag}`
        );
      } else if (header.type === 'event') {
        const user = JSON.stringify(payload.user ?? null);
        const flag = user === 'null' ? '' : '  ← USER LEAKED INTO AN EVENT';
        console.log(`EVENT    user=${user}${flag}`);
      }
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Sentry capture listening on http://127.0.0.1:${PORT}`);
  console.log(`Set SENTRY_DSN=http://anykey@127.0.0.1:${PORT}/1 in .env.local\n`);
});
