/**
 * A response body read up to `max` bytes, or null past it. Stops the
 * download as soon as it's over, rather than buffering a body of any size
 * first and checking after: an imported page decides how big its images
 * are. A declared `content-length` over the cap is refused before reading.
 */
export const readBodyCapped = async (response, max) => {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > max) {
        await response.body?.cancel().catch(() => undefined);
        return null;
    }
    if (response.body === null)
        return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > max) {
            await reader.cancel().catch(() => undefined);
            return null;
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
};
