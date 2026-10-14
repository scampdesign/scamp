import { describe, it, expect } from 'vitest';

import { newerUsableVersion } from '../src/main/ipc/frameworkVersion';

const packument = (contracts: Record<string, unknown>): unknown => ({
  versions: Object.fromEntries(
    Object.entries(contracts).map(([version, contract]) => [version, { version, scampjs: { contract } }])
  ),
});

describe('newerUsableVersion', () => {
  it('picks the newest release, comparing numbers rather than strings', () => {
    expect(newerUsableVersion(packument({ '0.3.1': 2, '0.10.0': 2, '0.9.0': 2 }), '0.3.1')).toBe('0.10.0');
  });

  it('skips releases on a contract this build can’t read, and prereleases', () => {
    expect(newerUsableVersion(packument({ '0.3.2': 2, '0.4.0': 99, '0.5.0-beta.1': 2 }), '0.3.1')).toBe('0.3.2');
  });

  it('offers nothing when the installed version is already the newest, or newer', () => {
    expect(newerUsableVersion(packument({ '0.3.0': 2, '0.3.1': 2 }), '0.3.1')).toBeNull();
    expect(newerUsableVersion(packument({ '0.3.1': 2 }), '0.4.0')).toBeNull();
  });

  it('offers nothing for an installed version that isn’t a release, or a malformed packument', () => {
    expect(newerUsableVersion(packument({ '0.4.0': 2 }), '0.4.0-dev')).toBeNull();
    expect(newerUsableVersion(null, '0.3.1')).toBeNull();
    expect(newerUsableVersion({ versions: 'nope' }, '0.3.1')).toBeNull();
    expect(newerUsableVersion({ versions: { '0.4.0': null } }, '0.3.1')).toBeNull();
  });
});
