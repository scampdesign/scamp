/**
 * The image URL a drag from a web browser carries, when it carries no
 * file: the first http(s) or `data:image` URL in its `text/uri-list`,
 * else the first `<img src>` in its `text/html`. Null when neither has
 * one. see docs/plans/image-drop-plan.md
 */
export type DropText = {
    uriList: string;
    html: string;
};
export declare const imageUrlFromDrop: ({ uriList, html }: DropText) => string | null;
