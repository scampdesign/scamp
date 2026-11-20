// A stand-in for Turbo Drive: a link click fetches the page, swaps in its <body>, and fires turbo:load.
document.addEventListener('click', async (e) => {
  const link = e.target instanceof Element ? e.target.closest('a[href^="/"]') : null;
  if (link === null) return;
  e.preventDefault();
  const html = await (await fetch(link.getAttribute('href'))).text();
  const next = new DOMParser().parseFromString(html, 'text/html');
  history.pushState({}, '', link.getAttribute('href'));
  document.body.replaceWith(document.adoptNode(next.body));
  document.dispatchEvent(new Event('turbo:load'));
});
