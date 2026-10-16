const usable = (raw) => {
    const url = raw.trim();
    if (/^https?:\/\//i.test(url))
        return url;
    if (/^data:image\//i.test(url))
        return url;
    return null;
};
const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const decodeEntities = (value) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export const imageUrlFromDrop = ({ uriList, html }) => {
    // RFC 2483: one URI per line; `#` lines are comments.
    for (const line of uriList.split(/\r?\n/)) {
        if (line.startsWith('#'))
            continue;
        const url = usable(line);
        if (url !== null)
            return url;
    }
    for (const match of html.matchAll(IMG_SRC_RE)) {
        const src = match[1] ?? match[2] ?? match[3] ?? '';
        const url = usable(decodeEntities(src));
        if (url !== null)
            return url;
    }
    return null;
};
