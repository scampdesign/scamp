import { describe, it, expect } from 'vitest';

import { shareAgentHistory } from '../src/main/ipc/projectScaffold';

/**
 * New projects keep the Scamp Agent's conversations in version control,
 * so a team sharing a repo shares them, while the rest of `.scamp`
 * (snapshots, thumbnails, the context file) stays local.
 */

describe('shareAgentHistory', () => {
  it('turns an ignored .scamp folder into everything but agent-history', () => {
    expect(shareAgentHistory('node_modules\n.scamp\n.dev.vars\n')).toBe(
      'node_modules\n.scamp/*\n!.scamp/agent-history/\n.dev.vars\n'
    );
  });

  it('reads the trailing-slash and rooted spellings too', () => {
    expect(shareAgentHistory('.scamp/\n')).toBe('.scamp/*\n!.scamp/agent-history/\n');
    expect(shareAgentHistory('/.scamp\n')).toBe('.scamp/*\n!.scamp/agent-history/\n');
  });

  it('leaves a file that doesn’t ignore .scamp, or ignores only part of it, alone', () => {
    expect(shareAgentHistory('node_modules\n')).toBe('node_modules\n');
    expect(shareAgentHistory('.scamp/snapshots\n')).toBe('.scamp/snapshots\n');
  });
});
