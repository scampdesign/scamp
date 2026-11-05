import { describe, expect, it } from 'vitest';

import { nextRoutes } from '../src/main/embedded/routes';

describe('nextRoutes', () => {
  it('reads App Router pages, with route groups left out of the path', () => {
    expect(
      nextRoutes(['app/page.tsx', 'app/about/page.tsx', 'app/(marketing)/pricing/page.jsx', 'src/app/blog/[slug]/page.tsx', 'app/docs/[[...slug]]/page.mdx'])
    ).toEqual(['/', '/about', '/blog/[slug]', '/docs/[[...slug]]', '/pricing']);
  });

  it('skips layouts, API routes, parallel slots, intercepting routes and private folders', () => {
    expect(
      nextRoutes(['app/layout.tsx', 'app/api/users/route.ts', 'app/@modal/login/page.tsx', 'app/feed/(..)photo/[id]/page.tsx', 'app/_components/page.tsx', 'app/feed/page.tsx'])
    ).toEqual(['/feed']);
  });

  it('reads Pages Router files, with index as the folder and no _app, _document or api', () => {
    expect(
      nextRoutes(['pages/index.tsx', 'pages/about.jsx', 'src/pages/blog/[slug].tsx', 'pages/blog/index.tsx', 'pages/_app.tsx', 'pages/_document.tsx', 'pages/api/hello.ts', 'pages/styles.css'])
    ).toEqual(['/', '/about', '/blog', '/blog/[slug]']);
  });

  it('accepts Windows separators and returns nothing for a project without pages', () => {
    expect(nextRoutes(['app\\settings\\page.tsx'])).toEqual(['/settings']);
    expect(nextRoutes(['src/index.ts', 'README.md'])).toEqual([]);
  });
});
