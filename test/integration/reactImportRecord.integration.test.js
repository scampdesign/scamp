import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { elementIdFrom, mergeRecord, readRecord, sourceFor } from '../../src/main/reactImport/record';
/**
 * `.scamp/react-import.json`, and the agent's read of the app's source
 * through it, on a real disk.
 * see docs/plans/react-import-plan.md, Phase 6
 */
describe('react import record', () => {
    let project;
    let app;
    beforeEach(async () => {
        project = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-record-'));
        app = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-app-'));
        await fs.mkdir(path.join(app, 'src'), { recursive: true });
        const lines = Array.from({ length: 60 }, (_, i) => `// line ${i + 1}`);
        lines[29] = '      {claims.map((claim) => <ClaimRow key={claim.id} {...claim} />)}';
        await fs.writeFile(path.join(app, 'src', 'Claims.tsx'), lines.join('\n'));
        await fs.writeFile(path.join(os.tmpdir(), 'scamp-outside-secret.tsx'), 'secret');
    });
    afterEach(async () => {
        await fs.rm(project, { recursive: true, force: true });
        await fs.rm(app, { recursive: true, force: true });
    });
    const record = () => mergeRecord(project, {
        appName: 'riq',
        folder: app,
        views: { Claims: { route: '/billing', sites: { '00a1': '/src/Claims.tsx:30:30', '00a2': '/../../scamp-outside-secret.tsx:1:1' } } },
        components: {},
    });
    it('writes and reads back what each element came from', async () => {
        await record();
        expect(await readRecord(project)).toMatchObject({
            app: { name: 'riq', folder: app },
            views: { Claims: { route: '/billing', sites: { '00a1': '/src/Claims.tsx:30:30' } } },
        });
    });
    it('keeps the app’s folder when a later import doesn’t know it', async () => {
        await record();
        await mergeRecord(project, { appName: 'riq', folder: null, views: { Home: { sites: {} } }, components: {} });
        const again = await readRecord(project);
        expect(again?.app.folder).toBe(app);
        expect(Object.keys(again?.views ?? {})).toEqual(['Claims', 'Home']);
    });
    it('reads the JSX around an element, with its line marked', async () => {
        const answer = await sourceFor(await record(), 'Claims', 'claim_row_00a1');
        expect(answer.ok).toBe(true);
        if (!answer.ok)
            return;
        expect(answer.text).toContain('/src/Claims.tsx, line 30');
        expect(answer.text).toContain('30 > ');
        expect(answer.text).toContain('claims.map((claim)');
    });
    it('lists the source files a view came from', async () => {
        const answer = await sourceFor(await record(), 'Claims', undefined);
        expect(answer).toMatchObject({ ok: true });
        if (answer.ok)
            expect(answer.text).toContain('/src/Claims.tsx: 1 elements');
    });
    it('never reads a file outside the app’s folder', async () => {
        const answer = await sourceFor(await record(), 'Claims', '00a2');
        expect(answer.ok).toBe(false);
        if (!answer.ok)
            expect(answer.error).toContain("isn't a file in the app");
    });
    it('says why it can’t answer', async () => {
        expect(await sourceFor(null, 'Claims', undefined)).toMatchObject({ ok: false });
        const rec = await record();
        expect(await sourceFor(rec, 'Nope', undefined)).toMatchObject({ ok: false });
        expect(await sourceFor(rec, 'Claims', 'x_ffff')).toMatchObject({ ok: false });
        expect(await sourceFor({ ...rec, app: { name: 'riq', folder: null } }, 'Claims', '00a1')).toMatchObject({ ok: false });
    });
});
describe('elementIdFrom', () => {
    it('takes the id from a class name, or the id as given', () => {
        expect(elementIdFrom('dp_nav_item_0010')).toBe('0010');
        expect(elementIdFrom('0010')).toBe('0010');
    });
});
