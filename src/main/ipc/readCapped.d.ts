/**
 * A response body read up to `max` bytes, or null past it. Stops the
 * download as soon as it's over, rather than buffering a body of any size
 * first and checking after: an imported page decides how big its images
 * are. A declared `content-length` over the cap is refused before reading.
 */
export declare const readBodyCapped: (response: Response, max: number) => Promise<Buffer | null>;
