import { describe, it, expect } from 'vitest';

import { readBodyCapped } from '../src/main/ipc/readCapped';

/**
 * Image downloads from an imported page, read up to a cap. The page picks
 * the image, so a body with no end used to be buffered whole before the
 * size check ran. see docs/audits/2026-10-20-repo-audit.md, finding 9
 */

/** A body of `chunks` chunks of `size` bytes, counting how many were pulled. */
const streamed = (chunks: number, size: number, headers: Record<string, string> = {}): { response: Response; pulled: () => number } => {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks) {
        controller.close();
        return;
      }
      pulled += 1;
      controller.enqueue(new Uint8Array(size));
    },
  });
  return { response: new Response(body, { headers }), pulled: () => pulled };
};

describe('readBodyCapped', () => {
  it('reads a body under the cap whole', async () => {
    const { response } = streamed(3, 10);
    expect((await readBodyCapped(response, 100))?.byteLength).toBe(30);
  });

  it('stops reading as soon as the body passes the cap', async () => {
    const { response, pulled } = streamed(1_000_000, 1024);
    expect(await readBodyCapped(response, 10 * 1024)).toBeNull();
    // It pulled just past the cap, not the whole gigabyte.
    expect(pulled()).toBeLessThan(20);
  });

  it('refuses a declared length over the cap before reading anything', async () => {
    const { response, pulled } = streamed(5, 10, { 'content-length': '999999' });
    expect(await readBodyCapped(response, 100)).toBeNull();
    expect(pulled()).toBe(0);
  });

  it('reads an empty body as no bytes', async () => {
    expect((await readBodyCapped(new Response(null), 100))?.byteLength).toBe(0);
  });
});
