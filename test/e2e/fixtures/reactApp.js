import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const REPO = path.resolve(__dirname, '../../..');
/**
 * `test/fixtures/react-app`, copied to a temp folder with Scamp's own
 * node_modules linked in, so the React import can run it without
 * installing anything. The caller removes the folder.
 * see docs/plans/react-import-plan.md
 */
export const copyFixtureApp = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-react-app-'));
    await fs.cp(path.join(REPO, 'test/fixtures/react-app'), dir, { recursive: true });
    await fs.symlink(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    return dir;
};
