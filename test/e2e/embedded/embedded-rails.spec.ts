import { promises as fs, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from '../fixtures/app';
import { attachEmbedded, clickInPage, copyEmbeddedApp, inPage, startEmbedded } from '../fixtures/embedded';
import { commitInput, panelInputByPrefix } from '../fixtures/panel';

/**
 * Embedded Scamp attached to a running Rails app, without Ruby: a server
 * here sends the HTML Rails renders from the fixture's templates, comments
 * and all, and a stand-in for Turbo swaps the page's body on a link click.
 * see docs/plans/embedded-rails-plan.md
 */

const RENDERED = path.join(__dirname, '../../fixtures/embedded-rails/rendered');
const PAGES: Record<string, { file: string; type: string }> = {
  '/patients': { file: 'patients.html', type: 'text/html' },
  '/other': { file: 'other.html', type: 'text/html' },
  '/turbo.js': { file: 'turbo.js', type: 'text/javascript' },
};

const SCRIPT = path.join(os.tmpdir(), `scamp-e2e-embedded-rails-${process.pid}.json`);
writeFileSync(
  SCRIPT,
  JSON.stringify([
    {
      content: [
        {
          type: 'tool_use',
          name: 'edit_file',
          input: { path: 'app/views/patients/_card.html.erb', old_string: '<h2 class="card__name">', new_string: '<h2 class="card__name" style="padding: 12px">' },
        },
      ],
    },
    { content: [{ type: 'text', text: 'Set the name’s padding in the card partial.' }] },
  ])
);

test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_SCRIPT: SCRIPT } });

let server: Server;
let url: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const page = PAGES[req.url ?? ''];
    if (req.url === '/') {
      res.writeHead(302, { location: '/patients' }).end();
    } else if (page === undefined) {
      res.writeHead(404).end();
    } else {
      res.writeHead(200, { 'content-type': page.type }).end(readFileSync(path.join(RENDERED, page.file)));
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  url = `localhost:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((done) => server.close(done));
});

test('attaches to a running Rails app, maps elements to templates, follows a Turbo visit, and reloads after the agent writes', async ({ app, window }) => {
  const dir = await copyEmbeddedApp('embedded-rails');
  try {
    const embedded = await attachEmbedded(app, window, dir, url);
    await expect(embedded.getByText('Rails 8.1.4.1')).toBeVisible();
    await expect(embedded.getByText('Map elements to templates')).toBeVisible();
    await startEmbedded(embedded);

    // A partial rendered twice: the template and its line, and both renderings as one partial.
    await clickInPage(embedded, '.card:nth-child(2) .card__name');
    await expect(embedded.getByTestId('embedded-source')).toHaveText('app/views/patients/_card.html.erb:3:5');
    await expect(embedded.getByTestId('embedded-scope-one')).toHaveText('This _card');
    await expect(embedded.getByTestId('embedded-scope-all')).toHaveText('Every _card · 2');

    // A ViewComponent's template.
    await clickInPage(embedded, '.confirm__text');
    await expect(embedded.getByTestId('embedded-source')).toHaveText('app/components/confirm_dialog_component.html.erb:2:3');

    // A Turbo visit swaps the body without a load: the selection goes, and the new page maps too.
    await embedded.getByTestId('embedded-edit-toggle').click();
    await clickInPage(embedded, '.shell__link');
    await expect.poll(() => inPage(embedded, `document.querySelector('.other__title') !== null`)).toBe(true);
    await expect(embedded.getByTestId('embedded-source')).toHaveCount(0);
    await embedded.getByTestId('embedded-edit-toggle').click();
    await clickInPage(embedded, '.other__title');
    await expect(embedded.getByTestId('embedded-source')).toHaveText('app/views/pages/other.html.erb:2:3');

    // An edit goes to the agent; once it has written the template, the page reloads.
    await embedded.getByTestId('embedded-edit-toggle').click();
    await clickInPage(embedded, '.shell__link');
    await expect.poll(() => inPage(embedded, `document.querySelector('.card__name') !== null`)).toBe(true);
    await embedded.getByTestId('embedded-edit-toggle').click();
    await inPage(embedded, 'window.__beforeReload = true');
    await clickInPage(embedded, '.card__name');
    await commitInput(panelInputByPrefix(embedded, 'Spacing', 'Padding'), '12');
    await expect.poll(() => fs.readFile(path.join(dir, 'app/views/patients/_card.html.erb'), 'utf-8'), { timeout: 30_000 }).toContain('padding: 12px');
    await expect.poll(() => inPage(embedded, 'window.__beforeReload === undefined'), { timeout: 15_000 }).toBe(true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
