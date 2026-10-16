/**
 * The image URL a drag from a web browser carries, when it carries no
 * file: the first http(s) or `data:image` URL in its `text/uri-list`,
 * else the first `<img src>` in its `text/html`. Null when neither has
 * one. see docs/plans/image-drop-plan.md
 */
export type DropText = { uriList: string; html: string };

const usable = (raw: string): string | null => {
  const url = raw.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\//i.test(url)) return url;
  return null;
};

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

const decodeEntities = (value: string): string =>
  value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export const imageUrlFromDrop = ({ uriList, html }: DropText): string | null => {
  // RFC 2483: one URI per line; `#` lines are comments.
  for (const line of uriList.split(/\r?\n/)) {
    if (line.startsWith('#')) continue;
    const url = usable(line);
    if (url !== null) return url;
  }
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const src = match[1] ?? match[2] ?? match[3] ?? '';
    const url = usable(decodeEntities(src));
    if (url !== null) return url;
  }
  return null;
};
