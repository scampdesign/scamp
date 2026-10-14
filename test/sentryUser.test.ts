import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The install id must reach Sentry's SCOPE (so sessions can be resolved into
 * unique users) but never a crash report.
 *
 * That separation is the whole privacy story of DAU tracking: we learn how
 * many people are active without making any error report identifiable.
 * see docs/archive/2026-08-11-dau-tracking-plan.md
 */

const setUser = vi.fn();
const init = vi.fn();

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test', isPackaged: false },
}));

vi.mock('@sentry/electron/main', () => ({
  init: (...args: unknown[]) => init(...args),
  setUser: (...args: unknown[]) => setUser(...args),
  getClient: () => ({ getOptions: () => ({ enabled: true }) }),
  close: vi.fn().mockResolvedValue(undefined),
}));

const ID = 'f81d4fae-7dec-41d0-9765-00a0c91e6bf6';

/** Fresh module state per test — `isInitialised` is module-scoped. */
const loadSentry = async (): Promise<typeof import('../src/main/sentry')> => {
  vi.resetModules();
  init.mockClear();
  setUser.mockClear();
  process.env['SENTRY_DSN'] = 'https://examplePublicKey@o0.ingest.sentry.io/0';
  return import('../src/main/sentry');
};

/** The `beforeSend` hook the SDK was configured with. */
const capturedBeforeSend = (): ((e: Record<string, unknown>) => unknown) => {
  const options = init.mock.calls[0]?.[0] as {
    beforeSend: (e: Record<string, unknown>) => unknown;
  };
  return options.beforeSend;
};

describe('install id on the Sentry scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the id when the user opted in', async () => {
    const sentry = await loadSentry();
    sentry.initSentryIfOptedIn(true, ID);
    expect(setUser).toHaveBeenCalledWith({ id: ID });
  });

  it('sets ONLY the id — never a name, email, or IP', async () => {
    // Those fields are what would turn a counter into an identity.
    const sentry = await loadSentry();
    sentry.initSentryIfOptedIn(true, ID);
    const arg = setUser.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(arg)).toEqual(['id']);
  });

  it('clears the user when the user has not opted in', async () => {
    const sentry = await loadSentry();
    sentry.initSentryIfOptedIn(false, ID);
    expect(setUser).toHaveBeenCalledWith(null);
  });

  it('clears the user when the toggle is switched off mid-session', async () => {
    const sentry = await loadSentry();
    sentry.initSentryIfOptedIn(true, ID);
    setUser.mockClear();
    sentry.setSentryEnabled(false);
    expect(setUser).toHaveBeenCalledWith(null);
  });

  it('re-sets the id when the toggle is switched back on', async () => {
    const sentry = await loadSentry();
    sentry.initSentryIfOptedIn(false, null);
    setUser.mockClear();
    sentry.setSentryEnabled(true, ID);
    expect(setUser).toHaveBeenCalledWith({ id: ID });
  });
});

describe('beforeSend keeps crash reports anonymous', () => {
  it('deletes event.user even though the id is set on the scope', async () => {
    // The guarantee: the id rides on session envelopes only. If this ever
    // fails, every crash report becomes linkable to an install.
    const sentry = await loadSentry();
    sentry.initSentryIfOptedIn(true, ID);

    const scrubbed = capturedBeforeSend()({
      user: { id: ID },
      server_name: 'someones-laptop',
      request: { url: 'file:///home/alice/thing' },
    }) as Record<string, unknown>;

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.request).toBeUndefined();
  });

  it('still scrubs paths with the id present', async () => {
    const sentry = await loadSentry();
    sentry.initSentryIfOptedIn(true, ID);

    const scrubbed = capturedBeforeSend()({
      exception: {
        values: [
          {
            value: 'ENOENT: /home/alice/projects/secret/page.tsx',
            stacktrace: {
              frames: [
                { filename: '/home/alice/app.js', abs_path: '/home/alice/app.js' },
              ],
            },
          },
        ],
      },
    }) as {
      exception: {
        values: Array<{
          value: string;
          stacktrace: { frames: Array<{ filename: string; abs_path?: string }> };
        }>;
      };
    };

    const ex = scrubbed.exception.values[0];
    expect(ex?.value).toContain('/home/[redacted]');
    expect(ex?.value).not.toContain('alice');
    expect(ex?.stacktrace.frames[0]?.abs_path).toBeUndefined();
  });
});
