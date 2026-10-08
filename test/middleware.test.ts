import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/_middleware';

type AssetMap = Record<string, { body: string; type?: string; status?: number }>;

function makeContext(path: string, accept: string | null, assets: AssetMap) {
  const url = new URL(path, 'https://piss-poker.pages.dev');
  const headers = new Headers();
  if (accept !== null) headers.set('Accept', accept);

  const ASSETS = {
    fetch: async (input: RequestInfo | URL) => {
      const target = typeof input === 'string' || input instanceof URL ? new URL(input.toString(), url) : new URL(input.url);
      const key = target.pathname;
      const hit = assets[key];
      if (!hit) return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      return new Response(hit.body, {
        status: hit.status ?? 200,
        headers: { 'Content-Type': hit.type ?? 'text/markdown; charset=utf-8' },
      });
    },
  };

  const next = async () => {
    if (assets[url.pathname]?.type?.includes('html') || assets[`${url.pathname.replace(/\/$/, '')}/index.html`]) {
      const page = assets[url.pathname] ?? assets[`${url.pathname.replace(/\/$/, '')}/index.html`]!;
      return new Response(page.body, { status: page.status ?? 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname === '/' && assets['/']) {
      return new Response(assets['/'].body, {
        status: assets['/'].status ?? 200,
        headers: { 'Content-Type': assets['/'].type ?? 'text/html; charset=utf-8' },
      });
    }
    const missing = assets['/404.html'];
    return new Response(missing?.body ?? '404', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };

  return {
    request: new Request(url, { headers, method: 'GET' }),
    next,
    env: { ASSETS },
    params: {},
    data: {},
    functionPath: '',
    waitUntil() {},
    passThroughOnException() {},
  } as Parameters<typeof onRequest>[0];
}

const site: AssetMap = {
  '/': { body: '<html><body>home</body></html>', type: 'text/html; charset=utf-8' },
  '/index.md': { body: '# Piss Poker tracker\n\nChips on your phone.' },
  '/about/index.md': { body: '# About\n\nAbout the tracker with enough detail for agents to trust the page contents here.' },
  '/about/': { body: '<html><body>about</body></html>', type: 'text/html; charset=utf-8' },
  '/404.md': { body: '# Page not found\n\nMissing path. See /llms.txt and /sitemap.xml for recovery.' },
  '/404.html': { body: '<html><body>not found</body></html>', type: 'text/html; charset=utf-8' },
};

describe('Pages middleware negotiation', () => {
  it('serves homepage markdown for Accept: text/markdown with Vary: Accept', async () => {
    const res = await onRequest(makeContext('/', 'text/markdown', site));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/);
    expect(res.headers.get('Vary')?.toLowerCase()).toContain('accept');
    expect(await res.text()).toMatch(/Piss Poker tracker/);
  });

  it('keeps homepage HTML for Accept: text/html and advertises the markdown alternate', async () => {
    const res = await onRequest(makeContext('/', 'text/html', site));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(res.headers.get('Vary')?.toLowerCase()).toContain('accept');
    expect(res.headers.get('Link')).toMatch(/rel="alternate"; type="text\/markdown"/);
    expect(res.headers.get('Link')).toMatch(/llms\.txt/);
  });

  it('returns a real markdown 404 for unknown paths', async () => {
    const res = await onRequest(makeContext('/does-not-exist', 'text/markdown', site));
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/);
    const body = await res.text();
    expect(body.length).toBeGreaterThanOrEqual(20);
    expect(body).toMatch(/llms\.txt/);
  });

  it('rewrites live table codes to the SPA shell', async () => {
    const res = await onRequest(makeContext('/t/ABCD', 'text/html', site));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/home/);
  });

  it('returns 406 when every produced type is rejected', async () => {
    const res = await onRequest(makeContext('/', 'text/html;q=0, text/markdown;q=0', site));
    expect(res.status).toBe(406);
  });
});
