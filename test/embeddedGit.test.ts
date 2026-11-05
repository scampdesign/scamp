import { describe, expect, it } from 'vitest';

import { parseStatus, repoRelative, sessionBranchName } from '../src/main/embedded/git';

describe('parseStatus', () => {
  it('reads the branch, ahead and behind, and each changed file', () => {
    const parsed = parseStatus(
      '## scamp/x...origin/scamp/x [ahead 2, behind 1]\n M src/App.tsx\n?? src/New.css\nD  old.css\nA  added.ts\nR  a.ts -> b.ts\n'
    );
    expect(parsed).toEqual({
      branch: 'scamp/x',
      ahead: 2,
      behind: 1,
      changed: [
        { path: 'src/App.tsx', status: 'M' },
        { path: 'src/New.css', status: '?' },
        { path: 'old.css', status: 'D' },
        { path: 'added.ts', status: 'A' },
        { path: 'b.ts', status: 'M' },
      ],
    });
  });

  it('reads a branch with no upstream, and a repo with no commits yet', () => {
    expect(parseStatus('## main\n').branch).toBe('main');
    expect(parseStatus('## No commits yet on main\n').branch).toBe('main');
  });

  it('unquotes a path git quoted', () => {
    expect(parseStatus('## main\n M "src/with space.css"\n').changed[0]?.path).toBe('src/with space.css');
  });

  it('is empty for empty output', () => {
    expect(parseStatus('')).toEqual({ branch: '', ahead: 0, behind: 0, changed: [] });
  });
});

describe('sessionBranchName', () => {
  const now = new Date(2026, 10, 3, 9, 5);

  it('names the branch by date and time', () => {
    expect(sessionBranchName(now, [])).toBe('scamp/2026-11-03-0905');
  });

  it('steps past a name already taken', () => {
    expect(sessionBranchName(now, ['scamp/2026-11-03-0905', 'scamp/2026-11-03-0905-2'])).toBe('scamp/2026-11-03-0905-3');
  });
});

describe('repoRelative', () => {
  it('keeps a path inside the repo, relative and with forward slashes', () => {
    expect(repoRelative('/p/app', 'src/App.tsx')).toBe('src/App.tsx');
    expect(repoRelative('/p/app', '/p/app/src/App.tsx')).toBe('src/App.tsx');
  });

  it('refuses a path that escapes, and the repo root itself', () => {
    expect(repoRelative('/p/app', '../other/file')).toBeNull();
    expect(repoRelative('/p/app', '/etc/passwd')).toBeNull();
    expect(repoRelative('/p/app', '.')).toBeNull();
  });
});
